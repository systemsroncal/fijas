from sites.generic import GenericTipsScraper


class StatAreaScraper(GenericTipsScraper):
    slug = "statarea"
    base_url = "https://www.statarea.com"
    day_paths = ["/predictions"]
