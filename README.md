# Vermont Governor Needle

A small live election-night forecast for the 2026 Vermont governor's race (Phil Scott vs. Amanda Janoo), in the style of the NYT needle. It reads AP town-level results and estimates the votes still outstanding.

## Run it

The default live source is the **Vermont Secretary of State** feed (`static.electionresults.vermont.gov`). The CDN allows cross-origin reads (`Access-Control-Allow-Origin: *`, 60s cache), so the page fetches it straight from the browser, with no server and no key.

- It checks a small election index every 2 minutes (60s minimum).
- It downloads the ~0.5 MB statewide file only when SOS posts a new timestamped version.
- It reads the GOVERNOR office's town rows. A town can have one row per House district, and `distReported` shows how many of its districts are in.

### Hosted on GitHub Pages
`.github/workflows/poll-sos.yml` runs `scripts/poll_sos.py`, the only thing that contacts SOS:
- It checks every 2 minutes and commits `live/latest.json` and `live/history.json`, a ~3.5 KB snapshot per SOS update, when something changes.
- A cron job every 20 minutes restarts it if it stops, with only one copy running at a time.
- It stops when all towns are in and quiet for 90 minutes, and never runs after Nov. 6, 2026. Disable the workflow after election night.

On Pages, the page reads only `live/`. It replays `history.json` to draw the timeline and checks `latest.json` every minute. Without `live/`, for example opened elsewhere, it reads SOS directly.

You can open `index.html` from any static host. Locally:

```bash
python3 fetch_ap.py --no-fetch   # serves on http://localhost:8642
```

The AP feed is optional and needs a paid key:

```bash
# Election night: poll AP and serve the page
AP_API_KEY=your-key python3 fetch_ap.py
# open http://localhost:8642. It switches to the AP feed by itself once results/latest.json exists

# AP test data
AP_API_KEY=your-key python3 fetch_ap.py --test

# No AP key: just serve the page and use the demo or load/paste a file
python3 fetch_ap.py --no-fetch
```

### Being nice to AP
Only `fetch_ap.py` contacts AP. The browser re-reads the local `results/latest.json`, so open tabs and refreshes cost nothing.

- The default is one request every 60s (`--every`), and it never goes below 30s.
- A lock file allows only one poller to run at a time.
- On errors, 429s and 5xx responses it backs off exponentially, up to 10 minutes, and honors `Retry-After`.
- It stops polling on 401 or 403 (a bad key or an exhausted quota).
- Once AP calls the race and the statewide expected vote is 100%, it slows to one request every 10 minutes.

Each changed response is also saved to `results/history/HHMMSS.json`, so you can replay the night later.

## Model

- **Baseline** (`data/baseline.js`): 246 towns with governor results from 2016, 2018, 2020 and 2022 and president from 2020. Sources: OpenElections for 2016–2020 and the Vermont Election Archive for 2022. Essex Junction is folded into Essex. AP reports them separately, and the parser merges them using their 2022 vote shares.
- **Prior**: a statewide Scott margin (default R+40 ± 14) and turnout (default 290k ± 8%). Each town's expected share is that prior shifted by its historical lean in logit space; 2022 gets the most weight. Expected turnout comes mostly from the 2022 and 2018 midterms. You can change these on the page under Model priors.
- **Live update**: reporting towns produce residuals (actual minus expected). These are pooled into a statewide swing plus county swings with a hierarchical normal model (county σ 0.10, town σ 0.22 in logit). Turnout gets the same treatment in log space. For a partially reported town, its own count is used and the remainder is scaled up from its reported fraction (`eevp`).
- **Output**: 2,000 Monte Carlo draws of the full count give the win probability, the median margin, and 50% and 90% ranges, overall and by county.
- **Needle jitter**: the probability needle wobbles by about √(p(1−p)/30). The margin needle moves within the 50% range. You can turn jitter off under Model priors.

When I checked it against 50 simulated nights, the 90% intervals covered the true result 92–96% of the time, and there was no meaningful bias. That only shows the model matches its own assumptions. Real nights can break them, for example if early-reporting towns differ systematically from late ones.

## Files

- `index.html`, `app.js`: the page, needles, chart, county table and data sources
- `model.js`: the baseline, the hierarchical update, the simulation, and the AP/CSV parsers
- `fetch_ap.py`: the rate-limited AP poller and local server (standard library only)
- `results/sample_ap.json`: a fake AP response built from 2022 results, about half the towns reporting
- `data/`: the baseline and the raw source files
