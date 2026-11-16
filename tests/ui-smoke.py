#!/usr/bin/env python3
"""브라우저 UI 스모크 테스트 (Playwright · Chromium).

로컬 폴더를 http 로 띄우고 실제 브라우저로 열어
  · 4개 탭이 모두 렌더링되는지
  · 입력을 바꾸면 결과가 다시 계산되는지
  · 콘솔 오류가 없는지
  · 모바일 폭(375px)에서 가로 스크롤이 생기지 않는지
를 확인하고 스크린샷을 남깁니다.

사용법: python3 tests/ui-smoke.py
"""
import functools
import http.server
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8147
failures = []


def check(cond, label, detail=""):
    if cond:
        print(f"  ✓ {label}")
    else:
        failures.append(f"{label} {detail}".strip())
        print(f"  ✗ {label} {detail}".strip())


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def text(page, sel):
    el = page.query_selector(sel)
    return el.inner_text().strip() if el else None


def main():
    httpd = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 1000}, locale="ko-KR")
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("• 데스크톱 1280×1000")
        page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
        page.wait_for_timeout(400)

        check("퇴직금" in page.title(), "문서 제목", page.title())
        check(page.query_selector_all('[role="tab"]').__len__() == 4, "탭 4개")
        check(page.query_selector_all(".ad-slot").__len__() == 3, "광고 슬롯 3개(top/infeed/bottom)")
        ids = [e.get_attribute("id") for e in page.query_selector_all(".ad-slot")]
        check(ids == ["ad-slot-top", "ad-slot-infeed", "ad-slot-bottom"], "광고 슬롯 id", str(ids))

        # 1) 퇴직금 기본값
        v = text(page, "#sv-total")
        check(v and v != "0원", "퇴직금 기본 계산", v)
        base_total = v
        page.fill("#sv-base", "4000000")
        page.wait_for_timeout(200)
        check(text(page, "#sv-total") != base_total, "기본급 변경 → 재계산", text(page, "#sv-total"))
        page.fill("#sv-base", "3200000")

        # 휴직 반영
        page.check('input[name="sv-p1-type"][value="parental"]')
        page.fill("#sv-p1-start", "2026-06-01")
        page.fill("#sv-p1-end", "2026-11-30")
        page.wait_for_timeout(200)
        check(any(k in (text(page, "#sv-badge") or "") for k in ("제외", "휴직 전")), "육아휴직 반영 배지", text(page, "#sv-badge"))
        check(text(page, "#sv-window").endswith("2026.05.31"), "휴직 전 3개월로 산정기간 이동", text(page, "#sv-window"))
        page.screenshot(path=str(ROOT / "shot-severance.png"), full_page=False)

        # 2) 실업급여
        page.click('#tab-unemployment')
        page.wait_for_timeout(250)
        check(page.query_selector("#panel-unemployment").is_visible(), "실업급여 패널 표시")
        d = text(page, "#ui-daily")
        check(d == "66,048원", "실업급여 하한액 66,048원", d)
        check(text(page, "#ui-days") == "210일", "소정급여일수 210일", text(page, "#ui-days"))
        page.fill("#ui-wage3m", "30000000")
        page.wait_for_timeout(200)
        check(text(page, "#ui-daily") == "68,100원", "고임금 → 상한액 68,100원", text(page, "#ui-daily"))
        page.screenshot(path=str(ROOT / "shot-unemployment.png"))

        # 2027 이직
        page.fill("#ui-last", "2027-01-15")
        page.wait_for_timeout(200)
        check(text(page, "#ui-daily") == "68,480원", "2027년 이직 하한 68,480원", text(page, "#ui-daily"))
        page.fill("#ui-last", "2026-11-17")
        page.fill("#ui-wage3m", "0")

        # 3) 연말정산
        page.click('#tab-yearend')
        page.wait_for_timeout(250)
        ref = text(page, "#ye-refund")
        check(ref and ref.startswith("+"), "연말정산 환급액 표시", ref)
        check(text(page, "#ye-decided") != "0원", "결정세액 계산", text(page, "#ye-decided"))
        page.fill("#ye-pension", "3000000")
        page.wait_for_timeout(200)
        check(text(page, "#ye-refund") != ref, "연금계좌 입력 → 환급액 변화", text(page, "#ye-refund"))
        page.screenshot(path=str(ROOT / "shot-yearend.png"))

        # 4) 출산·육아
        page.click('#tab-childbirth')
        page.wait_for_timeout(250)
        check(text(page, "#cb-total") == "35,600,000원", "2026년 현행 3,560만원", text(page, "#cb-total"))
        check(text(page, "#cb-reform-total") == "48,400,000원", "개편안 4,840만원", text(page, "#cb-reform-total"))
        page.fill("#cb-year", "2027")
        page.fill("#cb-month", "8")
        page.wait_for_timeout(200)
        check(text(page, "#cb-total") == "48,400,000원", "2027.7 이후 → 개편안 적용", text(page, "#cb-total"))
        page.screenshot(path=str(ROOT / "shot-childbirth.png"))

        # 가로 넘침 검사 (데스크톱)
        overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(overflow <= 1, "데스크톱 가로 넘침 없음", f"{overflow}px")

        page.click('#tab-severance')
        page.wait_for_timeout(200)
        page.screenshot(path=str(ROOT / "live-desktop.png"), full_page=False)

        # 모바일
        print("• 모바일 375×812")
        mob = browser.new_context(viewport={"width": 375, "height": 812}, locale="ko-KR", is_mobile=True, has_touch=True)
        mp = mob.new_page()
        mp.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        mp.on("pageerror", lambda e: errors.append(str(e)))
        mp.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
        mp.wait_for_timeout(400)
        check(text(mp, "#sv-total") != "0원", "모바일 퇴직금 계산", text(mp, "#sv-total"))
        m_overflow = mp.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(m_overflow <= 1, "모바일 가로 넘침 없음", f"{m_overflow}px")
        mp.click('#tab-childbirth')
        mp.wait_for_timeout(250)
        mp.screenshot(path=str(ROOT / "live-mobile.png"), full_page=False)
        mp.click('#tab-yearend')
        mp.wait_for_timeout(250)
        mp.screenshot(path=str(ROOT / "live-mobile-yearend.png"), full_page=False)
        mob.close()

        check(len(errors) == 0, "콘솔 오류 없음", str(errors[:3]))
        ctx.close()
        browser.close()

    httpd.shutdown()

    print()
    if failures:
        print(f"UI 스모크 테스트 실패 {len(failures)}건")
        for f in failures:
            print("  -", f)
        return 1
    print("UI 스모크 테스트 전원 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
