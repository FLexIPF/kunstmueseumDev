import type { Artist, ArtistPack, Artwork } from "@/content/types";
import { artistPacks } from "@/content/artist_packs.generated";

export const packs: ArtistPack[] = artistPacks;

export function packArtists(): Artist[] {
  return packs.map((p) => p.artist);
}

export function packArtworks(): Artwork[] {
  const out: Artwork[] = [];
  packs.forEach((p) => {
    if (p.artworks && p.artworks.length) out.push(...p.artworks);
  });
  return out;
}

export function getPackByArtistId(artistId: string): ArtistPack | undefined {
  return packs.find((p) => p.artist.id === artistId);
}
