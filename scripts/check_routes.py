#!/usr/bin/env python3
"""Check that every internal route link in docs/index.html has a panel.

Route links look like href="#/TRACK/MODE" (for example #/obs-101/learn).
Panels are divs with class track-panel and matching data-track and
data-mode attributes.

Routes listed in known-route-gaps.txt are allowed to be missing, but only
while they are actually missing: if a listed gap gains a panel, this check
fails until the entry is removed (in the same PR that adds the panel).
Any other missing route fails the check.

Exit 0 when clean, exit 1 with a report otherwise. No dependencies.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "docs" / "index.html"
GAPS_FILE = Path(__file__).resolve().parent / "known-route-gaps.txt"


def main() -> int:
    html = INDEX.read_text(encoding="utf-8")
    links = set(re.findall(r'href="#/([a-z0-9-]+)/([a-z]+)"', html))
    panel_divs = re.findall(
        r'<div[^>]*class="[^"]*track-panel[^"]*"[^>]*>', html
    )
    panels = set()
    for div in panel_divs:
        track = re.search(r'data-track="([a-z0-9-]+)"', div)
        mode = re.search(r'data-mode="([a-z]+)"', div)
        if track and mode:
            panels.add((track.group(1), mode.group(1)))
    gaps = set()
    if GAPS_FILE.exists():
        for line in GAPS_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            track, _, mode = line.partition("/")
            gaps.add((track, mode))
    missing = links - panels
    unexpected = missing - gaps
    stale_gaps = gaps & panels
    print(f"links: {len(links)}, panels: {len(panels)}, "
          f"known gaps: {len(gaps)}")
    if missing:
        print("missing routes: "
              + ", ".join(f"{t}/{m}" for t, m in sorted(missing)))
    failures = []
    if unexpected:
        failures.append("routes without panels: "
                        + ", ".join(f"{t}/{m}" for t, m in sorted(unexpected)))
    if stale_gaps:
        failures.append("stale gap entries (panel now exists, remove entry): "
                        + ", ".join(f"{t}/{m}" for t, m in sorted(stale_gaps)))
    if failures:
        for failure in failures:
            print("FAIL: " + failure)
        return 1
    print("OK: all routes resolve (known gaps listed separately).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
