"""Pick the public-review subset that actually goes through the classifier.

From the 60k keyword-prefiltered candidates, keep 1-2 star reviews of moderate length that
mention a fulfillment or product-quality cue, strip media tags, and draw a STRATIFIED sample
of 2,000: 1,400 that use industrial/shop vocabulary (closest analog to an MRO customer) and
600 general, so the domain gap stays visible rather than hidden. Disclosed in the memo.
"""
import json, random, re
random.seed(11)
CUE = re.compile(r"arriv|shipp|deliver|packag|box|bag|wrong|missing|short|count|damag|bent|rust|thread|fit|toleran|broke|crack|leak|dent|scratch|expired|dry|hard(ened)?|defect", re.I)
SHOP = re.compile(r"\b(bolt|screw|nut|washer|thread|tap|die|bearing|valve|fitting|gauge|gage|steel|aluminum|stainless|brass|drill|hose|o-?ring|gasket|clamp|shaft|tube|tubing|pipe|weld|torque|caliper|mic|lathe|mill|cnc|shop|machine|spring|bushing|coupling|pulley|belt|caster|hinge|latch|adhesive|epoxy|lubricant|grease)\b", re.I)
JUNK = re.compile(r"\[\[(VIDEOID|ASIN|IMAGE)[^\]]*\]\]")
shop, general = [], []
for line in open("data/raw/is_candidates.jsonl"):
    r = json.loads(line)
    text = re.sub(r"\s+", " ", JUNK.sub("", (r["title"] or "") + ". " + (r["text"] or ""))).strip()
    if r["rating"] > 2 or not (80 <= len(text) <= 1200) or not CUE.search(text): continue
    rec = {"id": r["id"], "source": "public_review", "rating": r["rating"], "text": text, "stratum": "shop" if SHOP.search(text) else "general"}
    (shop if rec["stratum"] == "shop" else general).append(rec)
print(f"eligible: shop={len(shop)} general={len(general)}")
sample = random.sample(shop, 1400) + random.sample(general, 600); random.shuffle(sample)
with open("data/processed/public_sample.jsonl", "w") as f:
    for r in sample: f.write(json.dumps(r) + "\n")
print("wrote", len(sample), "to data/processed/public_sample.jsonl")
