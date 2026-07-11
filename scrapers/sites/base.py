"""Utilidades compartidas de scraping."""

from __future__ import annotations

import logging
import random
import time
from typing import Any

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
]

# Proxies gratuitos de respaldo (pueden estar caídos; se usan solo si falla directo)
FREE_PROXIES: list[str] = []


def random_ua() -> str:
    """Devuelve un User-Agent aleatorio."""
    return random.choice(USER_AGENTS)


def fetch_html(url: str, timeout: int = 30) -> str:
    """Obtiene HTML con requests + UA rotativo.

    Args:
        url: URL a consultar.
        timeout: Timeout en segundos.

    Returns:
        HTML como string.
    """
    headers = {"User-Agent": random_ua(), "Accept-Language": "en-US,en;q=0.9"}
    res = requests.get(url, headers=headers, timeout=timeout)
    res.raise_for_status()
    return res.text


def soup_from_url(url: str) -> BeautifulSoup:
    """Parsea BeautifulSoup desde una URL."""
    return BeautifulSoup(fetch_html(url), "lxml")


def exponential_retry(fn, max_attempts: int = 3, waits: list[int] | None = None):
    """Reintentos con espera 5s, 10s, 30s.

    Args:
        fn: Callable sin argumentos.
        max_attempts: Máximo de intentos.
        waits: Segundos de espera entre intentos.

    Returns:
        Resultado de fn.
    """
    waits = waits or [5, 10, 30]
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < max_attempts - 1:
                delay = waits[min(attempt, len(waits) - 1)]
                logger.warning("Retry %s after %ss: %s", attempt + 1, delay, exc)
                time.sleep(delay)
    assert last_exc is not None
    raise last_exc


def random_delay(min_s: float = 5.0, max_s: float = 15.0) -> None:
    """Retraso aleatorio anti-bot."""
    time.sleep(random.uniform(min_s, max_s))


def empty_result() -> dict[str, Any]:
    """Resultado vacío estándar."""
    return {"predictions": [], "suggestedAccumulators": []}
