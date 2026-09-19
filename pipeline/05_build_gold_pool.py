"""Assemble the gold-set pool for hand labeling: 150 public reviews + 50 synthetic notes,
drawn at random, and bake them into a self-contained labeling page (tools/label.html).
The human labels are the only accuracy check on the public data, and they check that the
synthetic ground truth is what a person would also say."""
import json, random, yaml
random.seed(2026)
TAX = yaml.safe_load(open("taxonomy/failure_modes.yaml"))
pub = [json.loads(l) for l in open("data/processed/public_sample.jsonl")]
syn = [json.loads(l) for l in open("data/processed/synthetic_frame.jsonl")]
syn = [r for r in syn if r.get("note")]
pool = [dict(id=r["id"], source="public_review", text=r["text"]) for r in random.sample(pub, 150)] + \
       [dict(id=r["credit_id"], source="synthetic_credit", text=r["note"]) for r in random.sample(syn, 50)]
random.shuffle(pool)
with open("data/gold/gold_pool.jsonl", "w") as f:
    for r in pool: f.write(json.dumps(r) + "\n")
with open("data/gold/gold_ids.txt", "w") as f: f.write("\n".join(r["id"] for r in pool) + "\n")
modes = [dict(id=m["id"], name=m["name"]) for m in TAX["failure_modes"]]
html = open("tools/label_template.html").read().replace("__POOL__", json.dumps(dict(records=pool, modes=modes)).replace("</", "<\\/"))
open("tools/label.html", "w").write(html)
print(f"gold pool: {len(pool)} records -> tools/label.html")
