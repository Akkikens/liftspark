"""Builds the Liftspark site into site/public: home, privacy (rendered from PRIVACY.md) and support.
Usage: python3 site/build.py   (from the repo root). Deploy: cd site && vercel deploy --prod
--scope akshays-projects-550d1f45"""
import html
import os
import re
import shutil

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
EMAIL = "hello@getwingline.com"
SOURCE = "https://github.com/Akkikens/liftspark"
APP_STORE = ""  # Fill in once the app is live, e.g. https://apps.apple.com/app/id6824785119

CSS = """*{box-sizing:border-box}body{margin:0;font:17px/1.6 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#0b0d1a;color:#ECEAF2}
main{max-width:720px;margin:0 auto;padding:40px 20px 80px}a{color:#FF8A5B}h1{font-size:44px;line-height:1.08;margin:0 0 8px;letter-spacing:-.5px}
.tag{color:#A9A6B8;margin:0 0 28px;font-size:20px}h2{font-size:21px;margin:28px 0 6px}.card{background:#151829;border-radius:22px;padding:22px 24px;margin:16px 0;border:1px solid #23263b}
nav{display:flex;gap:18px;margin-bottom:30px;font-weight:700;align-items:center}nav img{width:40px;height:40px;border-radius:10px}nav a{color:#ECEAF2;text-decoration:none}
.muted{color:#A9A6B8;font-size:14px}.btn{display:inline-block;background:linear-gradient(90deg,#FF6B3D,#E8359B);color:#fff;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:16px;margin:6px 8px 6px 0}
.btn.alt{background:#23263b}.hero{display:flex;gap:22px;align-items:center;margin-bottom:10px}.hero img{width:112px;height:112px;border-radius:26px}
ul{padding-left:20px}li{margin:4px 0}code{background:#23263b;padding:1px 6px;border-radius:6px}"""


def page(title, body, desc="Liftspark: strength training with live heart rate, strain and calories for iPhone."):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}"><meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<link rel="icon" href="/img/icon-128.png"><style>{CSS}</style></head><body><main>{body}</main></body></html>"""


def inline(text):
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    t = re.sub(r"(?<![\"=>])(https?://[^\s<)]+[^\s<).,])", r'<a href="\1">\1</a>', t)
    t = re.sub(r"(?<![\w>])_(.+?)_(?!\w)", r"<em>\1</em>", t)
    return t


def render_md(md):
    """Enough Markdown for PRIVACY.md: a title, ## headings, paragraphs and - bullets."""
    out, para, items = [], [], []

    def flush():
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items.clear()

    for line in md.splitlines():
        s = line.rstrip()
        if s.startswith("# "):
            continue  # the page supplies its own title
        if s.startswith("## "):
            flush()
            out.append(f"<h2>{inline(s[3:])}</h2>")
        elif s.startswith("- "):
            if para:
                out.append(f"<p>{inline(' '.join(para))}</p>")
                para.clear()
            items.append(s[2:])
        elif s.startswith("  ") and items:
            items[-1] += " " + s.strip()
        elif not s:
            flush()
        else:
            if items:
                flush()
            para.append(s.strip())
    flush()
    return "\n".join(out)


NAV = '<nav><a href="/"><img src="/img/icon-128.png" alt=""></a><a href="/">Liftspark</a><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="' + SOURCE + '">Source</a></nav>'
store_btn = f'<a class="btn" href="{APP_STORE}">Get it on the App Store</a>' if APP_STORE else '<span class="btn">Coming soon to the App Store</span>'

HOME = f"""{NAV}<div class="hero"><img src="/img/icon-512.png" alt="Liftspark app icon"><div><h1>Liftspark</h1>
<p class="tag">Lift with a plan. See every rep's effort.</p></div></div>
<div class="card"><h2>Strength training, with your heart rate</h2><ul>
<li>Plans and guided workouts set by set, with progression that adds weight when you're ready</li>
<li>Live heart rate from Apple Watch or any Bluetooth heart-rate strap, with zones and a strain score for every session</li>
<li>Calories burned, plus food logging by search or barcode with protein, carbs and fat</li>
<li>Workouts, weigh-ins and food go to Apple Health</li>
<li>No account, no ads, no tracking. Your training stays on your iPhone.</li></ul></div>
<p>{store_btn}<a class="btn alt" href="{SOURCE}">View the source</a></p>
<p class="muted">Free and open source (GNU AGPL v3.0), built on openGym by Duarte Santos. For iPhone, with an Apple Watch app.</p>"""

FAQ = [
    ("Do I need an account?", "No. Everything is stored on your iPhone. iCloud sync is optional and uses your own private iCloud database."),
    ("Which heart-rate sensors work?", "Apple Watch, and any Bluetooth heart-rate sensor that uses the standard Heart Rate Service, such as most chest straps. Some watches and bands can broadcast heart rate over Bluetooth too."),
    ("How do I connect Apple Health?", "Settings, Devices and Health, Sync with Apple Health. You choose which data Liftspark can read and write."),
    ("How is the strain score worked out?", "From the time you spend in each heart-rate zone during a session, scaled from 0 to 21. It's a training guide, not a medical measurement."),
    ("Where does food data come from?", "Open Food Facts, plus USDA FoodData Central for generic foods. Only your search text or the barcode is sent."),
    ("How do I delete my data?", "Settings, Data and backup, Reset everything. Data already in Apple Health can be removed in the Health app."),
    ("Is Liftspark open source?", f'Yes, under the GNU AGPL v3.0. The full source is on <a href="{SOURCE}">GitHub</a>.'),
]

SUPPORT = f"""{NAV}<h1>Support</h1><p class="tag">Lift with a plan. See every rep's effort.</p>
<div class="card"><h2>Contact</h2><p>Email <a href="mailto:{EMAIL}?subject=Liftspark%20support">{EMAIL}</a> with your iPhone model and iOS version,
or open an issue on <a href="{SOURCE}/issues">GitHub</a>. We usually reply within two days.</p></div>
<div class="card">{"".join(f"<h2>{q}</h2><p>{a}</p>" for q, a in FAQ)}</div>"""

privacy_md = open(os.path.join(ROOT, "PRIVACY.md")).read()
assert "—" not in privacy_md and "–" not in privacy_md, "no em or en dashes in the policy"
PRIVACY = f"{NAV}<h1>Privacy Policy</h1><div class=\"card\">{render_md(privacy_md)}</div>"
NOT_FOUND = f'{NAV}<h1>Nothing here</h1><p><a class="btn" href="/">Back to Liftspark</a></p>'

if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(os.path.join(OUT, "img"))
icon = Image.open(os.path.join(ROOT, "app/resources/icon.png")).convert("RGB")
for s in (128, 512):
    icon.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f"img/icon-{s}.png"), optimize=True)
for name, title, body in [("index", "Liftspark", HOME), ("privacy", "Liftspark Privacy Policy", PRIVACY),
                          ("support", "Liftspark Support", SUPPORT), ("404", "Liftspark", NOT_FOUND)]:
    open(os.path.join(OUT, f"{name}.html"), "w").write(page(title, body))
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "vercel.json"), "w").write('{"cleanUrls": true, "outputDirectory": "public"}\n')
print("built", OUT)
