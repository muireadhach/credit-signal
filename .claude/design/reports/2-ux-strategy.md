# UX strategy — Credit Signal

## Reading path today
- **10s:** Desktop above-fold = header + author callout (263px) + H1 (starts y=449); tiles start y=687, below fold. Mobile: sticky header is 174px (nav wraps 3 rows), author box fills the rest; H1 at y≈717, zero data visible. Takeaway: "shop person built an LLM thing." Biography is persuading, not data.
- **60s:** hero tiles — and tile 2 undercuts the thesis.
- **5min:** "Hidden pattern" is the strongest section. Readers bog down in Accuracy (1,968px desktop / 3,921px mobile: 5 tiles, 3 tables, a quote column). Index mobile page ≈ 18,500px.

## Recommendations (ranked)
1. **Hero tile 2 contradicts the headline** (author approval). It says "#1 cause by customer impact: Functional failure … #1 when ranked by refund alone" — the one mode that *didn't move*. Biggest reorders: Aged elastomers #14→#6, Material nonconformance #6→#3. Also `#chart-drivers` defaults to "By credit $", so the finding requires a click. Consider a rank slope (credit rank → impact rank).
2. **Hero tile 4 shows the flattering number** (author approval). 85%, while the page calls 78% "the unarguable number" and the memo says "the honest range is 78–85". Show "78–85%".
3. **Cross-document number drift** (author approval — biggest trust risk):
   - Memo: 256 cells, Seed B 1.3×, p=0.07, rank 32. Site data: 247 cells, 1.4×, p=0.027, rank 31.
   - "15-item taxonomy"/"15 modes" in index Method step 2, `#lift-note` (app.js), memo §1, §3, §5.2 — v2 has 20.
   - Memo "Built:" says "no runtime model calls" — but the index has live Try-it.
   - Threshold: `review_queue.json` uses 0.6; memo says 0.7; Try-it fallback uses 0.7.
   - Seed B labelled NOT SIGNIFICANT at p=0.027 — the p<0.01 cutoff lives only in app.js; state it.
   - Action plan says "for the top causes above" but rows aren't the top 3 by impact.
4. **Evidence before biography.** Byline under the H1; move the full author paragraph just before `#plan`, where "I was the customer" backs the owner/fix table. Mobile first data moves ~700px up.
5. **Nav 11 → 4–5 items:** Findings (Drivers + Hidden pattern) · Action plan · How good is it (Coverage + Accuracy + Cost) · Method & data · Try it. Mobile: single horizontal-scroll row → header ~100px; disclosure stays sticky and visible.
6. **Move "Try it" after `#pattern`**; render the existing `FALLBACK` worked example on load, labelled as an example (skimmers never type).
7. **Collapse supporting evidence into `<details>`:** Accuracy → one progression line (72 v1 → 78 frozen → 85 guideline; synthetic 96–99); gold/confusions/errors in details with one error visible. Coverage: `#real-curve` in details. Pattern: keep scan caption sentence visible, table in details; keep `#seed-table` visible (the "no" answers are the honesty signal). Cost: one sentence + `#scale`. Target Accuracy < 1,500px mobile.
8. **Plan table on mobile** → stacked cards under 760px. `#scan-table` on mobile: fold product class into "Cut". Leaves 3 sideways-scroll tables, all secondary.
9. **Uniform section treatment** means nothing reads as the headline. Let Drivers and Pattern run wider with no panel border; set evidence sections quieter.
10. **Index ↔ memo:** 4 memo CTAs on index → keep header, one after Plan, footer. Memo has no TOC for 8 sections → add an anchor list; memo tables scroll with no hint.

**Beyond layout:** second-rater data (commit 7f8eadc) isn't in accuracy.json; both Limitations lists still say "one labeler." Inter-rater agreement would be a stronger headline than 85%.
