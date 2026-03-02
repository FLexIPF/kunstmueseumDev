"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

export function WappenMark({
  size = 102,
  style,
  className,
}: {
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <Image
        src="/artist/wappen.png"
        alt="Museum Wappen"
        width={size}
        height={size}
        style={{ objectFit: "contain" }}
        priority
      />
    </div>
  );
}
