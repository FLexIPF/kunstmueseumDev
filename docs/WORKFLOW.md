# KI-Workflow (lokal)

Ziel: Aus Ordnern + Dateinamen wird ein sauberer Katalog, Ausstellungen und Social-Drafts erzeugt.

## 1) Ordnerstruktur

```
data/inbox/
data/artists/<artist_id>/series/<series_id>/works/
data/exhibitions/<year>_<event>_<city>/
data/catalog/
data/social/
data/finance/
```

## 2) Katalog starten (Scan aus Ordnern)

```bash
python3 scripts/catalog_scan.py
```

Erstellt `data/catalog/artworks.draft.csv` aus den Dateien in `data/artists` + `data/inbox`.
Danach manuell pruefen und als `data/catalog/artworks.csv` speichern.
Hinweis: CSV aus Numbers/Excel darf auch Semikolon‑getrennt sein (wird erkannt).

### Alternative: direkt aus dem bestehenden Kunst-Ordner

Wenn du deine Bilder aktuell noch in `../kunst/Bilder/for sale/` hast:

```bash
python3 scripts/catalog_from_kunst.py
```

Das erzeugt sofort `data/catalog/artworks.csv` aus dem vorhandenen Ordner
(inkl. optionaler Groessen/Jahre aus `../kunst/Bilder/bilderF.IPFLING`).

## 3) KI-Analyse (lokal, optional)

```bash
python3 scripts/ai_analyze.py --catalog data/catalog/artworks.csv
```

Erstellt `data/catalog/artworks.ai.csv` mit Tag-/Mood-/Caption-Vorschlaegen.

## 4) Ausstellungen aus Ordnern

```bash
python3 scripts/exhibitions_scan.py
```

Erstellt `data/catalog/exhibitions.csv` aus `data/exhibitions/`.

## 5) Social-Drafts generieren

```bash
python3 scripts/social_generate.py --weeks 4 --posts-per-week 3
```

Erstellt `data/social/drafts.csv` (Entwuerfe fuer Instagram/TikTok).

## 6) Import in die App (optional)

Wenn du den Shop/Museum-Katalog aktualisieren willst:

```bash
python3 scripts/import_artworks.py
```

Wenn `data/catalog/artworks.csv` existiert, werden CSV-Felder als Overrides in
`src/content/artworks.overrides.generated.ts` geschrieben.

## Felder (Kurzuebersicht)

Pflicht in `artworks.csv`:

- `id, title, year, medium, width_cm, height_cm, category, status, price_eur, images_source, series_id, artist_id, room_id`

Optional:

- `edition, tags, story, shopify_handle, shopify_collection_url, availability_notes`
