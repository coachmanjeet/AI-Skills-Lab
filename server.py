#!/usr/bin/env python3
"""Local static file server for the AI Skills Lab prototype.

Serves the UI from docs/. No API endpoints — the app is fully client-side.

Usage:
    python3 server.py              # http://localhost:4173/
    python3 server.py --port 8080  # custom port
"""

import argparse
import os
import sys
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(SCRIPT_DIR, "docs")


class TutorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, format, *args):
        ts = time.strftime("%H:%M:%S")
        sys.stderr.write(f"  [{ts}] {format % args}\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="AI Skills Lab — static server")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--host", type=str, default="localhost")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), TutorHandler)
    print("=" * 60)
    print("  AI Skills Lab — Prototype Server")
    print("=" * 60)
    print(f"\n  URL:  http://{args.host}:{args.port}/")
    print(f"  Docs: {STATIC_DIR}")
    print(f"\n  Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
