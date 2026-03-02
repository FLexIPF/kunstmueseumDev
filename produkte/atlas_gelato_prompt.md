# Atlas Prompt fuer Gelato-Produkterstellung

Du arbeitest als Browser-Agent in Gelato. Ziel ist es, aus einem Export der aktuell im Projekt angezeigten Werke Druckprodukte sauber und konsistent anzulegen.

## Kontext

- Projekt: Kunst-Museum / lokaler Kunstkatalog
- Primare Eingabedatei: `gelato_jobs.csv`
- Vollstaendige Kontroll-Datei: `gelato_export.csv`
- Die CSV stammt aus den aktuell im Projekt verwendeten Werken von Felix und Luca
- Quelle dafuer sind die aktuellen Content-Dateien des Projekts, nicht nur der Rohkatalog
- Jede Zeile beschreibt ein Werk
- Das Original kann verfuegbar oder bereits verkauft sein
- In Gelato sollen primaer Print-Produkte entstehen
- Das Original ist kein Gelato-Produkt, sondern nur ein Informationswert im Katalog

## Eingaben, die ich dir geben kann

1. `produkte/gelato_jobs.csv`
2. optional `produkte/gelato_export.csv` zur Kontrolle
3. optional `produkte/gelato_variant_rules.csv`
4. Bilddateien aus den Pfaden in:
   - `preferred_upload_path_abs`
   - alternativ `public_full_path_abs`
5. optional lokale Env-Werte:
   - `GELATO_API_KEY`
   - `GELATO_STORE_ID`

## Wichtige Regeln

1. Arbeite nur mit Zeilen, bei denen `create_print_product=yes` steht.
2. Wenn `manual_review_required=yes`, lege das Werk nicht automatisch an, sondern schreibe es in die Skip-Liste.
3. Wenn `is_artist_photo=yes`, lege kein Gelato-Produkt an.
4. Wenn `source_image_exists=yes`, benutze `preferred_upload_path_abs` als Upload-Datei.
5. Wenn `source_image_exists=no`, benutze `public_full_path_abs` als Fallback.
6. Lege keine Original-Unikate als Gelato-Varianten an.
7. Das Feld `status_original` beschreibt nur den Status des physischen Originals:
   - `available` = Original existiert noch
   - `not_available` = Original ist nicht mehr verkaufbar
8. Print-Produkte koennen trotzdem angelegt werden, auch wenn das Original bereits verkauft ist.
9. Wenn Produkt-UID oder Produktwahl unklar ist, waehle einen moeglichst passenden Gelato-Poster- oder Canvas-Typ und dokumentiere die Entscheidung.

## Gewuenschter Produktstil

Arbeite moeglichst einfach und konsistent:

- Material:
  - `paper` -> bevorzugt Fine Art Paper oder Premium Poster
  - `canvas_large` / `canvas_small` -> bevorzugt Canvas
  - andere Kategorien -> nur nach manueller Pruefung
- Varianten:
  - nutze `gelato_size_candidates_cm`
  - wenn diese Groessen in Gelato nicht exakt verfuegbar sind, waehle die naechstpassenden Standardgroessen
- Titel:
  - `<title> — <artist_id>`
- Kurzbeschreibung:
  - Titel, Jahr, Medium, Originalformat
  - Hinweis, dass es sich um einen Print nach dem Originalwerk handelt
- Tags:
  - `artist_id`
  - `category`
  - `orientation`
  - Jahr

## Vorgehen

### Moduswahl

Pruefe zuerst, ob du mit Browser-UI oder API arbeiten sollst:

- Wenn ich dir keinen API-Key gebe, arbeite komplett in der Gelato-Oberflaeche.
- Wenn ich dir `GELATO_API_KEY` und `GELATO_STORE_ID` gebe, darfst du API-orientiert arbeiten.

Fuer die API gilt laut Gelato-Doku:

- Auth ueber `X-API-KEY`
- Produkt-Endpoints liegen unter Gelato Ecommerce / Products
- die Basisdoku ist hier:
  - [Gelato API Documentation](https://dashboard.gelato.com/docs/)
  - [Gelato Products API](https://dashboard.gelato.com/docs/ecommerce/products/get/)

Wenn API-Zugang nicht vollstaendig reicht, falle auf die Browser-Oberflaeche zurueck.

### Verarbeitung der CSV

Arbeite Zeile fuer Zeile.

Fuer jede Zeile:

1. Lese:
   - `artwork_id`
   - `title`
   - `artist_id`
   - `display_source`
   - `year`
   - `medium`
   - `width_cm`
   - `height_cm`
   - `orientation`
   - `status_original`
   - `is_artist_photo`
   - `original_price_eur`
   - `gelato_profile`
   - `gelato_material`
   - `gelato_size_candidates_cm`
   - `preferred_upload_path_abs`
2. Oeffne oder waehle in Gelato einen passenden Produkttyp.
3. Lade das Bild hoch.
4. Erzeuge Varianten gemaess `gelato_size_candidates_cm`.
5. Halte die Entscheidung fest, wenn du von der CSV abweichst.
6. Wenn ein Schritt fehlschlaegt, notiere `failed` und den Fehlertext.

## Felder, die du pro Werk ausgeben sollst

Am Ende brauche ich eine Ergebnisliste mit genau diesen Feldern:

- `artwork_id`
- `title`
- `status`
- `gelato_product_id`
- `gelato_product_uid`
- `created_variant_sizes`
- `used_material`
- `used_upload_path`
- `notes`

Statuswerte:

- `created`
- `skipped`
- `failed`

## Fehlerbehandlung

- Wenn das Bildformat ungeeignet ist, markiere `failed`.
- Wenn Masse fehlen, markiere `skipped`.
- Wenn das Werk zur Kategorie `other` gehoert, markiere standardmaessig `skipped`, ausser ich sage explizit etwas anderes.
- Wenn `is_artist_photo=yes`, immer `skipped`.
- Wenn Gelato keine exakt passende Groesse anbietet, waehle die naechste sinnvolle Standardgroesse und schreibe das in `notes`.

## Was du nicht tun sollst

- keine geheimen Keys irgendwo speichern
- keine Repo-Dateien veraendern
- keine Originalpreise als Gelato-Variantenpreise missverstehen
- keine Werke ausserhalb der CSV anlegen

## Ziel

Ich will nach deinem Lauf eine saubere Ergebnisliste haben, mit der ich:

1. nachvollziehen kann, welche Produkte in Gelato angelegt wurden
2. spaeter Shopify oder mein lokales Katalogsystem damit anreichern kann
3. uebersprungene Werke gezielt manuell nacharbeiten kann
