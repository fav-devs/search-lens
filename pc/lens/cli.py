"""lens: build the product index on this PC and hand it to the phone.

  lens                 download → index → serve, picking up wherever a previous run stopped
  lens download        product list + one picture per product
  lens index           embed the pictures on the GPU and write the phone's index
  lens search QUERY    try the index here: a photo's path or a description
  lens serve           share the index on Wi-Fi with a QR code for the app
  lens bundle          put the index inside the app, so a new build works without the PC
"""

from __future__ import annotations

import argparse
from pathlib import Path

from rich.console import Console

from . import catalog, index, pack, serve


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="lens", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=Path("data"), help="where everything is kept (default ./data)")
    commands = parser.add_subparsers(dest="command")

    download = commands.add_parser("download", help="product list + one picture per product")
    download.add_argument("--category", action="append", default=[], help="keep products whose category path contains this (repeatable)")
    download.add_argument("--limit", type=int, help="stop after this many products")
    download.add_argument("--size", choices=list(catalog.SIZES), default="xxs", help="picture size (default xxs, 400 px)")
    download.add_argument("--workers", type=int, default=8)

    build = commands.add_parser("index", help="embed the pictures and write the phone's index")
    build.add_argument("--dims", type=int, choices=index.DIMS, default=512, help="numbers per picture (default 512)")
    build.add_argument("--batch", type=int, default=16, help="pictures per GPU batch; halves itself if memory runs out")
    build.add_argument("--cpu", action="store_true", help="don't use the GPU")

    search = commands.add_parser("search", help="try the index: a photo's path or a description")
    search.add_argument("query")
    search.add_argument("--top", type=int, default=8)
    search.add_argument("--cpu", action="store_true")

    share = commands.add_parser("serve", help="share the index on Wi-Fi with a QR code")
    share.add_argument("--port", type=int, default=8765)

    build_in = commands.add_parser("bundle", help="put the index inside the app (app/assets/searchlens.pack)")
    build_in.add_argument("--app", type=Path, default=Path("../app"), help="the app folder (default ../app)")

    args = parser.parse_args(argv)
    console = Console()
    data: Path = args.data.resolve()

    if args.command == "download":
        catalog.download(data, args.category, args.limit, args.size, args.workers, console)
    elif args.command == "index":
        index.build(data, args.dims, args.batch, args.cpu, console)
    elif args.command == "search":
        index.search(data, args.query, args.top, args.cpu, console)
    elif args.command == "serve":
        serve.serve(data / "index", args.port, console)
    elif args.command == "bundle":
        pack.bundle(data, args.app.resolve(), console)
    else:
        console.rule("1 · Download")
        catalog.download(data, [], None, "xxs", 8, console)
        console.rule("2 · Index")
        index.build(data, 512, 16, False, console)
        console.rule("3 · Send to phone")
        serve.serve(data / "index", 8765, console)
