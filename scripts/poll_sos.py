#!/usr/bin/env python3
"""Poll the Vermont Secretary of State election-night feed for the governor race.

Writes:
  live/latest.json   newest snapshot (compact town rows)
  live/history.json  every distinct snapshot of the night, oldest first

    python3 scripts/poll_sos.py                     # one check, then exit
    python3 scripts/poll_sos.py --loop --minutes 340 --commit   # what the GitHub Action runs

Only the small election index is fetched each cycle; the ~0.5 MB statewide file
is downloaded only when SOS publishes a new timestamped version.
Standard library only.
"""
import argparse, datetime, json, os, pathlib, subprocess, sys, time, urllib.request

BASE = "https://static.electionresults.vermont.gov"
ELECTION_DATE = "2026-11-03"
STOP_AFTER = datetime.datetime(2026, 11, 6, tzinfo=datetime.timezone.utc)  # never poll past this
ROOT = pathlib.Path(__file__).resolve().parent.parent
LIVE = ROOT / "live"
UA = "vt-needle/1.0 (election-night forecast; polls every 2 min)"


def log(*a):
    print(f"[{datetime.datetime.now():%H:%M:%S}]", *a, flush=True)


def get(path):
    req = urllib.request.Request(f"{BASE}/{path}", headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def find_guid():
    for e in get("elections/elections.json"):
        if e.get("isGeneralElection") and e.get("isStateWideElection") and str(e.get("electionDate", "")).startswith(ELECTION_DATE):
            return e["electionGuid"]
    raise SystemExit("2026 general election not found in SOS index")


def classify(name, party):
    n, p = (name or "").upper(), (party or "").upper()
    if "SCOTT" in n:
        return 0
    if "JANOO" in n:
        return 1
    return 2


def snapshot(el, sw):
    gov = next((o for blk in sw.get("d", []) for o in blk.get("o", []) if str(o.get("on", "")).upper() == "GOVERNOR"), None)
    if not gov:
        return None
    towns = {}
    for c in gov.get("cs", []):
        tn = c.get("tn")
        if not tn or "STATE WIDE" in tn.upper():
            continue
        row = towns.setdefault(tn, [tn, 0, 0, 0, 0, 0])
        for x in (c.get("rc") or []) + (c.get("wc") or []):
            row[1 + classify(x.get("cn"), x.get("pn"))] += int(x.get("vc") or 0)
        try:
            k, n = (int(v) for v in str(c.get("distReported") or "1/1").split("/"))
        except ValueError:
            k, n = 1, 1
        row[4], row[5] = max(row[4], k), max(row[5], n)
    return {
        "source": "vt-sos",
        "sosUpdated": el.get("lastUpdatedDate"),
        "townsReporting": el.get("townsReportingFormat"),
        "path": el["stateWide"]["path"],
        "fetched": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "towns": sorted(towns.values()),  # [town, scott, janoo, other, districtsIn, districtsTotal]
    }


def write_json(p, obj):
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":")))
    os.replace(tmp, p)


def git_push(msg):
    def run(*a):
        return subprocess.run(a, cwd=ROOT, capture_output=True, text=True)
    run("git", "add", "live/latest.json", "live/history.json")
    if run("git", "diff", "--cached", "--quiet").returncode == 0:
        return
    run("git", "commit", "-m", msg)
    for _ in range(3):
        if run("git", "push").returncode == 0:
            log("pushed")
            # Ask Pages to rebuild (pushes made with GITHUB_TOKEN may not trigger it on their own)
            tok, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
            if tok and repo:
                try:
                    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/pages/builds", method="POST",
                                                 headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"})
                    urllib.request.urlopen(req, timeout=20).read()
                except Exception as e:
                    log("pages build request failed:", e)
            return
        run("git", "pull", "--rebase")
    log("push failed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--minutes", type=float, default=340, help="stop looping after this long")
    ap.add_argument("--every", type=int, default=120, help="seconds between checks (min 60)")
    ap.add_argument("--commit", action="store_true", help="git commit + push on change")
    a = ap.parse_args()
    every = max(60, a.every)

    LIVE.mkdir(exist_ok=True)
    hist_p, latest_p = LIVE / "history.json", LIVE / "latest.json"
    history = json.loads(hist_p.read_text()) if hist_p.exists() else []
    last_path = history[-1]["path"] if history else None
    deadline = time.time() + a.minutes * 60
    guid, idle_since, errors = None, time.time(), 0

    while True:
        if datetime.datetime.now(datetime.timezone.utc) > STOP_AFTER:
            log("past STOP_AFTER; exiting")
            return
        try:
            guid = guid or find_guid()
            el = get(f"elections/{guid}.json")
            path = (el.get("stateWide") or {}).get("path")
            errors = 0
            if path and path != last_path:
                snap = snapshot(el, get(path.replace("\\", "/")))
                if snap and (not history or snap["towns"] != history[-1]["towns"]):
                    history.append(snap)
                    write_json(hist_p, history)
                    write_json(latest_p, snap)
                    log(f"new snapshot: SOS {snap['sosUpdated']}, {snap['townsReporting']} towns")
                    if a.commit:
                        git_push(f"SOS update {snap['sosUpdated']} ({snap['townsReporting']})")
                    idle_since = time.time()
                last_path = path
            else:
                log(f"no change (SOS {el.get('lastUpdatedDate')}, {el.get('townsReportingFormat')})")
            # Everything in and quiet for 90 minutes: the night is over
            tr = str(el.get("townsReporting") or "")
            if "/" in tr and tr.split("/")[0] == tr.split("/")[1] and time.time() - idle_since > 90 * 60:
                log("all towns in and no changes for 90 min; exiting")
                return
        except Exception as e:
            errors += 1
            log("error:", e)
        if not a.loop or time.time() > deadline:
            return
        time.sleep(min(600, every * (2 ** min(errors, 3))))


if __name__ == "__main__":
    main()
