import type { Artwork, GalleryZone, MuseumGallery } from "@/content/types";
import { hasCachedTexture, loadTextureWithRetry } from "@/components/museum/textureCache";

export type ZoneAssets = {
  images: string[];
  walls: string[];
};

export type ZoneLoadState = {
  imagesTotal: number;
  imagesLoaded: number;
  wallsTotal: number;
  wallsLoaded: number;
  ready: boolean;
  timedOut: boolean;
  startedAt: number;
};

export type PreloadOptions = {
  concurrency?: number;
  timeoutMs?: number;
  zoneIds?: number[];
  onUpdate?: (states: ZoneLoadState[]) => void;
};

export function collectZoneAssets(zone: GalleryZone, artworks: Artwork[]): ZoneAssets {
  const imageSet = new Set<string>();
  const wallSet = new Set<string>();

  if (zone.wallTexture) wallSet.add(zone.wallTexture);
  if (zone.wallTextureAlt) wallSet.add(zone.wallTextureAlt);
  if (zone.wallTextureLeft) wallSet.add(zone.wallTextureLeft);
  if (zone.wallTextureRight) wallSet.add(zone.wallTextureRight);
  if (zone.wallTextureFront) wallSet.add(zone.wallTextureFront);
  if (zone.wallTextureBack) wallSet.add(zone.wallTextureBack);
  if (zone.floorTexture) wallSet.add(zone.floorTexture);
  if (zone.ceilingTexture) wallSet.add(zone.ceilingTexture);
  if (zone.id === "lobby") {
    wallSet.add("/backgrounds/lobby-door.jpg");
    wallSet.add("/backgrounds/door.jpg");
  }

  artworks.forEach((a) => {
    if (a.images?.texture) imageSet.add(a.images.texture);
  });

  return { images: [...imageSet], walls: [...wallSet] };
}

export function buildAssetsByZone(gallery: MuseumGallery, artworksByZone: Artwork[][]): ZoneAssets[] {
  return gallery.zones.map((zone, idx) => collectZoneAssets(zone, artworksByZone[idx] || []));
}

export function startZonePreload(assetsByZone: ZoneAssets[], options: PreloadOptions = {}) {
  const concurrency = options.concurrency ?? 4;
  const timeoutMs = options.timeoutMs ?? 12000;
  const zoneOrder = options.zoneIds?.length
    ? Array.from(new Set(options.zoneIds.filter((id) => id >= 0 && id < assetsByZone.length)))
    : null;
  const zoneSet = zoneOrder?.length ? new Set(zoneOrder) : null;
  let cancelled = false;
  const MAX_RETRIES = 2;

  const states: ZoneLoadState[] = assetsByZone.map((assets, idx) => {
    if (zoneSet && !zoneSet.has(idx)) {
      return {
        imagesTotal: 0,
        imagesLoaded: 0,
        wallsTotal: 0,
        wallsLoaded: 0,
        ready: true,
        timedOut: false,
        startedAt: Date.now(),
      };
    }
    const imagesTotal = assets.images.length;
    const wallsTotal = assets.walls.length;
    const ready = imagesTotal + wallsTotal === 0;
    return {
      imagesTotal,
      imagesLoaded: 0,
      wallsTotal,
      wallsLoaded: 0,
      ready,
      timedOut: false,
      startedAt: Date.now(),
    };
  });

  const queue: Array<{ zoneIndex: number; type: "image" | "wall"; url: string; attempts: number }> = [];
  const zonesToQueue = zoneOrder ?? assetsByZone.map((_, idx) => idx);
  zonesToQueue.forEach((zoneIndex) => {
    if (zoneSet && !zoneSet.has(zoneIndex)) return;
    const assets = assetsByZone[zoneIndex];
    if (!assets) return;
    assets.walls.forEach((url) => queue.push({ zoneIndex, type: "wall", url, attempts: 0 }));
    assets.images.forEach((url) => queue.push({ zoneIndex, type: "image", url, attempts: 0 }));
  });

  const timeouts = states.map((_, zoneIndex) => {
    if (zoneSet && !zoneSet.has(zoneIndex)) return -1;
    return window.setTimeout(() => {
      if (cancelled) return;
      const state = states[zoneIndex];
      if (!state.ready) {
        state.timedOut = true;
        state.ready = true;
        options.onUpdate?.(states.map((s) => ({ ...s })));
      }
    }, timeoutMs);
  });

  const markLoaded = (zoneIndex: number, type: "image" | "wall") => {
    if (cancelled) return;
    const state = states[zoneIndex];
    if (type === "image") state.imagesLoaded += 1;
    else state.wallsLoaded += 1;
    if (state.imagesLoaded >= state.imagesTotal && state.wallsLoaded >= state.wallsTotal) {
      state.ready = true;
    }
    options.onUpdate?.(states.map((s) => ({ ...s })));
  };

  let inFlight = 0;
  let cursor = 0;

  const pump = () => {
    if (cancelled) return;
    while (inFlight < concurrency && cursor < queue.length) {
      const item = queue[cursor++];
      inFlight += 1;
      if (item.type === "image") {
        if (hasCachedTexture(item.url)) {
          inFlight -= 1;
          markLoaded(item.zoneIndex, item.type);
          continue;
        }
        loadTextureWithRetry(item.url, { maxRetries: MAX_RETRIES, retryIntervalMs: 800 })
          .then(() => {
            if (cancelled) return;
            inFlight -= 1;
            markLoaded(item.zoneIndex, item.type);
            pump();
          })
          .catch(() => {
            if (cancelled) return;
            inFlight -= 1;
            markLoaded(item.zoneIndex, item.type);
            pump();
          });
      } else {
        const img = new Image();
        const done = () => {
          inFlight -= 1;
          markLoaded(item.zoneIndex, item.type);
          pump();
        };
        img.onload = done;
        img.onerror = done;
        img.src = item.url;
      }
    }
  };

  options.onUpdate?.(states.map((s) => ({ ...s })));
  pump();

  return {
    cancel: () => {
      cancelled = true;
      timeouts.forEach((t) => {
        if (t >= 0) window.clearTimeout(t);
      });
    },
  };
}
