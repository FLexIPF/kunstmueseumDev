"use client";

import { Html } from "@react-three/drei";

import { getArtist } from "@/content/artists";
import { SHOP_COLLECTION_URL } from "@/lib/shopLinks";

export function InfoPinboard({
  position,
  rotation,
  accent,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  accent: string;
}) {
  const artist = getArtist("felix");
  if (!artist) return null;

  const pdfHref = artist.bioPdf || "/artist/felix-ipfling-kurzportrait-2024-09.pdf";
  const statement = (artist.bioMarkdown || "").split(/\n{2,}/g)[0] || "";

  return (
    <group position={position} rotation={rotation}>
      <Html transform distanceFactor={7.5} occlude style={{ pointerEvents: "auto" }}>
        <div
          style={{
            width: 360,
            borderRadius: 18,
            background: "rgba(244, 241, 234, 0.92)",
            color: "#0f0f12",
            border: "1px solid rgba(0,0,0,0.18)",
            boxShadow: "0 22px 55px rgba(0,0,0,0.35)",
            overflow: "hidden",
            fontFamily: "var(--font-ui)",
          }}
        >
          <div
            style={{
              padding: "14px 14px 12px",
              background:
                `linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.00)), ` +
                `linear-gradient(90deg, ${accent}33, transparent 60%)`,
              borderBottom: "1px solid rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "0.4px" }}>
              Steckbrief
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: "rgba(0,0,0,0.72)" }}>{artist.name}</div>
          </div>

          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(0,0,0,0.78)" }}>
              {statement}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
              {artist.contact?.email ? (
                <div style={{ color: "#0f0f12", fontSize: 13 }}>
                  {artist.contact.email}
                </div>
              ) : null}
              {artist.contact?.phone ? (
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.74)" }}>{artist.contact.phone}</div>
              ) : null}
              {artist.contact?.instagram ? (
                <a
                  href={artist.contact.instagram}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#0f0f12", textDecoration: "none", fontSize: 13 }}
                >
                  Instagram
                </a>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <a
                href="/about"
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "rgba(255,255,255,0.7)",
                  color: "#0f0f12",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                Mehr Info
              </a>
              <a
                href={SHOP_COLLECTION_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "rgba(255,255,255,0.7)",
                  color: "#0f0f12",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                Shop
              </a>
              <a
                href={pdfHref}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: `1px solid ${accent}99`,
                  background: `${accent}cc`,
                  color: "#0f0f12",
                  fontSize: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                PDF
              </a>
            </div>

            <div style={{ marginTop: 2, fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
              Tipp: Zoomen + pannen ist aktiv. Klick auf ein Bild fokussiert die Kamera.
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}
