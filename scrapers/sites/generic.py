"""Scraper genérico basado en BeautifulSoup para sitios sin Cloudflare."""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import Any

from sites.base import empty_result, soup_from_url

logger = logging.getLogger(__name__)

_TIME_RE = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")


def _split_vs(text: str) -> tuple[str, str] | None:
    """Separa 'A Vs B' / 'A vs B' / 'A v B' en (local, visitante)."""
    normalized = re.sub(r"\s+[vV][sS]\.?\s+", " vs ", text)
    normalized = re.sub(r"\s+[vV]\s+", " vs ", normalized)
    if " vs " not in normalized.lower():
        # Fallback: "A - B" solo si ambos lados parecen equipos
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
    """Detecta local/visitante y hora opcional.

    Returns:
        (home, away, kickoff)
    """
    kickoff: str | None = None
    for cell in cells:
        t = cell.strip()
        if _TIME_RE.match(t) and kickoff is None:
            kickoff = t
            continue
        split = _split_vs(t)
        if split:
            return split[0], split[1], kickoff

    # SaferTip típico: [liga, hora, "A Vs B", tip...]
    if len(cells) >= 3 and _TIME_RE.match(cells[1].strip()):
        split = _split_vs(cells[2])
        if split:
            return split[0], split[1], cells[1].strip()

    if len(cells) >= 3:
        h, a = cells[1].strip(), cells[2].strip()
        if _TIME_RE.match(h):
            split = _split_vs(a)
            if split:
                return split[0], split[1], h
        if not _TIME_RE.match(h) and not _TIME_RE.match(a):
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
    """Scraper genérico: intenta extraer filas de tablas con equipos.

    Los selectores se pueden refinar desde el panel SuperAdmin
    (selectors_config) y versionar en el repo.
    """

    day_paths: list[str] = ["/"]

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

    def parse(self, html_url: str) -> list[dict[str, Any]]:
        soup = soup_from_url(html_url)
        predictions: list[dict[str, Any]] = []
        # Heurística: filas con al menos 2 celdas de texto
        for row in soup.select("table tr")[:80]:
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) < 3:
                continue
            home, away, kickoff = _guess_teams(cells)
            if not home or not away:
                continue
            tip = cells[-1] if cells else "N/A"
            predictions.append(
                {
                    "matchDate": date.today().isoformat(),
                    "kickoff": kickoff,
                    "league": cells[0] if cells else "Unknown",
                    "homeTeam": home,
                    "awayTeam": away,
                    "betType": "1X2",
                    "betChoice": tip,
                    "statsNote": " | ".join(cells[:6]),
                }
            )
        return predictions
