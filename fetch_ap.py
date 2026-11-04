#!/usr/bin/env python3
"""Poll the AP Elections API for Vermont governor results and serve the needle.

    AP_API_KEY=... python3 fetch_ap.py            # live: poll AP every 60s, serve on :8642
    AP_API_KEY=... python3 fetch_ap.py --test     # AP test data
    python3 fetch_ap.py --no-fetch                # just serve the page (demo / file modes)

Only this script talks to AP. The page in the browser re-reads the local
results/latest.json, so any number of open tabs cost AP nothing.

Safeguards so we never hammer AP:
  * minimum interval of 30s between requests (default 60s)
  * a lock file, so only one poller runs at a time
  * exponential backoff on errors (up to 10 min), honoring Retry-After
  * stops polling after 403 (bad key / quota)
  * once AP calls the race and 100% of the expected vote is in, slows to every 10 min

Writes results/latest.json (raw AP response) plus timestamped snapshots in
results/history/. Then open http://localhost:8642 (it switches to the AP feed on its own).
Uses only the standard library.
"""
import argparse, datetime, fcntl, http.server, json, os, pathlib, socketserver, sys, threading, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "results"
API = "https://api.ap.org/v2/elections/{date}"
MIN_EVERY = 30
MAX_BACKOFF = 600
CALLED_EVERY = 600


def log(*a):
    print(f"[{datetime.datetime.now():%H:%M:%S}]", *a, flush=True)


def fetch(key, date, test):
    params = "statepostal=VT&officeID=G&raceTypeID=G&level=ru&format=json" + ("&test=true" if test else "")
    req = urllib.request.Request(API.format(date=date) + "?" + params, headers={"x-api-key": key, "Accept": "application/json", "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def race_done(data):
    """True once AP has declared a winner and the statewide eevp is 100."""
    try:
        for race in data.get("races", []):
            for ru in race.get("reportingUnits", []):
                if ru.get("level") == "state":
                    called = any(c.get("winner") == "X" for c in ru.get("candidates", []))
                    return called and (ru.get("eevp") or 0) >= 100
    except Exception:
        pass
    return False


def poll(key, date, test, every):
    (OUT / "history").mkdir(parents=True, exist_ok=True)
    last, backoff = None, 0
    while True:
        wait = every
        try:
            body = fetch(key, date, test)
            data = json.loads(body)  # validate before replacing the live file
            backoff = 0
            if body != last:
                stamp = datetime.datetime.now().strftime("%H%M%S")
                (OUT / "history" / f"{stamp}.json").write_bytes(body)
                tmp = OUT / "latest.json.tmp"
                tmp.write_bytes(body)
                os.replace(tmp, OUT / "latest.json")
                last = body
                log(f"updated ({len(body):,} bytes)")
            else:
                log("no change")
            if race_done(data):
                wait = max(every, CALLED_EVERY)
                log(f"race called and fully counted, slowing to every {wait // 60} min")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                log(f"AP HTTP {e.code}: check AP_API_KEY / entitlement / quota. Stopping AP polling.")
                return
            ra = e.headers.get("Retry-After") if e.headers else None
            backoff = min(MAX_BACKOFF, max(backoff * 2, every))
            wait = max(backoff, int(ra) if ra and ra.isdigit() else 0)
            log(f"AP HTTP {e.code}; backing off {wait}s")
        except Exception as e:  # network blips: back off too
            backoff = min(MAX_BACKOFF, max(backoff * 2, every))
            wait = backoff
            log(f"fetch error: {e}; retrying in {wait}s")
        time.sleep(wait)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="2026-11-03")
    ap.add_argument("--every", type=int, default=60, help=f"seconds between AP requests (min {MIN_EVERY})")
    ap.add_argument("--test", action="store_true", help="request AP test data")
    ap.add_argument("--port", type=int, default=8642)
    ap.add_argument("--no-fetch", action="store_true", help="serve only")
    a = ap.parse_args()

    if not a.no_fetch:
        key = os.environ.get("AP_API_KEY")
        if not key:
            sys.exit("Set AP_API_KEY (or use --no-fetch to just serve the page)")
        OUT.mkdir(exist_ok=True)
        lock = open(OUT / ".poller.lock", "w")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            sys.exit("Another fetch_ap.py poller is already running. Not starting a second one.")
        every = max(MIN_EVERY, a.every)
        if every != a.every:
            log(f"--every raised to {MIN_EVERY}s minimum")
        log(f"polling AP every {every}s{' (TEST data)' if a.test else ''}")
        threading.Thread(target=poll, args=(key, a.date, a.test, every), daemon=True).start()

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", a.port), Handler) as httpd:
        log(f"Serving http://localhost:{a.port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
