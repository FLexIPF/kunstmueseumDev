"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import type { Artwork } from "@/content/types";
import { getArtist } from "@/content/artists";
import { PurchaseCTA } from "@/components/shop/PurchaseCTA";
import { WappenMark } from "@/components/site/WappenMark";

function formatDims(a: Artwork): string | null {
  if (!a.widthCm || !a.heightCm) return null;
  return `${a.widthCm} x ${a.heightCm} cm`;
}

export function ArtworkModal({ artwork, onClose }: { artwork: Artwork; onClose: () => void }) {
  const artist = getArtist(artwork.artistId);
  const email = artist?.contact?.email || "felix@ipfling.de";
  const subject = encodeURIComponent(`Kaufanfrage Original: ${artwork.title}`);
  const body = encodeURIComponent(
    `Hallo ${artist?.name || " "},\n\n` +
      `ich moechte das Original von folgendem Werk kaufen:\n` +
      `- Titel: ${artwork.title}\n` +
      `${artwork.year ? `- Jahr: ${artwork.year}\n` : ""}` +
      `${artwork.medium ? `- Medium: ${artwork.medium}\n` : ""}` +
      `${formatDims(artwork) ? `- Masse: ${formatDims(artwork)}\n` : ""}` +
      `\nBitte melde dich mit den naechsten Schritten zur Abwicklung.\n\nDanke!`,
  );
  const mailto = `mailto:${email}?subject=${subject}&body=${body}`;
  const priceLabel =
    typeof artwork.priceEur === "number" && Number.isFinite(artwork.priceEur)
      ? `${artwork.priceEur.toLocaleString("de-DE")} €`
      : null;
  const dimsLabel = formatDims(artwork);

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
          width: "min(980px, 100%)",
          maxHeight: "min(86vh, 920px)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
        }}
      >
        <div style={{ position: "relative", background: "rgba(0,0,0,0.35)" }}>
          <Image
            src={artwork.images.full}
            alt={artwork.title}
            fill
            sizes="(max-width: 900px) 100vw, 700px"
            style={{ objectFit: "contain" }}
            priority
          />
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.15 }}>
                {artwork.title}
              </div>
              <div style={{ color: "var(--muted-2)", marginTop: 6, fontSize: 13 }}>
                {[
                  artwork.year ? String(artwork.year) : null,
                  artwork.medium ?? null,
                  formatDims(artwork),
                ]
                  .filter(Boolean)
                  .join(" / ")}
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

          <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55 }}>
            Status:{" "}
            <span style={{ color: artwork.status === "sold" ? "#ff9b9b" : "var(--paper)" }}>
              {artwork.status === "available"
                ? "Original available"
                : artwork.status === "sold"
                  ? "Original sold"
                  : "Original not available"}
            </span>
            {priceLabel ? (
              <span style={{ marginLeft: 10, color: "var(--paper)" }}>Preis: {priceLabel}</span>
            ) : null}
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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Details</div>
            <div style={{ display: "grid", gap: 6 }}>
              <div>Jahr: {artwork.year ? artwork.year : "—"}</div>
              <div>Material: {artwork.medium ? artwork.medium : "—"}</div>
              <div>Maße: {dimsLabel || "—"}</div>
              <div>Original‑Preis: {priceLabel || "—"}</div>
            </div>
          </div>

          {artwork.infoBox?.trim() ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(244,241,234,0.12)",
                color: "var(--paper)",
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-line",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Kontext</div>
              {artwork.infoBox}
            </div>
          ) : null}

          <PurchaseCTA artwork={artwork} />

          {artwork.status === "available" ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="pill" href={mailto}>
                Kaufanfrage (Original)
              </a>
            </div>
          ) : null}

          <div style={{ marginTop: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="pill" href={`/artwork/${encodeURIComponent(artwork.id)}`}>
              Details
            </Link>
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
