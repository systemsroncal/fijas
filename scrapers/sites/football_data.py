"""Scraper / sync football-data.org API v4 (plan free)."""

from __future__ import annotations

import logging
import os
import time
from datetime import date
from typing import Any

import requests

from sites.base import empty_result

logger = logging.getLogger(__name__)

BASE = "https://api.football-data.org/v4"
# Códigos habituales del plan free
COMP_CODES = ["PL", "PD", "BL1", "SA", "FL1", "CL", "DED", "PPL", "ELC", "BSA", "WC", "EC"]


class FootballDataScraper:
    """Ingesta fixtures/resultados vía API (X-Auth-Token)."""

    slug = "football_data"
    base_url = "https://www.football-data.org"

    def _headers(self) -> dict[str, str]:
        token = os.environ.get("FOOTBALL_DATA_API_TOKEN", "").strip()
        if not token:
            raise RuntimeError("FOOTBALL_DATA_API_TOKEN no definido")
        return {"X-Auth-Token": token, "Accept": "application/json"}

    def _get(self, path: str) -> dict[str, Any]:
        # Free: 10 req/min → pausa entre llamadas
        time.sleep(6.5)
        res = requests.get(f"{BASE}{path}", headers=self._headers(), timeout=30)
        if res.status_code == 429:
            logger.warning("football-data rate limit; sleeping 60s")
            time.sleep(60)
            res = requests.get(f"{BASE}{path}", headers=self._headers(), timeout=30)
        res.raise_for_status()
        return res.json()

    def scrape(self) -> dict[str, Any]:
        result = empty_result()
        today = date.today().isoformat()
        try:
            data = self._get("/matches")
        except Exception as exc:  # noqa: BLE001
            logger.error("football-data /matches failed: %s", exc)
            return result

        for m in data.get("matches") or []:
            home = (m.get("homeTeam") or {}).get("name") or "TBD"
            away = (m.get("awayTeam") or {}).get("name") or "TBD"
            comp = (m.get("competition") or {}).get("name") or "football-data"
            status = m.get("status") or ""
            score = m.get("score") or {}
            ft = score.get("fullTime") or {}
            note = status
            if ft.get("home") is not None and ft.get("away") is not None:
                note = f"{status} {ft['home']}-{ft['away']}"
            result["predictions"].append(
                {
                    "matchDate": (m.get("utcDate") or today)[:10],
                    "kickoff": (m.get("utcDate") or "")[11:16],
                    "league": f"Football: {comp}",
                    "homeTeam": str(home)[:80],
                    "awayTeam": str(away)[:80],
                    "betType": "1X2",
                    "betChoice": status or "FD",
                    "statsNote": note[:240],
                    "oddsHome": None,
                    "oddsDraw": None,
                    "oddsAway": None,
                }
            )

        # Una clasificación (1 req) para enriquecer notas — Premier por defecto
        try:
            standings = self._get("/competitions/PL/standings")
            table = []
            for block in standings.get("standings") or []:
                if block.get("type") == "TOTAL":
                    table = block.get("table") or []
                    break
            top = table[:5]
            if top and result["predictions"]:
                result["predictions"][0]["statsNote"] = (
                    (result["predictions"][0].get("statsNote") or "")
                    + " | PL top: "
                    + ", ".join(
                        f"{r.get('position')}.{(r.get('team') or {}).get('name','?')}({r.get('points')}pts)"
                        for r in top
                    )
                )[:240]
        except Exception as exc:  # noqa: BLE001
            logger.warning("football-data standings skip: %s", exc)

        if result["predictions"]:
            result["suggestedAccumulators"].append(
                {
                    "title": "football-data.org today",
                    "totalOdds": 3.5,
                    "matchDate": today,
                    "legs": result["predictions"][:5],
                }
            )
        return result
