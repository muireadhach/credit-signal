# Credit Signal decision memo

**Subject:** Finding the root causes behind customer credits with a language model, and what it would take to run it for real  
**Prepared by:** Muireadhach Currie · September 2026  
**Status:** Portfolio prototype on public and disclosed synthetic data. Not McMaster-Carr data.  
**Built:** A static demo with no framework, plus one small throttled endpoint behind the Try-it box. The analysis runs once, the page serves the results, and it deploys anywhere static files do. I kept it this plain on purpose, so that I can explain and defend every design choice.

---

## 1. Summary

Customer credits are a log of symptoms. Each one carries a coarse reason code and a sentence of free text that says what actually happened. At volume nobody reads the sentence, so the same failure gets credited again and again when it could have been fixed once.

I built a pipeline that reads the free text with a language model and pulls out a specific failure mode from a 20-item taxonomy, which I wrote from shop experience and revised once against real reviews. It joins that to the metadata an order system already holds and ranks causes by what they cost the customer in downtime rather than by what was refunded. Low-confidence results go to a person.

To test the method against a known answer, I seeded two patterns into synthetic credit records. The notes were written by a model that never saw the seeded fields. A blind scan of 247 failure-mode × metadata cells ranked the main seeded pattern #1, at 3.6× lift (p < 0.00001), and it was the only cell to survive correction for multiple comparisons. A generic search for "damaged" finds no signal at all.

Against synthetic ground truth the models score 96–99%. The harder test is agreement with a careful human on real reviews. I labeled 200 records under the original taxonomy, and the reference model (Opus 5) agreed with me 72% of the time. A third of the real complaints had no home in a taxonomy written from a parts-receiving point of view, so I revised it, wrote down the boundary rules, and labeled 100 fresh reviews no one had seen. On those the model scored **78%** with the classifier frozen before I labeled, **85%** with the written guideline, and 97% on the records I was sure of. Model tier matters more on real language than on clean text (Haiku 67%, Sonnet 76%, Opus 85%), and the written guideline added seven points on the one model that could follow it. Cost is **$6.23 per thousand records** on the model I would deploy.

**Recommendation if this were real:** a four-week pilot on six months of credit history. Two CS reps hand-label records to set the confidence threshold. It runs on the reference-tier model, where the extra $4 per thousand records buys nine points of accuracy on real language. The top three causes go to the teams that own them, with one metric agreed in advance: whether the same cause recurs the following quarter.

## 2. The problem, from the customer's side

A $40 credit on a damaged shaft collar is a rounding error on the P&L. The four hours a line sat idle waiting for the reship is what the customer remembers. When I ran a service bureau, I placed those orders and took those deliveries, and the credit never reflected that cost.

Reason codes ("damaged", "wrong item") can't tell a packaging spec that chews threads from a carrier lane that dents boxes or a warehouse that ships aged o-rings. Only the note says which it was, and nobody is reading the notes at scale.

## 3. What was built

| Step | What happens | Model? |
|---|---|---|
| Collect | The customer's own words from the credit request, email, or review. PII redacted before anything reaches a model. | No |
| Extract | One of 20 failure modes, a calibrated confidence, a verbatim evidence quote, and where in the chain it likely originated. Structured output, validated on every record. | Yes |
| Join | Product class, packaging spec, carrier, origin DC, date, credit amount from the order system. | No |
| Rank & test | Count, dollars, expected downtime. Lift and significance for every metadata cut. Trend by month. | No |
| Route | Confident results file automatically; uncertain ones go to a reviewer whose labels feed the next accuracy check. | No |

The taxonomy (thread damage, out-of-tolerance, wrong part in the right bag, short count, bent long stock, aged elastomers, corrosion on arrival, …) is mine, from years of receiving parts. It lives in `taxonomy/failure_modes.yaml` along with the phrasings customers actually use.

## 4. Data, and what it can and cannot prove

**Real:** 2,000 one- and two-star reviews of industrial products from a public academic dataset (Amazon Reviews 2023, Industrial & Scientific, UCSD). The language is genuine, but there are no credit amounts, carriers, or warehouses.

**Synthetic:** 1,500 credit records with product class, packaging spec, carrier, origin DC, date, and credit amount, built to match the structure a distributor holds. A model that saw only the failure mode and product class wrote the notes. I seeded two patterns on purpose:

- **Seed A.** Fasteners in bulk poly bags (PB-2) after a May spec change: thread damage at ~4× the base rate. Mechanism: large fasteners loose in a bulk bag chew each other's threads in transit.
- **Seed B.** Elastomers and consumables from DC-4: aged-stock failures weighted 3× at generation. Mechanism: stock rotation. Aged stock is already the most common failure in that class, so the lift that can actually be measured is only ~1.5×.

I gave a third cut (Carrier-C transit damage) only a weak nudge, to see whether the method would correctly report "not significant."

This setup proves the method can recover a known signal from language alone. It proves nothing about what a real credit dataset contains. The synthetic layer is labeled as synthetic everywhere it appears.

## 5. Findings

### 5.1 Ranking by refund and ranking by customer impact disagree

| Failure mode | Credits | Refunded | Rank by refund | Rank by impact | Est. customer impact |
|---|---|---|---|---|---|
| Functional failure (first use or early in service) | 281 | $30,821 | #1 | #1 | $821k |
| Wrong part in the right bag | 170 | $15,850 | #2 | #2 | $478k |
| Material or hardness nonconformance | 92 | $10,519 | #6 | **#3** | $411k |
| Short count or missing components | 153 | $11,945 | #4 | #4 | $309k |
| Bent or crushed long stock | 36 | $9,686 | #7 | **#5** | $181k |
| Aged or degraded elastomers & consumables | 112 | $4,444 | #14 | **#6** | $116k |
| Out-of-tolerance dimensions | 94 | $12,983 | #3 | #7 | $109k |
| Out of straight, flat, or round | 54 | $8,914 | #9 | #8 | $105k |

Across 1,500 credits, $156k was refunded, and estimated customer downtime comes to roughly $2.9M at $500/hour. The hourly rate is the assumption to test first. At $250/hour the top five are unchanged and only positions 6 and 7 swap. At $1,500/hour nothing moves. At $0 (refund only) the list reverts to the refund column. The demo has this control, so you can check it yourself.

Downtime hours per mode are my estimates (`impact_weights.yaml`), shown at $500/hour with sensitivity at $250 and $1,500. The exact dollar figure matters less than the change in order. The modes that rise are the ones that stop work for a day: material nonconformance, bent long stock, aged elastomers.

### 5.2 The pattern keyword search misses

| Method | Lift | p |
|---|---|---|
| Seeded (hidden ground truth) | 4.1× | n/a |
| LLM extraction | **3.6×** | < 0.00001 |
| Generic search ("damaged", "broke", "bent", "dent", "defect") | no signal | 0.76 |
| Regex tuned to thread damage, written after you suspect it | 4.5× | < 0.00001 |

The trend chart in the demo shows the step in May. Generic damage words appear in under 1% of these notes, because customers describe symptoms ("wouldn't start the nut") rather than categories. When the word "damaged" does appear, it matches dents, corrosion, kinked tube, and thread damage alike, so the specific signal gets diluted. A regex written *after* you know what to look for works fine, but you have to know first, and that is the problem this project is about. The model checks all 20 modes at once with no hypothesis. The blind scan is the real test of that.

The blind scan tested every failure mode against every packaging spec, carrier, and warehouse within each product class: 247 cells, ranked by significance, with nothing telling the scan where the seeds were. The seeded PB-2 cell ranked #1. After Bonferroni correction (p < 0.0002) it was the *only* survivor. Eight other cells looked interesting at p < 0.01 and would have been chased on a smaller dataset. Stratifying by product class matters, because without it packaging just stands in for product (long stock ships in crates, so crates appear to "cause" bent tube).

Seed B was seeded too weakly to matter (ground truth 1.5×), and the method correctly does not claim it: 1.4×, p = 0.03, rank 31 of 247. That misses the p < 0.01 bar for the seeded checks and falls far short of the correction. Carrier-C got only a nudge (1.2×) and comes back at 1.2×, p = 0.24. Not significant is the right answer there.

### 5.3 Coverage vs. precision

| Confidence threshold | Auto-filed (coverage) | Precision of auto-filed |
|---|---|---|
| ≥ 0.5 | 98% | 96.7% |
| ≥ 0.6 | 94% | 97.4% |
| ≥ 0.7 | 91% | 98.0% |
| ≥ 0.8 | 81% | 99.3% |
| ≥ 0.9 | 44% | 100% |

That is the synthetic curve. On real reviews, measured against my labels, the trade is tighter:

| Threshold | Auto-filed (Opus 5) | Precision (Opus 5) | Precision (Sonnet 5) |
|---|---|---|---|
| ≥ 0.6 | 86% | 94% | 83% |
| ≥ 0.7 | 71% | 97% | 88% |
| ≥ 0.8 | 50% | 98% | 94% |

*(100 unseen reviews, taxonomy v2. Under v1 the same 0.7 threshold auto-filed 39% at 90% precision. The model was the same both times, so the taxonomy revision is what moved this.)*

The model's confidence scores hold up on real reviews: when it says 0.8, it is right 49 times in 50. The review queue is still real work. At 0.7, three in ten records go to a person, and that is intended. The reviewer sees a suggested mode and the evidence quote, so each review takes seconds, and every reviewed label feeds the next accuracy check.

### 5.4 Accuracy three ways, and what hand-labeling changed

My first 200 labels put 34% of real reviews in "other / unclear," and my notes said "NOT LISTED" over and over. Customers could not tell "broke on first use" from "failed in week one," so I merged those into one mode with a timing field. Real complaints also included whole categories a parts-receiving taxonomy never sees: the part works but does not do the job, the listing was wrong, the customer chose or misused it, it was not worth the price, it never arrived. Version 2 has 20 modes, and on the next 100 reviews only 4 landed in "other." I also wrote down eight boundary rules, each from a real case, and put them in the classifier's instructions word for word, so the model and the labeler draw the same lines.

| Check | n | Accuracy |
|---|---|---|
| Baseline: always guess the most common label | 100 | 40% |
| Sonnet 5 vs. synthetic ground truth | 1,500 | 96.5% (macro-F1 0.97) |
| Opus 5 vs. synthetic ground truth | 250 | 98.8% (agrees with Sonnet on 96.8%) |
| Opus 5 vs. my labels, taxonomy v1, 150 real reviews | 150 | 72% |
| Opus 5 vs. my labels, taxonomy v2, same 150 re-labeled | 150 | 76% |
| **Opus 5 vs. my labels, 100 unseen reviews, classifier frozen first** | 100 | **78%** |
| **Opus 5, same 100, with the written guideline** | 100 | **85%** |
| Sonnet 5 / Haiku 4.5, same 100, written guideline | 100 | 76% / 67% |
| My labels vs. the hidden synthetic ground truth | 50 | 49 of 50 (the generator writes what a person would read) |

I tagged each of my labels with how sure I was. That split is the most useful table in this memo:

| My confidence | Records | Opus 5 agrees | Sonnet 5 | Haiku 4.5 |
|---|---|---|---|---|
| high | 34 | **97%** | 88% | 88% |
| medium | 50 | 86% | 80% | 66% |
| low | 16 | 56% | 38% | 25% |

*(100 unseen reviews, written guideline.)* When I was sure, the reference model agreed with me. When I was unsure, so was the model, and what remains is real ambiguity: a part that broke versus one that fell short of its rating, or aged rubber versus rubber that never sealed. The top disagreements were functional failure ↔ material nonconformance (2), aged elastomers ↔ performance shortfall (2), and performance shortfall ↔ customer selection (2). Other pairs an experienced reviewer would also argue over include corrosion on arrival vs. plating failure and wrong part vs. thread mismatch.

Two results changed my decisions. On synthetic text all three models look interchangeable (96–99%), but on real language they separate: 67%, 76%, 85%. And the written guideline moved Opus from 78% to 85% while leaving Sonnet flat, so detailed rules only pay off on a model that can follow them. Whether a cheaper model is good enough has to be decided on real data.

### 5.5 Cost

| | Per 1,000 records | 50,000 credits/month |
|---|---|---|
| Sonnet 5 | $2.24 | $112 |
| **Opus 5 (the one I would deploy)** | $6.23 | $312 |
| Haiku 4.5 (uncached) | $2.60 | $130 |

The whole project cost $46.66 across two taxonomy versions, three full classification passes, and a discarded run. For production, Opus costs $200 a month more at 50,000 credits and is nine points more accurate on real language, which makes it an easy choice. One thing I learned along the way: the cheapest model per token (Haiku 4.5) won't cache a prompt under 4,096 tokens, so it cost *more per record* than Sonnet with caching.

## 6. What I would do about three of these causes

*Illustrative, based on the synthetic findings. The shape of each action matters more than the specifics. The DC-4 row acts on a suggestive signal that did not reach significance (§5.2), but a FIFO audit is cheap enough to be worth doing anyway.*

| Cause | Owner | Fix | Metric that says it worked |
|---|---|---|---|
| Thread damage · bulk-bag fasteners · post-May | Packaging engineering | Revert PB-2 for fastener SKUs above a size threshold, or add a divider. Test on the top 20 SKUs by credit count. | Thread-damage credits on those SKUs, next 8 weeks, vs. the 8 before |
| Aged elastomers · DC-4 | DC operations + inventory | FIFO audit on elastomer bins; date-code check at pick. | Aged-consumable credits from DC-4 vs. other DCs |
| Wrong part in the right bag | Fulfillment QA | Trace to the bagging line or supplier lot; add a scan-verify at bagging for the top 50 SKUs. | Wrong-part credits per 10k lines shipped |

The targets I would propose are assumptions for the pilot to correct: thread-damage credits on the affected fastener SKUs down by half within eight weeks of the packaging change; DC-4's aged-consumable rate down to the other DCs' level within one stock-rotation cycle; wrong-part credits down 30% on the top 50 SKUs once scan-verify is live. If a target is missed, the question is why, and the evidence quotes are where to look.

The program's main metric would be **credit recurrence rate**: the share of this quarter's credits whose cause was already in last quarter's top ten.

## 7. How to run this on real data

- **Inputs needed:** six months of credits with note text, reason code, product/SKU class, packaging spec, carrier, origin DC, ship and credit dates, credit amount, order value, and a line-down flag if one exists.
- **Privacy:** redact names, emails, phone numbers, and account numbers from the note before it reaches a model. Nothing else in the record is sensitive. Run under the API's standard data-retention terms, with no training on inputs.
- **Pilot (4 weeks):** Week 1, load and run. Week 2, two CS reps hand-label 300 records and the threshold is set from the curve. Week 3, take the top three causes, with evidence quotes, to the teams that own them. Week 4, agree the metric and the review cadence.
- **What it would cost:** at about $6.20 per thousand records on the reference model, a year of 50,000 credits a month is about $3,700 in model calls. Reviewer time costs more than that, and the threshold controls it.
- **What to expect:** the first run finds things people already suspected and could not prove. That is useful, because proof is what gets packaging engineering to act.

## 8. Limitations

- Claude models both wrote the synthetic notes and classified them. The human-labeled sets check for that circularity, and they show synthetic accuracy (96–99%) overstating real-review accuracy (78–85%). Treat the synthetic numbers as an upper bound.
- The 85% is mildly tuned to the test: I wrote the boundary rules while labeling the clean set, then put them in the classifier. The 78% from the frozen classifier has no such caveat. The range to quote is 78–85%.
- All the labels are mine. A real run should have two CS reps label the same 300 records and settle their disagreements.
- The public reviews skew consumer. The industrial share is real, but the mix is not a distributor's.
- The downtime estimates are mine. The demo's toggle shows how much the ranking depends on them.
- The taxonomy has 20 modes after one revision. A real credit dataset will need more revisions, and the process for making them is now written down.
- The seeded test shows the method finds a known signal. It says nothing about what a real dataset contains.

*Demo: [https://creditsignal.muireadhach.com](https://creditsignal.muireadhach.com) · Repository: [github.com/muireadhach/credit-signal](https://github.com/muireadhach/credit-signal)*
