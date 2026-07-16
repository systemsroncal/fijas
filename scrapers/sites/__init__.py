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
from sites.scores365 import Scores365Scraper
from sites.flashscore import FlashscoreScraper
from sites.sofascore import SofascoreScraper
from sites.theanalyst import TheAnalystScraper
from sites.cuotasahora import CuotasAhoraScraper
from sites.fbref import FbrefScraper
from sites.nba import NbaScraper
from sites.nfl import NflScraper
from sites.espn_yahoo import EspnYahooScraper
from sites.google_search import GoogleSportsSearchScraper
from sites.football_data import FootballDataScraper

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
    "scores365": Scores365Scraper,
    "flashscore": FlashscoreScraper,
    "sofascore": SofascoreScraper,
    "theanalyst": TheAnalystScraper,
    "cuotasahora": CuotasAhoraScraper,
    "fbref": FbrefScraper,
    "nba": NbaScraper,
    "nfl": NflScraper,
    "espn_yahoo": EspnYahooScraper,
    "google_search": GoogleSportsSearchScraper,
    "football_data": FootballDataScraper,
}
