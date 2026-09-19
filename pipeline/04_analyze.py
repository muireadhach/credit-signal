"""Turn classifications into the findings the demo and memo show.

Everything here is plain arithmetic on the classifier output -- no model calls. Outputs go
to site/data/*.json, which the static demo reads. Runs on whatever has been classified so
far, so it can be re-run as data lands.
"""
import json, math, statistics as st
from collections import Counter, defaultdict
from pathlib import Path
import yaml

TAX = yaml.safe_load(open("taxonomy/failure_modes.yaml"))
IMP = yaml.safe_load(open("taxonomy/impact_weights.yaml"))
MODES = [m["id"] for m in TAX["failure_modes"]]
NAME = {m["id"]: m["name"] for m in TAX["failure_modes"]}
CAT = {m["id"]: (TAX["categories"].get(m["category"]) if m["category"] else "Unclear") for m in TAX["failure_modes"]}
OUT = Path("site/data"); OUT.mkdir(parents=True, exist_ok=True)
REVIEW_THRESHOLD = 0.6
SPEC_CHANGE = "2026-05-01"

def load(p): return [json.loads(l) for l in open(p)] if Path(p).exists() else []
frame = {r["credit_id"]: r for r in load("data/processed/synthetic_frame.jsonl")}
public = {r["id"]: r for r in load("data/processed/public_sample.jsonl")}
bulk = {r["id"]: r for r in load("data/processed/classified_bulk.jsonl") if "error" not in r}
ref = {r["id"]: r for r in load("data/processed/classified_reference.jsonl") if "error" not in r}
usage = load("data/processed/usage.jsonl")

def ztest(k1, n1, k2, n2):
    """Two-proportion z-test, one-sided (p1 > p2). Returns (lift, p_value)."""
    if min(n1, n2) == 0 or k2 == 0: return None, None
    p1, p2, p = k1 / n1, k2 / n2, (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)) or 1e-9
    z = (p1 - p2) / se
    return round(p1 / p2, 2), round(0.5 * math.erfc(z / math.sqrt(2)), 5)

def dump(name, obj): (OUT / f"{name}.json").write_text(json.dumps(obj, indent=1))

# ---------- 1. what real customers say (public reviews) ----------
pub_cls = [c for i, c in bulk.items() if i in public]
by_mode = defaultdict(list)
for c in pub_cls: by_mode[c["failure_mode"]].append(c)
modes_public = []
for m in MODES:
    cs = by_mode.get(m, [])
    ex = sorted(cs, key=lambda c: -c["confidence"])[:3]
    modes_public.append(dict(mode=m, name=NAME[m], category=CAT[m], n=len(cs), share=round(len(cs) / max(len(pub_cls), 1), 4),
        avg_conf=round(st.mean([c["confidence"] for c in cs]), 3) if cs else None,
        shop_n=sum(public[c["id"]]["stratum"] == "shop" for c in cs),
        examples=[dict(quote=c["evidence"], text=public[c["id"]]["text"][:400], conf=c["confidence"]) for c in ex]))
dump("modes_public", dict(n=len(pub_cls), n_shop=sum(public[c["id"]]["stratum"] == "shop" for c in pub_cls), modes=modes_public))

# ---------- 2. credits ranked: dollars vs customer impact (synthetic) ----------
syn_cls = [c for i, c in bulk.items() if i in frame]
rate = IMP["downtime_cost_per_hour_usd"]
rows = []
for m in MODES:
    cs = [c for c in syn_cls if c["failure_mode"] == m]
    credit = sum(frame[c["id"]]["credit_amount"] for c in cs)
    lo, typ, hi = IMP["downtime_hours"][m]
    # expected downtime only for line-down orders counts fully; others at 25% (project delay, not stoppage)
    weight = sum(1.0 if frame[c["id"]]["line_down"] else 0.25 for c in cs)
    rows.append(dict(mode=m, name=NAME[m], category=CAT[m], n=len(cs), credit_usd=round(credit, 2),
        downtime_hours=dict(low=round(lo * weight, 1), typical=round(typ * weight, 1), high=round(hi * weight, 1)),
        impact_usd=dict(low=round(credit + lo * weight * rate), typical=round(credit + typ * weight * rate), high=round(credit + hi * weight * rate)),
        safety=m in IMP["safety_flag"]))
by_credit = sorted(rows, key=lambda r: -r["credit_usd"]); by_impact = sorted(rows, key=lambda r: -r["impact_usd"]["typical"])
for r in rows:
    r["rank_by_credit"] = by_credit.index(r) + 1; r["rank_by_impact"] = by_impact.index(r) + 1
dump("credits_ranked", dict(n=len(syn_cls), total_credit_usd=round(sum(r["credit_usd"] for r in rows), 2),
    total_impact_typical_usd=round(sum(r["impact_usd"]["typical"] for r in rows)), rate_per_hour=rate,
    sensitivity=[250, 500, 1500], modes=rows))

# ---------- 3. seeded-pattern test: LLM extraction vs keyword search ----------
import re
KW = re.compile(r"damag|broke|bent|dent|chew|mash|stripp|cross.?thread|won.?t start|wouldn.?t start", re.I)
def seed_test(name, target_mode, in_group, out_group, keyword_re):
    g_in = [frame[i] for i in bulk if i in frame and in_group(frame[i])]
    g_out = [frame[i] for i in bulk if i in frame and out_group(frame[i])]
    llm_in = sum(bulk[r["credit_id"]]["failure_mode"] == target_mode for r in g_in)
    llm_out = sum(bulk[r["credit_id"]]["failure_mode"] == target_mode for r in g_out)
    kw_in = sum(bool(keyword_re.search(r["note"] or "")) for r in g_in)
    kw_out = sum(bool(keyword_re.search(r["note"] or "")) for r in g_out)
    tr_in = sum(r["true_mode"] == target_mode for r in g_in); tr_out = sum(r["true_mode"] == target_mode for r in g_out)
    l_llm, p_llm = ztest(llm_in, len(g_in), llm_out, len(g_out))
    l_kw, p_kw = ztest(kw_in, len(g_in), kw_out, len(g_out))
    l_tr, _ = ztest(tr_in, len(g_in), tr_out, len(g_out))
    return dict(name=name, target=NAME[target_mode], n_in=len(g_in), n_out=len(g_out),
        llm=dict(rate_in=round(llm_in / max(len(g_in), 1), 3), rate_out=round(llm_out / max(len(g_out), 1), 3), lift=l_llm, p=p_llm),
        keyword=dict(rate_in=round(kw_in / max(len(g_in), 1), 3), rate_out=round(kw_out / max(len(g_out), 1), 3), lift=l_kw, p=p_kw),
        ground_truth_lift=l_tr)
post = lambda r: r["date"] >= SPEC_CHANGE
seeds = [
  seed_test("Seed A: bulk poly bag (PB-2) fasteners after May spec change", "thread_damage",
            lambda r: r["product_class"] == "fasteners" and r["packaging_spec"] == "PB-2" and post(r),
            lambda r: r["product_class"] == "fasteners" and r["packaging_spec"] != "PB-2", KW),
  seed_test("Seed B: DC-4 elastomers & consumables", "aged_consumables",
            lambda r: r["origin_dc"] == "DC-4" and r["product_class"] in ("seals_elastomers", "adhesives_consumables"),
            lambda r: r["origin_dc"] != "DC-4" and r["product_class"] in ("seals_elastomers", "adhesives_consumables"),
            re.compile(r"old|crack|dry|hard|stale|shelf|expired|brittle", re.I)),
  seed_test("Carrier-C transit damage (weak, may not be significant)", "transit_surface_damage",
            lambda r: r["carrier"] == "Carrier-C", lambda r: r["carrier"] != "Carrier-C", re.compile(r"damag|dent|scratch|ding", re.I)),
]
# monthly trend for Seed A
months = sorted({r["date"][:7] for r in frame.values()})
trend = []
for mo in months:
    def rt(f):
        g = [frame[i] for i in bulk if i in frame and frame[i]["date"][:7] == mo and f(frame[i])]
        return (round(sum(bulk[r["credit_id"]]["failure_mode"] == "thread_damage" for r in g) / len(g), 3) if g else None, len(g))
    a, na = rt(lambda r: r["product_class"] == "fasteners" and r["packaging_spec"] == "PB-2")
    b, nb = rt(lambda r: r["product_class"] == "fasteners" and r["packaging_spec"] != "PB-2")
    trend.append(dict(month=mo, pb2_rate=a, pb2_n=na, other_rate=b, other_n=nb))
dump("seeded_test", dict(spec_change=SPEC_CHANGE, tests=seeds, trend=trend))

# ---------- 4. review queue + coverage/precision curve ----------
allc = list(bulk.values())
queue = [c for c in allc if c["confidence"] < REVIEW_THRESHOLD]
curve = []
for t in [0.5, 0.6, 0.7, 0.8, 0.9]:
    auto = [c for c in syn_cls if c["confidence"] >= t]
    acc = sum(c["failure_mode"] == frame[c["id"]]["true_mode"] for c in auto) / len(auto) if auto else None
    curve.append(dict(threshold=t, coverage=round(len(auto) / max(len(syn_cls), 1), 3), precision=round(acc, 3) if acc is not None else None))
def txt(c): return (frame[c["id"]]["note"] if c["id"] in frame else public[c["id"]]["text"])[:400]
dump("review_queue", dict(threshold=REVIEW_THRESHOLD, n_total=len(allc), n_queue=len(queue), share=round(len(queue) / max(len(allc), 1), 3),
    curve=curve, examples=[dict(id=c["id"], source=c["source"], mode=NAME[c["failure_mode"]], conf=c["confidence"],
                                secondary=NAME.get(c.get("secondary_mode")), text=txt(c)) for c in sorted(queue, key=lambda c: c["confidence"])[:12]]))

# ---------- 5. accuracy vs synthetic ground truth (+ reference model, + human gold when present) ----------
def scores(cls_map, ids):
    pairs = [(frame[i]["true_mode"], cls_map[i]["failure_mode"]) for i in ids if i in cls_map and i in frame]
    if not pairs: return None
    acc = sum(t == p for t, p in pairs) / len(pairs)
    per = []
    for m in MODES:
        tp = sum(t == m and p == m for t, p in pairs); fp = sum(t != m and p == m for t, p in pairs); fn = sum(t == m and p != m for t, p in pairs)
        pr = tp / (tp + fp) if tp + fp else None; rc = tp / (tp + fn) if tp + fn else None
        f1 = 2 * pr * rc / (pr + rc) if pr and rc else (0.0 if (tp + fp or tp + fn) else None)
        per.append(dict(mode=m, name=NAME[m], support=tp + fn, precision=pr and round(pr, 3), recall=rc and round(rc, 3), f1=f1 and round(f1, 3)))
    conf = [[sum(t == a and p == b for t, p in pairs) for b in MODES] for a in MODES]
    confusions = Counter((t, p) for t, p in pairs if t != p).most_common(8)
    return dict(n=len(pairs), accuracy=round(acc, 3), macro_f1=round(st.mean([x["f1"] for x in per if x["f1"] is not None]), 3),
                per_mode=per, confusion=conf, labels=MODES,
                top_confusions=[dict(truth=NAME[t], predicted=NAME[p], n=n) for (t, p), n in confusions])
syn_ids = [i for i in frame if frame[i].get("note")]
acc = dict(bulk=scores(bulk, syn_ids), reference=scores(ref, syn_ids))
if ref:
    both = [i for i in syn_ids if i in bulk and i in ref]
    acc["bulk_on_reference_subset"] = scores(bulk, both)
    acc["agreement"] = round(sum(bulk[i]["failure_mode"] == ref[i]["failure_mode"] for i in both) / len(both), 3) if both else None
# error examples for the memo
errs = [c for c in syn_cls if c["failure_mode"] != frame[c["id"]]["true_mode"]]
acc["error_examples"] = [dict(text=frame[c["id"]]["note"][:400], truth=NAME[frame[c["id"]]["true_mode"]], predicted=NAME[c["failure_mode"]], conf=c["confidence"], evidence=c["evidence"])
                         for c in sorted(errs, key=lambda c: -c["confidence"])[:10]]
gold = load("data/gold/gold_labels.jsonl")
if gold:
    g = {r["id"]: r["label"] for r in gold}
    for tag, cm in (("bulk", bulk), ("reference", ref)):
        pairs = [(g[i], cm[i]["failure_mode"]) for i in g if i in cm]
        if pairs: acc[f"gold_{tag}"] = dict(n=len(pairs), accuracy=round(sum(t == p for t, p in pairs) / len(pairs), 3),
                                            public_n=sum(i in public for i in g if i in cm))
dump("accuracy", acc)

# ---------- 6. unit economics ----------
def cost_per_1k(purpose_prefix):
    u = [x for x in usage if x["purpose"].startswith(purpose_prefix)]
    return (round(sum(x["cost_usd"] for x in u) / len(u) * 1000, 2), len(u)) if u else (None, 0)
b, nb = cost_per_1k("classify_bulk"); r, nr = cost_per_1k("classify_reference")
scale = [dict(credits_per_month=n, bulk_usd=round(n / 1000 * b) if b else None, reference_usd=round(n / 1000 * r) if r else None) for n in (10_000, 50_000, 200_000)]
dump("economics", dict(bulk_per_1k=b, bulk_calls=nb, reference_per_1k=r, reference_calls=nr, scale=scale,
    total_spend_usd=round(sum(x["cost_usd"] for x in usage), 2), by_purpose={k: round(v, 2) for k, v in Counter({}).items()} or
    {p: round(sum(x["cost_usd"] for x in usage if x["purpose"] == p), 2) for p in sorted({x["purpose"] for x in usage})}))

dump("summary", dict(public_classified=len(pub_cls), synthetic_classified=len(syn_cls), synthetic_total=len(frame),
    reference_classified=len(ref), review_threshold=REVIEW_THRESHOLD, models=dict(bulk="claude-sonnet-5", reference="claude-opus-5")))
print("wrote", sorted(p.name for p in OUT.glob("*.json")))
print("public:", len(pub_cls), "synthetic:", len(syn_cls), "| bulk acc:", acc["bulk"] and acc["bulk"]["accuracy"], "| seeds:", [(s["llm"]["lift"], s["keyword"]["lift"]) for s in seeds])
