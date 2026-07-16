"""Scraper 365Scores (ES)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.generic import GenericTipsScraper


class Scores365Scraper(GenericTipsScraper):
    """365Scores — marcadores y partidos del día."""

    slug = "scores365"
    base_url = "https://www.365scores.com"
    max_rows = 250
    day_paths = [
        "/es",
        "/es/football",
        "/es/basketball",
        "/es/tennis",
        "/es/american-football",
    ]

    def scrape(self) -> dict[str, Any]:
        result = super().scrape()
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "365Scores multi-sport",
                    "totalOdds": 4.2,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:5],
                }
            )
        return result
