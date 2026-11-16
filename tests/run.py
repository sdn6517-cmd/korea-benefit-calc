#!/usr/bin/env python3
"""app.js 계산 엔진 검증 실행기 (QuickJS).

사용법: python3 tests/run.py
"""
import json
import pathlib
import sys

try:
    import quickjs
except ImportError:
    sys.exit("quickjs 가 필요합니다: pip install quickjs")

ROOT = pathlib.Path(__file__).resolve().parent.parent
app = (ROOT / "app.js").read_text(encoding="utf-8")
tests = (ROOT / "tests" / "run-tests.js").read_text(encoding="utf-8")

ctx = quickjs.Context()
ctx.eval("var globalThis = this; var window = undefined;")
# app.js 는 브라우저에서 window, 노드에서 module.exports 로 내보낸다.
ctx.eval("var module = { exports: {} }; var document = undefined; var console = { log: function(){} };")
ctx.eval(app)
ctx.eval(tests)

raw = ctx.get("__testSummary")
if not raw:
    sys.exit("테스트 요약을 얻지 못했습니다.")

summary = json.loads(raw)
total, passed, failed = summary["total"], summary["passed"], summary["failed"]

for f in summary["failures"]:
    print(f"✗ {f['name']}\n    {f['error']}")

print(f"\n계산 엔진 검증: {passed}/{total} 통과" + (f" · 실패 {failed}" if failed else ""))
sys.exit(1 if failed else 0)
