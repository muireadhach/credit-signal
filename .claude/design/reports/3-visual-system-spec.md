# Visual system spec — Credit Signal

Contrast failures today: `--ink-3` on bg 3.59:1, `.chip.sig` green 3.35:1, `--s2` orange text 3.20:1 — all used for small text. Bug: `#scan-cells` insert places the sentence before " cells," ("…247 After correcting… survives. cells, ranked…").

## 1. Type
| Role | Family / weight | Desktop | Mobile |
|---|---|---|---|
| H1 | Source Serif 4 600, -0.015em | 52/1.05, max 18em | 34/1.1 |
| H2 | Source Serif 4 600 | 32/1.15, max 26em | 25/1.2 |
| H3 | Archivo 600 | 17/1.35 | 16/1.35 |
| Lede | Archivo 400, ink-2 | 20/1.45 | 18/1.45 |
| Body | Archivo 400 | 16/1.6, 66ch | 16/1.55 |
| Small / notes | Archivo 400 | 13.5/1.45 | same |
| Label (th, axis, `.io`) | Archivo 600 sentence case +.01em | 12.5/1.3 | same |
| Numeric (ledger) | Archivo 600 `tabular-nums lining-nums` | 40/1.0 | 32/1.0 |
| Table | Archivo 400; numbers tnum right | 14/1.45 | 13.5 |
| Memo body | Source Serif 4 400 | 18/1.6, 68ch | 17/1.6 |

- Scale: major third from 16 (13·16·20·25·32·40·52). *"One ratio; hierarchy comes from size, not boxes."*
- Load: `Archivo:wdth,wght@90..100,400..700` + `Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400`, `display=swap`. Replaces three Plex families with two.
- Why Archivo: industrial-rooted grotesque, wider/blunter than AI defaults, true tabular figures. *"It reads like a parts catalog, not a SaaS dashboard."*
- Serif rule: serif = prose a person wrote (author headlines, memo, customer quotes); sans = what the system produced (data, UI). *"The typeface tells you whose words you're reading."*
- Mono: drop the web font; `--mono: ui-monospace,"SF Mono",Menlo,Consolas`, only for literal `field = value` identifiers (Cut column). All other `.mono` → Archivo tnum.

## 2. Color (token names unchanged → no app.js color changes)
| Token | Light | Dark | Use |
|---|---|---|---|
| --bg | #f6f5f1 | #121211 | page |
| --panel | #ffffff | #1b1b19 | inputs only |
| --panel-2 | #ecebe5 | #242421 | disclosure, full-bleed band |
| --rule / --rule-strong | #dddbd3 / #a9a69c | #2d2c29 / #56544e | hairlines |
| --ink | #161614 | #edece8 | text, buttons, zero lines |
| --ink-2 | #4a4944 | #b8b6ae | secondary |
| --ink-3 | #6a6862 | #8f8d86 | labels |
| --accent = --s2 (signal) | #b23e0e | #f07d45 | the finding, active nav, focus |
| --accent-ink | #ffffff | #121211 | text on signal |
| --s1 (data) | #1f5fa8 | #5d9ee6 | default series |
| --seq-2 (data tint) | #7fa3d3 | #35608f | downtime, ground truth |
| --s3 | #0d7064 | #3db8a4 | precision line |
| --s4 | #e3a008 | #c98a00 | `mark` at 30% only |
| --good / --warn / --critical | #1b7a35 / #8a5a00 / #b42318 | #52c27a / #e0ac3a / #f2705f | verdicts |

Computed contrast on bg — light: ink 16.6, ink-2 8.3, ink-3 5.1, signal 5.4, data 5.9, s3 5.5, good 5.0, critical 6.0, warn 5.4. Dark: 15.9 / 9.2 / 5.6 / 6.9 / 6.7 / 7.7 / 8.4 / 6.5 / 9.0. All ≥4.66 on panel-2. Buttons (bg on ink) 16.6. Tint vs solid blue can't hit 3:1 against both; a 2px segment gap + direct labels carry it.
- One accent: the logo already has blue bars + one orange bar → blue = data, orange = the signal, never decorative. *"The logo is the palette rule."*
- Links: ink with 1px `--rule-strong` underline → signal on hover.
- Delete `--s5`–`--s8`, `--serious` if unused.

## 3. Layout
- Wrap 1120, 24 gutter, 12 cols; prose spans 1–8. `.fig` = `2fr 1fr` gap 48: chart left, note as sidenote right. *"Notes sit next to the evidence, like an annual report."*
- Rhythm: 96px between sections (64 mobile); each opens with a 1px `--ink` rule, 20px, then H2.
- Kill panels: `.panel` loses border/bg/radius; only Try-it keeps `--panel` + 1px rule. `.grid2` gap 48.
- One full-bleed moment: `#pattern` on a `--panel-2` band. It's the proof.
- Header: solid `--bg`, no blur. Disclosure gets *more* prominent: Archivo 12.5/1.3 500, `--panel-2`, 1px `--rule-strong`, radius 2, bold part `--critical` 600.
- Mobile nav: one row, `overflow-x:auto`, links min-height 40px, 10px side padding.
- Plan table: `data-label` on cells; ≤600px stack as label/value.

## 4. Components
- Tiles → ledger (no markup change): `grid-template:"v k" "v d" / 11rem 1fr`, no boxes, 1px rule between rows, max 760px; same for acc/cost. *"A highlights table, not a dashboard strip."*
- Eyebrows: one hero kicker (Archivo 600 14, signal, sentence case); section eyebrows → running heads (Archivo 600 13, ink-3, no caps/tracking). Drop "01 ·" numbering (proposal).
- Callouts: no left borders. Author → byline between two 1px rules (move under hero). "None of this is McMaster-Carr data" → Source Serif 20 under a 2px `--critical` rule.
- Chips: no boxes; lowercase + `::first-letter` cap, Archivo 600 12.5; sig=good, ns=ink-3, up/SEEDED=signal.
- Buttons: primary `--ink` fill/`--bg` text, 44px, radius 3, hover `--ink-2`; ghost transparent 1px ink. Toggles 40px segments, pressed = ink fill. Example buttons outlined 40px.
- Tables: headers sentence case `--ink-2` with 1px ink rule under; hairline rows; closing 1px ink rule; first col flush left. Highlighted rows: `.hl` class + `color-mix(signal 8%)` instead of inline font-weight.
- Quotes: Source Serif 16/1.5, no border, hairline separators, attribution Archivo 12.5 ink-3.
- Method steps: 5-column sequence under one ink rule, step number 32px tnum ink-3, no cards.

## 5. Charts
- Draw at container pixel width: `W = el.clientWidth`, `labelW = min(220, W*.42)`, redraw on debounced ResizeObserver. Today the 580-unit viewBox shrinks labels to ~8px at 390px. *"Chart text is 12.5px on every screen."*
- Horizontal gridlines only (`--rule`); zero/axis 1px `--ink`; bars `rx=0`; line 2.25; dots r 2.5; keep hit targets.
- Direct end-of-line labels (raise R to 90), series color; drop line-chart legends; drivers keeps an inline key.
- Spec-change marker: `--ink-3` dashed, label `--ink-2` — orange means PB-2 only.
- Voice chart full width, out of `.grid2`.

## 6. Motion
1. Rank toggle: bars grow from axis 240ms ease-out (`transform-box:fill-box; transform-origin:left`), on toggle only.
2. Try-it result fades in 150ms.
Extend reduced-motion guard to `animation:none`.
