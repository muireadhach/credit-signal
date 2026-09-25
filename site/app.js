/* Credit Signal — renders site/data/*.json into the page. Plain SVG, no chart library. */
(async function () {
  const files = ["summary", "credits_ranked", "seeded_test", "modes_public", "review_queue", "accuracy", "economics"];
  const D = {};
  await Promise.all(files.map(async f => { try { D[f] = await (await fetch(`data/${f}.json`)).json(); } catch (e) { D[f] = null; } }));
  const $ = s => document.querySelector(s);
  const fp = p => p == null ? "—" : (p === 0 ? "<0.00001" : p < 0.001 ? p.toExponential(1) : p.toFixed(3));
  const fmt = { usd: n => n == null ? "—" : "$" + Math.round(n).toLocaleString(), pct: n => n == null ? "—" : (n * 100).toFixed(n > 0 && n < .1 ? 1 : 0) + "%", n: n => n == null ? "—" : n.toLocaleString(), x: n => n == null ? "—" : n.toFixed(1) + "×" };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tip = $("#tip");
  function bindTips(svg) {
    svg.querySelectorAll("[data-tip]").forEach(el => {
      el.addEventListener("mousemove", e => { tip.innerHTML = el.dataset.tip; tip.style.opacity = 1; tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tip.style.top = (e.clientY + 14) + "px"; });
      el.addEventListener("mouseleave", () => tip.style.opacity = 0);
    });
  }
  const svgEl = (w, h) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", `0 0 ${w} ${h}`); s.setAttribute("class", "chart"); s.setAttribute("role", "img"); return s; };

  /* Charts are drawn at the container's pixel width (1 SVG unit = 1 CSS px), so chart text stays 12.5–13px on every
     screen, and are redrawn when that width changes. Labels wrap at word boundaries instead of being clipped. */
  const drawn = new Set(); let roT; const roPending = new Set();
  const ro = new ResizeObserver(es => { es.forEach(e => roPending.add(e.target)); clearTimeout(roT); roT = setTimeout(() => { roPending.forEach(el => { if (Math.round(el.clientWidth) !== el._w && el._redraw) el._redraw(); }); roPending.clear(); }, 120); });
  const track = (el, redraw) => { el._w = Math.round(el.clientWidth); el._redraw = redraw; drawn.add(el); ro.observe(el); };
  document.fonts?.ready.then(() => drawn.forEach(el => el._redraw && el._redraw()));
  let mctx, fam;
  const textW = (t, px = 13, wt = 400) => { mctx ||= document.createElement("canvas").getContext("2d"); fam ||= getComputedStyle(document.body).fontFamily; mctx.font = `${wt} ${px}px ${fam}`; return mctx.measureText(t).width; };
  function wrapText(t, maxW, px = 13, maxLines = 2) {
    const words = String(t).split(" "), out = []; let cur = "";
    for (const w of words) { const next = cur ? cur + " " + w : w; if (cur && textW(next, px) > maxW) { out.push(cur); cur = w; } else cur = next; }
    if (cur) out.push(cur);
    if (out.length <= maxLines) return out;
    const keep = out.slice(0, maxLines - 1); let last = out.slice(maxLines - 1).join(" ");
    while (textW(last + " …", px) > maxW && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
    return [...keep, last + " …"];
  }

  /* Horizontal bars. rows: [{label, segs:[{v, cls, tip}], suffix}] */
  function hbars(el, rows, opts = {}) {
    const { max: mx, labelW: LW = 220, rowH = 26, valueFmt = fmt.usd, grow = false } = opts;
    if (!rows.length) { el.replaceChildren(); return; }
    const W = Math.round(el.clientWidth) || 580, pad = 6, lh = 15, bh = rowH - 10;
    const labelW = Math.round(Math.min(LW, W * .42)), valW = 84, plotW = Math.max(40, W - labelW - valW);
    const max = (mx && isFinite(mx) && mx > 0) ? mx : (Math.max(0, ...rows.map(r => r.segs.reduce((a, b) => a + b.v, 0))) || 1);
    const laid = rows.map(r => { const ls = wrapText(r.label, labelW - 12, 13, 3); return { r, ls, h: Math.max(rowH, ls.length * lh + 10) }; });
    const H = laid.reduce((a, b) => a + b.h, 0) + pad * 2;
    const s = svgEl(W, H); let y = pad, out = "";
    for (const { r, ls, h } of laid) {
      const cy = y + h / 2; let x = labelW; const total = r.segs.reduce((a, b) => a + b.v, 0);
      out += `<text class="lbl" x="${labelW - 12}" y="${cy - (ls.length - 1) * lh / 2 + 4.5}" text-anchor="end"><title>${esc(r.label)}</title>` + ls.map((t, i) => `<tspan x="${labelW - 12}" dy="${i ? lh : 0}">${esc(t)}</tspan>`).join("") + `</text>`;
      for (const g of r.segs) {
        const w = Math.max(0, g.v / max * plotW);
        out += `<rect class="bar ${g.cls || ""}" x="${x}" y="${cy - bh / 2}" width="${w}" height="${bh}" data-tip="${esc(g.tip || "")}"></rect>`;
        x += w + (w > 0 ? 2 : 0);
      }
      out += `<text class="val" x="${x + 6}" y="${cy + 4.5}">${esc(valueFmt(total))}${r.suffix ? " " + esc(r.suffix) : ""}</text>`;
      y += h;
    }
    out += `<line class="axis" x1="${labelW}" y1="${pad}" x2="${labelW}" y2="${H - pad}"/>`;
    s.innerHTML = out; if (grow) s.classList.add("grow");
    el.replaceChildren(s); bindTips(s);
    track(el, () => hbars(el, rows, { ...opts, grow: false }));
  }
  /* Line chart. series: [{name, label:[lines], color, pts:[{y,tip}]}]; x categorical labels. Series are labelled at the line end. */
  function lines(el, xs, series, opts = {}) {
    const { yFmt = fmt.pct, marker } = opts;
    const ys = series.flatMap(q => q.pts.map(p => p.y)).filter(v => v != null);
    if (!ys.length) { el.replaceChildren(); return; }
    const W = Math.round(el.clientWidth) || 560, H = W < 480 ? 220 : 250, lh = 14;
    const lab = q => q.label || [q.name];
    const R = Math.ceil(Math.max(...series.flatMap(q => lab(q).map(t => textW(t, 12.5, 600))))) + 16;
    const L = 42, T = 16, B = 28, pw = W - L - R, ph = H - T - B;
    const s = svgEl(W, H); let out = "";
    const ymax = opts.ymax || Math.max(...ys) * 1.15 || 1;
    const X = i => L + (xs.length > 1 ? i / (xs.length - 1) * pw : pw / 2), Y = v => T + ph - v / ymax * ph;
    for (let i = 1; i <= 4; i++) { const v = ymax * i / 4, yy = Y(v); out += `<line class="grid" x1="${L}" y1="${yy}" x2="${L + pw}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${esc(yFmt(v))}</text>`; }
    out += `<line class="axis" x1="${L}" y1="${Y(0)}" x2="${L + pw}" y2="${Y(0)}"/><text x="${L - 6}" y="${Y(0) + 4}" text-anchor="end">${esc(yFmt(0))}</text>`;
    const last = xs.length - 1, step = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor(pw / 52))));
    xs.forEach((x, i) => { if ((i % step === 0 && (i === last || last - i >= step * .6)) || i === last) out += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(x)}</text>`; });
    if (marker != null) { const mx = X(marker), right = mx > L + pw - 80; out += `<line class="marker" x1="${mx}" y1="${T}" x2="${mx}" y2="${T + ph}"/><text class="marker-lbl" x="${right ? mx - 5 : mx + 5}" y="${T + 10}" text-anchor="${right ? "end" : "start"}">spec change</text>`; }
    const ends = [];
    for (const q of series) {
      let path = "", prev = false, li = -1; q.pts.forEach((p, i) => { if (p.y == null) { prev = false; return; } path += (prev ? "L" : "M") + `${X(i)},${Y(p.y)}`; prev = true; li = i; });
      out += `<path class="line" d="${path}" style="stroke:${q.color}"/>`;
      q.pts.forEach((p, i) => { if (p.y == null) return; out += `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="2.5" style="fill:${q.color}"/><circle class="hit" cx="${X(i)}" cy="${Y(p.y)}" r="12" data-tip="${esc(p.tip || "")}"/>`; });
      if (li >= 0) ends.push({ q, x: X(li), y: Y(q.pts[li].y), n: lab(q).length });
    }
    /* keep end labels from overlapping: sort by height, push apart, clamp inside the plot */
    ends.sort((a, b) => a.y - b.y);
    ends.forEach((e, i) => { e.ty = e.y - (e.n - 1) * lh / 2; if (i) { const p = ends[i - 1], min = p.ty + p.n * lh + 4; if (e.ty < min) e.ty = min; } });
    const over = ends.length ? ends[ends.length - 1].ty + (ends[ends.length - 1].n - 1) * lh - (T + ph) : 0;
    if (over > 0) ends.forEach(e => e.ty -= over);
    ends.forEach(e => { out += `<text class="end" x="${e.x + 8}" y="${e.ty + 4}" style="fill:${e.q.color}">` + lab(e.q).map((t, i) => `<tspan x="${e.x + 8}" dy="${i ? lh : 0}">${esc(t)}</tspan>`).join("") + `</text>`; });
    s.innerHTML = out; el.replaceChildren(s); bindTips(s);
    track(el, () => lines(el, xs, series, opts));
  }

  /* header height drives the anchor offset, so section links land at the heading on every screen */
  const hdr = document.querySelector("header.top");
  const setH = () => document.documentElement.style.setProperty("--header-h", (hdr.offsetHeight + 12) + "px");
  setH(); new ResizeObserver(setH).observe(hdr);
  /* scroll-spy: underline the nav link for the section currently under the header */
  /* each nav link covers a group of sections (data-spy); on mobile the nav row scrolls the active link into view */
  const nav = document.querySelector("nav.sections"), navLinks = [...nav.querySelectorAll("a")];
  const spySections = [...document.querySelectorAll("main section[id]")];
  let spyCur = null;
  const spy = () => {
    const line = hdr.offsetHeight + 24, bottom = innerHeight + scrollY >= document.body.scrollHeight - 2;
    let cur = spySections[0];
    for (const sec of spySections) if (sec.getBoundingClientRect().top <= line) cur = sec;
    if (bottom) cur = spySections[spySections.length - 1];
    if (cur === spyCur) return; spyCur = cur;
    let act = null;
    navLinks.forEach(a => { const on = (a.dataset.spy || "").split(" ").includes(cur.id); a.classList.toggle("active", on); if (on) act = a; });
    if (act && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: Math.max(0, act.offsetLeft - nav.offsetLeft - 8) });
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
  const riser = CR && [...CR.modes].sort((a, b) => (b.rank_by_credit - b.rank_by_impact) - (a.rank_by_credit - a.rank_by_impact))[0];
  const frozen = AC?.gold_v2_clean_frozen?.reference?.public_accuracy, guided = AC?.gold_v2_clean?.reference?.public_accuracy;
  $("#hero-tiles").innerHTML = [
    ["Records analyzed", fmt.n((S?.public_classified || 0) + (S?.synthetic_classified || 0)), `${fmt.n(S?.public_classified)} real reviews · ${fmt.n(S?.synthetic_classified)} synthetic credits`],
    ["Biggest riser when ranked by downtime", riser ? riser.name : "—", riser ? `#${riser.rank_by_credit} by refund → #${riser.rank_by_impact} by customer impact` : ""],
    ["Seeded pattern, found blind", seedA?.llm?.lift ? fmt.x(seedA.llm.lift) + " lift" : "—", ST?.scan_cells ? `ranked #${ST.scan_seeded_ranks?.[0]} of ${ST.scan_cells} cells scanned · generic search: no signal` : ""],
    ["Agrees with a human, 100 unseen reviews", frozen != null && guided != null ? `${Math.round(frozen * 100)}–${fmt.pct(guided)}` : "—", guided != null ? `${fmt.pct(frozen)} frozen · ${fmt.pct(guided)} with the written guideline · ${fmt.pct(AC.gold_v2_clean.reference.by_human_confidence?.high?.accuracy)} where the human was sure` : "human gold set pending"],
  ].map(([k, v, d]) => `<div class="tile${/\d/.test(v) ? "" : " txt"}"><div class="k">${k}</div><div class="v">${esc(v)}</div><div class="d">${esc(d)}</div></div>`).join("");

  /* ---------- drivers ---------- */
  let rate = 500, rkMode = "credit";
  const impactAt = (m, r) => m.credit_usd + m.downtime_hours.typical * r;
  function drawDrivers(mode, grow = false) {
    if (!CR) return; rkMode = mode;
    CR.modes.forEach(m => { m.impact_usd = { low: m.credit_usd + m.downtime_hours.low * rate, typical: impactAt(m, rate), high: m.credit_usd + m.downtime_hours.high * rate }; });
    const byI = [...CR.modes].sort((a, b) => b.impact_usd.typical - a.impact_usd.typical); CR.modes.forEach(m => m.rank_by_impact = byI.indexOf(m) + 1);
    $("#rate-toggle").hidden = mode === "credit";
    const rows = [...CR.modes].filter(m => m.n > 0).sort((a, b) => mode === "credit" ? b.credit_usd - a.credit_usd : b.impact_usd.typical - a.impact_usd.typical).slice(0, 12);
    hbars($("#chart-drivers"), rows.map(m => ({
      label: m.name, suffix: m.safety ? "⚠" : "",
      segs: mode === "credit" ? [{ v: m.credit_usd, tip: `<b>${m.name}</b><br>${m.n} credits · ${fmt.usd(m.credit_usd)} refunded` }]
        : [{ v: m.credit_usd, tip: `<b>${m.name}</b><br>refunds ${fmt.usd(m.credit_usd)}` }, { v: m.impact_usd.typical - m.credit_usd, cls: "dim", tip: `<b>${m.name}</b><br>est. downtime ${m.downtime_hours.typical.toLocaleString()} h ≈ ${fmt.usd(m.impact_usd.typical - m.credit_usd)}<br>range ${fmt.usd(m.impact_usd.low)}–${fmt.usd(m.impact_usd.high)}` }]
    })), { max: Math.max(...CR.modes.map(m => mode === "credit" ? m.credit_usd : m.impact_usd.typical)), labelW: 250, grow });
    const moved = CR.modes.filter(m => m.n > 0 && Math.abs(m.rank_by_credit - m.rank_by_impact) >= 3).sort((a, b) => a.rank_by_impact - b.rank_by_impact);
    $("#rk-note").textContent = mode === "credit" ? `${fmt.n(CR.n)} synthetic credits · ${fmt.usd(CR.total_credit_usd)} refunded` :
      `at $${rate.toLocaleString()}/h downtime · biggest movers: ` + moved.slice(0, 3).map(m => `${m.name} #${m.rank_by_credit}→#${m.rank_by_impact}`).join(", ");
    $("#rk-credit").setAttribute("aria-pressed", mode === "credit"); $("#rk-impact").setAttribute("aria-pressed", mode !== "credit");
  }
  drawDrivers("credit");
  $("#rk-credit").onclick = () => drawDrivers("credit", true); $("#rk-impact").onclick = () => drawDrivers("impact", true);
  $("#rate-toggle").querySelectorAll("button").forEach(b => b.onclick = () => { rate = +b.dataset.rate; $("#rate-toggle").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); drawDrivers(rkMode, true); });

  /* ---------- pattern ---------- */
  if (ST) {
    const tr = ST.trend, xs = tr.map(t => t.month.slice(2).replace("-", "/"));
    const mi = tr.findIndex(t => t.month >= ST.spec_change.slice(0, 7));
    lines($("#chart-trend"), xs, [
      { name: "PB-2", label: ["Bulk poly bag", "(PB-2)"], color: "var(--s2)", pts: tr.map(t => ({ y: t.pb2_rate, tip: `<b>${t.month}</b> PB-2<br>${fmt.pct(t.pb2_rate)} of ${t.pb2_n} credits` })) },
      { name: "other", label: ["All other", "packaging"], color: "var(--s1)", pts: tr.map(t => ({ y: t.other_rate, tip: `<b>${t.month}</b> other packaging<br>${fmt.pct(t.other_rate)} of ${t.other_n} credits` })) },
    ], { marker: mi >= 0 ? mi : null });
    if (seedA) {
      hbars($("#chart-lift"), [
        { label: "LLM extraction", segs: [{ v: seedA.llm.lift || 0, tip: `${fmt.pct(seedA.llm.rate_in)} in group vs ${fmt.pct(seedA.llm.rate_out)} outside · p=${seedA.llm.p}` }] },
        { label: "Search “damaged / broke…”", suffix: seedA.keyword.lift ? "" : "no signal", segs: [{ v: seedA.keyword.lift || 0, cls: "kw", tip: `naive keyword · ${fmt.pct(seedA.keyword.rate_in)} vs ${fmt.pct(seedA.keyword.rate_out)} · p=${seedA.keyword.p}` }] },
        { label: "Regex tuned to thread damage", segs: [{ v: seedA.keyword_tuned?.lift || 0, cls: "kw", tip: `written after you suspect the answer · ${fmt.pct(seedA.keyword_tuned?.rate_in)} vs ${fmt.pct(seedA.keyword_tuned?.rate_out)}` }] },
        { label: "Ground truth (hidden)", segs: [{ v: seedA.ground_truth_lift || 0, cls: "dim", tip: "the lift that was actually seeded" }] },
      ], { valueFmt: fmt.x, labelW: 190, rowH: 32 });
      $("#lift-note").textContent = `Thread damage in ${seedA.n_in} bulk-bagged fastener credits after the spec change vs ${seedA.n_out} other fastener credits. A generic search catches dents, corrosion and kinked tube alike and the signal drowns. A regex tuned to thread damage works — if you already know to write it. The model checks all 20 modes at once without a hypothesis.`;
    }
    $("#seed-table").innerHTML = `<thead><tr><th>Check</th><th>Target</th><th class="n">n in / out</th><th class="n">Seeded</th><th class="n">LLM lift</th><th class="n">p</th><th class="n">Naive keyword</th><th>Verdict</th></tr></thead><tbody>` +
      ST.tests.map(t => { const sig = t.llm.p != null && t.llm.p < .01; return `<tr><td>${esc(t.name)}</td><td>${esc(t.target)}</td><td class="n">${t.n_in} / ${t.n_out}</td><td class="n">${fmt.x(t.ground_truth_lift)}</td><td class="n">${fmt.x(t.llm.lift)}</td><td class="n">${fp(t.llm.p)}</td><td class="n">${t.keyword.lift ? fmt.x(t.keyword.lift) : "no signal"}</td><td>${sig ? '<span class="chip sig">SIGNIFICANT</span>' : '<span class="chip ns">NOT SIGNIFICANT</span>'}</td></tr>`; }).join("") + "</tbody>";
    if (ST.scan) {
      $("#scan-cells").textContent = `${fmt.n(ST.scan_cells)}`;
      $("#scan-survivors").innerHTML = (` After correcting for that many comparisons (p &lt; ${ST.bonferroni_p.toExponential(1)}), <b>${ST.scan_survivors}</b> cell${ST.scan_survivors === 1 ? "" : "s"} survive${ST.scan_survivors === 1 ? "s" : ""}.`);
      $("#scan-table").innerHTML = `<thead><tr><th>#</th><th>Product class</th><th>Failure mode</th><th>Cut</th><th class="n">n</th><th class="n">rate in / out</th><th class="n">Lift</th><th class="n">p</th></tr></thead><tbody>` +
        ST.scan.slice(0, 8).map((c, i) => `<tr${c.seeded ? ' class="hl"' : ""}><td class="n">${i + 1}</td><td>${esc(c.product_class.replace(/_/g, " "))}</td><td>${esc(c.mode)}${c.seeded ? ' <span class="chip up">SEEDED</span>' : ""}</td><td class="cut">${esc(c.field.replace("_", " "))} = ${esc(c.value)}</td><td class="n">${c.n_in}</td><td class="n">${fmt.pct(c.rate_in)} / ${fmt.pct(c.rate_out)}</td><td class="n">${fmt.x(c.lift)}</td><td class="n">${fp(c.p)}${c.survives_correction ? ' <span class="chip sig">SURVIVES</span>' : ""}</td></tr>`).join("") + "</tbody>";
    }
  }

  /* ---------- voice ---------- */
  if (MP) {
    const ms = [...MP.modes].filter(m => m.n > 0).sort((a, b) => b.n - a.n);
    hbars($("#chart-voice"), ms.map(m => ({ label: m.name, segs: [{ v: m.n, tip: `<b>${m.name}</b><br>${m.n} reviews · avg confidence ${m.avg_conf}` }] })), { valueFmt: fmt.n, rowH: 24, labelW: 300 });
    $("#voice-modes").innerHTML = ms.map(m => `<details><summary><span>${esc(m.name)}</span><span class="small muted num">${fmt.pct(m.share)}</span></summary>` +
      m.examples.map(e => `<div class="quote">${esc(e.text).replace(esc(e.quote), `<mark>${esc(e.quote)}</mark>`)}<span class="who">public review · confidence ${e.conf}</span></div>`).join("") + `</details>`).join("");
  }

  /* ---------- review queue ---------- */
  if (RQ) {
    const cv = RQ.curve.filter(c => c.precision != null);
    if (cv.length) lines($("#chart-curve"), cv.map(c => "≥" + c.threshold), [
      { name: "coverage", label: ["Coverage"], color: "var(--s1)", pts: cv.map(c => ({ y: c.coverage, tip: `threshold ${c.threshold}<br>${fmt.pct(c.coverage)} auto-filed` })) },
      { name: "precision", label: ["Precision"], color: "var(--s3)", pts: cv.map(c => ({ y: c.precision, tip: `threshold ${c.threshold}<br>${fmt.pct(c.precision)} of auto-filed are right` })) },
    ], { ymax: 1 });
    $("#queue-title").textContent = `Review queue · ${fmt.n(RQ.n_queue)} of ${fmt.n(RQ.n_total)} (${fmt.pct(RQ.share)}) below ${RQ.threshold}`;
    $("#queue").innerHTML = RQ.examples.slice(0, 6).map(e => `<div class="quote"><span class="qh"><span class="conf" title="confidence ${e.conf}"><i style="width:${e.conf * 100}%"></i></span><span class="mono">${e.conf}</span> · ${esc(e.mode)}${e.secondary ? ` <span class="muted">or ${esc(e.secondary)}</span>` : ""}</span>${esc(e.text)}<span class="who">${e.source === "public_review" ? "public review" : "synthetic credit"}</span></div>`).join("");
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
    const errs = ((CL || RL)?.reference?.examples || []).slice(0, 5).map(e => `<div class="quote">${esc(e.text)}<span class="who">human: ${esc(e.human)} · model: ${esc(e.model)} (${e.conf})</span>${e.note ? `<span class="who">human's note: ${esc(e.note)}</span>` : ""}</div>`);
    $("#errors").innerHTML = errs.slice(0, 1).join(""); $("#errors-more").innerHTML = errs.slice(1).join("");
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
  function show(r, text, example = false) {
    const hl = r.evidence && text.includes(r.evidence) ? esc(text).replace(esc(r.evidence), `<mark>${esc(r.evidence)}</mark>`) : esc(text);
    res.innerHTML = `<div class="result">${example ? `
      <p class="eg">Example result · the “${esc(EX[0][0])}” note</p>` : ""}
      <div class="cat">${esc(r.category)}</div>
      <div class="mode">${esc(r.name)}</div>
      <div class="row"><span class="conf" title="confidence"><i style="width:${r.confidence * 100}%"></i></span><span class="mono small">${r.confidence.toFixed(2)}</span>
        <span class="route ${r.route === "auto_file" ? "auto" : "review"}">${r.route === "auto_file" ? "auto-file" : "send to review"}</span>
        <span class="small muted">threshold ${r.threshold}</span></div>
      <div class="in">${hl}</div>
      <div class="small muted">Origin: ${esc(stage[r.origin_stage] || r.origin_stage)}${r.timing ? " · " + esc(timing[r.timing] || r.timing) : ""}${r.secondary_mode ? " · could also be: " + esc(r.secondary_mode) : ""}${r.part_type ? " · part: " + esc(r.part_type) : ""}</div>
      ${example ? "" : `<div class="small muted" style="margin-top:8px">${esc(r.model)} · ${r.seconds}s · about ${(r.cost_usd * 100).toFixed(1)}¢</div>`}
    </div>`;
  }
  const FALLBACK = { failure_mode: "thread_damage", name: "Thread damage", category: "Manufacturing & dimensional", confidence: 0.92, evidence: "first few threads are mashed flat", origin_stage: "manufacturing", timing: null, secondary_mode: null, part_type: "3/8-16 nuts", route: "auto_file", threshold: 0.7, model: "example (live demo paused)", seconds: 0, cost_usd: 0 };
  show(FALLBACK, EX[0][1], true);
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
