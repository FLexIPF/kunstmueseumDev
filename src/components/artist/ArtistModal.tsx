"use client";

import { useEffect } from "react";

import type { Artist, Artwork } from "@/content/types";
import { WappenMark } from "@/components/site/WappenMark";
export function ArtistModal({
  artist,
  onClose,
  roomLabel,
  roomText,
  photoArtwork,
}: {
  artist: Artist;
  onClose: () => void;
  roomLabel?: string;
  roomText?: string;
  photoArtwork?: Artwork;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
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
          width: "min(980px, 94vw)",
          maxHeight: "80vh",
          minHeight: "60vh",
          overflow: "auto",
          display: "grid",
          gridTemplateColumns: "1fr",
          background: "rgba(12,12,16,0.85)",
        }}
      >
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.15 }}>
                {artist.name}
              </div>
              <div style={{ color: "var(--muted-2)", marginTop: 6, fontSize: 13 }}>
                Kuenstlerprofil
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <WappenMark size={84} />
              <button
                className="pill"
                style={{ cursor: "pointer", height: 38 }}
                onClick={onClose}
                aria-label="Schliessen"
              >
                Schliessen
              </button>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(244,241,234,0.16)",
              color: "var(--paper)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Hallo du, schoen dass du hierher gefunden hast!</div>
            <div>
              Willkommen in meiner bescheidenen eGallery. Ich bin der Avatar von Felix – Kuenstler und Developer.
              Diese Seite ist mein Experiment, Kunst, Raum und Technik zusammenzubringen: ein digitales Museum, das
              sich weiterentwickelt, so wie mein Atelier auch nie stillsteht.
            </div>
            <div style={{ marginTop: 10 }}>
              Vision: Kunst soll nahbar sein – nicht nur zum Anschauen, sondern zum Erleben. Jede Wand, jeder Raum und
              jeder Klick ist Teil der Geschichte. Danke, dass du dabei bist.
            </div>
          </div>

          {(roomText || roomLabel) ? (
            <div
              style={{
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(244,241,234,0.16)",
                color: "var(--paper)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {roomText ? <div style={{ fontWeight: 600 }}>{roomText}</div> : null}
              {roomLabel ? <div style={{ marginTop: 4 }}>{roomLabel}</div> : null}
            </div>
          ) : null}

          {photoArtwork ? (
            <div
              style={{
                marginTop: 6,
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(244,241,234,0.16)",
                color: "var(--paper)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Fotos / Portraits</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <img
                    src={photoArtwork.images.full || photoArtwork.images.texture}
                    alt={photoArtwork.title}
                    style={{
                      width: "100%",
                      maxHeight: 240,
                      objectFit: "contain",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(0,0,0,0.2)",
                    }}
                  />
                  <div style={{ fontSize: 12, color: "var(--muted-2)" }}>{photoArtwork.title}</div>
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ color: "var(--muted-2)", fontSize: 12 }}>
            Instagram:{" "}
            <a href="https://instagram.com/felix.ipfling" target="_blank" rel="noreferrer">
              @felix.ipfling
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          div.card {
            grid-template-columns: 1fr;
            max-height: 92vh;
          }
        }
      `}</style>
    </div>
  );
}
