#!/usr/bin/env python3
"""Liftspark's icon and splash, drawn in code: a white spark bolt cutting across a barbell on the
ember-to-magenta gradient. Writes the iOS app icon (1024, no alpha), splash images and web icons.

Usage: python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'app'


def gradient(size, c0=(255, 106, 43), c1=(255, 47, 125)):
    w, h = size
    base = Image.new('RGB', size, c0)
    top = Image.new('RGB', size, c1)
    mask = Image.new('L', size)
    md = ImageDraw.Draw(mask)
    for y in range(h):
        md.line([(0, y), (w, y)], fill=int(255 * (y / h)))
    # diagonal: blend a horizontal ramp in too
    mask2 = Image.new('L', size)
    m2 = ImageDraw.Draw(mask2)
    for x in range(w):
        m2.line([(x, 0), (x, h)], fill=int(255 * (x / w)))
    mask = Image.blend(mask, mask2, 0.5)
    return Image.composite(top, base, mask)


def mark(size, bg=True):
    s = size
    img = gradient((s, s)) if bg else Image.new('RGB', (s, s), (11, 13, 26))
    d = ImageDraw.Draw(img)
    k = s / 1024
    ink = (255, 255, 255)
    shadow = Image.new('L', (s, s), 0)
    sd = ImageDraw.Draw(shadow)
    # Barbell: bar + two plates each side.
    bar_y = 520 * k
    bar = [140 * k, bar_y - 22 * k, 884 * k, bar_y + 22 * k]
    plates = [(190, 120, 300), (250, 90, 240), (774, 120, 300), (714, 90, 240)]
    def draw_bar(dr, fill):
        dr.rounded_rectangle(bar, radius=22 * k, fill=fill)
        for cx, w, h in plates:
            dr.rounded_rectangle([(cx - w / 2) * k + (0 if cx < 512 else 0), bar_y - h / 2 * k, (cx + w / 2) * k, bar_y + h / 2 * k], radius=26 * k, fill=fill)
    # Bolt polygon.
    bolt = [(560, 150), (360, 560), (500, 560), (440, 880), (680, 440), (535, 440), (620, 150)]
    bolt = [(x * k, y * k) for x, y in bolt]
    draw_bar(sd, 110)
    sd.polygon(bolt, fill=160)
    shadow = shadow.filter(ImageFilter.GaussianBlur(26 * k))
    dark = Image.new('RGB', (s, s), (90, 10, 40))
    img = Image.composite(dark, img, shadow.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(img)
    draw_bar(d, (255, 238, 228))
    # cut a gap in the bar where the bolt crosses, then the bolt
    d.polygon([(p[0] + 18 * k * (1 if i < 3 else -1), p[1]) for i, p in enumerate(bolt)], fill=None)
    d.polygon(bolt, fill=ink)
    return img


def main():
    icon = mark(1024)
    icon.save(APP / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
    icon.save(APP / 'resources/icon.png')
    for n in (180, 512):
        icon.resize((n, n), Image.LANCZOS).save(APP / f'public/icon-{n}.png')
    splash_dir = APP / 'ios/App/App/Assets.xcassets/Splash.imageset'
    for f in splash_dir.glob('*.png'):
        w, h = Image.open(f).size
        sp = Image.new('RGB', (w, h), (11, 13, 26))
        m = mark(int(min(w, h) * 0.22))
        mask = Image.new('L', m.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, m.size[0], m.size[1]], radius=int(m.size[0] * 0.23), fill=255)
        sp.paste(m, ((w - m.size[0]) // 2, (h - m.size[1]) // 2), mask)
        sp.save(f)
    print('icons written')


if __name__ == '__main__':
    main()
