"""Scraper FBref — partidos y estadísticas."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.generic import GenericTipsScraper


class FbrefScraper(GenericTipsScraper):
    """FBref.com — fixtures / matches del día."""

    slug = "fbref"
    base_url = "https://fbref.com"
    max_rows = 200
    day_paths = [
        "/en/matches/",
        "/en/comps/9/schedule/Premier-League-Scores-and-Fixtures",
        "/en/comps/12/schedule/La-Liga-Scores-and-Fixtures",
        "/en/comps/11/schedule/Serie-A-Scores-and-Fixtures",
        "/en/comps/20/schedule/Bundesliga-Scores-and-Fixtures",
        "/en/comps/13/schedule/Ligue-1-Scores-and-Fixtures",
    ]

    def scrape(self) -> dict[str, Any]:
        result = super().scrape()
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "FBref fixtures",
                    "totalOdds": 3.6,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:5],
                }
            )
        return result
