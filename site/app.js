/* Credit Signal — renders site/data/*.json into the page. Plain SVG, no chart library. */
(async function () {
  const files = ["summary", "credits_ranked", "seeded_test", "modes_public", "review_queue", "accuracy", "economics"];
  const D = {};
  await Promise.all(files.map(async f => { try { D[f] = await (await fetch(`data/${f}.json`)).json(); } catch (e) { D[f] = null; } }));
  const $ = s => document.querySelector(s);
  const fp = p => p == null ? "—" : (p === 0 ? "<0.00001" : p < 0.001 ? p.toExponential(1) : p.toFixed(3));
  const fmt = { usd: n => n == null ? "—" : "$" + Math.round(n).toLocaleString(), pct: n => n == null ? "—" : (n * 100).toFixed(n < .1 ? 1 : 0) + "%", n: n => n == null ? "—" : n.toLocaleString(), x: n => n == null ? "—" : n.toFixed(1) + "×" };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tip = $("#tip");
  function bindTips(svg) {
    svg.querySelectorAll("[data-tip]").forEach(el => {
      el.addEventListener("mousemove", e => { tip.innerHTML = el.dataset.tip; tip.style.opacity = 1; tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tip.style.top = (e.clientY + 14) + "px"; });
      el.addEventListener("mouseleave", () => tip.style.opacity = 0);
    });
  }
  const svgEl = (w, h) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", `0 0 ${w} ${h}`); s.setAttribute("class", "chart"); s.setAttribute("role", "img"); return s; };

  /* Horizontal bars. rows: [{label, segs:[{v, cls, tip}], chips, note}] */
  const clip = (t, n = 30) => t.length > n ? t.slice(0, n - 1) + "…" : t;
  function hbars(el, rows, { max, labelW = 220, rowH = 26, valueFmt = fmt.usd } = {}) {
    if (!rows.length) { el.replaceChildren(); return; }
    const W = 580, pad = 8, plotW = W - labelW - 70;
    const H = rows.length * rowH + pad * 2;
    const s = svgEl(W, H); let y = pad;
    max = (max && isFinite(max) && max > 0) ? max : (Math.max(0, ...rows.map(r => r.segs.reduce((a, b) => a + b.v, 0))) || 1);
    for (const r of rows) {
      let x = labelW; const total = r.segs.reduce((a, b) => a + b.v, 0);
      s.innerHTML += `<text class="lbl" x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end"><title>${esc(r.label)}</title>${esc(clip(r.label))}</text>`;
      for (const g of r.segs) {
        const w = Math.max(0, g.v / max * plotW);
        s.innerHTML += `<rect class="bar ${g.cls || ""}" x="${x}" y="${y + 5}" width="${w}" height="${rowH - 10}" rx="2" data-tip="${esc(g.tip || "")}"></rect>`;
        x += w + (w > 0 ? 2 : 0);
      }
      s.innerHTML += `<text class="val" x="${x + 6}" y="${y + rowH / 2 + 4}">${esc(valueFmt(total))}${r.suffix ? " " + esc(r.suffix) : ""}</text>`;
      y += rowH;
    }
    s.innerHTML += `<line class="axis" x1="${labelW}" y1="${pad}" x2="${labelW}" y2="${H - pad}"/>`;
    el.replaceChildren(s); bindTips(s);
  }
  /* Line chart. series: [{name, color, pts:[{x,y,tip}]}]; x categorical labels */
  function lines(el, xs, series, { yFmt = fmt.pct, ymax, marker } = {}) {
    const W = 560, H = 230, L = 46, R = 14, T = 14, B = 34, pw = W - L - R, ph = H - T - B;
    const s = svgEl(W, H);
    const ys = series.flatMap(q => q.pts.map(p => p.y)).filter(v => v != null);
    if (!ys.length) { el.replaceChildren(); return; }
    ymax = ymax || Math.max(...ys) * 1.15 || 1;
    const X = i => L + (xs.length > 1 ? i / (xs.length - 1) * pw : pw / 2), Y = v => T + ph - v / ymax * ph;
    for (let i = 0; i <= 4; i++) { const v = ymax * i / 4, yy = Y(v); s.innerHTML += `<line class="grid" x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${esc(yFmt(v))}</text>`; }
    xs.forEach((x, i) => { if (xs.length <= 8 || i % Math.ceil(xs.length / 8) === 0 || i === xs.length - 1) s.innerHTML += `<text x="${X(i)}" y="${H - 12}" text-anchor="middle">${esc(x)}</text>`; });
    if (marker != null) { const mx = X(marker); s.innerHTML += `<line class="marker" x1="${mx}" y1="${T}" x2="${mx}" y2="${T + ph}"/><text x="${mx + 5}" y="${T + 12}" style="fill:var(--s2)">spec change</text>`; }
    for (const q of series) {
      const d = q.pts.map((p, i) => p.y == null ? null : `${X(i)},${Y(p.y)}`).filter(Boolean);
      let path = "", prev = false; q.pts.forEach((p, i) => { if (p.y == null) { prev = false; return; } path += (prev ? "L" : "M") + `${X(i)},${Y(p.y)}`; prev = true; });
      s.innerHTML += `<path class="line" d="${path}" style="stroke:${q.color}"/>`;
      q.pts.forEach((p, i) => { if (p.y == null) return; s.innerHTML += `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="4" style="fill:${q.color}"/><circle class="hit" cx="${X(i)}" cy="${Y(p.y)}" r="12" data-tip="${esc(p.tip || "")}"/>`; });
    }
    el.replaceChildren(s); bindTips(s);
  }

  /* header height drives the anchor offset, so section links land at the heading on every screen */
  const hdr = document.querySelector("header.top");
  const setH = () => document.documentElement.style.setProperty("--header-h", (hdr.offsetHeight + 12) + "px");
  setH(); new ResizeObserver(setH).observe(hdr);
  /* scroll-spy: underline the nav link for the section currently under the header */
  const navLinks = [...document.querySelectorAll("nav.sections a")];
  const spySections = navLinks.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const spy = () => {
    const line = hdr.offsetHeight + 24, bottom = innerHeight + scrollY >= document.body.scrollHeight - 2;
    let cur = spySections[0];
    for (const sec of spySections) if (sec.getBoundingClientRect().top <= line) cur = sec;
    if (bottom) cur = spySections[spySections.length - 1];
    navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + cur.id));
  };
  addEventListener("scroll", spy, { passive: true }); addEventListener("resize", spy); spy();
  /* mark tables that actually overflow, so the "scroll sideways" hint only shows when true */
  const markScroll = () => document.querySelectorAll(".scrollwrap").forEach(w => {
    const t = w.querySelector(".tablewrap"); const sc = t.scrollWidth > t.clientWidth + 2;
    w.classList.toggle("scrollable", sc);
    if (sc && !t.dataset.bound) { t.dataset.bound = 1; t.addEventListener("scroll", () => w.classList.toggle("at-end", t.scrollLeft + t.clientWidth >= t.scrollWidth - 2), { passive: true }); }
  });
  addEventListener("resize", markScroll);

  /* ---------- hero ---------- */
  const S = D.summary, CR = D.credits_ranked, ST = D.seeded_test, AC = D.accuracy, EC = D.economics, RQ = D.review_queue, MP = D.modes_public;
  const seedA = ST?.tests?.[0];
  const topImpact = CR && [...CR.modes].sort((a, b) => a.rank_by_impact - b.rank_by_impact)[0];
  $("#hero-tiles").innerHTML = [
    ["Records analyzed", fmt.n((S?.public_classified || 0) + (S?.synthetic_classified || 0)), `${fmt.n(S?.public_classified)} real reviews · ${fmt.n(S?.synthetic_classified)} synthetic credits`],
    ["#1 cause by customer impact", topImpact ? topImpact.name : "—", topImpact ? `#${topImpact.rank_by_credit} when ranked by refund alone` : ""],
    ["Seeded pattern, found blind", seedA?.llm?.lift ? fmt.x(seedA.llm.lift) + " lift" : "—", ST?.scan_cells ? `ranked #${ST.scan_seeded_ranks?.[0]} of ${ST.scan_cells} cells scanned · generic search: no signal` : ""],
    ["Agrees with a human, 100 unseen reviews", AC?.gold_v2_clean?.reference ? fmt.pct(AC.gold_v2_clean.reference.public_accuracy) : "—", AC?.gold_v2_clean?.reference ? `${fmt.pct(AC.gold_v2_clean.reference.by_human_confidence?.high?.accuracy)} where the human was sure · was ${fmt.pct(AC.gold_v1?.reference?.public_accuracy)} under taxonomy v1` : "human gold set pending"],
  ].map(([k, v, d]) => `<div class="tile"><div class="k">${k}</div><div class="v">${esc(v)}</div><div class="d">${esc(d)}</div></div>`).join("");

  /* ---------- drivers ---------- */
  let rate = 500, rkMode = "credit";
  const impactAt = (m, r) => m.credit_usd + m.downtime_hours.typical * r;
  function drawDrivers(mode) {
    if (!CR) return; rkMode = mode;
    CR.modes.forEach(m => { m.impact_usd = { low: m.credit_usd + m.downtime_hours.low * rate, typical: impactAt(m, rate), high: m.credit_usd + m.downtime_hours.high * rate }; });
    const byI = [...CR.modes].sort((a, b) => b.impact_usd.typical - a.impact_usd.typical); CR.modes.forEach(m => m.rank_by_impact = byI.indexOf(m) + 1);
    $("#rate-toggle").hidden = mode === "credit";
    const rows = [...CR.modes].filter(m => m.n > 0).sort((a, b) => mode === "credit" ? b.credit_usd - a.credit_usd : b.impact_usd.typical - a.impact_usd.typical).slice(0, 12);
    hbars($("#chart-drivers"), rows.map(m => ({
      label: m.name, suffix: m.safety ? "⚠" : "",
      segs: mode === "credit" ? [{ v: m.credit_usd, tip: `<b>${m.name}</b><br>${m.n} credits · ${fmt.usd(m.credit_usd)} refunded` }]
        : [{ v: m.credit_usd, tip: `<b>${m.name}</b><br>refunds ${fmt.usd(m.credit_usd)}` }, { v: m.impact_usd.typical - m.credit_usd, cls: "dim", tip: `<b>${m.name}</b><br>est. downtime ${m.downtime_hours.typical.toLocaleString()} h ≈ ${fmt.usd(m.impact_usd.typical - m.credit_usd)}<br>range ${fmt.usd(m.impact_usd.low)}–${fmt.usd(m.impact_usd.high)}` }]
    })), { max: Math.max(...CR.modes.map(m => mode === "credit" ? m.credit_usd : m.impact_usd.typical)) });
    const moved = CR.modes.filter(m => m.n > 0 && Math.abs(m.rank_by_credit - m.rank_by_impact) >= 3).sort((a, b) => a.rank_by_impact - b.rank_by_impact);
    $("#rk-note").textContent = mode === "credit" ? `${fmt.n(CR.n)} synthetic credits · ${fmt.usd(CR.total_credit_usd)} refunded` :
      `at $${rate.toLocaleString()}/h downtime · biggest movers: ` + moved.slice(0, 3).map(m => `${m.name} #${m.rank_by_credit}→#${m.rank_by_impact}`).join(", ");
    $("#rk-credit").setAttribute("aria-pressed", mode === "credit"); $("#rk-impact").setAttribute("aria-pressed", mode !== "credit");
  }
  drawDrivers("credit");
  $("#rk-credit").onclick = () => drawDrivers("credit"); $("#rk-impact").onclick = () => drawDrivers("impact");
  $("#rate-toggle").querySelectorAll("button").forEach(b => b.onclick = () => { rate = +b.dataset.rate; $("#rate-toggle").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); drawDrivers(rkMode); });

  /* ---------- pattern ---------- */
  if (ST) {
    const tr = ST.trend, xs = tr.map(t => t.month.slice(2).replace("-", "/"));
    const mi = tr.findIndex(t => t.month >= ST.spec_change.slice(0, 7));
    lines($("#chart-trend"), xs, [
      { name: "PB-2", color: "var(--s2)", pts: tr.map(t => ({ y: t.pb2_rate, tip: `<b>${t.month}</b> PB-2<br>${fmt.pct(t.pb2_rate)} of ${t.pb2_n} credits` })) },
      { name: "other", color: "var(--s1)", pts: tr.map(t => ({ y: t.other_rate, tip: `<b>${t.month}</b> other packaging<br>${fmt.pct(t.other_rate)} of ${t.other_n} credits` })) },
    ], { marker: mi >= 0 ? mi : null });
    if (seedA) {
      hbars($("#chart-lift"), [
        { label: "LLM extraction", segs: [{ v: seedA.llm.lift || 0, tip: `${fmt.pct(seedA.llm.rate_in)} in group vs ${fmt.pct(seedA.llm.rate_out)} outside · p=${seedA.llm.p}` }] },
        { label: "Search “damaged / broke…”", suffix: seedA.keyword.lift ? "" : "no signal", segs: [{ v: seedA.keyword.lift || 0, cls: "kw", tip: `naive keyword · ${fmt.pct(seedA.keyword.rate_in)} vs ${fmt.pct(seedA.keyword.rate_out)} · p=${seedA.keyword.p}` }] },
        { label: "Regex tuned to thread damage", segs: [{ v: seedA.keyword_tuned?.lift || 0, cls: "kw", tip: `written after you suspect the answer · ${fmt.pct(seedA.keyword_tuned?.rate_in)} vs ${fmt.pct(seedA.keyword_tuned?.rate_out)}` }] },
        { label: "Ground truth (hidden)", segs: [{ v: seedA.ground_truth_lift || 0, cls: "dim", tip: "the lift that was actually seeded" }] },
      ], { valueFmt: fmt.x, labelW: 200, rowH: 34 });
      $("#lift-note").textContent = `Thread damage in ${seedA.n_in} bulk-bagged fastener credits after the spec change vs ${seedA.n_out} other fastener credits. A generic search catches dents, corrosion and kinked tube alike and the signal drowns. A regex tuned to thread damage works — if you already know to write it. The model checks all 15 modes at once without a hypothesis.`;
    }
    $("#seed-table").innerHTML = `<thead><tr><th>Check</th><th>Target</th><th class="n">n in / out</th><th class="n">Seeded</th><th class="n">LLM lift</th><th class="n">p</th><th class="n">Naive keyword</th><th>Verdict</th></tr></thead><tbody>` +
      ST.tests.map(t => { const sig = t.llm.p != null && t.llm.p < .01; return `<tr><td>${esc(t.name)}</td><td>${esc(t.target)}</td><td class="n">${t.n_in} / ${t.n_out}</td><td class="n">${fmt.x(t.ground_truth_lift)}</td><td class="n">${fmt.x(t.llm.lift)}</td><td class="n">${fp(t.llm.p)}</td><td class="n">${t.keyword.lift ? fmt.x(t.keyword.lift) : "no signal"}</td><td>${sig ? '<span class="chip sig">SIGNIFICANT</span>' : '<span class="chip ns">NOT SIGNIFICANT</span>'}</td></tr>`; }).join("") + "</tbody>";
    if (ST.scan) {
      $("#scan-cells").textContent = `${fmt.n(ST.scan_cells)}`;
      $("#scan-cells").insertAdjacentHTML("afterend", ` After correcting for that many comparisons (p &lt; ${ST.bonferroni_p.toExponential(1)}), <b>${ST.scan_survivors}</b> cell${ST.scan_survivors === 1 ? "" : "s"} survive${ST.scan_survivors === 1 ? "s" : ""}.`);
      $("#scan-table").innerHTML = `<thead><tr><th>#</th><th>Product class</th><th>Failure mode</th><th>Cut</th><th class="n">n</th><th class="n">rate in / out</th><th class="n">Lift</th><th class="n">p</th></tr></thead><tbody>` +
        ST.scan.slice(0, 8).map((c, i) => `<tr${c.seeded ? ' style="font-weight:600"' : ""}><td class="n">${i + 1}</td><td>${esc(c.product_class.replace(/_/g, " "))}</td><td>${esc(c.mode)}${c.seeded ? ' <span class="chip up">SEEDED</span>' : ""}</td><td class="mono small">${esc(c.field.replace("_", " "))} = ${esc(c.value)}</td><td class="n">${c.n_in}</td><td class="n">${fmt.pct(c.rate_in)} / ${fmt.pct(c.rate_out)}</td><td class="n">${fmt.x(c.lift)}</td><td class="n">${fp(c.p)}${c.survives_correction ? ' <span class="chip sig">SURVIVES</span>' : ""}</td></tr>`).join("") + "</tbody>";
    }
  }

  /* ---------- voice ---------- */
  if (MP) {
    const ms = [...MP.modes].filter(m => m.n > 0).sort((a, b) => b.n - a.n);
    hbars($("#chart-voice"), ms.map(m => ({ label: m.name, segs: [{ v: m.n, tip: `<b>${m.name}</b><br>${m.n} reviews · avg confidence ${m.avg_conf}` }] })), { valueFmt: fmt.n, rowH: 24 });
    $("#voice-modes").innerHTML = ms.slice(0, 15).map(m => `<details><summary><span>${esc(m.name)}</span><span class="small muted num">${fmt.pct(m.share)}</span></summary>` +
      m.examples.map(e => `<div class="quote">${esc(e.text).replace(esc(e.quote), `<mark>${esc(e.quote)}</mark>`)}<span class="who">public review · confidence ${e.conf}</span></div>`).join("") + `</details>`).join("");
  }

  /* ---------- review queue ---------- */
  if (RQ) {
    const cv = RQ.curve.filter(c => c.precision != null);
    if (cv.length) lines($("#chart-curve"), cv.map(c => "≥" + c.threshold), [
      { name: "coverage", color: "var(--s1)", pts: cv.map(c => ({ y: c.coverage, tip: `threshold ${c.threshold}<br>${fmt.pct(c.coverage)} auto-filed` })) },
      { name: "precision", color: "var(--s3)", pts: cv.map(c => ({ y: c.precision, tip: `threshold ${c.threshold}<br>${fmt.pct(c.precision)} of auto-filed are right` })) },
    ], { ymax: 1 });
    $("#queue-title").textContent = `Review queue · ${fmt.n(RQ.n_queue)} of ${fmt.n(RQ.n_total)} (${fmt.pct(RQ.share)}) below ${RQ.threshold}`;
    $("#queue").innerHTML = RQ.examples.slice(0, 6).map(e => `<div class="quote"><span class="conf" title="confidence ${e.conf}"><i style="width:${e.conf * 100}%"></i></span><span class="small mono">${e.conf}</span> · ${esc(e.mode)}${e.secondary ? ` <span class="small muted">or ${esc(e.secondary)}</span>` : ""}<br>${esc(e.text)}<span class="who">${e.source === "public_review" ? "public review" : "synthetic credit"}</span></div>`).join("");
  }

  /* ---------- accuracy ---------- */
  if (AC) {
    const G = { bulk: AC.gold_bulk, reference: AC.gold_reference, cheap: AC.gold_cheap };
    const V1 = AC.gold_v1, FR = AC.gold_v2_clean_frozen, CL = AC.gold_v2_clean, RL = AC.gold_v2_relabeled;
    const tiles = [];
    if (V1?.reference) tiles.push(["v1 taxonomy · 150 real reviews", fmt.pct(V1.reference.public_accuracy), "Opus 5 vs the author's labels · 34% of labels were 'other'"]);
    if (RL?.reference) tiles.push(["v2 taxonomy · same 150, re-labeled", fmt.pct(RL.reference.public_accuracy), "merged two modes, added five the reviews demanded"]);
    if (FR?.reference) tiles.push(["v2 · 100 unseen reviews, rules frozen", fmt.pct(FR.reference.public_accuracy), "labeled after the classifier was fixed — the unarguable number"]);
    if (CL?.reference) tiles.push(["v2 · same 100, written guideline", fmt.pct(CL.reference.public_accuracy), `8 boundary rules from labeling · Sonnet ${fmt.pct(CL.bulk?.public_accuracy)} · Haiku ${fmt.pct(CL.cheap?.public_accuracy)}`]);
    if (AC.reference) tiles.push(["Synthetic ground truth", fmt.pct(AC.reference.accuracy), `Opus 5 · Sonnet ${fmt.pct(AC.bulk?.accuracy)} · agree ${fmt.pct(AC.agreement)}`]);
    $("#acc-tiles").innerHTML = tiles.map(([k, v, d]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`).join("");
    if (CL?.reference) {
      const H = ["high", "medium", "low"];
      $("#gold-table").innerHTML = `<thead><tr><th>Human confidence</th><th class="n">Records</th><th class="n">Opus 5</th><th class="n">Sonnet 5</th><th class="n">Haiku 4.5</th></tr></thead><tbody>` +
        H.map(h => `<tr><td>${h}</td><td class="n">${CL.reference.by_human_confidence[h]?.n ?? "—"}</td>` + ["reference", "bulk", "cheap"].map(m => `<td class="n">${fmt.pct(CL[m]?.by_human_confidence?.[h]?.accuracy)}</td>`).join("") + `</tr>`).join("") +
        `<tr><td><b>All 100</b></td><td class="n">100</td>` + ["reference", "bulk", "cheap"].map(m => `<td class="n"><b>${fmt.pct(CL[m]?.accuracy)}</b></td>`).join("") + `</tr></tbody>`;
      $("#gen-check").textContent = RL ? `${RL.human_vs_synthetic_truth.agree} of ${RL.human_vs_synthetic_truth.n}` : "—";
      $("#real-curve").innerHTML = `<thead><tr><th>Threshold</th><th class="n">Auto-filed</th><th class="n">Precision (Opus)</th><th class="n">Precision (Sonnet)</th></tr></thead><tbody>` +
        CL.reference.public_curve.map((c, i) => `<tr><td>≥ ${c.threshold}</td><td class="n">${fmt.pct(c.coverage)}</td><td class="n">${fmt.pct(c.precision)}</td><td class="n">${fmt.pct(CL.bulk?.public_curve?.[i]?.precision)}</td></tr>`).join("") + "</tbody>";
    }
    if (AC.bulk) $("#confusions").innerHTML = `<thead><tr><th>Human said</th><th>Opus 5 said</th><th class="n">n</th></tr></thead><tbody>` + ((CL || RL)?.reference?.top_disagreements || AC.bulk.top_confusions.map(c => ({ human: c.truth, model: c.predicted, n: c.n }))).map(c => `<tr><td>${esc(c.human)}</td><td>${esc(c.model)}</td><td class="n">${c.n}</td></tr>`).join("") + "</tbody>";
    $("#errors").innerHTML = ((CL || RL)?.reference?.examples || []).slice(0, 5).map(e => `<div class="quote">${esc(e.text)}<span class="who">human: ${esc(e.human)} · model: ${esc(e.model)} (${e.conf})</span>${e.note ? `<span class="who">human's note: ${esc(e.note)}</span>` : ""}</div>`).join("");
  }

  /* ---------- cost ---------- */
  if (EC) {
    $("#cost-tiles").innerHTML = [
      ["Bulk model, per 1,000", EC.bulk_per_1k != null ? "$" + EC.bulk_per_1k.toFixed(2) : "—", `${fmt.n(EC.bulk_calls)} calls measured`],
      ["Reference model, per 1,000", EC.reference_per_1k != null ? "$" + EC.reference_per_1k.toFixed(2) : "—", `${fmt.n(EC.reference_calls)} calls measured`],
      ["Haiku 4.5, per 1,000", EC.cheap_per_1k != null ? "$" + EC.cheap_per_1k.toFixed(2) : "—", "cheapest per token — but it can't cache this prompt"],
      ["This whole project", fmt.usd(EC.total_spend_usd), "generation + classification + evaluation"],
    ].map(([k, v, d]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`).join("");
    $("#scale").innerHTML = `<thead><tr><th>Credits per month</th><th class="n">Bulk model</th><th class="n">Reference model</th></tr></thead><tbody>` + EC.scale.map(r => `<tr><td>${fmt.n(r.credits_per_month)}</td><td class="n">${fmt.usd(r.bulk_usd)}</td><td class="n">${fmt.usd(r.reference_usd)}</td></tr>`).join("") + "</tbody>";
  }
  markScroll(); setTimeout(markScroll, 300);

  /* ---------- try it: live classification via /api/classify ---------- */
  const EX = [
    ["Thread damage", "Pulled a handful of the 3/8-16 nuts out of the bag and couldn't get a single one started on the rod by hand. Under a light the first few threads are mashed flat on one side. About half the box is like that."],
    ["Listing vs. part", "The picture on your site shows a fully threaded bolt. What showed up is threaded about an inch and a half. The bag label matches the part number I ordered, so it's the page that's wrong."],
    ["Didn't do the job", "Used the leak sealer exactly per the directions on a slow drip at a compression fitting. It never stopped. Tried a second application, same result. Nothing broke, it just doesn't work."],
    ["Vague", "Not happy with these at all. Poor quality for the money. Would not order again."],
  ];
  const tx = $("#try-text"), go = $("#try-go"), st = $("#try-status"), res = $("#try-result");
  $("#try-examples").innerHTML = EX.map((e, i) => `<button type="button" data-i="${i}">${esc(e[0])}</button>`).join("");
  $("#try-examples").querySelectorAll("button").forEach(b => b.onclick = () => { tx.value = EX[+b.dataset.i][1]; tx.focus(); });
  const stage = { manufacturing: "made wrong", storage_handling: "degraded in storage or handling", fulfillment: "packing, shipping, or picking", in_service: "failed in use", customer_side: "customer's selection or expectation", unclear: "origin unclear" };
  const timing = { first_use: "on first use", in_service: "after working for a while", unknown: "timing unclear" };
  function show(r, text) {
    const hl = r.evidence && text.includes(r.evidence) ? esc(text).replace(esc(r.evidence), `<mark>${esc(r.evidence)}</mark>`) : esc(text);
    res.innerHTML = `<div class="result">
      <div class="k small muted mono" style="text-transform:uppercase;letter-spacing:.06em">${esc(r.category)}</div>
      <div class="mode">${esc(r.name)}</div>
      <div class="row"><span class="conf" title="confidence"><i style="width:${r.confidence * 100}%"></i></span><span class="mono small">${r.confidence.toFixed(2)}</span>
        <span class="route ${r.route === "auto_file" ? "auto" : "review"}">${r.route === "auto_file" ? "auto-file" : "send to review"}</span>
        <span class="small muted">threshold ${r.threshold}</span></div>
      <div class="in">${hl}</div>
      <div class="small muted">Origin: ${esc(stage[r.origin_stage] || r.origin_stage)}${r.timing ? " · " + esc(timing[r.timing] || r.timing) : ""}${r.secondary_mode ? " · could also be: " + esc(r.secondary_mode) : ""}${r.part_type ? " · part: " + esc(r.part_type) : ""}</div>
      <div class="small muted" style="margin-top:8px">${esc(r.model)} · ${r.seconds}s · about ${(r.cost_usd * 100).toFixed(1)}¢</div>
    </div>`;
  }
  const FALLBACK = { failure_mode: "thread_damage", name: "Thread damage", category: "Manufacturing & dimensional", confidence: 0.92, evidence: "first few threads are mashed flat", origin_stage: "manufacturing", timing: null, secondary_mode: null, part_type: "3/8-16 nuts", route: "auto_file", threshold: 0.7, model: "example (live demo paused)", seconds: 0, cost_usd: 0 };
  go.onclick = async () => {
    const text = tx.value.trim(); if (!text) { tx.focus(); return; }
    go.disabled = true; st.textContent = "reading the note…";
    try {
      const r = await fetch("/api/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      show(j, text); st.textContent = "";
    } catch (e) {
      st.textContent = `Live demo unavailable (${e.message}). Showing a worked example instead.`;
      show(FALLBACK, EX[0][1]);
    } finally { go.disabled = false; }
  };
})();
