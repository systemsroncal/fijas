"""NordicBet — peticiones a API interna."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import requests

from sites.base import empty_result, random_ua

logger = logging.getLogger(__name__)


class NordicBetScraper:
    """Intenta consumir endpoints públicos/internal de NordicBet."""

    slug = "nordicbet"
    # Endpoint típico de catálogo; puede requerir ajuste según región
    api_url = "https://www.nordicbet.com/en/sportsbook/football"

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        headers = {
            "User-Agent": random_ua(),
            "Accept": "application/json, text/html",
        }
        try:
            # Intento API JSON; si falla, no rompe el pipeline
            api_candidates = [
                "https://www.nordicbet.com/api/offering/v2018/offering?groupId=1000093190",
                "https://www.nordicbet.com/en/sports/football",
            ]
            for url in api_candidates:
                try:
                    res = requests.get(url, headers=headers, timeout=30)
                    if res.status_code != 200:
                        continue
                    ctype = res.headers.get("content-type", "")
                    if "json" in ctype:
                        data = res.json()
                        result["predictions"].extend(self._from_json(data))
                    else:
                        result["predictions"].extend(self._from_html(res.text))
                    if result["predictions"]:
                        break
                except Exception as exc:  # noqa: BLE001
                    logger.warning("NordicBet candidate failed %s: %s", url, exc)
        except Exception as exc:  # noqa: BLE001
            logger.error("NordicBet failed: %s", exc)
        return result

    def _from_json(self, data: Any) -> list[dict[str, Any]]:
        preds: list[dict[str, Any]] = []
        # Estructura variable: aplanar eventos si existen
        events = []
        if isinstance(data, dict):
            events = data.get("events") or data.get("items") or []
        if isinstance(data, list):
            events = data
        for ev in events[:40]:
            if not isinstance(ev, dict):
                continue
            preds.append(
                {
                    "matchDate": date.today().isoformat(),
                    "league": str(ev.get("group", ev.get("league", "NordicBet"))),
                    "homeTeam": str(ev.get("homeName", ev.get("home", "Home"))),
                    "awayTeam": str(ev.get("awayName", ev.get("away", "Away"))),
                    "betType": "1X2",
                    "betChoice": "N/A",
                    "oddsHome": _num(ev.get("odds1")),
                    "oddsDraw": _num(ev.get("oddsX")),
                    "oddsAway": _num(ev.get("odds2")),
                }
            )
        return preds

    def _from_html(self, html: str) -> list[dict[str, Any]]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "lxml")
        preds: list[dict[str, Any]] = []
        for row in soup.select("[class*='event'], tr")[:30]:
            text = row.get_text(" ", strip=True)
            if len(text) < 10:
                continue
            preds.append(
                {
                    "matchDate": date.today().isoformat(),
                    "league": "NordicBet",
                    "homeTeam": text[:40],
                    "awayTeam": text[40:80] or "TBD",
                    "betType": "1X2",
                    "betChoice": "N/A",
                    "statsNote": text[:200],
                }
            )
        return preds


def _num(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None
