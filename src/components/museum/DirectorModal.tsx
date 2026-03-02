"use client";

import { useEffect } from "react";

import { WappenMark } from "@/components/site/WappenMark";

export function DirectorModal({ onClose }: { onClose: () => void }) {
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
          width: "min(720px, 96vw)",
          maxHeight: "min(86vh, 760px)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1fr",
          background: "rgba(12,12,16,0.85)",
        }}
      >
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.15 }}>
                Museumsdirektor
              </div>
              <div style={{ color: "var(--muted-2)", marginTop: 6, fontSize: 13 }}>
                Willkommen
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
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Hallo! Schön, dass du da bist.</div>
            <div>
              Ich bin der Museumsdirektor und halte hier alles am Laufen. Schau dich in Ruhe um, entdecke die Räume
              und nimm dir Zeit für die Arbeiten – nutze die Detailansicht mit ENTER.
            </div>
            <div style={{ marginTop: 10 }}>
              Hier findest du Arbeiten von Felix Ipfling und Luca Schweiger. Wenn du Fragen hast oder mehr wissen
              möchtest, sprich mit den Künstlern. Wenn du Kunst machst und auch einen Raum in diesem Museum haben
              möchtest, melde dich bei Felix!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
