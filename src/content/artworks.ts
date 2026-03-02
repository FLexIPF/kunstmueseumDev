import type { Artwork, ArtworkCategory } from "@/content/types";
import { generatedArtworks, generatedZoneMeta } from "@/content/artworks.generated";
import { artworkOverrides as manualOverrides } from "@/content/artworks.overrides";
import { artworkOverrides as generatedOverrides } from "@/content/artworks.overrides.generated";
import { packArtworks } from "@/content/artist_packs";

const artworkOverrides = { ...generatedOverrides, ...manualOverrides };

function applyOverrides(a: Artwork): Artwork {
  const ov = artworkOverrides[a.id];
  if (!ov) return a;
  return {
    ...a,
    ...ov,
    // merge nested objects carefully
    images: { ...a.images, ...(ov as Partial<Artwork>).images },
    shopify: { ...(a.shopify || {}), ...(ov as Partial<Artwork>).shopify },
  };
}

const packList = packArtworks();
const packIds = new Set(packList.map((a) => a.id));
export const artworks: Artwork[] = [
  ...generatedArtworks.filter((a) => !packIds.has(a.id)).map(applyOverrides),
  ...packList.map(applyOverrides),
];
export const zoneMeta = generatedZoneMeta;
export const ARTIST_PHOTO_IDS = [
  "other-portraita",
  "other-portrait-b",
  "other-atelier-impression",
  "other-portraitatelier",
  "luca-portrait-1",
  "luca-portrait-2",
];

export function getArtwork(id: string): Artwork | undefined {
  return artworks.find((a) => a.id === id);
}

export function artworksByCategory(category: ArtworkCategory): Artwork[] {
  return artworks.filter((a) => a.category === category);
}

export function artworksByZone(zoneId: number): Artwork[] {
  return artworks.filter((a) => a.zoneId === zoneId);
}

export function artworksByArtist(artistId: string): Artwork[] {
  return artworks.filter((a) => a.artistId === artistId);
}
