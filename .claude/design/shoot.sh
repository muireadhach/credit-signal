#!/bin/zsh
# Full-page screenshots of the local site (serve with: python3 -m http.server 8321 --directory site)
# Usage: .claude/design/shoot.sh <out_dir> [page]   page = "" (index) or "memo"
# Headless Chrome won't go below 500px wide, so mobile renders inside a 390px iframe.
out=${1:?out dir}; page=${2:-}; mkdir -p "$out"; out=${out:A}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
url="http://localhost:8321/${page:+$page.html}"; name=${page:-index}
tmp=$(mktemp -d)
for scheme in light dark; do
  [[ $scheme == dark ]] && flag=0 || flag=1
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=5000 \
    --blink-settings=preferredColorScheme=$flag --window-size=1280,12000 \
    --screenshot="$out/${name}-desktop-$scheme.png" "$url" >/dev/null 2>&1
  print "<body style=margin:0><iframe src='$url' style='border:0;width:390px;height:16000px'></iframe>" > $tmp/m.html
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=5000 \
    --blink-settings=preferredColorScheme=$flag --window-size=500,16000 \
    --screenshot="$tmp/m-$scheme.png" "file://$tmp/m.html" >/dev/null 2>&1
  sips -c 16000 390 --cropOffset 0 0 "$tmp/m-$scheme.png" --out "$out/${name}-mobile-$scheme.png" >/dev/null
done
rm -rf $tmp; ls "$out"
