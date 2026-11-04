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
  const JITTER = 0.35; // share of the model's spread the needles wobble across (1 = full NYT-style)
  const gP = { node: null, cur: 0, target: 0 };
  const gM = { node: null, cur: 0, target: 0 };
  const setAngle = (g) => g.node && g.node.setAttribute("transform", `rotate(${g.cur} ${CX} ${CY})`);

  // jitter: pick a new target inside the model's uncertainty every ~0.4s, ease toward it
  let lastJ = 0;
  function tick(ts) {
    if (out) {
      if (ts - lastJ > 900) {
        lastJ = ts;
        const p = out.pWin;
        let pj = p, mj = out.margin.med;
        if (cfg.jitter) {
          const sd = JITTER * Math.sqrt((p * (1 - p)) / 30);
          pj = Math.max(0, Math.min(1, p + sd * randn()));
          mj = out.margin.med + JITTER * (out.margin.p25 + Math.random() * (out.margin.p75 - out.margin.p25) - out.margin.med);
        }
        gP.target = (pj - 0.5) * 180;
        gM.target = mAng(mj);
      }
      for (const g of [gP, gM]) { g.cur += (g.target - g.cur) * 0.05; setAngle(g); }
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

    renderTable(); renderPast(); renderMap(); renderHistory();
  }

  // Past governor races: statewide result, and the same towns that have fully reported tonight
  const PAST = [[22, "2022", "Siegel"], [20, "2020", "Zuckerman"], [18, "2018", "Hallquist"], [16, "2016", "Minter"]];
  function renderPast() {
    const rows = window.VT_BASELINE, reported = model.towns.filter((t) => { const x = results.get(t.key); return x && x.frac >= 0.999; });
    const mg = (r, d, o) => (r + d + o > 0 ? (100 * (r - d)) / (r + d + o) : null);
    let nr = 0, nd = 0, no = 0;
    reported.forEach((t) => { const x = results.get(t.key); nr += x.r; nd += x.d; no += x.o; });
    const now = mg(nr, nd, no);
    const cell = (m) => `<td class="${cls(m)}">${m == null ? "—" : fmtM(m, true)}</td>`;
    const shift = (m) => (now == null || m == null ? "<td>—</td>" : `<td class="${cls(now - m)}">${(now - m > 0 ? "R" : "D")} +${Math.abs(now - m).toFixed(1)}</td>`);
    const body = [`<tr><td>2026 · ${last(cfg.dName)}</td><td class="${cls(out.margin.med)}">${fmtM(out.margin.med, true)} <span class="est">est.</span></td>${cell(now)}<td>—</td></tr>`];
    for (const [y, label, dem] of PAST) {
      const k = (f) => f + y;
      const st = mg(...["r", "d", "o"].map((f) => rows.reduce((a, r) => a + r[k(f)], 0)));
      const same = reported.length ? mg(...["r", "d", "o"].map((f) => reported.reduce((a, t) => a + rows[t.i][k(f)], 0))) : null;
      body.push(`<tr><td>${label} · ${dem}</td>${cell(st)}${cell(same)}${shift(same)}</tr>`);
    }
    $("ptab").innerHTML = `<thead><tr><th title="Scott against the Democratic nominee">Race</th><th>Statewide</th><th title="Towns fully counted tonight">Same towns (${reported.length})</th><th title="How far tonight\u2019s vote has moved from that race, in the towns fully counted tonight">Shift to 2026</th></tr></thead><tbody>${body.join("")}</tbody>`;
  }

  // Shift-in-margin map: an arrow per fully counted town, tilted up-left (more Dem.) or
  // up-right (more Rep.) with length proportional to the shift since the chosen race.
  let mapYear = 22;
  const MAPNAMES = { 22: "2022", 20: "2020", 18: "2018", 16: "2016" };
  const arrowPath = (x, y, len, right) => {
    const a = (30 * Math.PI) / 180, dx = Math.cos(a) * len * (right ? 1 : -1), dy = -Math.sin(a) * len;
    const ex = x + dx, ey = y + dy, h = Math.min(4, 2 + len * 0.12), ux = dx / len, uy = dy / len;
    const bx = ex - ux * h * 1.6, by = ey - uy * h * 1.6;
    return { line: `M${x},${y}L${bx.toFixed(1)},${by.toFixed(1)}`, head: `M${ex.toFixed(1)},${ey.toFixed(1)}L${(bx - uy * h).toFixed(1)},${(by + ux * h).toFixed(1)}L${(bx + uy * h).toFixed(1)},${(by - ux * h).toFixed(1)}Z` };
  };
  function renderMap() {
    const V = window.VT_MAP, svg = $("shiftMap"); if (!V || !svg) return;
    const rows = window.VT_BASELINE, y = mapYear;
    svg.setAttribute("viewBox", `-6 -6 ${V.w + 12} ${V.h + 12}`);
    svg.innerHTML = "";
    el("path", { d: V.state, class: "state" }, svg);
    V.counties.forEach((c) => el("path", { d: c.d, class: "county" }, svg));
    const shifts = [];
    mapInfo = [];
    let sr = 0, sd = 0, so = 0, pr = 0, pd = 0, po = 0;
    for (const t of model.towns) {
      const p = V.towns[t.name]; if (!p) continue;
      const x = results.get(t.key), b = rows[t.i];
      const ptot = b["r" + y] + b["d" + y] + b["o" + y], past = ptot ? (100 * (b["r" + y] - b["d" + y])) / ptot : null;
      const tot = x ? x.r + x.d + x.o : 0, now = tot ? (100 * (x.r - x.d)) / tot : null;
      const info = { name: t.name, county: t.county, p, now, past, votes: tot, frac: x ? x.frac : 0, sh: null };
      mapInfo.push(info);
      if (!x || x.frac < 0.999) { el("circle", { cx: p[0], cy: p[1], r: 1.6, class: "dot" }, svg); continue; }
      if (!tot || !ptot) continue;
      const sh = now - past;
      info.sh = sh;
      shifts.push({ p, sh, tot, info });
      sr += x.r; sd += x.d; so += x.o; pr += b["r" + y]; pd += b["d" + y]; po += b["o" + y];
    }
    // Scale so a typical (90th-percentile) shift draws about 26 units long
    const mags = shifts.map((s) => Math.abs(s.sh)).sort((a, b) => a - b);
    const ref = Math.max(5, mags.length ? mags[Math.floor(mags.length * 0.9)] : 10), k = 26 / ref;
    const g = el("g", {}, svg);
    shifts.sort((a, b) => a.tot - b.tot).forEach(({ p, sh, info }) => {
      const len = Math.max(2.5, Math.min(44, Math.abs(sh) * k)), ap = arrowPath(p[0], p[1], len, sh > 0), col = css(sh > 0 ? "--rep" : "--dem");
      const ag = el("g", { class: "arrow" }, g);
      el("path", { d: ap.line, stroke: col, "stroke-width": 1.4, "stroke-linecap": "round", fill: "none" }, ag);
      el("path", { d: ap.head, fill: col }, ag);
      // arrow midpoint, so hovering the arrow body also finds the town
      const a = (30 * Math.PI) / 180;
      info.mid = [p[0] + (sh > 0 ? 1 : -1) * Math.cos(a) * len * 0.6, p[1] - Math.sin(a) * len * 0.6];
      info.el = ag;
    });
    mapRing = el("circle", { r: 4.5, class: "ring", style: "display:none" }, svg);
    V.labels.forEach(([n, x, yy]) => { const t = el("text", { x: x + 4, y: yy - 3, class: "city" }, svg); t.textContent = n.replace(/ City$/, ""); });
    // Legend
    const lg = $("legendArrows"); lg.innerHTML = "";
    [[false, 62, "More Dem."], [true, 104, "More Rep."]].forEach(([right, x, label]) => {
      const ap = arrowPath(x + (right ? -10 : 10), 18, 22, right), col = css(right ? "--rep" : "--dem");
      el("path", { d: ap.line, stroke: col, "stroke-width": 2, "stroke-linecap": "round", fill: "none" }, lg);
      el("path", { d: ap.head, fill: col }, lg);
      const t = el("text", { x: right ? x + 8 : x - 8, y: 31, "text-anchor": right ? "start" : "end" }, lg); t.textContent = label;
    });
    const n = shifts.length, name = MAPNAMES[y];
    $("mapNote").textContent = n ? `Compared with ${name}, in the ${n} towns fully counted. Longer arrows mean bigger shifts.` : "Arrows appear as towns finish counting.";
    // One-line summary above the table
    if (n) {
      const shift = (100 * (sr - sd)) / (sr + sd + so) - (100 * (pr - pd)) / (pr + pd + po), side = shift > 0 ? "r" : "d";
      $("pastLede").innerHTML = `The towns that are fully counted voted <b class="${side}">${Math.abs(shift).toFixed(0)} points more ${shift > 0 ? "Republican" : "Democratic"}</b> than they did in the ${name} governor’s race.`;
    } else $("pastLede").textContent = "";
  }
  // Hover / tap details for the map: nearest town point or arrow under the pointer
  let mapInfo = [], mapRing = null, mapHot = null;
  function mapHover(ev) {
    const svg = $("shiftMap"), fig = svg.closest(".map"), tip = $("mapTip");
    const m = svg.getScreenCTM(); if (!m || !mapInfo.length) return;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    let best = null, bd = 12 * 12;
    for (const t of mapInfo) {
      for (const q of t.mid ? [t.p, t.mid] : [t.p]) {
        const d = (q[0] - pt.x) ** 2 + (q[1] - pt.y) ** 2;
        if (d < bd) { bd = d; best = t; }
      }
    }
    if (mapHot && mapHot !== best && mapHot.el) mapHot.el.classList.remove("hot");
    mapHot = best;
    if (!best) { tip.hidden = true; mapRing.style.display = "none"; return; }
    if (best.el) best.el.classList.add("hot");
    mapRing.setAttribute("cx", best.p[0]); mapRing.setAttribute("cy", best.p[1]); mapRing.style.display = "";
    const name = MAPNAMES[mapYear], col = (v) => (v == null ? "" : v > 0 ? "r" : "d");
    const status = best.frac >= 0.999 ? "Fully counted" : best.votes ? `Partly counted (~${Math.round(best.frac * 100)}%)` : "No results yet";
    tip.innerHTML = `<div class="tt-h"><b>${best.name.replace(/ City$/, "")}</b><span>${best.county}</span></div>
      <div class="tt-r"><span>2026</span><b class="${col(best.now)}">${best.now == null ? "—" : fmtM(best.now, true)}</b></div>
      <div class="tt-r"><span>${name}</span><b class="${col(best.past)}">${best.past == null ? "—" : fmtM(best.past, true)}</b></div>
      ${best.sh != null ? `<div class="tt-r tt-s"><span>Shift</span><b class="${col(best.sh)}">${best.sh > 0 ? "R" : "D"} +${Math.abs(best.sh).toFixed(1)}</b></div>` : ""}
      <div class="tt-f">${status}${best.votes ? ` · ${num(best.votes)} votes` : ""}</div>`;
    tip.hidden = false;
    const fr = fig.getBoundingClientRect(), sp = new DOMPoint(best.p[0], best.p[1]).matrixTransform(m);
    let x = sp.x - fr.left + 14, yy = sp.y - fr.top - 10;
    if (x + tip.offsetWidth > fr.width - 6) x = sp.x - fr.left - tip.offsetWidth - 14;
    yy = Math.max(6, Math.min(yy, fr.height - tip.offsetHeight - 6));
    tip.style.left = x + "px"; tip.style.top = yy + "px";
  }
  function mapLeave() { $("mapTip").hidden = true; if (mapRing) mapRing.style.display = "none"; if (mapHot && mapHot.el) mapHot.el.classList.remove("hot"); mapHot = null; }
  $("shiftMap").addEventListener("pointermove", mapHover);
  $("shiftMap").addEventListener("pointerdown", mapHover);
  $("shiftMap").addEventListener("pointerleave", mapLeave);

  document.querySelectorAll("#mapYear button").forEach((b) => (b.onclick = () => {
    mapYear = +b.dataset.y; mapLeave();
    document.querySelectorAll("#mapYear button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderMap();
  }));

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
