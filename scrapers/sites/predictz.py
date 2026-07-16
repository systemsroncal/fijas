"""Scraper Predictz (hoy/mañana + acumuladas ES)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sites.base import soup_from_url, empty_result
from sites.generic import BaseHtmlScraper


class PredictzScraper(BaseHtmlScraper):
    """Predictz predictions tipster + acumuladas en español."""

    slug = "predictz"
    base_url = "https://www.predictz.com"

    def build_urls(self) -> list[str]:
        today = date.today()
        tomorrow = today + timedelta(days=1)
        return [
            f"{self.base_url}/predictions/{today.strftime('%Y-%m-%d')}/",
            f"{self.base_url}/predictions/{tomorrow.strftime('%Y-%m-%d')}/",
            f"{self.base_url}/predictions/today/",
            f"{self.base_url}/predictions/tomorrow/",
            f"{self.base_url}/es/pronosticos-de-acumuladas/",
            f"{self.base_url}/es/pronosticos-de-acumuladas/manana/",
            f"{self.base_url}/accumulator-tips/",
            f"{self.base_url}/accumulator-tips/tomorrow/",
        ]

    def parse(self, html_url: str) -> list[dict[str, Any]]:
        soup = soup_from_url(html_url)
        match_date = date.today().isoformat()
        if "manana" in html_url or "tomorrow" in html_url:
            match_date = (date.today() + timedelta(days=1)).isoformat()
        else:
            tail = html_url.rstrip("/").split("/")[-1]
            if len(tail) == 10 and tail[4] == "-":
                match_date = tail

        preds: list[dict[str, Any]] = []
        is_accu = "acumulad" in html_url or "accumulator" in html_url
        for row in soup.select(".pttr, .pttdd, table tr, .tipsrow, li, article"):
            text = row.get_text(" ", strip=True)
            if " v " not in text.lower() and " vs " not in text.lower():
                continue
            teams = text.replace(" V ", " v ").split(" v ")
            if len(teams) < 2:
                teams = text.lower().split(" vs ")
                # recover case from original
                idx = text.lower().find(" vs ")
                if idx >= 0:
                    teams = [text[:idx], text[idx + 4 :]]
            if len(teams) < 2:
                continue
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "div", "span"])]
            home = cells[0] if len(cells) >= 2 else teams[0][-40:].strip()
            away = cells[1] if len(cells) >= 2 else teams[1][:40].strip()
            preds.append(
                {
                    "matchDate": match_date,
                    "league": "Predictz Accumulators" if is_accu else "Predictz",
                    "homeTeam": home[:80],
                    "awayTeam": away[:80],
                    "betType": "1X2",
                    "betChoice": cells[2] if len(cells) > 2 else ("Accu" if is_accu else "Tip"),
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
                    is_accu = "acumulad" in url or "accumulator" in url
                    result["suggestedAccumulators"].append(
                        {
                            "title": (
                                f"Predictz acumulada {url.rstrip('/').split('/')[-1]}"
                                if is_accu
                                else f"Predictz tip combo {url.rstrip('/').split('/')[-1]}"
                            ),
                            "totalOdds": round(odds, 3),
                            "matchDate": date.today().isoformat(),
                            "legs": preds[:5],
                        }
                    )
            except Exception:
                continue
        return result
