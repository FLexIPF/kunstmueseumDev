import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell" style={{ padding: "28px 0 44px" }}>
      <div className="card" style={{ padding: 18 }}>
        <h1 className="h1">Not Found</h1>
        <p className="lead">Dieses Werk wurde nicht gefunden.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <Link className="pill pill-cta" href="/">
            Zurueck ins Museum
          </Link>
          <Link className="pill" href="/browse">
            Browse
          </Link>
        </div>
      </div>
    </main>
  );
}

