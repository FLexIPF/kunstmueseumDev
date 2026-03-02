# Artist-Packs: Anleitung + Template

Diese Datei ist die Kurz-Anleitung, wie du einen neuen Artist oder einen neuen Raum hinzufuegst.
Alle Daten werden in `artist-packs/*.json` gepflegt und dann mit `npm run import:artist-packs` in TypeScript uebernommen.

## Quick-Start (neuer Artist)
1. Lege die Bilder in `public/artists/<artistId>/images/` ab.
2. Lege das PDF in `public/artist/<artistId>-steckbrief.pdf` ab.
3. Erstelle `artist-packs/<artistId>.json` nach dem Template unten.
4. Fuehre aus:
   - `npm run import:artist-packs`
5. Starte `npm run dev` und teste.

## Quick-Start (neuer Raum)
1. Oeffne die JSON des Artists.
2. Fuege einen neuen Eintrag in `rooms` hinzu.
3. Entweder:
   - `artworkIds` explizit setzen (empfohlen, volle Kontrolle), oder
   - `categoryFilter` + `maxArtworks` verwenden (automatisch).

## Template: Artist JSON (voll)
```json
{
  "id": "artist-id",
  "slug": "artist-slug",
  "name": "Artist Name",
  "bioPdf": "/artist/artist-id-steckbrief.pdf",
  "bioMarkdown": "Kurzer Text...",
  "contact": {
    "email": "mail@domain.de",
    "phone": "01234 5678",
    "website": "https://example.com",
    "instagram": "https://instagram.com/artist"
  },
  "links": [
    { "label": "Website", "href": "https://example.com" }
  ],
  "exhibitions": [],
  "rooms": [
    {
      "id": "room-a",
      "title": "Artist — Raum A",
      "theme": "loft",
      "length": 24,
      "width": 24,
      "height": 7.2,
      "accentColor": "#caa563",
      "wallTexture": "/backgrounds/room1-a.jpg",
      "wallTextureAlt": "/backgrounds/room1-b.jpg",
      "floorTexture": "/backgrounds/room1-floor.jpg",
      "ceilingTexture": "/backgrounds/room1-ceiling.jpg",
      "categoryFilter": ["canvas_large"],
      "artworkIds": [
        "canvas-large-beispiel-1",
        "canvas-large-beispiel-2",
        "canvas-large-beispiel-3",
        "canvas-large-beispiel-4",
        "canvas-large-beispiel-5",
        "canvas-large-beispiel-6",
        "canvas-large-beispiel-7",
        "canvas-large-beispiel-8"
      ],
      "maxArtworks": 8
    },
    {
      "id": "room-b",
      "title": "Artist — Raum B",
      "theme": "modern",
      "length": 22,
      "width": 22,
      "height": 7.2,
      "accentColor": "#8fd3ff",
      "wallTexture": "/backgrounds/room3-a.jpg",
      "wallTextureAlt": "/backgrounds/room3-b.jpg",
      "floorTexture": "/backgrounds/room3-floor.jpg",
      "ceilingTexture": "/backgrounds/room3-ceiling.jpg",
      "categoryFilter": ["canvas_small"],
      "artworkIds": [
        "canvas-small-beispiel-1",
        "canvas-small-beispiel-2"
      ],
      "maxArtworks": 6
    }
  ],
  "artworks": []
}
```

## Artwork-IDs (woher nehmen?)
Aktuell kommen die IDs der Werke aus:
- `src/content/artworks.generated.ts` (auto-importiert)
- `src/content/artworks.overrides.ts` (manuelle Korrekturen / Shopify)

Du kannst `artworkIds` direkt aus diesen IDs bestaetigen und in der JSON eintragen.
Die Reihenfolge in `artworkIds` bestimmt die Haengung.

## Shopify-Links pro Werk
Wenn ein Werk aus `artworks.generated.ts` kommt, setze den Shopify-Link hier:
- `src/content/artworks.overrides.ts`

Beispiel:
```ts
export const artworkOverrides = {
  "canvas-large-beispiel-1": {
    shopify: { productHandle: "beispiel-1-original" }
  }
};
```

Wenn du eigene Werke direkt im Artist-Package definierst, kannst du `shopify` direkt dort setzen:
```json
"artworks": [
  {
    "id": "artist-werk-1",
    "title": "Werk 1",
    "category": "other",
    "status": "available",
    "infoBox": "Kurzinfo / Kontext / Edition / Besonderheiten ...",
    "images": {
      "texture": "/artists/artist-id/images/werk-1-texture.webp",
      "full": "/artists/artist-id/images/werk-1-full.webp",
      "thumb": "/artists/artist-id/images/werk-1-thumb.webp"
    },
    "shopify": { "productHandle": "werk-1" }
  }
]
```

## Notizen
- `artworkIds` ist empfohlen, wenn du genaue Kontrolle willst.
- Ohne `artworkIds` greift die automatische Auswahl ueber `categoryFilter` + `maxArtworks`.
- 8 Werke pro Raum = aktuell 2 pro Wand (bei 4 Waenden).
