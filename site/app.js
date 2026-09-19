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

  /* ---------- hero ---------- */
  const S = D.summary, CR = D.credits_ranked, ST = D.seeded_test, AC = D.accuracy, EC = D.economics, RQ = D.review_queue, MP = D.modes_public;
  const seedA = ST?.tests?.[0];
  const topImpact = CR && [...CR.modes].sort((a, b) => a.rank_by_impact - b.rank_by_impact)[0];
  $("#hero-tiles").innerHTML = [
    ["Records analyzed", fmt.n((S?.public_classified || 0) + (S?.synthetic_classified || 0)), `${fmt.n(S?.public_classified)} real reviews · ${fmt.n(S?.synthetic_classified)} synthetic credits`],
    ["#1 cause by customer impact", topImpact ? topImpact.name : "—", topImpact ? `#${topImpact.rank_by_credit} when ranked by refund alone` : ""],
    ["Seeded pattern, found blind", seedA?.llm?.lift ? fmt.x(seedA.llm.lift) + " lift" : "—", ST?.scan_cells ? `ranked #${ST.scan_seeded_ranks?.[0]} of ${ST.scan_cells} cells scanned · generic search: no signal` : ""],
    ["Accuracy vs. ground truth", AC?.bulk ? fmt.pct(AC.bulk.accuracy) : "—", AC?.gold_bulk ? `human gold set: ${fmt.pct(AC.gold_bulk.accuracy)}` : "human gold set pending"],
  ].map(([k, v, d]) => `<div class="tile"><div class="k">${k}</div><div class="v">${esc(v)}</div><div class="d">${esc(d)}</div></div>`).join("");

  /* ---------- drivers ---------- */
  function drawDrivers(mode) {
    if (!CR) return;
    const rows = [...CR.modes].filter(m => m.n > 0).sort((a, b) => mode === "credit" ? b.credit_usd - a.credit_usd : b.impact_usd.typical - a.impact_usd.typical).slice(0, 12);
    hbars($("#chart-drivers"), rows.map(m => ({
      label: m.name, suffix: m.safety ? "⚠" : "",
      segs: mode === "credit" ? [{ v: m.credit_usd, tip: `<b>${m.name}</b><br>${m.n} credits · ${fmt.usd(m.credit_usd)} refunded` }]
        : [{ v: m.credit_usd, tip: `<b>${m.name}</b><br>refunds ${fmt.usd(m.credit_usd)}` }, { v: m.impact_usd.typical - m.credit_usd, cls: "dim", tip: `<b>${m.name}</b><br>est. downtime ${m.downtime_hours.typical.toLocaleString()} h ≈ ${fmt.usd(m.impact_usd.typical - m.credit_usd)}<br>range ${fmt.usd(m.impact_usd.low)}–${fmt.usd(m.impact_usd.high)}` }]
    })), { max: Math.max(...CR.modes.map(m => mode === "credit" ? m.credit_usd : m.impact_usd.typical)) });
    const moved = CR.modes.filter(m => m.n > 0 && Math.abs(m.rank_by_credit - m.rank_by_impact) >= 3).sort((a, b) => a.rank_by_impact - b.rank_by_impact);
    $("#rk-note").textContent = mode === "credit" ? `${fmt.n(CR.n)} synthetic credits · ${fmt.usd(CR.total_credit_usd)} refunded` :
      `at $${CR.rate_per_hour}/h downtime · biggest movers: ` + moved.slice(0, 3).map(m => `${m.name} #${m.rank_by_credit}→#${m.rank_by_impact}`).join(", ");
    $("#rk-credit").setAttribute("aria-pressed", mode === "credit"); $("#rk-impact").setAttribute("aria-pressed", mode !== "credit");
  }
  drawDrivers("credit");
  $("#rk-credit").onclick = () => drawDrivers("credit"); $("#rk-impact").onclick = () => drawDrivers("impact");

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
    const tiles = [];
    if (AC.bulk) tiles.push(["Bulk model (Sonnet 5)", fmt.pct(AC.bulk.accuracy), `${fmt.n(AC.bulk.n)} synthetic records · macro-F1 ${AC.bulk.macro_f1}`]);
    if (AC.reference) tiles.push(["Reference model (Opus 5)", fmt.pct(AC.reference.accuracy), `${fmt.n(AC.reference.n)} records · agreement with bulk ${fmt.pct(AC.agreement)}`]);
    if (AC.bulk_on_reference_subset) tiles.push(["Bulk, same subset", fmt.pct(AC.bulk_on_reference_subset.accuracy), "apples-to-apples with the reference"]);
    if (AC.gold_bulk) tiles.push(["Human gold set", fmt.pct(AC.gold_bulk.accuracy), `${AC.gold_bulk.n} hand-labeled · ${AC.gold_bulk.public_n} real reviews`]); else tiles.push(["Human gold set", "pending", "200 records being hand-labeled"]);
    if (AC.gold_cheap) tiles.push(["Haiku 4.5 on gold set", fmt.pct(AC.gold_cheap.accuracy), `${AC.gold_cheap.n} records`]);
    if (AC.gold_reference) tiles.push(["Opus 5 on gold set", fmt.pct(AC.gold_reference.accuracy), `${AC.gold_reference.n} records`]);
    $("#acc-tiles").innerHTML = tiles.map(([k, v, d]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`).join("");
    if (AC.bulk) $("#confusions").innerHTML = `<thead><tr><th>Truth</th><th>Predicted</th><th class="n">n</th></tr></thead><tbody>` + AC.bulk.top_confusions.map(c => `<tr><td>${esc(c.truth)}</td><td>${esc(c.predicted)}</td><td class="n">${c.n}</td></tr>`).join("") + "</tbody>";
    $("#errors").innerHTML = (AC.error_examples || []).slice(0, 5).map(e => `<div class="quote">${esc(e.text).replace(esc(e.evidence), `<mark>${esc(e.evidence)}</mark>`)}<span class="who">truth: ${esc(e.truth)} · predicted: ${esc(e.predicted)} (${e.conf})</span></div>`).join("");
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
})();
