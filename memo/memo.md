# Credit Signal — decision memo

**Subject:** Finding the root causes behind customer credits with a language model, and what it would take to run it for real
**Prepared by:** Muireadhach Currie · September 2026
**Status:** Portfolio prototype on public and disclosed synthetic data. Not McMaster-Carr data.

---

## 1. Summary

Customer credits are a symptom log. Each one carries a coarse reason code and a sentence of free text that says what actually happened. At volume, nobody reads the sentence, so the same failure gets credited repeatedly instead of fixed once.

I built a pipeline that reads the free text with a language model, extracts a specific failure mode from a 15-item taxonomy written from shop experience, joins it to the metadata an order system already holds, and ranks causes by what they cost the customer in **downtime** rather than what was refunded. Low-confidence results go to a person.

Tested against a known answer: two patterns were seeded into synthetic credit records; the notes were written by a model that never saw the seeded fields. A blind scan of 256 failure-mode × metadata cells ranked the primary seeded pattern **#1**, at **3.6× lift** (p < 0.00001) — the only cell to survive correction for multiple comparisons. A generic search for "damaged" finds no signal at all. Accuracy against synthetic ground truth: **94.3%** on the bulk model, **96.4%** on the reference model; against my own hand labels on 200 records: **▢%** (labeling in progress). Cost: **$2.06 per thousand records** on the bulk model.

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

| Failure mode | Credits | Refunded | Rank by refund | Rank by impact | Est. customer impact |
|---|---|---|---|---|---|
| Premature failure in service | 118 | $13,545 | #3 | **#1** | $710k |
| Wrong part in the right bag | 171 | $16,015 | #2 | #2 | $484k |
| Material or hardness nonconformance | 102 | $11,795 | #6 | **#3** | $444k |
| Short count or missing components | 153 | $11,945 | #5 | #4 | $309k |
| Assembly or mechanism failure on first use | 153 | $16,944 | **#1** | #5 | $308k |
| Bent or crushed long stock | 35 | $9,343 | #10 | **#6** | $168k |
| Aged or degraded elastomers & consumables | 126 | $5,138 | #13 | **#7** | $127k |
| Out of straight, flat, or round | 57 | $9,603 | #9 | #8 | $112k |

Across 1,500 credits: $156k refunded, roughly $3.0M in estimated customer downtime at $500/hour. The ratio is the assumption to test first — but even at $250/hour the order above holds.

Downtime hours per mode are my estimate (`impact_weights.yaml`), shown at $500/hour with sensitivity at $250 and $1,500. The point is not the exact number; it is that the order changes, and the modes that rise are the ones that stop work for a day: wrong part in the bag, bent long stock, material nonconformance.

### 5.2 The pattern keyword search misses

| Method | Lift | p |
|---|---|---|
| Seeded (hidden ground truth) | 4.1× | — |
| LLM extraction | **3.6×** | < 0.00001 |
| Generic search ("damaged", "broke", "bent", "dent", "defect") | no signal | 0.76 |
| Regex tuned to thread damage, written after you suspect it | 4.5× | < 0.00001 |

The trend chart in the demo shows the step in May. Two things worth saying plainly. First, generic damage words appear in under 1% of these notes — customers describe symptoms ("wouldn't start the nut"), not categories. Second, a regex written *after* you know what to look for works fine; that is not a weakness of regex, it is the definition of the problem. The model checks all 15 modes at once with no hypothesis, and the blind scan below is the real test.

"Damaged" matches dents, corrosion, kinked tube, and thread damage alike; the specific signal is diluted. **The blind scan.** Every failure mode × every packaging spec, carrier, and warehouse, within each product class: 256 cells, ranked by significance, with no one telling the scan where the seeds were. The seeded PB-2 cell ranked #1. After Bonferroni correction (p < 0.0002), it was the *only* survivor — seven other cells looked interesting at p < 0.01 and would have been chased on a smaller dataset. Stratifying by product class matters: without it, packaging just proxies product (long stock ships in crates; crates "cause" bent tube).

**Seed B** was seeded too weakly to matter (ground truth 1.5×) and the method correctly does not claim it: 1.3×, p = 0.07, rank 32 of 256. **Carrier-C** was given only a nudge (1.2×) and comes back 1.2×, p = 0.24 — not significant, which is the right answer. A method that only ever says "yes" is not a method.

### 5.3 Coverage vs. precision

| Confidence threshold | Auto-filed (coverage) | Precision of auto-filed |
|---|---|---|
| ≥ 0.5 | 98% | 94.6% |
| ≥ 0.6 | 94% | 96.4% |
| ≥ 0.7 | 91% | 97.5% |
| ≥ 0.8 | 80% | 99.5% |
| ≥ 0.9 | 44% | 100% |

At 0.8, four in five records file automatically and 199 of every 200 are right; the fifth goes to a person. On the real reviews — messier than the synthetic notes — about one in five falls below 0.6. The reviewer sees the model's evidence quote and a suggested mode, which makes a review take seconds rather than a full read.

### 5.4 Accuracy, three ways

| Check | n | Accuracy |
|---|---|---|
| Bulk model (Sonnet 5) vs. synthetic ground truth | 1,500 | 94.3% (macro-F1 0.95) |
| Reference model (Opus 5) vs. synthetic ground truth | 550 | 96.4% (macro-F1 0.97) |
| Bulk model on the same 550 | 550 | 94.2% — agreement with reference 96.7% |
| Bulk model vs. human gold set (150 real reviews + 50 synthetic) | 200 | ▢% (in progress) |
| Haiku 4.5 vs. human gold set | 200 | ▢% (in progress) |

Top confusions: premature failure → material nonconformance (19 — "snapped at half the rated torque" is both); other/unclear → aged elastomers (13); other/unclear → material nonconformance (12); mechanism failure on first use → aged elastomers (8). These are neighbors an experienced reviewer would also debate (corrosion on arrival vs. plating failure; wrong part vs. thread mismatch).

### 5.5 Cost

| | Per 1,000 records | 50,000 credits/month |
|---|---|---|
| Bulk (Sonnet 5) | $2.06 | $103 |
| Reference (Opus 5) | $5.58 | $279 |
| Haiku 4.5 (uncached) | $2.37 | $119 |

Whole project: $20.47, including a $3 run I threw away. One lesson worth the price: the cheapest model per token (Haiku 4.5) will not cache a prompt under 4,096 tokens, so it cost *more per record* than Sonnet with caching. Cheaper per token is not cheaper per record.

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
- **What it would cost:** at ~$2 per thousand records, a year of 50,000 credits a month is about $1,200 in model calls. The reviewer time is the real cost, and the threshold controls it.
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
