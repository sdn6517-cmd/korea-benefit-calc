# 한국 혜택 계산소 — korea-benefit-calc

퇴직금(육아휴직 반영) · 실업급여 · 연말정산 · 출산육아 지원금을 한 화면에서 계산하는 무료 웹 계산기입니다.
서버 없이 브라우저에서만 동작하고, 입력값은 어디로도 전송되지 않습니다.

- 라이브: https://sdn6517-cmd.github.io/korea-benefit-calc/
- 기준일: 2026-11-17 (대한민국)

## 계산기 4종

| 탭 | 계산 내용 | 핵심 기준 |
| --- | --- | --- |
| 퇴직금 | 법정 퇴직금 + 미사용 연차수당, 육아휴직·출산전후휴가 기간 반영 | 근로자퇴직급여 보장법 §8, 근로기준법 §2·시행령 §2① |
| 실업급여 | 1일 구직급여일액, 소정급여일수, 총 수령액 | 고용보험법 §45~§50 (상한 68,100원·하한 66,048원) |
| 연말정산 | 결정세액, 예상 환급·추징 | 소득세법 §47·§50·§55·§59, 조특법 §95의2·§126의2 |
| 출산·육아 | 현행(첫만남이용권·부모급여·아동수당) vs 2027 개편안(아이맞이지원금·아동기본수당) | 아동수당법, 보건복지부 2027년 예산안 |

## 구조

```
index.html   4탭 계산기 (모바일 우선, 광고 슬롯 3개)
app.js       계산 엔진 + 화면 렌더 (엔진은 DOM과 분리)
styles.css   스타일 (의존성 없음, Pretendard CDN)
about.html   계산 기준·법령 근거
privacy.html 개인정보처리방침
tests/       run.py(엔진 40항목) · ui-smoke.py(Playwright UI)
tools/       make-og.py (og-image 생성)
```

## 테스트

```bash
python3 tests/run.py        # 계산 엔진 40항목
python3 tests/ui-smoke.py   # 브라우저 UI 스모크 (탭 4개·재계산·모바일 넘침)
```

## 배포

`main` 브랜치 루트를 GitHub Pages로 배포합니다. 빌드 단계는 없습니다.

## 광고·제휴

- Google AdSense: `ca-pub-3249841704400584` (`#ad-slot-top`, `#ad-slot-infeed`, `#ad-slot-bottom`)
- 쿠팡 파트너스 링크는 `rel="sponsored nofollow noopener"`로 표시했습니다.
