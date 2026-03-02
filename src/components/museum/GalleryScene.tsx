"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BackSide,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Group,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  VideoTexture,
  type Side,
} from "three";
import { Billboard, Html } from "@react-three/drei";

import type { Artwork, GalleryTheme, MuseumGallery } from "@/content/types";
import { ExhibitFrame } from "@/components/museum/ExhibitFrame";
import { computeGalleryLayout, type GalleryLayout } from "@/components/museum/galleryLayout";
import { artistRoomRanges } from "@/content/museum";
import { buildWallSlots, selectSlotIndices } from "@/components/museum/placements";
import type { ArtistGuideRuntime } from "@/components/museum/artistGuide";
import { buildArtworksByZone } from "@/components/museum/artworkAssignments";
import { loadTextureWithRetry } from "@/components/museum/textureCache";

type Placement = {
  artwork: Artwork;
  position: [number, number, number];
  rotation: [number, number, number];
  frameStyle: "minimal" | "industrial" | "ornate";
  recessed: boolean;
};

type EnemyRuntime = {
  position: Vector3;
  target: Vector3;
  speed: number;
  cooldown: number;
  laserTimer: number;
  laserDuration: number;
  laserMaxDist: number;
  laserDir: Vector3;
  phase: number;
};

type Surface = {
  id: string;
  axis: "x" | "z";
  pos: number;
  min: number;
  max: number;
  y: number;
  rotation: [number, number, number];
};

type Aabb = {
  min: Vector3;
  max: Vector3;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function distanceToRay(origin: Vector3, dir: Vector3, point: Vector3): { dist: number; t: number } {
  const toPoint = point.clone().sub(origin);
  const t = toPoint.dot(dir);
  const closest = origin.clone().add(dir.clone().multiplyScalar(t));
  return { dist: closest.distanceTo(point), t };
}


function rayAabbDistance(origin: Vector3, dir: Vector3, box: Aabb): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes = ["x", "y", "z"] as const;
  for (const axis of axes) {
    const o = origin[axis];
    const d = dir[axis];
    const min = box.min[axis];
    const max = box.max[axis];
    if (Math.abs(d) < 1e-6) {
      if (o < min || o > max) return null;
      continue;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  if (tmax < 0) return null;
  if (tmin >= 0) return tmin;
  return tmax >= 0 ? tmax : null;
}

function getCoverHitDist(origin: Vector3, dir: Vector3, maxDist: number, boxes: Aabb[]): number {
  let best = maxDist;
  if (!boxes.length) return best;
  for (const box of boxes) {
    const t = rayAabbDistance(origin, dir, box);
    if (t !== null && t >= 0 && t < best) {
      best = t;
    }
  }
  return best;
}

const LOBBY_VIDEO_SRC = "/video/lobby-wall.mp4";


const THEME_CONFIG: Record<
  GalleryTheme,
  {
    wall: { color: string; roughness: number };
    wallAlt: { color: string; roughness: number };
    floor: { color: string; roughness: number; metalness: number };
    ceiling: { color: string; roughness: number };
    frameStyle: Placement["frameStyle"];
    recessed: boolean;
    accent: string;
  }
> = {
  loft: {
    wall: { color: "#f4f1ea", roughness: 0.94 },
    wallAlt: { color: "#e7e1d8", roughness: 0.96 },
    floor: { color: "#4c3c2a", roughness: 0.9, metalness: 0.02 },
    ceiling: { color: "#f6f2eb", roughness: 0.95 },
    frameStyle: "minimal",
    recessed: false,
    accent: "#caa563",
  },
  modern: {
    wall: { color: "#f4f1ea", roughness: 0.94 },
    wallAlt: { color: "#f8f6f0", roughness: 0.95 },
    floor: { color: "#bfb8ad", roughness: 0.95, metalness: 0.0 },
    ceiling: { color: "#f9f7f3", roughness: 0.96 },
    frameStyle: "minimal",
    recessed: false,
    accent: "#7fc9ff",
  },
  castle: {
    wall: { color: "#f1e9dd", roughness: 0.96 },
    wallAlt: { color: "#e2d4c0", roughness: 0.97 },
    floor: { color: "#7f6851", roughness: 0.92, metalness: 0.05 },
    ceiling: { color: "#efe6d8", roughness: 0.95 },
    frameStyle: "minimal",
    recessed: false,
    accent: "#d6b45c",
  },
};

function surfaceSlots(surface: Surface, spacing: number): Array<{ position: [number, number, number]; rotation: [number, number, number] }> {
  const slots: Array<{ position: [number, number, number]; rotation: [number, number, number] }> = [];
  const len = Math.max(0, surface.max - surface.min);
  const edgePad = Math.min(1.8, len * 0.18);
  const min = surface.min + edgePad;
  const max = surface.max - edgePad;
  const usableLen = Math.max(0, max - min);
  const count = Math.max(0, Math.floor(len / spacing) + 1);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const v = usableLen > 0 ? min + t * usableLen : (surface.min + surface.max) / 2;

    if (surface.axis === "z") {
      slots.push({ position: [surface.pos, surface.y, v], rotation: surface.rotation });
    } else {
      slots.push({ position: [v, surface.y, surface.pos], rotation: surface.rotation });
    }
  }

  return slots;
}

function surfaceSlotCount(surface: Surface, spacing: number): number {
  const len = Math.max(0, surface.max - surface.min);
  const edgePad = Math.min(1.8, len * 0.18);
  const usableLen = Math.max(0, len - edgePad * 2);
  return Math.max(1, Math.floor(usableLen / spacing) + 1);
}

function resetMapTransform(map: Texture | null | undefined) {
  if (!map) return;
  map.wrapS = map.wrapT = ClampToEdgeWrapping;
  if (map.repeat.x !== 1 || map.repeat.y !== 1 || map.offset.x !== 0 || map.offset.y !== 0) {
    map.repeat.set(1, 1);
    map.offset.set(0, 0);
    map.needsUpdate = true;
  }
}

function computeSpacing(artworksCount: number, surfaces: Surface[]): number {
  if (artworksCount <= 0) return 3.0;
  const totalLen = surfaces.reduce((sum, s) => sum + Math.max(0, s.max - s.min), 0);
  if (totalLen <= 0) return 3.0;
  const ideal = totalLen / Math.max(artworksCount / 2, 1);
  const minSpacing = 2.3;
  const maxSpacing = 4.2;
  let spacing = clamp(ideal, minSpacing, maxSpacing);
  const slots = surfaces.reduce((sum, s) => sum + surfaceSlotCount(s, spacing), 0);
  if (slots < artworksCount) {
    spacing = Math.max(ideal, 0.9);
  }
  return spacing;
}

function zoneSurfaces(layout: GalleryLayout["zones"][number], entryBuffer: number): Surface[] {
  const { startZ, endZ, width } = layout;
  const halfW = width / 2;
  const centerX = layout.centerX ?? 0;
  const margin = 3.2;
  const y = 1.75;
  const gap = 0.02;
  const doorGap = 4.2;

  const minZ = Math.min(startZ, endZ) + margin;
  const maxZ = Math.max(startZ, endZ) - margin;
  const adjustedMinZ = layout.index === 0 ? minZ + entryBuffer : minZ;
  const minX = centerX - halfW + margin;
  const maxX = centerX + halfW - margin;

  return [
    {
      id: `outer-left-${layout.index}`,
      axis: "z",
      pos: centerX - halfW + gap,
      min: adjustedMinZ,
      max: maxZ,
      y,
      rotation: [0, Math.PI / 2, 0],
    },
    {
      id: `outer-right-${layout.index}`,
      axis: "z",
      pos: centerX + halfW - gap,
      min: adjustedMinZ,
      max: maxZ,
      y,
      rotation: [0, -Math.PI / 2, 0],
    },
    {
      id: `front-left-${layout.index}`,
      axis: "x",
      pos: Math.max(startZ, endZ) - gap,
      min: minX,
      max: centerX - doorGap,
      y,
      rotation: [0, Math.PI, 0],
    },
    {
      id: `front-right-${layout.index}`,
      axis: "x",
      pos: Math.max(startZ, endZ) - gap,
      min: centerX + doorGap,
      max: maxX,
      y,
      rotation: [0, Math.PI, 0],
    },
    {
      id: `back-left-${layout.index}`,
      axis: "x",
      pos: Math.min(startZ, endZ) + gap,
      min: minX,
      max: centerX - doorGap,
      y,
      rotation: [0, 0, 0],
    },
    {
      id: `back-right-${layout.index}`,
      axis: "x",
      pos: Math.min(startZ, endZ) + gap,
      min: centerX + doorGap,
      max: maxX,
      y,
      rotation: [0, 0, 0],
    },
  ];
}

function layoutArtworks(
  artworks: Artwork[],
  layout: GalleryLayout["zones"][number],
  theme: GalleryTheme,
  hallLayouts?: { felixHall?: GalleryLayout["zones"][number] | null; lucaHall?: GalleryLayout["zones"][number] | null },
): Placement[] {
  if (!artworks.length) return [];
  const slots = buildWallSlots(layout, hallLayouts);
  const cfg = THEME_CONFIG[theme];
  const indices = selectSlotIndices(Math.min(artworks.length, slots.length), slots.length);
  const limited = artworks.slice(0, indices.length);
  return limited.map((artwork, i) => {
    const slot = slots[indices[i]];
    return {
      artwork,
      position: slot.position,
      rotation: slot.rotation,
      frameStyle: cfg.frameStyle,
      recessed: cfg.recessed,
    };
  });
}

function layoutArtworksRound(
  artworks: Artwork[],
  layout: GalleryLayout["zones"][number],
  theme: GalleryTheme,
  reservedAngles: number[],
): Placement[] {
  if (!artworks.length) return [];
  const cfg = THEME_CONFIG[theme];
  const radius = layout.width / 2 - 0.32;
  const centerX = layout.centerX ?? 0;
  const centerZ = layout.centerZ;
  const y = 1.75;
  const gap = Math.PI * 0.6;
  const arc = Math.max(0.2, Math.PI * 2 - gap);
  const step = arc / Math.max(artworks.length, 1);
  const start = -arc / 2;
  const reserveWidth = Math.PI / 10;

  const positions: number[] = [];
  for (let i = 0; i < artworks.length; i += 1) {
    let angle = start + i * step;
    for (let k = 0; k < reservedAngles.length; k += 1) {
      const ra = reservedAngles[k];
      const delta = Math.atan2(Math.sin(angle - ra), Math.cos(angle - ra));
      if (Math.abs(delta) < reserveWidth) {
        angle = angle + Math.sign(delta || 1) * reserveWidth;
      }
    }
    positions.push(angle);
  }

  return artworks.map((artwork, i) => {
    const angle = positions[i];
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const rotY = -Math.PI / 2 - angle;
    return {
      artwork,
      position: [x, y, z],
      rotation: [0, rotY, 0],
      frameStyle: cfg.frameStyle,
      recessed: cfg.recessed,
    };
  });
}

function FramePlaceholder({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[1.8, 1.4]} />
        <meshStandardMaterial color="#dcd8cf" roughness={0.85} metalness={0.0} />
      </mesh>
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[2.1, 1.7, 0.12]} />
        <meshStandardMaterial color="#1e1c20" roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  );
}

type WallHole = { center: number; width: number; height: number; centerY: number };
type WallSegment = { width: number; height: number; x: number; y: number };
type WallMaterialProps = {
  color: Color;
  map?: Texture;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
  side?: Side;
};

const DOOR_OPENING = {
  width: 2.4,
  height: 3.4,
  centerY: 1.6,
};
const HALL_ROOM_OPENING_WIDTH = 4.8;

function buildWallSegments(width: number, height: number, holes: WallHole[]): WallSegment[] {
  if (!holes.length) {
    return [{ width, height, x: 0, y: 0 }];
  }
  const topWorld = Math.max(...holes.map((h) => h.centerY + h.height / 2));
  const bottomWorld = Math.min(...holes.map((h) => h.centerY - h.height / 2));
  let topLocal = topWorld - height / 2;
  let bottomLocal = bottomWorld - height / 2;
  topLocal = Math.min(height / 2, topLocal);
  bottomLocal = Math.max(-height / 2, bottomLocal);
  if (topLocal <= bottomLocal) {
    return [{ width, height, x: 0, y: 0 }];
  }
  const segments: WallSegment[] = [];
  const topBandHeight = height / 2 - topLocal;
  if (topBandHeight > 0.01) {
    segments.push({ width, height: topBandHeight, x: 0, y: topLocal + topBandHeight / 2 });
  }
  const bottomBandHeight = bottomLocal + height / 2;
  if (bottomBandHeight > 0.01) {
    segments.push({ width, height: bottomBandHeight, x: 0, y: -height / 2 + bottomBandHeight / 2 });
  }
  const midHeight = topLocal - bottomLocal;
  if (midHeight > 0.01) {
    const sorted = holes
      .map((h) => ({
        left: h.center - h.width / 2,
        right: h.center + h.width / 2,
      }))
      .sort((a, b) => a.left - b.left);
    let cursor = -width / 2;
    sorted.forEach((hole) => {
      const left = Math.max(-width / 2, hole.left);
      const right = Math.min(width / 2, hole.right);
      if (left > cursor) {
        const segWidth = left - cursor;
        segments.push({ width: segWidth, height: midHeight, x: cursor + segWidth / 2, y: (topLocal + bottomLocal) / 2 });
      }
      cursor = Math.max(cursor, right);
    });
    if (cursor < width / 2) {
      const segWidth = width / 2 - cursor;
      segments.push({ width: segWidth, height: midHeight, x: cursor + segWidth / 2, y: (topLocal + bottomLocal) / 2 });
    }
  }
  return segments;
}

function WallWithHoles({
  width,
  height,
  holes,
  position,
  rotation,
  material,
  topBottomMaterial,
  middleMaterial,
  keyPrefix,
  tileMode = "full",
}: {
  width: number;
  height: number;
  holes: WallHole[];
  position: [number, number, number];
  rotation: [number, number, number];
  material: WallMaterialProps;
  topBottomMaterial?: WallMaterialProps;
  middleMaterial?: WallMaterialProps;
  keyPrefix: string;
  tileMode?: "full" | "crop";
}) {
  const segments = buildWallSegments(width, height, holes);
  return (
    <group position={position} rotation={rotation}>
      {segments.map((seg, idx) => {
        const materialForSegment =
          Math.abs(seg.width - width) < 0.01
            ? topBottomMaterial || material
            : middleMaterial || material;
        const updateUv =
          tileMode === "crop"
            ? (geom: unknown) => {
                const x0 = seg.x - seg.width / 2;
                const x1 = seg.x + seg.width / 2;
                const y0 = seg.y - seg.height / 2;
                const y1 = seg.y + seg.height / 2;
                const u0 = (x0 + width / 2) / width;
                const u1 = (x1 + width / 2) / width;
                const v0 = (y0 + height / 2) / height;
                const v1 = (y1 + height / 2) / height;
                const g = geom as PlaneGeometry;
                const uv = g.attributes.uv;
                uv.setXY(0, u0, v1);
                uv.setXY(1, u1, v1);
                uv.setXY(2, u0, v0);
                uv.setXY(3, u1, v0);
                uv.needsUpdate = true;
              }
            : undefined;
        return (
          <mesh key={`${keyPrefix}-${idx}`} position={[seg.x, seg.y, 0]}>
            <planeGeometry args={[seg.width, seg.height]} onUpdate={updateUv} />
          <meshStandardMaterial
            color={materialForSegment.color}
            map={materialForSegment.map}
            roughness={materialForSegment.roughness}
            metalness={materialForSegment.metalness}
            emissive={materialForSegment.emissive}
            emissiveIntensity={materialForSegment.emissiveIntensity}
            side={materialForSegment.side}
          />
          </mesh>
        );
      })}
    </group>
  );
}

const DOOR_TEXTURE_PATH = "/backgrounds/door.jpg";
const LOBBY_DOOR_TEXTURE_PATH = "/backgrounds/lobby-door.jpg";

function DoorPortal({
  position,
  rotation,
  title,
  onEnter,
  texture,
  previewTexture,
  previewTint = "#ffffff",
  openPortal = false,
  portalDepth = 1.8,
  frameOnly = false,
  framedTitle = false,
  showLabel = true,
  frameMap,
  fallbackTexture,
  openingWidth,
  openingHeight,
  badgeSrc,
  badgeSize,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  title: string;
  onEnter: () => void;
  texture?: Texture | null;
  previewTexture?: Texture | null;
  previewTint?: string;
  openPortal?: boolean;
  portalDepth?: number;
  frameOnly?: boolean;
  framedTitle?: boolean;
  showLabel?: boolean;
  frameMap?: Texture | null;
  fallbackTexture?: Texture | null;
  openingWidth?: number;
  openingHeight?: number;
  badgeSrc?: string;
  badgeSize?: number;
}) {
  const groupRef = useRef<Group | null>(null);
  const labelRef = useRef<Group | null>(null);
  const { camera } = useThree();
  const temp = useRef(new Vector3());
  const tempForward = useRef(new Vector3());
  const tempDir = useRef(new Vector3());
  const tempQuat = useRef(new Quaternion());
  const tempLocal = useRef(new Vector3());
  const labelWidth = (openingWidth ?? DOOR_OPENING.width) * 0.6;
  const labelHeight = (openingHeight ?? DOOR_OPENING.height) * 0.9;
  useFrame(() => {
    if (!groupRef.current || !labelRef.current) return;
    if (!showLabel) {
      labelRef.current.visible = false;
      return;
    }
    groupRef.current.getWorldPosition(temp.current);
    const dist = temp.current.distanceTo(camera.position);
    groupRef.current.getWorldQuaternion(tempQuat.current);
    tempForward.current.set(0, 0, 1).applyQuaternion(tempQuat.current);
    tempDir.current.copy(camera.position).sub(temp.current).normalize();
    const facing = tempForward.current.dot(tempDir.current);
    const local = tempLocal.current.copy(camera.position);
    groupRef.current.worldToLocal(local);
    const inFront = local.z > 0.08;
    const within = Math.abs(local.x) < labelWidth && local.y < labelHeight + 0.6 && local.y > -0.2;
    labelRef.current.visible = dist < 1.15 && facing > 0.9 && inFront && within;
  });
  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {(() => {
        const holeW = openingWidth ?? DOOR_OPENING.width;
        const holeH = openingHeight ?? DOOR_OPENING.height;
        const frameT = 0.18;
        const frameD = 0.05;
        const frameOutset = 0.01;
        const outerW = holeW + frameT * 2;
        const outerH = holeH + frameT * 2;
        const doorW = holeW;
        const doorH = holeH;
        const zFrame = frameOutset;
        const zMatte = zFrame - frameD - 0.01;
        const zDoor = zMatte - 0.01;
        const frameColor = frameMap ? "#ffffff" : "#0a0a0a";
        return (
          <>
            {/* frame */}
            <mesh position={[0, outerH / 2 - frameT / 2, zFrame]}>
              <boxGeometry args={[outerW, frameT, frameD]} />
              <meshStandardMaterial
                color={frameColor}
                map={frameMap || undefined}
                roughness={0.6}
                metalness={0.05}
                emissive="#000000"
                emissiveIntensity={0.0}
              />
            </mesh>
            <mesh position={[0, -outerH / 2 + frameT / 2, zFrame]}>
              <boxGeometry args={[outerW, frameT, frameD]} />
              <meshStandardMaterial
                color={frameColor}
                map={frameMap || undefined}
                roughness={0.6}
                metalness={0.05}
                emissive="#000000"
                emissiveIntensity={0.0}
              />
            </mesh>
            <mesh position={[-outerW / 2 + frameT / 2, 0, zFrame]}>
              <boxGeometry args={[frameT, doorH, frameD]} />
              <meshStandardMaterial
                color={frameColor}
                map={frameMap || undefined}
                roughness={0.6}
                metalness={0.05}
                emissive="#000000"
                emissiveIntensity={0.0}
              />
            </mesh>
            <mesh position={[outerW / 2 - frameT / 2, 0, zFrame]}>
              <boxGeometry args={[frameT, doorH, frameD]} />
              <meshStandardMaterial
                color={frameColor}
                map={frameMap || undefined}
                roughness={0.6}
                metalness={0.05}
                emissive="#000000"
                emissiveIntensity={0.0}
              />
            </mesh>
            {frameOnly ? null : openPortal ? (
              <>
                <mesh position={[0, 0, -portalDepth / 2]}>
                  <boxGeometry args={[doorW, doorH, portalDepth]} />
                  <meshStandardMaterial
                    color={previewTint}
                    map={previewTexture || fallbackTexture || undefined}
                    roughness={0.85}
                    metalness={0.0}
                    emissive="#0f0f0f"
                    emissiveIntensity={0.25}
                    side={BackSide}
                  />
                </mesh>
                <mesh position={[0, 0, -portalDepth + 0.02]}>
                  <planeGeometry args={[doorW * 0.96, doorH * 0.96]} />
                  <meshStandardMaterial
                    color={previewTint}
                    map={previewTexture || fallbackTexture || undefined}
                    roughness={0.9}
                    metalness={0.0}
                    emissive="#121212"
                    emissiveIntensity={0.2}
                    transparent
                    opacity={0.98}
                    side={DoubleSide}
                  />
                </mesh>
              </>
            ) : previewTexture ? (
              <>
                <mesh position={[0, 0, zMatte]}>
                  <planeGeometry args={[doorW + 0.18, doorH + 0.18]} />
                  <meshBasicMaterial color="#0a0a0a" />
                </mesh>
                <mesh position={[0, 0, zDoor]}>
                  <planeGeometry args={[doorW, doorH]} />
                  <meshStandardMaterial
                    color={previewTint}
                    map={previewTexture}
                    roughness={0.75}
                    metalness={0.0}
                    emissive="#121212"
                    emissiveIntensity={0.35}
                    transparent
                    opacity={0.95}
                    side={DoubleSide}
                  />
                </mesh>
              </>
            ) : (
              <>
                {/* matte */}
                <mesh position={[0, 0, zMatte]}>
                  <planeGeometry args={[doorW + 0.15, doorH + 0.15]} />
                  <meshBasicMaterial color="#111111" />
                </mesh>
                {/* door image */}
                <mesh position={[0, 0, zDoor]}>
                  <planeGeometry args={[doorW, doorH]} />
                  <meshBasicMaterial color="#ffffff" map={texture || fallbackTexture || undefined} side={DoubleSide} />
                </mesh>
              </>
            )}
          </>
        );
      })()}
      <group ref={labelRef} position={[0, 2.35, 0.2]}>
        {badgeSrc ? (
          <Html
            center
            transform
            distanceFactor={7.0}
            position={[0, 0.6, 0]}
            occlude
            style={{ pointerEvents: "none" }}
          >
            <img
              src={badgeSrc}
              alt="Wappen"
              style={{ width: badgeSize ?? 72, height: badgeSize ?? 72, objectFit: "contain" }}
            />
          </Html>
        ) : null}
        <Html center transform distanceFactor={7.0} occlude style={{ pointerEvents: "none" }}>
          <div
            style={{
              padding: framedTitle ? "8px 10px 7px" : "0",
              border: framedTitle ? "1px solid rgba(255,255,255,0.8)" : undefined,
              borderRadius: framedTitle ? 10 : undefined,
              background: framedTitle ? "rgba(0,0,0,0.35)" : undefined,
              color: "rgba(255,255,255,0.96)",
              fontSize: 12,
              fontFamily: "var(--font-display)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textAlign: "center",
              textShadow: "0 6px 16px rgba(0,0,0,0.55)",
              minWidth: 140,
            }}
          >
            <div style={{ fontWeight: 600 }}>{title}</div>
            <div style={{ width: 48, height: 1, background: "rgba(255,255,255,0.65)", margin: "6px auto 0" }} />
          </div>
        </Html>
      </group>
    </group>
  );
}

function DoorTunnel({
  position,
  rotation = [0, 0, 0],
  width,
  height,
  depth,
  thickness = 0.18,
  color = "#0a0a0a",
  frameMap,
  surfaceMap,
  floorMap,
  ceilingMap,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  width: number;
  height: number;
  depth: number;
  thickness?: number;
  color?: string;
  frameMap?: Texture | null;
  surfaceMap?: Texture | null;
  floorMap?: Texture | null;
  ceilingMap?: Texture | null;
}) {
  const outerW = width + thickness * 2;
  const outerH = height + thickness * 2;
  const frameColor = frameMap ? "#ffffff" : color;
  const tunnelDepth = Math.max(0.04, depth - 0.04);
  const tunnelInset = 0.08;
  const insetW = Math.max(0.04, outerW - tunnelInset);
  const insetH = Math.max(0.04, outerH - tunnelInset);
  const insetOffset = tunnelInset / 4;
  const tunnelMap = floorMap || surfaceMap || ceilingMap || frameMap || undefined;
  const sharedMaterialProps = {
    color: tunnelMap ? "#ffffff" : frameColor,
    map: tunnelMap,
    roughness: 0.6,
    metalness: 0.05,
  };
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, outerH / 2 - thickness / 2 - insetOffset, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[insetW, tunnelDepth]} />
        <meshStandardMaterial {...sharedMaterialProps} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -outerH / 2 + thickness / 2 + insetOffset, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[insetW, tunnelDepth]} />
        <meshStandardMaterial {...sharedMaterialProps} side={DoubleSide} />
      </mesh>
      <mesh position={[-outerW / 2 + thickness / 2 + insetOffset, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[tunnelDepth, insetH]} />
        <meshStandardMaterial {...sharedMaterialProps} side={DoubleSide} />
      </mesh>
      <mesh position={[outerW / 2 - thickness / 2 - insetOffset, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[tunnelDepth, insetH]} />
        <meshStandardMaterial {...sharedMaterialProps} side={DoubleSide} />
      </mesh>
    </group>
  );
}

function GuideSprite({
  guideRef,
  texture,
  aspect,
  onSelect,
  suppressSpeech = false,
  height,
  speechLines,
  showSpeech = true,
  shadowRadius = 0.77,
}: {
  guideRef: React.MutableRefObject<ArtistGuideRuntime>;
  texture: Texture | null;
  aspect: number;
  onSelect?: (artistId: string) => void;
  suppressSpeech?: boolean;
  height: number;
  speechLines?: { title: string; body: string; hint?: string };
  showSpeech?: boolean;
  shadowRadius?: number;
}) {
  const groupRef = useRef<Group | null>(null);
  const [visible, setVisible] = useState(false);
  const [showSpeechState, setShowSpeechState] = useState(false);
  const lastVisible = useRef(false);
  const lastSpeech = useRef(false);
  const spriteHeight = height;
  const width = Math.max(0.4, spriteHeight * aspect);
  const spriteRef = useRef<Group | null>(null);
  const handleSelect = () => onSelect?.(guideRef.current.artistId);

  useFrame(() => {
    const guide = guideRef.current;
    const group = groupRef.current;
    if (!group) return;
    if (guide.active !== lastVisible.current) {
      lastVisible.current = guide.active;
      setVisible(guide.active);
    }
    const speech = showSpeech && guide.active && (guide.phase === "idle" || guide.phase === "roam") && !suppressSpeech;
    if (speech !== lastSpeech.current) {
      lastSpeech.current = speech;
      setShowSpeechState(speech);
    }
    if (!guide.active) return;
    const wobble = Math.sin(guide.swayPhase);
    group.position.set(guide.position.x, guide.position.y, guide.position.z);
    group.rotation.y = (Math.PI / 18) * wobble;
    if (spriteRef.current) {
      spriteRef.current.rotation.z = (Math.PI / 24) * wobble;
    }
  });

  return (
    <group ref={groupRef} visible={visible}>
      <Billboard>
        <group ref={spriteRef}>
          <mesh position={[0, spriteHeight / 2, 0]} onClick={handleSelect}>
            <planeGeometry args={[width, spriteHeight]} />
            <meshBasicMaterial
              map={texture || undefined}
              color={texture ? "#ffffff" : "#cccccc"}
              transparent
              alphaTest={0.1}
            />
          </mesh>
        </group>
      </Billboard>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[shadowRadius, 20]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
      {showSpeechState ? (
        <Billboard position={[0, spriteHeight + 0.2, 0]}>
          <Html center transform distanceFactor={7.0} style={{ pointerEvents: "auto" }}>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(0,0,0,0.65)",
                color: "white",
                fontSize: 12,
                textAlign: "center",
                maxWidth: 220,
                lineHeight: 1.35,
              }}
              onClick={handleSelect}
            >
              <div style={{ fontWeight: 600 }}>{speechLines?.title}</div>
              <div style={{ marginTop: 4 }}>{speechLines?.body}</div>
              {speechLines?.hint ? (
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>{speechLines.hint}</div>
              ) : null}
            </div>
          </Html>
        </Billboard>
      ) : null}
    </group>
  );
}

function LaserLine({
  getSegment,
  color,
}: {
  getSegment: () => { start: Vector3; end: Vector3; visible: boolean };
  color: string;
}) {
  const groupRef = useRef<Group | null>(null);
  const dirRef = useRef(new Vector3());
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const { start, end, visible } = getSegment();
    group.visible = visible;
    if (!visible) return;
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = dirRef.current.copy(end).sub(start);
    const len = Math.max(0.01, dir.length());
    dir.normalize();
    group.position.copy(mid);
    group.scale.set(1, len, 1);
    group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <cylinderGeometry args={[0.08, 0.08, 1, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.045, 0.045, 1, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.98} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function EnemySprite({
  runtimeRef,
  index,
  texture,
  aspect,
  down = false,
}: {
  runtimeRef: React.MutableRefObject<EnemyRuntime[]>;
  index: number;
  texture: Texture | null;
  aspect: number;
  down?: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  const spriteRef = useRef<Group | null>(null);
  const height = 2.3;
  const width = Math.max(0.5, height * aspect);
  useFrame(() => {
    const enemy = runtimeRef.current[index];
    if (!enemy || !groupRef.current) return;
    groupRef.current.position.copy(enemy.position);
    groupRef.current.rotation.set(0, 0, 0);
    if (!down) {
      const wobble = Math.sin(enemy.phase);
      if (spriteRef.current) {
        spriteRef.current.rotation.z = (Math.PI / 22) * wobble;
      }
    }
  });
  return (
    <group ref={groupRef}>
      {down ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture || undefined} color={texture ? "#ffffff" : "#cccccc"} transparent alphaTest={0.1} />
        </mesh>
      ) : (
        <Billboard>
          <group ref={spriteRef}>
            <mesh position={[0, height / 2, 0]}>
              <planeGeometry args={[width, height]} />
              <meshBasicMaterial map={texture || undefined} color={texture ? "#ffffff" : "#cccccc"} transparent alphaTest={0.1} />
            </mesh>
          </group>
        </Billboard>
      )}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.75, 18]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

function AdFrame({
  position,
  rotation,
  label,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  label: string;
}) {
  const height = 1.75;
  const width = 2.3;
  const frameDepth = 0.14;
  const frameBorder = 0.22;
  const planeZ = frameDepth / 2 + 0.02;
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.0]}>
        <boxGeometry args={[width + frameBorder, height + frameBorder, frameDepth]} />
        <meshStandardMaterial color="#1a1a20" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0, planeZ]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#f2efe7" roughness={0.9} metalness={0.0} />
      </mesh>
      <Html
        center
        transform
        distanceFactor={7.0}
        position={[0, 0, planeZ + 0.01]}
        occlude
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            padding: "6px 8px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.55)",
            color: "white",
            fontSize: 12,
            textAlign: "center",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontFamily: "var(--font-display)",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

export function GalleryScene({
  gallery,
  artworks,
  activeZoneIndex,
  preloadZoneIndex,
  preloadZoneIds,
  quality = "default",
  interactionMode = "click",
  artistGuideRef,
  directorGuideRef,
  suppressArtistSpeech = false,
  suppressDirectorSpeech = false,
  onSelectArtist,
  onSelectDirector,
  onSelectArtwork,
  onFrameLoaded,
  onWallLoaded,
  onShooterUpdate,
  shooterResetToken = 0,
  onNavigateTo,
}: {
  gallery: MuseumGallery;
  artworks: Artwork[];
  activeZoneIndex: number;
  preloadZoneIndex?: number | null;
  preloadZoneIds?: number[];
  quality?: "default" | "safari";
  interactionMode?: "click" | "keyboard";
  artistGuideRef?: React.MutableRefObject<ArtistGuideRuntime>;
  directorGuideRef?: React.MutableRefObject<ArtistGuideRuntime>;
  suppressArtistSpeech?: boolean;
  suppressDirectorSpeech?: boolean;
  onSelectArtist?: (artistId: string) => void;
  onSelectDirector?: (id: string) => void;
  onSelectArtwork: (
    artworkId: string,
    focus: { position: [number, number, number]; rotation: [number, number, number]; width: number; height: number },
  ) => void;
  onFrameLoaded?: (zoneIndex: number) => void;
  onWallLoaded?: (zoneIndex: number) => void;
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
  onNavigateTo: (point: [number, number, number]) => void;
}) {
  const { camera } = useThree();
  const [wallTextures, setWallTextures] = useState<Record<string, Texture>>({});
  const wallTexturesRef = useRef<Record<string, Texture>>({});
  const [floorTextures, setFloorTextures] = useState<Record<string, Texture>>({});
  const floorTexturesRef = useRef<Record<string, Texture>>({});
  const [ceilingTextures, setCeilingTextures] = useState<Record<string, Texture>>({});
  const ceilingTexturesRef = useRef<Record<string, Texture>>({});
  const [doorTexture, setDoorTexture] = useState<Texture | null>(null);
  const [lobbyDoorTexture, setLobbyDoorTexture] = useState<Texture | null>(null);
  const [lobbyVideoTexture, setLobbyVideoTexture] = useState<Texture | null>(null);
  const [doorFrameTexture, setDoorFrameTexture] = useState<Texture | null>(null);
  const [wappenTexture, setWappenTexture] = useState<Texture | null>(null);
  const [wappenAspect, setWappenAspect] = useState(1);
  const [artistSpriteTextures, setArtistSpriteTextures] = useState<Array<Texture | null>>([]);
  const [artistSpriteAspects, setArtistSpriteAspects] = useState<number[]>([]);
  const [lucaSpriteTexture, setLucaSpriteTexture] = useState<Texture | null>(null);
  const [lucaSpriteAspect, setLucaSpriteAspect] = useState(0.65);
  const enemiesRef = useRef<EnemyRuntime[]>([]);
  const [enemyAlive, setEnemyAlive] = useState<boolean[]>([]);
  const [score, setScore] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const playerDeadRef = useRef(false);
  const [playerDead, setPlayerDead] = useState(false);
  const [playerHits, setPlayerHits] = useState(0);
  const playerHitsRef = useRef(0);
  const maxHealth = 30;
  const [playerHealth, setPlayerHealth] = useState(maxHealth);
  const playerHealthRef = useRef(maxHealth);
  const healthRegenRef = useRef(0);
  const playerHitCooldownRef = useRef(0);
  const playerLaserRef = useRef<{
    timer: number;
    duration: number;
    delayTimer: number;
    origin: Vector3;
    dir: Vector3;
    maxDist: number;
  }>({
    timer: 0,
    duration: 0.6,
    delayTimer: 0,
    origin: new Vector3(),
    dir: new Vector3(0, 0, -1),
    maxDist: 26,
  });
  const pendingEnemyHitsRef = useRef<{ index: number; timer: number }[]>([]);
  const lastShooterInfoRef = useRef<{
    active: boolean;
    score: number;
    total: number;
    playerHits: number;
    health: number;
    healthMax: number;
    dead: boolean;
    gameWon: boolean;
  }>({
    active: false,
    score: 0,
    total: 0,
    playerHits: 0,
    health: maxHealth,
    healthMax: maxHealth,
    dead: false,
    gameWon: false,
  });
  const exampleActiveRef = useRef(false);
  const [directorSpriteTexture, setDirectorSpriteTexture] = useState<Texture | null>(null);
  const [directorSpriteAspect, setDirectorSpriteAspect] = useState(0.65);
  const lobbyVideoTextureRef = useRef<Texture | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const [fallbackDoorTexture, setFallbackDoorTexture] = useState<Texture | null>(null);
  const lobbyFloorTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const tiles = 8;
    const tile = size / tiles;
    for (let y = 0; y < tiles; y += 1) {
      for (let x = 0; x < tiles; x += 1) {
        const isDark = (x + y) % 2 === 0;
        ctx.fillStyle = isDark ? "#2b2b2f" : "#e6e2d9";
        ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }
    const texture = new CanvasTexture(canvas);
    (texture as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(6, 6);
    texture.needsUpdate = true;
    return texture;
  }, []);
  const reportedWallsRef = useRef<Record<string, boolean>>({});
  const reportedDoorsRef = useRef<Record<string, boolean>>({});
  const zoneCounts = useMemo(() => {
    const counts = new Array(gallery.zones.length).fill(0);
    const hasFilters = gallery.zones.some((z) => z.categoryFilter && z.categoryFilter.length);
    if (hasFilters) {
      gallery.zones.forEach((z, idx) => {
        if (!z.categoryFilter?.length) {
          counts[idx] = 0;
          return;
        }
        const list = artworks.filter((a) => z.categoryFilter?.includes(a.category));
        counts[idx] = z.maxArtworks ? Math.min(z.maxArtworks, list.length) : list.length;
      });
      return counts;
    }
    for (const a of artworks) {
      const idx = typeof a.zoneId === "number" ? a.zoneId : 0;
      if (idx >= 0 && idx < counts.length) counts[idx] += 1;
    }
    gallery.zones.forEach((z, idx) => {
      if (typeof z.maxArtworks === "number") counts[idx] = Math.min(counts[idx], z.maxArtworks);
    });
    return counts;
  }, [artworks, gallery.zones]);
  const layout = useMemo(() => computeGalleryLayout(gallery, zoneCounts), [gallery, zoneCounts]);
  const isExampleRoom = useMemo(() => {
    const zone = layout.zones[activeZoneIndex];
    return zone?.zone.artistId === "example-room";
  }, [layout.zones, activeZoneIndex]);

  const onWallLoadedRef = useRef(onWallLoaded);
  useEffect(() => {
    onWallLoadedRef.current = onWallLoaded;
  }, [onWallLoaded]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size * 1.5;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#e6e6e6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#c7c7c7";
    ctx.fillRect(18, 18, canvas.width - 36, canvas.height - 36);
    ctx.fillStyle = "#b0b0b0";
    ctx.fillRect(canvas.width / 2 - 10, canvas.height / 2 - 22, 20, 44);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    setFallbackDoorTexture(tex);
    return () => tex.dispose();
  }, []);

  useEffect(() => {
    return () => {
      if (lobbyFloorTexture) lobbyFloorTexture.dispose();
      Object.values(wallTexturesRef.current).forEach((t) => t.dispose());
      wallTexturesRef.current = {};
      setWallTextures({});
      Object.values(floorTexturesRef.current).forEach((t) => t.dispose());
      floorTexturesRef.current = {};
      setFloorTextures({});
      Object.values(ceilingTexturesRef.current).forEach((t) => t.dispose());
      ceilingTexturesRef.current = {};
      setCeilingTextures({});
      if (lobbyVideoTextureRef.current) {
        lobbyVideoTextureRef.current.dispose();
        lobbyVideoTextureRef.current = null;
      }
      if (lobbyVideoRef.current) {
        const v = lobbyVideoRef.current;
        v.pause();
        v.removeAttribute("src");
        v.load();
        lobbyVideoRef.current = null;
      }
    };
  }, [lobbyFloorTexture]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;
    const video = document.createElement("video");
    video.src = LOBBY_VIDEO_SRC;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const texture = new VideoTexture(video);
    (texture as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    lobbyVideoRef.current = video;
    lobbyVideoTextureRef.current = texture;
    setLobbyVideoTexture(texture);

    const start = () => {
      if (cancelled) return;
      video.play().catch(() => {});
    };
    video.addEventListener("loadedmetadata", start);
    video.addEventListener("canplay", start);
    start();

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", start);
      video.removeEventListener("canplay", start);
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
      if (lobbyVideoRef.current === video) {
        lobbyVideoRef.current = null;
      }
    };
  }, []);

  // wall/floor/ceiling textures are loaded later based on visible/preload zones

  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    let tex: Texture | null = null;
    loader.load(
      "/backgrounds/lobby-floor.jpg",
      (loaded) => {
        if (!alive) {
          loaded.dispose();
          return;
        }
        (loaded as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
        loaded.wrapS = loaded.wrapT = RepeatWrapping;
        loaded.repeat.set(2, 2);
        loaded.needsUpdate = true;
        tex = loaded;
        setDoorFrameTexture(loaded);
      },
      undefined,
      () => {
        setDoorFrameTexture(null);
      },
    );
    return () => {
      alive = false;
      if (tex) tex.dispose();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    let tex: Texture | null = null;
    loader.load(
      "/artist/wappen.png",
      (loaded) => {
        if (!alive) {
          loaded.dispose();
          return;
        }
        (loaded as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
        loaded.wrapS = loaded.wrapT = ClampToEdgeWrapping;
        loaded.needsUpdate = true;
        tex = loaded;
        setWappenTexture(loaded);
        const img = loaded.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) {
          setWappenAspect(img.width / img.height);
        }
      },
      undefined,
      () => {
        setWappenTexture(null);
      },
    );
    return () => {
      alive = false;
      if (tex) tex.dispose();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    let baseTex: Texture | null = null;
    let lobbyTex: Texture | null = null;
    const reportDoor = (key: string) => {
      if (reportedDoorsRef.current[key]) return;
      reportedDoorsRef.current[key] = true;
      onWallLoadedRef.current?.(0);
    };
    const applyTex = (tex: Texture) => {
      (tex as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
      tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
      tex.repeat.set(1, 1);
      tex.rotation = 0;
    };
    loader.load(
      DOOR_TEXTURE_PATH,
      (tex) => {
        if (!alive) {
          tex.dispose();
          return;
        }
        applyTex(tex);
        baseTex = tex;
        setDoorTexture(tex);
        reportDoor(DOOR_TEXTURE_PATH);
      },
      undefined,
      () => {
        setDoorTexture(null);
        reportDoor(DOOR_TEXTURE_PATH);
      },
    );
    loader.load(
      LOBBY_DOOR_TEXTURE_PATH,
      (tex) => {
        if (!alive) {
          tex.dispose();
          return;
        }
        applyTex(tex);
        lobbyTex = tex;
        setLobbyDoorTexture(tex);
        reportDoor(LOBBY_DOOR_TEXTURE_PATH);
      },
      undefined,
      () => {
        setLobbyDoorTexture(null);
        reportDoor(LOBBY_DOOR_TEXTURE_PATH);
      },
    );
    return () => {
      alive = false;
      if (baseTex) baseTex.dispose();
      if (lobbyTex) lobbyTex.dispose();
      setDoorTexture(null);
      setLobbyDoorTexture(null);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    const sources = [
      "/artist/felixCartoon.png",
      "/artist/felixCartoon2.png",
      "/artist/felixCartoon3.png",
      "/artist/felixCartoon4.png",
      "/artist/felixCartoon5.png",
      "/artist/felixCartoon6.png",
    ];
    const textures: Array<Texture | null> = new Array(sources.length).fill(null);
    const aspects: number[] = new Array(sources.length).fill(0.65);
    const disposables: Texture[] = [];

    sources.forEach((src, idx) => {
      loader.load(
        src,
        (tex) => {
          if (!alive) {
            tex.dispose();
            return;
          }
          (tex as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
          tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
          tex.needsUpdate = true;
          disposables.push(tex);
          textures[idx] = tex;
          const img = tex.image as { width?: number; height?: number } | undefined;
          if (img?.width && img?.height) {
            aspects[idx] = img.width / img.height;
          }
          setArtistSpriteTextures([...textures]);
          setArtistSpriteAspects([...aspects]);
        },
        undefined,
        () => {
          textures[idx] = null;
          setArtistSpriteTextures([...textures]);
        },
      );
    });

    return () => {
      alive = false;
      disposables.forEach((tex) => tex.dispose());
      setArtistSpriteTextures([]);
      setArtistSpriteAspects([]);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    let spriteTex: Texture | null = null;
    loader.load(
      "/artist/luca/lucaCartoon.png",
      (tex) => {
        if (!alive) {
          tex.dispose();
          return;
        }
        (tex as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
        tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
        tex.needsUpdate = true;
        spriteTex = tex;
        setLucaSpriteTexture(tex);
        const img = tex.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) {
          setLucaSpriteAspect(img.width / img.height);
        }
      },
      undefined,
      () => {
        setLucaSpriteTexture(null);
      },
    );
    return () => {
      alive = false;
      if (spriteTex) spriteTex.dispose();
      setLucaSpriteTexture(null);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    let spriteTex: Texture | null = null;
    loader.load(
      "/artist/lobbyCartoon.png",
      (tex) => {
        if (!alive) {
          tex.dispose();
          return;
        }
        (tex as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
        tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
        tex.needsUpdate = true;
        spriteTex = tex;
        setDirectorSpriteTexture(tex);
        const img = tex.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) {
          setDirectorSpriteAspect(img.width / img.height);
        }
      },
      undefined,
      () => {
        setDirectorSpriteTexture(null);
      },
    );
    return () => {
      alive = false;
      if (spriteTex) spriteTex.dispose();
      setDirectorSpriteTexture(null);
    };
  }, []);

  const artworksByZone = useMemo(() => {
    return buildArtworksByZone(gallery, artworks);
  }, [gallery, artworks]);

  const hallIndex = useMemo(() => layout.zones.findIndex((z) => z.zone.id === "felix-hall"), [layout.zones]);
  const lucaHallIndex = useMemo(() => layout.zones.findIndex((z) => z.zone.id === "luca-hall"), [layout.zones]);
  const felixRange = useMemo(() => artistRoomRanges.find((r) => r.artistId === "felix"), []);
  const lucaRange = useMemo(() => artistRoomRanges.find((r) => r.artistId === "luca"), []);
  const hallLayout = hallIndex >= 0 ? layout.zones[hallIndex] : null;
  const lucaHallLayout = lucaHallIndex >= 0 ? layout.zones[lucaHallIndex] : null;
  const resolveHallSide = useCallback(
    (room: typeof layout.zones[number] | undefined | null, hall: typeof layout.zones[number] | undefined | null) => {
      if (!room || !hall) return null;
      const dx = (room.centerX ?? 0) - (hall.centerX ?? 0);
      const dz = (room.centerZ ?? 0) - (hall.centerZ ?? 0);
      if (Math.abs(dx) > 0.6) {
        return dx > 0 ? "right" : "left";
      }
      return dz < 0 ? "front" : "back";
    },
    [],
  );
  const toRoomSide = useCallback((hallSide: string | null) => {
    if (hallSide === "left") return "right";
    if (hallSide === "right") return "left";
    return hallSide;
  }, []);
  const hallWallRepeats = useMemo(() => {
    const repeats: Record<string, { left?: Texture; right?: Texture }> = {};
    const build = (base: Texture | undefined, repeatX: number) => {
      if (!base) return undefined;
      const clone = base.clone();
      clone.wrapS = RepeatWrapping;
      clone.wrapT = ClampToEdgeWrapping;
      clone.repeat.set(Math.max(1, repeatX), 1);
      clone.needsUpdate = true;
      return clone;
    };
    const makeForZone = (zoneId: string | undefined, leftCount: number, rightCount: number) => {
      if (!zoneId) return;
      const left = wallTextures[`${zoneId}-left`] || wallTextures[zoneId];
      const right = wallTextures[`${zoneId}-right`] || wallTextures[zoneId];
      const leftClone = build(left, leftCount);
      const rightClone = build(right, rightCount);
      if (leftClone || rightClone) {
        repeats[zoneId] = { left: leftClone, right: rightClone };
      }
    };
    if (hallIndex >= 0) {
      const zoneId = layout.zones[hallIndex]?.zone.id;
      let leftCount = 1;
      let rightCount = 1;
      if (felixRange && hallLayout) {
        let left = 0;
        let right = 0;
        for (let i = 0; i < felixRange.count; i += 1) {
          const roomLayout = layout.zones[felixRange.startIndex + i];
          if (!roomLayout) continue;
          const side = resolveHallSide(roomLayout, hallLayout);
          if (side === "left") left += 1;
          if (side === "right") right += 1;
        }
        leftCount = Math.max(1, left);
        rightCount = Math.max(1, right);
      }
      makeForZone(zoneId, leftCount, rightCount);
    }
    if (lucaHallIndex >= 0) {
      const zoneId = layout.zones[lucaHallIndex]?.zone.id;
      const leftCount = Math.max(1, lucaRange?.count ?? 1);
      const rightCount = 1;
      makeForZone(zoneId, leftCount, rightCount);
    }
    return repeats;
  }, [wallTextures, hallIndex, lucaHallIndex, felixRange, lucaRange, layout.zones, hallLayout, resolveHallSide]);

  useEffect(() => {
    return () => {
      Object.values(hallWallRepeats).forEach((entry) => {
        entry.left?.dispose();
        entry.right?.dispose();
      });
    };
  }, [hallWallRepeats]);
  const felixRoomDoorLabels = useMemo(() => {
    if (!felixRange) return [];
    return Array.from({ length: felixRange.count }, (_, i) => {
      const zoneIdx = felixRange.startIndex + i;
      const list = artworksByZone[zoneIdx] || [];
      const years = list.map((a) => a.year).filter((y): y is number => typeof y === "number");
      const unique = Array.from(new Set(years)).sort((a, b) => a - b);
      let yearLabel = "";
      if (unique.length === 1) yearLabel = `${unique[0]}`;
      else if (unique.length === 2) yearLabel = `${unique[0]}/${unique[1]}`;
      else if (unique.length >= 3) yearLabel = `${unique[0]}–${unique[unique.length - 1]}`;
      const roomLayout = layout.zones[zoneIdx];
      const side = resolveHallSide(roomLayout, hallLayout);
      return {
        zoneIdx,
        roomNumber: i + 1,
        label: `Raum ${i + 1}${yearLabel ? ` · ${yearLabel}` : ""}`,
        centerZ: roomLayout?.centerZ ?? 0,
        side,
      };
    });
  }, [felixRange, artworksByZone, layout.zones, hallLayout, resolveHallSide]);

  const felixNeighbors = useMemo(() => {
    const map = new Map<number, { prev?: number; next?: number }>();
    if (!felixRange || !hallLayout) return map;
    const groups = new Map<string, Array<{ idx: number; z: number }>>();
    for (let i = 0; i < felixRange.count; i += 1) {
      const idx = felixRange.startIndex + i;
      const room = layout.zones[idx];
      if (!room) continue;
      const side = resolveHallSide(room, hallLayout) ?? "none";
      const list = groups.get(side) || [];
      list.push({ idx, z: room.centerZ });
      groups.set(side, list);
    }
    groups.forEach((list) => {
      list.sort((a, b) => b.z - a.z);
      list.forEach((entry, i) => {
        const link = map.get(entry.idx) || {};
        if (i > 0) link.prev = list[i - 1].idx;
        if (i < list.length - 1) link.next = list[i + 1].idx;
        map.set(entry.idx, link);
      });
    });
    return map;
  }, [felixRange, hallLayout, layout.zones, resolveHallSide]);

  const lucaRoomDoorLabels = useMemo(() => {
    if (!lucaRange) return [];
    return Array.from({ length: lucaRange.count }, (_, i) => {
      const zoneIdx = lucaRange.startIndex + i;
      const list = artworksByZone[zoneIdx] || [];
      const years = list.map((a) => a.year).filter((y): y is number => typeof y === "number");
      const unique = Array.from(new Set(years)).sort((a, b) => a - b);
      let yearLabel = "";
      if (unique.length === 1) yearLabel = `${unique[0]}`;
      else if (unique.length === 2) yearLabel = `${unique[0]}/${unique[1]}`;
      else if (unique.length >= 3) yearLabel = `${unique[0]}–${unique[unique.length - 1]}`;
      const roomLayout = layout.zones[zoneIdx];
      return {
        zoneIdx,
        roomNumber: i + 1,
        label: `Raum ${i + 1}${yearLabel ? ` · ${yearLabel}` : ""}`,
        centerZ: roomLayout?.centerZ ?? 0,
      };
    });
  }, [lucaRange, artworksByZone, layout.zones]);

  const getZonePreviewTexture = useCallback(
    (zoneIndex: number): Texture | null => {
      const zone = layout.zones[zoneIndex]?.zone;
      if (!zone) return null;
      return (
        wallTextures[zone.id] ||
        wallTextures[`${zone.id}-alt`] ||
        wallTextures[`${zone.id}-front`] ||
        floorTextures[`${zone.id}-floor`] ||
        null
      );
    },
    [layout.zones, wallTextures, floorTextures],
  );

  const felixDoorPreview = useMemo(() => {
    if (!felixRange) return null;
    return getZonePreviewTexture(felixRange.startIndex);
  }, [felixRange, getZonePreviewTexture]);


  const rangeByZoneIndex = useMemo(() => {
    const map = new Map<number, { artistId: string; artistName: string; bioPdf?: string; startIndex: number; count: number }>();
    artistRoomRanges.forEach((range) => {
      for (let i = 0; i < range.count; i += 1) {
        map.set(range.startIndex + i, range);
      }
    });
    return map;
  }, []);

  const activeArtistSprite = useMemo(() => {
    if (hallIndex >= 0 && activeZoneIndex === hallIndex) {
      const idx = Math.min(4, Math.max(0, artistSpriteTextures.length - 1));
      return {
        texture: artistSpriteTextures[idx] || artistSpriteTextures[0] || null,
        aspect: artistSpriteAspects[idx] || artistSpriteAspects[0] || 0.65,
      };
    }
    if (lucaHallIndex >= 0 && activeZoneIndex === lucaHallIndex) {
      return {
        texture: lucaSpriteTexture || artistSpriteTextures[0] || null,
        aspect: lucaSpriteAspect || artistSpriteAspects[0] || 0.65,
      };
    }
    const range = rangeByZoneIndex.get(activeZoneIndex);
    if (range?.artistId === "luca") {
      return {
        texture: lucaSpriteTexture || artistSpriteTextures[0] || null,
        aspect: lucaSpriteAspect || artistSpriteAspects[0] || 0.65,
      };
    }
    if (!range || !range.artistId?.includes("felix")) {
      return {
        texture: artistSpriteTextures[0] || null,
        aspect: artistSpriteAspects[0] || 0.65,
      };
    }
    const offset = Math.max(0, activeZoneIndex - range.startIndex);
    const count = artistSpriteTextures.length || 1;
    const idx = count > 0 ? offset % count : 0;
    return {
      texture: artistSpriteTextures[idx] || artistSpriteTextures[0] || null,
      aspect: artistSpriteAspects[idx] || artistSpriteAspects[0] || 0.65,
    };
  }, [
    activeZoneIndex,
    rangeByZoneIndex,
    artistSpriteTextures,
    artistSpriteAspects,
    lucaSpriteTexture,
    lucaSpriteAspect,
  ]);

  const enemyAliveRef = useRef<boolean[]>([]);
  const gameWonRef = useRef(false);
  useEffect(() => {
    enemyAliveRef.current = enemyAlive;
  }, [enemyAlive]);
  useEffect(() => {
    gameWonRef.current = gameWon;
  }, [gameWon]);
  useEffect(() => {
    playerDeadRef.current = playerDead;
  }, [playerDead]);
  useEffect(() => {
    playerHitsRef.current = playerHits;
  }, [playerHits]);
  useEffect(() => {
    playerHealthRef.current = playerHealth;
  }, [playerHealth]);
  useEffect(() => {
    playerHitsRef.current = playerHits;
  }, [playerHits]);

  const emitShooterInfo = (info: {
    active: boolean;
    score: number;
    total: number;
    playerHits: number;
    health: number;
    healthMax: number;
    dead: boolean;
    gameWon: boolean;
  }) => {
    if (!onShooterUpdate) return;
    const last = lastShooterInfoRef.current;
    if (
      last.active === info.active &&
      last.score === info.score &&
      last.total === info.total &&
      last.playerHits === info.playerHits &&
      last.health === info.health &&
      last.healthMax === info.healthMax &&
      last.dead === info.dead &&
      last.gameWon === info.gameWon
    ) {
      return;
    }
    lastShooterInfoRef.current = info;
    onShooterUpdate(info);
  };

  const lastResetTokenRef = useRef(0);
  useEffect(() => {
    if (!shooterResetToken || shooterResetToken === lastResetTokenRef.current) return;
    lastResetTokenRef.current = shooterResetToken;
    if (!isExampleRoom) return;
    exampleActiveRef.current = false;
    setEnemyAlive([]);
    setScore(0);
    setGameWon(false);
    playerDeadRef.current = false;
    setPlayerDead(false);
    playerHitsRef.current = 0;
    setPlayerHits(0);
    playerHealthRef.current = maxHealth;
    setPlayerHealth(maxHealth);
    healthRegenRef.current = 0;
    playerHitCooldownRef.current = 0;
    playerLaserRef.current.timer = 0;
    pendingEnemyHitsRef.current = [];
  }, [shooterResetToken, isExampleRoom, maxHealth]);

  useEffect(() => {
    if (!isExampleRoom) {
      exampleActiveRef.current = false;
      return;
    }
    const desiredCount = Math.max(1, artistSpriteTextures.length || 0);
    if (!exampleActiveRef.current || enemyAlive.length !== desiredCount) {
      const zone = layout.zones[activeZoneIndex];
      if (!zone) return;
      const minX = -zone.width / 2 + 2.2;
      const maxX = zone.width / 2 - 2.2;
      const minZ = Math.min(zone.startZ, zone.endZ) + 2.2;
      const maxZ = Math.max(zone.startZ, zone.endZ) - 2.2;
      const enemies: EnemyRuntime[] = [];
      for (let i = 0; i < desiredCount; i += 1) {
        enemies.push({
          position: new Vector3(randRange(minX, maxX), 0.12, randRange(minZ, maxZ)),
          target: new Vector3(randRange(minX, maxX), 0.12, randRange(minZ, maxZ)),
          speed: randRange(1.3, 2.1),
          cooldown: randRange(0.5, 1.1),
          laserTimer: 0,
          laserDuration: 0.6,
          laserMaxDist: 12,
          laserDir: new Vector3(0, 0, -1),
          phase: Math.random() * Math.PI * 2,
        });
      }
      enemiesRef.current = enemies;
      setEnemyAlive(new Array(desiredCount).fill(true));
      setScore(0);
      setGameWon(false);
      playerDeadRef.current = false;
      setPlayerDead(false);
      setPlayerHits(0);
      playerHitCooldownRef.current = 0;
      playerLaserRef.current.timer = 0;
      pendingEnemyHitsRef.current = [];
    }
    exampleActiveRef.current = true;
  }, [isExampleRoom, artistSpriteTextures.length, activeZoneIndex, layout.zones, enemyAlive.length]);

  useEffect(() => {
    const onShoot = () => {
      if (!isExampleRoom) return;
      if (interactionMode !== "keyboard") return;
      if (gameWonRef.current || playerDeadRef.current) return;
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const right = new Vector3().crossVectors(dir, new Vector3(0, 1, 0)).normalize();
      const up = new Vector3().crossVectors(right, dir).normalize();
      const origin = camera.position
        .clone()
        .add(dir.clone().multiplyScalar(1.25))
        .add(right.clone().multiplyScalar(0.42))
        .add(up.clone().multiplyScalar(-0.28));
      const maxDist = 26;
      const coverLimit = getCoverHitDist(origin, dir, maxDist, exampleCoverBoxes);
      let hitIndex = -1;
      let hitDist = Infinity;
      const alive = enemyAliveRef.current;
      enemiesRef.current.forEach((enemy, idx) => {
        if (!alive[idx]) return;
        const hitPoint = enemy.position.clone().add(new Vector3(0, 1.1, 0));
        const { dist, t } = distanceToRay(origin, dir, hitPoint);
        if (t <= 0 || t > maxDist) return;
        if (coverLimit < t) return;
        const hitRadius = 0.85;
        if (dist <= hitRadius && t < hitDist) {
          hitIndex = idx;
          hitDist = t;
        }
      });
      playerLaserRef.current.origin.copy(origin);
      playerLaserRef.current.dir.copy(dir);
      playerLaserRef.current.maxDist = maxDist;
      playerLaserRef.current.duration = 0.6;
      playerLaserRef.current.timer = 0.6;
      playerLaserRef.current.delayTimer = 0.14;
      if (hitIndex >= 0) {
        const travelSpeed = 32;
        const travelTime = clamp(hitDist / travelSpeed, 0.08, 0.6);
        pendingEnemyHitsRef.current.push({ index: hitIndex, timer: travelTime });
      }
    };
    window.addEventListener("pointerdown", onShoot);
    return () => window.removeEventListener("pointerdown", onShoot);
  }, [camera, isExampleRoom, interactionMode]);

  useFrame((_, delta) => {
    if (!isExampleRoom) {
      emitShooterInfo({
        active: false,
        score: 0,
        total: 0,
        playerHits: 0,
        health: maxHealth,
        healthMax: maxHealth,
        dead: false,
        gameWon: false,
      });
      return;
    }
    if (playerHitCooldownRef.current > 0) {
      playerHitCooldownRef.current = Math.max(0, playerHitCooldownRef.current - delta);
    }
    if (playerLaserRef.current.delayTimer > 0) {
      playerLaserRef.current.delayTimer = Math.max(0, playerLaserRef.current.delayTimer - delta);
    } else if (playerLaserRef.current.timer > 0) {
      playerLaserRef.current.timer = Math.max(0, playerLaserRef.current.timer - delta);
    }
    if (!playerDeadRef.current && playerHealthRef.current < maxHealth) {
      healthRegenRef.current += delta;
      if (healthRegenRef.current >= 1) {
        const add = Math.floor(healthRegenRef.current);
        healthRegenRef.current -= add;
        const next = Math.min(maxHealth, playerHealthRef.current + add);
        if (next !== playerHealthRef.current) {
          playerHealthRef.current = next;
          setPlayerHealth(next);
        }
      }
    } else if (playerHealthRef.current >= maxHealth) {
      healthRegenRef.current = 0;
    }
    if (pendingEnemyHitsRef.current.length) {
      const resolved: number[] = [];
      pendingEnemyHitsRef.current = pendingEnemyHitsRef.current.filter((hit) => {
        hit.timer -= delta;
        if (hit.timer <= 0) {
          resolved.push(hit.index);
          return false;
        }
        return true;
      });
      if (resolved.length) {
        let newlyKilled = 0;
        setEnemyAlive((prev) => {
          const next = [...prev];
          resolved.forEach((idx) => {
            if (next[idx]) {
              next[idx] = false;
              newlyKilled += 1;
            }
          });
          if (newlyKilled > 0 && next.every((v) => !v)) {
            setGameWon(true);
          }
          return newlyKilled > 0 ? next : prev;
        });
        if (newlyKilled > 0) {
          setScore((s) => s + newlyKilled);
        }
      }
    }
    const aliveList = enemyAliveRef.current;
    const total = aliveList.length || 0;
    const kills = total > 0 ? aliveList.reduce((acc, v) => acc + (v ? 0 : 1), 0) : 0;
    emitShooterInfo({
      active: true,
      score: kills,
      total,
      playerHits: playerHitsRef.current,
      health: playerHealthRef.current,
      healthMax: maxHealth,
      dead: playerDeadRef.current,
      gameWon: gameWonRef.current,
    });
    if (gameWonRef.current || playerDeadRef.current) return;
    const zone = layout.zones[activeZoneIndex];
    if (!zone) return;
    const minX = -zone.width / 2 + 2.2;
    const maxX = zone.width / 2 - 2.2;
    const minZ = Math.min(zone.startZ, zone.endZ) + 2.2;
    const maxZ = Math.max(zone.startZ, zone.endZ) - 2.2;
    const alive = enemyAliveRef.current;
    enemiesRef.current.forEach((enemy, idx) => {
      if (!alive[idx]) return;
      enemy.phase += delta * 3.2;
      const toTarget = enemy.target.clone().sub(enemy.position);
      if (toTarget.length() < 0.35) {
        enemy.target.set(randRange(minX, maxX), 0.12, randRange(minZ, maxZ));
      } else {
        enemy.position.add(toTarget.normalize().multiplyScalar(enemy.speed * delta));
      }
      enemy.position.y = 0.18 + Math.sin(enemy.phase) * 0.12;
      enemy.cooldown -= delta;
      if (enemy.laserTimer > 0) enemy.laserTimer = Math.max(0, enemy.laserTimer - delta);
      if (enemy.cooldown <= 0) {
        enemy.cooldown = randRange(0.5, 0.95);
        const targetPos = camera.position.clone().add(
          new Vector3(randRange(-0.15, 0.15), randRange(-0.08, 0.08), randRange(-0.15, 0.15)),
        );
        const laserStart = enemy.position.clone().add(new Vector3(0, 1.1, 0));
        enemy.laserDir.copy(targetPos).sub(laserStart).normalize();
        const distToPlayer = enemy.position.distanceTo(camera.position);
        enemy.laserMaxDist = Math.max(12, distToPlayer);
        enemy.laserTimer = enemy.laserDuration;
        const { dist: rayDist, t } = distanceToRay(laserStart, enemy.laserDir, camera.position);
        const coverLimit = getCoverHitDist(laserStart, enemy.laserDir, distToPlayer, exampleCoverBoxes);
        const hitRadius = 1.4;
        if (t > 0 && rayDist <= hitRadius && coverLimit >= t) {
          if (playerHitCooldownRef.current <= 0) {
            playerHitCooldownRef.current = 0.25;
            playerHitsRef.current += 1;
            setPlayerHits(playerHitsRef.current);
            const nextHealth = Math.max(0, playerHealthRef.current - 1);
            playerHealthRef.current = nextHealth;
            setPlayerHealth(nextHealth);
            healthRegenRef.current = 0;
            if (nextHealth <= 0 && !playerDeadRef.current) {
              playerDeadRef.current = true;
              setPlayerDead(true);
            }
          }
        } else if (coverLimit < t) {
          enemy.target.set(
            clamp(camera.position.x + randRange(-4.5, 4.5), minX, maxX),
            0.12,
            clamp(camera.position.z + randRange(-4.5, 4.5), minZ, maxZ),
          );
          enemy.cooldown = randRange(0.25, 0.5);
        }
      }
    });
  });

  const placementsByZone = useMemo(() => {
    const out = new Map<number, Placement[]>();
    layout.zones.forEach((z) => {
      const zoneId = z.index;
      const list = artworksByZone[zoneId] || [];
      out.set(
        zoneId,
        layoutArtworks(list, z, z.zone.theme, {
          felixHall: hallLayout,
          lucaHall: lucaHallLayout,
        }),
      );
    });
    return out;
  }, [layout, artworksByZone]);

  const adFrameSlotsByZone = useMemo(() => {
    const out = new Map<number, Array<{ position: [number, number, number]; rotation: [number, number, number] }>>();
    layout.zones.forEach((z) => {
      if (z.zone.artistId !== "example-room") return;
      const slots = buildWallSlots(z, { felixHall: hallIndex >= 0 ? layout.zones[hallIndex] : null, lucaHall: lucaHallIndex >= 0 ? layout.zones[lucaHallIndex] : null });
      const indices = selectSlotIndices(Math.min(8, slots.length), slots.length);
      out.set(
        z.index,
        indices.map((i) => ({ position: slots[i].position, rotation: slots[i].rotation })),
      );
    });
    return out;
  }, [layout]);

  const felixWingZoneIds = useMemo(() => {
    const ids = new Set<number>();
    ids.add(0);
    if (hallIndex >= 0) ids.add(hallIndex);
    if (felixRange) {
      for (let i = 0; i < felixRange.count; i += 1) {
        ids.add(felixRange.startIndex + i);
      }
    }
    return ids;
  }, [hallIndex, felixRange]);

  const lucaWingZoneIds = useMemo(() => {
    const ids = new Set<number>();
    ids.add(0);
    if (lucaHallIndex >= 0) ids.add(lucaHallIndex);
    if (lucaRange) {
      for (let i = 0; i < lucaRange.count; i += 1) {
        ids.add(lucaRange.startIndex + i);
      }
    }
    return ids;
  }, [lucaHallIndex, lucaRange]);

  const legacyVisibleZoneIds = useMemo(() => {
    const ids = new Set<number>();
    if (activeZoneIndex === 0) {
      felixWingZoneIds.forEach((id) => ids.add(id));
      lucaWingZoneIds.forEach((id) => ids.add(id));
      return ids;
    }
    if (activeZoneIndex === hallIndex) {
      ids.add(0);
      ids.add(hallIndex);
      if (felixRange) {
        for (let i = 0; i < felixRange.count; i += 1) {
          ids.add(felixRange.startIndex + i);
        }
      }
      return ids;
    }
    if (activeZoneIndex === lucaHallIndex) {
      ids.add(0);
      ids.add(lucaHallIndex);
      if (lucaRange) {
        for (let i = 0; i < lucaRange.count; i += 1) {
          ids.add(lucaRange.startIndex + i);
        }
      }
      return ids;
    }
    if (felixWingZoneIds.has(activeZoneIndex)) {
      ids.add(activeZoneIndex);
      ids.add(hallIndex);
      const neighbors = felixNeighbors.get(activeZoneIndex);
      if (typeof neighbors?.prev === "number") ids.add(neighbors.prev);
      if (typeof neighbors?.next === "number") ids.add(neighbors.next);
      return ids;
    }
    if (lucaWingZoneIds.has(activeZoneIndex)) {
      ids.add(activeZoneIndex);
      ids.add(lucaHallIndex);
      if (activeZoneIndex - 1 >= (lucaRange?.startIndex ?? 0)) ids.add(activeZoneIndex - 1);
      if (lucaRange && activeZoneIndex + 1 < lucaRange.startIndex + lucaRange.count) ids.add(activeZoneIndex + 1);
      return ids;
    }
    if (activeZoneIndex >= 0 && activeZoneIndex < layout.zones.length) {
      ids.add(activeZoneIndex);
    }
    if (typeof preloadZoneIndex === "number" && preloadZoneIndex >= 0 && preloadZoneIndex < layout.zones.length) {
      ids.add(preloadZoneIndex);
    }
    return ids;
  }, [activeZoneIndex, preloadZoneIndex, layout.zones.length, felixWingZoneIds, lucaWingZoneIds, hallIndex, lucaHallIndex, felixRange, lucaRange, felixNeighbors]);

  const visibleZoneIds = useMemo(() => {
    return legacyVisibleZoneIds;
  }, [legacyVisibleZoneIds]);

  const loadZoneIds = useMemo(() => {
    const ids = new Set<number>();
    visibleZoneIds.forEach((id) => ids.add(id));
    preloadZoneIds?.forEach((id) => ids.add(id));
    if (typeof preloadZoneIndex === "number") ids.add(preloadZoneIndex);
    ids.add(activeZoneIndex);
    return ids;
  }, [visibleZoneIds, preloadZoneIds, preloadZoneIndex, activeZoneIndex]);
  const loadZoneIdList = useMemo(() => Array.from(loadZoneIds), [loadZoneIds]);
  const wallLoadZoneIds = useMemo(() => loadZoneIdList, [loadZoneIdList]);

  useEffect(() => {
    const disableTexturePurge = true;
    if (disableTexturePurge) return;
    if (!preloadZoneIds || preloadZoneIds.length === 0) return;
    const keepIds = new Set(
      loadZoneIdList
        .map((idx) => gallery.zones[idx]?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const purge = (ref: React.MutableRefObject<Record<string, Texture>>, setter: (value: Record<string, Texture>) => void) => {
      let changed = false;
      Object.entries(ref.current).forEach(([key, tex]) => {
        const zone = gallery.zones.find((z) => key === z.id || key.startsWith(`${z.id}-`));
        if (!zone) return;
        if (keepIds.has(zone.id)) return;
        try {
          tex.dispose?.();
        } catch {
          // ignore dispose errors
        }
        delete ref.current[key];
        changed = true;
      });
      if (changed) {
        setter({ ...ref.current });
      }
    };
    purge(wallTexturesRef, setWallTextures);
    purge(floorTexturesRef, setFloorTextures);
    purge(ceilingTexturesRef, setCeilingTextures);
  }, [preloadZoneIds, loadZoneIdList, gallery.zones]);

  useEffect(() => {
    let cancelled = false;
    wallLoadZoneIds.forEach((zoneIndex) => {
      const z = gallery.zones[zoneIndex];
      if (!z) return;
      const items: Array<{ key: string; src: string | undefined }> = [
        { key: z.id, src: z.wallTexture },
        { key: `${z.id}-alt`, src: z.wallTextureAlt },
        { key: `${z.id}-left`, src: z.wallTextureLeft },
        { key: `${z.id}-right`, src: z.wallTextureRight },
        { key: `${z.id}-front`, src: z.wallTextureFront },
        { key: `${z.id}-back`, src: z.wallTextureBack },
        { key: `${z.id}-floor`, src: z.floorTexture },
        { key: `${z.id}-ceiling`, src: z.ceilingTexture },
      ];
      const reportLoaded = (src: string) => {
        const key = `${zoneIndex}:${src}`;
        if (reportedWallsRef.current[key]) return;
        reportedWallsRef.current[key] = true;
        onWallLoadedRef.current?.(zoneIndex);
      };
      items.forEach((item) => {
        const src = item.src;
        if (!src) return;
        if (wallTexturesRef.current[item.key] || floorTexturesRef.current[item.key] || ceilingTexturesRef.current[item.key]) {
          reportLoaded(src);
          return;
        }
        loadTextureWithRetry(src, { maxRetries: Infinity, retryIntervalMs: 1200 })
          .then((tex) => {
            if (cancelled) return;
            (tex as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
            tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
            tex.repeat.set(1, 1);
            tex.rotation = 0;
            if (item.key.endsWith("-floor")) {
              floorTexturesRef.current = { ...floorTexturesRef.current, [item.key]: tex };
              setFloorTextures((prev) => ({ ...prev, [item.key]: tex }));
            } else if (item.key.endsWith("-ceiling")) {
              ceilingTexturesRef.current = { ...ceilingTexturesRef.current, [item.key]: tex };
              setCeilingTextures((prev) => ({ ...prev, [item.key]: tex }));
            } else {
              wallTexturesRef.current = { ...wallTexturesRef.current, [item.key]: tex };
              setWallTextures((prev) => ({ ...prev, [item.key]: tex }));
            }
            reportLoaded(src);
          })
          .catch(() => {
            // Keep retrying in the cache loader; avoid counting failed textures as loaded.
          });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gallery.zones, wallLoadZoneIds]);

  const exampleCovers = useMemo(() => {
    if (!isExampleRoom) return [];
    const zone = layout.zones[activeZoneIndex];
    if (!zone) return [];
    const halfW = zone.width / 2 - 2.2;
    const minZ = Math.min(zone.startZ, zone.endZ) + 2.2;
    const maxZ = Math.max(zone.startZ, zone.endZ) - 2.2;
    const centerZ = zone.centerZ;
    const centerX = zone.centerX;
    const halfLen = Math.max(1, (maxZ - minZ) / 2);
    const xFractions = [-0.82, -0.5, -0.18, 0.18, 0.5, 0.82];
    const zFractions = [0.85, 0.5, 0.18, -0.18, -0.5, -0.85];
    const covers: Array<{ position: [number, number, number]; size: [number, number, number] }> = [];
    xFractions.forEach((xf, xi) => {
      zFractions.forEach((zf, zi) => {
        if (Math.abs(xf) < 0.22 && Math.abs(zf) < 0.22) return;
        const x = centerX + xf * halfW;
        const z = centerZ + zf * halfLen;
        const w = 1.2 + (xi % 3) * 0.9;
        const h = 1.0 + (zi % 3) * 0.8;
        const d = 0.8;
        covers.push({ position: [x, h / 2, z], size: [w, h, d] });
      });
    });
    const wallBars = [
      { x: centerX - halfW * 0.1, z: centerZ + halfLen * 0.15, w: 6.2, h: 1.9, d: 0.5 },
      { x: centerX + halfW * 0.12, z: centerZ - halfLen * 0.2, w: 6.2, h: 1.9, d: 0.5 },
      { x: centerX - halfW * 0.3, z: centerZ + halfLen * 0.45, w: 4.8, h: 1.7, d: 0.5 },
      { x: centerX + halfW * 0.32, z: centerZ - halfLen * 0.45, w: 4.8, h: 1.7, d: 0.5 },
    ];
    wallBars.forEach((b) => {
      covers.push({ position: [b.x, b.h / 2, b.z], size: [b.w, b.h, b.d] });
    });
    return covers;
  }, [isExampleRoom, layout.zones, activeZoneIndex]);

  const exampleCoverBoxes = useMemo(() => {
    return exampleCovers.map((cover) => {
      const [x, y, z] = cover.position;
      const [w, h, d] = cover.size;
      return {
        min: new Vector3(x - w / 2, y - h / 2, z - d / 2),
        max: new Vector3(x + w / 2, y + h / 2, z + d / 2),
      };
    });
  }, [exampleCovers]);

  const floorCenterX = (layout.minX + layout.maxX) / 2;
  const floorCenterZ = (layout.minZ + layout.maxZ) / 2;
  const floorWidth = Math.max(1, layout.maxX - layout.minX);
  const floorLength = Math.max(1, layout.maxZ - layout.minZ);

  return (
    <group>
      {/* Navigation is now arrow-driven; keep floor invisible */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[floorCenterX, 0.02, floorCenterZ]}>
        <planeGeometry args={[floorWidth, floorLength]} />
        <meshStandardMaterial color="#000000" transparent opacity={0} />
      </mesh>

      {/* Zone shells (walls / floors / ceilings) */}
      {layout.zones.map((z) => {
        if (!visibleZoneIds.has(z.index)) return null;
        const { zone, startZ, endZ, centerZ, length, width, height, centerX } = z;
        const themeCfg = THEME_CONFIG[zone.theme];
        const isLobby = zone.id === "lobby";
        const isFelixHall = zone.id === "felix-hall";
        const isLucaHall = zone.id === "luca-hall";
        const wallTexture = zone.wallTexture ? wallTextures[zone.id] : undefined;
        const wallTextureAlt = zone.wallTextureAlt ? wallTextures[`${zone.id}-alt`] : wallTexture;
        const wallLeft = wallTextures[`${zone.id}-left`] || wallTexture;
        const wallRight = wallTextures[`${zone.id}-right`] || wallTexture;
        const hallRepeat = hallWallRepeats[zone.id];
        const wallFront = wallTextures[`${zone.id}-front`] || wallTextureAlt;
        const wallBack = wallTextures[`${zone.id}-back`] || wallTextureAlt;
        const showLobbyVideo = false;
        const lobbyVideoMap = isLobby && showLobbyVideo ? lobbyVideoTexture : null;
        const wallLeftMap = isLobby && lobbyVideoMap ? lobbyVideoMap : hallRepeat?.left || wallLeft;
        const wallRightMap = isLobby && lobbyVideoMap ? lobbyVideoMap : hallRepeat?.right || wallRight;
        const wallFrontMap = wallFront;
        const wallBackMap = wallBack;
        const frameMap = doorFrameTexture || undefined;
        const wallVideoRoughness = 0.85;
        const wallVideoEmissive = "#1a1a1a";
        const wallVideoEmissiveIntensity = 0.25;
        if (isLobby && lobbyVideoMap) {
          resetMapTransform(lobbyVideoMap);
        }
        const floorTexture = isLobby
          ? lobbyFloorTexture || undefined
          : zone.floorTexture
            ? floorTextures[`${zone.id}-floor`]
            : undefined;
        const ceilingTexture = zone.ceilingTexture ? ceilingTextures[`${zone.id}-ceiling`] : undefined;
        const halfW = width / 2;
        const floorY = 0.01;
        const ceilY = height - 0.02;
        const entryWallZ = startZ + 0.12;
        const exitWallZ = endZ - 0.12;
        const wallEps = 0.01;
        const wallLeftX = centerX - halfW + 0.04;
        const wallRightX = centerX + halfW - 0.04;
        const isRound = false;
        const wallBaseColor = wallTexture ? themeCfg.wall.color : "#ffffff";
        const range = rangeByZoneIndex.get(z.index);
        const hasRange = Boolean(range);
        const startIndex = range?.startIndex ?? -1;
        const count = range?.count ?? 0;
        const isFirst = hasRange && z.index === startIndex;
        const isLast = hasRange && z.index === startIndex + count - 1;
        const canGoPrev = hasRange && z.index > startIndex;
        const canGoNext = hasRange && z.index < startIndex + count - 1;
        const isFelixRange = hasRange && range?.artistId === "felix";
        const isLucaRange = hasRange && range?.artistId === "luca";
        const isWingRange = isFelixRange || isLucaRange;
        const felixHallSide = isFelixRange ? resolveHallSide(z, hallLayout) : null;
        const felixRoomSide = isFelixRange ? toRoomSide(felixHallSide) : null;
        const lucaHallSide = isLucaRange ? resolveHallSide(z, lucaHallLayout) : null;
        const lucaRoomSide = isLucaRange ? toRoomSide(lucaHallSide) : null;
        const felixNeighbor = isFelixRange ? felixNeighbors.get(z.index) : undefined;
        const felixCanGoPrev = Boolean(felixNeighbor?.prev);
        const felixCanGoNext = Boolean(felixNeighbor?.next);
        const showLobbyEntry =
          hasRange && isFirst && !((hallIndex >= 0 && isFelixRange) || (lucaHallIndex >= 0 && isLucaRange));
        const showLobbyExit =
          hasRange && isLast && !isFirst && !((hallIndex >= 0 && isFelixRange) || (lucaHallIndex >= 0 && isLucaRange));
        const lobby = layout.zones[0];
        const showDoorLabel = activeZoneIndex === z.index;
        const doorHeaderTexture = isFelixHall ? wallBackMap || wallFrontMap || wallTexture || null : null;
        const headerHeight = Math.min(DOOR_OPENING.height * 0.62, height * 0.32);
        const headerY = DOOR_OPENING.centerY + DOOR_OPENING.height / 2 + headerHeight / 2 + 0.18;
        const headerOffset = 0.06;
        const headerWidthFor = (openingWidth: number) => Math.min(openingWidth * 1.1, Math.max(0.6, width - 0.6));
        const renderFelixDoorHeader = (
          key: string,
          x: number,
          zPos: number,
          rotation: [number, number, number],
          openingWidth: number,
        ) => {
          if (!wappenTexture && !doorHeaderTexture) return null;
          const headerWidth = headerWidthFor(openingWidth);
          const wHeightBase = headerHeight * 0.72;
          let wHeight = wHeightBase;
          let wWidth = wHeight * wappenAspect;
          const maxW = headerWidth * 0.85;
          if (wWidth > maxW) {
            wWidth = maxW;
            wHeight = wWidth / wappenAspect;
          }
          return (
            <group key={key} position={[x, headerY, zPos]} rotation={rotation}>
              {doorHeaderTexture ? (
                <mesh>
                  <planeGeometry args={[headerWidth, headerHeight]} />
                  <meshStandardMaterial
                    map={doorHeaderTexture || undefined}
                    color="#ffffff"
                    roughness={0.9}
                    metalness={0.0}
                    emissive="#101014"
                    emissiveIntensity={0.12}
                    polygonOffset
                    polygonOffsetFactor={-2}
                    polygonOffsetUnits={-2}
                  />
                </mesh>
              ) : null}
              {wappenTexture ? (
                <mesh position={[0, 0, 0.03]}>
                  <planeGeometry args={[wWidth, wHeight]} />
                  <meshStandardMaterial
                    map={wappenTexture || undefined}
                    transparent
                    alphaTest={0.1}
                    roughness={0.9}
                    metalness={0.0}
                    polygonOffset
                    polygonOffsetFactor={-3}
                    polygonOffsetUnits={-3}
                  />
                </mesh>
              ) : null}
            </group>
          );
        };
        const frontHoles: WallHole[] = [];
        const backHoles: WallHole[] = [];
        const rightHoles: WallHole[] = [];
        const leftHoles: WallHole[] = [];

        if (isFelixHall) {
          frontHoles.push({
            center: 0,
            width: DOOR_OPENING.width,
            height: DOOR_OPENING.height,
            centerY: DOOR_OPENING.centerY,
          });
          if (felixRange) {
            for (let i = 0; i < felixRange.count; i += 1) {
              const roomLayout = layout.zones[felixRange.startIndex + i];
              if (!roomLayout) continue;
              const side = resolveHallSide(roomLayout, hallLayout);
              if (side === "left") {
                leftHoles.push({
                  center: roomLayout.centerZ - centerZ,
                  width: HALL_ROOM_OPENING_WIDTH,
                  height: DOOR_OPENING.height,
                  centerY: DOOR_OPENING.centerY,
                });
              } else if (side === "right") {
                rightHoles.push({
                  center: roomLayout.centerZ - centerZ,
                  width: HALL_ROOM_OPENING_WIDTH,
                  height: DOOR_OPENING.height,
                  centerY: DOOR_OPENING.centerY,
                });
              } else if (side === "front") {
                backHoles.push({
                  center: roomLayout.centerX - centerX,
                  width: HALL_ROOM_OPENING_WIDTH,
                  height: DOOR_OPENING.height,
                  centerY: DOOR_OPENING.centerY,
                });
              }
            }
          }
        }

        if (isLucaHall) {
          rightHoles.push({
            center: 0,
            width: DOOR_OPENING.width,
            height: DOOR_OPENING.height,
            centerY: DOOR_OPENING.centerY,
          });
          if (lucaRange) {
            for (let i = 0; i < lucaRange.count; i += 1) {
              const roomLayout = layout.zones[lucaRange.startIndex + i];
              if (!roomLayout) continue;
              leftHoles.push({
                center: roomLayout.centerZ - centerZ,
                width: HALL_ROOM_OPENING_WIDTH,
                height: DOOR_OPENING.height,
                centerY: DOOR_OPENING.centerY,
              });
            }
          }
        }

        if (isLobby && hallIndex >= 0) {
          backHoles.push({
            center: 0,
            width: DOOR_OPENING.width,
            height: DOOR_OPENING.height,
            centerY: DOOR_OPENING.centerY,
          });
        }
        if (isLobby && lucaHallIndex >= 0) {
          leftHoles.push({
            center: 0,
            width: DOOR_OPENING.width,
            height: DOOR_OPENING.height,
            centerY: DOOR_OPENING.centerY,
          });
        }

        if (isFelixRange) {
          const side = felixRoomSide;
          if (side === "left") {
            leftHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          } else if (side === "right") {
            rightHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          } else if (side === "front") {
            frontHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          } else if (side === "back") {
            backHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          }
          if (felixCanGoPrev) {
            frontHoles.push({
              center: 0,
              width: DOOR_OPENING.width,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          }
          if (felixCanGoNext) {
            backHoles.push({
              center: 0,
              width: DOOR_OPENING.width,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          }
        }

        if (isLucaRange) {
          const side = lucaRoomSide;
          if (side === "left") {
            leftHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          } else if (side === "front") {
            frontHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          } else if (side === "back") {
            backHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          } else {
            rightHoles.push({
              center: 0,
              width: HALL_ROOM_OPENING_WIDTH,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          }
          if (canGoPrev) {
            frontHoles.push({
              center: 0,
              width: DOOR_OPENING.width,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          }
          if (canGoNext) {
            backHoles.push({
              center: 0,
              width: DOOR_OPENING.width,
              height: DOOR_OPENING.height,
              centerY: DOOR_OPENING.centerY,
            });
          }
        }

        const felixNextZone =
          isFelixRange && typeof felixNeighbor?.next === "number" ? layout.zones[felixNeighbor.next] : null;
        const nextZone = isFelixRange ? felixNextZone : canGoNext ? layout.zones[z.index + 1] : null;
        const nextEntryWallZ = nextZone ? nextZone.startZ + 0.12 : null;
        const roomTunnelDepth =
          nextZone && typeof nextEntryWallZ === "number" ? Math.abs(nextEntryWallZ - exitWallZ) : 0;
        const hallEntryWallZ = hallLayout ? hallLayout.startZ + 0.12 : null;
        const lobbyHallTunnelDepth =
          isLobby && hallLayout && typeof hallEntryWallZ === "number" ? Math.abs(hallEntryWallZ - exitWallZ) : 0;
        const lucaHallRightX =
          lucaHallLayout ? lucaHallLayout.centerX + lucaHallLayout.width / 2 - 0.04 : null;
        const lobbyLucaTunnelDepth =
          isLobby && lucaHallLayout && typeof lucaHallRightX === "number"
            ? Math.abs(wallLeftX - lucaHallRightX)
            : 0;

        return (
          <group key={zone.id}>
            {/* floor */}
            {isRound ? (
              <mesh
                key={`floor-${zone.id}-${floorTexture?.uuid || "none"}`}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[centerX, floorY, centerZ]}
              >
                <circleGeometry args={[width / 2, 64]} />
                <meshStandardMaterial
                  color={new Color(themeCfg.floor.color)}
                  map={floorTexture || undefined}
                  roughness={themeCfg.floor.roughness}
                  metalness={themeCfg.floor.metalness}
                  emissive={floorTexture ? "#1a1a1a" : "#000000"}
                  emissiveIntensity={floorTexture ? 0.25 : 0.0}
                />
              </mesh>
            ) : (
              <mesh
                key={`floor-${zone.id}-${floorTexture?.uuid || "none"}`}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[centerX, floorY, centerZ]}
              >
                <planeGeometry args={[width, length]} />
                <meshStandardMaterial
                  color={new Color(themeCfg.floor.color)}
                  map={floorTexture || undefined}
                  roughness={themeCfg.floor.roughness}
                  metalness={themeCfg.floor.metalness}
                  emissive={floorTexture ? "#1a1a1a" : "#000000"}
                  emissiveIntensity={floorTexture ? 0.25 : 0.0}
                />
              </mesh>
            )}

            {/* ceiling */}
            {isRound ? (
              <mesh
                key={`ceiling-${zone.id}-${ceilingTexture?.uuid || "none"}`}
                rotation={[Math.PI / 2, 0, 0]}
                position={[centerX, ceilY, centerZ]}
              >
                <circleGeometry args={[width / 2, 64]} />
                <meshStandardMaterial
                  color={new Color(themeCfg.ceiling.color)}
                  map={ceilingTexture || undefined}
                  roughness={themeCfg.ceiling.roughness}
                  metalness={0.0}
                  emissive={ceilingTexture ? "#16181f" : "#000000"}
                  emissiveIntensity={ceilingTexture ? 0.35 : 0.0}
                  side={DoubleSide}
                />
              </mesh>
            ) : (
              <mesh
                key={`ceiling-${zone.id}-${ceilingTexture?.uuid || "none"}`}
                rotation={[Math.PI / 2, 0, 0]}
                position={[centerX, ceilY, centerZ]}
              >
                <planeGeometry args={[width, length]} />
                <meshStandardMaterial
                  color={new Color(themeCfg.ceiling.color)}
                  map={ceilingTexture || undefined}
                  roughness={themeCfg.ceiling.roughness}
                  metalness={0.0}
                  emissive={ceilingTexture ? "#16181f" : "#000000"}
                  emissiveIntensity={ceilingTexture ? 0.35 : 0.0}
                  side={DoubleSide}
                />
              </mesh>
            )}

            {/* walls */}
            {isRound ? (
              <mesh position={[0, height / 2, centerZ]}>
                <cylinderGeometry args={[width / 2, width / 2, height, 64, 1, true]} />
                <meshStandardMaterial
                  color={new Color(wallBaseColor)}
                  map={wallTexture || undefined}
                  roughness={themeCfg.wall.roughness}
                  metalness={0.0}
                  side={BackSide}
                />
              </mesh>
            ) : (
              <>
                {leftHoles.length ? (
                  <WallWithHoles
                    keyPrefix={`wall-left-${zone.id}`}
                    width={length}
                    height={height}
                    holes={leftHoles}
                    position={[centerX - halfW + 0.04, height / 2, centerZ]}
                    rotation={[0, Math.PI / 2, 0]}
                    material={{
                      color: new Color(isLobby && lobbyVideoMap ? "#ffffff" : wallBaseColor),
                      map: wallLeftMap || undefined,
                      roughness: isLobby && lobbyVideoMap ? wallVideoRoughness : themeCfg.wall.roughness,
                      metalness: 0.0,
                      emissive: isLobby && lobbyVideoMap ? wallVideoEmissive : "#000000",
                      emissiveIntensity: isLobby && lobbyVideoMap ? wallVideoEmissiveIntensity : 0.0,
                      side: DoubleSide,
                    }}
                    topBottomMaterial={
                      isFelixHall || isLucaHall
                        ? {
                            color: new Color(wallBaseColor),
                            map: (wallTexture || undefined) as Texture | undefined,
                            roughness: themeCfg.wall.roughness,
                            metalness: 0.0,
                            side: DoubleSide,
                          }
                        : undefined
                    }
                    middleMaterial={
                      isFelixHall || isLucaHall
                        ? {
                            color: new Color(wallBaseColor),
                            map: (wallLeftMap || undefined) as Texture | undefined,
                            roughness: themeCfg.wall.roughness,
                            metalness: 0.0,
                            side: DoubleSide,
                          }
                        : undefined
                    }
                  />
                ) : (
                  <mesh
                    key={`wall-left-${zone.id}-${wallLeft?.uuid || "none"}`}
                    position={[centerX - halfW + 0.04, height / 2, centerZ]}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    <planeGeometry args={[length, height]} />
                    <meshStandardMaterial
                      color={new Color(isLobby && lobbyVideoMap ? "#ffffff" : wallBaseColor)}
                      map={wallLeftMap || undefined}
                      roughness={isLobby && lobbyVideoMap ? wallVideoRoughness : themeCfg.wall.roughness}
                      metalness={0.0}
                      emissive={isLobby && lobbyVideoMap ? wallVideoEmissive : "#000000"}
                      emissiveIntensity={isLobby && lobbyVideoMap ? wallVideoEmissiveIntensity : 0.0}
                      side={DoubleSide}
                    />
                  </mesh>
                )}
                {rightHoles.length ? (
                  <WallWithHoles
                    keyPrefix={`wall-right-${zone.id}`}
                    width={length}
                    height={height}
                    holes={rightHoles}
                    position={[centerX + halfW - 0.04, height / 2, centerZ]}
                    rotation={[0, -Math.PI / 2, 0]}
                    material={{
                      color: new Color(isLobby && lobbyVideoMap ? "#ffffff" : wallBaseColor),
                      map: wallRightMap || undefined,
                      roughness: isLobby && lobbyVideoMap ? wallVideoRoughness : themeCfg.wall.roughness,
                      metalness: 0.0,
                      emissive: isLobby && lobbyVideoMap ? wallVideoEmissive : "#000000",
                      emissiveIntensity: isLobby && lobbyVideoMap ? wallVideoEmissiveIntensity : 0.0,
                      side: DoubleSide,
                    }}
                    topBottomMaterial={
                      isFelixHall || isLucaHall
                        ? {
                            color: new Color(wallBaseColor),
                            map: (wallTexture || undefined) as Texture | undefined,
                            roughness: themeCfg.wall.roughness,
                            metalness: 0.0,
                            side: DoubleSide,
                          }
                        : undefined
                    }
                    middleMaterial={
                      isFelixHall || isLucaHall
                        ? {
                            color: new Color(wallBaseColor),
                            map: (wallRightMap || undefined) as Texture | undefined,
                            roughness: themeCfg.wall.roughness,
                            metalness: 0.0,
                            side: DoubleSide,
                          }
                        : undefined
                    }
                  />
                ) : (
                  <mesh
                    key={`wall-right-${zone.id}-${wallRight?.uuid || "none"}`}
                  position={[centerX + halfW - 0.04, height / 2, centerZ]}
                    rotation={[0, -Math.PI / 2, 0]}
                  >
                    <planeGeometry args={[length, height]} />
                    <meshStandardMaterial
                      color={new Color(isLobby && lobbyVideoMap ? "#ffffff" : wallBaseColor)}
                      map={wallRightMap || undefined}
                      roughness={isLobby && lobbyVideoMap ? wallVideoRoughness : themeCfg.wall.roughness}
                      metalness={0.0}
                      emissive={isLobby && lobbyVideoMap ? wallVideoEmissive : "#000000"}
                      emissiveIntensity={isLobby && lobbyVideoMap ? wallVideoEmissiveIntensity : 0.0}
                      side={DoubleSide}
                    />
                  </mesh>
                )}

                {/* entry wall */}
                {frontHoles.length ? (
                  <WallWithHoles
                    keyPrefix={`wall-front-${zone.id}`}
                    width={width}
                    height={height}
                    holes={frontHoles}
                  position={[centerX, height / 2, entryWallZ]}
                    rotation={[0, Math.PI, 0]}
                    material={{
                      color: new Color(themeCfg.wallAlt.color),
                      map: wallFrontMap || undefined,
                      roughness: themeCfg.wallAlt.roughness,
                      metalness: 0.0,
                      side: DoubleSide,
                    }}
                  />
                ) : (
                  <mesh
                    key={`wall-front-${zone.id}-${wallFront?.uuid || "none"}`}
                    position={[centerX, height / 2, entryWallZ]}
                    rotation={[0, Math.PI, 0]}
                  >
                    <planeGeometry args={[width, height]} />
                    <meshStandardMaterial
                      color={new Color(themeCfg.wallAlt.color)}
                      map={wallFrontMap || undefined}
                      roughness={themeCfg.wallAlt.roughness}
                      metalness={0.0}
                      side={DoubleSide}
                    />
                  </mesh>
                )}

                {/* exit wall */}
                {backHoles.length ? (
                  <WallWithHoles
                    keyPrefix={`wall-back-${zone.id}`}
                    width={width}
                    height={height}
                    holes={backHoles}
                    position={[centerX, height / 2, exitWallZ]}
                    rotation={[0, 0, 0]}
                    material={{
                      color: new Color(isLobby && lobbyVideoMap ? "#ffffff" : themeCfg.wallAlt.color),
                      map: wallBackMap || undefined,
                      roughness: isLobby && lobbyVideoMap ? wallVideoRoughness : themeCfg.wallAlt.roughness,
                      metalness: 0.0,
                      emissive: isLobby && lobbyVideoMap ? wallVideoEmissive : "#000000",
                      emissiveIntensity: isLobby && lobbyVideoMap ? wallVideoEmissiveIntensity : 0.0,
                      side: DoubleSide,
                    }}
                  />
                ) : (
                  <mesh
                    key={`wall-back-${zone.id}-${(wallBackMap || wallBack)?.uuid || "none"}`}
                    position={[centerX, height / 2, exitWallZ]}
                    rotation={[0, 0, 0]}
                  >
                    <planeGeometry args={[width, height]} />
                    <meshStandardMaterial
                      color={new Color(isLobby && lobbyVideoMap ? "#ffffff" : themeCfg.wallAlt.color)}
                      map={wallBackMap || undefined}
                      roughness={isLobby && lobbyVideoMap ? wallVideoRoughness : themeCfg.wallAlt.roughness}
                      metalness={0.0}
                      emissive={isLobby && lobbyVideoMap ? wallVideoEmissive : "#000000"}
                      emissiveIntensity={isLobby && lobbyVideoMap ? wallVideoEmissiveIntensity : 0.0}
                      side={DoubleSide}
                    />
                  </mesh>
                )}

                {isLucaHall && wappenTexture ? (() => {
                  const doorTopY = DOOR_OPENING.centerY + DOOR_OPENING.height / 2;
                  const targetH = height * 0.75;
                  let wHeight = targetH;
                  let wWidth = wHeight * wappenAspect;
                  const maxW = width * 0.85;
                  if (wWidth > maxW) {
                    wWidth = maxW;
                    wHeight = wWidth / wappenAspect;
                  }
                  const maxY = height - wHeight / 2 - 0.35;
                  const desiredY = doorTopY + 0.6 + wHeight / 2;
                  const wappenY = Math.min(desiredY, maxY);
                  const entryZ = entryWallZ - 0.12;
                  const exitZ = exitWallZ + 0.12;
                  return (
                    <>
                      <mesh position={[centerX, wappenY, entryZ]} rotation={[0, Math.PI, 0]}>
                        <planeGeometry args={[wWidth, wHeight]} />
                        <meshStandardMaterial
                          map={wappenTexture || undefined}
                          transparent
                          alphaTest={0.1}
                          polygonOffset
                          polygonOffsetFactor={-2}
                          polygonOffsetUnits={-2}
                          roughness={0.9}
                          metalness={0.0}
                        />
                      </mesh>
                      <mesh position={[centerX, wappenY, exitZ]} rotation={[0, 0, 0]}>
                        <planeGeometry args={[wWidth, wHeight]} />
                        <meshStandardMaterial
                          map={wappenTexture || undefined}
                          transparent
                          alphaTest={0.1}
                          polygonOffset
                          polygonOffsetFactor={-2}
                          polygonOffsetUnits={-2}
                          roughness={0.9}
                          metalness={0.0}
                        />
                      </mesh>
                    </>
                  );
                })() : null}

                {isWingRange && (isFelixRange ? felixCanGoNext : canGoNext) && roomTunnelDepth > 0.01 ? (
                  <DoorTunnel
                    position={[centerX, DOOR_OPENING.centerY, (exitWallZ + (nextEntryWallZ ?? exitWallZ)) / 2]}
                    width={DOOR_OPENING.width}
                    height={DOOR_OPENING.height}
                    depth={roomTunnelDepth}
                    frameMap={frameMap}
                  />
                ) : null}
                {isLobby && hallIndex >= 0 && lobbyHallTunnelDepth > 0.01 ? (
                  <DoorTunnel
                    position={[centerX, DOOR_OPENING.centerY, (exitWallZ + (hallEntryWallZ ?? exitWallZ)) / 2]}
                    width={DOOR_OPENING.width}
                    height={DOOR_OPENING.height}
                    depth={lobbyHallTunnelDepth}
                    frameMap={frameMap}
                  />
                ) : null}
                {isLobby && lucaHallIndex >= 0 && lobbyLucaTunnelDepth > 0.01 ? (
                  <DoorTunnel
                    position={[(wallLeftX + (lucaHallRightX ?? wallLeftX)) / 2, DOOR_OPENING.centerY, centerZ]}
                    rotation={[0, Math.PI / 2, 0]}
                    width={DOOR_OPENING.width}
                    height={DOOR_OPENING.height}
                    depth={lobbyLucaTunnelDepth}
                    frameMap={frameMap}
                  />
                ) : null}

                {/* door to previous room (same artist) */}
                {canGoPrev && !isFelixRange ? (
                  <DoorPortal
                    key={`door-prev-${zone.id}-${doorTexture?.uuid || "none"}`}
                    position={[centerX, 1.6, entryWallZ + wallEps]}
                    rotation={[0, Math.PI, 0]}
                    title="Zurueck"
                    texture={doorTexture}
                    frameOnly={isWingRange}
                    fallbackTexture={fallbackDoorTexture}
                    showLabel={showDoorLabel}
                    frameMap={frameMap}
                    onEnter={() => {
                      onNavigateTo([centerX, 1.6, entryWallZ]);
                    }}
                  />
                ) : null}
                {canGoNext && !isFelixRange ? (
                  <DoorPortal
                    key={`door-next-${zone.id}-${doorTexture?.uuid || "none"}`}
                    position={[centerX, 1.6, exitWallZ - wallEps]}
                    rotation={[0, 0, 0]}
                    title="Weiter"
                    texture={doorTexture}
                    frameOnly={isWingRange}
                    fallbackTexture={fallbackDoorTexture}
                    showLabel={showDoorLabel}
                    frameMap={frameMap}
                    onEnter={() => {
                      onNavigateTo([centerX, 1.6, exitWallZ]);
                    }}
                  />
                ) : null}

                {/* door back to lobby (only first + last room) */}
                {!isLobby && showLobbyEntry ? (
                  <DoorPortal
                    key={`door-lobby-entry-${zone.id}-${doorTexture?.uuid || "none"}`}
                    position={[centerX, 1.6, entryWallZ + wallEps]}
                    rotation={[0, Math.PI, 0]}
                    title="Zur Lobby"
                    texture={doorTexture}
                    fallbackTexture={fallbackDoorTexture}
                    showLabel={showDoorLabel}
                    frameMap={frameMap}
                    onEnter={() => {
                      onNavigateTo([centerX, 1.6, entryWallZ]);
                    }}
                  />
                ) : null}
                {!isLobby && showLobbyExit ? (
                  <DoorPortal
                    key={`door-lobby-exit-${zone.id}-${doorTexture?.uuid || "none"}`}
                    position={[centerX, 1.6, exitWallZ - wallEps]}
                    rotation={[0, 0, 0]}
                    title="Zur Lobby"
                    texture={doorTexture}
                    fallbackTexture={fallbackDoorTexture}
                    showLabel={showDoorLabel}
                    frameMap={frameMap}
                    onEnter={() => {
                      onNavigateTo([centerX, 1.6, exitWallZ]);
                    }}
                  />
                ) : null}
                {hallIndex >= 0 && isFelixRange && felixRoomSide ? (
                  <DoorPortal
                    key={`door-hall-${zone.id}-${doorTexture?.uuid || "none"}`}
                    position={
                      felixRoomSide === "left"
                        ? [wallLeftX, 1.6, centerZ]
                        : felixRoomSide === "right"
                          ? [wallRightX, 1.6, centerZ]
                          : [centerX, 1.6, entryWallZ + wallEps]
                    }
                    rotation={
                      felixRoomSide === "left"
                        ? [0, Math.PI / 2, 0]
                        : felixRoomSide === "right"
                          ? [0, -Math.PI / 2, 0]
                          : [0, Math.PI, 0]
                    }
                    title="Flur"
                    texture={doorTexture}
                    frameOnly
                    fallbackTexture={fallbackDoorTexture}
                    openingWidth={HALL_ROOM_OPENING_WIDTH}
                    showLabel={showDoorLabel}
                    frameMap={frameMap}
                    onEnter={() => {
                      const target: [number, number, number] =
                        felixRoomSide === "left"
                          ? [centerX - halfW + 0.3, 1.6, centerZ]
                          : felixRoomSide === "right"
                            ? [centerX + halfW - 0.3, 1.6, centerZ]
                            : [centerX, 1.6, entryWallZ + 0.3];
                      onNavigateTo(target);
                    }}
                  />
                ) : null}
                {lucaHallIndex >= 0 && isLucaRange && lucaRoomSide ? (
                  <DoorPortal
                    key={`door-luca-hall-${zone.id}-${doorTexture?.uuid || "none"}`}
                    position={
                      lucaRoomSide === "left"
                        ? [wallLeftX, 1.6, centerZ]
                        : lucaRoomSide === "right"
                          ? [wallRightX, 1.6, centerZ]
                          : [centerX, 1.6, entryWallZ + wallEps]
                    }
                    rotation={
                      lucaRoomSide === "left"
                        ? [0, Math.PI / 2, 0]
                        : lucaRoomSide === "right"
                          ? [0, -Math.PI / 2, 0]
                          : [0, Math.PI, 0]
                    }
                    title="Flur"
                    texture={doorTexture}
                    frameOnly
                    fallbackTexture={fallbackDoorTexture}
                    openingWidth={HALL_ROOM_OPENING_WIDTH}
                    showLabel={showDoorLabel}
                    frameMap={frameMap}
                    onEnter={() => {
                      const target: [number, number, number] =
                        lucaRoomSide === "left"
                          ? [centerX - halfW + 0.3, 1.6, centerZ]
                          : lucaRoomSide === "right"
                            ? [centerX + halfW - 0.3, 1.6, centerZ]
                            : [centerX, 1.6, entryWallZ + 0.3];
                      onNavigateTo(target);
                    }}
                  />
                ) : null}
                {isFelixHall && hallIndex >= 0 ? (
                  <>
                    {renderFelixDoorHeader(
                      `hall-lobby-header-${zone.id}`,
                      centerX,
                      entryWallZ + wallEps - headerOffset,
                      [0, Math.PI, 0],
                      DOOR_OPENING.width,
                    )}
                    <DoorPortal
                      key={`hall-lobby-${zone.id}-${doorTexture?.uuid || "none"}`}
                      position={[centerX, 1.6, entryWallZ + wallEps]}
                      rotation={[0, Math.PI, 0]}
                      title="Zur Lobby"
                      texture={doorTexture}
                      frameOnly
                      fallbackTexture={fallbackDoorTexture}
                      framedTitle
                      showLabel={showDoorLabel}
                      frameMap={frameMap}
                      onEnter={() => {
                        onNavigateTo([centerX, 1.6, entryWallZ]);
                      }}
                    />
                    {felixRoomDoorLabels.length ? (
                      <group>
                        {(() => {
                          return felixRoomDoorLabels.map((entry, i) => {
                            const zPos = entry.centerZ ?? centerZ;
                            const side = entry.side || "right";
                            const isLeft = side === "left";
                            const isRight = side === "right";
                            const isFront = side === "front";
                            const doorPos: [number, number, number] = isFront
                              ? [centerX, 1.6, exitWallZ - wallEps]
                              : isLeft
                                ? [wallLeftX, 1.6, zPos]
                                : [wallRightX, 1.6, zPos];
                            const doorRot: [number, number, number] = isFront
                              ? [0, 0, 0]
                              : isLeft
                                ? [0, Math.PI / 2, 0]
                                : [0, -Math.PI / 2, 0];
                            const headerPos: [number, number, number] = isFront
                              ? [centerX, headerY, exitWallZ - wallEps + headerOffset]
                              : isLeft
                                ? [wallLeftX + headerOffset, headerY, zPos]
                                : [wallRightX - headerOffset, headerY, zPos];
                            return (
                              <group key={`hall-room-${entry.zoneIdx}-${doorTexture?.uuid || "none"}`}>
                                {renderFelixDoorHeader(
                                  `hall-room-header-${entry.zoneIdx}`,
                                  headerPos[0],
                                  headerPos[2],
                                  doorRot,
                                  HALL_ROOM_OPENING_WIDTH,
                                )}
                                <DoorPortal
                                  position={doorPos}
                                  rotation={doorRot}
                                  title={entry.label}
                                  texture={doorTexture}
                                  previewTexture={felixDoorPreview || undefined}
                                  frameOnly
                                  fallbackTexture={fallbackDoorTexture}
                                  framedTitle
                                  openingWidth={HALL_ROOM_OPENING_WIDTH}
                                  showLabel={showDoorLabel}
                                  frameMap={frameMap}
                                  onEnter={() => {
                                    const target: [number, number, number] = isFront
                                      ? [centerX, 1.6, exitWallZ - 0.3]
                                      : isLeft
                                        ? [centerX - halfW + 0.3, 1.6, zPos]
                                        : [centerX + halfW - 0.3, 1.6, zPos];
                                    onNavigateTo(target);
                                  }}
                                />
                              </group>
                            );
                          });
                        })()}
                      </group>
                    ) : null}
                  </>
                ) : null}
                {isLucaHall && lucaHallIndex >= 0 ? (
                  <>
                    <DoorPortal
                      key={`luca-hall-lobby-${zone.id}-${doorTexture?.uuid || "none"}`}
                      position={[wallRightX, 1.6, centerZ]}
                      rotation={[0, -Math.PI / 2, 0]}
                      title="Zur Lobby"
                      texture={doorTexture}
                      frameOnly
                      fallbackTexture={fallbackDoorTexture}
                      framedTitle
                      showLabel={showDoorLabel}
                      frameMap={frameMap}
                      onEnter={() => {
                        onNavigateTo([centerX + halfW - 0.3, 1.6, centerZ]);
                      }}
                    />
                    {lucaRoomDoorLabels.length ? (
                      <group>
                        {(() => {
                          return lucaRoomDoorLabels.map((entry) => {
                            const zPos = entry.centerZ ?? centerZ;
                            return (
                              <DoorPortal
                                key={`luca-hall-room-${entry.zoneIdx}-${doorTexture?.uuid || "none"}`}
                                position={[wallLeftX, 1.6, zPos]}
                                rotation={[0, Math.PI / 2, 0]}
                                title={entry.label}
                                texture={doorTexture}
                                frameOnly
                                fallbackTexture={fallbackDoorTexture}
                                framedTitle
                                openingWidth={HALL_ROOM_OPENING_WIDTH}
                                showLabel={showDoorLabel}
                                frameMap={frameMap}
                                onEnter={() => {
                                  onNavigateTo([centerX - halfW + 0.3, 1.6, zPos]);
                                }}
                              />
                            );
                          });
                        })()}
                      </group>
                    ) : null}
                  </>
                ) : null}

                {isFelixHall && hallLayout && felixRange ? (
                  <>
                    {Array.from({ length: felixRange.count }, (_, i) => {
                      const roomLayout = layout.zones[felixRange.startIndex + i];
                      if (!roomLayout) return null;
                      const side = resolveHallSide(roomLayout, hallLayout);
                      if (side === "right") {
                        const hallRight = hallLayout.centerX + hallLayout.width / 2 - 0.04;
                        const roomLeft = roomLayout.centerX - roomLayout.width / 2 + 0.04;
                        const gap = roomLeft - hallRight;
                        if (gap <= 0.01) return null;
                        return (
                          <DoorTunnel
                            key={`hall-room-tunnel-${roomLayout.zone.id}`}
                            position={[hallRight + gap / 2, DOOR_OPENING.centerY, roomLayout.centerZ]}
                            rotation={[0, Math.PI / 2, 0]}
                            width={HALL_ROOM_OPENING_WIDTH}
                            height={DOOR_OPENING.height}
                            depth={gap}
                            frameMap={frameMap}
                            surfaceMap={wallRightMap || wallTexture || null}
                            floorMap={floorTexture || null}
                            ceilingMap={ceilingTexture || null}
                          />
                        );
                      }
                      if (side === "left") {
                        const hallLeft = hallLayout.centerX - hallLayout.width / 2 + 0.04;
                        const roomRight = roomLayout.centerX + roomLayout.width / 2 - 0.04;
                        const gap = hallLeft - roomRight;
                        if (gap <= 0.01) return null;
                        return (
                          <DoorTunnel
                            key={`hall-room-tunnel-${roomLayout.zone.id}`}
                            position={[hallLeft - gap / 2, DOOR_OPENING.centerY, roomLayout.centerZ]}
                            rotation={[0, Math.PI / 2, 0]}
                            width={HALL_ROOM_OPENING_WIDTH}
                            height={DOOR_OPENING.height}
                            depth={gap}
                            frameMap={frameMap}
                            surfaceMap={wallLeftMap || wallTexture || null}
                            floorMap={floorTexture || null}
                            ceilingMap={ceilingTexture || null}
                          />
                        );
                      }
                      if (side === "front") {
                        const hallExit = hallLayout.endZ - 0.04;
                        const roomEntry = roomLayout.startZ + 0.04;
                        const gap = hallExit - roomEntry;
                        if (gap <= 0.01) return null;
                        return (
                          <DoorTunnel
                            key={`hall-room-tunnel-${roomLayout.zone.id}`}
                            position={[roomLayout.centerX, DOOR_OPENING.centerY, roomEntry + gap / 2]}
                            rotation={[0, 0, 0]}
                            width={HALL_ROOM_OPENING_WIDTH}
                            height={DOOR_OPENING.height}
                            depth={gap}
                            frameMap={frameMap}
                            surfaceMap={wallBackMap || wallFrontMap || wallTexture || null}
                            floorMap={floorTexture || null}
                            ceilingMap={ceilingTexture || null}
                          />
                        );
                      }
                      return null;
                    })}
                  </>
                ) : null}
                {isLucaHall && lucaHallLayout && lucaRange ? (
                  <>
                    {Array.from({ length: lucaRange.count }, (_, i) => {
                      const roomLayout = layout.zones[lucaRange.startIndex + i];
                      if (!roomLayout) return null;
                      const hallLeft = lucaHallLayout.centerX - lucaHallLayout.width / 2 + 0.04;
                      const roomRight = roomLayout.centerX + roomLayout.width / 2 - 0.04;
                      const gap = hallLeft - roomRight;
                      if (gap <= 0.01) return null;
                      return (
                        <DoorTunnel
                          key={`luca-hall-room-tunnel-${roomLayout.zone.id}`}
                          position={[hallLeft - gap / 2, DOOR_OPENING.centerY, roomLayout.centerZ]}
                          rotation={[0, Math.PI / 2, 0]}
                          width={HALL_ROOM_OPENING_WIDTH}
                          height={DOOR_OPENING.height}
                          depth={gap}
                          frameMap={frameMap}
                          surfaceMap={wallLeftMap || wallTexture || null}
                          floorMap={floorTexture || null}
                          ceilingMap={ceilingTexture || null}
                        />
                      );
                    })}
                  </>
                ) : null}
              </>
            )}

          </group>
        );
      })}

      {artistGuideRef ? (
        <GuideSprite
          guideRef={artistGuideRef}
          texture={activeArtistSprite.texture}
          aspect={activeArtistSprite.aspect}
          height={2.55}
          speechLines={{
            title: "Hallo",
            body: "Enter = Interagieren",
          }}
          onSelect={onSelectArtist}
          suppressSpeech={suppressArtistSpeech}
          showSpeech
        />
      ) : null}

      {directorGuideRef ? (
        <GuideSprite
          guideRef={directorGuideRef}
          texture={directorSpriteTexture}
          aspect={directorSpriteAspect}
          height={2.5}
          shadowRadius={0.96}
          onSelect={onSelectDirector}
          suppressSpeech={suppressDirectorSpeech}
          showSpeech={false}
        />
      ) : null}

      {/* Example room cover elements */}
      {isExampleRoom && visibleZoneIds.has(activeZoneIndex)
        ? exampleCovers.map((cover, idx) => (
            <mesh key={`cover-${idx}`} position={cover.position as [number, number, number]}>
              <boxGeometry args={cover.size as [number, number, number]} />
              <meshStandardMaterial color="#2b2f3a" roughness={0.6} metalness={0.2} />
            </mesh>
          ))
        : null}

      {/* Example room enemies */}
      {isExampleRoom && !gameWon
        ? enemyAlive.map((alive, idx) => (
            <EnemySprite
              key={`enemy-${idx}`}
              runtimeRef={enemiesRef}
              index={idx}
              texture={artistSpriteTextures[idx] || artistSpriteTextures[0] || null}
              aspect={artistSpriteAspects[idx] || artistSpriteAspects[0] || 0.65}
              down={!alive}
            />
          ))
        : null}

      {/* Enemy lasers */}
      {isExampleRoom && !gameWon
        ? enemyAlive.map((alive, idx) => (
            <LaserLine
              key={`enemy-laser-${idx}`}
              color="#ff3b3b"
              getSegment={() => {
                const enemy = enemiesRef.current[idx];
                if (!enemy || !alive) {
                  return { start: new Vector3(), end: new Vector3(), visible: false };
                }
                const start = enemy.position.clone().add(new Vector3(0, 1.1, 0));
                const duration = enemy.laserDuration || 0.4;
                const progress = duration > 0 ? 1 - enemy.laserTimer / duration : 1;
                const maxDist = enemy.laserMaxDist || 12;
                const coverLimit = getCoverHitDist(start, enemy.laserDir, maxDist, exampleCoverBoxes);
                const length = Math.min(coverLimit, maxDist * clamp(progress, 0, 1));
                const end = start.clone().add(enemy.laserDir.clone().multiplyScalar(length));
                return { start, end, visible: enemy.laserTimer > 0 };
              }}
            />
          ))
        : null}

      {/* Player laser */}
      {isExampleRoom ? (
        <LaserLine
          color="#4cff6a"
          getSegment={() => {
            const laser = playerLaserRef.current;
            const duration = laser.duration || 0.5;
            const progress = duration > 0 ? 1 - laser.timer / duration : 1;
            const maxDist = laser.maxDist || 26;
            const coverLimit = getCoverHitDist(laser.origin, laser.dir, maxDist, exampleCoverBoxes);
            const length = Math.min(coverLimit, maxDist * clamp(progress, 0, 1));
            const start = laser.origin.clone();
            const end = start.clone().add(laser.dir.clone().multiplyScalar(length));
            return { start, end, visible: laser.timer > 0 && laser.delayTimer <= 0 };
          }}
        />
      ) : null}

      {/* Frames */}
      {layout.zones.map((z) => {
        const zoneId = z.index;
        if (!visibleZoneIds.has(zoneId)) return null;
        const placements = placementsByZone.get(zoneId) || [];
        return placements.map((p) => (
          <LazyExhibitFrame
            key={p.artwork.id}
            placement={p}
            zoneIndex={zoneId}
            onSelect={onSelectArtwork}
            onFrameLoaded={onFrameLoaded}
            disableClick={interactionMode === "keyboard"}
          />
        ));
      })}

      {/* Ad room empty frames */}
      {layout.zones.map((z) => {
        const zoneId = z.index;
        if (!visibleZoneIds.has(zoneId)) return null;
        if (z.zone.artistId !== "example-room") return null;
        const slots = adFrameSlotsByZone.get(zoneId) || [];
        return slots.map((slot, idx) => (
          <AdFrame
            key={`ad-frame-${zoneId}-${idx}`}
            position={slot.position}
            rotation={slot.rotation}
            label="Hier koennte deine Kunst stehen ;)"
          />
        ));
      })}

      {/* Lobby doors to artists (square lobby -> entry wall) */}
      {layout.zones[0]?.zone.id === "lobby" && activeZoneIndex === 0 ? (
        <group>
          {(() => {
            const lobby = layout.zones[0];
            const entryWallZ = lobby.startZ + 0.12;
            const exitWallZ = lobby.endZ - 0.12;
            const lobbyCenterX = lobby.centerX ?? 0;
            const lobbyLeftX = lobbyCenterX - lobby.width / 2 + 0.04;
            const hallEntry = hallIndex >= 0 ? { label: "Felix Flur", target: hallIndex } : null;
            const otherEntries = artistRoomRanges
              .filter((range) => range.artistId !== "felix" && range.artistId !== "luca")
              .map((range) => ({ label: range.artistName, target: range.startIndex }));
            const entries = otherEntries;
            const wallEps = 0.01;
            const count = entries.length || 1;
            const spacing = Math.min(6.0, (lobby.width - 4) / Math.max(count, 1));
            const frontDoors = entries.map((entry, idx) => {
              const offset = (idx - (count - 1) / 2) * spacing;
              const x = lobbyCenterX + offset;
              const z = entryWallZ + wallEps;
              const rot = Math.PI;
              const roomLayout = layout.zones[entry.target];
              const targetZ = roomLayout ? roomLayout.centerZ : lobby.centerZ;
              const target: [number, number, number] = [x, 1.6, targetZ];
              return (
                  <DoorPortal
                    key={`lobby-door-${entry.label}-${(lobbyDoorTexture || doorTexture)?.uuid || "none"}`}
                    position={[x, 1.6, z]}
                    rotation={[0, rot, 0]}
                    title={entry.label}
                    texture={lobbyDoorTexture || doorTexture}
                    fallbackTexture={fallbackDoorTexture}
                    framedTitle
                    showLabel={activeZoneIndex === 0}
                    frameMap={doorFrameTexture}
                    badgeSrc="/artist/wappen.png"
                    badgeSize={72}
                    onEnter={() => onNavigateTo(target)}
                  />
              );
            });
                  const hallDoor = hallEntry
                    ? (() => {
                      const x = lobbyCenterX;
                      return (
                        <DoorPortal
                          key={`lobby-door-felix-hall-${(lobbyDoorTexture || doorTexture)?.uuid || "none"}`}
                          position={[x, 1.6, exitWallZ - wallEps]}
                          rotation={[0, 0, 0]}
                          title="Felix Flur"
                          texture={lobbyDoorTexture || doorTexture}
                          frameOnly
                          fallbackTexture={fallbackDoorTexture}
                          framedTitle
                          showLabel={activeZoneIndex === 0}
                          frameMap={doorFrameTexture}
                          badgeSrc="/artist/wappen.png"
                          badgeSize={72}
                          onEnter={() => onNavigateTo([x, 1.6, exitWallZ])}
                        />
                      );
                })()
              : null;
            const lucaHallDoor =
              lucaHallIndex >= 0
                ? (() => {
                    return (
                      <DoorPortal
                        key={`lobby-door-luca-hall-${(lobbyDoorTexture || doorTexture)?.uuid || "none"}`}
                        position={[lobbyLeftX, 1.6, lobby.centerZ]}
                        rotation={[0, Math.PI / 2, 0]}
                        title="Luca Flur"
                        texture={lobbyDoorTexture || doorTexture}
                        frameOnly
                        fallbackTexture={fallbackDoorTexture}
                        framedTitle
                        openingWidth={DOOR_OPENING.width}
                        openingHeight={DOOR_OPENING.height}
                        showLabel={activeZoneIndex === 0}
                        frameMap={doorFrameTexture}
                        badgeSrc="/artist/wappen.png"
                        badgeSize={72}
                        onEnter={() => onNavigateTo([lobbyLeftX + 0.2, 1.6, lobby.centerZ])}
                      />
                    );
                  })()
                : null;
            return (
              <>
                {frontDoors}
                {hallDoor}
                {lucaHallDoor}
              </>
            );
          })()}
        </group>
      ) : null}

      {/* Lobby extras removed for now */}
    </group>
  );
}

function LazyExhibitFrame({
  placement,
  zoneIndex,
  onSelect,
  onFrameLoaded,
  disableClick = false,
}: {
  placement: Placement;
  zoneIndex: number;
  onSelect: (
    artworkId: string,
    focus: { position: [number, number, number]; rotation: [number, number, number]; width: number; height: number },
  ) => void;
  onFrameLoaded?: (zoneIndex: number) => void;
  disableClick?: boolean;
}) {
  return (
    <ExhibitFrame
      artwork={placement.artwork}
      position={placement.position}
      rotation={placement.rotation}
      frameStyle={placement.frameStyle}
      recessed={placement.recessed}
      onSelect={onSelect}
      onTextureReady={() => onFrameLoaded?.(zoneIndex)}
      disableClick={disableClick}
    />
  );
}
