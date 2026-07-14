from sites.generic import GenericTipsScraper


class SaferTipScraper(GenericTipsScraper):
    slug = "safertip"
    base_url = "https://www.safertip.com"
    # Hoy + listados ampliados (no hay /tomorrow/ fiable en SaferTip)
    day_paths = ["/", "/all-predictions"]
