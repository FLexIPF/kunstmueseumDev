import Link from "next/link";
import { SHOP_COLLECTION_URL } from "@/lib/shopLinks";

export default function AboutPage() {
  return (
    <main className="shell" style={{ padding: "28px 0 44px" }}>
      <div className="card" style={{ padding: 18 }}>
        <h1 className="h1" style={{ fontSize: 38 }}>
          Info folgt
        </h1>
        <p className="lead" style={{ marginTop: 10 }}>
          Dieser Bereich ist aktuell ausgeblendet. Fokus liegt auf Museum & Galerie.
        </p>

        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="pill" href="/">
            Zurueck ins Museum
          </Link>
          <Link className="pill" href="/browse">
            Galerie
          </Link>
          <a className="pill" href={SHOP_COLLECTION_URL} target="_blank" rel="noreferrer">
            Prints & Poster
          </a>
        </div>
      </div>
    </main>
  );
}
