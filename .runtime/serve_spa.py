from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


WEB_ROOT = Path(
    r"C:\Users\kefel\PycharmProjects\pvc\frontend\dist\frontend\browser"
).resolve()


class SpaRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def _route_is_file(self) -> bool:
        request_path = unquote(urlsplit(self.path).path).lstrip("/")
        target = (WEB_ROOT / request_path).resolve()
        try:
            target.relative_to(WEB_ROOT)
        except ValueError:
            return False
        return target.exists()

    def _use_spa_entrypoint(self) -> None:
        route_path = Path(unquote(urlsplit(self.path).path))
        if self.path != "/" and not self._route_is_file() and not route_path.suffix:
            self.path = "/index.html"

    def do_GET(self) -> None:
        self._use_spa_entrypoint()
        super().do_GET()

    def do_HEAD(self) -> None:
        self._use_spa_entrypoint()
        super().do_HEAD()

    def end_headers(self) -> None:
        if urlsplit(self.path).path == "/index.html":
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 4200), SpaRequestHandler)
    server.serve_forever()
