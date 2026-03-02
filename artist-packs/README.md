# Artist Packs (JSON)

Lege pro Kuenstler einen Ordner in `artist-packs/` an, z.B. `artist-packs/felix.json`.

Das JSON wird ueber `npm run import:artist-packs` in TypeScript umgewandelt.
Danach stehen die Daten in `src/content/artist_packs.generated.ts` bereit.

`artworkIds` in einem Room ist optional: wenn gesetzt, wird genau diese Reihenfolge gehaengt.
Ohne `artworkIds` greift die automatische Auswahl ueber `categoryFilter` + `maxArtworks`.

Minimalbeispiel:
```json
{
  "id": "felix",
  "slug": "felix-ipfling",
  "name": "Felix Ipfling",
  "bioPdf": "/artist/felix-ipfling-kurzportrait-2024-09.pdf",
  "bioMarkdown": "Kurzer Text...",
  "contact": { "email": "mail@domain.de" },
  "rooms": [
    {
      "id": "acryl",
      "title": "Acryl & Leinwand",
      "theme": "loft",
      "length": 26,
      "width": 36,
      "height": 8,
      "categoryFilter": ["canvas_large", "canvas_small"],
      "maxArtworks": 8,
      "artworkIds": ["canvas-large-beispiel", "canvas-small-beispiel"],
      "wallTexture": "/artists/felix/textures/loft.jpg",
      "floorTexture": "/artists/felix/textures/floor.jpg",
      "ceilingTexture": "/artists/felix/textures/ceiling.jpg"
    }
  ],
  "artworks": [
    {
      "title": "Werk A",
      "image": "/artists/felix/images/werk-a.jpg",
      "category": "other",
      "status": "available",
      "shopify": { "productHandle": "werk-a-original" }
    }
  ]
}
```

## Einfache Einreichung fuer Nicht-Technik
Wenn du Artists hast, die kein JSON anfassen sollen, nutze diese Vorlagen:
- `artist-packs/ARTIST_INTAKE_SIMPLE.md`
- `artist-packs/ARTIST_INTAKE_TEMPLATE.csv`
- `artist-packs/ARTIST_ROOMS_TEMPLATE.csv`

## Avatar / Cartoon-Figur (optional)
Wenn ein Artist als Figur im Raum erscheinen soll, bitte zusaetzlich:
- `avatar.jpg` (Portrait oder Ganzkoerper)
- `avatar_text.txt` (1–3 Saetze Sprechtext)
Optional: Wunsch‑Raum in der Rooms‑CSV (Spalte `notes`).
