// Vermont governor live model.
//
// Pre-election: every town gets an expected Scott two-party share
// (statewide prior + the town's historical lean) and an expected turnout.
// On election night: reported towns tell us how far the state (and each
// county) is running from expectations. Those swings are estimated with a
// simple hierarchical normal model and applied to the towns still out,
// then Monte Carlo draws give a distribution of final outcomes.

(function (root) {
  "use strict";

  const logit = (p) => Math.log(p / (1 - p));
  const inv = (x) => 1 / (1 + Math.exp(-x));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  function rng(seed) {
    let a = seed >>> 0;
    const u = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let spare = null;
    u.normal = () => {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let x, y, r;
      do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (!r || r >= 1);
      const m = Math.sqrt((-2 * Math.log(r)) / r);
      spare = y * m;
      return x * m;
    };
    return u;
  }

  const DEFAULT_PRIOR = {
    margin: 40,        // expected Scott − Dem margin, points of total vote
    marginSd: 14,      // uncertainty of that statewide prior, points
    turnout: 290000,   // expected total governor votes
    turnoutSd: 0.08,   // log-sd of statewide turnout
    otherShare: 0.04,  // statewide third-party + write-in share
  };

  // Tunables for the live update
  const SIG = {
    county: 0.10,      // county swing deviation from state (logit)
    town: 0.22,        // town idiosyncratic deviation (logit)
    countyTurn: 0.06,  // county turnout deviation (log)
    townTurn: 0.12,    // town turnout deviation (log)
  };

  const norm = (s) =>
    String(s).toLowerCase()
      .replace(/\bsaint\b/g, "st").replace(/[.'’]/g, "")
      .replace(/\b(town|city) of\b/g, "").replace(/\s+/g, " ").trim();

  function build(rows, priorIn) {
    const prior = Object.assign({}, DEFAULT_PRIOR, priorIn || {});
    // Weights for each past governor race in the town "lean" (Scott vs. the Democrat,
    // relative to the state) and in each town's expected share of the statewide vote.
    // Recent and competitive races count more; midterms drive the turnout geography.
    const YEARS = [
      { y: 16, lean: 0.20, turn: 0.00 },
      { y: 18, lean: 0.30, turn: 0.30 },
      { y: 20, lean: 0.15, turn: 0.10 },
      { y: 22, lean: 0.35, turn: 0.60 },
    ].filter((Y) => rows[0]["r" + Y.y] != null);
    const lw = sum(YEARS, (Y) => Y.lean), tw = sum(YEARS, (Y) => Y.turn);
    YEARS.forEach((Y) => {
      const R = sum(rows, (r) => r["r" + Y.y]), D = sum(rows, (r) => r["d" + Y.y]);
      Y.S = R / (R + D);
      Y.T = sum(rows, (r) => r["r" + Y.y] + r["d" + Y.y] + r["o" + Y.y]);
    });
    const O = sum(YEARS, (Y) => sum(rows, (r) => r["o" + Y.y])) / sum(YEARS, (Y) => Y.T);

    const towns = rows.map((r, i) => {
      const k = 8; // pseudo-count shrink for tiny towns
      let lean = 0, w = 0, oo = 0, ot = 0;
      for (const Y of YEARS) {
        const R = r["r" + Y.y], D = r["d" + Y.y], Ot = r["o" + Y.y];
        const s = (R + k * Y.S) / (R + D + k);
        lean += (Y.lean / lw) * (logit(s) - logit(Y.S));
        w += (Y.turn / tw) * ((R + D + Ot) / Y.T);
        oo += Ot; ot += R + D + Ot;
      }
      const oRel = ((oo + 20 * O) / (ot + 20)) / O;
      return { i, name: r.town, key: norm(r.town), county: r.county, lean, w, oRel };
    });

    const o = prior.otherShare;
    const S = (1 - o + prior.margin / 100) / 2 / (1 - o); // target Scott two-party share
    // Solve for the statewide intercept so vote-weighted town shares hit S
    let lo = -6, hi = 6;
    for (let it = 0; it < 60; it++) {
      const c = (lo + hi) / 2;
      const s = sum(towns, (t) => t.w * inv(c + t.lean)) / sum(towns, (t) => t.w);
      if (s < S) lo = c; else hi = c;
    }
    const c0 = (lo + hi) / 2;
    const sdS = prior.marginSd / 100 / 2 / (1 - o);
    const sigState = sdS / (S * (1 - S));

    towns.forEach((t) => {
      t.mu = c0 + t.lean;                       // expected logit Scott two-party share
      t.expVotes = t.w * prior.turnout;
      t.expOther = Math.min(0.3, o * t.oRel);
    });

    const counties = [...new Set(towns.map((t) => t.county))].sort();
    const byKey = new Map(towns.map((t) => [t.key, t]));
    return { prior, towns, counties, byKey, sigState, S, norm };
  }

  // Combine county-level evidence into a state effect, marginalizing the
  // county effect: county mean ~ N(state, 1/P_c + sigC^2).
  function hier(obsByCounty, sigPrior, sigC) {
    let prec = 1 / (sigPrior * sigPrior), num = 0;
    const cs = {};
    for (const [c, list] of Object.entries(obsByCounty)) {
      const P = sum(list, (x) => 1 / x.v);
      if (!P) continue;
      const m = sum(list, (x) => x.e / x.v) / P;
      cs[c] = { P, m };
      const vv = 1 / P + sigC * sigC;
      prec += 1 / vv; num += m / vv;
    }
    return { mean: num / prec, sd: Math.sqrt(1 / prec), cs, sigC };
  }

  function drawCounty(h, c, state, r) {
    const x = h.cs[c];
    if (!x) return r.normal() * h.sigC;
    const pc = x.P + 1 / (h.sigC * h.sigC);
    return ((x.m - state) * x.P) / pc + r.normal() / Math.sqrt(pc);
  }

  // results: Map normKey -> { r, d, o, frac }   (frac = share of the town's vote counted)
  function run(model, results, opts) {
    opts = opts || {};
    const N = opts.draws || 2000;
    const r = rng(opts.seed || 12345);
    const { towns, prior } = model;

    const shareObs = {}, turnObs = {};
    let obsOther = 0, expOtherRep = 0, counted = { r: 0, d: 0, o: 0 };
    const rep = towns.map((t) => {
      const x = results.get(t.key);
      if (!x || x.r + x.d + x.o <= 0) return null;
      const frac = Math.max(0.01, Math.min(1, x.frac == null ? 1 : x.frac));
      const tp = x.r + x.d;
      counted.r += x.r; counted.d += x.d; counted.o += x.o;
      obsOther += x.o; expOtherRep += (x.r + x.d + x.o) * t.expOther;
      let e = 0, v = Infinity;
      if (tp > 0) {
        const s = (x.r + 0.5) / (tp + 1);
        e = logit(s) - t.mu;
        // town noise + binomial noise + extra noise for a partial count
        v = SIG.town ** 2 + 1 / (tp * s * (1 - s)) + (frac < 1 ? 0.15 ** 2 * (1 - frac) : 0);
        (shareObs[t.county] = shareObs[t.county] || []).push({ e, v });
      }
      if (frac >= 0.999 && t.expVotes > 1) {
        const u = Math.log((x.r + x.d + x.o) / t.expVotes);
        (turnObs[t.county] = turnObs[t.county] || []).push({ e: u, v: SIG.townTurn ** 2 + 1 / (x.r + x.d + x.o + 1) });
      }
      return { x, frac, e, v };
    });

    const hs = hier(shareObs, model.sigState, SIG.county);
    const ht = hier(turnObs, prior.turnoutSd, SIG.countyTurn);
    const otherK = (obsOther + 3000 * prior.otherShare) / (expOtherRep + 3000 * prior.otherShare);

    const C = model.counties;
    const margins = new Float64Array(N), totals = new Float64Array(N);
    let wins = 0;
    const cnt = {}; C.forEach((c) => (cnt[c] = { R: new Float64Array(N), D: new Float64Array(N), T: new Float64Array(N) }));

    for (let k = 0; k < N; k++) {
      const st = hs.mean + hs.sd * r.normal();
      const tu = ht.mean + ht.sd * r.normal();
      const cE = {}, cT = {};
      for (const c of C) { cE[c] = drawCounty(hs, c, st, r); cT[c] = drawCounty(ht, c, tu, r); }
      let R = 0, D = 0, Ot = 0;
      for (let i = 0; i < towns.length; i++) {
        const t = towns[i], q = rep[i];
        let tr = 0, td = 0, to = 0;
        if (q && q.frac >= 0.999) {
          tr = q.x.r; td = q.x.d; to = q.x.o;
        } else {
          let lmu = t.mu + st + cE[t.county], total, have = 0;
          if (q) {
            // partial town: lean on its own count, then add what's left
            const resid = q.e - st - cE[t.county];
            const w = (1 / q.v) / (1 / q.v + 1 / SIG.town ** 2);
            lmu += w * resid + r.normal() * Math.sqrt(1 / (1 / q.v + 1 / SIG.town ** 2));
            have = q.x.r + q.x.d + q.x.o;
            total = Math.max(have, (have / q.frac) * Math.exp(0.06 * (1 - q.frac) * r.normal()));
            tr = q.x.r; td = q.x.d; to = q.x.o;
          } else {
            lmu += SIG.town * r.normal();
            total = t.expVotes * Math.exp(tu + cT[t.county] + SIG.townTurn * r.normal());
          }
          const rem = total - have;
          const oth = rem * Math.min(0.4, t.expOther * otherK);
          const s = inv(lmu);
          tr += (rem - oth) * s; td += (rem - oth) * (1 - s); to += oth;
        }
        R += tr; D += td; Ot += to;
        const cc = cnt[t.county]; cc.R[k] += tr; cc.D[k] += td; cc.T[k] += tr + td + to;
      }
      const T = R + D + Ot;
      margins[k] = (100 * (R - D)) / T; totals[k] = T;
      if (R > D) wins++;
    }

    const q = (arr, p) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
    const totalMed = q(totals, 0.5);
    const countedAll = counted.r + counted.d + counted.o;

    const countyOut = C.map((c) => {
      const cc = cnt[c];
      const m = cc.R.map((x, k) => (100 * (x - cc.D[k])) / cc.T[k]);
      const ct = towns.filter((t) => t.county === c);
      let cr = 0, cd = 0, co = 0, nrep = 0;
      ct.forEach((t) => { const x = rep[t.i]; if (x) { cr += x.x.r; cd += x.x.d; co += x.x.o; if (x.frac >= 0.999) nrep++; } });
      const tm = q(cc.T, 0.5);
      return {
        county: c, towns: ct.length, townsIn: nrep,
        counted: cr + cd + co, expected: tm, pctIn: Math.min(1, (cr + cd + co) / tm),
        curMargin: cr + cd + co > 0 ? (100 * (cr - cd)) / (cr + cd + co) : null,
        projMargin: q(m, 0.5), lo: q(m, 0.1), hi: q(m, 0.9),
      };
    });

    return {
      pWin: wins / N,
      margin: { med: q(margins, 0.5), p05: q(margins, 0.05), p25: q(margins, 0.25), p75: q(margins, 0.75), p95: q(margins, 0.95) },
      turnout: { med: totalMed, lo: q(totals, 0.05), hi: q(totals, 0.95) },
      counted: { ...counted, total: countedAll, pctIn: countedAll / totalMed,
        margin: countedAll ? (100 * (counted.r - counted.d)) / countedAll : null },
      townsIn: rep.filter((x) => x && x.frac >= 0.999).length,
      townsPartial: rep.filter((x) => x && x.frac < 0.999).length,
      swing: { state: hs.mean, sd: hs.sd }, turnoutAdj: Math.exp(ht.mean),
      counties: countyOut,
    };
  }

  // ---------- Parsers ----------
  // Candidate classifier: config.rLast / config.dLast pick the two majors.
  function classify(cand, cfg) {
    const last = String(cand.last || cand.name || "").toLowerCase();
    const party = String(cand.party || "").toLowerCase();
    if (last.includes(cfg.rLast.toLowerCase())) return "r";
    if (last.includes(cfg.dLast.toLowerCase())) return "d";
    if (!cfg.strictNames) { if (party === "gop" || party.startsWith("rep")) return "r"; if (party.startsWith("dem")) return "d"; }
    return "o";
  }

  // AP Elections API v2 JSON (level=ru). Returns { results, unmatched, raceName, apState }
  function parseAP(json, model, cfg) {
    const races = json.races || (json.reportingUnits ? [json] : []);
    let race = races.find((x) => x.officeID === "G" && (x.raceTypeID || "G") === "G") || races.find((x) => x.officeID === "G") || races[0];
    if (!race) throw new Error("No races found in AP JSON");
    const acc = makeAcc(model);
    let apState = null;
    for (const ru of race.reportingUnits || []) {
      const tally = { r: 0, d: 0, o: 0 };
      let winner = null;
      for (const cand of ru.candidates || []) {
        const k = classify(cand, cfg);
        tally[k] += +cand.voteCount || 0;
        if (cand.winner === "X") winner = k;
      }
      if (ru.level === "state") { apState = { ...tally, winner, eevp: ru.eevp, pr: ru.precinctsReporting, pt: ru.precinctsTotal }; continue; }
      let frac = ru.eevp != null ? ru.eevp / 100 : ru.precinctsTotal ? ru.precinctsReporting / ru.precinctsTotal : 1;
      if (tally.r + tally.d + tally.o > 0 && !(frac > 0)) frac = 1; // votes but nothing "reporting": treat as complete
      acc.add(ru.reportingunitName || ru.reportingUnitName || ru.name, tally, frac);
    }
    return { ...acc.finish(), raceName: race.officeName || "Governor", apState };
  }

  // Vermont Secretary of State election-night feed (static.electionresults.vermont.gov).
  // Accepts the raw statewide file ({d:[{o:[...]}]}) or the trimmed file live.py writes
  // ({source:"vt-sos", gov:{...}}). A town can have several rows (one per House district);
  // distReported "k/n" says how many of its districts are in.
  function parseSOS(json, model, cfg) {
    // Compact snapshot from scripts/poll_sos.py: towns = [[name, scott, janoo, other, k, n], ...]
    if (Array.isArray(json.towns)) {
      const acc = makeAcc(model);
      for (const [name, r, d, o, k, n] of json.towns) acc.add(name, { r, d, o }, n > 0 ? (k > 0 ? k / n : 0.5) : 1);
      return { ...acc.finish(), apState: null, lastUpdated: json.sosUpdated || null, townsReporting: json.townsReporting || null };
    }
    let gov = json.gov;
    if (!gov) for (const blk of json.d || []) for (const o of blk.o || []) if (/^GOVERNOR$/i.test(o.on)) gov = o;
    if (!gov) throw new Error("No GOVERNOR office in SOS data");
    const byTown = new Map();
    for (const c of gov.cs || []) {
      if (!c.tn || /STATE ?WIDE/i.test(c.tn)) continue;
      const e = byTown.get(c.tn) || { r: 0, d: 0, o: 0, k: 0, n: 0 };
      for (const x of [...(c.rc || []), ...(c.wc || [])]) e[classify({ last: x.cn, party: x.pn }, cfg)] += +x.vc || 0;
      const [k, n] = String(c.distReported || "1/1").split("/").map(Number);
      e.k = Math.max(e.k, k || 0); e.n = Math.max(e.n, n || 0);
      byTown.set(c.tn, e);
    }
    const acc = makeAcc(model);
    for (const [name, e] of byTown) {
      // votes posted but no district marked complete: assume about half is in
      const frac = e.n > 0 ? (e.k > 0 ? e.k / e.n : 0.5) : 1;
      acc.add(name, { r: e.r, d: e.d, o: e.o }, frac);
    }
    return { ...acc.finish(), apState: null, lastUpdated: json.lastUpdated || null, townsReporting: json.townsReporting || null };
  }

  // CSV: town,scott,janoo,other[,pct_reporting]  (header row required; columns matched by name)
  function parseCSV(text, model, cfg) {
    const lines = text.trim().split(/\r?\n/).map((l) => l.split(",").map((s) => s.trim()));
    const h = lines.shift().map((s) => s.toLowerCase());
    const col = (re) => h.findIndex((x) => re.test(x));
    const ti = col(/town|unit|name/), ri = col(new RegExp(cfg.rLast.toLowerCase() + "|^r$|rep")),
      di = col(new RegExp(cfg.dLast.toLowerCase() + "|^d$|dem")), oi = col(/other|^o$/), fi = col(/pct|frac|eevp|report/);
    if (ti < 0 || ri < 0 || di < 0) throw new Error("CSV needs town, " + cfg.rLast + ", " + cfg.dLast + " columns");
    const acc = makeAcc(model);
    for (const row of lines) {
      let f = fi >= 0 ? parseFloat(row[fi]) : 1; if (f > 1) f /= 100; if (!(f > 0)) f = 1;
      acc.add(row[ti], { r: +row[ri] || 0, d: +row[di] || 0, o: oi >= 0 ? +row[oi] || 0 : 0 }, f);
    }
    return acc.finish();
  }

  // Places reported separately now but combined in the baseline.
  // share = that piece's share of the combined town's 2022 governor vote.
  const EJ = ["essex junction", "essex junction city"];
  const SPLITS = {
    "essex junction": { to: "essex", share: 0.458 },
    "essex junction city": { to: "essex", share: 0.458 },
    "essex": { to: "essex", share: 0.542, onlyIfSibling: EJ },
    "essex town": { to: "essex", share: 0.542, onlyIfSibling: EJ },
  };

  // Accumulate reporting-unit pieces into baseline towns.
  function makeAcc(model) {
    const pieces = new Map(), unmatched = [], names = new Set();
    return {
      add(name, tally, frac) {
        names.add(norm(name));
        const t = matchTown(model, name);
        if (!t) { if (tally.r + tally.d + tally.o) unmatched.push(name); return; }
        const p = pieces.get(t.key) || [];
        p.push({ name: norm(name), ...tally, frac });
        pieces.set(t.key, p);
      },
      finish() {
        const results = new Map();
        for (const [key, list] of pieces) {
          const x = { r: 0, d: 0, o: 0, frac: 0 };
          let anyVotes = false;
          for (const p of list) {
            x.r += p.r; x.d += p.d; x.o += p.o; anyVotes = anyVotes || p.r + p.d + p.o > 0;
            const sp = SPLITS[p.name];
            const share = sp && sp.to === key && (!sp.onlyIfSibling || sp.onlyIfSibling.some((n) => names.has(n))) ? sp.share : list.length === 1 ? 1 : 1 / list.length;
            x.frac += share * (p.r + p.d + p.o > 0 ? p.frac : 0);
          }
          if (anyVotes) results.set(key, x);
        }
        return { results, unmatched };
      },
    };
  }

  function matchTown(model, name) {
    if (!name) return null;
    const sp = SPLITS[norm(name)];
    if (sp && model.byKey.get(sp.to)) return model.byKey.get(sp.to);
    const k = norm(name);
    return model.byKey.get(k) || model.byKey.get(k.replace(/ (town|city)$/, "")) || model.byKey.get(k + " town") || null;
  }

  // ---------- Demo: a fake election night ----------
  function demoNight(model, seed) {
    const r = rng(seed || Date.now());
    const st = model.sigState * r.normal() * 1.1;
    const tu = model.prior.turnoutSd * r.normal();
    const cE = {}, cT = {};
    model.counties.forEach((c) => { cE[c] = SIG.county * r.normal(); cT[c] = SIG.countyTurn * r.normal(); });
    const truth = model.towns.map((t) => {
      const total = Math.round(t.expVotes * Math.exp(tu + cT[t.county] + SIG.townTurn * r.normal()));
      const s = inv(t.mu + st + cE[t.county] + SIG.town * r.normal());
      const o = Math.round(total * t.expOther), rv = Math.round((total - o) * s);
      // small towns tend to hand-count and report fast; cities later, sometimes in pieces
      const order = r() * 0.8 + Math.log10(Math.max(10, total)) / 5 + (/Chittenden|Washington/.test(t.county) ? 0.1 : 0);
      return { t, r: rv, d: total - o - rv, o, order, split: total > 4000 };
    }).sort((a, b) => a.order - b.order);
    const steps = [];
    const cur = new Map();
    const perStep = 8;
    for (let i = 0; i < truth.length; i += perStep) {
      truth.slice(i, i + perStep).forEach((x) => {
        if (x.split && !cur.has(x.t.key)) {
          const f = 0.4 + 0.2 * r();
          cur.set(x.t.key, { r: Math.round(x.r * f), d: Math.round(x.d * f), o: Math.round(x.o * f), frac: f });
          truth.push({ ...x, split: false }); // rest arrives at the end of the night
        } else cur.set(x.t.key, { r: x.r, d: x.d, o: x.o, frac: 1 });
      });
      steps.push(new Map(cur));
    }
    const final = steps[steps.length - 1];
    let fr = 0, fd = 0, fo = 0; final.forEach((v) => { fr += v.r; fd += v.d; fo += v.o; });
    return { steps, finalMargin: (100 * (fr - fd)) / (fr + fd + fo) };
  }

  root.VTModel = { build, run, parseAP, parseSOS, parseCSV, demoNight, DEFAULT_PRIOR, SIG, norm };
})(typeof window !== "undefined" ? window : globalThis);
