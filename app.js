(function () {
  "use strict";
  const M = window.VTModel;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const cfg = { rName: "Phil Scott", dName: "Amanda Janoo", rLast: "Scott", dLast: "Janoo", jitter: true };
  let prior = { ...M.DEFAULT_PRIOR };
  let model = M.build(window.VT_BASELINE, prior);
  let results = new Map();
  let out = null;
  let history = [];

  // ---------- Gauges ----------
  const CX = 170, CY = 178, R1 = 165, R0 = 108;
  const pt = (deg, r) => [CX + r * Math.sin((deg * Math.PI) / 180), CY - r * Math.cos((deg * Math.PI) / 180)];
  function arc(a0, a1, r0, r1) {
    const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
    const big = a1 - a0 > 180 ? 1 : 0;
    return `M${x0},${y0}A${r1},${r1} 0 ${big} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${big} 0 ${x3},${y3}Z`;
  }
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };

  function drawGauge(svg, bands, labels) {
    svg.innerHTML = "";
    bands.forEach((b) => el("path", { d: arc(b.a0, b.a1, R0, R1), fill: b.fill, "fill-opacity": b.op, stroke: css("--bg"), "stroke-width": 1.5 }, svg));
    labels.forEach((l) => {
      const [x, y] = pt(l.a, R1 + 10);
      const t = el("text", { x, y, "text-anchor": l.a < -5 ? "end" : l.a > 5 ? "start" : "middle", "dominant-baseline": l.a === 0 ? "auto" : "middle" }, svg);
      t.textContent = l.t;
      const [tx0, ty0] = pt(l.a, R1 - 1), [tx1, ty1] = pt(l.a, R1 + 5);
      el("line", { x1: tx0, y1: ty0, x2: tx1, y2: ty1, stroke: css("--faint") }, svg);
    });
    const g = el("g", {}, svg);
    el("path", { d: `M${CX - 4},${CY} L${CX},${CY - R1 + 6} L${CX + 4},${CY} Z`, fill: css("--needle") }, g);
    el("circle", { cx: CX, cy: CY, r: 8, fill: css("--needle") }, g);
    el("circle", { cx: CX, cy: CY, r: 3, fill: css("--bg") }, g);
    return g;
  }

  function buildGauges() {
    const D = css("--dem"), Rr = css("--rep"), F = css("--faint");
    const P = (p) => (p - 0.5) * 180;
    gP.node = drawGauge($("gProb"), [
      { a0: P(0), a1: P(0.05), fill: D, op: 1 }, { a0: P(0.05), a1: P(0.25), fill: D, op: 0.65 }, { a0: P(0.25), a1: P(0.4), fill: D, op: 0.3 },
      { a0: P(0.4), a1: P(0.6), fill: F, op: 0.25 },
      { a0: P(0.6), a1: P(0.75), fill: Rr, op: 0.3 }, { a0: P(0.75), a1: P(0.95), fill: Rr, op: 0.65 }, { a0: P(0.95), a1: P(1), fill: Rr, op: 1 },
    ], [
      { a: P(0.02), t: "Very likely" }, { a: P(0.15), t: "Likely" }, { a: P(0.33), t: "Lean" }, { a: 0, t: "Toss-up" },
      { a: P(0.67), t: "Lean" }, { a: P(0.85), t: "Likely" }, { a: P(0.98), t: "Very likely" },
    ]);
    const Mg = (m) => (Math.max(-MRANGE, Math.min(MRANGE, m)) / MRANGE) * 90;
    gM.node = drawGauge($("gMargin"), [
      { a0: Mg(-60), a1: Mg(-30), fill: D, op: 1 }, { a0: Mg(-30), a1: Mg(-10), fill: D, op: 0.6 }, { a0: Mg(-10), a1: Mg(0), fill: D, op: 0.28 },
      { a0: Mg(0), a1: Mg(10), fill: Rr, op: 0.28 }, { a0: Mg(10), a1: Mg(30), fill: Rr, op: 0.6 }, { a0: Mg(30), a1: Mg(60), fill: Rr, op: 1 },
    ], [
      { a: Mg(-60), t: "+60" }, { a: Mg(-30), t: "+30" }, { a: Mg(-10), t: "+10" }, { a: 0, t: "Even" },
      { a: Mg(10), t: "+10" }, { a: Mg(30), t: "+30" }, { a: Mg(60), t: "+60" },
    ]);
    setAngle(gP); setAngle(gM);
    if (out) drawRange();
  }
  const MRANGE = 60;
  const mAng = (m) => (Math.max(-MRANGE, Math.min(MRANGE, m)) / MRANGE) * 90;
  function drawRange() {
    if (!gM.range || !out) return;
    const a0 = mAng(out.margin.p05), a1 = Math.max(a0 + 0.8, mAng(out.margin.p95));
    gM.range.setAttribute("d", arc(a0, a1, R0 - 14, R0 - 5));
    gM.range.setAttribute("fill", css(out.margin.med > 0 ? "--rep" : "--dem"));
  }
  const gP = { node: null, cur: 0, target: 0 };
  const gM = { node: null, cur: 0, target: 0 };
  const setAngle = (g) => g.node && g.node.setAttribute("transform", `rotate(${g.cur} ${CX} ${CY})`);

  // jitter: pick a new target inside the model's uncertainty every ~0.4s, ease toward it
  let lastJ = 0;
  function tick(ts) {
    if (out) {
      if (ts - lastJ > 380) {
        lastJ = ts;
        const p = out.pWin;
        let pj = p, mj = out.margin.med;
        if (cfg.jitter) {
          const sd = Math.sqrt((p * (1 - p)) / 30);
          pj = Math.max(0, Math.min(1, p + sd * randn()));
          mj = out.margin.p25 + Math.random() * (out.margin.p75 - out.margin.p25);
        }
        gP.target = (pj - 0.5) * 180;
        gM.target = (Math.max(-MRANGE, Math.min(MRANGE, mj)) / MRANGE) * 90;
      }
      for (const g of [gP, gM]) { g.cur += (g.target - g.cur) * 0.08; setAngle(g); }
    }
    requestAnimationFrame(tick);
  }
  function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---------- Formatting ----------
  const last = (n) => n.split(" ").slice(-1)[0];
  const fmtM = (m, short) => m == null || isNaN(m) ? "—" : Math.abs(m) < 0.05 ? "Even" : `${m > 0 ? (short ? "R" : last(cfg.rName)) : (short ? "D" : last(cfg.dName))} +${Math.abs(m).toFixed(1)}`;
  const cls = (m) => (m == null ? "" : m > 0 ? "r" : "d");
  // Never claim 0% / 100% for a forecast; 2,000 draws can't support that
  const pct = (x) => (x >= 0.995 ? ">99" : x <= 0.005 ? "<1" : Math.round(x * 100)) + "%";
  const num = (x) => Math.round(x).toLocaleString("en-US");
  const k = (x) => (x >= 1000 ? Math.round(x / 1000).toLocaleString() + "k" : Math.round(x));

  function describe(p) {
    const q = Math.max(p, 1 - p);
    return q >= 0.95 ? "very likely" : q >= 0.75 ? "likely" : q >= 0.6 ? "leaning toward" : null;
  }

  // ---------- Update ----------
  function recompute(label, push = true) {
    out = M.run(model, results, { draws: 2000, seed: 7 });
    if (push) history.push({ label, p: out.pWin, ...out.margin, pctIn: out.counted.pctIn });
    render(label);
  }

  // Margin-of-error bar: 90% range (light), 50% range (dark), median dot, "Even" tick when in view.
  // The range comes only from the vote still out, so it narrows as towns report.
  function renderMoe(m) {
    const w = m.p95 - m.p05, pad = Math.max(1.5, w * 0.35);
    const lo = m.p05 - pad, hi = m.p95 + pad;
    const x = (v) => (((v - lo) / (hi - lo)) * 100).toFixed(2) + "%";
    const side = m.med > 0 ? "rep" : "dem";
    const evenTick = lo < 0 && hi > 0 ? `<i class="moe-even" style="left:${x(0)}"><b>Even</b></i>` : "";
    const fmtE = (v) => fmtM(v, true).replace(" ", "");
    $("marginSub").innerHTML = `
      <div class="moe" style="--c:var(--${side})">
        <div class="moe-track">
          ${evenTick}
          <i class="moe-90" style="left:${x(m.p05)};width:calc(${x(m.p95)} - ${x(m.p05)})"></i>
          <i class="moe-50" style="left:${x(m.p25)};width:calc(${x(m.p75)} - ${x(m.p25)})"></i>
          <i class="moe-dot" style="left:${x(m.med)}"></i>
        </div>
        <div class="moe-ends"><span style="left:${x(m.p05)}">${fmtE(m.p05)}</span><span style="left:${x(m.p95)}">${fmtE(m.p95)}</span></div>
        <div class="moe-cap">90% range <span>·</span> ±${(w / 2).toFixed(1)}</div>
      </div>`;
    $("marginSub").title = `Middle 50% of outcomes: ${fmtE(m.p25)} to ${fmtE(m.p75)}. 90%: ${fmtE(m.p05)} to ${fmtE(m.p95)}.`;
  }

  let lastLabel = "";
  function render(label) {
    const o = out, p = o.pWin;
    $("probBig").innerHTML = p >= 0.5 ? `<span style="color:var(--rep)">${pct(p)} ${last(cfg.rName)}</span>` : `<span style="color:var(--dem)">${pct(1 - p)} ${last(cfg.dName)}</span>`;
    $("marginBig").innerHTML = `<span class="${cls(o.margin.med)}" style="color:var(--${o.margin.med > 0 ? "rep" : "dem"})">${fmtM(o.margin.med)}</span>`;
    renderMoe(o.margin);
    drawRange();

    const leader = p >= 0.5 ? cfg.rName : cfg.dName, lc = p >= 0.5 ? "r" : "d", d = describe(p);
    let h;
    const verdict = { "very likely": "very likely to win", likely: "likely to win", "leaning toward": "leans ahead" }[d];
    if (!o.counted.total) h = `Pre-election: <b class="${lc}">${leader}</b> ${verdict || "even"}.`;
    else h = verdict ? `<b class="${lc}">${leader}</b> ${verdict}` : "Toss-up";
    $("headline").innerHTML = h;

    $("sPct").textContent = pct(Math.min(1, o.counted.pctIn));
    $("sBar").style.width = Math.min(100, o.counted.pctIn * 100) + "%";
    $("sCur").innerHTML = `<span style="color:var(--${o.counted.margin > 0 ? "rep" : "dem"})">${fmtM(o.counted.margin)}</span>`;
    $("sCurS").textContent = o.counted.total ? `${num(o.counted.r)} – ${num(o.counted.d)}` : "No votes counted";
    $("sTurn").textContent = k(o.turnout.med);
    $("sTurnS").textContent = `${k(o.turnout.lo)}–${k(o.turnout.hi)}`;
    $("sTowns").textContent = `${o.townsIn} / ${model.towns.length}`;
    $("sTownsS").textContent = o.townsPartial ? `${o.townsPartial} partially` : "";

    const live = o.counted.total > 0;
    $("live").classList.toggle("off", !live);
    $("liveTxt").textContent = live ? "Live" : "Pre-election";
    if (label) lastLabel = label;
    $("stamp").textContent = (lastLabel ? lastLabel + " · " : "") + "Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

    renderTable(); renderHistory();
  }

  function renderTable() {
    const lim = 80;
    const pos = (m) => ((Math.max(-lim, Math.min(lim, m)) + lim) / (2 * lim)) * 100;
    const rows = out.counties.slice().sort((a, b) => b.expected - a.expected).map((c) => {
      const col = c.projMargin > 0 ? "var(--rep)" : "var(--dem)";
      return `<tr><td>${c.county}</td><td>${c.townsIn}/${c.towns}</td><td>${pct(c.pctIn)}</td>
        <td class="${cls(c.curMargin)}">${c.curMargin == null ? "—" : fmtM(c.curMargin, true)}</td>
        <td class="${cls(c.projMargin)}">${fmtM(c.projMargin, true)}</td>
        <td><div class="range"><div class="axis"></div><div class="zero" style="left:50%"></div>
          <div class="span" style="left:${pos(c.lo)}%;width:${pos(c.hi) - pos(c.lo)}%;background:${col}"></div>
          <div class="dot" style="left:${pos(c.projMargin)}%;background:${col}"></div></div></td></tr>`;
    });
    $("ctab").innerHTML = `<thead><tr><th>County</th><th>Towns in</th><th>Est. vote in</th><th>Current</th><th>Projected</th><th style="text-align:center">D+80 · R+80</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  }

  function renderHistory() {
    const svg = $("hist"); svg.innerHTML = "";
    const W = 820, H = 240, L = 52, Rt = 76, T = 14, Hc = 184, B = T + Hc;
    const n = history.length; if (!n) return;
    const F = css("--faint"), Rr = css("--rep"), D = css("--dem"), FG = css("--fg"), RULE = css("--rule");
    // x = share of the expected vote counted (0–100%)
    // x spans the part of the night we have (to the nearest 10%), so a late start isn't squeezed right
    const pcts = history.map((h) => Math.min(1, h.pctIn || 0));
    const x0 = Math.floor(Math.min(...pcts) * 10) / 10, x1 = Math.max(x0 + 0.1, Math.ceil(Math.max(...pcts) * 10 + 1e-9) / 10);
    const xstep = x1 - x0 > 0.5 ? 0.25 : x1 - x0 > 0.2 ? 0.1 : 0.05;
    const xp = (q) => L + ((q - x0) / (x1 - x0)) * (W - L - Rt);
    const xs = (h) => xp(Math.min(1, h.pctIn || 0));
    // y fits the 90% range; "Even" is shown only when the race is near it
    let lo = Math.min(...history.map((h) => h.p05)), hi = Math.max(...history.map((h) => h.p95));
    if (lo < 6 && hi > -6) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const span = Math.max(4, hi - lo), step = span > 30 ? 10 : span > 12 ? 5 : 2;
    lo = Math.floor((lo - span * 0.1) / step) * step; hi = Math.ceil((hi + span * 0.1) / step) * step;
    const ym = (m) => T + Hc - ((m - lo) / (hi - lo)) * Hc;
    for (let v = lo; v <= hi; v += step) {
      el("line", { x1: L, x2: W - Rt, y1: ym(v), y2: ym(v), stroke: v === 0 ? F : RULE }, svg);
      const t = el("text", { x: L - 8, y: ym(v) + 4, "text-anchor": "end" }, svg); t.textContent = v === 0 ? "Even" : (v > 0 ? "R+" : "D+") + Math.abs(v);
    }
    for (let q = Math.ceil(x0 / xstep - 1e-9) * xstep; q <= x1 + 1e-9; q += xstep) {
      const x = xp(q);
      el("line", { x1: x, x2: x, y1: B, y2: B + 4, stroke: F }, svg);
      const t = el("text", { x, y: B + 18, "text-anchor": "middle" }, svg); t.textContent = Math.round(q * 100) + "%";
    }
    const tl = el("text", { x: W - Rt, y: B + 34, "text-anchor": "end" }, svg); tl.textContent = "Share of expected vote counted";
    const pts = history.map((h) => [xs(h), h]);
    if (n > 1) {
      const band = (a, b, op) => {
        const d = pts.map(([x, h], i) => `${i ? "L" : "M"}${x},${ym(h[a])}`).join("") + pts.slice().reverse().map(([x, h]) => `L${x},${ym(h[b])}`).join("") + "Z";
        el("path", { d, fill: FG, "fill-opacity": op }, svg);
      };
      band("p05", "p95", 0.06); band("p25", "p75", 0.12);
    }
    el("polyline", { points: pts.map(([x, h]) => `${x},${ym(h.med)}`).join(" "), fill: "none", stroke: FG, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    const [lx, lh] = pts[n - 1], col = lh.med > 0 ? Rr : D;
    el("circle", { cx: lx, cy: ym(lh.med), r: 4.5, fill: col }, svg);
    const lab = el("text", { x: lx + 10, y: ym(lh.med) + 4, style: `fill:${col};font-weight:700;font-size:13px` }, svg);
    lab.textContent = fmtM(lh.med, true);
    svg.setAttribute("viewBox", `0 0 ${W} ${H + 8}`);
  }

  // ---------- Data ----------
  // Live results come from the Vermont Secretary of State. On the hosted site a GitHub Action
  // polls SOS and commits live/latest.json + live/history.json, so visitors never contact SOS.
  // Anywhere without live/, the page reads SOS directly (its CDN allows cross-origin reads).
  function ingest(snap, label) {
    const parsed = M.parseSOS(snap, model, cfg);
    results = parsed.results;
    recompute(label);
    if (parsed.unmatched.length) console.warn("Unmatched towns:", parsed.unmatched.join(", "));
  }
  const source = (when) => `Vermont Secretary of State, updated ${when}`;

  // Hosted mode
  let hostedTimer = null, hostedLast = null;
  async function hostedFetch() {
    try {
      const r = await fetch("live/latest.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const snap = await r.json();
      if (snap.path === hostedLast) return;
      hostedLast = snap.path;
      ingest(snap, source(snap.sosUpdated));
    } catch (e) { console.warn("Couldn’t load results:", e.message); }
  }
  async function startHosted() {
    const r = await fetch("live/history.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("no hosted history");
    const snaps = await r.json();
    if (!snaps.length) throw new Error("empty history");
    history = [];
    // Replay the night so the forecast chart is complete (fewer draws for speed)
    for (const s of snaps.slice(0, -1)) {
      try {
        results = M.parseSOS(s, model, cfg).results;
        const o = M.run(model, results, { draws: 400, seed: 7 });
        history.push({ label: s.sosUpdated, p: o.pWin, ...o.margin, pctIn: o.counted.pctIn });
      } catch (e) { /* skip a bad snapshot */ }
    }
    hostedLast = null;
    await hostedFetch();
    hostedTimer = setInterval(hostedFetch, 60000);
  }

  // Direct mode: check the small election index every 2 minutes; download the
  // ~0.5 MB statewide file only when its timestamped path changes.
  const SOS = "https://static.electionresults.vermont.gov";
  let sosTimer = null, sosGuid = null, sosPath = null;
  const getJSON = async (u) => { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  async function sosFetch() {
    try {
      if (!sosGuid) {
        const idx = await getJSON(`${SOS}/elections/elections.json`);
        const e = idx.find((x) => x.isGeneralElection && x.isStateWideElection && /^2026-11-03/.test(x.electionDate));
        if (!e) throw new Error("2026 general election not found in the SOS index");
        sosGuid = e.electionGuid;
      }
      const el = await getJSON(`${SOS}/elections/${sosGuid}.json`);
      const path = el.stateWide && el.stateWide.path && el.stateWide.path.replace(/\\/g, "/");
      if (!path || path === sosPath) return;
      const s = await getJSON(`${SOS}/${path}`);
      let gov = null;
      for (const blk of s.d || []) for (const o of blk.o || []) if (/^GOVERNOR$/i.test(o.on)) gov = o;
      sosPath = path;
      ingest({ gov, lastUpdated: el.lastUpdatedDate, townsReporting: el.townsReporting }, source(el.lastUpdatedDate));
    } catch (e) { console.warn("Vermont Secretary of State fetch failed:", e.message); }
  }
  function startSOS() { history = []; sosFetch(); sosTimer = setInterval(sosFetch, 120000); }

  // Priors
  const fillPrior = () => { $("pMargin").value = prior.margin; $("pSd").value = prior.marginSd; $("pTurn").value = prior.turnout; $("pOther").value = prior.otherShare; };
  $("applyPrior").onclick = () => {
    prior = { ...prior, margin: +$("pMargin").value, marginSd: Math.max(2, +$("pSd").value), turnout: Math.max(50000, +$("pTurn").value), otherShare: Math.min(0.3, Math.max(0, +$("pOther").value)) };
    cfg.jitter = $("jitter").checked;
    model = M.build(window.VT_BASELINE, prior);
    if (hostedTimer) { clearInterval(hostedTimer); hostedTimer = null; startHosted().catch(() => recompute("Priors updated")); return; }
    history = []; sosPath = null;
    if (sosTimer) sosFetch(); else recompute("Priors updated");
  };
  $("jitter").onchange = () => (cfg.jitter = $("jitter").checked);
  function setNames() { ["nameD1", "nameD2"].forEach((i) => ($(i).textContent = last(cfg.dName))); ["nameR1", "nameR2"].forEach((i) => ($(i).textContent = last(cfg.rName))); }

  // Light/dark switch: starts from the system setting, remembers the choice
  const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const syncThemeBtn = () => $("themeBtn").setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode");
  $("themeBtn").onclick = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("vt-theme", next); } catch (e) {}
    syncThemeBtn(); buildGauges(); if (out) render();
  };
  syncThemeBtn();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { buildGauges(); if (out) render(); });

  fillPrior(); setNames(); buildGauges();
  recompute("Pre-election");
  requestAnimationFrame(tick);

  if (location.protocol.startsWith("http")) startHosted().catch(startSOS);
  else startSOS();
})();
