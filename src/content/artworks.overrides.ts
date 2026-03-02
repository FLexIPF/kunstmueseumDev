import type { Artwork } from "@/content/types";

export type ArtworkOverride = Partial<Omit<Artwork, "id">> & { id?: never };

// Add per-artwork overrides here (e.g. SOLD status, corrected titles, Shopify mapping).
// Example:
// export const artworkOverrides = {
//   "canvas-large-chaos-im-komando-zentrum": {
//     status: "sold",
//     year: 2023,
//     shopify: { productHandle: "chaos-im-komando-zentrum-original" },
//   },
// } satisfies Record<string, ArtworkOverride>;

export const artworkOverrides: Record<string, ArtworkOverride> = {
  "canvas-large-chaos-im-komando-zentrum": {
    shopify: { collectionUrl: "https://flexartmarket.myshopify.com/collections/chaos-im-comando-center" },
  },
  "canvas-large-chaosin-comandozentrum": {
    shopify: { collectionUrl: "https://flexartmarket.myshopify.com/collections/chaos-im-comando-center" },
  },
  "paper-der-hoffnungs-haenker": {
    images: {
      texture: "/artworks/paper-komposition1/texture.webp",
      full: "/artworks/paper-komposition1/full.webp",
      thumb: "/artworks/paper-komposition1/thumb.webp",
    },
  },
  "paper-red-flagsailing": {
    images: {
      texture: "/artworks/paper-vulkan/texture.webp",
      full: "/artworks/paper-vulkan/full.webp",
      thumb: "/artworks/paper-vulkan/thumb.webp",
    },
  },
};
