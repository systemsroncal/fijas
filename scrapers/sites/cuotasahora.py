"""Scraper CuotasAhora — comparación de cuotas."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.generic import GenericTipsScraper


class CuotasAhoraScraper(GenericTipsScraper):
    """CuotasAhora.com — odds comparison."""

    slug = "cuotasahora"
    base_url = "https://www.cuotasahora.com"
    max_rows = 220
    day_paths = [
        "/",
        "/futbol/",
        "/baloncesto/",
        "/tenis/",
        "/football/",
        "/basketball/",
        "/tennis/",
        "/american-football/",
    ]

    def scrape(self) -> dict[str, Any]:
        result = super().scrape()
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "CuotasAhora value board",
                    "totalOdds": 4.8,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:5],
                }
            )
        return result
