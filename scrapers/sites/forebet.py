from sites.generic import GenericTipsScraper


class ForebetScraper(GenericTipsScraper):
    """Forebet multi-deporte: fútbol, basket, tenis, hockey, handball, vóley."""

    slug = "forebet"
    base_url = "https://www.forebet.com"
    max_rows = 250
    day_paths = [
        "/en/football/predictions/",
        "/en/basketball/predictions/",
        "/en/tennis/predictions/",
        "/en/hockey/predictions/",
        "/en/handball/predictions/",
        "/en/volleyball/predictions/",
    ]
