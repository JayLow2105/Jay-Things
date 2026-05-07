# OddsIQ Project Memory

This file is for Codex/project continuity. Read it before making future changes.

## Memory Maintenance Rule

- For every new project request, read this file first.
- After making any meaningful code, architecture, deployment, API, feature, or roadmap change, update this file in the same turn.
- Keep updates concise. Record what changed, why it matters, and any follow-up constraints.
- If the user only asks a question and no project state changes, no memory update is needed unless the answer establishes a new decision or direction.

## Short-Term State

- Main app file: `OddsIQ_App.html`
- App logic/UI rendering file: `app.js`
- App styling file: `styles.css`
- Service layer: `services.js`
- GitHub Pages entrypoint: `index.html`
- Cached public data: `odds-cache.json`
- Pages workflow/cache builder: `.github/workflows/static.yml`
- Live site: `https://jaylow2105.github.io/Jay-Things/`
- GitHub repo: `https://github.com/JayLow2105/Jay-Things`

## Current Architecture

- `index.html` redirects to `OddsIQ_App.html`.
- `OddsIQ_App.html` is now a thin HTML shell. It loads fonts/icons, `styles.css`, `services.js`, and `app.js`.
- `styles.css` owns all app styling.
- `app.js` owns UI rendering, prediction logic, cards, tables, watchlist, settings, filters, and modals.
- `services.js` owns API configuration and fetch helpers:
  - `OddsService`
  - `BallDontLieService`
  - `PandaScoreService`
  - shared `SPORTS`
  - shared `DEFAULT_SETTINGS`
- `.github/workflows/static.yml` builds `odds-cache.json` and deploys to GitHub Pages.
- `odds-cache.json` is a same-origin fallback when browser/network blocks direct API calls.

## API Keys Currently Wired

- The Odds API is used for sportsbook odds.
- balldontlie is wired for future traditional sports team/game/standings stats.
- PandaScore is wired for esports matches.
- Important: this is a public static site, so keys in client-side files are visible publicly.

## Sports/Data Coverage

Traditional sports currently active:
- NFL
- NBA
- MLB
- NHL

Other available in UI/service list:
- EPL Soccer
- NCAAF
- NCAAB

Esports currently active via PandaScore:
- League of Legends: `esports_lol`
- Counter-Strike 2: `esports_cs2`
- VALORANT: `esports_valorant`
- Dota 2: `esports_dota2`

## Important Behavior

- Live app first tries direct API calls.
- If direct API calls fail, app loads `odds-cache.json`.
- GitHub Actions refreshes cache on push and scheduled runs.
- Public users may see cached data if CORS/network blocks direct API calls.

## Prediction Model Status

Current prediction model is still lightweight/proxy-based.

Traditional sports:
- Uses The Odds API moneyline odds as the market baseline.
- Uses proxy factors for recent form, H2H, home/away, offense, defense, injuries, and odds movement.
- balldontlie is added but not yet integrated into the prediction calculations.

Esports:
- PandaScore matches are normalized into the existing match format.
- Esports predictions use a `PandaScore Model` synthetic line, not real sportsbook esports odds.
- Esports model uses team/match/tournament context as a proxy until deeper stats are integrated.

## Key UI Features

- Live Odds Dashboard
- Match Prediction Table
- Auto Parlay Suggestions
- Match cards
- Detail modal with prediction explanation
- Watchlist
- Rankings
- History
- Settings

Parlay cards now show:
- Sport badge
- Matchup
- Match date/time
- Pick/team
- Individual probability
- Combined odds
- Estimated hit probability
- Estimated payout
- Risk level
- Reason each leg was included

## Long-Term Direction

The product goal is an AI-style sports and esports prediction app, not just an odds viewer.

Next high-value work:
- Integrate balldontlie stats into `calculateWinProbability()`.
- Add real recent-form metrics from game history.
- Add team offense/defense stats from real data.
- Add head-to-head history where available.
- Add esports-specific prediction factors:
  - recent match win rate
  - map win rate
  - head-to-head record
  - tournament tier
  - best-of format
  - roster/player strength where available
- Consider a serverless backend later so API keys are not public.

## Coding Notes

- Keep the current dark design style.
- Prefer small, beginner-friendly functions.
- Avoid rebuilding from scratch.
- Keep `services.js` as the API boundary.
- Keep `OddsIQ_App.html` thin. Put CSS in `styles.css` and app functions/UI rendering in `app.js`.
- Keep GitHub Pages deployment working after changes.
- Run a JS syntax check before commits:

```powershell
@'
const fs=require('fs');
new Function(fs.readFileSync('services.js','utf8'));
new Function(fs.readFileSync('app.js','utf8'));
console.log('JS syntax OK');
'@ | node -
```
