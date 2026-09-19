"""Phase 2 of the synthetic layer: write the free-text note for each credit record.

The model sees ONLY the failure mode and product class for each record -- never packaging,
carrier, DC, or date. The seeded patterns live in metadata the writer cannot see, so
nothing about them can leak into the text.
"""
import argparse, json, random, sys
from pydantic import BaseModel
import yaml
sys.path.insert(0, "pipeline"); import llm

random.seed(3)
TAX = yaml.safe_load(open("taxonomy/failure_modes.yaml"))
MODE = {m["id"]: m for m in TAX["failure_modes"]}
PC_NAME = {"fasteners": "fasteners (bolts, screws, nuts, washers, threaded rod)",
           "raw_stock": "raw stock (bar, rod, tube, sheet, plate)",
           "bearings_power_transmission": "bearings, shafts, pulleys, couplings, gears",
           "fluid_pneumatic": "valves, fittings, gauges, pneumatic components",
           "seals_elastomers": "o-rings, gaskets, belts, rubber parts",
           "tools_abrasives": "hand tools, cutting tools, abrasives",
           "hardware_casters": "casters, hinges, latches, handles, general hardware",
           "adhesives_consumables": "adhesives, tapes, lubricants, other consumables"}
INDUSTRIES = ["a job shop", "an HVAC contractor", "a food processing plant", "a university research lab", "a farm equipment repair shop",
              "a robotics startup", "a sign and display fabricator", "a municipal water utility", "a marine repair yard", "an aerospace prototype shop",
              "a packaging line at a bottling plant", "a theater scene shop", "a semiconductor fab facilities team", "a 3D-printing service bureau",
              "a bike frame builder", "a hospital facilities department", "an oil and gas field service crew", "a CNC contract manufacturer"]
ASKS = ["wants a credit", "wants replacements shipped", "wants someone to call them", "is asking for an RMA", "just wants it noted",
        "wants a credit and is annoyed", "wants a replacement and is polite about it", "is unsure what they want"]
VOICES = ["a machinist", "a maintenance tech at a plant", "a purchasing agent relaying what the floor told them",
          "a small shop owner", "a facilities manager", "an engineer building a prototype", "a lab tech"]

class Note(BaseModel):
    idx: int
    text: str
class Batch(BaseModel):
    notes: list[Note]

SYSTEM = """You write realistic free-text notes attached to customer credit requests at an industrial parts distributor. Each note is what the customer said (by email, phone transcript, or web form) about why they want a credit.

Rules:
- Write in the voice given for each item. Vary length (1 to 4 sentences), tone (matter-of-fact, irritated, apologetic, terse), and vocabulary. Some notes are sloppy: lowercase, typos, run-ons. A few are formal.
- Describe the PROBLEM the way that person would actually describe it. Never use the category label you are given; describe symptoms and what they saw or measured.
- Mention the specific part type in roughly 70% of notes; be vague in the rest.
- About 15% of notes include an unrelated aside (delivery timing, price, a previous order, a compliment).
- For "Other / unclear", write notes that are genuinely ambiguous, off-topic, or where the customer's own error is the likely cause (ordered wrong size themselves, changed mind, application mismatch) without saying so directly.
- Make some notes hard: symptoms that could plausibly be read as a neighboring category.
- Use the industry context to pick a plausible specific part, size, and application; do not repeat the same part/size across items.
- Do not invent order numbers, dates, carriers, warehouses, or packaging details.
Return one note per item, keyed by idx."""

def prompt(items):
    lines = []
    for r in items:
        m = MODE[r["true_mode"]]
        ex = "; ".join(m["phrasings"][:2]) if m["phrasings"] else "n/a"
        lines.append(f'idx={r["_i"]} | voice: {random.choice(VOICES)} at {random.choice(INDUSTRIES)}, {random.choice(ASKS)} | '
                     f'part type: {PC_NAME[r["product_class"]]} | problem category (never name it): {m["name"]} | style inspiration, do not copy: {ex}')
    return "Write notes for these items:\n" + "\n".join(lines)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=0); ap.add_argument("--batch", type=int, default=20)
    a = ap.parse_args()
    rows = [json.loads(l) for l in open("data/processed/synthetic_frame.jsonl")]
    for i, r in enumerate(rows): r["_i"] = i
    todo = [r for r in rows if not r.get("note")]
    if a.limit: todo = todo[:a.limit]
    print(f"writing notes for {len(todo)} records in batches of {a.batch}")
    from concurrent.futures import ThreadPoolExecutor
    def run(batch):
        out = llm.call_json(llm.REFERENCE, SYSTEM, prompt(batch), Batch, max_tokens=6000, purpose="synthetic_notes", effort="medium")
        got = {n.idx: n.text for n in out.notes}
        for r in batch:
            if r["_i"] in got: r["note"] = got[r["_i"]].strip()
        return sum(r.get("note") is not None for r in batch)
    batches = [todo[i:i+a.batch] for i in range(0, len(todo), a.batch)]
    with ThreadPoolExecutor(max_workers=4) as ex:
        done = sum(ex.map(run, batches))
    for r in rows: r.pop("_i", None)
    with open("data/processed/synthetic_frame.jsonl", "w") as f:
        for r in rows: f.write(json.dumps(r) + "\n")
    print(f"notes written: {done} | still missing: {sum(r.get('note') is None for r in rows)} | spend so far: ${llm.total_cost():.2f}")
