"""Scraper WinDrawWin (hoy y mañana)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sites.generic import GenericTipsScraper


class WinDrawWinScraper(GenericTipsScraper):
    """WinDrawWin football predictions."""

    slug = "windrawwin"
    base_url = "https://www.windrawwin.com"
    day_paths = ["/predictions/", "/predictions/tomorrow/"]

    def scrape(self) -> dict[str, Any]:
        result = super().scrape()
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "WinDrawWin suggested",
                    "totalOdds": 5.0,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:5],
                }
            )
        return result
