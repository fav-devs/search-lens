"""The product catalogue: facts from the IKEA US dataset on Hugging Face, one small product shot per picture from IKEA.

The dataset (jeffreyszhou/ikea-us-products-2025, ~30,500 products, July 2025) comes with a 3.5 GB tar of full-size
images. We only need the file names: IKEA's image server serves the same product shot at the size we ask for, and
400 px is already more than the model looks at.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path

from rich.console import Console
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn, TimeRemainingColumn

DATASET_URL = "https://huggingface.co/datasets/jeffreyszhou/ikea-us-products-2025/resolve/main/products-us.jsonl"
IMAGE_BASE = "https://www.ikea.com/us/en/images/products/"
SIZES = {"xxs": 400, "xs": 500, "s": 600, "m": 700}
USER_AGENT = "product-lens catalogue builder"


@dataclass
class Product:
    id: str
    title: str
    price: float
    url: str
    category: str
    # The pe/ph number that names the picture ("pe933703"). Product pages often share one (a bed frame in Queen and
    # King, the same sofa under different slugs), so pictures are fetched, embedded and stored once each.
    picture: str
    # The picture's file name on IKEA's image server.
    source: str


def mixed_numbers(title: str) -> str:
    """The scrape lost the space in IKEA's mixed numbers: 18½ x 16⅛" arrives as `181/2x161/8"`.

    A fraction can't be bigger than one in a size, so split off the shortest odd numerator that makes it proper;
    a proper fraction stays as it is.
    """

    def fix(match: re.Match[str]) -> str:
        top, bottom = match.group(1), int(match.group(2))
        if int(top) < bottom:
            return match.group(0)
        for digits in (1, 2):
            whole, part = top[:-digits], int(top[-digits:])
            if whole and part % 2 == 1 and part < bottom:
                return f"{whole} {part}/{bottom}"
        return match.group(0)

    return re.sub(r"(?<!\d)(\d+)/(2|4|8|16)(?!\d)", fix, title)


def read_products(list_path: Path, categories: list[str], limit: int | None) -> list[Product]:
    wanted = [c.lower() for c in categories]
    products: list[Product] = []
    for line in list_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        path = (row.get("category_tree") or [])[1:]
        if wanted and not any(w in crumb.lower() for w in wanted for crumb in path):
            continue
        # "images-us/<slug>__1286742_pe933703_s5.jpg"
        source = ((row.get("image_urls") or [None])[0] or "").removeprefix("images-us/")
        key = re.search(r"__\d+_(p[a-z]\d+)_", source)
        if not key:
            continue
        products.append(
            Product(
                id=row["product_id"],
                title=mixed_numbers(re.sub(r"\s*-\s*IKEA US$", "", row["title"])),
                price=float(row["price"]),
                url=row["source_url"],
                category=(path[-2] if len(path) > 1 else path[-1] if path else ""),
                picture=key.group(1),
                source=source,
            )
        )
        if limit and len(products) >= limit:
            break
    return products


def _fetch(url: str, target: Path) -> None:
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read()
            # Beside the final name, so a half-written file is never taken for a finished one on the next run.
            partial = target.with_suffix(target.suffix + ".part")
            partial.write_bytes(data)
            partial.replace(target)
            return
        except urllib.error.HTTPError as error:
            if error.code == 404 or attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 3:
                raise
        time.sleep(2**attempt)


def download(data: Path, categories: list[str], limit: int | None, size: str, workers: int, console: Console) -> Path:
    """Fetch the product list and every product's picture into `data`. Returns the catalogue file."""
    data.mkdir(parents=True, exist_ok=True)
    images = data / "images"
    images.mkdir(exist_ok=True)

    list_path = data / "products-us.jsonl"
    if not list_path.exists():
        with console.status("Downloading the product list (50 MB)…"):
            _fetch(DATASET_URL, list_path)

    products = read_products(list_path, categories, limit)
    pictures = {p.picture: p.source for p in products}
    todo = [(key, source) for key, source in pictures.items() if not (images / f"{key}.jpg").exists()]
    console.print(
        f"{len(products):,} products · {len(pictures):,} pictures at {SIZES[size]} px · "
        f"{len(pictures) - len(todo):,} already downloaded"
    )

    failed: dict[str, str] = {}
    if todo:
        columns = (TextColumn("Pictures"), BarColumn(), MofNCompleteColumn(), TimeRemainingColumn())
        with Progress(*columns, console=console) as progress, ThreadPoolExecutor(workers) as pool:
            task = progress.add_task("pictures", total=len(todo))
            futures = {
                pool.submit(_fetch, f"{IMAGE_BASE}{urllib.request.quote(source)}?f={size}", images / f"{key}.jpg"): key
                for key, source in todo
            }
            for future in as_completed(futures):
                if error := future.exception():
                    failed[futures[future]] = str(error)
                progress.advance(task)

    # Products whose picture never arrived are left out, so every catalogue entry has something to embed.
    kept = [p for p in products if p.picture not in failed]
    catalog = data / "catalog.json"
    catalog.write_text(json.dumps({"size": size, "products": [asdict(p) for p in kept]}), encoding="utf-8")
    (data / "failed.txt").write_text("".join(f"{k}\t{pictures[k]}\t{e}\n" for k, e in failed.items()), encoding="utf-8")
    console.print(
        f"[green]catalog.json[/]: {len(kept):,} products"
        + (f" · [yellow]{len(failed)} pictures failed (see failed.txt)[/]" if failed else "")
    )
    return catalog


def load(data: Path) -> list[Product]:
    catalog = data / "catalog.json"
    if not catalog.exists():
        raise SystemExit(f"No catalogue in {data}. Run `lens download` first.")
    return [Product(**p) for p in json.loads(catalog.read_text(encoding="utf-8"))["products"]]
