# Vermont Governor Needle

A live election-night forecast for the 2026 Vermont governor's race (Phil Scott vs. Amanda Janoo), in the style of the NYT needle. It reads the Vermont Secretary of State's unofficial town results and estimates the votes still outstanding.

**Live:** https://dmccullum.github.io/vt-needle/

## How it updates

`.github/workflows/poll-sos.yml` runs `scripts/poll_sos.py`, the only thing that contacts the Secretary of State:

- It checks SOS's small election index every 2 minutes. It downloads the ~0.5 MB statewide file only when SOS publishes a new version.
- It reads the governor race's town rows. A town can have one row per House district, and `distReported` shows how many of its districts are in.
- When something changes, it commits `live/latest.json` and adds a snapshot to `live/history.json`. A snapshot is about 3.5 KB of compact town rows. Then it asks GitHub Pages to rebuild.
- A cron job every 20 minutes restarts the poller if it stops, with only one copy running at a time.
- It exits when all towns are in and nothing has changed for 90 minutes, and it never runs after Nov. 6, 2026. Disable the workflow after election night.

The page reads only `live/`, so visitors never contact SOS. It replays `history.json` to draw the forecast chart and checks `latest.json` every minute. If `live/` is missing, it reads SOS directly: the SOS CDN allows cross-origin requests.

## Run locally

```bash
python3 -m http.server 8642     # then open http://localhost:8642
python3 scripts/poll_sos.py     # one SOS check; refreshes live/ (no commit)
```

## Model

- **Baseline** (`data/baseline.js`): 246 towns, with governor results from 2016 through 2024, and president from 2020. Sources are OpenElections for 2016–2020, the Vermont Election Archive for 2022, and the Secretary of State's official 2024 results. The town lean uses 2016–2022; 2024 is used only for comparisons. Essex Junction is folded into Essex. SOS reports them separately, and the parser merges them using their 2022 vote shares.
- **Prior:** a statewide Scott margin (default R+40 ± 14) and turnout (default 290k ± 8%). Each town's expected share is that prior shifted by its historical lean in logit space, with 2022 weighted most. Expected turnout comes mostly from the 2022 and 2018 midterms. You can change these on the page under Model settings.
- **Live update:** each reporting town gives a residual, its actual result minus its expected result. The model pools these residuals into three estimates (logit space):
  - a statewide swing
  - county swings, pulled toward the statewide swing (county σ 0.10, town σ 0.22)
  - a slope for whether towns swing differently depending on their usual lean (prior SD 0.15)

  Turnout is handled the same way in log space. For a partly reported town, the model uses the town's own count, and the rest of its vote is scaled up from the share of districts reported.
- **Shared late-vote error:** each simulation shifts all the outstanding vote together, by a logit SD of 0.06 on share and a log SD of 0.04 on turnout. That way the risk that the remaining vote is all bluer or redder doesn't average away across towns.
- **Output:** 2,000 Monte Carlo draws of the full count give the win probability, the median margin, and the 50% and 90% ranges, statewide and by county. The margin of error shown on the page is half the 90% range. It reflects only the uncertainty in the outstanding vote, so it narrows as towns report.
- **Compared with past races:** each 2016–2024 governor race, statewide and in the towns fully counted tonight, with the shift to 2026. The map draws one arrow per fully counted town: up-left for a shift toward the Democrat, up-right toward Scott, with length proportional to the shift.
- **Needle jitter:** the probability needle wobbles by about √(p(1−p)/30), and the margin needle moves within the 50% range. You can turn jitter off under Model settings.

The model is checked against its own simulated election nights (`demoNight` in `model.js`). That only shows it is consistent with its assumptions. Real nights can break them.

## Files

- `index.html`, `app.js`: the page, needles, range bar, forecast chart and county table
- `model.js`: the baseline, the hierarchical update, the simulation, and the SOS parser
- `scripts/poll_sos.py`: the SOS poller the workflow runs (standard library only)
- `live/`: the night's snapshots, committed by the workflow
- `data/vtmap.js`: the shift map's county outlines (us-atlas, 1:10m) and town points (Census 2024 gazetteer), projected ahead of time
- `data/`: the baseline and the raw source files
