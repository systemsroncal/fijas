from sites.generic import GenericTipsScraper


class OddsPortalScraper(GenericTipsScraper):
    """OddsPortal: varias disciplinas para ampliar cobertura de torneos."""

    slug = "oddsportal"
    base_url = "https://www.oddsportal.com"
    max_rows = 200
    day_paths = [
        "/football/",
        "/basketball/",
        "/tennis/",
        "/hockey/",
        "/baseball/",
        "/volleyball/",
        "/handball/",
        "/rugby-union/",
        "/cricket/",
        "/golf/",
        "/mma/",
        "/esports/",
    ]
