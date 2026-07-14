"""Scraper Scores24 con bypass Cloudflare (cloudscraper) — multi-deporte."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import cloudscraper

from sites.base import (
    FREE_PROXIES,
    empty_result,
    exponential_retry,
    random_delay,
    random_ua,
)

logger = logging.getLogger(__name__)

SPORT_PATHS = [
    ("football", "Football"),
    ("basketball", "Basketball"),
    ("tennis", "Tennis"),
    ("hockey", "Hockey"),
    ("volleyball", "Volleyball"),
    ("handball", "Handball"),
    ("baseball", "Baseball"),
    ("american-football", "American Football"),
    ("rugby", "Rugby"),
    ("cricket", "Cricket"),
    ("esports", "Esports"),
]


class Scores24Scraper:
    """Scores24.live — varias rutas de deporte."""

    slug = "scores24"
    base_url = "https://scores24.live"

    def _fetch(self, url: str, proxy: str | None = None) -> str:
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        proxies = {"http": proxy, "https": proxy} if proxy else None
        headers = {"User-Agent": random_ua()}
        res = scraper.get(url, headers=headers, proxies=proxies, timeout=45)
        res.raise_for_status()
        return res.text

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        for path, sport_label in SPORT_PATHS:
            url = f"{self.base_url}/en/{path}"

            def attempt(u: str = url) -> str:
                random_delay(3, 10)
                try:
                    return self._fetch(u)
                except Exception:
                    for proxy in FREE_PROXIES[:2]:
                        try:
                            random_delay(3, 8)
                            return self._fetch(u, proxy)
                        except Exception:
                            continue
                    raise

            try:
                html = exponential_retry(attempt, max_attempts=2, waits=[5, 15])
                preds = self._parse_html(html, sport_label)
                result["predictions"].extend(preds)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Scores24 %s failed: %s", path, exc)

        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "Scores24 multi-sport",
                    "totalOdds": 4.5,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:5],
                }
            )
        return result

    def _parse_html(self, html: str, sport_label: str) -> list[dict[str, Any]]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "lxml")
        preds: list[dict[str, Any]] = []
        for row in soup.select("[class*='match'], tr, .event")[:120]:
            text = row.get_text(" ", strip=True)
            if len(text) < 8:
                continue
            preds.append(
                {
                    "matchDate": date.today().isoformat(),
                    "league": f"{sport_label}: Scores24",
                    "homeTeam": text[:40],
                    "awayTeam": text[40:80] or "TBD",
                    "betType": "1X2",
                    "betChoice": "N/A",
                    "statsNote": text[:240],
                    "isLive": "live" in text.lower(),
                }
            )
        return preds
