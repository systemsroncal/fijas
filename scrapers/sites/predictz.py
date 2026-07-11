"""Scraper Predictz (hoy y mañana)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sites.base import soup_from_url, empty_result
from sites.generic import BaseHtmlScraper


class PredictzScraper(BaseHtmlScraper):
    """Predictz predictions tipster."""

    slug = "predictz"
    base_url = "https://www.predictz.com"

    def build_urls(self) -> list[str]:
        today = date.today()
        tomorrow = today + timedelta(days=1)
        return [
            f"{self.base_url}/predictions/{today.strftime('%Y-%m-%d')}/",
            f"{self.base_url}/predictions/{tomorrow.strftime('%Y-%m-%d')}/",
        ]

    def parse(self, html_url: str) -> list[dict[str, Any]]:
        soup = soup_from_url(html_url)
        match_date = html_url.rstrip("/").split("/")[-1]
        preds: list[dict[str, Any]] = []
        for row in soup.select(".pttr, .pttdd, table tr"):
            text = row.get_text(" ", strip=True)
            if " v " not in text.lower() and " vs " not in text.lower():
                continue
            teams = text.replace(" V ", " v ").split(" v ")
            if len(teams) < 2:
                teams = text.lower().split(" vs ")
            if len(teams) < 2:
                continue
            home = teams[0].split()[-3:] if False else teams[0][-40:].strip()
            away = teams[1][:40].strip()
            # Mejor esfuerzo con celdas
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "div", "span"])]
            if len(cells) >= 2:
                home, away = cells[0], cells[1]
            preds.append(
                {
                    "matchDate": match_date if len(match_date) == 10 else date.today().isoformat(),
                    "league": "Predictz",
                    "homeTeam": home[:80],
                    "awayTeam": away[:80],
                    "betType": "1X2",
                    "betChoice": cells[2] if len(cells) > 2 else "Tip",
                    "statsNote": text[:240],
                }
            )
        return preds

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        for url in self.build_urls():
            try:
                preds = self.parse(url)
                result["predictions"].extend(preds)
                if len(preds) >= 3:
                    odds = 1.5 ** min(len(preds), 5)
                    result["suggestedAccumulators"].append(
                        {
                            "title": f"Predictz tip combo {url.rstrip('/').split('/')[-1]}",
                            "totalOdds": round(odds, 3),
                            "matchDate": date.today().isoformat(),
                            "legs": preds[:5],
                        }
                    )
            except Exception:
                continue
        return result
