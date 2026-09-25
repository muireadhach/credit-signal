# AI-aesthetic audit — Credit Signal

**Verdict:** Palette and data are restrained, but the page *skeleton* is the canonical LLM landing page — a skeptical reader clocks it in 10 seconds. Ranked loudest first:

1. **4-up KPI tile row under the hero** — `#hero-tiles` (index.html:188, app.js:88–93). The #1 LLM tell, and here it's also broken: "Functional failure (first use or early in service)" at 34px wraps to 4 lines, making the tile ragged. **Replace:** a 4-row ruled key-figures table (label left, tabular number right, note beneath) — or drop tiles and let the drivers chart be the hero.
2. **Numbered mono eyebrows** "01 · Try it" … "10 · Data, honestly" — `.eyebrow` index.html:64, used 185–322; same uppercase-mono treatment in `.tile .k`, `th`, `.modes-head`, `.scrollwrap .hint`, `.route`, app.js:215. Exactly the brief's blacklist. **Replace:** delete eyebrows; the nav already names sections. If numbering matters, put it in the H2 like the memo does.
3. **Left-border-accent callout as the first thing on the page** — `#author .callout` (index.html:134, 176) with orange 4px left border. A boxed bio before the claim reads as template-order. **Replace:** plain byline under the H1 (name + one line), hero first. Same for `#data .callout` (323) → a bold sentence.
4. **Everything in a box** — ~25 bordered 6px-radius panels (`.panel`, `.tile`, `.step`). **Replace:** hairline rules + whitespace (FT/annual-report grammar); keep a panel only around Try it.
5. **Identical section rhythm** — eyebrow → H2 → grey `.muted` para → panel, ten times. Grey intro text also lowers contrast. **Replace:** vary layout by content; drivers chart wider than the text column; intro paragraphs in `--ink`.
6. **Two more tile rows** — `#acc-tiles` (5 tiles, 5th orphans) and `#cost-tiles` (4). Accuracy is a sequence (72→76→78→85, 99 synthetic) → a small step chart or table. Merge cost into `#scale`.
7. **Five "how it works" step cards** with mono "IN · free text" labels (index.html:312–318). **Replace:** the table the memo already uses (memo §3).
8. **Outlined mono pill chips** (SIGNIFICANT / NOT SIGNIFICANT / SEEDED / SURVIVES) app.js:136, 141. **Replace:** plain text in the verdict column; bold+color for significant, `--ink-3` for not.
9. **IBM Plex Mono as seasoning** — disclosure banner, headers, `.who`, hints. **Replace:** mono only for numeric cells, or drop it for Plex Sans tabular-nums.
10. **Frosted sticky header** `backdrop-filter:blur(8px)` index.html:40. Solid `var(--bg)`.
11. **Truncated chart labels** (not an AI tell, but sloppy): "Functional failure (first use…", "Short count or missing compon…" via `clip()` in app.js. Widen `labelW` or wrap.

## Copy tells (proposals only — author's voice)
- Em-dash density: 18 in index.html, 34 in memo.html, 17 in app.js strings.
- "Not X, it's Y": index.html:178, 187, 306; memo §5.1.
- Templated punchy H2s: "Paste a complaint. Watch it get filed.", "Finding the cause is the easy half.", "Five steps, no magic.", "Cents per thousand records." — the pattern H2 (223) is the model: specific, with a number.
- Self-labelling honesty: "Data, honestly", "no magic", "the unarguable number" (app.js:171).
- Triplets: index.html:256 (twice), 272.

## Credibility bugs (verified)
- H2 "Cents per thousand records" (index.html:304) but tiles show $2.24 / $6.23 per 1,000 — dollars.
- Method step 2 (index.html:314) and memo §1/§3 say "15-item taxonomy"; v2 has 20.
- Memo says 256 cells scanned; site data says 247.
- index.html:330 "One labeler" — commit 7f8eadc added a second rater.
