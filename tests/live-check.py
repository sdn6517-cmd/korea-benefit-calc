#!/usr/bin/env python3
"""라이브 사이트 확인 — 4개 탭 결과·광고 슬롯·콘솔 오류·모바일 넘침.

사용법: python3 tests/live-check.py [URL]
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://sdn6517-cmd.github.io/korea-benefit-calc/"
OUT = "/workspace/work/korea-benefit-calc/"
fails = []

def check(cond, label, detail=""):
    print(("  ✓ " if cond else "  ✗ ") + label + (f" {detail}" if detail else ""))
    if not cond:
        fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 1000}, locale="ko-KR")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(800)

    def t(sel):
        el = pg.query_selector(sel)
        return el.inner_text().strip() if el else None

    print("• 라이브", URL)
    check("퇴직금" in pg.title(), "문서 제목", pg.title())
    check(t("#sv-total") not in (None, "0원"), "퇴직금", t("#sv-total"))
    pg.click('#tab-unemployment'); pg.wait_for_timeout(300)
    check(t("#ui-daily") == "66,048원", "실업급여 1일 하한액", str(t("#ui-daily")))
    check(t("#ui-days") == "210일", "소정급여일수", str(t("#ui-days")))
    check(t("#ui-monthly-out") not in (None, "—"), "월 수령액 KPI", str(t("#ui-monthly-out")))
    pg.click('#tab-yearend'); pg.wait_for_timeout(300)
    check(str(t("#ye-refund")).startswith("+"), "연말정산 환급액", str(t("#ye-refund")))
    pg.screenshot(path=OUT + "live-yearend.png")
    pg.click('#tab-childbirth'); pg.wait_for_timeout(300)
    check(t("#cb-total") == "35,600,000원", "출산육아 현행", str(t("#cb-total")))
    check(t("#cb-reform-total") == "48,400,000원", "출산육아 개편안", str(t("#cb-reform-total")))
    slots = pg.eval_on_selector_all(".ad-slot", "els=>els.map(e=>e.id)")
    check(slots == ["ad-slot-top", "ad-slot-infeed", "ad-slot-bottom"], "광고 슬롯", str(slots))
    check(pg.eval_on_selector_all('script[src*="adsbygoogle"]', "els=>els.length") == 1, "애드센스 스크립트")
    pg.screenshot(path=OUT + "live-childbirth.png")

    mob = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2, locale="ko-KR")
    mp = mob.new_page()
    mp.on("pageerror", lambda e: errs.append(str(e)))
    mp.goto(URL, wait_until="load"); mp.wait_for_timeout(700)
    mp.click('#tab-childbirth'); mp.wait_for_timeout(300)
    mp.evaluate("document.querySelector('#cb-total').scrollIntoView({block:'start'})")
    mp.wait_for_timeout(300)
    mp.screenshot(path=OUT + "live-mobile2.png")
    check(mp.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth") <= 1, "모바일 가로 넘침")
    check(len(errs) == 0, "콘솔 오류 없음", str(errs[:3]))
    b.close()

print("\n라이브 확인 " + ("전원 통과" if not fails else f"실패 {len(fails)}건: {fails}"))
sys.exit(1 if fails else 0)
