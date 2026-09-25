# Credit Signal — design brief (read before any design work)

## What the site is
A portfolio case study (site/index.html + site/memo.html + site/app.js, plain HTML/CSS/JS, no build step, deployed by Vercel from `main`). Its one job: make a McMaster-Carr hiring panel (Leadership, Strategy & Ops — CS, Fulfillment, Automation) believe the author thinks like an operator and measures honestly. The reader is an ops/strategy leader skimming on a laptop between meetings, sometimes on a phone.

## The taste target
"Pops in 2026" here means **precise, confident, editorial, data-first** — the feel of a great annual report, a Stripe/Linear changelog, FT/Bloomberg graphics, or McMaster's own catalog: dense, fast, zero decoration that doesn't carry information. It does NOT mean effects. A hiring manager at a company whose website is famously utilitarian will read flash as a lack of judgment.

## The AI-aesthetic blacklist (flag on sight, never introduce)
Visual:
- Purple/indigo/violet→pink/blue gradients; gradient text; aurora/mesh/blob/orb backgrounds; glow halos; neon-on-black dark modes
- Glassmorphism/backdrop-blur used decoratively; frosted cards; noise-grain overlays for "texture"
- Uniform rounded-2xl cards with soft drop shadows as the only layout primitive; everything boxed in a panel
- Bento grids for their own sake; three-up "feature cards" with an icon in a rounded square
- Row of 3–4 KPI stat tiles directly under a hero (the single most common LLM landing-page shape)
- Tiny uppercase monospace letter-spaced "eyebrow" labels over every heading; numbered eyebrows ("01 · …")
- Left-border-accent callout boxes; pill badges ("✨ New"); chips everywhere
- Emoji or generic Lucide/Heroicons as section icons; decorative sparkles
- Everything centered; identical section rhythm (eyebrow → H2 → grey paragraph → panel) repeated top to bottom
- Default Inter/Geist with no typographic hierarchy beyond weight; or IBM Plex Mono as "techy seasoning"
- Hover-lift + shadow-grow on every card; scroll-triggered fade-ups on every block; animated counters
Copy (flag only — copy is the author's voice, never rewrite without approval):
- Em-dash cascades; "It's not X, it's Y" constructions; triplets; "Unlock / Seamless / Elevate / Harness / Delve / Robust"; punchy one-line H2s that all follow one template

## What the current site gets right (keep)
Restrained palette, real data as the hero, tabular numbers, honest disclosures, light+dark tokens on :root, reduced-motion guard, charts drawn from CSS variables in app.js, decent mobile.

## Hard constraints
- Plain HTML/CSS/JS. No frameworks, no build step, no new JS libraries. Fonts only via Google Fonts (or system). Keep it fast.
- Every number, claim, and sentence stays as-is unless a copy change is explicitly listed as a *proposal* for the author to approve.
- The "Not McMaster-Carr data" disclosure stays visible in the header on every viewport. Never make it less prominent.
- Tone is humble: "method + what it surfaced on proxy data." Nothing should look like a product launch or a SaaS landing page.
- Light AND dark must both work (tokens on :root, `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, plus `:root[data-theme="dark"]`).
- WCAG AA contrast for text; visible focus states; tap targets ≥ 40px on mobile; no horizontal page scroll at 390px.
- app.js renders charts/tables by reading CSS variables and class names — if you rename a class or variable, update app.js and confirm every chart still renders.
- The author must be able to explain every design choice in an interview. Prefer fewer, deliberate moves over many.

## Tooling
- Serve: `python3 -m http.server 8321 --directory site` (may already be running on 8321).
- Screenshots: `.claude/design/shoot.sh <out_dir> [memo]` → desktop 1280 + mobile 390, light + dark. Crop tall PNGs with `sips -c <h> <w> --cropOffset <y> 0 in.png --out part.png` or downscale with `sips -Z 1600` before viewing.
- Baseline screenshots: `.claude/design/before/`.
