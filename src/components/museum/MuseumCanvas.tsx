"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { Vector3 } from "three";

import type { Artwork, MuseumGallery } from "@/content/types";
import { GalleryScene } from "@/components/museum/GalleryScene";
import { computeGalleryLayout } from "@/components/museum/galleryLayout";
import { artistRoomRanges } from "@/content/museum";
import type { ArtistGuideRuntime } from "@/components/museum/artistGuide";
import { buildAssetsByZone, startZonePreload, type ZoneLoadState } from "@/components/museum/zonePreloader";
import { hasCachedTexture, loadTextureWithRetry, setTextureCacheLimit } from "@/components/museum/textureCache";
import { buildWallSlots, selectSlotIndices } from "@/components/museum/placements";
import { buildArtworksByZone } from "@/components/museum/artworkAssignments";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type DoorNode = {
  zoneIndex: number;
  x: number;
  z: number;
  doorTarget?: number;
  doorLabel?: string;
};

type PortalRect = {
  from: number;
  to: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: "x" | "z";
};

type SpawnRequest = {
  zoneIndex: number;
  position: [number, number, number];
  lookAt: [number, number, number];
};

type MuseumCanvasProps = {
  gallery: MuseumGallery;
  artworks: Artwork[];
  onSelectArtwork: (artworkId: string) => void;
  onSelectArtist?: (artistId: string) => void;
  onSelectDirector?: (id: string) => void;
  onZoneChange?: (zoneIndex: number) => void;
  onExitMuseum?: () => void;
  onInteractionHint?: (hint: { type: "artwork" | "door" | "artist" | "director" | null; label?: string }) => void;
  onWebglContextLost?: () => void;
  onWebglContextRestored?: () => void;
  onDebugUpdate?: (data: {
    frameCount: number;
    lastFrameAt: number;
    camera: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }) => void;
  debugEnabled?: boolean;
  onFrameLoaded?: () => void;
  onCanvasInfo?: (data: {
    created: boolean;
    componentMounted?: boolean;
    canvasPresent?: boolean;
    width: number;
    height: number;
    dpr: number;
    glVersion?: string;
    renderer?: string;
    vendor?: string;
  }) => void;
  onLoadingChange?: (loading: boolean) => void;
  onLoadingProgress?: (info: {
    zoneIndex: number;
    imagesLoaded: number;
    imagesTotal: number;
    wallsLoaded: number;
    wallsTotal: number;
    overallLoaded: number;
    overallTotal: number;
    percent: number;
  }) => void;
  onShooterUpdate?: (info: {
    active: boolean;
    score: number;
    total: number;
    playerHits: number;
    health: number;
    healthMax: number;
    dead: boolean;
    gameWon: boolean;
  }) => void;
  shooterResetToken?: number;
  jumpToken?: number;
  jumpTarget?: number;
  zoom?: number;
  museumMode?: boolean;
  startToken?: number;
  uiActive?: boolean;
  virtualMove?: { forward?: boolean; back?: boolean; left?: boolean; right?: boolean; sprint?: boolean };
  virtualLook?: { x: number; y: number };
  touchMode?: boolean;
  actionToken?: number;
  doorToken?: number;
  directorSelected?: boolean;
};

export function MuseumCanvas({
  gallery,
  artworks,
  onSelectArtwork,
  onSelectArtist,
  onSelectDirector,
  onZoneChange,
  onExitMuseum,
  onInteractionHint,
  onWebglContextLost,
  onWebglContextRestored,
  onDebugUpdate,
  debugEnabled,
  onFrameLoaded,
  onCanvasInfo,
  onLoadingChange,
  onLoadingProgress,
  onShooterUpdate,
  shooterResetToken = 0,
  jumpToken = 0,
  jumpTarget,
  zoom = 0.5,
  museumMode = false,
  startToken = 0,
  uiActive = false,
  virtualMove,
  virtualLook,
  touchMode = false,
  actionToken = 0,
  doorToken = 0,
  directorSelected = false,
}: MuseumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeZone, setActiveZone] = useState(0);
  const [pendingZone, setPendingZone] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoneLoadStates, setZoneLoadStates] = useState<ZoneLoadState[]>([]);
  const [renderLoadedByZone, setRenderLoadedByZone] = useState<number[]>(() => new Array(gallery.zones.length).fill(0));
  const [renderWallsLoadedByZone, setRenderWallsLoadedByZone] = useState<number[]>(() => new Array(gallery.zones.length).fill(0));
  const [cachedImagesByZone, setCachedImagesByZone] = useState<number[]>(() => new Array(gallery.zones.length).fill(0));
  const [spawnRequest, setSpawnRequest] = useState<SpawnRequest | null>(null);
  const pendingSpawnRef = useRef<SpawnRequest | null>(null);
  const artistGuideRef = useRef<ArtistGuideRuntime>({
    artistId: "felix",
    active: false,
    phase: "hidden",
    role: "artist",
    position: new Vector3(0, 0.05, 0),
    target: new Vector3(0, 0.05, 0),
    speed: 2.4,
    swayPhase: 0,
  });
  const directorGuideRef = useRef<ArtistGuideRuntime>({
    artistId: "director",
    active: false,
    phase: "roam",
    role: "director",
    hold: false,
    position: new Vector3(0, 0, 0),
    target: new Vector3(0, 0, 0),
    speed: 1.6,
    swayPhase: 0,
  });

  const artworksByZone = useMemo(() => {
    return buildArtworksByZone(gallery, artworks);
  }, [gallery, artworks]);

  const zoneCounts = useMemo(() => artworksByZone.map((list) => list.length), [artworksByZone]);

  const layout = useMemo(() => computeGalleryLayout(gallery, zoneCounts), [gallery, zoneCounts]);

  const renderTotals = useMemo(() => artworksByZone.map((list) => list.length), [artworksByZone]);
  const renderTotalsRef = useRef<number[]>(renderTotals);
  useEffect(() => {
    renderTotalsRef.current = renderTotals;
  }, [renderTotals]);

  useEffect(() => {
    setRenderLoadedByZone(new Array(gallery.zones.length).fill(0));
    setRenderWallsLoadedByZone(new Array(gallery.zones.length).fill(0));
  }, [gallery.zones.length, renderTotals]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lowMem = typeof mem === "number" && mem > 0 && mem <= 4;
    const limit = touchMode || lowMem ? 768 : 1536;
    setTextureCacheLimit(limit);
  }, [touchMode]);

  const assetsByZone = useMemo(() => buildAssetsByZone(gallery, artworksByZone), [gallery, artworksByZone]);
  const wallTotals = useMemo(() => assetsByZone.map((assets) => assets.walls.length), [assetsByZone]);
  const imageTotals = useMemo(() => assetsByZone.map((assets) => assets.images.length), [assetsByZone]);
  const felixRange = useMemo(() => artistRoomRanges.find((r) => r.artistId === "felix"), []);
  const lucaRange = useMemo(() => artistRoomRanges.find((r) => r.artistId === "luca"), []);
  const hallIndex = useMemo(() => layout.zones.findIndex((z) => z.zone.id === "felix-hall"), [layout.zones]);
  const lucaHallIndex = useMemo(() => layout.zones.findIndex((z) => z.zone.id === "luca-hall"), [layout.zones]);
  const startupZoneIds = useMemo(
    () =>
      layout.zones
        .map((zone, index) => ({ zone, index }))
        .filter(({ zone }) => zone.zone.artistId !== "example-room")
        .map(({ index }) => index),
    [layout.zones],
  );
  const preloadZoneIds = useMemo(() => {
    const ids = new Set<number>();
    const add = (id?: number | null) => {
      if (typeof id !== "number") return;
      if (id < 0 || id >= layout.zones.length) return;
      ids.add(id);
    };
    add(activeZone);
    add(pendingZone);
    const inFelix =
      felixRange && activeZone >= felixRange.startIndex && activeZone < felixRange.startIndex + felixRange.count;
    const inLuca =
      lucaRange && activeZone >= lucaRange.startIndex && activeZone < lucaRange.startIndex + lucaRange.count;
    if (activeZone === 0) {
      startupZoneIds.forEach((id) => add(id));
    } else if (activeZone === hallIndex) {
      add(0);
      if (felixRange) {
        for (let i = 0; i < felixRange.count; i += 1) {
          add(felixRange.startIndex + i);
        }
      }
    } else if (activeZone === lucaHallIndex) {
      add(0);
      add(lucaRange?.startIndex);
      if (lucaRange) {
        const end = lucaRange.startIndex + lucaRange.count - 1;
        if (lucaRange.startIndex + 1 <= end) add(lucaRange.startIndex + 1);
      }
    } else if (inFelix) {
      add(hallIndex);
      if (felixRange) {
        for (let i = 0; i < felixRange.count; i += 1) {
          add(felixRange.startIndex + i);
        }
      }
    } else if (inLuca) {
      add(lucaHallIndex);
      if (lucaRange) {
        const start = lucaRange.startIndex;
        const end = lucaRange.startIndex + lucaRange.count - 1;
        if (activeZone - 1 >= start) add(activeZone - 1);
        if (activeZone + 1 <= end) add(activeZone + 1);
      }
    } else {
      add(activeZone - 1);
      add(activeZone + 1);
    }
    return Array.from(ids);
  }, [activeZone, pendingZone, layout.zones.length, felixRange, lucaRange, hallIndex, lucaHallIndex, startupZoneIds]);

  const eyeY = 2.05;
  const targetY = 1.75;

  const isSafari = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return /Safari/i.test(ua) && !/Chrome|Chromium|Android/i.test(ua);
  }, []);

  useEffect(() => {
    const { cancel } = startZonePreload(assetsByZone, {
      concurrency: touchMode ? 2 : 4,
      timeoutMs: touchMode ? 90000 : 60000,
      zoneIds: preloadZoneIds,
      onUpdate: (states) => setZoneLoadStates(states),
    });
    return cancel;
  }, [assetsByZone, preloadZoneIds, touchMode]);

  useEffect(() => {
    const tick = () => {
      setCachedImagesByZone((prev) => {
        let changed = false;
        const next = assetsByZone.map((assets, idx) => {
          const count = assets.images.reduce((sum, url) => sum + (hasCachedTexture(url) ? 1 : 0), 0);
          if (count !== prev[idx]) changed = true;
          return count;
        });
        return changed ? next : prev;
      });
    };
    tick();
    const timer = window.setInterval(tick, 800);
    return () => window.clearInterval(timer);
  }, [assetsByZone]);

  useEffect(() => {
    const targets = new Set<number>();
    targets.add(activeZone);
    if (pendingZone !== null) targets.add(pendingZone);
    targets.forEach((zoneIndex) => {
      const assets = assetsByZone[zoneIndex];
      if (!assets) return;
      assets.images.forEach((url) => {
        loadTextureWithRetry(url, { maxRetries: Infinity, retryIntervalMs: 1000 }).catch(() => {
          // keep retrying in the loader; failures are handled there
        });
      });
    });
  }, [activeZone, pendingZone, assetsByZone]);

  const initialCamera = useMemo(() => {
    const lobby = layout.zones[0];
    const startZ = lobby ? lobby.startZ - 4 : -4;
    return { position: [0, eyeY, startZ] as [number, number, number], fov: 55 };
  }, [layout.zones, eyeY]);

  const handleTextureReady = (zoneIndex: number) => {
    setRenderLoadedByZone((prev) => {
      if (zoneIndex < 0 || zoneIndex >= prev.length) return prev;
      const next = [...prev];
      const total = renderTotalsRef.current[zoneIndex] ?? 0;
      next[zoneIndex] = Math.min(total, next[zoneIndex] + 1);
      return next;
    });
    onFrameLoaded?.();
  };

  const handleWallReady = (zoneIndex: number) => {
    setRenderWallsLoadedByZone((prev) => {
      if (zoneIndex < 0 || zoneIndex >= prev.length) return prev;
      const next = [...prev];
      const total = wallTotals[zoneIndex] ?? 0;
      next[zoneIndex] = Math.min(total, next[zoneIndex] + 1);
      return next;
    });
  };

  const getZoneStatus = useMemo(() => {
    return (zoneIndex: number) => {
      const preload = zoneLoadStates[zoneIndex];
      const imagesTotal = imageTotals[zoneIndex] ?? 0;
      const imagesLoaded = cachedImagesByZone[zoneIndex] ?? 0;
      const wallsTotal = wallTotals[zoneIndex] ?? 0;
      const wallsLoaded = renderWallsLoadedByZone[zoneIndex] ?? 0;
      const timedOut = preload?.timedOut ?? false;
      const imagesReady = imagesTotal === 0 || imagesLoaded >= imagesTotal;
      const wallsReady = wallsLoaded >= wallsTotal;
      const ready = wallsReady && (imagesReady || timedOut);
      return { imagesLoaded, imagesTotal, wallsLoaded, wallsTotal, imagesReady, wallsReady, ready, timedOut };
    };
  }, [cachedImagesByZone, imageTotals, renderWallsLoadedByZone, wallTotals, zoneLoadStates]);

  function zoneForZ(z: number): number {
    const idx = layout.zones.findIndex((zone) => z <= zone.startZ && z >= zone.endZ);
    return idx === -1 ? 0 : idx;
  }

  const doorNodesByZone = useMemo(() => {
    const map = new Map<number, DoorNode[]>();
    const hallIndex = layout.zones.findIndex((z) => z.zone.id === "felix-hall");
    const lucaHallIndex = layout.zones.findIndex((z) => z.zone.id === "luca-hall");
    const felixRange = artistRoomRanges.find((r) => r.artistId === "felix");
    const lucaRange = artistRoomRanges.find((r) => r.artistId === "luca");
    const isFelixRoomIndex =
      felixRange && felixRange.count > 0
        ? (idx: number) => idx >= felixRange.startIndex && idx < felixRange.startIndex + felixRange.count
        : () => false;
    const isLucaRoomIndex =
      lucaRange && lucaRange.count > 0
        ? (idx: number) => idx >= lucaRange.startIndex && idx < lucaRange.startIndex + lucaRange.count
        : () => false;
    layout.zones.forEach((zone, idx) => {
      const doors: DoorNode[] = [];
      const walkInset = 4.0;
      const frontZ = Math.max(zone.startZ, zone.endZ) - 0.05;
      const backZ = Math.min(zone.startZ, zone.endZ) + 0.05;
      const centerX = zone.centerX ?? 0;

      if (idx === 0) {
        const lobbyTargets = artistRoomRanges
          .filter((r) => r.artistId !== "felix" && r.artistId !== "luca")
          .map((r) => ({ label: r.artistName ?? "Raum", target: r.startIndex }));
        const count = lobbyTargets.length || 1;
        lobbyTargets.forEach((entry, d) => {
          const offset = (d - (count - 1) / 2) * 4.6;
          doors.push({
            zoneIndex: idx,
            x: centerX + offset,
            z: frontZ - walkInset,
            doorTarget: entry.target,
            doorLabel: entry.label,
          });
        });
      } else if (hallIndex >= 0 && idx === hallIndex) {
        // Felix hall is walk-through, no teleport doors.
      } else if (lucaHallIndex >= 0 && idx === lucaHallIndex) {
        // Luca hall is walk-through, no teleport doors.
      } else if (isFelixRoomIndex(idx) || isLucaRoomIndex(idx)) {
        // Felix rooms are walk-through, no teleport doors.
      } else {
        const range = artistRoomRanges.find((r) => idx >= r.startIndex && idx < r.startIndex + r.count);
        const lastIndex = range ? range.startIndex + range.count - 1 : null;
        const isFirst = typeof lastIndex === "number" && idx === range?.startIndex;
        const isLast = typeof lastIndex === "number" && idx === lastIndex;
        if (range && idx > range.startIndex) {
          doors.push({
            zoneIndex: idx,
            x: centerX,
            z: frontZ - walkInset,
            doorTarget: idx - 1,
            doorLabel: "Zurueck",
          });
        }
        if (range && lastIndex !== null && idx < lastIndex) {
          doors.push({
            zoneIndex: idx,
            x: centerX,
            z: backZ + walkInset,
            doorTarget: idx + 1,
            doorLabel: "Weiter",
          });
        }
        if (isFirst) {
          doors.push({
            zoneIndex: idx,
            x: centerX,
            z: frontZ - walkInset,
            doorTarget: 0,
            doorLabel: "Lobby",
          });
        }
        if (isLast && !isFirst) {
          doors.push({
            zoneIndex: idx,
            x: centerX,
            z: backZ + walkInset,
            doorTarget: 0,
            doorLabel: "Lobby",
          });
        }
      }
      map.set(idx, doors);
    });
    return map;
  }, [layout.zones]);

  const artworkPlacementsByZone = useMemo(() => {
    const map = new Map<number, { id: string; position: [number, number, number] }[]>();
    const felixHall = layout.zones.find((zone) => zone.zone.id === "felix-hall") || null;
    const lucaHall = layout.zones.find((zone) => zone.zone.id === "luca-hall") || null;
    layout.zones.forEach((z) => {
      const list = artworksByZone[z.index] || [];
      const slots = buildWallSlots(z, { felixHall, lucaHall });
      const indices = selectSlotIndices(Math.min(list.length, slots.length), slots.length);
      const limited = list.slice(0, indices.length);
      const placements = limited.map((art, i) => ({
        id: art.id,
        position: slots[indices[i]].position,
      }));
      map.set(z.index, placements);
    });
    return map;
  }, [layout.zones, artworksByZone]);

  const lobbySpawn = useMemo(() => {
    const lobby = layout.zones[0];
    if (!lobby) {
      return {
        position: [0, eyeY, -4] as [number, number, number],
        lookAt: [0, targetY, -8] as [number, number, number],
      };
    }
    const spawnZ = lobby.centerZ;
    const hall = hallIndex >= 0 ? layout.zones[hallIndex] : null;
    const doorZ = hall ? hall.centerZ : lobby.endZ - 0.2;
    const spawnX = lobby.centerX ?? 0;
    return {
      position: [spawnX, eyeY, spawnZ] as [number, number, number],
      lookAt: [spawnX, targetY, doorZ] as [number, number, number],
    };
  }, [layout.zones, hallIndex, eyeY, targetY]);

  function buildSpawnForZone(target: number, fromZone?: number): SpawnRequest | null {
    const zone = layout.zones[target];
    if (!zone) return null;
    const doors = doorNodesByZone.get(target) || [];
    const door = typeof fromZone === "number" ? doors.find((d) => d.doorTarget === fromZone) || doors[0] : doors[0];
    const centerX = zone.centerX ?? 0;
    if (!door) {
      const spawnZ = zone.centerZ;
      const faceZ = zone.startZ;
      const dirZ = faceZ >= spawnZ ? 1 : -1;
      const lookAtZ = spawnZ + dirZ * 6;
      return {
        zoneIndex: target,
        position: [centerX, eyeY, spawnZ],
        lookAt: [centerX, targetY, lookAtZ],
      };
    }
    const doorPos = new Vector3(door.x ?? centerX, eyeY, door.z ?? zone.startZ - 2);
    const center = new Vector3(centerX, eyeY, zone.centerZ);
    const dir = center.clone().sub(doorPos).setY(0).normalize();
    const spawn = doorPos.clone().add(dir.multiplyScalar(2.6));
    const lookAt = spawn.clone().add(dir.multiplyScalar(6));
    lookAt.y = targetY;
    return {
      zoneIndex: target,
      position: [spawn.x, spawn.y, spawn.z],
      lookAt: [lookAt.x, lookAt.y, lookAt.z],
    };
  }

  useEffect(() => {
    if (!museumMode) {
      setActiveZone(0);
      setPendingZone(null);
      setSpawnRequest({ zoneIndex: 0, position: lobbySpawn.position, lookAt: lobbySpawn.lookAt });
    } else {
      setActiveZone(0);
      setSpawnRequest({ zoneIndex: 0, position: lobbySpawn.position, lookAt: lobbySpawn.lookAt });
    }
  }, [museumMode, lobbySpawn]);

  function requestDoorTransition(door: DoorNode) {
    const target = typeof door.doorTarget === "number" ? door.doorTarget : door.zoneIndex;
    if (target === activeZone) return;
    const spawn = buildSpawnForZone(target, activeZone);
    if (!spawn) return;
    const status = getZoneStatus(target);
    if (!status.ready) {
      pendingSpawnRef.current = spawn;
      setPendingZone(target);
      setLoading(true);
      onLoadingChange?.(true);
      return;
    }
    setActiveZone(target);
    onZoneChange?.(target);
    setSpawnRequest(spawn);
  }

  function requestZoneJump(target: number) {
    if (target === activeZone) return;
    const spawn = buildSpawnForZone(target, activeZone);
    if (!spawn) return;
    const status = getZoneStatus(target);
    if (!status.ready) {
      pendingSpawnRef.current = spawn;
      setPendingZone(target);
      setLoading(true);
      onLoadingChange?.(true);
      return;
    }
    setActiveZone(target);
    onZoneChange?.(target);
    setSpawnRequest(spawn);
  }

  useEffect(() => {
    const activeStatus = getZoneStatus(activeZone);
    const activeReady = activeStatus.ready;
    const startupReady = startupZoneIds.every((zoneIndex) => {
      const status = getZoneStatus(zoneIndex);
      return status.wallsReady && status.imagesReady;
    });
    if (pendingZone !== null) {
      const ready = getZoneStatus(pendingZone).ready;
      if (ready && pendingSpawnRef.current) {
        setActiveZone(pendingZone);
        onZoneChange?.(pendingZone);
        setSpawnRequest(pendingSpawnRef.current);
        pendingSpawnRef.current = null;
        setPendingZone(null);
      }
    }
    const nextLoading = pendingZone !== null || !activeReady || (activeZone === 0 && !startupReady);
    if (nextLoading !== loading) {
      setLoading(nextLoading);
      onLoadingChange?.(nextLoading);
    }
  }, [pendingZone, activeZone, loading, getZoneStatus, onLoadingChange, startupZoneIds]);

  const lastJumpToken = useRef(0);
  useEffect(() => {
    if (!museumMode) return;
    if (!jumpToken || jumpToken === lastJumpToken.current) return;
    lastJumpToken.current = jumpToken;
    if (typeof jumpTarget === "number") {
      requestZoneJump(jumpTarget);
    }
  }, [jumpToken, jumpTarget, museumMode]);

  useEffect(() => {
    const zoneIndex = pendingZone ?? activeZone;
    const status = getZoneStatus(zoneIndex);
    if (!status) return;
    const overallTotal = status.imagesTotal + status.wallsTotal;
    const overallLoaded = Math.min(overallTotal, status.imagesLoaded + status.wallsLoaded);
    const percent = overallTotal > 0 ? overallLoaded / overallTotal : 1;
    onLoadingProgress?.({
      zoneIndex,
      imagesLoaded: status.imagesLoaded,
      imagesTotal: status.imagesTotal,
      wallsLoaded: status.wallsLoaded,
      wallsTotal: status.wallsTotal,
      overallLoaded,
      overallTotal,
      percent,
    });
  }, [pendingZone, activeZone, getZoneStatus, onLoadingProgress]);

  const lighting = useMemo(() => {
    const zone = gallery.zones[activeZone];
    let ambient = 0.8;
    let directional = 0.9;
    let fill = 0.25;
    if (zone?.id === "lobby") {
      ambient = 0.9;
      directional = 0.95;
      fill = 0.3;
    }
    const ceiling = zone?.ceilingTexture || "";
    if (/nacht/i.test(ceiling)) {
      ambient = 0.65;
      directional = 0.8;
      fill = 0.2;
    } else if (/tag/i.test(ceiling)) {
      ambient = 0.95;
      directional = 1.05;
      fill = 0.35;
    }
    const safariFactor = isSafari ? 0.9 : 1;
    return {
      ambient: ambient * safariFactor,
      directional: directional * safariFactor,
      fill: fill * safariFactor,
    };
  }, [activeZone, gallery.zones, isSafari]);

  return (
    <Canvas
      ref={canvasRef}
      id="r3f-root"
      className="r3f-root"
      frameloop="always"
      dpr={1}
      camera={initialCamera}
      gl={{ antialias: !isSafari, powerPreference: isSafari ? "low-power" : "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.25;
        const canvas = gl.domElement;
        let glVersion: string | undefined;
        let renderer: string | undefined;
        let vendor: string | undefined;
        try {
          const ctx = gl.getContext();
          glVersion = String(ctx.getParameter(ctx.VERSION));
          renderer = String(ctx.getParameter(ctx.RENDERER));
          vendor = String(ctx.getParameter(ctx.VENDOR));
        } catch {
          // ignore
        }
        onCanvasInfo?.({
          created: true,
          componentMounted: true,
          width: canvas.width,
          height: canvas.height,
          dpr: window.devicePixelRatio || 1,
          glVersion: String(glVersion),
          renderer: String(renderer),
          vendor: String(vendor),
        });
        const onLost = (e: Event) => {
          e.preventDefault();
          onWebglContextLost?.();
        };
        const onRestore = () => {
          onWebglContextRestored?.();
        };
        canvas.addEventListener("webglcontextlost", onLost, false);
        canvas.addEventListener("webglcontextrestored", onRestore, false);
      }}
      style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#0c0c0f"]} />

      <ambientLight intensity={lighting.ambient} />
      <directionalLight position={[4, 6, 4]} intensity={lighting.directional} />
      <directionalLight position={[-4, 4, -4]} intensity={lighting.fill} />

      <CameraZoom zoom={zoom} />

      <FirstPersonController
        activeZone={activeZone}
        layout={layout}
        museumMode={museumMode}
        uiActive={uiActive}
        startToken={startToken}
        spawnRequest={spawnRequest}
        onSpawnConsumed={() => setSpawnRequest(null)}
        onExitMuseum={onExitMuseum}
        onInteractionHint={onInteractionHint}
        onZoneChange={(zoneIndex) => {
          setActiveZone(zoneIndex);
          onZoneChange?.(zoneIndex);
        }}
        onSelectArtwork={onSelectArtwork}
        onSelectArtist={onSelectArtist}
        onSelectDirector={onSelectDirector}
        onDoor={requestDoorTransition}
        doorNodesByZone={doorNodesByZone}
        artworkPlacementsByZone={artworkPlacementsByZone}
        artistGuideRef={artistGuideRef}
        directorGuideRef={directorGuideRef}
        directorSelected={directorSelected}
        eyeY={eyeY}
        virtualMove={virtualMove}
        virtualLook={virtualLook}
        touchMode={touchMode}
        actionToken={actionToken}
        doorToken={doorToken}
      />

      <GalleryScene
        gallery={gallery}
        artworks={artworks}
        activeZoneIndex={activeZone}
        preloadZoneIndex={pendingZone}
        preloadZoneIds={preloadZoneIds}
        quality={isSafari ? "safari" : "default"}
        interactionMode={museumMode ? "keyboard" : "click"}
        artistGuideRef={artistGuideRef}
        directorGuideRef={directorGuideRef}
        suppressArtistSpeech={uiActive}
        suppressDirectorSpeech={uiActive}
        onSelectArtist={onSelectArtist}
        onSelectDirector={onSelectDirector}
        onSelectArtwork={(id) => {
          onSelectArtwork(id);
        }}
        onFrameLoaded={(zoneIndex) => handleTextureReady(zoneIndex)}
        onWallLoaded={(zoneIndex) => handleWallReady(zoneIndex)}
        onShooterUpdate={onShooterUpdate}
        shooterResetToken={shooterResetToken}
        onNavigateTo={() => undefined}
      />

      <DebugProbe onUpdate={onDebugUpdate} enabled={debugEnabled} />
    </Canvas>
  );
}

function CameraZoom({ zoom }: { zoom: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const cam = camera as { fov?: number; updateProjectionMatrix?: () => void };
    if (typeof cam.fov === "number" && typeof cam.updateProjectionMatrix === "function") {
      const clamped = clamp(zoom, 0, 1);
      cam.fov = lerp(60, 35, clamped);
      cam.updateProjectionMatrix();
    }
  }, [camera, zoom]);
  return null;
}

function FirstPersonController({
  activeZone,
  layout,
  museumMode,
  uiActive,
  startToken,
  spawnRequest,
  eyeY,
  onSpawnConsumed,
  onExitMuseum,
  onInteractionHint,
  onZoneChange,
  onSelectArtwork,
  onSelectArtist,
  onSelectDirector,
  onDoor,
  doorNodesByZone,
  artworkPlacementsByZone,
  artistGuideRef,
  directorGuideRef,
  directorSelected,
  virtualMove,
  virtualLook,
  touchMode,
  actionToken,
  doorToken,
}: {
  activeZone: number;
  layout: ReturnType<typeof computeGalleryLayout>;
  museumMode: boolean;
  uiActive: boolean;
  startToken: number;
  spawnRequest: SpawnRequest | null;
  onSpawnConsumed: () => void;
  onExitMuseum?: () => void;
  onInteractionHint?: (hint: { type: "artwork" | "door" | "artist" | "director" | null; label?: string }) => void;
  onZoneChange: (zoneIndex: number) => void;
  onSelectArtwork: (artworkId: string) => void;
  onSelectArtist?: (artistId: string) => void;
  onSelectDirector?: (id: string) => void;
  onDoor: (door: DoorNode) => void;
  doorNodesByZone: Map<number, DoorNode[]>;
  artworkPlacementsByZone: Map<number, { id: string; position: [number, number, number] }[]>;
  artistGuideRef: React.MutableRefObject<ArtistGuideRuntime>;
  directorGuideRef: React.MutableRefObject<ArtistGuideRuntime>;
  directorSelected: boolean;
  eyeY: number;
  virtualMove?: { forward?: boolean; back?: boolean; left?: boolean; right?: boolean; sprint?: boolean };
  virtualLook?: { x: number; y: number };
  touchMode?: boolean;
  actionToken?: number;
  doorToken?: number;
}) {
  const controlsRef = useRef<any>(null);
  const { camera, gl } = useThree();
  const supportsPointerLock = useMemo(() => {
    if (typeof document === "undefined") return false;
    return "pointerLockElement" in document;
  }, []);
  const keys = useRef({ forward: false, back: false, left: false, right: false, sprint: false });
  const nearDoorRef = useRef<DoorNode | null>(null);
  const nearArtworkRef = useRef<string | null>(null);
  const nearArtistRef = useRef<string | null>(null);
  const nearDirectorRef = useRef<string | null>(null);
  const nearHintRef = useRef<{ type: "artwork" | "door" | "artist" | "director" | null; label?: string }>({
    type: null,
  });
  const forward = useRef(new Vector3(0, 0, -1));
  const right = useRef(new Vector3(1, 0, 0));
  const velocity = useRef(new Vector3());
  const jumpVelocity = useRef(0);
  const onGround = useRef(true);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const lastActionToken = useRef(0);
  const lastDoorToken = useRef(0);
  const lastAutoDoorRef = useRef(0);
  const lastGuideZoneRef = useRef<number | null>(null);
  const tempVec = useRef(new Vector3());
  const tempVecDoor = useRef(new Vector3());
  const felixRange = useMemo(() => artistRoomRanges.find((r) => r.artistId === "felix"), []);
  const lucaRange = useMemo(() => artistRoomRanges.find((r) => r.artistId === "luca"), []);
  const hallIndex = useMemo(() => layout.zones.findIndex((z) => z.zone.id === "felix-hall"), [layout.zones]);
  const lucaHallIndex = useMemo(() => layout.zones.findIndex((z) => z.zone.id === "luca-hall"), [layout.zones]);
  const felixRoomIndices = useMemo(() => {
    if (!felixRange || felixRange.count <= 0) return [];
    return Array.from({ length: felixRange.count }, (_, i) => felixRange.startIndex + i);
  }, [felixRange]);
  const lucaRoomIndices = useMemo(() => {
    if (!lucaRange || lucaRange.count <= 0) return [];
    return Array.from({ length: lucaRange.count }, (_, i) => lucaRange.startIndex + i);
  }, [lucaRange]);
  const wingZoneIds = useMemo(() => {
    const set = new Set<number>();
    if (hallIndex >= 0 || lucaHallIndex >= 0) {
      set.add(0);
    }
    if (hallIndex >= 0) {
      set.add(hallIndex);
      felixRoomIndices.forEach((idx) => set.add(idx));
    }
    if (lucaHallIndex >= 0) {
      set.add(lucaHallIndex);
      lucaRoomIndices.forEach((idx) => set.add(idx));
    }
    return set;
  }, [hallIndex, lucaHallIndex, felixRoomIndices, lucaRoomIndices]);
  const findZoneIndex = useCallback(
    (x: number, z: number) => {
      let best = -1;
      let bestDist = Infinity;
      layout.zones.forEach((zone, idx) => {
        if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) return;
        const dx = x - zone.centerX;
        const dz = z - zone.centerZ;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
          best = idx;
          bestDist = dist;
        }
      });
      return best;
    },
    [layout.zones],
  );
  const wingPortals = useMemo(() => {
    const portals: PortalRect[] = [];
    const lobby = layout.zones[0];
    const doorWidth = 2.4;
    const hallRoomDoorWidth = 4.8;
    const portalDepth = 1.4;
    const resolveSide = (room: typeof layout.zones[number] | undefined, hall: typeof layout.zones[number] | undefined) => {
      if (!room || !hall) return null;
      const dx = (room.centerX ?? 0) - (hall.centerX ?? 0);
      const dz = (room.centerZ ?? 0) - (hall.centerZ ?? 0);
      if (Math.abs(dx) > 0.6) {
        return dx > 0 ? "right" : "left";
      }
      return dz < 0 ? "front" : "back";
    };

    if (lobby && hallIndex >= 0) {
      const hall = layout.zones[hallIndex];
      if (hall) {
        const doorX = lobby.centerX ?? 0;
        const boundaryZ = Math.min(lobby.startZ, lobby.endZ);
        portals.push({
          from: 0,
          to: hallIndex,
          minX: doorX - doorWidth / 2,
          maxX: doorX + doorWidth / 2,
          minZ: boundaryZ - portalDepth,
          maxZ: boundaryZ + portalDepth,
          axis: "z",
        });

        felixRoomIndices.forEach((roomIdx) => {
          const room = layout.zones[roomIdx];
          if (!room) return;
          const side = resolveSide(room, hall);
          if (side === "right") {
            const boundaryX = hall.maxX;
            portals.push({
              from: hallIndex,
              to: roomIdx,
              minX: boundaryX - portalDepth,
              maxX: boundaryX + portalDepth,
              minZ: room.centerZ - hallRoomDoorWidth / 2,
              maxZ: room.centerZ + hallRoomDoorWidth / 2,
              axis: "x",
            });
          } else if (side === "left") {
            const boundaryX = hall.minX;
            portals.push({
              from: hallIndex,
              to: roomIdx,
              minX: boundaryX - portalDepth,
              maxX: boundaryX + portalDepth,
              minZ: room.centerZ - hallRoomDoorWidth / 2,
              maxZ: room.centerZ + hallRoomDoorWidth / 2,
              axis: "x",
            });
          } else if (side === "front") {
            const boundaryZ = hall.endZ;
            portals.push({
              from: hallIndex,
              to: roomIdx,
              minX: room.centerX - hallRoomDoorWidth / 2,
              maxX: room.centerX + hallRoomDoorWidth / 2,
              minZ: boundaryZ - portalDepth,
              maxZ: boundaryZ + portalDepth,
              axis: "z",
            });
          }
        });

        const felixBySide = new Map<string, Array<{ idx: number; z: number; x: number }>>();
        felixRoomIndices.forEach((roomIdx) => {
          const room = layout.zones[roomIdx];
          if (!room) return;
          const side = resolveSide(room, hall) ?? "none";
          const list = felixBySide.get(side) || [];
          list.push({ idx: roomIdx, z: room.centerZ, x: room.centerX });
          felixBySide.set(side, list);
        });
        felixBySide.forEach((list) => {
          list.sort((a, b) => b.z - a.z);
          for (let i = 0; i < list.length - 1; i += 1) {
            const roomIdx = list[i].idx;
            const nextIdx = list[i + 1].idx;
            const room = layout.zones[roomIdx];
            const nextRoom = layout.zones[nextIdx];
            if (!room || !nextRoom) continue;
            const boundaryZ = Math.min(room.startZ, room.endZ);
            portals.push({
              from: roomIdx,
              to: nextIdx,
              minX: room.centerX - doorWidth / 2,
              maxX: room.centerX + doorWidth / 2,
              minZ: boundaryZ - portalDepth,
              maxZ: boundaryZ + portalDepth,
              axis: "z",
            });
          }
        });
      }
    }

    if (lobby && lucaHallIndex >= 0) {
      const hall = layout.zones[lucaHallIndex];
      if (hall) {
        const doorZ = lobby.centerZ ?? 0;
        const lobbyBoundaryX = lobby.minX;
        const hallBoundaryX = hall.maxX;
        const portalMinX = Math.min(lobbyBoundaryX, hallBoundaryX) - portalDepth;
        const portalMaxX = Math.max(lobbyBoundaryX, hallBoundaryX) + portalDepth;
        portals.push({
          from: 0,
          to: lucaHallIndex,
          minX: portalMinX,
          maxX: portalMaxX,
          minZ: doorZ - doorWidth / 2,
          maxZ: doorZ + doorWidth / 2,
          axis: "x",
        });

        lucaRoomIndices.forEach((roomIdx) => {
          const room = layout.zones[roomIdx];
          if (!room) return;
          const roomBoundaryX = hall.minX;
          portals.push({
            from: lucaHallIndex,
            to: roomIdx,
            minX: roomBoundaryX - portalDepth,
            maxX: roomBoundaryX + portalDepth,
            minZ: room.centerZ - hallRoomDoorWidth / 2,
            maxZ: room.centerZ + hallRoomDoorWidth / 2,
            axis: "x",
          });
        });

        for (let i = 0; i < lucaRoomIndices.length - 1; i += 1) {
          const roomIdx = lucaRoomIndices[i];
          const nextIdx = lucaRoomIndices[i + 1];
          const room = layout.zones[roomIdx];
          const nextRoom = layout.zones[nextIdx];
          if (!room || !nextRoom) continue;
          const boundaryZ = Math.min(room.startZ, room.endZ);
          portals.push({
            from: roomIdx,
            to: nextIdx,
            minX: room.centerX - doorWidth / 2,
            maxX: room.centerX + doorWidth / 2,
            minZ: boundaryZ - portalDepth,
            maxZ: boundaryZ + portalDepth,
            axis: "z",
          });
        }
      }
    }
    return portals;
  }, [layout.zones, hallIndex, lucaHallIndex, felixRoomIndices, lucaRoomIndices]);
  const isPortalBetween = useCallback(
    (fromIdx: number, toIdx: number, x: number, z: number, prevX: number, prevZ: number) => {
      const hit = (p: PortalRect, px: number, pz: number) =>
        px >= p.minX && px <= p.maxX && pz >= p.minZ && pz <= p.maxZ;
      return wingPortals.some((portal) => {
        if (!((portal.from === fromIdx && portal.to === toIdx) || (portal.from === toIdx && portal.to === fromIdx))) {
          return false;
        }
        return hit(portal, x, z) || hit(portal, prevX, prevZ);
      });
    },
    [wingPortals],
  );
  const isInsidePortal = useCallback(
    (zoneIdx: number, x: number, z: number, prevX: number, prevZ: number) => {
      const hit = (p: PortalRect, px: number, pz: number) =>
        px >= p.minX && px <= p.maxX && pz >= p.minZ && pz <= p.maxZ;
      return wingPortals.some((portal) => {
        if (!(portal.from === zoneIdx || portal.to === zoneIdx)) return false;
        return hit(portal, x, z) || hit(portal, prevX, prevZ);
      });
    },
    [wingPortals],
  );
  const getPortalTarget = useCallback(
    (fromIdx: number, x: number, z: number, prevX: number, prevZ: number) => {
      const fromZone = layout.zones[fromIdx];
      if (!fromZone) return null;
      const hit = (p: PortalRect, px: number, pz: number) =>
        px >= p.minX && px <= p.maxX && pz >= p.minZ && pz <= p.maxZ;
      for (const portal of wingPortals) {
        if (!(portal.from === fromIdx || portal.to === fromIdx)) continue;
        const other = portal.from === fromIdx ? portal.to : portal.from;
        const otherZone = layout.zones[other];
        if (!otherZone) continue;
        const inside = hit(portal, x, z) || hit(portal, prevX, prevZ);
        if (!inside) continue;
        if (portal.axis === "z") {
          if (otherZone.centerZ < fromZone.centerZ - 0.01) {
            const midZ = (fromZone.minZ + otherZone.maxZ) / 2;
            if (z <= midZ) return other;
          } else if (otherZone.centerZ > fromZone.centerZ + 0.01) {
            const midZ = (fromZone.maxZ + otherZone.minZ) / 2;
            if (z >= midZ) return other;
          }
        } else {
          if (otherZone.centerX > fromZone.centerX + 0.01) {
            const midX = (fromZone.maxX + otherZone.minX) / 2;
            if (x >= midX) return other;
          } else if (otherZone.centerX < fromZone.centerX - 0.01) {
            const midX = (fromZone.minX + otherZone.maxX) / 2;
            if (x <= midX) return other;
          }
        }
      }
      return null;
    },
    [wingPortals, layout.zones],
  );

  useEffect(() => {
    if (!museumMode || uiActive) {
      controlsRef.current?.unlock?.();
      if (gl?.domElement) gl.domElement.style.cursor = "default";
      return;
    }
    if (gl?.domElement) gl.domElement.style.cursor = "none";
  }, [museumMode, uiActive, gl]);

  useEffect(() => {
    if (!museumMode || uiActive) return;
    if (!gl?.domElement || !supportsPointerLock || touchMode) return;
    const el = gl.domElement;
    const onPointerDown = () => {
      if (!controlsRef.current) return;
      if (controlsRef.current.isLocked) return;
      if (typeof document === "undefined") return;
      if (!document.body?.requestPointerLock) return;
      controlsRef.current.lock?.();
    };
    el.addEventListener("pointerdown", onPointerDown);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
    };
  }, [museumMode, uiActive, gl, startToken, supportsPointerLock, touchMode]);

  useEffect(() => {
    if (!museumMode || uiActive) return;
    if (!gl?.domElement || supportsPointerLock || touchMode) return;
    const el = gl.domElement;
    const onPointerDown = () => {
      dragging.current = true;
    };
    const onPointerUp = () => {
      dragging.current = false;
    };
    const onPointerLeave = () => {
      dragging.current = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const dx = event.movementX || 0;
      const dy = event.movementY || 0;
      yaw.current -= dx * 0.0025;
      pitch.current = clamp(pitch.current - dy * 0.0025, -1.2, 1.2);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
    };
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointermove", onPointerMove);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointermove", onPointerMove);
    };
  }, [museumMode, uiActive, gl, supportsPointerLock, camera, touchMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!museumMode || uiActive) return;
      if (e.code === "ArrowUp" || e.code === "KeyW") {
        keys.current.forward = true;
        e.preventDefault();
      }
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        keys.current.back = true;
        e.preventDefault();
      }
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        keys.current.left = true;
        e.preventDefault();
      }
      if (e.code === "ArrowRight" || e.code === "KeyD") {
        keys.current.right = true;
        e.preventDefault();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        keys.current.sprint = true;
      }
      if (e.code === "KeyQ") {
        keys.current.sprint = true;
      }
      if (e.code === "Enter") {
        if (nearDirectorRef.current && onSelectDirector) {
          onSelectDirector(nearDirectorRef.current);
        } else if (nearArtistRef.current && onSelectArtist) {
          onSelectArtist(nearArtistRef.current);
        } else if (nearArtworkRef.current) {
          onSelectArtwork(nearArtworkRef.current);
        } else if (onGround.current) {
          jumpVelocity.current = 5.5;
          onGround.current = false;
        }
      }
      if (e.code === "KeyE") {
        if (nearDoorRef.current) {
          onDoor(nearDoorRef.current);
        }
      }
      if (e.code === "Escape") {
        onExitMuseum?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") keys.current.forward = false;
      if (e.code === "ArrowDown" || e.code === "KeyS") keys.current.back = false;
      if (e.code === "ArrowLeft" || e.code === "KeyA") keys.current.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keys.current.right = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.current.sprint = false;
      if (e.code === "KeyQ") keys.current.sprint = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [museumMode, uiActive, onSelectArtwork, onSelectArtist, onSelectDirector, onDoor, onExitMuseum]);

  useEffect(() => {
    const zone = layout.zones[activeZone];
    const isHall = zone?.zone?.id === "felix-hall" || zone?.zone?.id === "luca-hall";
    const currentRange = artistRoomRanges.find(
      (r) => activeZone >= r.startIndex && activeZone < r.startIndex + r.count,
    );
    const isArtistRoom = Boolean(currentRange && currentRange.artistId !== "example-room");
    if (!isArtistRoom && !isHall) {
      artistGuideRef.current.active = false;
      artistGuideRef.current.phase = "hidden";
      lastGuideZoneRef.current = null;
      return;
    }
    if (currentRange && lastGuideZoneRef.current !== activeZone && !isHall) {
      if (!zone) return;
      artistGuideRef.current.artistId = currentRange.artistId;
      const startX = zone.minX + 1.6;
      const startZ = zone.minZ + 1.6;
      artistGuideRef.current.position.set(startX, 0.05, startZ);

      const target = artistGuideRef.current.target;
      target.set(zone.centerX, 0.05, zone.centerZ);

      const margin = 2.0;
      target.x = clamp(target.x, zone.minX + margin, zone.maxX - margin);
      target.z = clamp(target.z, zone.minZ + margin, zone.maxZ - margin);

      artistGuideRef.current.active = true;
      artistGuideRef.current.phase = "approach";
      artistGuideRef.current.swayPhase = 0;
    }
    if (isHall && lastGuideZoneRef.current !== activeZone) {
      if (!zone) return;
      const isLucaHall = zone.zone?.id === "luca-hall";
      artistGuideRef.current.artistId = isLucaHall ? "luca" : "felix";
      const startX = isLucaHall ? zone.maxX - 1.2 : zone.minX + 1.2;
      const startZ = zone.centerZ;
      artistGuideRef.current.position.set(startX, 0.05, startZ);
      const margin = 1.6;
      const minX = zone.minX + margin;
      const maxX = zone.maxX - margin;
      const minZ = zone.minZ + margin;
      const maxZ = zone.maxZ - margin;
      artistGuideRef.current.target.set(
        minX + Math.random() * Math.max(0.1, maxX - minX),
        0.05,
        minZ + Math.random() * Math.max(0.1, maxZ - minZ),
      );
      artistGuideRef.current.active = true;
      artistGuideRef.current.phase = "roam";
      artistGuideRef.current.speed = 1.8;
      artistGuideRef.current.swayPhase = 0;
    }
    lastGuideZoneRef.current = activeZone;
  }, [activeZone, layout.zones, camera, artistGuideRef]);

  useEffect(() => {
    if (!museumMode || uiActive) return;
    if (actionToken && actionToken !== lastActionToken.current) {
      lastActionToken.current = actionToken;
      if (nearDirectorRef.current && onSelectDirector) {
        onSelectDirector(nearDirectorRef.current);
      } else if (nearArtistRef.current && onSelectArtist) {
        onSelectArtist(nearArtistRef.current);
      } else if (nearArtworkRef.current) {
        onSelectArtwork(nearArtworkRef.current);
      }
    }
  }, [actionToken, museumMode, uiActive, onSelectArtwork, onSelectArtist, onSelectDirector]);

  useEffect(() => {
    if (!museumMode || uiActive) return;
    if (doorToken && doorToken !== lastDoorToken.current) {
      lastDoorToken.current = doorToken;
      if (nearDoorRef.current) {
        onDoor(nearDoorRef.current);
      }
    }
  }, [doorToken, museumMode, uiActive, onDoor]);

  useEffect(() => {
    if (!spawnRequest) return;
    const pos = spawnRequest.position;
    const lookAt = spawnRequest.lookAt;
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.rotation.order = "YXZ";
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    jumpVelocity.current = 0;
    onGround.current = true;
    yaw.current = camera.rotation.y;
    pitch.current = camera.rotation.x;
    onSpawnConsumed();
  }, [spawnRequest, camera, onSpawnConsumed]);

  useFrame((_, delta) => {
    if (!museumMode || uiActive) return;
    if (supportsPointerLock && !controlsRef.current?.isLocked && !touchMode) return;
    const zone = layout.zones[activeZone];
    if (!zone) return;

    const guide = artistGuideRef.current;
    if (guide.active) {
      if (guide.phase === "approach") {
        guide.swayPhase += delta * 6.5;
      } else if (guide.phase === "roam") {
        guide.swayPhase += delta * 3.5;
      } else {
        guide.swayPhase = 0;
      }
      if (guide.phase === "approach" || guide.phase === "roam") {
        const step = guide.speed * delta;
        const toTarget = tempVec.current.copy(guide.target).sub(guide.position);
        const dist = toTarget.length();
          if (dist <= step || dist < 0.2 || !Number.isFinite(dist)) {
            if (guide.phase === "approach") {
              guide.position.copy(guide.target);
              guide.phase = "idle";
            } else {
              const margin = zone.zone?.id === "felix-hall" ? 1.6 : 2.0;
              const minX = zone.minX + margin;
              const maxX = zone.maxX - margin;
              const minZ = zone.minZ + margin;
              const maxZ = zone.maxZ - margin;
              guide.target.set(
                minX + Math.random() * Math.max(0.1, maxX - minX),
                0.05,
                minZ + Math.random() * Math.max(0.1, maxZ - minZ),
            );
          }
        } else {
          guide.position.add(toTarget.normalize().multiplyScalar(step));
        }
      }
    }

    const director = directorGuideRef.current;
    director.hold = directorSelected;
    if (activeZone === 0) {
      director.active = true;
      if (director.hold) {
        director.swayPhase = 0;
        director.phase = "idle";
      } else {
        director.phase = "roam";
        director.swayPhase += delta * 3.5;
        const margin = 3.0;
        const minX = zone.minX + margin;
        const maxX = zone.maxX - margin;
        const minZ = zone.minZ + margin;
        const maxZ = zone.maxZ - margin;
        const toTarget = tempVec.current.copy(director.target).sub(director.position);
        const dist = toTarget.length();
        if (dist < 0.4 || !Number.isFinite(dist)) {
          director.target.set(
            minX + Math.random() * (maxX - minX),
            0,
            minZ + Math.random() * (maxZ - minZ),
          );
        } else {
          const step = director.speed * delta;
          director.position.add(toTarget.normalize().multiplyScalar(step));
        }
      }
    } else {
      director.active = false;
    }

    if (virtualLook && (Math.abs(virtualLook.x) > 0.02 || Math.abs(virtualLook.y) > 0.02)) {
      const lookSpeed = touchMode ? 0.9 : 1.4;
      yaw.current -= virtualLook.x * lookSpeed * delta;
      pitch.current = clamp(pitch.current - virtualLook.y * lookSpeed * delta, -1.2, 1.2);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
    }

    const vForward = Boolean(virtualMove?.forward);
    const vBack = Boolean(virtualMove?.back);
    const vLeft = Boolean(virtualMove?.left);
    const vRight = Boolean(virtualMove?.right);
    const vSprint = Boolean(virtualMove?.sprint);
    const dirZ = ((keys.current.forward || vForward) ? 1 : 0) - ((keys.current.back || vBack) ? 1 : 0);
    const dirX = ((keys.current.right || vRight) ? 1 : 0) - ((keys.current.left || vLeft) ? 1 : 0);
    const moving = dirZ !== 0 || dirX !== 0;
    const speed = 6.0 * (keys.current.sprint || vSprint ? 2 : 1);

    const prevX = camera.position.x;
    const prevZ = camera.position.z;
    if (moving) {
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      forward.current.normalize();
      right.current.crossVectors(forward.current, new Vector3(0, 1, 0)).normalize();
      velocity.current
        .copy(forward.current)
        .multiplyScalar(dirZ)
        .add(right.current.clone().multiplyScalar(dirX))
        .normalize()
        .multiplyScalar(speed * delta);

      camera.position.add(velocity.current);
    }

    if (!onGround.current || jumpVelocity.current > 0) {
      jumpVelocity.current += -18 * delta;
      camera.position.y += jumpVelocity.current;
      if (camera.position.y <= eyeY) {
        camera.position.y = eyeY;
        jumpVelocity.current = 0;
        onGround.current = true;
      }
    }

    const isExampleRoom = zone.zone?.artistId === "example-room";
    let nextX = camera.position.x;
    let nextZ = camera.position.z;
    let nextZoneIndex = activeZone;
    const inWing = wingZoneIds.has(activeZone);
    if (inWing) {
      const portalTarget = getPortalTarget(activeZone, nextX, nextZ, prevX, prevZ);
      if (typeof portalTarget === "number") {
        nextZoneIndex = portalTarget;
      } else {
        const candidate = findZoneIndex(nextX, nextZ);
        if (candidate !== -1 && wingZoneIds.has(candidate)) {
          if (candidate === activeZone || isPortalBetween(activeZone, candidate, nextX, nextZ, prevX, prevZ)) {
            nextZoneIndex = candidate;
          }
        }
      }

      if (nextZoneIndex === activeZone) {
        const allowBeyond = isInsidePortal(activeZone, nextX, nextZ, prevX, prevZ);
        if (!allowBeyond) {
          const margin = 0.15;
          nextX = clamp(nextX, zone.minX + margin, zone.maxX - margin);
          nextZ = clamp(nextZ, zone.minZ + margin, zone.maxZ - margin);
        }
      } else {
        const targetZone = layout.zones[nextZoneIndex];
        if (targetZone) {
          const margin = 0.15;
          nextX = clamp(nextX, targetZone.minX + margin, targetZone.maxX - margin);
          nextZ = clamp(nextZ, targetZone.minZ + margin, targetZone.maxZ - margin);
        }
      }
    } else {
      const margin = isExampleRoom ? 0.1 : 0.1;
      nextX = clamp(nextX, zone.minX + margin, zone.maxX - margin);
      nextZ = clamp(nextZ, zone.minZ + margin, zone.maxZ - margin);
    }

    camera.position.x = nextX;
    camera.position.z = nextZ;

    if (nextZoneIndex !== activeZone) {
      onZoneChange(nextZoneIndex);
    }

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();

    // Door proximity
    const doorList: DoorNode[] = doorNodesByZone.get(activeZone) ?? [];
    let bestDoor: DoorNode | null = null;
    let bestDoorLabel: string | undefined;
    let bestDoorDist = Infinity;
    doorList.forEach((door) => {
      const d = Math.hypot(camera.position.x - door.x, camera.position.z - door.z);
      if (d < bestDoorDist) {
        bestDoorDist = d;
        bestDoor = door;
        bestDoorLabel = door.doorLabel;
      }
    });
    const doorHit: DoorNode | null = bestDoorDist < 3.4 ? bestDoor : null;
    nearDoorRef.current = doorHit;
    if (doorHit && bestDoorDist < 1.1) {
      const hit = doorHit as DoorNode;
      const now = performance.now();
      if (now - lastAutoDoorRef.current > 900) {
        const toDoor = tempVecDoor.current.set(hit.x - camera.position.x, 0, hit.z - camera.position.z);
        const dist = toDoor.length();
        if (dist > 0.01) {
          const facing = forward.current.clone().normalize().dot(toDoor.normalize());
          if (facing > 0.2) {
            lastAutoDoorRef.current = now;
            onDoor(hit);
          }
        }
      }
    }

    // Artwork proximity
    const placements = artworkPlacementsByZone.get(activeZone) || [];
    let bestArt: string | null = null;
    let bestArtDist = Infinity;
    const viewDir = forward.current.clone();
    placements.forEach((p) => {
      const toArt = new Vector3(p.position[0] - camera.position.x, 0, p.position[2] - camera.position.z);
      const dist = toArt.length();
      if (dist > 3.6) return;
      const dot = dist > 0 ? viewDir.clone().normalize().dot(toArt.clone().normalize()) : 0;
      if (dot < 0.35) return;
      if (dist < bestArtDist) {
        bestArtDist = dist;
        bestArt = p.id;
      }
    });
    nearArtworkRef.current = bestArt;

    // Artist guide proximity
    let nearArtist: string | null = null;
    const guideNear = artistGuideRef.current;
    if (guideNear.active) {
      const toGuide = tempVec.current.copy(guideNear.position).sub(camera.position);
      const dist = toGuide.length();
      if (dist < 3.8) {
        nearArtist = guideNear.artistId;
      }
    }
    nearArtistRef.current = nearArtist;

    let nearDirector: string | null = null;
    const directorNear = directorGuideRef.current;
    if (directorNear.active) {
      const toDirector = tempVec.current.copy(directorNear.position).sub(camera.position);
      const dist = toDirector.length();
      if (dist < 3.8) {
        nearDirector = directorNear.artistId;
      }
    }
    nearDirectorRef.current = nearDirector;

    let hint: { type: "artwork" | "door" | "artist" | "director" | null; label?: string } = { type: null };
    if (doorHit) {
      hint = { type: "door", label: bestDoorLabel || "Tür" };
    } else if (nearDirector) {
      hint = { type: "director", label: "Direktor" };
    } else if (nearArtist) {
      hint = { type: "artist" };
    } else if (bestArt) {
      hint = { type: "artwork" };
    }
    if (
      hint.type !== nearHintRef.current.type ||
      hint.label !== nearHintRef.current.label
    ) {
      nearHintRef.current = hint;
      onInteractionHint?.(hint);
    }
  });

  return supportsPointerLock && !touchMode ? <PointerLockControls ref={controlsRef} /> : null;
}

function DebugProbe({
  onUpdate,
  enabled = false,
}: {
  onUpdate?: (data: {
    frameCount: number;
    lastFrameAt: number;
    camera: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }) => void;
  enabled?: boolean;
}) {
  const { camera } = useThree();
  const frameCount = useRef(0);
  const lastFrameAt = useRef(0);
  const lastEmit = useRef(0);
  const target = useRef(new Vector3());

  useFrame(() => {
    if (!enabled) return;
    const now = performance.now();
    frameCount.current += 1;
    lastFrameAt.current = now;
    if (!onUpdate) return;
    if (now - lastEmit.current < 500) return;
    lastEmit.current = now;
    const dir = new Vector3();
    camera.getWorldDirection(dir);
    target.current.copy(camera.position).add(dir.multiplyScalar(6));
    onUpdate({
      frameCount: frameCount.current,
      lastFrameAt: lastFrameAt.current,
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: target.current.x, y: target.current.y, z: target.current.z },
    });
  });

  return null;
}
