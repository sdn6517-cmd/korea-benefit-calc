#!/usr/bin/env python3
"""og-image.png (1200×630) 생성 — 소셜 미리보기용."""
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
W, H = 1200, 630
BRAND = (29, 63, 143)
BRAND_DARK = (18, 40, 95)
INK = (20, 33, 58)
SOFT = (234, 239, 251)
FONT = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"

img = Image.new("RGB", (W, H), (255, 255, 255))
d = ImageDraw.Draw(img)

# 배경 그라데이션 (위쪽 브랜드 블록)
for y in range(0, 300):
    t = y / 300
    c = tuple(int(BRAND_DARK[i] + (BRAND[i] - BRAND_DARK[i]) * t) for i in range(3))
    d.line([(0, y), (W, y)], fill=c)

def f(size):
    return ImageFont.truetype(FONT, size)

# 브랜드 배지
badge_w = 66 + int(d.textlength("한국 혜택 계산소", font=f(28)))
d.rounded_rectangle([72, 56, 72 + badge_w + 44, 120], radius=16, fill=(255, 255, 255))
d.rounded_rectangle([84, 68, 124, 108], radius=10, fill=BRAND)
d.text((96, 74), "혜", font=f(24), fill=(255, 255, 255))
d.text((138, 74), "한국 혜택 계산소", font=f(28), fill=BRAND)

# 제목
d.text((72, 150), "퇴직금 · 실업급여 · 연말정산", font=f(52), fill=(255, 255, 255))
d.text((72, 210), "출산·육아 지원금까지 4종 통합", font=f(52), fill=(255, 255, 255))

# 부제
d.text((74, 306), "2026년 법령·고시를 반영해 계산 과정과 근거를 함께 보여 줍니다", font=f(26), fill=(90, 106, 133))

# 카드 4개
cards = [
    ("퇴직금", "육아휴직 반영", "평균임금 × 30일 × 재직일수 ÷ 365"),
    ("실업급여", "상한 68,100원", "하한 66,048원 · 최대 270일"),
    ("연말정산", "2026년 귀속", "환급·추징 간이 계산"),
    ("출산·육아", "현행 vs 2027 개편", "0~12세 누적 지원금"),
]
x0, y0, gap, cw, ch = 72, 368, 20, 254, 190
for i, (title, sub, desc) in enumerate(cards):
    x = x0 + i * (cw + gap)
    d.rounded_rectangle([x, y0, x + cw, y0 + ch], radius=18, fill=SOFT, outline=(200, 212, 240), width=2)
    d.text((x + 22, y0 + 22), title, font=f(28), fill=BRAND)
    d.text((x + 22, y0 + 76), sub, font=f(20), fill=INK)
    # 설명은 두 줄로 감싼다
    words = desc.split(" ")
    line, lines = "", []
    for wd in words:
        trial = (line + " " + wd).strip()
        if d.textlength(trial, font=f(17)) > cw - 44:
            lines.append(line)
            line = wd
        else:
            line = trial
    lines.append(line)
    for j, ln in enumerate(lines[:3]):
        d.text((x + 22, y0 + 112 + j * 26), ln, font=f(17), fill=(80, 95, 120))

d.text((72, 588), "sdn6517-cmd.github.io/korea-benefit-calc  ·  회원가입 없이 무료", font=f(19), fill=(124, 135, 152))

img.save(ROOT / "og-image.png", optimize=True)
print("saved", ROOT / "og-image.png", img.size)
