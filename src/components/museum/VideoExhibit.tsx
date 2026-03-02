"use client";

import { useEffect, useRef, useState } from "react";
import { SRGBColorSpace, Texture, VideoTexture } from "three";

function configureTexture(tex: Texture) {
  (tex as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
}

export function VideoExhibit({
  src,
  position,
  rotation,
  width,
  height,
  framed = true,
  autoplay = true,
  playbackRate = 1,
}: {
  src: string;
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  framed?: boolean;
  autoplay?: boolean;
  playbackRate?: number;
}) {
  const [tex, setTex] = useState<Texture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement("video");
    video.src = src;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.autoplay = autoplay;
    videoRef.current = video;

    const texture = new VideoTexture(video);
    configureTexture(texture);
    if (!cancelled) {
      setTex(texture);
    }

    const onLoaded = () => {
      video.playbackRate = playbackRate;
      if (autoplay) {
        video.play().catch(() => {});
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("canplay", onLoaded);

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("canplay", onLoaded);
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
      if (videoRef.current === video) {
        videoRef.current = null;
      }
    };
  }, [src, autoplay, playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
    if (autoplay && typeof video.play === "function") {
      video.play().catch(() => {});
    }
  }, [autoplay, playbackRate]);

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={tex || undefined}
          roughness={0.7}
          metalness={0.0}
          emissive="#1a1a1a"
          emissiveIntensity={0.2}
        />
      </mesh>

      {framed ? (
        <mesh position={[0, 0, -0.06]}>
          <boxGeometry args={[width + 0.22, height + 0.22, 0.14]} />
          <meshStandardMaterial color="#1c1a18" roughness={0.6} metalness={0.2} />
        </mesh>
      ) : null}

      {null}
    </group>
  );
}
