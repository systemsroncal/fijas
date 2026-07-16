"""Scraper SofaScore (ES)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sites.base import empty_result, exponential_retry, random_delay, random_ua

try:
    import cloudscraper
except ImportError:  # pragma: no cover
    cloudscraper = None  # type: ignore


class SofascoreScraper:
    """SofaScore — partidos del día (HTML + API pública si responde)."""

    slug = "sofascore"
    base_url = "https://www.sofascore.com"

    def _fetch(self, url: str) -> str:
        if cloudscraper is None:
            from sites.base import fetch_html

            return fetch_html(url)
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        res = scraper.get(
            url,
            headers={
                "User-Agent": random_ua(),
                "Accept": "text/html,application/json",
            },
            timeout=45,
        )
        res.raise_for_status()
        return res.text

    def _api_events(self) -> list[dict[str, Any]]:
        """Intenta API pública scheduled-events (puede fallar por anti-bot)."""
        today = date.today().isoformat()
        url = f"https://api.sofascore.com/api/v1/sport/football/scheduled-events/{today}"
        preds: list[dict[str, Any]] = []
        try:
            import json

            def attempt() -> str:
                random_delay(1, 4)
                return self._fetch(url)

            raw = exponential_retry(attempt, max_attempts=2, waits=[4, 10])
            data = json.loads(raw)
            for ev in (data.get("events") or [])[:80]:
                home = (ev.get("homeTeam") or {}).get("name") or "TBD"
                away = (ev.get("awayTeam") or {}).get("name") or "TBD"
                tournament = (ev.get("tournament") or {}).get("name") or "SofaScore"
                preds.append(
                    {
                        "matchDate": today,
                        "league": f"Football: {tournament}",
                        "homeTeam": str(home)[:80],
                        "awayTeam": str(away)[:80],
                        "betType": "1X2",
                        "betChoice": "SofaScore",
                        "statsNote": f"id={ev.get('id')}",
                    }
                )
        except Exception:
            return []
        return preds

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        api_preds = self._api_events()
        result["predictions"].extend(api_preds)

        for path in ("/es", "/es/football", "/es/basketball", "/es/tennis"):
            url = f"{self.base_url}{path}"
            try:
                random_delay(2, 5)
                html = self._fetch(url)
                from bs4 import BeautifulSoup

                soup = BeautifulSoup(html, "lxml")
                for row in soup.select("[class*='event'], [class*='match'], a")[:100]:
                    text = row.get_text(" ", strip=True)
                    if len(text) < 8 or (" vs " not in text.lower() and " - " not in text):
                        continue
                    parts = text.replace(" VS ", " vs ").split(" vs ")
                    if len(parts) < 2:
                        parts = text.split(" - ", 1)
                    if len(parts) < 2:
                        continue
                    result["predictions"].append(
                        {
                            "matchDate": date.today().isoformat(),
                            "league": "SofaScore",
                            "homeTeam": parts[0].strip()[:80],
                            "awayTeam": parts[1].strip()[:80],
                            "betType": "1X2",
                            "betChoice": "Board",
                            "statsNote": text[:240],
                        }
                    )
            except Exception:
                continue

        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "SofaScore day board",
                    "totalOdds": 4.0,
                    "matchDate": date.today().isoformat(),
                    "legs": result["predictions"][:5],
                }
            )
        return result
