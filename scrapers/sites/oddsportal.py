from sites.generic import GenericTipsScraper


class OddsPortalScraper(GenericTipsScraper):
    slug = "oddsportal"
    base_url = "https://www.oddsportal.com"
    day_paths = ["/football/"]
