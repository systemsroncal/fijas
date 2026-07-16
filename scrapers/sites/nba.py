"""Scraper NBA.com."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.base import empty_result, fetch_html, random_delay
from sites.generic import GenericTipsScraper


class NbaScraper(GenericTipsScraper):
    """NBA.com — scoreboard / schedule."""

    slug = "nba"
    base_url = "https://www.nba.com"
    max_rows = 80
    day_paths = ["/games", "/schedule", "/"]

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        today = date.today().isoformat()
        # API scoreboard (puede requerir headers; best-effort)
        try:
            import json

            random_delay(1, 3)
            url = (
                "https://cdn.nba.com/static/json/liveData/scoreboard/"
                f"todaysScoreboard_00.json"
            )
            raw = fetch_html(url)
            data = json.loads(raw)
            games = (data.get("scoreboard") or {}).get("games") or []
            for g in games[:40]:
                home = (g.get("homeTeam") or {}).get("teamName") or "Home"
                away = (g.get("awayTeam") or {}).get("teamName") or "Away"
                hcity = (g.get("homeTeam") or {}).get("teamCity") or ""
                acity = (g.get("awayTeam") or {}).get("teamCity") or ""
                result["predictions"].append(
                    {
                        "matchDate": today,
                        "league": "Basketball: NBA",
                        "homeTeam": f"{hcity} {home}".strip()[:80],
                        "awayTeam": f"{acity} {away}".strip()[:80],
                        "betType": "ML",
                        "betChoice": g.get("gameStatusText") or "NBA",
                        "statsNote": f"gameId={g.get('gameId')}",
                    }
                )
        except Exception:
            pass

        html_result = super().scrape()
        result["predictions"].extend(html_result["predictions"])
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "NBA today",
                    "totalOdds": 3.2,
                    "matchDate": today,
                    "legs": result["predictions"][:4],
                }
            )
        return result
