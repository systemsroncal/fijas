from sites.generic import GenericTipsScraper


class VictorsPredictScraper(GenericTipsScraper):
    slug = "victorspredict"
    base_url = "https://www.victorspredict.com"
    day_paths = ["/"]
