"""Synthetic credit-memo layer.

Phase 1 (this file, `--frame`): build the METADATA for ~1,500 credit records -- product
class, packaging spec, carrier, origin DC, date, credit amount -- and a hidden ground-truth
failure mode drawn from realistic base rates PLUS two deliberately seeded patterns:

  Seed A (primary):   fasteners shipped in bulk poly bags (PB-2) after a spec change in
                      May 2026 show ~4x the thread-damage rate. Mechanism: large fasteners
                      loose in a bulk bag chew each other's threads in transit.
  Seed B (secondary): DC-4 ships aged elastomers/consumables at ~3x the rate (stock rotation).

The free-text note for each record is written later by an LLM that sees ONLY the failure
mode and product class -- never the packaging, carrier, or DC. So any correlation the
pipeline later finds between extracted failure mode and metadata is real signal, not leakage.

This is synthetic and is labeled as such everywhere it appears.
"""
import argparse, json, math, random, datetime as dt
import yaml

random.seed(20260919)
TAX = yaml.safe_load(open("taxonomy/failure_modes.yaml"))
MODES = [m["id"] for m in TAX["failure_modes"]]

N = 1500
START, END = dt.date(2025, 9, 1), dt.date(2026, 8, 31)
SPEC_CHANGE = dt.date(2026, 5, 1)          # PB-2 rollout for fasteners

PRODUCT_CLASSES = {  # share of credits
    "fasteners": .28, "raw_stock": .12, "bearings_power_transmission": .12,
    "fluid_pneumatic": .12, "seals_elastomers": .10, "tools_abrasives": .10,
    "hardware_casters": .08, "adhesives_consumables": .08,
}
CREDIT_MEDIAN = {"fasteners": 35, "raw_stock": 180, "bearings_power_transmission": 90,
    "fluid_pneumatic": 120, "seals_elastomers": 25, "tools_abrasives": 85,
    "hardware_casters": 110, "adhesives_consumables": 40}

# Relative likelihood of each failure mode given product class (0 = implausible).
W = {
 "fasteners":                  dict(thread_damage=4, out_of_tolerance=2, thread_mismatch=4, burrs_finish=3, material_nonconformance=3, plating_coating=4, corrosion_on_arrival=4, wrong_part=5, short_count=4, premature_failure=3, other_unclear=3),
 "raw_stock":                  dict(out_of_tolerance=6, out_of_true=6, material_nonconformance=4, corrosion_on_arrival=4, transit_surface_damage=4, bent_long_stock=8, short_count=1, wrong_part=2, burrs_finish=2, other_unclear=3),
 "bearings_power_transmission":dict(out_of_tolerance=4, out_of_true=3, corrosion_on_arrival=3, transit_surface_damage=2, doa_mechanism=8, premature_failure=5, wrong_part=3, short_count=1, other_unclear=3),
 "fluid_pneumatic":            dict(thread_damage=2, thread_mismatch=4, doa_mechanism=8, premature_failure=4, wrong_part=3, short_count=2, transit_surface_damage=2, burrs_finish=1, other_unclear=3),
 "seals_elastomers":           dict(aged_consumables=8, out_of_tolerance=3, wrong_part=4, short_count=3, doa_mechanism=2, premature_failure=3, other_unclear=3),
 "tools_abrasives":            dict(doa_mechanism=5, premature_failure=6, burrs_finish=2, transit_surface_damage=3, wrong_part=3, short_count=2, material_nonconformance=2, other_unclear=3),
 "hardware_casters":           dict(doa_mechanism=7, premature_failure=4, transit_surface_damage=3, wrong_part=3, short_count=4, plating_coating=2, corrosion_on_arrival=2, other_unclear=3),
 "adhesives_consumables":      dict(aged_consumables=8, wrong_part=3, short_count=3, doa_mechanism=2, other_unclear=4),
}
PACKAGING = {
 "fasteners": {"PB-1": .45, "PB-2": .35, "BX-1": .20},   # PB-2 share overridden by date below
 "raw_stock": {"TB-1": .40, "CR-1": .35, "BX-2": .25},
 "bearings_power_transmission": {"BX-1": .60, "BX-2": .30, "PB-1": .10},
 "fluid_pneumatic": {"BX-1": .60, "PB-1": .25, "BX-2": .15},
 "seals_elastomers": {"PB-1": .70, "ENV": .20, "BX-1": .10},
 "tools_abrasives": {"BX-1": .60, "BX-2": .25, "ENV": .15},
 "hardware_casters": {"BX-2": .50, "BX-1": .40, "PB-1": .10},
 "adhesives_consumables": {"BX-1": .60, "PB-1": .20, "ENV": .20},
}
CARRIERS = {"Carrier-A": .35, "Carrier-B": .30, "Carrier-C": .20, "Carrier-D": .10, "Freight-LTL": .05}
DCS = {"DC-1": .25, "DC-2": .22, "DC-3": .20, "DC-4": .18, "DC-5": .15}

def pick(d):
    r, acc = random.random() * sum(d.values()), 0
    for k, v in d.items():
        acc += v
        if r <= acc: return k
    return k

def build_frame():
    rows = []
    span = (END - START).days
    for i in range(N):
        date = START + dt.timedelta(days=random.randint(0, span))
        pc = pick(PRODUCT_CLASSES)
        pk = dict(PACKAGING[pc])
        if pc == "fasteners":                       # PB-2 rollout: share rises after spec change
            pk["PB-2"] = .45 if date >= SPEC_CHANGE else .22
            pk["PB-1"] = .90 - pk["PB-2"] - .20
        pkg = pick(pk)
        carrier, dc = pick(CARRIERS), pick(DCS)
        w = dict(W[pc])
        # --- seeded patterns (metadata -> mode; text never sees metadata) ---
        if pc == "fasteners" and pkg == "PB-2":
            w["thread_damage"] *= (4.0 if date >= SPEC_CHANGE else 1.3)          # Seed A
        if dc == "DC-4" and "aged_consumables" in w:
            w["aged_consumables"] *= 3.0                                          # Seed B
        if carrier == "Carrier-C":                                                # weak, may not clear significance
            for k in ("transit_surface_damage", "bent_long_stock"):
                if k in w: w[k] *= 1.5
        mode = pick(w)
        credit = round(math.exp(math.log(CREDIT_MEDIAN[pc]) + random.gauss(0, .7)), 2)
        order_value = round(credit * random.uniform(1.0, 6.0), 2)
        rows.append(dict(credit_id=f"CR-{100000+i}", date=date.isoformat(), product_class=pc,
                         packaging_spec=pkg, carrier=carrier, origin_dc=dc,
                         credit_amount=credit, order_value=order_value,
                         line_down=random.random() < .3,
                         true_mode=mode, note=None))
    return rows

def seeded_lift(rows):
    def rate(f):
        s = [r for r in rows if f(r)]
        return sum(r["true_mode"] == "thread_damage" for r in s) / max(len(s), 1), len(s)
    post = lambda r: r["date"] >= SPEC_CHANGE.isoformat()
    a, na = rate(lambda r: r["product_class"] == "fasteners" and r["packaging_spec"] == "PB-2" and post(r))
    b, nb = rate(lambda r: r["product_class"] == "fasteners" and r["packaging_spec"] != "PB-2")
    c, nc = rate(lambda r: r["product_class"] == "fasteners" and r["packaging_spec"] == "PB-2" and not post(r))
    return dict(pb2_post=(round(a, 3), na), non_pb2=(round(b, 3), nb), pb2_pre=(round(c, 3), nc), lift=round(a / b, 2))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--frame", action="store_true"); a = ap.parse_args()
    rows = build_frame()
    with open("data/processed/synthetic_frame.jsonl", "w") as f:
        for r in rows: f.write(json.dumps(r) + "\n")
    from collections import Counter
    print("records:", len(rows)); print("modes:", Counter(r["true_mode"] for r in rows).most_common())
    lift = seeded_lift(rows); print("Seed A ground-truth lift:", lift)
    assert lift["lift"] >= 3.0, "seeded pattern too weak"
    print("GATE PASS: seeded lift >= 3x on ground truth")
