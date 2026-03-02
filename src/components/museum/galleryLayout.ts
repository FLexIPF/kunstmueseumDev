import type { GalleryZone, MuseumGallery } from "@/content/types";

export type ZoneLayout = {
  zone: GalleryZone;
  index: number;
  startZ: number;
  endZ: number;
  centerZ: number;
  centerX: number;
  length: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type GalleryLayout = {
  zones: ZoneLayout[];
  totalLength: number;
  maxWidth: number;
  maxHeight: number;
  minZ: number;
  maxZ: number;
  minX: number;
  maxX: number;
};

export function computeGalleryLayout(gallery: MuseumGallery, zoneCounts?: number[]): GalleryLayout {
  let cursor = 0;
  const zones: ZoneLayout[] = [];
  let maxWidth = 0;
  let maxHeight = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;

  gallery.zones.forEach((zone, index) => {
    const count = zoneCounts?.[index] ?? 0;
    const desiredSpacing = 2.6;
    const minBuffer = 6;
    const neededLength = count > 0 ? (count * desiredSpacing) / 2 + minBuffer : zone.length;
    const neededWidth = count > 0 ? Math.max(zone.width, (count * desiredSpacing) / Math.PI) : zone.width;
    const useRect = typeof zone.centerX === "number" || typeof zone.centerZ === "number";
    const square = Math.max(zone.length, zone.width, neededLength, neededWidth);
    const effectiveLength = useRect ? Math.max(zone.length, neededLength) : square;
    const effectiveWidth = useRect ? Math.max(zone.width, neededWidth) : square;

    const centerX = typeof zone.centerX === "number" ? zone.centerX : 0;
    const centerZ = typeof zone.centerZ === "number" ? zone.centerZ : cursor - effectiveLength / 2;
    const startZ = centerZ + effectiveLength / 2;
    const endZ = centerZ - effectiveLength / 2;
    zones.push({
      zone,
      index,
      startZ,
      endZ,
      centerZ,
      centerX,
      length: effectiveLength,
      width: effectiveWidth,
      height: zone.height,
      minX: centerX - effectiveWidth / 2,
      maxX: centerX + effectiveWidth / 2,
      minZ: Math.min(startZ, endZ),
      maxZ: Math.max(startZ, endZ),
    });
    if (typeof zone.centerZ !== "number") {
      cursor = endZ;
    }
    maxWidth = Math.max(maxWidth, effectiveWidth);
    maxHeight = Math.max(maxHeight, zone.height);
    minZ = Math.min(minZ, Math.min(startZ, endZ));
    maxZ = Math.max(maxZ, Math.max(startZ, endZ));
    minX = Math.min(minX, centerX - effectiveWidth / 2);
    maxX = Math.max(maxX, centerX + effectiveWidth / 2);
  });

  const totalLength = Number.isFinite(minZ) && Number.isFinite(maxZ) ? Math.abs(maxZ - minZ) : Math.abs(cursor);
  return {
    zones,
    totalLength,
    maxWidth,
    maxHeight,
    minZ: Number.isFinite(minZ) ? minZ : -totalLength,
    maxZ: Number.isFinite(maxZ) ? maxZ : 0,
    minX: Number.isFinite(minX) ? minX : -maxWidth / 2,
    maxX: Number.isFinite(maxX) ? maxX : maxWidth / 2,
  };
}
