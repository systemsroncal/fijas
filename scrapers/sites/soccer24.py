"""Soccer24 scraper."""

from sites.generic import GenericTipsScraper


class Soccer24Scraper(GenericTipsScraper):
    slug = "soccer24"
    base_url = "https://www.soccer24.com"
    day_paths = ["/football/"]
