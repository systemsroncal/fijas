"""Scraper Scores24 con bypass Cloudflare (cloudscraper)."""

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


class Scores24Scraper:
    """Scores24.live — Cloudflare + retrasos 5-15s + reintentos exponenciales."""

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
        url = f"{self.base_url}/en/football"

        def attempt() -> str:
            random_delay(5, 15)
            try:
                return self._fetch(url)
            except Exception:
                for proxy in FREE_PROXIES[:3]:
                    try:
                        random_delay(5, 15)
                        return self._fetch(url, proxy=proxy)
                    except Exception:
                        continue
                raise

        try:
            html = exponential_retry(attempt, max_attempts=3, waits=[5, 10, 30])
            # Parseo ligero: buscar patrones de partidos en JSON embebido o texto
            preds = self._parse_html(html)
            result["predictions"] = preds
            if preds:
                result["suggestedAccumulators"].append(
                    {
                        "title": "Scores24 combo",
                        "totalOdds": 4.5,
                        "matchDate": date.today().isoformat(),
                        "legs": preds[:5],
                    }
                )
        except Exception as exc:  # noqa: BLE001
            logger.error("Scores24 failed after retries: %s", exc)
        return result

    def _parse_html(self, html: str) -> list[dict[str, Any]]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "lxml")
        preds: list[dict[str, Any]] = []
        for row in soup.select("[class*='match'], tr, .event")[:60]:
            text = row.get_text(" ", strip=True)
            if len(text) < 8:
                continue
            preds.append(
                {
                    "matchDate": date.today().isoformat(),
                    "league": "Scores24",
                    "homeTeam": text[:40],
                    "awayTeam": text[40:80] or "TBD",
                    "betType": "1X2",
                    "betChoice": "N/A",
                    "statsNote": text[:240],
                    "isLive": "live" in text.lower(),
                }
            )
        return preds
