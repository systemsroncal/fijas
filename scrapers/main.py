"""
Orquestador de scraping WPS Admin.

Ejecuta scrapers de 14 sitios y envía resultados al backend
POST /api/scraping/ingest con header X-API-Secret.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from typing import Any

import requests

from sites import ALL_SCRAPERS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("scraper")


def ingest(backend_url: str, api_secret: str, payload: dict[str, Any]) -> bool:
    """Envía predicciones al endpoint de ingesta del backend.

    Args:
        backend_url: URL base del backend (ej. https://epicdreamsworld.com/wps-admin).
        api_secret: Secreto compartido API_SECRET.
        payload: JSON con sourceSlug, predictions y suggestedAccumulators.

    Returns:
        True si el backend respondió 2xx.
    """
    url = backend_url.rstrip("/") + "/api/scraping/ingest"
    try:
        res = requests.post(
            url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-API-Secret": api_secret,
            },
            timeout=60,
        )
        if res.status_code >= 400:
            logger.error("Ingest failed %s: %s", res.status_code, res.text[:300])
            return False
        logger.info("Ingest OK %s: %s", payload.get("sourceSlug"), res.text[:200])
        return True
    except requests.RequestException as exc:
        logger.error("Ingest request error: %s", exc)
        return False


def run(source_filter: str = "all") -> int:
    """Ejecuta scrapers y publica resultados.

    Args:
        source_filter: slug de fuente o 'all'.

    Returns:
        Código de salida (0 ok, 1 con errores parciales).
    """
    backend_url = os.environ.get("BACKEND_URL", "").rstrip("/")
    api_secret = os.environ.get("API_SECRET", "")
    if not backend_url or not api_secret:
        logger.error("BACKEND_URL y API_SECRET son obligatorios")
        return 2

    errors = 0
    for slug, scraper_cls in ALL_SCRAPERS.items():
        if source_filter != "all" and slug != source_filter:
            continue
        logger.info("Scraping %s ...", slug)
        try:
            scraper = scraper_cls()
            result = scraper.scrape()
            payload = {
                "sourceSlug": slug,
                "predictions": result.get("predictions", []),
                "suggestedAccumulators": result.get("suggestedAccumulators", []),
            }
            if not ingest(backend_url, api_secret, payload):
                errors += 1
        except Exception as exc:  # noqa: BLE001 — continuar con siguiente sitio
            errors += 1
            logger.exception("Scraper %s failed: %s", slug, exc)

    return 1 if errors else 0


def main() -> None:
    """Punto de entrada CLI."""
    parser = argparse.ArgumentParser(description="WPS Admin scrapers")
    parser.add_argument("--source", default="all", help="slug de fuente o all")
    args = parser.parse_args()
    sys.exit(run(args.source))


if __name__ == "__main__":
    main()
