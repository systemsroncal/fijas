"""Scraper Flashscore.pe / Flashscore livescore."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.base import empty_result, exponential_retry, random_delay, random_ua
from sites.generic import GenericTipsScraper

try:
    import cloudscraper
except ImportError:  # pragma: no cover
    cloudscraper = None  # type: ignore


class FlashscoreScraper(GenericTipsScraper):
    """Flashscore — resultados y partidos (PE + EN)."""

    slug = "flashscore"
    base_url = "https://www.flashscore.pe"
    max_rows = 200
    day_paths = [
        "/",
        "/futbol/",
        "/baloncesto/",
        "/tenis/",
        "/beisbol/",
        "/hockey-sobre-hielo/",
    ]

    def _fetch_cf(self, url: str) -> str:
        if cloudscraper is None:
            from sites.base import fetch_html

            return fetch_html(url)
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        res = scraper.get(url, headers={"User-Agent": random_ua()}, timeout=45)
        res.raise_for_status()
        return res.text

    def parse(self, html_url: str) -> list[dict[str, Any]]:
        # Flashscore es muy JS; intentamos HTML estático + filas genéricas
        from bs4 import BeautifulSoup

        def attempt() -> str:
            random_delay(2, 6)
            return self._fetch_cf(html_url)

        try:
            html = exponential_retry(attempt, max_attempts=2, waits=[5, 12])
        except Exception:
            return []

        soup = BeautifulSoup(html, "lxml")
        preds: list[dict[str, Any]] = []
        match_date = date.today().isoformat()
        for row in soup.select(
            "[class*='event'], [class*='match'], tr, .event__match, .sportName"
        )[: self.max_rows]:
            text = row.get_text(" ", strip=True)
            if len(text) < 10:
                continue
            if " vs " not in text.lower() and " - " not in text and " v " not in text.lower():
                continue
            home, away = "TBD", "TBD"
            for sep in (" vs ", " VS ", " v ", " - "):
                if sep in text:
                    parts = [p.strip() for p in text.split(sep, 1)]
                    if len(parts) == 2 and len(parts[0]) > 1 and len(parts[1]) > 1:
                        home, away = parts[0][-60:], parts[1][:60]
                        break
            if home == "TBD":
                continue
            preds.append(
                {
                    "matchDate": match_date,
                    "league": "Flashscore",
                    "homeTeam": home[:80],
                    "awayTeam": away[:80],
                    "betType": "1X2",
                    "betChoice": "Live/Score",
                    "statsNote": text[:240],
                }
            )
        # También URLs EN flashscore.com
        return preds

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        urls = self.build_urls() + [
            "https://www.flashscore.com/",
            "https://www.flashscore.com/football/",
            "https://www.flashscore.com/basketball/",
            "https://www.flashscore.com/american-football/",
        ]
        for url in list(dict.fromkeys(urls)):
            try:
                preds = self.parse(url)
                result["predictions"].extend(preds)
            except Exception:
                continue
        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "Flashscore board",
                    "totalOdds": 3.8,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:5],
                }
            )
        return result
