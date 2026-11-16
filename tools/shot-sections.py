#!/usr/bin/env python3
"""섹션 스크린샷 — 라이브 페이지의 해설·기준·준비물 섹션 확인용."""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://sdn6517-cmd.github.io/korea-benefit-calc/"
OUT = "/workspace/work/korea-benefit-calc/"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1100, "height": 900}, locale="ko-KR").new_page()
    pg.goto(URL, wait_until="load"); pg.wait_for_timeout(800)
    print("overflow:", pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth"))
    for sel, name in [("#basis", "live-basis.png"), ("#picks", "live-picks.png")]:
        pg.evaluate("s => window.scrollTo({top: document.querySelector(s).getBoundingClientRect().top + window.scrollY - 70, behavior:'instant'})", sel)
        pg.wait_for_timeout(500)
        pg.screenshot(path=OUT + name)
    b.close()
