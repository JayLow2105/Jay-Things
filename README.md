# OddsIQ - Sports Analysis Tool

**OddsIQ** is a personal sports odds analysis web app designed to help compare match odds, estimate win probability, organize picks by risk level, and suggest potential parlay combinations.

Live Demo: https://jaylow2105.github.io/Jay-Things/OddsIQ_App.html

---

## Overview

OddsIQ helps users review sports matchups by combining sportsbook odds, implied probability, basic prediction logic, and risk classification. The goal is to make sports odds easier to understand by separating:

- **Most likely winner**
- **Best value pick**
- **Best parlay candidate**
- **High-risk pick**
- **Avoid / weak-confidence pick**

The app is intended for analysis, education, and personal tracking. It does not guarantee betting outcomes.

---

## Key Features

### Sports Odds Dashboard

- Displays available sports matches and odds.
- Shows matchup details such as teams, league, match time, and odds.
- Helps users quickly compare potential picks.

### Match Prediction Support

OddsIQ can be designed to evaluate matches using factors such as:

- Current odds
- Implied probability
- Head-to-head history
- Recent team form
- Home and away performance
- Average points scored
- Average points allowed
- Injury status, if available
- Rest days, if available
- Odds movement, if available

### Risk Categories

Picks can be organized into different risk levels:

| Risk Level              | Meaning                                                       |
| ----------------------- | ------------------------------------------------------------- |
| Low Risk                | Higher estimated win probability, lower payout                |
| Medium Risk             | Balanced probability and payout                               |
| High Risk               | Lower probability, higher payout                              |
| High Risk / High Reward | Long-shot style picks with higher payout but lower confidence |

### Recommendation Labels

OddsIQ separates different types of recommendations:

| Label            | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| Predicted Winner | Team or player with the highest estimated chance to win                        |
| Best Value Pick  | Pick where estimated probability is higher than sportsbook implied probability |
| Parlay Candidate | Pick with stronger probability and better stability for combinations           |
| High Risk        | Higher potential reward but lower probability                                  |
| Avoid            | Weak value, low confidence, or risky data signal                               |

### Auto Parlay Suggestions

The app can suggest parlay combinations by grouping picks into:

- **Safer Parlay**: 2-3 legs with stronger probability
- **Balanced Parlay**: 3-5 legs with medium risk
- **High Risk / High Reward Parlay**: 4+ legs with higher payout and lower hit probability

Each parlay can show:

- Selected games
- Selected pick/team
- Individual win probability
- Combined odds
- Estimated hit probability
- Estimated payout
- Risk level
- Reason each leg was included

---

## Core Calculations

### Implied Probability from American Odds

For negative odds:

```text
Implied Probability = |Odds| / (|Odds| + 100)
```

Example:

```text
-150 odds = 150 / (150 + 100) = 60%
```

For positive odds:

```text
Implied Probability = 100 / (Odds + 100)
```

Example:

```text
+200 odds = 100 / (200 + 100) = 33.33%
```

### Model Edge

```text
Model Edge = Estimated Win Probability - Sportsbook Implied Probability
```

Example:

```text
Estimated Win Probability: 65%
Sportsbook Implied Probability: 58%
Model Edge: +7%
```

### Parlay Probability

```text
Parlay Probability = Pick 1 Probability × Pick 2 Probability × Pick 3 Probability
```

Example:

```text
70% × 65% × 60% = 27.3%
```

Adding more legs increases payout but lowers the total chance of winning.

---

## Suggested Prediction Weighting

A simple prediction model can use this structure:

| Factor                     | Weight |
| -------------------------- | -----: |
| Recent form                |    25% |
| Head-to-head history       |    15% |
| Home/away advantage        |    15% |
| Offensive performance      |    15% |
| Defensive performance      |    10% |
| Injury/player availability |    10% |
| Odds movement              |    10% |

Head-to-head history should be used as one factor, not the full prediction.

---

## Project Structure

Example structure for a simple GitHub Pages version:

```text
Jay-Things/
│
├── OddsIQ_App.html      # Main web app file
├── README.md            # Project documentation
└── assets/              # Optional images, CSS, or JavaScript files
```

If the project is expanded into a full web app, a possible structure is:

```text
OddsIQ/
│
├── frontend/
│   ├── src/
│   ├── components/
│   └── pages/
│
├── backend/
│   ├── routes/
│   ├── services/
│   └── utils/
│
├── data/
│   └── mockData.json
│
├── README.md
└── .env
```

---

## Setup

### Option 1: Open the HTML File Directly

1. Download or clone the repository.
2. Open `OddsIQ_App.html` in a web browser.

### Option 2: Use VS Code Live Server

1. Open the project folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `OddsIQ_App.html`.
4. Select **Open with Live Server**.

### Option 3: View on GitHub Pages

Open the live demo:

```text
https://jaylow2105.github.io/Jay-Things/OddsIQ_App.html
```

---

## API Notes

If OddsIQ uses a sports odds API:

- Do not expose private API keys in frontend code for production use.
- Store API keys in environment variables when using a backend.
- Use backend proxy routes to protect sensitive credentials.
- Handle failed API responses safely.
- Show fallback data or loading messages when odds data is unavailable.

Example `.env` setup for a backend version:

```env
SPORTS_ODDS_API_KEY=your_api_key_here
```

Add `.env` to `.gitignore`:

```text
.env
```

---

## Responsible Use

OddsIQ is for analysis and educational use only.

Sports outcomes are uncertain. Odds, injuries, line movement, and team performance can change quickly. No prediction, model, or parlay suggestion should be treated as guaranteed.

Recommended safety controls:

- Set a personal bankroll limit.
- Avoid chasing losses.
- Treat high-risk picks carefully.
- Review the probability drop when adding more parlay legs.
- Do not rely on one data point only.

---

## Future Improvements

Possible future upgrades:

- Add historical result tracking
- Add user watchlist
- Add win/loss simulation
- Add bankroll management
- Add odds movement chart
- Add team form chart
- Add injury data integration
- Add sport-specific prediction models
- Add export to CSV
- Add saved parlay history

---

## License

This project is for personal and educational use.
