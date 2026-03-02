import Image from "next/image";
import Link from "next/link";

import { artworks } from "@/content/artworks";
import type { Artwork } from "@/content/types";

export default function BrowsePage() {
  const list: Artwork[] = artworks;

  return (
    <main className="shell" style={{ padding: "28px 0 44px" }}>
      <h1 className="h1">Browse</h1>
      <p className="lead">
        2D Uebersicht (schnell auf Mobile, gut zum Teilen). Fuer das &quot;Begehen&quot; geh ins{" "}
        <Link href="/" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
          Museum
        </Link>
        .
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
        <h2 style={{ fontFamily: "var(--font-display)", margin: 0 }}>Alle Werke</h2>
        <div style={{ color: "var(--muted-2)", fontSize: 13, paddingTop: 6 }}>
          {list.length} Werke
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        {list.map((a) => (
          <Link
            key={a.id}
            href={`/artwork/${encodeURIComponent(a.id)}`}
            className="card"
            style={{
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 240,
            }}
          >
            <div style={{ position: "relative", flex: 1, background: "rgba(0,0,0,0.28)" }}>
              <Image
                src={a.images.thumb}
                alt={a.title}
                fill
                sizes="(max-width: 900px) 100vw, 360px"
                style={{ objectFit: "cover" }}
              />
              {a.status === "sold" ? (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,155,155,0.45)",
                    color: "#ffb3b3",
                    background: "rgba(0,0,0,0.45)",
                    fontSize: 12,
                  }}
                >
                  SOLD
                </div>
              ) : null}
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{a.title}</div>
              <div style={{ color: "var(--muted-2)", fontSize: 12, marginTop: 6 }}>
                {[a.year ? String(a.year) : null, a.medium ?? null].filter(Boolean).join(" / ") || "\u00A0"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
