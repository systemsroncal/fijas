from sites.generic import GenericTipsScraper


class MeritPredictScraper(GenericTipsScraper):
    slug = "meritpredict"
    base_url = "https://www.meritpredict.com"
    day_paths = ["/"]
