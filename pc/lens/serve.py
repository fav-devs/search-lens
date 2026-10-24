"""Hand the index to the phone over Wi-Fi: a small file server and a QR code the app scans."""

from __future__ import annotations

import functools
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import qrcode
from rich.console import Console
from rich.text import Text


def lan_ip() -> str:
    # Connecting a UDP socket sends nothing; it only asks the OS which interface reaches the outside.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def qr_text(data: str) -> Text:
    """The QR code as half-block characters in explicit black and white, so it scans on dark terminals too."""
    code = qrcode.QRCode(border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    code.add_data(data)
    matrix = code.get_matrix()
    if len(matrix) % 2:
        matrix.append([False] * len(matrix[0]))
    text = Text()
    for top, bottom in zip(matrix[::2], matrix[1::2]):
        for upper, lower in zip(top, bottom):
            text.append("▀", style=f"{'black' if upper else 'white'} on {'black' if lower else 'white'}")
        text.append("\n")
    return text


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, console: Console, **kwargs):
        self.console = console
        super().__init__(*args, **kwargs)

    def log_message(self, format: str, *args) -> None:
        if self.command == "GET" and args and str(args[1]).startswith("2"):
            self.console.print(f"  {self.client_address[0]} took {self.path.lstrip('/')}")


def serve(index: Path, port: int, console: Console) -> None:
    if not (index / "manifest.json").exists():
        raise SystemExit(f"No index in {index}. Run `lens index` first.")
    url = f"http://{lan_ip()}:{port}/"
    handler = functools.partial(Handler, directory=str(index), console=console)
    server = ThreadingHTTPServer(("0.0.0.0", port), handler)
    console.print(qr_text(url))
    console.print(f"Scan this in the app (Index → Scan PC code), or type [bold]{url}[/]")
    console.print("The phone has to be on the same Wi-Fi. Allow Python through the firewall if Windows asks. Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
