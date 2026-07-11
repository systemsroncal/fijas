"""Registro de scrapers por slug."""

from __future__ import annotations

from sites.predictz import PredictzScraper
from sites.windrawwin import WinDrawWinScraper
from sites.scores24 import Scores24Scraper
from sites.soccer24 import Soccer24Scraper
from sites.oddsportal import OddsPortalScraper
from sites.forebet import ForebetScraper
from sites.tips1960 import Tips1960Scraper
from sites.statarea import StatAreaScraper
from sites.victorspredict import VictorsPredictScraper
from sites.meritpredict import MeritPredictScraper
from sites.safertip import SaferTipScraper
from sites.stakegains import StakeGainsScraper
from sites.nordicbet import NordicBetScraper
from sites.betway import BetwayScraper

ALL_SCRAPERS = {
    "predictz": PredictzScraper,
    "windrawwin": WinDrawWinScraper,
    "scores24": Scores24Scraper,
    "soccer24": Soccer24Scraper,
    "oddsportal": OddsPortalScraper,
    "forebet": ForebetScraper,
    "1960tips": Tips1960Scraper,
    "statarea": StatAreaScraper,
    "victorspredict": VictorsPredictScraper,
    "meritpredict": MeritPredictScraper,
    "safertip": SaferTipScraper,
    "stakegains": StakeGainsScraper,
    "nordicbet": NordicBetScraper,
    "betway": BetwayScraper,
}
