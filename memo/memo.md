# Credit Signal — decision memo

**Subject:** Finding the root causes behind customer credits with a language model, and what it would take to run it for real
**Prepared by:** [Name] · September 2026
**Status:** Portfolio prototype on public and disclosed synthetic data. Not McMaster-Carr data.

---

## 1. Summary

Customer credits are a symptom log. Each one carries a coarse reason code and a sentence of free text that says what actually happened. At volume, nobody reads the sentence, so the same failure gets credited repeatedly instead of fixed once.

I built a pipeline that reads the free text with a language model, extracts a specific failure mode from a 15-item taxonomy written from shop experience, joins it to the metadata an order system already holds, and ranks causes by what they cost the customer in **downtime** rather than what was refunded. Low-confidence results go to a person.

Tested against a known answer: two patterns were seeded into synthetic credit records; the notes were written by a model that never saw the seeded fields. The pipeline recovered the primary pattern at **▢× lift** (keyword search: ▢×). Accuracy against my own hand labels on 200 records: **▢%**. Cost: about **▢ per thousand records** on the bulk model.

**Recommendation if this were real:** a four-week pilot on six months of credit history, hand-labeled by two CS reps to set the confidence threshold, with the top three causes taken to the teams that own them and one metric agreed in advance — recurrence of the same cause the following quarter.

## 2. The problem, from the customer's side

A $40 credit on a damaged shaft collar is a rounding error on the P&L. The four hours a line sat idle waiting for the reship is not — and it is what the customer remembers. Running a service bureau, I placed those orders and took those deliveries. The credit never captured the cost.

Reason codes ("damaged", "wrong item") cannot distinguish a packaging spec that chews threads from a carrier lane that dents boxes from a warehouse that ships aged o-rings. The distinction lives in the note. That is the gap this closes.

## 3. What was built

| Step | What happens | Model? |
|---|---|---|
| Collect | The customer's own words from the credit request, email, or review. PII redacted before anything reaches a model. | — |
| Extract | One of 15 failure modes, a calibrated confidence, a verbatim evidence quote, and where in the chain it likely originated. Structured output, validated on every record. | Yes |
| Join | Product class, packaging spec, carrier, origin DC, date, credit amount from the order system. | — |
| Rank & test | Count, dollars, expected downtime. Lift and significance for every metadata cut. Trend by month. | — |
| Route | Confident results file automatically; uncertain ones go to a reviewer whose labels feed the next accuracy check. | — |

The taxonomy (thread damage, out-of-tolerance, wrong part in the right bag, short count, bent long stock, aged elastomers, corrosion on arrival, …) is mine, from years of receiving parts. It is in `taxonomy/failure_modes.yaml` with the phrasings customers actually use.

## 4. Data, and what it can and cannot prove

**Real:** 2,000 one- and two-star reviews of industrial products from a public academic dataset (Amazon Reviews 2023, Industrial & Scientific, UCSD). Genuine language; no credit amounts, carriers, or warehouses.

**Synthetic:** 1,500 credit records with product class, packaging spec, carrier, origin DC, date, and credit amount, mimicking the structure a distributor holds. Notes written by a model that saw only the failure mode and product class. Two patterns seeded deliberately:

- **Seed A.** Fasteners in bulk poly bags (PB-2) after a May spec change: thread damage at ~4× the base rate. Mechanism: large fasteners loose in a bulk bag chew each other's threads in transit.
- **Seed B.** Elastomers and consumables from DC-4: aged-stock failures at ~3×. Mechanism: stock rotation.

A third cut (Carrier-C transit damage) was given only a weak nudge, to see whether the method would correctly report "not significant."

**What this proves:** the method recovers a known signal from language alone. **What it does not prove:** what any real credit dataset contains. The synthetic layer is labeled as synthetic everywhere it appears.

## 5. Findings

### 5.1 Ranking by refund and ranking by customer impact disagree

▢ *[table: top 8 modes, rank by credit $, rank by impact, movers]*

Downtime hours per mode are my estimate (`impact_weights.yaml`), shown at $500/hour with sensitivity at $250 and $1,500. The point is not the exact number; it is that the order changes, and the modes that rise are the ones that stop work for a day: wrong part in the bag, bent long stock, material nonconformance.

### 5.2 The pattern keyword search misses

▢ *[Seed A: LLM lift ▢× (p ▢) vs keyword ▢× (p ▢); trend chart shows the May step]*

"Damaged" matches dents, corrosion, kinked tube, and thread damage alike; the specific signal is diluted. Extraction isolates thread damage across a dozen phrasings and the packaging correlation appears. Seed B: ▢× (p ▢). Carrier-C: ▢× (p ▢) — reported as not significant, which is the correct answer.

### 5.3 Coverage vs. precision

▢ *[curve: threshold 0.5–0.9 → coverage %, precision %]*

At a 0.7 threshold, ▢% of records file automatically at ▢% precision; ▢% go to review. The reviewer sees the model's evidence quote and a suggested mode, which makes a review take seconds rather than a full read.

### 5.4 Accuracy, three ways

| Check | n | Accuracy |
|---|---|---|
| Bulk model vs. synthetic ground truth | ▢ | ▢% |
| Reference model vs. synthetic ground truth | ▢ | ▢% |
| Bulk model vs. human gold set (150 real reviews + 50 synthetic) | 200 | ▢% |
| Cheap model vs. human gold set | 200 | ▢% |

Top confusions: ▢. These are neighbors an experienced reviewer would also debate (corrosion on arrival vs. plating failure; wrong part vs. thread mismatch).

### 5.5 Cost

| | Per 1,000 records | 50,000 credits/month |
|---|---|---|
| Bulk (Sonnet 5) | ▢ | ▢ |
| Reference (Opus 5) | ▢ | ▢ |

Whole project: under $25. One lesson worth the price: the cheapest model per token (Haiku 4.5) will not cache a prompt under 4,096 tokens, so it cost *more per record* than Sonnet with caching. Cheaper per token is not cheaper per record.

## 6. What I would do with the top three causes

*Illustrative, based on the synthetic findings — the shape of the action matters more than the specifics.*

| Cause | Owner | Fix | Metric that says it worked |
|---|---|---|---|
| Thread damage · bulk-bag fasteners · post-May | Packaging engineering | Revert PB-2 for fastener SKUs above a size threshold, or add a divider. Test on the top 20 SKUs by credit count. | Thread-damage credits on those SKUs, next 8 weeks, vs. the 8 before |
| Aged elastomers · DC-4 | DC operations + inventory | FIFO audit on elastomer bins; date-code check at pick. | Aged-consumable credits from DC-4 vs. other DCs |
| Wrong part in the right bag | Fulfillment QA | Trace to the bagging line or supplier lot; add a scan-verify at bagging for the top 50 SKUs. | Wrong-part credits per 10k lines shipped |

North-star metric for the program: **credit recurrence rate** — the share of credits this quarter whose cause was already in last quarter's top ten.

## 7. How to run this on real data

- **Inputs needed:** six months of credits with note text, reason code, product/SKU class, packaging spec, carrier, origin DC, ship and credit dates, credit amount, order value, and a line-down flag if one exists.
- **Privacy:** redact names, emails, phone numbers, and account numbers from the note before it reaches a model. Nothing else in the record is sensitive. Run under the API's standard data-retention terms; no training on inputs.
- **Pilot (4 weeks):** week 1 — load and run; week 2 — two CS reps hand-label 300 records, set the threshold from the curve; week 3 — take the top three causes with evidence quotes to the owning teams; week 4 — agree the metric and the review cadence.
- **What it would cost:** at ▢ per thousand records, a year of credits is a few hundred dollars. The reviewer time is the real cost, and the threshold controls it.
- **What to expect:** the first run finds things people already suspected and could not prove. That is the useful outcome — proof is what moves packaging engineering.

## 8. Limitations

- The synthetic notes and the classifier are both Claude models. The human gold set is the check on that circularity; the public reviews are the check on the language.
- The public reviews skew consumer. The industrial share is real; the mix is not a distributor's.
- Downtime estimates are mine. The toggle in the demo exists so that assumption is visible, not buried.
- The taxonomy has 15 modes because that is what I have seen. A real dataset will want a few I have not.
- The seeded test proves the method finds a known signal; it says nothing about what a real dataset contains.

## 9. Why I built it this way

Static demo, no runtime model calls, no framework: the analysis runs once, the page serves results, and the whole thing deploys anywhere static files do. Every design choice here is one I can explain and defend, which was a constraint I set for myself.

*Demo: ▢ · Repository: ▢*
