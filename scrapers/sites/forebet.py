from sites.generic import GenericTipsScraper


class ForebetScraper(GenericTipsScraper):
    slug = "forebet"
    base_url = "https://www.forebet.com"
    day_paths = ["/en/football/predictions/"]
