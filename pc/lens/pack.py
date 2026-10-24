"""One file holding the whole index, for building into the app (`lens bundle`).

    "SLPACK1\\n"  8 bytes
    header size   uint32, little-endian
    header        ASCII JSON: {"format", "version", "created", "entries": [{"name", "offset", "size"}]}
    data          the entries' bytes back to back; offsets count from the end of the header

The app reads the header, then copies each entry out with a file handle (app/src/bundled.ts), so it never holds the
whole 55 MB in memory.
"""

from __future__ import annotations

import json
import shutil
import struct
from pathlib import Path

from rich.console import Console

MAGIC = b"SLPACK1\n"


def write(index: Path, target: Path) -> Path:
    manifest = json.loads((index / "manifest.json").read_text(encoding="utf-8"))
    names = ["manifest.json", "vectors.bin"] + sorted(f"details/{f.name}" for f in (index / "details").glob("*.json"))
    entries, offset = [], 0
    for name in names:
        size = (index / name).stat().st_size
        entries.append({"name": name, "offset": offset, "size": size})
        offset += size
    header = json.dumps(
        {"format": manifest["format"], "version": manifest["version"], "created": manifest["created"], "entries": entries},
        ensure_ascii=True,
    ).encode("ascii")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".part")
    with open(partial, "wb") as out:
        out.write(MAGIC)
        out.write(struct.pack("<I", len(header)))
        out.write(header)
        for name in names:
            with open(index / name, "rb") as source:
                shutil.copyfileobj(source, out)
    partial.replace(target)
    return target


def bundle(data: Path, app: Path, console: Console) -> None:
    index = data / "index"
    if not (index / "manifest.json").exists():
        raise SystemExit(f"No index in {index}. Run `lens index` first.")
    if not (app / "app.json").exists():
        raise SystemExit(f"{app} isn't the app folder (no app.json). Pass it with --app.")
    target = write(index, app / "assets" / "searchlens.pack")
    console.print(
        f"[green]Bundled[/]: {target} ({target.stat().st_size / 1e6:.0f} MB). The next app build includes it, and the app "
        "installs it on first launch."
    )
