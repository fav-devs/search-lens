"""Embed every catalogue picture with EmbeddingGemma 2 and write the index the phone searches.

The phone gets:
  manifest.json  model settings, the pictures (row i of the vectors is picture i) and the products that use them
  vectors.bin    count × dims int8 rows, then count float32 scales (row i ≈ int8 row × scale i, unit length)
  details/NN.json  each product's description, good-to-know notes, materials, care and category path, split by
                 int(product id) % DETAIL_SHARDS so the phone only parses the file a product page needs

int8 with a scale per row keeps 28,000 pictures at 512 dimensions to ~14 MB, and the phone can score them straight
from the file without decoding anything.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from rich.console import Console
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn, TimeRemainingColumn
from rich.table import Table

from . import catalog

MODEL_ID = "google/embeddinggemma-2"
# Phones run the model at 70 or 140 vision tokens per image, never the 280 the PC processor defaults to. The index has
# to use the same budget the phone uses for its photos: the same picture at 280 and at 140 tokens only agrees to ~0.97.
VISION_TOKENS = 140
QUERY_PREFIX = "task: search result | query: "
DIMS = (128, 256, 512, 768)
CHUNK = 512
FORMAT = "product-lens-index"
DETAIL_SHARDS = 64


def pick_device(cpu: bool, console: Console):
    import torch

    if not cpu and torch.cuda.is_available():
        gpu = torch.cuda.get_device_properties(0)
        # bf16 where the GPU has it (RTX 30 and newer); fp16 is never used, it gives NaN or quietly worse vectors.
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float32
        console.print(f"GPU: [bold]{gpu.name}[/] · {gpu.total_memory / 1e9:.0f} GB · {str(dtype).removeprefix('torch.')}")
        return "cuda", dtype
    if not cpu and shutil.which("nvidia-smi"):
        console.print(
            "[yellow]There is an NVIDIA GPU, but this PyTorch can't use it (a CPU-only build). "
            "See “GPU” in the README.[/]"
        )
    console.print("[yellow]Running on the CPU: about 1–2 s per picture.[/]")
    return "cpu", torch.float32


def load_model(device: str, dtype):
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(
        MODEL_ID,
        device=device,
        model_kwargs={"torch_dtype": dtype},
        # Pictures and text only; the audio encoder would take 300M parameters of memory for nothing.
        config_kwargs={"audio_config": None},
    )
    model[0].processor.image_processor.max_soft_tokens = VISION_TOKENS
    return model


def _open(paths: list[Path]) -> list[Image.Image]:
    return [Image.open(p).convert("RGB") for p in paths]


def _embed(model, images: list[Image.Image], batch: int, done=lambda n: None) -> np.ndarray:
    import torch

    out = []
    i = 0
    while i < len(images):
        try:
            vectors = model.encode_document(
                [{"image": im} for im in images[i : i + batch]],
                batch_size=batch,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        except torch.cuda.OutOfMemoryError:
            if batch == 1:
                raise
            torch.cuda.empty_cache()
            batch = max(1, batch // 2)
            continue
        out.append(np.asarray(vectors, dtype=np.float32))
        done(len(out[-1]))
        i += batch
    vectors = np.concatenate(out)
    if not np.isfinite(vectors).all():
        raise RuntimeError("The model returned NaN; it must run in bf16 or fp32.")
    return vectors


def build(data: Path, dims: int, batch: int, cpu: bool, console: Console) -> Path:
    products = catalog.load(data)
    pictures = sorted({p.picture: p.source for p in products}.items())
    keys = [k for k, _ in pictures]
    images = data / "images"

    # Full 768-number vectors are kept in chunks, so a stopped run picks up where it was and changing --dims later
    # needs no re-embedding. The folder name changes if the pictures, model or vision budget do.
    signature = hashlib.sha1(f"{MODEL_ID}|{VISION_TOKENS}|{'|'.join(keys)}".encode()).hexdigest()[:12]
    work = data / "embeddings" / signature
    work.mkdir(parents=True, exist_ok=True)
    chunks = [(n, keys[s : s + CHUNK]) for n, s in enumerate(range(0, len(keys), CHUNK))]
    todo = [(n, chunk) for n, chunk in chunks if not (work / f"{n:05d}.npy").exists()]

    console.print(f"{len(keys):,} pictures · {len(keys) - sum(len(c) for _, c in todo):,} already embedded")
    if todo:
        device, dtype = pick_device(cpu, console)
        with console.status(f"Loading {MODEL_ID}…"):
            model = load_model(device, dtype)
        columns = (TextColumn("Embedding"), BarColumn(), MofNCompleteColumn(), TimeRemainingColumn())
        paths = lambda chunk: [images / f"{k}.jpg" for k in chunk]  # noqa: E731
        with Progress(*columns, console=console) as progress, ThreadPoolExecutor(1) as reader:
            task = progress.add_task("embed", total=sum(len(c) for _, c in todo))
            # Decode the next chunk's JPEGs while the GPU works on this one.
            pending = reader.submit(_open, paths(todo[0][1]))
            for step, (n, _) in enumerate(todo):
                loaded = pending.result()
                if step + 1 < len(todo):
                    pending = reader.submit(_open, paths(todo[step + 1][1]))
                vectors = _embed(model, loaded, batch, lambda count: progress.advance(task, count))
                np.save(work / f"{n:05d}.npy", vectors)

    vectors = np.concatenate([np.load(work / f"{n:05d}.npy") for n, _ in chunks])
    return write(data, products, pictures, vectors, dims, console)


def write(data: Path, products, pictures, vectors: np.ndarray, dims: int, console: Console) -> Path:
    # Matryoshka: the first `dims` numbers are a smaller version of the vector, once made unit length again.
    vectors = vectors[:, :dims]
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    scales = np.abs(vectors).max(axis=1) / 127
    quantized = np.round(vectors / scales[:, None]).astype(np.int8)

    out = data / "index"
    out.mkdir(exist_ok=True)
    with open(out / "vectors.bin", "wb") as f:
        f.write(quantized.tobytes())
        f.write(scales.astype("<f4").tobytes())

    details = out / "details"
    shutil.rmtree(details, ignore_errors=True)
    details.mkdir()
    shards: list[dict] = [{} for _ in range(DETAIL_SHARDS)]
    for p in products:
        shards[int(p.id) % DETAIL_SHARDS][p.id] = {
            "description": p.description,
            "goodToKnow": p.good_to_know,
            "materials": p.materials,
            "care": p.care,
            "path": p.path,
        }
    for n, shard in enumerate(shards):
        (details / f"{n:02d}.json").write_text(json.dumps(shard, ensure_ascii=False), encoding="utf-8")

    row = {key: i for i, (key, _) in enumerate(pictures)}
    size = json.loads((data / "catalog.json").read_text(encoding="utf-8"))["size"]
    manifest = {
        "format": FORMAT,
        "version": 2,
        "model": MODEL_ID,
        "visionTokens": VISION_TOKENS,
        "queryPrefix": QUERY_PREFIX,
        "dims": dims,
        "count": len(pictures),
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "imageBase": catalog.IMAGE_BASE,
        "imageSize": size,
        "details": {"shards": DETAIL_SHARDS},
        "pictures": [source for _, source in pictures],
        "products": [
            {"id": p.id, "title": p.title, "price": p.price, "url": p.url, "category": p.category, "picture": row[p.picture]}
            for p in products
        ],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    megabytes = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1e6
    console.print(f"[green]Index ready[/]: {out} · {len(pictures):,} pictures × {dims} · {megabytes:.1f} MB for the phone")
    return out


def read(data: Path) -> tuple[dict, np.ndarray]:
    out = data / "index"
    if not (out / "manifest.json").exists():
        raise SystemExit(f"No index in {out}. Run `lens index` first.")
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    raw = (out / "vectors.bin").read_bytes()
    count, dims = manifest["count"], manifest["dims"]
    quantized = np.frombuffer(raw, dtype=np.int8, count=count * dims).reshape(count, dims)
    scales = np.frombuffer(raw, dtype="<f4", count=count, offset=count * dims)
    return manifest, quantized.astype(np.float32) * scales[:, None]


def search(data: Path, query: str, top: int, cpu: bool, console: Console) -> None:
    """Try the index on the PC: a photo's path or a description."""
    manifest, vectors = read(data)
    device, dtype = pick_device(cpu, console)
    with console.status(f"Loading {MODEL_ID}…"):
        model = load_model(device, dtype)
    path = Path(query)
    if path.is_file():
        q = _embed(model, _open([path]), 1)[0]
    else:
        # The prefix is written out rather than left to the model's prompt table, exactly as the phone sends it.
        q = model.encode([QUERY_PREFIX + query], normalize_embeddings=True, convert_to_numpy=True)[0]
    q = q[: manifest["dims"]]
    q = q / np.linalg.norm(q)
    scores = vectors @ q

    by_picture: dict[int, list[dict]] = {}
    for p in manifest["products"]:
        by_picture.setdefault(p["picture"], []).append(p)
    table = Table("Score", "Product", "Price", "Article", "Link")
    for i in np.argsort(-scores)[:top]:
        for p in by_picture.get(int(i), []):
            table.add_row(f"{scores[i]:.3f}", p["title"], f"${p['price']:g}", p["id"], p["url"])
    console.print(table)
