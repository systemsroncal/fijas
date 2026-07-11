"""Betway — peticiones a API interna."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import requests

from sites.base import empty_result, random_ua

logger = logging.getLogger(__name__)


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
        # Endpoints candidatos (varían por región; se registran errores y se continúa)
        candidates = [
            (
                "POST",
                "https://www.betway.com/api/Events/V2/GetEvents",
                {"SportId": 1, "IsLive": False},
            ),
            ("GET", "https://www.betway.com/en/sports/soc", None),
        ]
        for method, url, body in candidates:
            try:
                if method == "POST":
                    res = requests.post(url, json=body, headers=headers, timeout=30)
                else:
                    res = requests.get(url, headers=headers, timeout=30)
                if res.status_code >= 400:
                    continue
                ctype = res.headers.get("content-type", "")
                if "json" in ctype:
                    result["predictions"].extend(self._from_json(res.json()))
                else:
                    from bs4 import BeautifulSoup

                    soup = BeautifulSoup(res.text, "lxml")
                    for row in soup.select("[class*='event'], tr")[:30]:
                        text = row.get_text(" ", strip=True)
                        if len(text) < 10:
                            continue
                        result["predictions"].append(
                            {
                                "matchDate": date.today().isoformat(),
                                "league": "Betway",
                                "homeTeam": text[:40],
                                "awayTeam": text[40:80] or "TBD",
                                "betType": "1X2",
                                "betChoice": "N/A",
                                "statsNote": text[:200],
                            }
                        )
                if result["predictions"]:
                    break
            except Exception as exc:  # noqa: BLE001
                logger.warning("Betway candidate failed: %s", exc)
        return result

    def _from_json(self, data: Any) -> list[dict[str, Any]]:
        preds: list[dict[str, Any]] = []
        events = []
        if isinstance(data, dict):
            events = data.get("Events") or data.get("events") or data.get("Result") or []
        if isinstance(events, dict):
            events = events.get("Items") or []
        for ev in (events or [])[:40]:
            if not isinstance(ev, dict):
                continue
            preds.append(
                {
                    "matchDate": date.today().isoformat(),
                    "league": str(ev.get("CategoryName", "Betway")),
                    "homeTeam": str(ev.get("HomeTeamName", ev.get("home", "Home"))),
                    "awayTeam": str(ev.get("AwayTeamName", ev.get("away", "Away"))),
                    "betType": "1X2",
                    "betChoice": "N/A",
                }
            )
        return preds
