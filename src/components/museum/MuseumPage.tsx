"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { ArtworkModal } from "@/components/artwork/ArtworkModal";
import { ArtistModal } from "@/components/artist/ArtistModal";
import { DirectorModal } from "@/components/museum/DirectorModal";
import { MuseumCanvas } from "@/components/museum/MuseumCanvas";
import { gallery, artistRoomRanges } from "@/content/museum";
import { ARTIST_PHOTO_IDS, artworks, getArtwork } from "@/content/artworks";
import { getArtist } from "@/content/artists";
import { packs } from "@/content/artist_packs";
import { buildArtworksByZone } from "@/components/museum/artworkAssignments";

export function MuseumPage() {
  const [shooterInfo, setShooterInfo] = useState<{
    active: boolean;
    score: number;
    total: number;
    playerHits: number;
    health: number;
    healthMax: number;
    dead: boolean;
    gameWon: boolean;
  }>({ active: false, score: 0, total: 0, playerHits: 0, health: 30, healthMax: 30, dead: false, gameWon: false });
  const [shooterResetToken, setShooterResetToken] = useState(0);
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [activeZone, setActiveZone] = useState(0);
  const [debugInfo, setDebugInfo] = useState<{
    frameCount: number;
    lastFrameAt: number;
    camera: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  } | null>(null);
  const [loadedFrames, setLoadedFrames] = useState(0);
  const [debug, setDebug] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [rootPresent, setRootPresent] = useState(false);
  const [canvasCount, setCanvasCount] = useState(0);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [zoom, setZoom] = useState(0.5);
  const [loading, setLoading] = useState(true);
  const [lobbyReady, setLobbyReady] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [touchMove, setTouchMove] = useState({ forward: false, back: false, left: false, right: false });
  const [moveStick, setMoveStick] = useState({ x: 0, y: 0 });
  const [lookStick, setLookStick] = useState({ x: 0, y: 0 });
  const [actionToken, setActionToken] = useState(0);
  const [doorToken] = useState(0);
  const [touchSprint, setTouchSprint] = useState(false);
  const [interactionHint, setInteractionHint] = useState<{ type: "artwork" | "door" | "artist" | "director" | null; label?: string }>({
    type: null,
  });
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [selectedDirectorId, setSelectedDirectorId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapArtistId, setMapArtistId] = useState<string>(() => packs[0]?.artist.id || "felix");
  const [jumpToken, setJumpToken] = useState(0);
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{
    zoneIndex: number;
    imagesLoaded: number;
    imagesTotal: number;
    wallsLoaded: number;
    wallsTotal: number;
    overallLoaded: number;
    overallTotal: number;
    percent: number;
  } | null>(null);
  const [museumMode, setMuseumMode] = useState(false);
  const [startToken, setStartToken] = useState(0);
  const [canvasInfo, setCanvasInfo] = useState<{
    created: boolean;
    componentMounted?: boolean;
    canvasPresent?: boolean;
    width: number;
    height: number;
    dpr: number;
    glVersion?: string;
    renderer?: string;
    vendor?: string;
  } | null>(null);
  const [canvasRect, setCanvasRect] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [hitTest, setHitTest] = useState<string>("-");
  const [lastError, setLastError] = useState<string | null>(null);
  const showLoader = loading || !lobbyReady;
  const loaderLabel = !lobbyReady ? "Lobby lädt…" : "Raum lädt…";
  const exampleZoneIndex = gallery.zones.findIndex((zone) => zone.artistId === "example-room");
  const healthRatio = shooterInfo.healthMax ? shooterInfo.health / shooterInfo.healthMax : 0;
  const healthColor =
    healthRatio > 0.8
      ? "#4cff6a"
      : healthRatio > 0.6
        ? "#b7ff5a"
        : healthRatio > 0.4
          ? "#ffe86a"
          : healthRatio > 0.2
            ? "#ff9a3b"
            : "#ff3b3b";

  const artists = packs.map((p) => p.artist);
  const roomsForArtist = gallery.zones
    .map((zone, idx) => ({ zone, idx }))
    .filter(({ zone }) => zone.artistId === mapArtistId);
  const artworksByZone = React.useMemo(() => buildArtworksByZone(gallery, artworks), [gallery, artworks]);

  const clampStick = (v: number) => Math.max(-1, Math.min(1, v));

  useEffect(() => {
    const threshold = 0.18;
    setTouchMove({
      forward: moveStick.y < -threshold,
      back: moveStick.y > threshold,
      left: moveStick.x < -threshold,
      right: moveStick.x > threshold,
    });
  }, [moveStick]);
  const handleCanvasInfo = React.useCallback(
    (info: {
      created: boolean;
      componentMounted?: boolean;
      canvasPresent?: boolean;
      width: number;
      height: number;
      dpr: number;
      glVersion?: string;
      renderer?: string;
      vendor?: string;
    }) => {
      setCanvasInfo(info);
    },
    [],
  );
  const handleDebugUpdate = React.useCallback(
    (data: {
      frameCount: number;
      lastFrameAt: number;
      camera: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
    }) => {
      setDebugInfo(data);
    },
    [],
  );
  const handleLoadingProgress = useCallback(
    (info: {
      zoneIndex: number;
      imagesLoaded: number;
      imagesTotal: number;
      wallsLoaded: number;
      wallsTotal: number;
      overallLoaded: number;
      overallTotal: number;
      percent: number;
    }) => {
      setLoadingProgress(info);
    },
    [],
  );

  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      setWebglOk(Boolean(gl));
    } catch {
      setWebglOk(false);
    }
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setDebug(params.get("debug") === "1");
      setDebugEnabled(params.get("debug") === "1");
    } catch {
      setDebug(false);
      setDebugEnabled(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const lobby = gallery.zones[0];
    if (!lobby) {
      setLobbyReady(true);
      return;
    }
    const urls = [
      lobby.wallTexture,
      lobby.wallTextureAlt,
      lobby.wallTextureLeft,
      lobby.wallTextureRight,
      lobby.wallTextureFront,
      lobby.wallTextureBack,
      lobby.floorTexture,
      lobby.ceilingTexture,
      "/backgrounds/lobby-door.jpg",
      "/backgrounds/door.jpg",
    ].filter(Boolean) as string[];
    if (!urls.length) {
      setLobbyReady(true);
      return;
    }
    let remaining = new Set(urls);
    let cancelled = false;
    urls.forEach((src) => {
      const img = new Image();
      const done = () => {
        if (cancelled) return;
        remaining.delete(src);
        if (remaining.size === 0) setLobbyReady(true);
      };
      img.onload = done;
      img.onerror = done;
      img.src = src;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    setIsTouch(Boolean(coarse || touch));
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const enabled = museumMode && isTouch;
    document.body.classList.toggle("museum-fullscreen", enabled);
    return () => document.body.classList.remove("museum-fullscreen");
  }, [museumMode, isTouch]);

  useEffect(() => {
    if (!museumMode) {
      setTouchSprint(false);
    }
  }, [museumMode]);

  useEffect(() => {
    if (!shooterInfo.dead) return;
    if (typeof document === "undefined") return;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }, [shooterInfo.dead]);

  useEffect(() => {
    if (!debug) return;
    const timer = window.setInterval(() => {
      const root = document.querySelector("#r3f-root");
      const canvas = root ? root.querySelector("canvas") : document.querySelector("canvas");
      setRootPresent(Boolean(root));
      setCanvasCount(document.getElementsByTagName("canvas").length);
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setCanvasRect({ width: Math.round(rect.width), height: Math.round(rect.height) });
      } else {
        setCanvasRect(null);
      }
      const el = document.elementFromPoint(20, 20);
      setHitTest(el ? el.tagName.toLowerCase() : "-");
    }, 800);
    return () => window.clearInterval(timer);
  }, [debug]);

  useEffect(() => {
    if (!debug) return;
    if (canvasInfo?.created) return;
    if (canvasInfo?.componentMounted) return;
    if (canvasCount > 0) return;
    const timer = window.setTimeout(() => {
      // Force a remount only if the canvas never mounted at all.
      setCanvasKey((k) => k + 1);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [debug, canvasInfo?.created, canvasInfo?.componentMounted, canvasCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const zone = gallery.zones[activeZone];
    const label = museumMode ? zone?.title || "Museum" : "Museum";
    window.dispatchEvent(new CustomEvent("museum:zone", { detail: { label } }));
  }, [activeZone, museumMode]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ zoneIndex?: number }>;
      const idx = custom.detail?.zoneIndex;
      if (typeof idx === "number") {
        setJumpTarget(idx);
        setJumpToken((t) => t + 1);
      }
    };
    window.addEventListener("museum:jump", handler as EventListener);
    return () => window.removeEventListener("museum:jump", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!mapOpen) return;
    setSelectedArtworkId(null);
    setSelectedArtistId(null);
    setSelectedDirectorId(null);
    const zone = gallery.zones[activeZone];
    if (zone?.artistId) {
      setMapArtistId(zone.artistId);
    }
    if (typeof document !== "undefined" && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [mapOpen, activeZone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM") return;
      if (!museumMode) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setMapOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [museumMode]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (event.error) {
        setLastError(String(event.error.message || event.error));
      } else if (event.message) {
        setLastError(String(event.message));
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      setLastError(String(event.reason || "Unhandled rejection"));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (isTouch) {
      setZoom(0.4);
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (!museumMode) return;
      const delta = event.deltaY * 0.002;
      setZoom((z) => Math.max(0, Math.min(1, z + delta)));
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [museumMode, isTouch]);

  useEffect(() => {
    if (!isTouch) return;
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);
    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
    };
  }, [isTouch]);

  const selectedArtwork = selectedArtworkId ? getArtwork(selectedArtworkId) : undefined;
  const selectedArtist = selectedArtistId ? getArtist(selectedArtistId) : undefined;
  const directorSelected = Boolean(selectedDirectorId);
  const selectedArtistRoomInfo = React.useMemo(() => {
    if (!selectedArtistId) return { roomLabel: "", roomText: "", photoArtwork: undefined };
    const hallIndex = gallery.zones.findIndex((z) => z.id === "felix-hall");
    if (activeZone === hallIndex) {
      return {
        roomLabel: "Felix Flur",
        roomText:
          "Hallo, willkommen im Felix-Museumsfluegel. Von hier gelangst du zu den Gemaelden. Betrete die Raeume oder nutze die Karte (M). Die Ausstellung ist nach Jahren pro Raum geordnet.",
        photoArtwork: getArtwork("other-portraitatelier"),
      };
    }
    const range = artistRoomRanges.find((r) => r.artistId === selectedArtistId);
    if (!range) return { roomLabel: "", roomText: "", photoArtwork: undefined };
    const offset = activeZone - range.startIndex;
    if (offset < 0 || offset >= range.count) return { roomLabel: "", roomText: "", photoArtwork: undefined };
    const roomNumber = offset + 1;
    const list = artworksByZone[activeZone] || [];
    const years = list.map((a) => a.year).filter((y): y is number => typeof y === "number");
    const unique = Array.from(new Set(years)).sort((a, b) => a - b);
    let yearText = "Eine Auswahl meiner Arbeiten";
    if (unique.length === 1) yearText = `Bilder aus ${unique[0]}`;
    else if (unique.length === 2) yearText = `Bilder aus ${unique[0]} und ${unique[1]}`;
    else if (unique.length >= 3) yearText = `Bilder aus ${unique[0]}–${unique[unique.length - 1]}`;
    const preferredSequence = [
      "other-atelier-impression",
      "other-portraitatelier",
      "other-portraita",
      "other-portrait-b",
      "other-atelier-impression",
      "other-portraitatelier",
    ];
    const lucaPhotos = ["luca-portrait-1", "luca-portrait-2"];
    const photoPool =
      selectedArtistId === "luca"
        ? lucaPhotos
        : selectedArtistId === "felix"
          ? preferredSequence
          : ARTIST_PHOTO_IDS;
    const photoId = photoPool.length ? photoPool[(roomNumber - 1) % photoPool.length] : undefined;
    const photoArtwork = photoId ? getArtwork(photoId) : undefined;
    return {
      roomLabel: `Willkommen in Raum ${roomNumber}.`,
      roomText: `Hallo, hier siehst du ${yearText}.`,
      photoArtwork,
    };
  }, [selectedArtistId, activeZone, artworksByZone, gallery.zones]);

  const fullHeight = "calc(var(--vh, 1vh) * 100)";
  const wrapperStyle: React.CSSProperties =
    museumMode && isTouch
      ? {
          position: "fixed",
          inset: 0,
          width: "100%",
          height: fullHeight,
        }
      : {
          height: "calc(100vh - 60px)",
        };

  return (
    <div style={wrapperStyle}>
      <div style={{ position: "relative", height: "100%" }}>
        {museumMode && gallery.zones[activeZone]?.artistId === "example-room" ? (
          <div style={{ position: "absolute", inset: 0, pointerEvents: shooterInfo.dead ? "auto" : "none", zIndex: 2000 }}>
            <div
              style={{
                position: "absolute",
                top: 20,
                left: 20,
                color: "white",
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              <div>
                Treffer Figuren: {shooterInfo.score} / {shooterInfo.total}
              </div>
              <div style={{ marginTop: 6, opacity: 0.85 }}>Treffer auf mich: {shooterInfo.playerHits}</div>
              {shooterInfo.gameWon ? <div style={{ marginTop: 6, opacity: 0.85 }}>Gewonnen!</div> : null}
              <div style={{ marginTop: 10, opacity: 0.7, textTransform: "none", letterSpacing: "0.06em" }}>
                Bewegung: WASD/Pfeile · Blick: Maus · Schuss: Klick · Karte: M
              </div>
            </div>
            {!shooterInfo.dead ? (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 36,
                    height: 36,
                    filter: "drop-shadow(0 0 8px rgba(80,255,140,0.95))",
                  }}
                >
                  <div style={{ position: "absolute", left: 17, top: 0, width: 2, height: 36, background: "rgba(80,255,140,0.98)" }} />
                  <div style={{ position: "absolute", top: 17, left: 0, width: 36, height: 2, background: "rgba(80,255,140,0.98)" }} />
                  <div style={{ position: "absolute", left: 16, top: 16, width: 4, height: 4, borderRadius: 999, background: "rgba(80,255,140,0.98)" }} />
                </div>
                <img
                  src="/artist/gunCartoon.png"
                  alt=""
                  style={{
                    position: "absolute",
                    right: "20%",
                    bottom: -130,
                    width: "36vw",
                    maxWidth: 420,
                    minWidth: 220,
                    height: "auto",
                    opacity: 0.98,
                    filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.6))",
                  }}
                />
              </>
            ) : null}
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 22,
                transform: "translateX(-50%)",
                width: 320,
                maxWidth: "80vw",
              }}
            >
              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  overflow: "hidden",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(0, Math.min(1, healthRatio)) * 100}%`,
                    background: healthColor,
                    transition: "width 0.12s ease-out",
                  }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 10, textAlign: "center", opacity: 0.8 }}>
                Leben: {shooterInfo.health} / {shooterInfo.healthMax}
              </div>
            </div>
            {shooterInfo.dead ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "auto",
                  zIndex: 2400,
                }}
              >
                <div
                  style={{
                    padding: 20,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(12,12,16,0.8)",
                    color: "white",
                    textAlign: "center",
                    minWidth: 260,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 8 }}>
                    Du wurdest gekillt
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 16 }}>Try again oder zurück zur Lobby?</div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button
                      className="pill pill-cta"
                      onClick={() => {
                        setShooterResetToken(Date.now());
                        if (exampleZoneIndex >= 0) {
                          setJumpTarget(exampleZoneIndex);
                          setJumpToken(Date.now());
                        }
                      }}
                    >
                      Try again
                    </button>
                    <button
                      className="pill"
                      onClick={() => {
                        setShooterResetToken(Date.now());
                        setJumpTarget(0);
                        setJumpToken(Date.now());
                      }}
                    >
                      Lobby
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {mounted ? (
          <CanvasErrorBoundary onError={(msg) => setLastError(msg)}>
            <MuseumCanvas
              key={canvasKey}
              gallery={gallery}
              artworks={artworks}
              onSelectArtwork={(id: string) => setSelectedArtworkId(id)}
              onSelectArtist={(id: string) => setSelectedArtistId(id)}
              onSelectDirector={(id: string) => setSelectedDirectorId(id)}
              onZoneChange={(idx: number) => setActiveZone(idx)}
              onExitMuseum={() => {
                setMuseumMode(false);
                setSelectedArtworkId(null);
              }}
              onInteractionHint={(hint) => setInteractionHint(hint)}
              onWebglContextLost={() => setWebglOk(false)}
              onWebglContextRestored={() => setWebglOk(true)}
              onDebugUpdate={handleDebugUpdate}
              debugEnabled={debugEnabled}
              onFrameLoaded={() => setLoadedFrames((c) => c + 1)}
              onCanvasInfo={(info: {
                created: boolean;
                componentMounted?: boolean;
                canvasPresent?: boolean;
                width: number;
                height: number;
                dpr: number;
                glVersion?: string;
                renderer?: string;
                vendor?: string;
              }) => handleCanvasInfo(info)}
              zoom={zoom}
              onLoadingChange={(value) => setLoading(value)}
              onLoadingProgress={handleLoadingProgress}
              onShooterUpdate={setShooterInfo}
              shooterResetToken={shooterResetToken}
              museumMode={museumMode}
              startToken={startToken}
              uiActive={Boolean(selectedArtworkId || selectedArtistId || selectedDirectorId || mapOpen)}
              virtualMove={{ ...touchMove, sprint: touchSprint }}
              virtualLook={isTouch ? lookStick : undefined}
              touchMode={isTouch}
              actionToken={actionToken}
              doorToken={doorToken}
              directorSelected={directorSelected}
              jumpToken={jumpToken}
              jumpTarget={jumpTarget ?? undefined}
            />
          </CanvasErrorBoundary>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.7)" }}>
            3D wird geladen...
          </div>
        )}

        {!((museumMode && isTouch)) ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
            }}
          >
            <div className="shell" style={{ padding: "14px 0 18px" }}>
              <div
                className="card"
                style={{
                  padding: 14,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                    {"Museum"}
                  </div>
                  <div style={{ color: "var(--muted-2)", fontSize: 13, lineHeight: 1.5 }}>
                    Steuerung: Pfeiltasten/WASD = laufen. Maus = umsehen. Scroll = Zoom. Enter = Bild öffnen. E = Tür nutzen. M = Map. ESC = Lobby.
                    <div style={{ marginTop: 4, color: "var(--muted)" }}>Raumwechsel: E (wenn du vor einer Tür stehst).</div>
                    <div style={{ marginTop: 6, color: "var(--muted-2)" }}>
                      Hinweis: Spaß‑Baustelle / Entwicklungsprojekt, noch nicht final.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", pointerEvents: "auto" }} />
              </div>
            </div>
          </div>
        ) : null}

        {showLoader ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <video
              src="/video/helloworld.mp4"
              autoPlay
              muted
              loop
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.95,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 30,
                right: 30,
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(0,0,0,0.55)",
                color: "white",
                fontFamily: "var(--font-display)",
                letterSpacing: "0.16em",
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              {loaderLabel}
            </div>
            {loadingProgress ? (
              <div
                style={{
                  position: "absolute",
                  bottom: 30,
                  left: 30,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(0,0,0,0.55)",
                  color: "white",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  minWidth: 180,
                }}
              >
                <div style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 10 }}>
                  Progress
                </div>
                <div style={{ marginBottom: 6 }}>
                  Bilder {loadingProgress.imagesLoaded}/{loadingProgress.imagesTotal}
                </div>
                <div style={{ marginBottom: 8 }}>
                  Wände {loadingProgress.wallsLoaded}/{loadingProgress.wallsTotal}
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 999 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(loadingProgress.percent * 100)}%`,
                      background: "rgba(255,255,255,0.8)",
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                  {Math.round(loadingProgress.percent * 100)}%
                </div>
                <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
                  Bitte warten, bis alle Bilder geladen sind.
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {museumMode && interactionHint.type ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: isTouch ? "calc(40px + env(safe-area-inset-bottom))" : 40,
              transform: "translateX(-50%)",
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(12,12,18,0.75)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "white",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              pointerEvents: "none",
            }}
          >
            {interactionHint.type === "door"
              ? `E – ${interactionHint.label || "Tür"}`
              : interactionHint.type === "director"
                ? "Enter – Direktor"
              : interactionHint.type === "artist"
                ? "Enter – Kuenstler"
                : "Enter – Bild öffnen"}
          </div>
        ) : null}

        {museumMode && isTouch ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 35,
              padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "calc(20px + env(safe-area-inset-left))",
                bottom: "calc(24px + env(safe-area-inset-bottom))",
                width: 110,
                height: 110,
                pointerEvents: "auto",
                touchAction: "none",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(12,12,18,0.55)",
                backdropFilter: "blur(6px)",
              }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                const r = rect.width / 2;
                setMoveStick({ x: clampStick(dx / r), y: clampStick(dy / r) });
              }}
              onPointerMove={(e) => {
                if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                const r = rect.width / 2;
                setMoveStick({ x: clampStick(dx / r), y: clampStick(dy / r) });
              }}
              onPointerUp={(e) => {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
                setMoveStick({ x: 0, y: 0 });
              }}
              onPointerLeave={() => setMoveStick({ x: 0, y: 0 })}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  transform: `translate(calc(-50% + ${moveStick.x * 28}px), calc(-50% + ${moveStick.y * 28}px))`,
                  background: "rgba(255,255,255,0.6)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                }}
              />
            </div>

            <div
              style={{
                position: "absolute",
                right: "calc(20px + env(safe-area-inset-right))",
                bottom: "calc(24px + env(safe-area-inset-bottom))",
                width: 110,
                height: 110,
                pointerEvents: "auto",
                touchAction: "none",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(12,12,18,0.55)",
                backdropFilter: "blur(6px)",
              }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                const r = rect.width / 2;
                setLookStick({ x: clampStick(dx / r), y: clampStick(dy / r) });
              }}
              onPointerMove={(e) => {
                if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                const r = rect.width / 2;
                setLookStick({ x: clampStick(dx / r), y: clampStick(dy / r) });
              }}
              onPointerUp={(e) => {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
                setLookStick({ x: 0, y: 0 });
              }}
              onPointerLeave={() => setLookStick({ x: 0, y: 0 })}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  transform: `translate(calc(-50% + ${lookStick.x * 28}px), calc(-50% + ${lookStick.y * 28}px))`,
                  background: "rgba(255,255,255,0.6)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                }}
              />
            </div>

            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: "calc(28px + env(safe-area-inset-bottom))",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                pointerEvents: "auto",
              }}
            >
              <button className="pill pill-cta" onClick={() => setActionToken(Date.now())}>
                Bild
              </button>
              <button className="pill" onClick={() => setMapOpen((open) => !open)}>
                Map
              </button>
              <button
                className={touchSprint ? "pill pill-cta" : "pill"}
                onPointerDown={() => setTouchSprint(true)}
                onPointerUp={() => setTouchSprint(false)}
                onPointerLeave={() => setTouchSprint(false)}
              >
                Sprint
              </button>
              <button
                className="pill"
                onClick={() => {
                  setMuseumMode(false);
                }}
              >
                Exit
              </button>
            </div>
          </div>
        ) : null}

        {!museumMode && !showLoader ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(5,5,8,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 30,
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                maxWidth: 520,
                padding: 24,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(10,10,14,0.75)",
                color: "white",
                textAlign: "center",
              }}
            >
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, marginBottom: 8 }}>
                Lobby
              </div>
              <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 16 }}>
                {isTouch
                  ? "Tippe auf „Start“. Ziehen = Blick, Buttons = laufen, Bild/Map/Sprint fuer Aktionen."
                  : "Klick auf „Start“ um den Museum‑Modus zu betreten. Maus = Blick, Pfeile/WASD = laufen, Scroll = Zoom."}
              </div>
              <button
                onClick={() => {
                  setMuseumMode(true);
                  setStartToken(Date.now());
                }}
                disabled={!lobbyReady}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "rgba(255,255,255,0.12)",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: lobbyReady ? 1 : 0.6,
                }}
              >
                {lobbyReady ? "Museum starten" : "Lobby lädt…"}
              </button>
              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  gap: 16,
                  justifyContent: "center",
                  flexWrap: "wrap",
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                <Link
                  href="/browse"
                  style={{ color: "var(--paper)", textDecoration: "none" }}
                >
                  2D‑Modus
                </Link>
                <a
                  href="https://felix-ipfling.de/impressum"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--muted-2)", textDecoration: "none" }}
                >
                  Impressum
                </a>
                <a
                  href="https://felix-ipfling.de/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--muted-2)", textDecoration: "none" }}
                >
                  Datenschutz
                </a>
              </div>
            </div>
          </div>
        ) : null}

        {debug ? (
          <div
            style={{
              position: "absolute",
              top: 80,
              right: 20,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(8,8,10,0.7)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 12,
              pointerEvents: "auto",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Debug</div>
            <div>WebGL: {webglOk ? "ok" : "fail"}</div>
            <div>Zone: {gallery.zones[activeZone]?.title || "-"}</div>
            <div>Artworks: {artworks.length}</div>
            <div>Loaded Frames: {loadedFrames}</div>
            <div>
              Frames: {debugInfo?.frameCount ?? 0}{" "}
              {debugInfo && performance.now() - debugInfo.lastFrameAt > 2000 ? "(stalled)" : ""}
            </div>
            <div>Mounted: {mounted ? "yes" : "no"}</div>
            <div>Root: {rootPresent ? "yes" : "no"}</div>
            <div>CanvasCount: {canvasCount}</div>
            <div>CanvasMounted: {canvasInfo?.componentMounted ? "yes" : "no"}</div>
            <div>CanvasPresent: {canvasInfo?.canvasPresent ? "yes" : "no"}</div>
            <div>
              Canvas: {canvasInfo?.created ? "created" : "no"} /{" "}
              {canvasRect ? `${canvasRect.width}x${canvasRect.height}` : "-"}
            </div>
            <div>HitTest: {hitTest}</div>
            <div>GL: {canvasInfo?.glVersion || "-"}</div>
            <div>Renderer: {canvasInfo?.renderer || "-"}</div>
            <div>Vendor: {canvasInfo?.vendor || "-"}</div>
            <div>
              Camera: {debugInfo ? `${debugInfo.camera.x.toFixed(2)}, ${debugInfo.camera.y.toFixed(2)}, ${debugInfo.camera.z.toFixed(2)}` : "-"}
            </div>
            <div>
              Target: {debugInfo ? `${debugInfo.target.x.toFixed(2)}, ${debugInfo.target.y.toFixed(2)}, ${debugInfo.target.z.toFixed(2)}` : "-"}
            </div>
            <div>Error: {lastError || "-"}</div>
            <div style={{ marginTop: 8 }} />
          </div>
        ) : null}

        {selectedArtwork ? (
          <ArtworkModal
            artwork={selectedArtwork}
            onClose={() => {
              setSelectedArtworkId(null);
              if (museumMode) {
                setStartToken(Date.now());
              }
            }}
          />
        ) : null}

        {selectedArtist ? (
          <ArtistModal
            artist={selectedArtist}
            roomLabel={selectedArtistRoomInfo?.roomLabel}
            roomText={selectedArtistRoomInfo?.roomText}
            photoArtwork={selectedArtistRoomInfo?.photoArtwork}
            onClose={() => {
              setSelectedArtistId(null);
              if (museumMode) {
                setStartToken(Date.now());
              }
            }}
          />
        ) : null}

        {selectedDirectorId ? (
          <DirectorModal
            onClose={() => {
              setSelectedDirectorId(null);
              if (museumMode) {
                setStartToken(Date.now());
              }
            }}
          />
        ) : null}

        {mapOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setMapOpen(false);
            }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 55,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
            }}
          >
            <div
              className="card"
              style={{
                width: "min(560px, 92vw)",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                color: "var(--paper)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>Museum Map</div>
                <button className="pill" onClick={() => setMapOpen(false)}>
                  Schließen
                </button>
              </div>

              <div style={{ color: "var(--muted-2)", fontSize: 13, lineHeight: 1.5 }}>
                Wähle einen Artist und spring direkt in den gewünschten Raum. Lobby ist immer erreichbar.
              </div>

              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted-2)" }}>
                Artist
                <select
                  value={mapArtistId}
                  onChange={(e) => setMapArtistId(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "var(--paper)",
                  }}
                >
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Räume</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {roomsForArtist.length ? (
                    roomsForArtist.map(({ zone, idx }) => (
                      <button
                        key={zone.id}
                        className="pill"
                        onClick={() => {
                          setMapOpen(false);
                          setJumpTarget(idx);
                          setJumpToken((t) => t + 1);
                        }}
                      >
                        {zone.title}
                      </button>
                    ))
                  ) : (
                    <span style={{ color: "var(--muted-2)", fontSize: 12 }}>Keine Räume gefunden.</span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <button
                  className="pill pill-cta"
                  onClick={() => {
                    setMapOpen(false);
                    setJumpTarget(0);
                    setJumpToken((t) => t + 1);
                  }}
                >
                  Lobby
                </button>
              </div>

              <div style={{ fontSize: 12, color: "var(--muted-2)", lineHeight: 1.5 }}>
                Shortcut: <strong style={{ color: "var(--paper)" }}>M</strong> öffnet/schließt diese Map.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (msg: string) => void },
  { error?: string }
> {
  constructor(props: { children: React.ReactNode; onError?: (msg: string) => void }) {
    super(props);
    this.state = { error: undefined };
  }

  static getDerivedStateFromError(error: Error) {
    return { error: String(error?.message || error) };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(String(error?.message || error));
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            padding: 24,
            background: "rgba(0,0,0,0.7)",
            zIndex: 50,
            textAlign: "center",
            fontFamily: "var(--font-ui)",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Canvas Error</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{this.state.error}</div>
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
