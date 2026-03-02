import type { Artist } from "@/content/types";
import { packArtists } from "@/content/artist_packs";

export const artists: Artist[] = packArtists();

export function getArtist(id: string): Artist | undefined {
  return artists.find((a) => a.id === id);
}
