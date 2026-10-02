"""Stills from the film for checking, at the recording size: python tools/stills.py <out dir> <sec> [sec ...]
Seconds must be given in increasing order (the burn only runs forward).
"""
import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]


def main():
    out = sys.argv[1]
    secs = [float(x) for x in sys.argv[2:]]
    os.makedirs(out, exist_ok=True)
    port = serve()
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=False, args=["--window-position=-3400,0", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=float(os.environ.get("RS", "2")))
        pg.on("pageerror", lambda e: print("[pageerror]", e))
        pg.goto(f"http://127.0.0.1:{port}/index.html?render&rs={os.environ.get('RS', '2')}")
        pg.wait_for_function("window.__ready === true", timeout=120000)
        pg.evaluate("document.fonts.ready")
        for s in secs:
            r = pg.evaluate(f"window.__renderAt({round(s * 30)}, 30)")
            path = os.path.join(out, f"f{s:05.2f}.png")
            for attempt in range(3):
                try:
                    pg.screenshot(path=path, timeout=180000)
                    break
                except Exception as e:  # the GPU can stall for a moment after a heavy frame
                    print("retry", s, type(e).__name__)
            print(s, {k: r[k] for k in ("shot", "T", "stage", "light", "n")}, flush=True)
        b.close()


main()
