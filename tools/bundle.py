"""Bundle the project into one self-contained HTML file (dist/blue-bay-pin.html).

Inlines css/style.css, every <script src>, and every image under assets/ as a data URI,
so the result can be published as a single page or sent around as one file.

    python3 tools/bundle.py
"""
import base64, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def data_uri(rel):
    p = ROOT / rel
    return f"data:{MIME[p.suffix.lower()]};base64," + base64.b64encode(p.read_bytes()).decode()


def inline_assets(text):
    return re.sub(r"assets/[\w\-/]+\.(?:jpg|jpeg|png)",
                  lambda m: data_uri(m.group(0)) if (ROOT / m.group(0)).is_file() else m.group(0), text)


html = (ROOT / "index.html").read_text()
css = (ROOT / "css/style.css").read_text()
html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}</style>")
html = re.sub(
    r'<script src="([^"]+)"></script>',
    lambda m: "<script>\n" + inline_assets((ROOT / m.group(1)).read_text()) + "</script>",
    html,
)
html = inline_assets(html)

out = ROOT / "dist/blue-bay-pin.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(f"Wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1e6:.1f} MB)")
