import unittest

from scripts.import_artworks import clean_title, parse_dims, parse_medium, parse_year, slugify


class TestImportArtworks(unittest.TestCase):
    def test_slugify_umlauts(self):
        self.assertEqual(slugify("Zittern im zwielicht"), "zittern-im-zwielicht")
        self.assertEqual(slugify("Wege und Tu\u0308ren"), "wege-und-tueren")
        self.assertEqual(slugify("Gro\u00dfes Ding"), "grosses-ding")

    def test_parse_dims(self):
        self.assertEqual(parse_dims("BierBassBelanglosikeit70x100"), (70, 100))
        self.assertEqual(parse_dims("Brandung der Farben 28x48cm 2021"), (28, 48))
        self.assertEqual(parse_dims("no dims here"), (None, None))

    def test_parse_year(self):
        self.assertEqual(parse_year("Brandung der Farben 28x48cm 2021"), 2021)
        self.assertEqual(parse_year("no year"), None)
        self.assertEqual(parse_year("x 2019 y 2023"), 2023)

    def test_parse_medium(self):
        self.assertEqual(parse_medium("Aquarell auf papier"), "Aquarell")
        self.assertEqual(parse_medium("Acryl auf Leinwand"), "Acryl")
        self.assertEqual(parse_medium("random"), None)

    def test_clean_title(self):
        self.assertEqual(clean_title("BierBassBelanglosikeit70x100"), "Bier Bass Belanglosikeit")
        self.assertEqual(clean_title("Brandung der Farben 28x48cm 2021"), "Brandung der Farben")
        self.assertEqual(clean_title("whosRix?"), "whos Rix?")


if __name__ == "__main__":
    unittest.main()
