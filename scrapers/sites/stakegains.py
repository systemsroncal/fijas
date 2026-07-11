from sites.generic import GenericTipsScraper


class StakeGainsScraper(GenericTipsScraper):
    slug = "stakegains"
    base_url = "https://www.stakegains.com"
    day_paths = ["/"]
