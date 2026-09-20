# Credit Signal

Root-cause analysis of customer credits and complaints with a language model.

**The problem.** When a distributor issues a credit, the *reason* lives in free text: a service rep's note, a returned-goods comment, a complaint email. Reason codes are coarse ("damaged", "wrong item"). The real driver — a packaging spec, a carrier lane, a product class, a warehouse — is buried in prose nobody reads at volume, so the same failure gets credited over and over instead of fixed once.

**What this does.** Reads the free text → extracts a structured failure mode (from a 15-item taxonomy written from shop experience), a confidence, and a verbatim evidence quote → joins to the metadata the order system already holds → ranks causes by estimated **customer downtime**, not just refund dollars → routes low-confidence records to a human review queue.

**What it is not.** Not McMaster-Carr data. Not a chatbot. Not a claim about anyone's operation. It is a method, tested against a known answer on proxy data, with the accuracy and cost measured and reported.

## Results at a glance

See the live demo: [credit-signal-self.vercel.app](https://credit-signal-self.vercel.app). The decision memo is in [`memo/memo.md`](memo/memo.md).

## Data — disclosed everywhere it appears

| Layer | What | Why |
|---|---|---|
| **Real** | 2,000 one- and two-star reviews from the *Industrial & Scientific* category of [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/) (UCSD / McAuley Lab), stratified 70/30 toward reviews using shop vocabulary | Genuine, messy customer language about industrial products |
| **Synthetic** | 1,500 credit memos with product class, packaging spec, carrier, origin DC, date, credit amount; notes written by a model that saw *only* the failure mode and product class | The record structure no public dataset has. Two patterns seeded on purpose so the method can be checked against a known answer |

Downtime hours per failure mode (`taxonomy/impact_weights.yaml`) are an operator's estimate, not measured. The demo shows the ranking under that assumption and makes the assumption visible.

## How it runs

```
pipeline/01_fetch_public.py       stream + keyword-prefilter the public corpus (one-time, ~700 MB; optional — the 2,000-review sample is committed)
pipeline/01b_sample_public.py     stratified 2,000-review sample
pipeline/02_generate_synthetic.py --frame   metadata + hidden ground truth + seeded patterns (gate: lift ≥ 3×)
pipeline/02b_write_notes.py       Claude Opus 5 writes the free-text notes (sees mode + product class only)
pipeline/03_classify.py --model bulk|reference|cheap   structured extraction with confidence + evidence
pipeline/04_analyze.py            rankings, seeded-pattern tests, coverage/precision curve, accuracy, cost → site/data/*.json
pipeline/05_build_gold_pool.py    200-record pool for hand labeling → tools/label.html
```

Three models, on purpose: **Opus 5** writes the notes and is the accuracy reference; **Sonnet 5** classifies everything at ~⅓ the price; **Haiku 4.5** runs on the gold set only, for a three-way comparison. Whether the cheaper model is good enough is a measured result. (Haiku was the original bulk choice — it would not cache a ~2K-token prompt, which made it cost *more* per record than cached Sonnet. Cheaper per token is not cheaper per record.)

Every API call logs its tokens and cost to `data/processed/usage.jsonl`; the demo's cost section is computed from that file.

The demo (`site/`) is plain HTML + SVG with no framework and no runtime API calls: the analysis runs once, the site serves the results. It deploys anywhere static files do.

## Setup

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
.venv/bin/python pipeline/02_generate_synthetic.py --frame
# ...then the scripts above in order. Total API spend for the full run is under $25.
python3 -m http.server 8321 --directory site   # local preview
```

## Limitations, honestly

- Synthetic notes were written and classified by models from the same family. The human-labeled gold set exists to check that the accuracy number is not an artifact of that.
- Public reviews are consumer-adjacent. The industrial share is real; the mix is not a distributor's mix.
- Downtime estimates drive the impact ranking. Change `impact_weights.yaml` and the ranking changes — that is the point of showing it.
- No order-level ground truth exists for the public reviews; accuracy there rests on the gold set alone.
- The seeded patterns prove the method can find a known signal. They do not prove what a real credit dataset contains.

## Layout

```
taxonomy/   failure_modes.yaml (15 modes, from experience) · impact_weights.yaml (downtime estimates)
pipeline/   the six scripts above + llm.py (SDK wrapper, cost log)
data/       raw/ (gitignored) · processed/ (samples, classifications, usage log) · gold/ (hand labels)
site/       the static demo; site/data/*.json is what it renders
memo/       decision memo
docs/       interview kit, limitations
tools/      gold-set labeler
```
