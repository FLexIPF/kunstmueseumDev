# Produkte / Gelato Workflow

Dieser Ordner ist ein lokaler Arbeitsbereich fuer Produktpflege und Browser-/Atlas-Automation. Er ist nicht Teil des produktiven Museum-Runtimes und wird von der App nicht importiert.

## Zweck

Ziel ist ein sauberer Ablauf von:

1. die aktuell im Projekt angezeigten Werke von Felix und Luca auslesen
2. diese Anzeige-Daten mit `data/catalog/artworks.csv` anreichern
3. daraus einen Gelato-orientierten Export erzeugen
3. den Export an Atlas / Browser-GPT uebergeben
4. Produkte und Varianten in Gelato anlegen
5. Ergebnisse wieder manuell in den Katalog oder spaeter in ein Sync-Script zurueckschreiben

## Wichtige Dateien in diesem Ordner

- `generate_gelato_export.py`
  - liest die aktuell im Projekt verwendeten Werke aus:
    - `src/content/artworks.generated.ts`
    - `src/content/artworks.overrides.generated.ts`
    - `src/content/artworks.overrides.ts`
    - `src/content/artist_packs.generated.ts`
  - reichert diese mit `data/catalog/artworks.csv` an
  - normalisiert Status und Pfade
  - schreibt `gelato_export.csv`
- `gelato_export.csv`
  - Arbeitsdatei fuer Atlas / Browser
  - eine Zeile pro Werk
  - enthaelt Titel, Masse, Status, Bildpfade und Variantenvorschlaege
- `gelato_jobs.csv`
  - gefilterte Arbeitsdatei nur fuer direkt anlegbare Gelato-Produkte
  - ohne Artist-Fotos
  - ohne manuelle Review-Faelle
- `gelato_variant_rules.csv`
  - einfache Print-Profil-Regeln nach Seitenverhaeltnis und Material
- `atlas_gelato_prompt.md`
  - ausfuehrlicher Prompt fuer Atlas / Browser-GPT
- `gelato.env.example`
  - lokale Platzhalter fuer Gelato-Zugangsdaten
- `create_gelato_products.py`
  - liest `gelato_jobs.csv`
  - nimmt die Gelato-Templates aus `.env.local`
  - erstellt Produkte per Gelato API
  - protokolliert alles in `gelato_created_products.csv`

## Eingabedaten

### 1) Anzeigequelle der App

Primaere Anzeigequelle:

- `src/content/artworks.generated.ts`
- `src/content/artist_packs.generated.ts`
- `src/content/artworks.overrides.generated.ts`
- `src/content/artworks.overrides.ts`

Wichtig:

- diese Dateien beschreiben die Werke so, wie sie aktuell in Browse / Detail / Museum verwendet werden
- damit ist Luca enthalten, auch wenn Luca nicht in `data/catalog/artworks.csv` steht
- auch manuelle Bild-/Shop-Overrides werden beruecksichtigt

### 2) Katalog-Anreicherung

Anreicherungsquelle:

- `data/catalog/artworks.csv`

Wichtig:

- die Datei ist aktuell mit `;` getrennt
- sie liefert fuer Felix den lokalen Originalpfad aus `images_source`
- sie liefert zusaetzliche Rohdaten wie Preis / Status / Shopify-Felder, falls sie nicht schon im aktuellen Content stehen

### 3) Originalbilder

Die Exportlogik priorisiert, wenn vorhanden, die Originaldatei aus `images_source`, zum Beispiel:

- `../kunst/Bilder/...`

Diese Pfade werden relativ zum Repo-Root aufgeloest. Wenn die Originaldatei fehlt, faellt der Export auf die generierten WebP-Dateien in `public/artworks/<id>/` zurueck.

### 4) Generierte Web-Bilder

Fallbacks fuer Browser-Workflows:

- `public/artworks/<artwork_id>/full.webp`
- `public/artworks/<artwork_id>/texture.webp`
- `public/artworks/<artwork_id>/thumb.webp`
- bei Luca auch direkte Public-Pfade wie `public/artist/luca/images/...`

## Ablauf

### Schritt 1: Katalog pruefen

Pflege zuerst die eigentlichen Anzeigequellen sauber:

- Felix-Werke: `data/catalog/artworks.csv` + Import/Overrides
- Luca-Werke: `artist_packs` / `src/content/artist_packs.generated.ts`

Wichtig fuer saubere Produktautomatisierung:

- `title`
- `artist_id`
- `width_cm`
- `height_cm`
- `status`
- `price_eur`
- `images_source`

Wichtig fuer die Abgrenzung:

- Artist-Fotos / Portraits koennen aktuell im Projekt ebenfalls als `Artwork` vorkommen
- sie werden im Export markiert und standardmaessig nicht fuer Gelato-Produktanlage empfohlen

Wenn ein Werk keine Masse oder kein brauchbares Bild hat, landet es im Export mit `manual_review_required=yes`.

### Schritt 2: Gelato-Export erzeugen

```bash
cd kunst-museum
python3 produkte/generate_gelato_export.py
```

Output:

- `produkte/gelato_export.csv`
- `produkte/gelato_jobs.csv`

### Schritt 3: Export pruefen

Wichtige Felder im Export:

- `create_print_product`
- `manual_review_required`
- `preferred_upload_path_abs`
- `gelato_profile`
- `gelato_material`
- `gelato_size_candidates_cm`

Empfehlung:

- fuer die erste Atlas-Session direkt `produkte/gelato_jobs.csv` verwenden
- `produkte/gelato_export.csv` bleibt die volle Masterliste
- `manual_review_required=yes` erst spaeter oder manuell behandeln

### Schritt 4: Atlas / Browser einsetzen

Atlas kann nicht direkt auf diesen lokalen Workspace zugreifen. Die Bruecke ist:

1. `produkte/gelato_export.csv` hochladen
2. fuer den ersten Durchlauf stattdessen besser `produkte/gelato_jobs.csv` hochladen
3. bei Bedarf die Bilddateien oder den betroffenen Bildordner bereitstellen
4. `produkte/atlas_gelato_prompt.md` als Arbeitsanweisung nutzen

### Schritt 4b: Direkt per Gelato API anlegen

Wenn du nicht ueber Atlas gehen willst, sondern direkt per API:

1. Trage in `.env.local` ein:
   - `GELATO_API_KEY`
   - `GELATO_STORE_ID`
   - `GELATO_PUBLIC_FILE_BASE_URL`
   - `GELATO_TEMPLATE_ID`
   - alternativ kannst du `GELATO_PUBLIC_FILE_BASE_URL` und `GELATO_TEMPLATE_ID` direkt per CLI uebergeben
2. `GELATO_PUBLIC_FILE_BASE_URL` ist kein Gelato-API-Parameter, sondern nur unser lokaler Helfer, um aus `/gelato-assets/...` vollqualifizierte Datei-URLs zu bauen.
3. Das Script erzeugt automatisch API-taugliche Dateien unter `public/gelato-assets/`, weil Gelato keine lokalen Pfade und keine WebP-Dateien verarbeiten soll.
4. Danach muessen diese Dateien unter deiner `GELATO_PUBLIC_FILE_BASE_URL` wirklich oeffentlich erreichbar sein.
5. Das Script arbeitet sortiert nach `artist_id`, dann `year`, dann `title`.
6. Produktnamen werden mit Artist-Prefix erzeugt, damit Felix und Luca im Gelato-Backend sauber gruppiert sind.
7. Varianten werden pro Werk nach Ausrichtung und Seitenverhaeltnis gefiltert, damit nur Posterformate angelegt werden, die das Bild sauber ausfuellen.
8. Standardregel fuer Poster: kein Weissrand, `fitMethod=slice`, maximal `5%` Beschnitt pro Seite. Das kannst du ueber `--max-crop-per-side` anpassen.
9. Mehrere Templates in einem Lauf gehen ueber `--template-profile profile=<template-id>`. Vorhandene Profile: `poster`, `framed`, `canvas`, `tshirt`.
10. Fuer Testlaeufe mit echten Gelato-Varianten statt lokaler Vorschau nutze `--live-template-preview`.
11. Fuer Format-Debug nutze `--debug-variants` und optional `--debug-variants-csv /tmp/gelato_variant_debug.csv`, um die konkret ausgewaehlten Variantengroessen, Ratios und Crop-Werte zu sehen.
12. Bei Postern/Rahmen/Canvas liest das Script die echten `cm`-Masse jetzt bevorzugt aus dem Variantentitel; nur wenn dort nichts Parsebares steht, faellt es auf die Placeholder-Geometrie zurueck.
13. Wenn `gelato_size_candidates_cm` in `produkte/gelato_jobs.csv` gesetzt ist, werden Poster/Rahmen/Canvas zusaetzlich auf genau diese empfohlenen Groessen eingeschraenkt.

Dry Run:

```bash
cd kunst-museum
python3 produkte/create_gelato_products.py
```

Vor dem echten Lauf:

- pruefe lokal, dass `public/gelato-assets/` erzeugt wurde
- deploye oder publiziere die Site so, dass `https://deine-domain/.../gelato-assets/...` erreichbar ist

Echter Lauf:

```bash
cd kunst-museum
python3 produkte/create_gelato_products.py --apply
```

Echter Lauf mit direkter Template-ID und Domain im Befehl:

```bash
cd kunst-museum
python3 produkte/create_gelato_products.py --apply --template-id YOUR_TEMPLATE_ID --public-file-base-url https://your-domain.example.com
```

Mit explizitem Crop-Limit:

```bash
cd kunst-museum
python3 produkte/create_gelato_products.py --apply --template-id YOUR_TEMPLATE_ID --public-file-base-url https://your-domain.example.com --max-crop-per-side 0.05
```

Testlauf mit 5 unterschiedlich proportionierten Werken fuer mehrere Produkttypen:

```bash
cd kunst-museum
python3 produkte/create_gelato_products.py \
  --sample-diverse 5 \
  --live-template-preview \
  --debug-variants \
  --debug-variants-csv /tmp/gelato_variant_debug.csv \
  --template-profile poster=6a8e7a46-d1b5-45f7-9866-be20bc9a6b9b \
  --template-profile framed=7e8ce8d0-0d99-47d7-ab50-0722d2cd6f0a \
  --template-profile tshirt=6c8479c7-5ab1-4ea7-9b11-3ed5e0c3cb5e \
  --template-profile canvas=8864d5c0-5e9d-43e1-8af7-5dd849821de2 \
  --public-file-base-url https://your-domain.example.com
```

Dabei gilt:

- `poster`, `framed`, `canvas`: Ausrichtung + Seitenverhaeltnis muessen passen, Standard `slice`
- `framed`: Titel wird als `Kuenstler — Werk Kunstdruck mit Rahmen` gebaut
- `canvas`: Titel wird als `Kuenstler — Werk Leinwanddruck` gebaut
- `tshirt`: Titel wird als `Kuenstler — Werk T-Shirt` gebaut, Standard `meet`
- Wenn fuer `poster`, `framed` oder `canvas` keine Variante unter dem Crop-Limit liegt, wird jetzt **nichts ausgewaehlt**; das Produkt wird fuer dieses Template dann nicht erzeugt.

Optional nur ein Artist:

```bash
cd kunst-museum
python3 produkte/create_gelato_products.py --apply --artist felix
```

Log-Datei:

- `produkte/gelato_created_products.csv`

### Schritt 5: Gelato-Ergebnis sichern

Nach der Browser-Session solltest du mindestens diese Daten je Werk zurueckschreiben:

- Gelato Produkt-ID
- verwendete Produkt-UID
- erzeugte Variantengroessen
- Status `created / skipped / failed`

Dafuer ist spaeter sinnvoll:

- `produkte/gelato_run_log.csv`

Das ist noch nicht automatisiert, der Prompt verlangt aber genau diese Ausgabe.

## API / Keys

Im Repo existiert aktuell keine fertige Gelato-Integration. Fuer eine spaetere API-Route ist der lokale Vorschlag:

- `GELATO_API_KEY`
- `GELATO_STORE_ID`

Platzhalterdatei:

- `produkte/gelato.env.example`

Die Werte gehoeren nur in lokale Env-Dateien oder in geheime Deployment-Settings, nicht ins Git-Repo.

Wichtig fuer Gelato API:

- Gelato kann keine lokalen Dateipfade aus deinem Rechner lesen.
- Fuer API-Produktanlage braucht Gelato eine oeffentlich erreichbare Datei-URL.
- Laut Gelato-Doku werden fuer Platzhalter-Dateien Formate wie JPG, PNG oder PDF erwartet; deshalb baut das Script zusaetzlich `public/gelato-assets/...` fuer den API-Upload.
- Deshalb nutzt das Script `GELATO_PUBLIC_FILE_BASE_URL` plus diese erzeugten `public/gelato-assets/...` Dateien.
- Das Script setzt standardmaessig `fitMethod=slice`, damit Poster ohne weisse Ränder gefuellt werden.
- Gleichzeitig werden nur Template-Varianten mit passender Orientierung und passendem Ratio an Gelato uebergeben.

Shopify ist im Projekt schon teilweise vorbereitet ueber:

- `.env.example`
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_STOREFRONT_TOKEN`
- `SHOPIFY_API_VERSION`
- `NEXT_PUBLIC_SHOP_BASE_URL`

## Offizielle Referenzen

- [Gelato API Documentation](https://dashboard.gelato.com/docs/)
- [Gelato Products API](https://dashboard.gelato.com/docs/ecommerce/products/get/)
- [Gelato Help: product UID finden](https://support.gelato.com/en/articles/8996099-where-can-i-find-the-product-uid)

## Einordnung im Projekt

Dieser Ordner ist:

- lokal
- operativ
- fuer Content-/Commerce-Arbeit
- nicht fuer den produktiven Frontend-Build relevant

Wenn du spaeter direkt per Script statt ueber Atlas arbeiten willst, ist `generate_gelato_export.py` die richtige Stelle fuer den ersten API-Anschluss.
