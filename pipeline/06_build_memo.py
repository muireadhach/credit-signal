"""Render memo/memo.md as site/memo.html so the decision memo is one click from the demo."""
import markdown, re
body = markdown.markdown(open("memo/memo.md").read(), extensions=["tables"])
css = re.search(r"<style>(.*?)</style>", open("site/index.html").read(), re.S).group(1)
html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Credit Signal — Decision memo</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>{css}
.memo{{max-width:760px;margin:0 auto;padding:36px 20px 80px}}
.memo h1{{font-size:clamp(28px,4.5vw,38px);margin-bottom:18px}}
.memo h2{{margin-top:38px;font-size:23px}}.memo h3{{margin-top:22px}}
.memo p,.memo li{{max-width:70ch;font-size:15.5px}}
.memo table{{margin:12px 0 18px;display:block;overflow-x:auto;white-space:nowrap}}
.memo td,.memo th{{white-space:normal;min-width:90px}}
.memo hr{{border:0;border-top:1px solid var(--rule);margin:22px 0}}
.memo blockquote{{border-left:3px solid var(--rule-strong);margin:0;padding:4px 14px;color:var(--ink-2)}}
.memo strong{{font-weight:600}}
</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="index.html">← Credit Signal</a><span class="disclose"><b>Not McMaster-Carr data.</b> Public reviews + disclosed synthetic credits.</span></div></header>
<main><div class="memo">{body}</div></main>
</body></html>"""
open("site/memo.html", "w").write(html); print("site/memo.html written")
