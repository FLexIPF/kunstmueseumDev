# Kunst Museum (MVP)

Landing page = 3D Museum (Mobile + Desktop). Local-first (reads images from `../kunst/...` via an import script), with optional Shopify Storefront checkout integration.

## Setup

1. Install deps

```bash
cd kunst-museum
npm install
```

2. Import artworks (creates resized WebP images + generated metadata)

```bash
cd kunst-museum
python3 scripts/import_artworks.py
```

If you get a missing dependency error, install Pillow:

```bash
python3 -m pip install pillow
```

3. Run dev server

```bash
cd kunst-museum
npm run dev
```

Open `http://localhost:3000`.

## Shopify (Optional)

Copy `.env.example` to `.env.local` and fill:

- `SHOPIFY_STORE_DOMAIN` (e.g. `your-shop.myshopify.com`)
- `SHOPIFY_STOREFRONT_TOKEN` (Storefront API access token)
- `NEXT_PUBLIC_SHOP_BASE_URL` (optional, for “Zum Shop” links)

If not set, the UI falls back to “Zum Shop” (if a handle exists) or “Anfrage”.

### Token Setup (Shopify Admin)

1. Shopify Admin → Apps → “Develop apps” → Create an app
2. Enable Storefront API access
3. Create a Storefront API access token
4. Put it into `.env.local` / Vercel Env Vars

## Local Catalog Workflow (Optional)

See `docs/WORKFLOW.md` for the local CSV + AI-assisted catalog workflow (artworks, exhibitions, social drafts).

## Useful Commands

- `npm run lint`
- `python3 -m unittest -v scripts.test_import_artworks`
