from sites.generic import GenericTipsScraper


class Tips1960Scraper(GenericTipsScraper):
    slug = "1960tips"
    base_url = "https://www.1960tips.com"
    day_paths = ["/"]
