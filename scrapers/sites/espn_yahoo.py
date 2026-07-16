"""Scraper ESPN + Yahoo Sports (scoreboards multi-deporte)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from sites.base import empty_result, fetch_html, random_delay


ESPN_BOARDS = [
    ("football/soccer", "Football: ESPN Soccer"),
    ("basketball/nba", "Basketball: NBA"),
    ("football/nfl", "American Football: NFL"),
    ("baseball/mlb", "Baseball: MLB"),
    ("hockey/nhl", "Hockey: NHL"),
    ("tennis/atp", "Tennis: ATP"),
]

YAHOO_PATHS = [
    "https://sports.yahoo.com/",
    "https://sports.yahoo.com/soccer/",
    "https://sports.yahoo.com/nba/",
    "https://sports.yahoo.com/nfl/",
]


class EspnYahooScraper:
    """ESPN scoreboard API + Yahoo Sports HTML."""

    slug = "espn_yahoo"
    base_url = "https://www.espn.com"

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        today = date.today().isoformat()

        for path, league in ESPN_BOARDS:
            try:
                random_delay(0.5, 2)
                url = f"https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard"
                data = json.loads(fetch_html(url))
                for ev in (data.get("events") or [])[:30]:
                    comps = (ev.get("competitions") or [{}])[0]
                    teams = comps.get("competitors") or []
                    home = next((t for t in teams if t.get("homeAway") == "home"), None)
                    away = next((t for t in teams if t.get("homeAway") == "away"), None)
                    if not home or not away:
                        # tennis / singles
                        if len(teams) >= 2:
                            home, away = teams[0], teams[1]
                        else:
                            continue
                    result["predictions"].append(
                        {
                            "matchDate": today,
                            "league": league,
                            "homeTeam": (
                                (home.get("team") or {}).get("displayName")
                                or (home.get("athlete") or {}).get("displayName")
                                or "Home"
                            )[:80],
                            "awayTeam": (
                                (away.get("team") or {}).get("displayName")
                                or (away.get("athlete") or {}).get("displayName")
                                or "Away"
                            )[:80],
                            "betType": "1X2",
                            "betChoice": ev.get("status", {})
                            .get("type", {})
                            .get("shortDetail")
                            or "ESPN",
                            "statsNote": ev.get("name") or "",
                        }
                    )
            except Exception:
                continue

        from bs4 import BeautifulSoup

        for url in YAHOO_PATHS:
            try:
                random_delay(1, 3)
                soup = BeautifulSoup(fetch_html(url), "lxml")
                for row in soup.select("a, [class*='game'], [class*='match']")[:80]:
                    text = row.get_text(" ", strip=True)
                    if len(text) < 8:
                        continue
                    if " vs " not in text.lower() and " @ " not in text:
                        continue
                    sep = " vs " if " vs " in text.lower() else " @ "
                    parts = text.lower().split(sep.replace("VS", "vs"), 1)
                    # re-split with original case
                    idx = text.lower().find(sep.lower())
                    if idx < 0:
                        continue
                    home = text[:idx].strip()[-60:]
                    away = text[idx + len(sep) :].strip()[:60]
                    if len(home) < 2 or len(away) < 2:
                        continue
                    result["predictions"].append(
                        {
                            "matchDate": today,
                            "league": "Yahoo Sports",
                            "homeTeam": home[:80],
                            "awayTeam": away[:80],
                            "betType": "1X2",
                            "betChoice": "Yahoo",
                            "statsNote": text[:240],
                        }
                    )
            except Exception:
                continue

        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "ESPN/Yahoo multi-sport",
                    "totalOdds": 4.1,
                    "matchDate": today,
                    "legs": result["predictions"][:5],
                }
            )
        return result
