"use client";

import React from "react";

const sectionStyle: React.CSSProperties = {
  padding: "22px 22px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  background: "rgba(16,16,21,0.45)",
  boxShadow: "0 18px 40px var(--shadow)",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(12,12,18,0.6)",
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const monoStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  color: "var(--muted)",
};

function FlowDiagram() {
  return (
    <svg viewBox="0 0 1200 320" width="100%" height="auto" role="img" aria-label="Pipeline overview">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L9,3 z" fill="rgba(255,255,255,0.7)" />
        </marker>
        <style>{`
          .box { fill: rgba(12,12,18,0.55); stroke: rgba(255,255,255,0.22); stroke-width: 1.2; }
          .title { fill: rgba(255,255,255,0.92); font-family: var(--font-display); font-size: 16px; }
          .text { fill: rgba(244,241,234,0.75); font-family: var(--font-ui); font-size: 12px; }
          .line { stroke: rgba(255,255,255,0.6); stroke-width: 1.4; marker-end: url(#arrow); }
        `}</style>
      </defs>

      {/* Inputs */}
      <rect className="box" x="20" y="30" width="220" height="70" rx="12" />
      <text className="title" x="35" y="58">Fotos & Clips</text>
      <text className="text" x="35" y="78">data/inbox, data/artists</text>

      <rect className="box" x="20" y="120" width="220" height="70" rx="12" />
      <text className="title" x="35" y="148">Ausstellungen</text>
      <text className="text" x="35" y="168">data/exhibitions</text>

      <rect className="box" x="20" y="210" width="220" height="70" rx="12" />
      <text className="title" x="35" y="238">Voice Notes</text>
      <text className="text" x="35" y="258">optional .m4a / .txt</text>

      {/* Scripts */}
      <rect className="box" x="320" y="40" width="260" height="60" rx="12" />
      <text className="title" x="335" y="68">catalog_scan.py</text>
      <text className="text" x="335" y="86">artworks.draft.csv</text>

      <rect className="box" x="320" y="125" width="260" height="60" rx="12" />
      <text className="title" x="335" y="153">ai_analyze.py</text>
      <text className="text" x="335" y="171">artworks.ai.csv</text>

      <rect className="box" x="320" y="210" width="260" height="60" rx="12" />
      <text className="title" x="335" y="238">exhibitions_scan.py</text>
      <text className="text" x="335" y="256">exhibitions.csv</text>

      {/* Outputs */}
      <rect className="box" x="660" y="40" width="260" height="60" rx="12" />
      <text className="title" x="675" y="68">artworks.csv</text>
      <text className="text" x="675" y="86">Katalog (manuell)</text>

      <rect className="box" x="660" y="125" width="260" height="60" rx="12" />
      <text className="title" x="675" y="153">social_generate.py</text>
      <text className="text" x="675" y="171">social/drafts.csv</text>

      <rect className="box" x="660" y="210" width="260" height="60" rx="12" />
      <text className="title" x="675" y="238">import_artworks.py</text>
      <text className="text" x="675" y="256">overrides.generated.ts</text>

      {/* Runtime */}
      <rect className="box" x="980" y="90" width="200" height="120" rx="12" />
      <text className="title" x="995" y="120">Runtime</text>
      <text className="text" x="995" y="142">src/ + public/</text>
      <text className="text" x="995" y="162">Museum + Shop</text>

      {/* Lines */}
      <line className="line" x1="240" y1="65" x2="320" y2="65" />
      <line className="line" x1="240" y1="155" x2="320" y2="155" />
      <line className="line" x1="240" y1="245" x2="320" y2="245" />
      <line className="line" x1="580" y1="70" x2="660" y2="70" />
      <line className="line" x1="580" y1="155" x2="660" y2="155" />
      <line className="line" x1="580" y1="245" x2="660" y2="245" />
      <line className="line" x1="920" y1="150" x2="980" y2="150" />
    </svg>
  );
}

export default function DevOverviewPage() {
  const isProd = process.env.NODE_ENV === "production";
  return (
    <main style={{ flex: 1 }}>
      <div className="shell" style={{ padding: "26px 0 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div>
            <div className="h1" style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>
              Dev Overview
            </div>
            <div className="lead" style={{ maxWidth: "72ch" }}>
              Interne Uebersicht ueber Pipeline, Ordnerstruktur, Artist‑Onboarding und technische Bausteine.
              Ziel: du siehst auf einen Blick, was Laufzeit‑Code ist, was nur lokale Tools sind und wie Daten durch das System fliessen.
            </div>
          </div>
          <div style={badgeStyle}>{isProd ? "PROD BUILD" : "LOCAL DEV"}</div>
        </div>

        <div style={{ ...cardStyle, marginBottom: 18 }}>
          <div style={sectionStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Pipeline (visuell)</div>
            <FlowDiagram />
            <div style={monoStyle}>
              Ziel: Daten rein → KI/Tools sortieren → CSVs → Overrides → Runtime.
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>
              Die Pipeline ist bewusst lokal gehalten: du sammelst Fotos/Notizen, die Skripte erzeugen strukturierte CSVs,
              und erst ganz am Ende wird daraus der Runtime‑Katalog (Museum/Shop). So bleibt die Kontrolle bei dir, und du
              kannst jederzeit einzelne Schritte anhalten oder korrigieren.
            </div>
          </div>
        </div>

        <div style={grid2}>
          <div style={cardStyle}>
            <div style={sectionStyle}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Produktiv (Runtime)</div>
              <div style={monoStyle}>src/ · public/ · package.json · next.config.ts</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>
                Das ist der Teil, der im Deployment wirklich laeuft. Alles hier bestimmt, was Besucher:innen sehen und wie
                das Museum, der Shop und die Kuenstlerprofile im Browser funktionieren.
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
                <li>Museum / Browse / Artwork UI</li>
                <li>Shop‑Links & Modals</li>
                <li>Artist‑Rooms aus Packs</li>
              </ul>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={sectionStyle}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Lokale Tools</div>
              <div style={monoStyle}>scripts/ · data/ · docs/</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>
                Diese Ordner sind fuer dich als Entwickler: sie erzeugen CSVs, Vorschlaege und Reports. Sie laufen nicht
                in Produktion, sondern nur lokal auf deinem Rechner.
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
                <li>Catalog Scan + KI Vorschlaege</li>
                <li>Exhibition Scan</li>
                <li>Social Draft Generator</li>
              </ul>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={sectionStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Artist Onboarding (Kurz)</div>
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>
              Der Artist‑Flow ist modular: Ein Artist‑Pack beschreibt Profil + Raeume. Die Werke kommen als Fotos in die
              Datenstruktur, werden katalogisiert und optional in den Runtime‑Katalog uebernommen.
            </div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {[
                { title: "1) Pack", desc: "artist-packs/<id>.json", sub: "Bio + Rooms" },
                { title: "2) Import", desc: "npm run import:artist-packs", sub: "Generiert TS" },
                { title: "3) Werke", desc: "data/artists/<id>/series/.../works", sub: "Fotos rein" },
                { title: "4) Katalog", desc: "catalog_scan.py → artworks.csv", sub: "Meta pflegen" },
                { title: "5) Avatar/Guide", desc: "avatar.jpg + avatar_text.txt", sub: "Figur + Sprechtext" },
                { title: "6) Runtime", desc: "import_artworks.py (optional)", sub: "Overrides" },
              ].map((item) => (
                <div key={item.title} style={{ ...cardStyle, background: "rgba(12,12,18,0.5)" }}>
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={monoStyle}>{item.desc}</div>
                    <div style={{ color: "var(--muted-2)", fontSize: 12 }}>{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={sectionStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Dateien & Outputs</div>
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>
              Diese Dateien sind die Schnittstellen zwischen deinen Fotos/Notizen und der App. CSVs sind bewusst simpel,
              damit du sie in Excel, LibreOffice oder per Hand pflegen kannst.
            </div>
            <div style={grid2}>
              <div>
                <div style={{ fontWeight: 600 }}>Inputs</div>
                <div style={monoStyle}>data/inbox/ — ungeordnet, hier startet alles.</div>
                <div style={monoStyle}>data/artists/…/works — sortierte Werke je Artist/Serie.</div>
                <div style={monoStyle}>data/exhibitions/… — Ausstellungen mit Fotos/Notes.</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>CSVs</div>
                <div style={monoStyle}>data/catalog/artworks.csv — Master‑Katalog (Status/Preise/Meta).</div>
                <div style={monoStyle}>data/catalog/exhibitions.csv — Ausstellungs‑Liste.</div>
                <div style={monoStyle}>data/social/drafts.csv — Social‑Entwuerfe.</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Generated</div>
                <div style={monoStyle}>src/content/artworks.generated.ts — Bilder/Meta aus Import.</div>
                <div style={monoStyle}>src/content/artworks.overrides.generated.ts — CSV‑Overrides.</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={sectionStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Begriffe (1–2 Saetze je Begriff)</div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {[
                {
                  term: "Artist Pack",
                  desc:
                    "Ein JSON‑Paket pro Kuenstler mit Profil, Rooms und optionalen Werken. Daraus baut das Museum automatisch die Raeume.",
                },
                {
                  term: "Room",
                  desc:
                    "Ein Ausstellungsraum im Museum mit Groesse, Thema und Artwork‑Auswahl. Rooms kommen direkt aus dem Artist Pack.",
                },
                {
                  term: "artworks.csv",
                  desc:
                    "Dein Master‑Katalog fuer Titel, Masse, Preise und Status. Diese Datei steuert auch, ob im Museum „Kaufanfrage“ erscheint und welcher Original‑Preis angezeigt wird.",
                },
                {
                  term: "artworks.generated.ts",
                  desc:
                    "Automatisch erzeugter Katalog aus Fotos. Er liefert Bilder/Thumbnails fuer die App.",
                },
                {
                  term: "overrides.generated.ts",
                  desc:
                    "Automatisch aus der CSV erzeugte Korrekturen (Titel, Status, Shopify‑Links). Damit wird der Runtime‑Katalog sauber.",
                },
                {
                  term: "catalog_scan.py",
                  desc:
                    "Scannt Ordner und erzeugt einen ersten CSV‑Entwurf. Damit sparst du die manuelle Erfassung von Basisdaten.",
                },
                {
                  term: "ai_analyze.py",
                  desc:
                    "Lokale Bildanalyse fuer Tags/Farbwerte/Caption‑Vorschlaege. Du entscheidest, was davon uebernommen wird.",
                },
                {
                  term: "exhibitions_scan.py",
                  desc:
                    "Liest Ordnernamen und optionalen Text und erzeugt die Ausstellungs‑CSV. So bleibt deine Vita strukturiert.",
                },
                {
                  term: "social_generate.py",
                  desc:
                    "Erstellt Post‑Entwuerfe fuer Instagram/TikTok. Du kannst sie manuell freigeben oder anpassen.",
                },
                {
                  term: "Runtime",
                  desc:
                    "Alles, was Besucher im Browser sehen. Kein Script aus scripts/ laeuft in der Runtime.",
                },
                {
                  term: "Avatar/Guide",
                  desc:
                    "Eine optionale 2D‑Figur pro Artist im Raum. Du lieferst Foto + Sprechtext, ich erstelle daraus die Figur.",
                },
              ].map((item) => (
                <div key={item.term} style={{ ...cardStyle, background: "rgba(12,12,18,0.5)" }}>
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontWeight: 600 }}>{item.term}</div>
                    <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={sectionStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Input → Verarbeitung (dein geplanter Flow)</div>
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
              Dieser Abschnitt beschreibt genau, wie du deine Ordner strukturierst, was darin liegen darf und was die
              Skripte daraus machen. Du kannst die Dateien einfach hineinwerfen, ohne jede Datei umzubenennen.
            </div>

            <div style={grid2}>
              <div style={cardStyle}>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>Ausstellungen (Events)</div>
                  <div style={monoStyle}>
                    data/exhibitions/2024-11-26_Relativ-Erwachsen_Berlin/
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                    In diesem Ordner liegen alle Event‑Assets: Fotos, Videos, Plakat, plus optional ein Textfile
                    (z.B. <span style={monoStyle}>overview.txt</span>) mit Kurzbeschreibung, beteiligten Kuenstlern,
                    Konzept & Eindruecken. Dateinamen der Fotos sind egal.
                  </div>
                  <div style={{ color: "var(--muted-2)", fontSize: 12 }}>
                    Verarbeitung: <span style={monoStyle}>exhibitions_scan.py</span> liest Ordnername + overview.txt
                    und schreibt <span style={monoStyle}>data/catalog/exhibitions.csv</span>.
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>Werke (Fotos)</div>
                  <div style={monoStyle}>
                    data/artists/felix/series/leinwand/works/100x80/
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                    Du kannst Ordner nach Format anlegen (z.B. <span style={monoStyle}>100x80</span>) und alle Werke
                    dort hineinwerfen. Dateinamen sollten idealerweise den Titel enthalten (optional Jahr/Medium), aber
                    das System versucht trotzdem, Titel/Daten aus dem Dateinamen zu erraten.
                  </div>
                  <div style={{ color: "var(--muted-2)", fontSize: 12 }}>
                    Verarbeitung: <span style={monoStyle}>catalog_scan.py</span> erzeugt einen CSV‑Entwurf, den du am
                    Ende manuell finalisierst (Status/Preis/Verkauft).
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
              Wichtig: Die Skripte machen Vorschlaege, aber die finale Wahrheit ist immer <span style={monoStyle}>artworks.csv</span>.
              Du pflegst dort Status (verkauft/verfuegbar), Preise, Serien und ggf. Shopify‑Links.
            </div>

            <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
              Avatar/Guide (optional): Lege pro Artist ein <span style={monoStyle}>data/artists/&lt;id&gt;/avatar.jpg</span> und
              <span style={monoStyle}> data/artists/&lt;id&gt;/avatar_text.txt</span> ab. Darin steht der Text, den die
              Figur im Raum sagt. Wunsch‑Position kannst du in der Rooms‑CSV (Spalte <span style={monoStyle}>notes</span>) notieren.
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={sectionStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Trigger / Wie du es ausfuehrst</div>
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
              Du hast zwei Optionen: (1) lokal selbst die Skripte starten, oder (2) mir sagen, dass ich sie fuer dich
              ausfuehren soll. In beiden Faellen bleibt alles lokal auf deinem Rechner.
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ ...cardStyle, background: "rgba(12,12,18,0.5)" }}>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>A) Selbst starten (Terminal)</div>
                  <div style={monoStyle}>python3 scripts/catalog_from_kunst.py</div>
                  <div style={monoStyle}>python3 scripts/catalog_scan.py</div>
                  <div style={monoStyle}>python3 scripts/ai_analyze.py --catalog data/catalog/artworks.csv</div>
                  <div style={monoStyle}>python3 scripts/exhibitions_scan.py</div>
                  <div style={monoStyle}>python3 scripts/social_generate.py --weeks 4 --posts-per-week 3</div>
                  <div style={{ color: "var(--muted-2)", fontSize: 12 }}>
                    Danach pruefst du <span style={monoStyle}>artworks.csv</span> und uebertraegst die finalen Daten.
                  </div>
                </div>
              </div>
              <div style={{ ...cardStyle, background: "rgba(12,12,18,0.5)" }}>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>B) Von mir ausfuehren lassen</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                    Du sagst mir z.B. „Scanne <span style={monoStyle}>data/exhibitions</span>“ oder
                    „Erzeuge Social‑Drafts fuer 4 Wochen“. Ich fuehre die Skripte aus und liefere dir die CSVs.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
