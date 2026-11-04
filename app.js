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
  let apCall = null;

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
  }
  const MRANGE = 60;
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
        if (cfg.jitter && !apCall) {
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

  function render(label) {
    const o = out, p = o.pWin;
    $("probBig").innerHTML = p >= 0.5 ? `<span style="color:var(--rep)">${pct(p)} ${last(cfg.rName)}</span>` : `<span style="color:var(--dem)">${pct(1 - p)} ${last(cfg.dName)}</span>`;
    $("marginBig").innerHTML = `<span class="${cls(o.margin.med)}" style="color:var(--${o.margin.med > 0 ? "rep" : "dem"})">${fmtM(o.margin.med)}</span>`;
    $("marginSub").textContent = `90% range: ${fmtM(o.margin.p05, true)} to ${fmtM(o.margin.p95, true)}`;

    const leader = p >= 0.5 ? cfg.rName : cfg.dName, lc = p >= 0.5 ? "r" : "d", d = describe(p);
    let h;
    const verdict = { "very likely": "very likely to win", likely: "likely to win", "leaning toward": "leans ahead" }[d];
    if (apCall) h = `<b class="${apCall}">${apCall === "r" ? cfg.rName : cfg.dName}</b> wins (AP).`;
    else if (!o.counted.total) h = `Pre-election: <b class="${lc}">${leader}</b> ${verdict || "even"}.`;
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
    $("liveTxt").textContent = apCall ? "Final" : live ? "Live" : "Pre-election";
    $("stamp").textContent = (label ? label + " · " : "") + "Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

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
    const W = 820, L = 52, Rt = 14, T1 = 10, H1 = 150, T2 = 190, H2 = 56;
    const n = history.length; if (!n) return;
    const xs = (i) => L + (n === 1 ? (W - L - Rt) / 2 : (i / (n - 1)) * (W - L - Rt));
    let lo = Math.min(0, ...history.map((h) => h.p05)), hi = Math.max(0, ...history.map((h) => h.p95));
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const ym = (m) => T1 + H1 - ((m - lo) / (hi - lo)) * H1;
    const yp = (p) => T2 + H2 - p * H2;
    const F = css("--faint"), Rr = css("--rep"), D = css("--dem"), FG = css("--fg"), RULE = css("--rule");
    for (let v = lo; v <= hi; v += 10) {
      el("line", { x1: L, x2: W - Rt, y1: ym(v), y2: ym(v), stroke: v === 0 ? F : RULE }, svg);
      const t = el("text", { x: L - 6, y: ym(v) + 4, "text-anchor": "end" }, svg); t.textContent = v === 0 ? "Even" : (v > 0 ? "R+" : "D+") + Math.abs(v);
    }
    const band = (a, b, op) => {
      const d = history.map((h, i) => `${i ? "L" : "M"}${xs(i)},${ym(h[a])}`).join("") + history.slice().reverse().map((h, j) => `L${xs(n - 1 - j)},${ym(h[b])}`).join("") + "Z";
      el("path", { d, fill: FG, "fill-opacity": op }, svg);
    };
    if (n > 1) { band("p05", "p95", 0.07); band("p25", "p75", 0.12); }
    el("polyline", { points: history.map((h, i) => `${xs(i)},${ym(h.med)}`).join(" "), fill: "none", stroke: FG, "stroke-width": 2 }, svg);
    const lh = history[n - 1];
    el("circle", { cx: xs(n - 1), cy: ym(lh.med), r: 4, fill: lh.med > 0 ? Rr : D }, svg);

    [0, 0.5, 1].forEach((v) => {
      el("line", { x1: L, x2: W - Rt, y1: yp(v), y2: yp(v), stroke: v === 0.5 ? F : RULE, "stroke-dasharray": v === 0.5 ? "3 3" : "" }, svg);
      const t = el("text", { x: L - 6, y: yp(v) + 4, "text-anchor": "end" }, svg); t.textContent = v === 0.5 ? "50%" : v ? "100%" : "0%";
    });
    const t2 = el("text", { x: L, y: T2 - 8 }, svg); t2.textContent = `Chance ${last(cfg.rName)} wins`;
    el("polyline", { points: history.map((h, i) => `${xs(i)},${yp(h.p)}`).join(" "), fill: "none", stroke: Rr, "stroke-width": 2 }, svg);
    const t3 = el("text", { x: W - Rt, y: T2 + H2 + 18, "text-anchor": "end" }, svg); t3.textContent = `${pct(lh.pctIn)} of expected vote counted →`;
    const t4 = el("text", { x: L, y: T2 + H2 + 18 }, svg); t4.textContent = "Start";
  }

  // ---------- Data sources ----------
  function ingest(input, msgEl, label) {
    const msg = $(msgEl); msg.classList.remove("err");
    try {
      let parsed, obj = typeof input === "string" ? null : input;
      if (!obj) {
        const text = input.trim();
        if (text[0] === "{" || text[0] === "[") obj = JSON.parse(text);
        else parsed = M.parseCSV(text, model, cfg);
      }
      if (obj) parsed = obj.races ? M.parseAP(obj, model, cfg) : M.parseSOS(obj, model, cfg);
      results = parsed.results;
      apCall = parsed.apState && parsed.apState.winner ? parsed.apState.winner : null;
      recompute(label);
      msg.textContent = `Matched ${parsed.results.size} towns.` + (parsed.unmatched.length ? ` Unmatched: ${parsed.unmatched.slice(0, 12).join(", ")}${parsed.unmatched.length > 12 ? "…" : ""}` : "");
    } catch (e) { msg.classList.add("err"); msg.textContent = "Couldn’t read data: " + e.message; }
  }

  // Demo
  let demo = null, demoTimer = null, demoI = 0;
  function demoInit() { demo = M.demoNight(model, (Math.random() * 1e9) | 0); demoI = 0; apCall = null; results = new Map(); history = []; recompute("Before polls close"); $("demoMsg").textContent = ""; }
  function demoStep() {
    if (!demo) demoInit();
    if (demoI >= demo.steps.length) { stopDemo(); $("demoMsg").textContent = `Count complete. The true final margin was ${fmtM(demo.finalMargin)}.`; return; }
    results = demo.steps[demoI++];
    recompute(`Demo update ${demoI} of ${demo.steps.length}`);
    $("demoMsg").textContent = `Update ${demoI} of ${demo.steps.length}. The true result is hidden until the count is complete.`;
  }
  function stopDemo() { clearInterval(demoTimer); demoTimer = null; $("demoPlay").textContent = "Start demo"; }
  $("demoPlay").onclick = () => {
    if (demoTimer) return stopDemo();
    stopAP();
    if (!demo || demoI >= demo.steps.length) demoInit();
    demoTimer = setInterval(demoStep, +$("demoSpeed").value);
    $("demoPlay").textContent = "Pause";
  };
  $("demoStep").onclick = () => { stopAP(); demoStep(); };
  $("demoReset").onclick = () => { stopDemo(); demoInit(); };

  // Vermont SOS, read directly (the CDN sends Access-Control-Allow-Origin: *).
  // Each check fetches the small election index; the ~0.5 MB statewide file is
  // downloaded only when its timestamped path changes.
  const SOS = "https://static.electionresults.vermont.gov";
  let sosTimer = null, sosGuid = null, sosPath = null, sosLast = null;
  const getJSON = async (u) => { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  async function sosFetch() {
    const msg = $("sosMsg"); msg.classList.remove("err");
    try {
      if (!sosGuid) {
        const idx = await getJSON(`${SOS}/elections/elections.json`);
        const e = idx.find((x) => x.isGeneralElection && x.isStateWideElection && /^2026-11-03/.test(x.electionDate));
        if (!e) throw new Error("2026 general election not found in SOS index");
        sosGuid = e.electionGuid;
      }
      const el = await getJSON(`${SOS}/elections/${sosGuid}.json`);
      const path = el.stateWide && el.stateWide.path && el.stateWide.path.replace(/\\/g, "/");
      if (!path) throw new Error("No statewide results posted yet");
      const when = el.lastUpdatedDate ? `SOS updated ${el.lastUpdatedDate}` : "SOS";
      if (path === sosPath) { msg.textContent = `No new results (${when}, ${el.townsReportingFormat || ""} towns). Checked ${new Date().toLocaleTimeString()}.`; return; }
      const s = await getJSON(`${SOS}/${path}`);
      let gov = null;
      for (const blk of s.d || []) for (const o of blk.o || []) if (/^GOVERNOR$/i.test(o.on)) gov = o;
      sosPath = path; sosLast = { gov, lastUpdated: el.lastUpdatedDate, townsReporting: el.townsReporting };
      ingest(sosLast, "sosMsg", when);
      msg.textContent = `${when} · ${el.townsReportingFormat || ""} towns reporting · ` + msg.textContent;
    } catch (e) { msg.classList.add("err"); msg.textContent = "SOS fetch failed: " + e.message + ". Will retry."; }
  }
  function stopSOS() { clearInterval(sosTimer); sosTimer = null; $("sosStart").textContent = "Start live updates"; }
  function startSOS() {
    stopDemo(); stopAP(); demo = null;
    if (!sosLast) history = [];
    sosFetch(); sosTimer = setInterval(sosFetch, Math.max(60, +$("sosEvery").value) * 1000);
    $("sosStart").textContent = "Stop live updates";
  }
  $("sosStart").onclick = () => (sosTimer ? stopSOS() : startSOS());
  $("sosOnce").onclick = () => { sosPath = null; sosFetch(); };

  // AP polling
  let apTimer = null, lastAPText = "";
  async function apFetch() {
    const url = $("apUrl").value.trim();
    try {
      const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const text = await r.text();
      if (text === lastAPText) { $("apMsg").textContent = "No change at " + new Date().toLocaleTimeString(); return; }
      lastAPText = text;
      ingest(text, "apMsg", "AP");
    } catch (e) { $("apMsg").classList.add("err"); $("apMsg").textContent = "Fetch failed: " + e.message + (location.protocol === "file:" ? " (open via http://localhost, not as a file)" : ""); }
  }
  function stopAP() { clearInterval(apTimer); apTimer = null; $("apStart").textContent = "Start polling"; }
  $("apStart").onclick = () => {
    if (apTimer) return stopAP();
    stopDemo(); demo = null; history = [];
    apFetch(); apTimer = setInterval(apFetch, Math.max(5, +$("apEvery").value) * 1000);
    $("apStart").textContent = "Stop polling";
  };
  $("apOnce").onclick = () => { stopDemo(); apFetch(); };

  // File / paste
  $("fileIn").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; stopDemo(); stopAP(); ingest(await f.text(), "fileMsg", f.name); };
  $("pasteGo").onclick = () => { stopDemo(); stopAP(); ingest($("pasteIn").value, "fileMsg", "Pasted data"); };

  // Priors
  const fillPrior = () => { $("pMargin").value = prior.margin; $("pSd").value = prior.marginSd; $("pTurn").value = prior.turnout; $("pOther").value = prior.otherShare; };
  $("applyPrior").onclick = () => {
    prior = { ...prior, margin: +$("pMargin").value, marginSd: Math.max(2, +$("pSd").value), turnout: Math.max(50000, +$("pTurn").value), otherShare: Math.min(0.3, Math.max(0, +$("pOther").value)) };
    cfg.rName = $("cR").value.trim() || cfg.rName; cfg.dName = $("cD").value.trim() || cfg.dName;
    cfg.rLast = last(cfg.rName); cfg.dLast = last(cfg.dName); cfg.jitter = $("jitter").checked;
    setNames();
    model = M.build(window.VT_BASELINE, prior);
    // re-key existing results against the rebuilt model (same keys)
    history = []; demo = null; stopDemo();
    recompute("Priors updated");
  };
  $("jitter").onchange = () => (cfg.jitter = $("jitter").checked);
  function setNames() { ["nameD1", "nameD2"].forEach((i) => ($(i).textContent = last(cfg.dName))); ["nameR1", "nameR2"].forEach((i) => ($(i).textContent = last(cfg.rName))); }

  // Tabs
  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".src").forEach((s) => s.classList.toggle("on", s.dataset.src === b.dataset.src));
  }));

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { buildGauges(); if (out) render(); });

  fillPrior(); setNames(); buildGauges();
  recompute("Pre-election");
  requestAnimationFrame(tick);

  // If fetch_ap.py has written results, switch to the AP feed automatically.
  // (This only reads the local file; it never contacts AP.)
  // Otherwise go live from the Vermont SOS feed.
  const goSOS = () => { if (!apTimer && !demoTimer && !sosTimer && !hostedTimer) startSOS(); };

  // Hosted mode: a GitHub Action polls SOS and commits live/latest.json + live/history.json.
  // Viewers read only those files from this site, never SOS itself.
  let hostedTimer = null, hostedLast = null;
  async function hostedFetch() {
    const msg = $("sosMsg"); msg.classList.remove("err");
    try {
      const r = await fetch("live/latest.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const snap = await r.json();
      if (snap.path === hostedLast) { msg.textContent = `No new results (SOS updated ${snap.sosUpdated}, ${snap.townsReporting} towns). Checked ${new Date().toLocaleTimeString()}.`; return; }
      hostedLast = snap.path;
      ingest(snap, "sosMsg", `SOS updated ${snap.sosUpdated}`);
      msg.textContent = `SOS updated ${snap.sosUpdated} · ${snap.townsReporting} towns reporting · ` + msg.textContent;
    } catch (e) { msg.classList.add("err"); msg.textContent = "Couldn’t load results: " + e.message + ". Will retry."; }
  }
  async function startHosted() {
    const r = await fetch("live/history.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("no hosted history");
    const snaps = await r.json();
    if (!snaps.length) throw new Error("empty history");
    stopDemo(); stopAP(); stopSOS(); demo = null; history = [];
    // Replay the night so the timeline is complete (fewer draws for speed)
    for (const s of snaps.slice(0, -1)) {
      try {
        results = M.parseSOS(s, model, cfg).results;
        const o = M.run(model, results, { draws: 400, seed: 7 });
        history.push({ label: s.sosUpdated, p: o.pWin, ...o.margin, pctIn: o.counted.pctIn });
      } catch (e) { /* skip bad snapshot */ }
    }
    $("sosStart").textContent = "Live (hosted)"; $("sosStart").disabled = true;
    document.querySelector('.src[data-src="sos"] .note').textContent =
      "Unofficial town results from the Vermont Secretary of State, collected every 2 minutes.";
    await hostedFetch();
    hostedTimer = setInterval(hostedFetch, 60000);
  }

  if (location.protocol.startsWith("http") && !/claude|artifact/.test(location.hostname)) {
    startHosted().catch(() =>
      fetch("results/latest.json", { method: "HEAD", cache: "no-store" }).then((r) => {
        if (!r.ok || apTimer || demoTimer) return goSOS();
        document.querySelector('#tabs button[data-src="ap"]').click();
        $("apStart").click();
      }).catch(goSOS));
  } else goSOS();
})();
