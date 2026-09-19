"""Stream the Amazon Reviews 2023 Industrial & Scientific corpus (UCSD / McAuley Lab)
and keep low-rated reviews whose text mentions a product-quality or fulfillment problem.

Nothing is stored except the filtered candidates. Source: https://amazon-reviews-2023.github.io/
"""
import gzip, json, re, sys, urllib.request

URL = "https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/review_categories/Industrial_and_Scientific.jsonl.gz"
OUT = "data/raw/is_candidates.jsonl"
MAX_KEEP = 60000

PAT = re.compile(r"""
    damag|broke|bent|rust|corro|wrong\s+(part|item|size|thread|pitch)|missing|short(ed|age)?\b|
    \bcount\b|thread|stripp|burr|sharp\s+edge|toleran|(does|did|would|won)n?'?t\s+fit|wobbl|
    crack|leak|gritty|flak|plating|kink|crush|dent|scratch|mislabel|label\s+says|
    out\s+of\s+round|not\s+straight|warp|shelf\s+life|dry.?rot|expired|snapp|shear|
    loose\s+in\s+the\s+box|packag|arrived|shipp|deliver
""", re.I | re.X)

kept = seen = 0
with urllib.request.urlopen(URL) as resp, gzip.GzipFile(fileobj=resp) as gz, open(OUT, "w") as out:
    for line in gz:
        seen += 1
        r = json.loads(line)
        if r.get("rating", 5) > 3: continue
        text = (r.get("title") or "") + " " + (r.get("text") or "")
        if len(text) < 40 or not PAT.search(text): continue
        out.write(json.dumps({
            "id": f"is_{r.get('user_id','')[:8]}_{r.get('asin','')}_{r.get('timestamp','')}",
            "rating": r["rating"], "title": r.get("title",""), "text": r.get("text",""),
            "asin": r.get("asin",""), "parent_asin": r.get("parent_asin",""),
            "timestamp": r.get("timestamp"), "verified": r.get("verified_purchase"),
        }) + "\n")
        kept += 1
        if kept % 5000 == 0: print(f"seen={seen:,} kept={kept:,}", flush=True)
        if kept >= MAX_KEEP: break
print(f"DONE seen={seen:,} kept={kept:,}", flush=True)
