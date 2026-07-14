"""Betway — peticiones a API interna multi-deporte."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import requests

from sites.base import empty_result, random_ua

logger = logging.getLogger(__name__)

# IDs típicos Betway (pueden variar por región)
SPORT_IDS = [
    (1, "Football"),
    (2, "Tennis"),
    (3, "Basketball"),
    (4, "Ice Hockey"),
    (5, "American Football"),
    (6, "Baseball"),
    (10, "Rugby"),
    (12, "Golf"),
    (13, "Cricket"),
    (15, "Handball"),
    (16, "Volleyball"),
    (20, "MMA"),
    (29, "Esports"),
]


class BetwayScraper:
    """Consume endpoints internos/públicos de Betway cuando estén disponibles."""

    slug = "betway"

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        headers = {
            "User-Agent": random_ua(),
            "Accept": "application/json, text/html",
            "Content-Type": "application/json",
        }

        for sport_id, sport_label in SPORT_IDS:
            try:
                res = requests.post(
                    "https://www.betway.com/api/Events/V2/GetEvents",
                    json={"SportId": sport_id, "IsLive": False},
                    headers=headers,
                    timeout=25,
                )
                if res.status_code >= 400:
                    continue
                ctype = res.headers.get("content-type", "")
                if "json" not in ctype:
                    continue
                preds = self._from_json(res.json(), sport_label)
                result["predictions"].extend(preds)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Betway sport %s failed: %s", sport_id, exc)

        if not result["predictions"]:
            try:
                res = requests.get("https://www.betway.com/en/sports/soc", headers=headers, timeout=30)
                if res.status_code < 400:
                    from bs4 import BeautifulSoup

                    soup = BeautifulSoup(res.text, "lxml")
                    for row in soup.select("[class*='event'], tr")[:80]:
                        text = row.get_text(" ", strip=True)
                        if len(text) < 10:
                            continue
                        result["predictions"].append(
                            {
                                "matchDate": date.today().isoformat(),
                                "league": "Football: Betway",
                                "homeTeam": text[:40],
                                "awayTeam": text[40:80] or "TBD",
                                "betType": "1X2",
                                "betChoice": "N/A",
                                "statsNote": text[:200],
                            }
                        )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Betway HTML fallback failed: %s", exc)

        return result

    def _from_json(self, data: Any, sport_label: str) -> list[dict[str, Any]]:
        preds: list[dict[str, Any]] = []
        events = []
        if isinstance(data, dict):
            events = data.get("Events") or data.get("events") or data.get("Result") or []
        if isinstance(events, dict):
            events = events.get("Items") or []
        for ev in (events or [])[:80]:
            if not isinstance(ev, dict):
                continue
            league = str(ev.get("CategoryName", sport_label))
            if sport_label.lower() not in league.lower():
                league = f"{sport_label}: {league}"
            preds.append(
                {
                    "matchDate": date.today().isoformat(),
                    "league": league,
                    "homeTeam": str(ev.get("HomeTeamName", ev.get("home", "Home"))),
                    "awayTeam": str(ev.get("AwayTeamName", ev.get("away", "Away"))),
                    "betType": "1X2",
                    "betChoice": "N/A",
                }
            )
        return preds
