"""Scraper genérico basado en BeautifulSoup para sitios sin Cloudflare."""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlparse

from sites.base import empty_result, soup_from_url

logger = logging.getLogger(__name__)

_TIME_RE = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")
# Fecha mal mapeada como equipo: 14/07, 14-07, 2026-07-14
_DATE_RE = re.compile(
    r"^(?:\d{1,2}[/\.\-]\d{1,2}(?:[/\.\-]\d{2,4})?|\d{4}-\d{2}-\d{2})$"
)


def _is_meta_cell(text: str) -> bool:
    """True si la celda es hora/fecha/número, no un nombre de equipo."""
    t = text.strip()
    return bool(_TIME_RE.match(t) or _DATE_RE.match(t) or re.fullmatch(r"\d{1,4}", t))

_SPORT_PATH_HINTS = (
    ("basketball", "Basketball"),
    ("baloncesto", "Basketball"),
    ("tennis", "Tennis"),
    ("tenis", "Tennis"),
    ("hockey", "Hockey"),
    ("handball", "Handball"),
    ("volleyball", "Volleyball"),
    ("rugby", "Rugby"),
    ("cricket", "Cricket"),
    ("golf", "Golf"),
    ("baseball", "Baseball"),
    ("american-football", "American Football"),
    ("american_football", "American Football"),
    ("mma", "MMA"),
    ("boxing", "Boxing"),
    ("esport", "Esports"),
    ("football", "Football"),
    ("soccer", "Football"),
)


def _sport_from_url(url: str) -> str | None:
    path = urlparse(url).path.lower()
    for needle, label in _SPORT_PATH_HINTS:
        if needle in path:
            return label
    return None


def _split_vs(text: str) -> tuple[str, str] | None:
    """Separa 'A Vs B' / 'A vs B' / 'A v B' en (local, visitante)."""
    normalized = re.sub(r"\s+[vV][sS]\.?\s+", " vs ", text)
    normalized = re.sub(r"\s+[vV]\s+", " vs ", normalized)
    if " vs " not in normalized.lower():
        if " - " in text:
            parts = [p.strip() for p in text.split(" - ") if p.strip()]
            if len(parts) == 2 and all(len(p) > 2 for p in parts) and not any(
                _TIME_RE.match(p) for p in parts
            ):
                return parts[0], parts[1]
        return None
    parts = re.split(r"\s+vs\s+", normalized, flags=re.IGNORECASE)
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) != 2:
        return None
    if _TIME_RE.match(parts[0]) or _TIME_RE.match(parts[1]):
        return None
    return parts[0], parts[1]


def _guess_teams(cells: list[str]) -> tuple[str | None, str | None, str | None]:
    """Detecta local/visitante y hora opcional. Returns (home, away, kickoff)."""
    kickoff: str | None = None
    for cell in cells:
        t = cell.strip()
        if _TIME_RE.match(t) and kickoff is None:
            kickoff = t
            continue
        # Nunca tratar una fecha como equipo; solo guardar contexto
        if _DATE_RE.match(t):
            continue
        split = _split_vs(t)
        if split and not _is_meta_cell(split[0]) and not _is_meta_cell(split[1]):
            return split[0], split[1], kickoff

    if len(cells) >= 3 and _is_meta_cell(cells[1].strip()):
        split = _split_vs(cells[2])
        if split and not _is_meta_cell(split[0]) and not _is_meta_cell(split[1]):
            ko = cells[1].strip() if _TIME_RE.match(cells[1].strip()) else kickoff
            return split[0], split[1], ko

    if len(cells) >= 3:
        h, a = cells[1].strip(), cells[2].strip()
        if _is_meta_cell(h):
            split = _split_vs(a)
            if split and not _is_meta_cell(split[0]) and not _is_meta_cell(split[1]):
                ko = h if _TIME_RE.match(h) else kickoff
                return split[0], split[1], ko
            # Fecha/"14/07" + título sin poder partir → descartar fila
            return None, None, kickoff
        if _is_meta_cell(a):
            return None, None, kickoff
        # Si away trae "A Vs B" aunque home parezca texto, partir
        split = _split_vs(a)
        if split and not _is_meta_cell(split[0]) and not _is_meta_cell(split[1]):
            # home era basura tipo liga corta; preferir split del away
            if _is_meta_cell(h) or len(h) <= 3 or _DATE_RE.match(h):
                return split[0], split[1], kickoff
        if not _is_meta_cell(h) and not _is_meta_cell(a) and " vs " not in a.lower():
            return h, a, kickoff
    return None, None, kickoff


class BaseHtmlScraper(ABC):
    """Clase base para scrapers HTML."""

    slug: str = "base"
    base_url: str = ""

    @abstractmethod
    def build_urls(self) -> list[str]:
        """Construye URLs a scrapear (hoy/mañana cuando aplique)."""

    def parse(self, html_url: str) -> list[dict[str, Any]]:
        """Parsea predicciones desde una URL. Override en subclases."""
        return []

    def scrape(self) -> dict[str, Any]:
        """Ejecuta scraping completo."""
        result = empty_result()
        for url in self.build_urls():
            try:
                preds = self.parse(url)
                result["predictions"].extend(preds)
            except Exception as exc:  # noqa: BLE001
                logger.error("%s parse error %s: %s", self.slug, url, exc)
        return result


class GenericTipsScraper(BaseHtmlScraper):
    """Scraper genérico: intenta extraer filas de tablas con equipos."""

    day_paths: list[str] = ["/"]
    max_rows: int = 200

    def build_urls(self) -> list[str]:
        today = date.today()
        tomorrow = today + timedelta(days=1)
        urls: list[str] = []
        for path in self.day_paths:
            urls.append(self.base_url.rstrip("/") + path.format(date=today.isoformat()))
            if "{date}" in path:
                urls.append(
                    self.base_url.rstrip("/") + path.format(date=tomorrow.isoformat())
                )
        return list(dict.fromkeys(urls))

    def _match_date_from_url(self, html_url: str) -> str:
        """Inferir fecha del partido desde la URL (hoy / mañana / YYYY-MM-DD)."""
        today = date.today()
        tomorrow = today + timedelta(days=1)
        m = re.search(r"(20\d{2}-\d{2}-\d{2})", html_url)
        if m:
            return m.group(1)
        if "tomorrow" in html_url.lower():
            return tomorrow.isoformat()
        return today.isoformat()

    def parse(self, html_url: str) -> list[dict[str, Any]]:
        soup = soup_from_url(html_url)
        predictions: list[dict[str, Any]] = []
        sport = _sport_from_url(html_url)
        match_date = self._match_date_from_url(html_url)
        for row in soup.select("table tr")[: self.max_rows]:
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) < 3:
                continue
            home, away, kickoff = _guess_teams(cells)
            if not home or not away:
                continue
            tip = cells[-1] if cells else "N/A"
            raw_league = cells[0] if cells else "Unknown"
            league = (
                f"{sport}: {raw_league}"
                if sport and sport.lower() not in raw_league.lower()
                else raw_league
            )
            predictions.append(
                {
                    "matchDate": match_date,
                    "kickoff": kickoff,
                    "league": league,
                    "homeTeam": home,
                    "awayTeam": away,
                    "betType": "1X2",
                    "betChoice": tip,
                    "statsNote": " | ".join(cells[:6]),
                }
            )
        return predictions
