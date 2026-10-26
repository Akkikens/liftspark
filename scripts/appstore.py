#!/usr/bin/env python3
"""Composes the 6.9" App Store screenshots for Liftspark (1320 x 2868, RGB, no alpha) from raw simulator
captures in docs/appstore/raw/. Captions are fixed by the brief."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = os.path.join(os.path.dirname(__file__), "..")
raw = os.path.join(root, "docs/appstore/raw")
out_dir = os.path.join(root, "docs/appstore/6.9")
os.makedirs(out_dir, exist_ok=True)
font = ImageFont.truetype(os.path.join(root, "app/public/fonts/BarlowCondensed-800.woff2"), 124)
W, H = 1320, 2868
INK = (0xEC, 0xEA, 0xF2)
slides = [
    ("1-home.png", "Lift with your heart rate", (0x2A, 0x14, 0x24), (0x0B, 0x0D, 0x1A), INK),
    ("2-workout.png", "Every set, every rep, every PR", (0x2B, 0x17, 0x10), (0x0B, 0x0D, 0x1A), INK),
    ("3-stats.png", "Strain for every session", (0x30, 0x12, 0x22), (0x0B, 0x0D, 0x1A), INK),
    ("4-fuel.png", "Calories in and out, with macros", (0x12, 0x22, 0x26), (0x0B, 0x0D, 0x1A), INK),
    ("5-history.png", "No account. Your data stays yours.", (0x1A, 0x16, 0x34), (0x0B, 0x0D, 0x1A), INK),
]

def gradient(top, bottom):
    g = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        g.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize((W, H))

def wrap(text, draw, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) <= maxw: cur = test
        else: lines.append(cur); cur = w
    lines.append(cur)
    return lines

for i, (src, caption, top, bottom, ink) in enumerate(slides, 1):
    img = gradient(top, bottom)
    d = ImageDraw.Draw(img)
    lines = wrap(caption, d, W - 160)
    y = 170
    for line in lines:
        tw = d.textlength(line, font=font)
        x = (W - tw) / 2
        # Soft shadow, then the text.
        sh = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((x, 20), line, font=font, fill=(0, 0, 0, 70))
        img.paste(sh.filter(ImageFilter.GaussianBlur(8)), (0, y - 10), sh.filter(ImageFilter.GaussianBlur(8)))
        d.text((x, y), line, font=font, fill=ink)
        y += 150
    # The phone: screenshot with a rounded ink bezel and a soft drop shadow.
    shot = Image.open(os.path.join(raw, src)).convert("RGB")
    sh_h = H - y - 150
    sh_w = int(shot.width * sh_h / shot.height)
    shot = shot.resize((sh_w, sh_h), Image.LANCZOS)
    bez, r = 26, 110
    pw, ph = sh_w + bez * 2, sh_h + bez * 2
    px, py = (W - pw) // 2, y + 70
    shadow = Image.new("RGBA", (pw + 200, ph + 200), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((100, 120, pw + 100, ph + 120), r, fill=(20, 20, 50, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(40))
    img.paste(shadow, (px - 100, py - 100), shadow)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((px, py, px + pw, py + ph), r, fill=INK)
    mask = Image.new("L", (sh_w, sh_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sh_w, sh_h), r - bez, fill=255)
    img.paste(shot, (px + bez, py + bez), mask)
    out = os.path.join(out_dir, f"{i}.png")
    img.convert("RGB").save(out, optimize=True)
    im = Image.open(out)
    print(out, im.size, im.mode, os.path.getsize(out) // 1024, "KB")
