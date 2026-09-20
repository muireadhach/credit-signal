"""Classify free-text credit notes / reviews into the failure taxonomy.

Output per record: failure mode, confidence, the quoted evidence, where in the chain the
problem most likely originated, and an optional secondary mode. Low-confidence results
are routed to a human review queue downstream -- the model is allowed to say "unclear".
"""
import argparse, json, sys
from pathlib import Path
from typing import Literal, Optional
from pydantic import BaseModel, Field
import yaml, anthropic
sys.path.insert(0, "pipeline"); import llm

TAX = yaml.safe_load(open("taxonomy/failure_modes.yaml"))
MODE_IDS = [m["id"] for m in TAX["failure_modes"]]
ModeId = Literal[tuple(MODE_IDS)]  # type: ignore

class Extraction(BaseModel):
    failure_mode: ModeId
    confidence: float = Field(ge=0, le=1, description="Calibrated: 0.9+ only when the text is unambiguous")
    evidence: str = Field(description="Short verbatim quote from the text that supports the classification")
    origin_stage: Literal["manufacturing", "storage_handling", "fulfillment", "in_service", "customer_side", "unclear"]
    secondary_mode: Optional[ModeId] = None
    timing: Optional[Literal["first_use", "in_service", "unknown"]] = Field(None, description="For functional_failure only: did it fail on first use, or after working for a while?")
    part_type_mentioned: Optional[str] = None

def build_system():
    lines = ["You classify customer complaints about industrial parts into ONE primary failure mode.",
             "Taxonomy (id -- name -- how customers describe it):"]
    for m in TAX["failure_modes"]:
        ex = "; ".join(f'"{p}"' for p in m["phrasings"]) or "anything that does not fit, or where the cause is the customer's own selection/application"
        lines.append(f"- {m['id']} -- {m['name']} -- {ex}")
    lines += ["",
        "Where problems originate (origin_stage):",
        "- manufacturing: the part was made wrong (dimensions, threads cut badly, material, finish, burrs, coating, mechanism assembled wrong).",
        "- storage_handling: the part was fine when made but degraded or was marred before shipping (rust in the warehouse, aged rubber, scuffs from bulk handling).",
        "- fulfillment: the wrong item, wrong count, or damage that happened in packing and transit (crushed cartons, kinked tube, parts rattling loose).",
        "- in_service: the part worked at first and failed early in use.",
        "- customer_side: the customer ordered the wrong thing, misapplied it, or is expressing preference rather than a defect.",
        "- unclear: the text does not say.",
        "",
        "Guidance:",
        "- Choose the mode that best explains the PRIMARY reason for the complaint. If two apply, put the second in secondary_mode.",
        "- Distinguish carefully: corrosion_on_arrival (rust/oxide present when opened) vs plating_coating (coating itself defective). thread_damage (physically marred threads) vs thread_mismatch (wrong pitch/class, intact threads). wrong_part (label and contents disagree) vs customer ordering the wrong thing (other_unclear, origin customer_side).",
        "- transit_surface_damage and bent_long_stock are about the shipment; out_of_true is about how the part was made.",
        "- functional_failure covers both 'broke on first use' and 'worked, then failed early'; set timing to first_use, in_service, or unknown. performance_shortfall is different: nothing broke, the part simply does not do the job well enough (sealant that never sealed, adhesive that peels, tool that cannot cut the material, grade too light).",
        "- listing_mismatch: the bag matches the SKU that shipped, but the catalog page (photo, title, description) was wrong. wrong_part: the bag contents do not match the bag's own label. customer_selection: the customer chose or applied the wrong thing and says or implies so.",
        "- value_complaint: it works; the complaint is price versus what you get. non_delivery: nothing arrived.",
        "",
        "Boundary rules (follow these exactly; they are how the human labels were made):",
        "1. listing_mismatch vs performance_shortfall: a PHYSICAL ATTRIBUTE that differs from the listing (thread length, finish, quantity, geometry, size) is listing_mismatch. A RATING the part fails to perform to (load, pressure, temperature, capacity) is performance_shortfall.",
        "2. customer_selection vs performance_shortfall: use customer_selection only when the reviewer does NOT fault the product ('nothing wrong on your end', 'I ordered the wrong one', 'might work for a different setup'). If the reviewer blames the product, even where an expert would call it misapplication, label performance_shortfall and put customer_selection in secondary_mode.",
        "3. customer_selection includes MISUSE of the right part, not only selection of the wrong one, when the reviewer owns the mistake.",
        "4. Symptom vs cause: label by the reviewer's own attribution. Threads that will not mate is thread_mismatch -- unless the reviewer says the listing described a different thread, which is listing_mismatch.",
        "5. Rating missed -- did anything BREAK? A 75 lb dolly that collapsed at 60 lb is functional_failure. A pump that only reaches 2 of its rated 10 psi is performance_shortfall. Structural failure = functional_failure; falling short of a rating = performance_shortfall.",
        "6. customer_selection has a second trigger: the complaint IS the product's defining, advertised behavior (foaming glue that foamed; 5-minute epoxy that set in five minutes; plain steel wool that rusted). Use it even though the reviewer faults the product.",
        "7. thread_damage vs thread_mismatch: binding, forcing, galling, or a nut that starts then jams = thread_damage. Loose, shallow, wobbly, or wrong thread form = thread_mismatch.",
        "8. Specific beats general: if a specific mode fits (zinc screws where corrosion-resistant were described = material_nonconformance), use it over listing_mismatch even when the reviewer says 'not as described'.",
        "- Use other_unclear freely when the text is vague, off-topic, or about price/timing/preference. Do not force a fit.",
        "- confidence is your calibrated probability that failure_mode is correct. Be honest; many notes deserve 0.5-0.7.",
        "- evidence must be a verbatim substring of the text, under 20 words.",
        "",
        "Worked examples (text -> decision):",
        "1. 'Half the 1/4-20 nuts wont go on by hand, the first thread looks smashed flat on one side, came that way in the bag.' -> thread_damage, confidence 0.92, origin manufacturing or storage_handling (pick manufacturing unless transit is stated). Threads physically marred.",
        "2. 'These M8 bolts go in about two turns and bind up. A bolt from our stock goes right in. I think the pitch is wrong.' -> thread_mismatch, 0.9. Threads intact, wrong geometry.",
        "3. 'Rod is 0.505 on the mic, drawing calls 0.500 max, it will not go in the bushing.' -> out_of_tolerance, 0.95, manufacturing.",
        "4. 'Opened the box and the bearings have orange spots and a gritty film, looks like moisture got to them somewhere.' -> corrosion_on_arrival, 0.85, storage_handling. Rust present at unboxing, coating not blamed.",
        "5. 'Zinc is flaking off the washers in the bag and the bare spots are already rusting.' -> plating_coating, 0.88, manufacturing. The coating itself failed; rust is secondary -> secondary_mode corrosion_on_arrival.",
        "6. 'Label on the bag says 3/8-16 x 2 but every bolt in it is 5/16.' -> wrong_part, 0.95, fulfillment.",
        "7. 'I ordered the wrong length, my mistake, can I return these?' -> other_unclear, 0.9, customer_side.",
        "8. 'Bearing feels notchy when I spin it on the bench, never installed.' -> functional_failure, timing first_use, 0.9, manufacturing.",
        "9. 'Ran the coupling for two days on a light conveyor and the spider disintegrated.' -> functional_failure, timing in_service, 0.88, in_service.",
        "10. 'Tube arrived with a kink a foot from the end and the box was crushed on that side.' -> bent_long_stock, 0.9, fulfillment (shipment damage to long stock).",
        "11. 'The handles have scuffs and dents on the show face, nothing separating them in the carton.' -> transit_surface_damage, 0.88, fulfillment.",
        "12. 'The o-rings crack when I stretch them and the belt is stiff and chalky.' -> aged_consumables, 0.9, storage_handling.",
        "13. 'Didn't work for my application, the flow was lower than I needed.' -> customer_selection, 0.6, customer_side. Nothing is defective; the part was not right for the job. If the customer blames the part's rating rather than their choice, performance_shortfall.",
        "14. 'Not happy with these. Poor quality.' -> other_unclear, 0.4. Too vague for any specific mode.",
        "15. 'Pack of 50 had 46 and the set screws were missing from the kit.' -> short_count, 0.95, fulfillment.",
        "16. 'Every washer has a sharp flashing edge on the punched side, drew blood on the first one.' -> burrs_finish, 0.92, manufacturing.",
        "17. 'The 304 plate sticks to a magnet hard and cuts way softer than stainless should.' -> material_nonconformance, 0.85, manufacturing. If the customer stresses the label says 304 and contents are clearly a different material, wrong_part is the secondary_mode.",
        "18. 'Shaft rocks on the surface plate, will not spin true in the chuck.' -> out_of_true, 0.9, manufacturing.",
        "19. 'Put the leak sealer in per the directions and the drip never stopped. Tried twice.' -> performance_shortfall, 0.85, unclear. It did not break; it did not perform.",
        "20. 'The picture shows a fully threaded bolt. What I got is threaded an inch and a half. Bag label matches the SKU.' -> listing_mismatch, 0.9, customer_side origin is wrong here: use unclear; the fault is the catalog page.",
        "21. 'I misread the listing and ordered 1/4 NPT when I needed 1/4 BSPP. Can I exchange?' -> customer_selection, 0.95, customer_side.",
        "22. 'They work fine but forty dollars for six of these is robbery.' -> value_complaint, 0.9, customer_side.",
        "23. 'Ordered three weeks ago, tracking still says label created, nothing has arrived.' -> non_delivery, 0.95, fulfillment.",
        "24. 'The foil tape is so thin it tears coming off the roll and the liner will not release.' -> performance_shortfall, 0.7, manufacturing; secondary other_unclear. Grade too light for the job, plus a defect-like symptom.",
        "",
        "Calibration: 0.9+ means a reviewer would agree without reading twice. 0.7-0.89 means clear primary mode with a plausible alternative. 0.5-0.69 means genuinely ambiguous. Below 0.5 means you are guessing; prefer other_unclear."]
    return "\n".join(lines)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["bulk", "reference", "cheap"], default="bulk")
    ap.add_argument("--source", choices=["public", "synthetic", "both", "clean"], default="both")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ids", help="file of record ids to classify (e.g. the gold set)")
    a = ap.parse_args()
    model = {"bulk": llm.BULK, "reference": llm.REFERENCE, "cheap": llm.CHEAP}[a.model]
    out_path = Path(f"data/processed/classified_{a.model}.jsonl")
    done = {r["id"] for r in map(json.loads, open(out_path)) if "error" not in r} if out_path.exists() else set()

    records = []
    if a.source in ("public", "both"):
        records += [dict(id=r["id"], source="public_review", text=r["text"]) for r in map(json.loads, open("data/processed/public_sample.jsonl"))]
    if a.source == "clean":
        records += [dict(id=r["id"], source="public_review_clean", text=r["text"]) for r in map(json.loads, open("data/gold/clean_pool.jsonl"))]
    if a.source in ("synthetic", "both"):
        records += [dict(id=r["credit_id"], source="synthetic_credit", text=r["note"]) for r in map(json.loads, open("data/processed/synthetic_frame.jsonl")) if r.get("note")]
    if a.ids:
        keep = {l.strip() for l in open(a.ids) if l.strip()}; records = [r for r in records if r["id"] in keep]
    records = [r for r in records if r["id"] not in done]
    if a.limit: records = records[:a.limit]
    print(f"model={model} classifying {len(records)} records (skipping {len(done)} already done)")

    system = build_system()
    from concurrent.futures import ThreadPoolExecutor
    def one(r):
        try:
            x = llm.call_json(model, system, f"Text:\n\"\"\"\n{r['text']}\n\"\"\"", Extraction, max_tokens=1500,
                              purpose=f"classify_{a.model}", effort="low")
            return dict(id=r["id"], source=r["source"], model=model, **x.model_dump())
        except anthropic.BadRequestError as e:
            if "credit balance" in str(e): raise SystemExit(f"STOP: API credit balance exhausted ({r['id']})")
            return dict(id=r["id"], source=r["source"], model=model, error=str(e)[:200])
        except Exception as e:
            return dict(id=r["id"], source=r["source"], model=model, error=str(e)[:200])
    with ThreadPoolExecutor(max_workers=6) as ex, open(out_path, "a") as f:
        for i, res in enumerate(ex.map(one, records), 1):
            f.write(json.dumps(res) + "\n")
            if i % 100 == 0: print(f"  {i}/{len(records)}  spend ${llm.total_cost():.2f}", flush=True)
    errs = sum(1 for l in open(out_path) if "error" in json.loads(l))
    print(f"done -> {out_path} | errors in file: {errs} | total spend ${llm.total_cost():.2f}")

if __name__ == "__main__": main()
