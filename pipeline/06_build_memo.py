"""Render memo/memo.md as site/memo.html so the decision memo is one click from the demo."""
import markdown, re
from html import escape

md = markdown.Markdown(extensions=["tables", "toc"], extension_configs={"toc": {"toc_depth": "2-3"}})
body = md.convert(open("memo/memo.md").read())

# Table of contents from the memo's own section headings (h2, with 5.x nested), inserted before the first section.
def toc_list(tokens):
    items = "".join(f'<li><a href="#{t["id"]}">{escape(t["name"], quote=False)}</a>{toc_list(t["children"]) if t["children"] else ""}</li>' for t in tokens)
    return f"<ul>{items}</ul>"
toc = f'<nav class="toc" aria-label="Contents"><p class="toc-h">Contents</p>{toc_list(md.toc_tokens)}</nav>\n'
i = body.find("<h2")
body = body[:i] + toc + body[i:] if i >= 0 else body

css = re.search(r"<style>(.*?)</style>", open("site/index.html").read(), re.S).group(1)
html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Credit Signal · Decision memo</title>
<link rel="icon" href="brand/favicon-64.png" type="image/png"><link rel="icon" href="brand/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>{css}
/* ---------- memo: the author's prose, so it is set in the serif; tables stay in the sans ---------- */
.memo{{max-width:760px;margin:0 auto;padding:44px 24px 96px;font:18px/1.6 var(--serif)}}
.memo h1{{font-size:44px;line-height:1.08;margin:0 0 22px}}
.memo h2{{font-size:28px;line-height:1.2;margin:64px 0 14px;padding-top:18px;border-top:1px solid var(--ink)}}
.memo h3{{font:600 18px/1.35 var(--sans);margin:36px 0 10px}}
.memo p,.memo li{{max-width:68ch}}
.memo p{{margin:0 0 16px}}
.memo ul,.memo ol{{padding-left:22px;margin:0 0 18px}}
.memo li{{margin-bottom:6px}}
.memo strong{{font-weight:600}}
.memo a{{text-decoration-color:var(--rule-strong)}}
.memo code{{font:.85em var(--mono)}}
.memo hr{{border:0;border-top:1px solid var(--rule);margin:28px 0}}
.memo blockquote{{margin:0 0 16px;padding-left:20px;color:var(--ink-2);font-style:italic}}
/* wide tables scroll inside the column; the edge shadows appear only while there is more to scroll */
.memo table{{font:14px/1.45 var(--sans);font-variant-numeric:tabular-nums lining-nums;margin:18px 0 28px;display:block;overflow-x:auto;white-space:nowrap;border-bottom:0;
  background:linear-gradient(to right,var(--bg) 30%,transparent) left/40px 100% no-repeat local,linear-gradient(to left,var(--bg) 30%,transparent) right/40px 100% no-repeat local,
  linear-gradient(to right,color-mix(in srgb,var(--ink) 14%,transparent),transparent) left/12px 100% no-repeat scroll,linear-gradient(to left,color-mix(in srgb,var(--ink) 14%,transparent),transparent) right/12px 100% no-repeat scroll}}
.memo table tbody tr:last-child td{{border-bottom:1px solid var(--ink)}}
.memo td,.memo th{{white-space:normal;min-width:90px}}
.memo td:first-child,.memo th:first-child{{min-width:140px}}
.toc{{font:15px/1.4 var(--sans);margin:0}}  /* framed by the memo's own <hr> above and the first section rule below */
.toc .toc-h{{font:600 12.5px/1.3 var(--sans);color:var(--ink-2);margin:0 0 8px}}
.toc ul{{list-style:none;margin:0;padding:0;columns:2;column-gap:32px}}
.toc li{{break-inside:avoid;margin:0 0 6px}}
.toc li ul{{columns:1;margin:6px 0 0 16px;font-size:14px}}
.toc a{{text-decoration:none;color:var(--ink)}}
.toc a:hover{{color:var(--accent);text-decoration:underline}}
.toc li ul a{{color:var(--ink-2)}}
@media (max-width:760px){{
  .memo{{padding:28px 16px 64px;font-size:17px}}
  .memo h1{{font-size:31px;line-height:1.12}}
  .memo h2{{font-size:23px;margin-top:48px}}
  .memo h3{{font-size:17px}}
  .toc ul{{columns:1}}
  .toc a{{display:inline-block;padding:4px 0}}
}}
</style></head><body>
<header class="top">
  <p class="disclose"><span class="wrap"><b>Not McMaster-Carr data.</b> Public reviews + synthetic credits · <a href="./">Live demo</a></span></p>
  <div class="wrap bar"><a class="brand" href="./">← Credit Signal</a></div>
</header>
<main><div class="memo">{body}</div></main>
<script defer src="/_vercel/insights/script.js"></script>
</body></html>"""
open("site/memo.html", "w").write(html); print("site/memo.html written")
