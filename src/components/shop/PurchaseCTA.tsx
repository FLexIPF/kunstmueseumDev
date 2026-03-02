"use client";

import { useState } from "react";

import type { Artwork } from "@/content/types";

import { SHOP_COLLECTION_URL } from "@/lib/shopLinks";

export function PurchaseCTA({ artwork }: { artwork: Artwork }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shopUrl = artwork.shopify?.collectionUrl || SHOP_COLLECTION_URL;
  const canAttemptCheckout = Boolean(artwork.shopify?.variantId || artwork.shopify?.productHandle);

  if (artwork.status !== "available") {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="pill" style={{ opacity: 0.6 }}>
          {artwork.status === "sold" ? "Original sold" : "Original not available"}
        </span>
        <a className="pill" href={shopUrl} target="_blank" rel="noreferrer">
          Prints & Poster
        </a>
      </div>
    );
  }

  if (!canAttemptCheckout) {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a className="pill pill-cta" href={shopUrl} target="_blank" rel="noreferrer">
          Prints & Poster
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="pill pill-cta"
          style={{ cursor: !busy ? "pointer" : "not-allowed", opacity: busy ? 0.8 : 1 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const resp = await fetch("/api/cart", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ artworkId: artwork.id }),
              });
              if (!resp.ok) {
                const txt = await resp.text();
                throw new Error(txt || `Request failed (${resp.status})`);
              }
              const data = (await resp.json()) as { checkoutUrl?: string };
              if (!data.checkoutUrl) throw new Error("No checkoutUrl returned.");
              window.location.href = data.checkoutUrl;
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "..." : "In den Warenkorb"}
        </button>

        <a className="pill" href={shopUrl} target="_blank" rel="noreferrer">
          Prints & Poster
        </a>
      </div>

      {error ? (
        <div style={{ color: "#ff9b9b", fontSize: 12, lineHeight: 1.4 }}>
          Checkout aktuell nicht verfuegbar. Nutze &quot;Prints & Poster&quot;.{" "}
          <span style={{ color: "rgba(244,241,234,0.6)" }}>({error})</span>
        </div>
      ) : null}
    </div>
  );
}
