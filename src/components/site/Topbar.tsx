"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WappenMark } from "@/components/site/WappenMark";

function NavPill({
  href,
  children,
  variant = "default",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "cta";
}) {
  const pathname = usePathname();
  const active = pathname === href;
  const cls =
    "pill" +
    (variant === "cta" ? " pill-cta" : "") +
    (active ? " pill-active" : "");
  return (
    <Link className={cls} href={href}>
      {children}
    </Link>
  );
}

export function Topbar() {
  const [roomLabel, setRoomLabel] = useState("Museum");

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ label?: string }>;
      const label = custom.detail?.label;
      if (label) setRoomLabel(label);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("museum:zone", handler as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("museum:zone", handler as EventListener);
      }
    };
  }, []);

  return (
    <div className="topbar" style={{ zIndex: 200 }}>
      <div className="shell topbar-inner">
        <Link className="brand" href="/" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <WappenMark size={102} />
          <div>
            <div className="brand-title">Kunst Museum</div>
            <div className="brand-sub">Felix Ipfling</div>
          </div>
        </Link>
        <div style={{ color: "var(--muted-2)", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Raum: {roomLabel}
        </div>

        <nav className="nav">
          <NavPill href="/">Museum</NavPill>
          <NavPill href="/browse">Browse</NavPill>
          <NavPill href="/browse" variant="cta">
            Galerie
          </NavPill>
          <a className="pill" href="https://felix-ipfling.de" target="_blank" rel="noreferrer">
            Felix‑Ipfling.de
          </a>
        </nav>
      </div>
    </div>
  );
}
