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

  // Thick tapered needle in the leader's color, drawn pointing straight up; rotated by setAngle.
  function needle(svg, len) {
    const g = el("g", { class: "needle" }, svg);
    el("path", { d: `M${CX - 7},${CY} L${CX - 1.2},${CY - len} L${CX + 1.2},${CY - len} L${CX + 7},${CY} Z` }, g);
    el("circle", { cx: CX, cy: CY, r: 11 }, g);
    return g;
  }

  function drawProbGauge(svg) {
    svg.innerHTML = "";
    const D = css("--dem"), Rr = css("--rep"), F = css("--faint");
    const P = (p) => (p - 0.5) * 180;
    [[0, .05, D, .9], [.05, .25, D, .5], [.25, .4, D, .2], [.4, .6, F, .15], [.6, .75, Rr, .2], [.75, .95, Rr, .5], [.95, 1, Rr, .9]]
      .forEach(([a0, a1, fill, op]) => el("path", { d: arc(P(a0), P(a1), R0, R1), fill, "fill-opacity": op, stroke: css("--panel"), "stroke-width": 2 }, svg));
    [[.02, "Very likely"], [.15, "Likely"], [.33, "Lean"], [.5, "Toss-up"], [.67, "Lean"], [.85, "Likely"], [.98, "Very likely"]].forEach(([p, t]) => {
      const a = P(p), [x, y] = pt(a, R1 + 10);
      const tx = el("text", { x, y, "text-anchor": a < -5 ? "end" : a > 5 ? "start" : "middle", "dominant-baseline": a === 0 ? "auto" : "middle" }, svg);
      tx.textContent = t;
    });
    el("line", { x1: CX - R1 - 6, x2: CX + R1 + 6, y1: CY, y2: CY, stroke: css("--line-strong") }, svg);
    gP.node = needle(svg, R1 - 8);
  }

  // Margin dial, NYT-style: zoomed to the race, plain ticks, the range of estimates as wedges
  // fanning from the pivot (light = 90% of outcomes, dark = middle 50%), a line at Even.
  const SCALES = [[10, 2, 1], [15, 3, 1], [20, 4, 2], [30, 10, 5], [40, 10, 5], [60, 20, 5]]; // [max, label step, tick step]
  let mScale = SCALES[5];
  const mAng = (m) => (Math.max(-mScale[0], Math.min(mScale[0], m)) / mScale[0]) * 90;
  function pickScale(m) {
    const need = 1.15 * Math.max(Math.abs(m.p05), Math.abs(m.p95), 1);
    const fit = SCALES.find((s) => s[0] >= need) || SCALES[SCALES.length - 1];
    // only change when the range no longer fits, or would fit a scale less than half as wide
    if (fit[0] > mScale[0] || fit[0] * 2 <= mScale[0]) { mScale = fit; return true; }
    return false;
  }
  const wedge = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${CX},${CY}L${x0},${y0}A${r},${r} 0 0 1 ${x1},${y1}Z`; };
  const HUB = 56;
  function drawMarginGauge(svg) {
    svg.innerHTML = "";
    const [S, lab, tk] = mScale, F = css("--faint"), INK = css("--ink");
    gM.w90 = el("path", { "fill-opacity": 0.22 }, svg);
    gM.w50 = el("path", { "fill-opacity": 0.4 }, svg);
    el("path", { d: `M${CX - R1},${CY}A${R1},${R1} 0 0 1 ${CX + R1},${CY}`, fill: "none", stroke: css("--line-strong") }, svg);
    for (let v = -S; v <= S + 1e-9; v += tk) {
      const a = mAng(v), major = Math.abs(v / lab - Math.round(v / lab)) < 1e-9;
      const [x0, y0] = pt(a, R1), [x1, y1] = pt(a, R1 - (major ? 9 : 5));
      el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: F }, svg);
      if (major && Math.abs(v) > 1e-9) {
        const [x, y] = pt(a, R1 - 22);
        const t = el("text", { x, y, "text-anchor": "middle", "dominant-baseline": "middle", class: v > 0 ? "lab-r" : "lab-d" }, svg);
        t.textContent = "+" + Math.abs(v);
      }
    }
    const [zx, zy] = pt(0, R1);
    el("line", { x1: CX, y1: CY - HUB, x2: zx, y2: zy - 4, stroke: INK, "stroke-width": 1.5 }, svg);
    const ev = el("text", { x: zx, y: zy - 10, "text-anchor": "middle" }, svg); ev.textContent = "Even";
    el("path", { d: `M${CX - HUB},${CY}A${HUB},${HUB} 0 0 1 ${CX + HUB},${CY}Z`, fill: css("--panel"), stroke: css("--line-strong") }, svg);
    el("line", { x1: CX - R1 - 6, x2: CX + R1 + 6, y1: CY, y2: CY, stroke: css("--line-strong") }, svg);
    // "Range of estimates" bracket + curved label over the 90% wedge
    gM.bracket = el("path", { fill: "none", stroke: F, "stroke-width": 1.2 }, svg);
    el("path", { id: "rangeLabelPath", d: "", fill: "none" }, svg);
    const t = el("text", { class: "range-label" }, svg);
    const tp = el("textPath", { href: "#rangeLabelPath", startOffset: "50%", "text-anchor": "middle" }, t);
    tp.textContent = "Range of estimates";
    gM.node = needle(svg, R1 - 8);
    drawRange();
  }
  function drawRange() {
    if (!out || !gM.w90) return;
    const m = out.margin, col = css(m.med > 0 ? "--rep" : "--dem");
    const a05 = mAng(m.p05), a95 = Math.max(a05 + 0.6, mAng(m.p95)), a25 = mAng(m.p25), a75 = Math.max(a25 + 0.4, mAng(m.p75));
    gM.w90.setAttribute("d", wedge(a05, a95, R1)); gM.w90.setAttribute("fill", col);
    gM.w50.setAttribute("d", wedge(a25, a75, R1)); gM.w50.setAttribute("fill", col);
    const rb = R1 + 6, [bx0, by0] = pt(a05, rb), [bx1, by1] = pt(a95, rb);
    gM.bracket.setAttribute("d", `M${bx0},${by0}A${rb},${rb} 0 0 1 ${bx1},${by1}`);
    const mid = (a05 + a95) / 2, rl = R1 + 11, [lx0, ly0] = pt(mid - 40, rl), [lx1, ly1] = pt(mid + 40, rl);
    document.getElementById("rangeLabelPath").setAttribute("d", `M${lx0},${ly0}A${rl},${rl} 0 0 1 ${lx1},${ly1}`);
    for (const g of [gP, gM]) if (g.node) g.node.setAttribute("fill", g === gP ? css(out.pWin >= 0.5 ? "--rep" : "--dem") : col);
  }

  function buildGauges() {
    drawProbGauge($("gProb"));
    drawMarginGauge($("gMargin"));
    setAngle(gP); setAngle(gM);
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
        gM.target = mAng(mj);
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

  let lastLabel = "";
  function render(label) {
    const o = out, p = o.pWin;
    // NYT-style captions: verdict / chance, and margin / range of estimates
    const lead = p >= 0.5 ? last(cfg.rName) : last(cfg.dName), pv = Math.max(p, 1 - p), pc = p >= 0.5 ? "rep" : "dem";
    const word = pv >= 0.95 ? "Very likely" : pv >= 0.75 ? "Likely" : pv >= 0.6 ? "Leans" : null;
    $("probBig").innerHTML = word ? `<span style="color:var(--${pc})">${word} ${lead}</span>` : "Toss-up";
    $("probSub").textContent = `${pv >= 0.95 ? ">95%" : Math.round(pv * 100) + "%"} chance of winning`;
    $("marginBig").innerHTML = `<span style="color:var(--${o.margin.med > 0 ? "rep" : "dem"})">${fmtM(o.margin.med)}</span>`;
    $("marginSub").textContent = `${fmtM(o.margin.p05)} to ${fmtM(o.margin.p95)}`;
    if (pickScale(o.margin)) drawMarginGauge($("gMargin")), setAngle(gM);
    drawRange();



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
