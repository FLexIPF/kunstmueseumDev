import type { Artwork, MuseumGallery } from "@/content/types";
import { ARTIST_PHOTO_IDS } from "@/content/artworks";

const PHOTO_ID_SET = new Set(ARTIST_PHOTO_IDS);

function isWallEligible(artwork: Artwork): boolean {
  return !PHOTO_ID_SET.has(artwork.id);
}

function yearKey(artwork: Artwork): number {
  return typeof artwork.year === "number" ? artwork.year : 9999;
}

function sortByYearThenTitle(a: Artwork, b: Artwork): number {
  const ya = yearKey(a);
  const yb = yearKey(b);
  if (ya !== yb) return ya - yb;
  return a.title.localeCompare(b.title);
}

export function buildArtworksByZone(gallery: MuseumGallery, artworks: Artwork[]): Artwork[][] {
  const artworkMap = new Map<string, Artwork>();
  artworks.forEach((a) => artworkMap.set(a.id, a));

  const autoAssignments = new Map<number, Artwork[]>();
  const groups = new Map<string, { artistId?: string; filter: string[]; max: number; zones: number[] }>();

  gallery.zones.forEach((z, idx) => {
    if (z.id === "lobby") return;
    if (z.id.endsWith("-hall") || z.artistId?.endsWith("-hall")) return;
    if (z.artworkIds?.length) return;
    if (!z.categoryFilter?.length) return;
    if (typeof z.maxArtworks !== "number") return;
    const artistId = z.artistId || "";
    const filter = [...z.categoryFilter].sort();
    const key = `${artistId}::${filter.join(",")}`;
    const entry = groups.get(key) || { artistId, filter, max: z.maxArtworks, zones: [] };
    entry.max = z.maxArtworks;
    entry.zones.push(idx);
    groups.set(key, entry);
  });

  groups.forEach((group) => {
    let list = artworks.filter((a) => group.filter.includes(a.category));
    if (group.artistId) list = list.filter((a) => a.artistId === group.artistId);
    list = list.filter(isWallEligible).slice().sort(sortByYearThenTitle);
    const zoneAssignments = new Map<number, Artwork[]>();
    group.zones.forEach((zoneIdx) => zoneAssignments.set(zoneIdx, []));
    let cursor = 0;
    const zoneCount = Math.max(1, group.zones.length);
    list.forEach((art) => {
      let placed = false;
      for (let step = 0; step < zoneCount; step += 1) {
        const zonePos = (cursor + step) % zoneCount;
        const zoneIdx = group.zones[zonePos];
        const bucket = zoneAssignments.get(zoneIdx) || [];
        if (bucket.length >= group.max) continue;
        bucket.push(art);
        zoneAssignments.set(zoneIdx, bucket);
        cursor = (zonePos + 1) % zoneCount;
        placed = true;
        break;
      }
      if (!placed) {
        cursor = 0;
      }
    });
    group.zones.forEach((zoneIdx) => {
      autoAssignments.set(zoneIdx, zoneAssignments.get(zoneIdx) || []);
    });
  });

  const out: Artwork[][] = new Array(gallery.zones.length).fill(null).map(() => []);
  const used = new Set<string>();

  gallery.zones.forEach((z, idx) => {
    const auto = autoAssignments.get(idx);
    if (auto) {
      out[idx] = auto;
      auto.forEach((a) => used.add(a.id));
      return;
    }
    let list: Artwork[] = [];
    if (z.id === "lobby" && !z.artworkIds?.length) {
      out[idx] = [];
      return;
    }
    if (z.id.endsWith("-hall") || z.artistId?.endsWith("-hall")) {
      out[idx] = [];
      return;
    }
    if (z.artworkIds?.length) {
      list = z.artworkIds.map((id) => artworkMap.get(id)).filter(Boolean) as Artwork[];
      list = list.filter(isWallEligible);
      list.forEach((a) => used.add(a.id));
    } else if (z.categoryFilter?.length) {
      list = artworks.filter((a) => z.categoryFilter?.includes(a.category));
      if (z.artistId) list = list.filter((a) => a.artistId === z.artistId);
      list = list.filter(isWallEligible).slice().sort(sortByYearThenTitle);
    } else {
      list = artworks.filter((a) => a.zoneId === idx);
      if (z.artistId) list = list.filter((a) => a.artistId === z.artistId);
      list = list.filter(isWallEligible).slice().sort(sortByYearThenTitle);
    }
    if (!z.artworkIds?.length) {
      if (used.size) {
        list = list.filter((a) => !used.has(a.id));
      }
      if (typeof z.maxArtworks === "number") {
        list = list.slice(0, z.maxArtworks);
      }
      list.forEach((a) => used.add(a.id));
    }
    out[idx] = list;
  });

  return out;
}
