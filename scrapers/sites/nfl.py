"""Scraper NFL.com."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.base import empty_result, fetch_html, random_delay
from sites.generic import GenericTipsScraper


class NflScraper(GenericTipsScraper):
    """NFL.com — scores / schedule."""

    slug = "nfl"
    base_url = "https://www.nfl.com"
    max_rows = 80
    day_paths = ["/scores", "/schedules", "/"]

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        today = date.today().isoformat()
        try:
            import json

            random_delay(1, 3)
            # Endpoint público de scorestrip (best-effort; puede cambiar)
            url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
            raw = fetch_html(url)
            data = json.loads(raw)
            for ev in (data.get("events") or [])[:40]:
                comps = (ev.get("competitions") or [{}])[0]
                teams = comps.get("competitors") or []
                home = next((t for t in teams if t.get("homeAway") == "home"), None)
                away = next((t for t in teams if t.get("homeAway") == "away"), None)
                if not home or not away:
                    continue
                result["predictions"].append(
                    {
                        "matchDate": today,
                        "league": "American Football: NFL",
                        "homeTeam": ((home.get("team") or {}).get("displayName") or "Home")[:80],
                        "awayTeam": ((away.get("team") or {}).get("displayName") or "Away")[:80],
                        "betType": "ML",
                        "betChoice": ev.get("status", {}).get("type", {}).get("description")
                        or "NFL",
                        "statsNote": ev.get("name") or "",
                    }
                )
        except Exception:
            pass

        html_result = super().scrape()
        result["predictions"].extend(html_result["predictions"])
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "NFL board",
                    "totalOdds": 3.4,
                    "matchDate": today,
                    "legs": result["predictions"][:4],
                }
            )
        return result
