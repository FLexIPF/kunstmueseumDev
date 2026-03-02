"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DoubleSide, Texture } from "three";

import type { Artwork } from "@/content/types";
import { getCachedTexture, loadTextureWithRetry, subscribeTextureCache } from "@/components/museum/textureCache";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function computeAspect(a: Artwork): number {
  if (typeof a.aspect === "number" && a.aspect > 0) return a.aspect;
  if (a.widthCm && a.heightCm && a.heightCm > 0) return a.widthCm / a.heightCm;
  return 1.25;
}

export function ExhibitFrame({
  artwork,
  position,
  rotation,
  frameStyle = "minimal",
  recessed = false,
  onSelect,
  onTextureReady,
  disableClick = false,
}: {
  artwork: Artwork;
  position: [number, number, number];
  rotation: [number, number, number];
  frameStyle?: "minimal" | "industrial" | "ornate";
  recessed?: boolean;
  onSelect: (
    artworkId: string,
    focus: { position: [number, number, number]; rotation: [number, number, number]; width: number; height: number },
  ) => void;
  onTextureReady?: () => void;
  disableClick?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [cacheTick, setCacheTick] = useState(0);
  const reportedRef = useRef(false);
  const onReadyRef = useRef(onTextureReady);

  useEffect(() => {
    onReadyRef.current = onTextureReady;
  }, [onTextureReady]);

  useEffect(() => {
    return subscribeTextureCache(() => {
      setCacheTick((c) => c + 1);
    });
  }, []);

  const tex = getCachedTexture(artwork.images.texture) || null;

  useEffect(() => {
    if (!tex) return;
    if (!reportedRef.current) {
      reportedRef.current = true;
      onReadyRef.current?.();
    }
  }, [tex, cacheTick]);

  const aspect = useMemo(() => {
    const img = tex?.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) {
      return img.width / img.height;
    }
    return computeAspect(artwork);
  }, [artwork, tex, cacheTick]);
  const height = 1.75;
  const width = clamp(height * aspect, 1.1, 2.8);
  const frameDepth = frameStyle === "ornate" ? 0.22 : frameStyle === "industrial" ? 0.18 : 0.14;
  const frameBorder = frameStyle === "ornate" ? 0.32 : frameStyle === "industrial" ? 0.26 : 0.22;
  const planeZ = recessed ? frameDepth / 2 - 0.08 : frameDepth / 2 + 0.02;

  useEffect(() => {
    let cancelled = false;
    reportedRef.current = false;

    const cached = getCachedTexture(artwork.images.texture);
    if (cached) {
      if (!reportedRef.current) {
        reportedRef.current = true;
        onReadyRef.current?.();
      }
      return () => {
        cancelled = true;
      };
    }

    loadTextureWithRetry(artwork.images.texture, { maxRetries: Infinity, retryIntervalMs: 1000 })
      .then(() => {
        if (cancelled) return;
        if (!reportedRef.current && getCachedTexture(artwork.images.texture)) {
          reportedRef.current = true;
          onReadyRef.current?.();
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (!reportedRef.current) {
          reportedRef.current = true;
          onReadyRef.current?.();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artwork.images.texture]);

  const frameColor =
    frameStyle === "ornate"
      ? hovered
        ? "#e0c06a"
        : "#c7a64d"
      : hovered
        ? "#2b2b34"
        : "#1a1a20";
  const innerTrimColor = frameStyle === "ornate" ? (hovered ? "#2a2220" : "#1b1716") : "#000000";
  const matColor = "#ffffff";
  const sold = artwork.status === "sold";

  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <mesh position={[0, 0, 0.0]}>
        <boxGeometry args={[width + frameBorder, height + frameBorder, frameDepth]} />
        <meshStandardMaterial
          color={frameColor}
          roughness={0.55}
          metalness={frameStyle === "industrial" ? 0.35 : 0.18}
          emissive={hovered ? frameColor : "#000000"}
          emissiveIntensity={frameStyle === "ornate" ? 0.22 : 0.18}
        />
      </mesh>

      {/* Inner trim for ornate frames */}
      {frameStyle === "ornate" ? (
        <mesh position={[0, 0, frameDepth / 2 - 0.05]}>
          <boxGeometry args={[width + 0.12, height + 0.12, 0.06]} />
          <meshStandardMaterial color={innerTrimColor} roughness={0.85} metalness={0.05} />
        </mesh>
      ) : null}

      {/* Recess/backplate for "built-in" castle frames */}
      {recessed ? (
        <mesh position={[0, 0, frameDepth / 2 - 0.12]}>
          <boxGeometry args={[width + 0.10, height + 0.10, 0.05]} />
          <meshStandardMaterial color="#0e0e12" roughness={0.98} metalness={0.0} />
        </mesh>
      ) : null}

      {/* Artwork plane */}
      <mesh
        position={[0, 0, planeZ]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        onClick={
          disableClick
            ? undefined
            : (e) => {
                e.stopPropagation();
                onSelect(artwork.id, { position, rotation, width, height });
              }
        }
      >
        <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={tex || undefined}
        color={matColor}
        roughness={0.72}
        metalness={0.0}
        emissive={sold ? "#000000" : "#1c1c22"}
        emissiveIntensity={sold ? 0.0 : 0.35}
        side={DoubleSide}
      />
    </mesh>

      {/* SOLD marker (no text in 3D, just a subtle badge) */}
      {sold ? (
        <mesh position={[width / 2 - 0.20, height / 2 - 0.20, frameDepth / 2 + 0.05]}>
          <planeGeometry args={[0.28, 0.28]} />
          <meshStandardMaterial color="#a32222" emissive="#a32222" emissiveIntensity={0.65} />
        </mesh>
      ) : null}
    </group>
  );
}
