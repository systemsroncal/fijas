"""Búsquedas deportivas (DuckDuckGo HTML) — proxy de 'Google search' sin API key."""

from __future__ import annotations

import re
from datetime import date
from typing import Any
from urllib.parse import quote_plus

from sites.base import empty_result, fetch_html, random_delay

QUERIES = [
    "football predictions today",
    "pronosticos futbol hoy",
    "NBA predictions today",
    "NFL picks today",
    "tennis tips today",
    "accumulators tips today",
    "best betting tips today",
]


class GoogleSportsSearchScraper:
    """
    Consultas de tipsters vía DuckDuckGo HTML (más estable que scrapear Google SERP).
    Se registra como fuente 'google_search' para el panel admin.
    """

    slug = "google_search"
    base_url = "https://duckduckgo.com"

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        today = date.today().isoformat()
        vs_re = re.compile(r"(.{3,40}?)\s+(?:vs\.?|v)\s+(.{3,40})", re.I)

        for q in QUERIES:
            try:
                random_delay(1, 3)
                url = f"https://html.duckduckgo.com/html/?q={quote_plus(q)}"
                html = fetch_html(url)
                from bs4 import BeautifulSoup

                soup = BeautifulSoup(html, "lxml")
                for a in soup.select("a.result__a, a.result__url, .result__snippet")[:25]:
                    text = a.get_text(" ", strip=True)
                    if len(text) < 10:
                        continue
                    m = vs_re.search(text)
                    if not m:
                        result["predictions"].append(
                            {
                                "matchDate": today,
                                "league": f"Search: {q[:40]}",
                                "homeTeam": "SearchHit",
                                "awayTeam": text[:60],
                                "betType": "INFO",
                                "betChoice": "Tip search",
                                "statsNote": text[:240],
                            }
                        )
                        continue
                    result["predictions"].append(
                        {
                            "matchDate": today,
                            "league": f"Search: {q[:40]}",
                            "homeTeam": m.group(1).strip()[:80],
                            "awayTeam": m.group(2).strip()[:80],
                            "betType": "1X2",
                            "betChoice": "Search tip",
                            "statsNote": text[:240],
                        }
                    )
            except Exception:
                continue

        # Filtrar filas basura SearchHit sin rival útil
        cleaned = []
        for p in result["predictions"]:
            if p["homeTeam"] == "SearchHit" and len(p["awayTeam"]) < 8:
                continue
            cleaned.append(p)
        result["predictions"] = cleaned[:120]

        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "Web search tips combo",
                    "totalOdds": 5.5,
                    "matchDate": today,
                    "legs": [p for p in result["predictions"] if p["homeTeam"] != "SearchHit"][
                        :5
                    ],
                }
            )
        return result
