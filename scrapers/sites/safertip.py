from sites.generic import GenericTipsScraper


class SaferTipScraper(GenericTipsScraper):
    slug = "safertip"
    base_url = "https://www.safertip.com"
    day_paths = ["/"]
