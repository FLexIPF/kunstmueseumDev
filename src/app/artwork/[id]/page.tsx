import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "./page.module.css";

import { getArtwork } from "@/content/artworks";
import { PurchaseCTA } from "@/components/shop/PurchaseCTA";

function formatDims(widthCm?: number, heightCm?: number): string | null {
  if (!widthCm || !heightCm) return null;
  return `${widthCm} x ${heightCm} cm`;
}

export default async function ArtworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const artwork = getArtwork(id);
  if (!artwork) notFound();

  return (
    <main className="shell" style={{ padding: "28px 0 44px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="pill" href="/">
            Museum
          </Link>
          <Link className="pill" href="/browse">
            Browse
          </Link>
        </div>
        <Image
          src="/artist/wappen.png"
          alt="Museum Wappen"
          width={108}
          height={108}
          style={{ objectFit: "contain" }}
        />
      </div>

      <div
        className={`card ${styles.layout}`}
      >
        <div style={{ position: "relative", minHeight: 520, background: "rgba(0,0,0,0.35)" }}>
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
          <h1 style={{ fontFamily: "var(--font-display)", margin: 0, fontSize: 36 }}>
            {artwork.title}
          </h1>
          <div style={{ color: "var(--muted)" }}>
            {[
              artwork.year ? String(artwork.year) : null,
              artwork.medium ?? null,
              formatDims(artwork.widthCm, artwork.heightCm),
            ]
              .filter(Boolean)
              .join(" / ")}
          </div>

          <div style={{ color: "var(--muted-2)", fontSize: 13 }}>
            Kategorie: {artwork.category}
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
              whiteSpace: "pre-line",
            }}
          >
            {artwork.infoBox?.trim() || "Info folgt. (Hier kannst du spaeter Werkhinweise, Kontext, Edition etc. pflegen.)"}
          </div>

          <div style={{ marginTop: 8 }}>
            <PurchaseCTA artwork={artwork} />
          </div>

          <div style={{ marginTop: "auto", color: "var(--muted-2)", fontSize: 12, lineHeight: 1.6 }}>
            Hinweis: Diese Seite ist ein MVP. Details wie Edition/COA/Versand werden als naechster
            Schritt sauber modelliert.
          </div>
        </div>
      </div>
    </main>
  );
}
