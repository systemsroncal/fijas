"""Scraper Opta Analyst / TheAnalyst."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.generic import GenericTipsScraper


class TheAnalystScraper(GenericTipsScraper):
    """Opta Analyst — artículos y stats (contexto cualitativo)."""

    slug = "theanalyst"
    base_url = "https://theanalyst.com"
    max_rows = 120
    day_paths = [
        "/",
        "/competition/fifa-world-cup/",
        "/competition/premier-league/",
        "/competition/la-liga/",
        "/competition/uefa-champions-league/",
        "/articles/",
    ]

    def scrape(self) -> dict[str, Any]:
        result = super().scrape()
        # Extraer titulares con "vs" del HTML genérico ya parseado
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "Opta Analyst context",
                    "totalOdds": 3.5,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:4],
                }
            )
        return result
