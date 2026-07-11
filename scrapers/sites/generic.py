"""Scraper genérico basado en BeautifulSoup para sitios sin Cloudflare."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import Any

from sites.base import empty_result, soup_from_url

logger = logging.getLogger(__name__)


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
            home, away = _guess_teams(cells)
            if not home or not away:
                continue
            predictions.append(
                {
                    "matchDate": date.today().isoformat(),
                    "league": cells[0] if cells else "Unknown",
                    "homeTeam": home,
                    "awayTeam": away,
                    "betType": "1X2",
                    "betChoice": cells[-1] if cells else "N/A",
                    "statsNote": " | ".join(cells[:6]),
                }
            )
        return predictions


def _guess_teams(cells: list[str]) -> tuple[str | None, str | None]:
    """Intenta detectar local/visitante en celdas."""
    for cell in cells:
        if " vs " in cell.lower():
            parts = cell.replace(" VS ", " vs ").split(" vs ")
            if len(parts) == 2:
                return parts[0].strip(), parts[1].strip()
        if " - " in cell:
            parts = cell.split(" - ")
            if len(parts) == 2 and all(len(p) > 2 for p in parts):
                return parts[0].strip(), parts[1].strip()
    if len(cells) >= 3:
        return cells[1], cells[2]
    return None, None
