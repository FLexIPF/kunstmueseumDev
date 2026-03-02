#!/usr/bin/env python3
from __future__ import annotations

import argparse
import colorsys
import csv
from pathlib import Path
from typing import Any

from PIL import Image


def image_stats(path: Path) -> dict[str, Any]:
    img = Image.open(path).convert("RGB")
    small = img.resize((64, 64), resample=Image.Resampling.BILINEAR)
    pixels = list(small.getdata())
    if not pixels:
        return {"hex": "#808080", "brightness": 0.5, "saturation": 0.5}
    n = len(pixels)
    sum_r = sum_g = sum_b = 0.0
    sum_s = sum_v = 0.0
    for r, g, b in pixels:
        sum_r += r
        sum_g += g
        sum_b += b
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        sum_s += s
        sum_v += v
    mean_r = sum_r / n
    mean_g = sum_g / n
    mean_b = sum_b / n
    mean_s = sum_s / n
    mean_v = sum_v / n
    hex_color = f"#{int(mean_r):02x}{int(mean_g):02x}{int(mean_b):02x}"
    return {"hex": hex_color, "brightness": mean_v, "saturation": mean_s}


def build_caption(row: dict[str, str]) -> str:
    title = row.get("title") or "Ein Werk"
    year = row.get("year") or ""
    medium = row.get("medium") or ""
    width = row.get("width_cm") or ""
    height = row.get("height_cm") or ""
    series = row.get("series_id") or ""

    parts = [title]
    if year:
        parts.append(f"({year})")
    base = " ".join(parts)

    details = []
    if medium:
        details.append(medium)
    if width and height:
        details.append(f"{width}x{height} cm")
    detail_str = " · ".join(details)

    if series:
        return f"{base} — {detail_str}. Teil der Serie „{series}“."
    if detail_str:
        return f"{base} — {detail_str}."
    return base


def build_tags(row: dict[str, str], stats: dict[str, Any]) -> str:
    tags: list[str] = []
    medium = (row.get("medium") or "").strip().lower()
    if medium:
        tags.append(medium)
    brightness = stats.get("brightness", 0.5)
    saturation = stats.get("saturation", 0.5)
    if brightness > 0.7:
        tags.append("hell")
    elif brightness < 0.35:
        tags.append("dunkel")
    else:
        tags.append("mittel")
    if saturation > 0.55:
        tags.append("satt")
    elif saturation < 0.2:
        tags.append("gedaempft")
    return "|".join(tags)


def build_mood(stats: dict[str, Any]) -> str:
    brightness = stats.get("brightness", 0.5)
    saturation = stats.get("saturation", 0.5)
    if brightness > 0.7 and saturation > 0.5:
        return "energetisch"
    if brightness < 0.4 and saturation < 0.3:
        return "ruhig"
    return "ausgeglichen"


def main() -> int:
    parser = argparse.ArgumentParser(description="Local AI-style analysis for artworks CSV.")
    parser.add_argument("--catalog", default="data/catalog/artworks.csv", help="Input catalog CSV")
    parser.add_argument("--out", default="data/catalog/artworks.ai.csv", help="Output CSV with AI suggestions")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    catalog_path = (project_root / args.catalog).resolve()
    out_path = (project_root / args.out).resolve()

    if not catalog_path.exists():
        print("Catalog not found:", catalog_path)
        return 1

    with catalog_path.open("r", encoding="utf-8", newline="") as f:
        sample = f.read(2048)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        except csv.Error:
            dialect = csv.excel
            dialect.delimiter = ";" if ";" in sample else ","
        reader = csv.DictReader(f, dialect=dialect)
        rows = list(reader)
        fieldnames = reader.fieldnames or []

    extra_fields = ["ai_tags", "ai_palette", "ai_mood", "ai_caption", "ai_confidence", "ai_error"]
    out_fields = fieldnames + [f for f in extra_fields if f not in fieldnames]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields)
        writer.writeheader()
        for row in rows:
            image_src = (row.get("images_source") or "").strip()
            stats: dict[str, Any] = {"hex": "", "brightness": 0.5, "saturation": 0.5}
            error = ""
            if image_src:
                img_path = (project_root / image_src).resolve()
                try:
                    stats = image_stats(img_path)
                except Exception as exc:  # noqa: BLE001
                    error = f"{type(exc).__name__}: {exc}"
            row["ai_palette"] = stats.get("hex", "")
            row["ai_tags"] = build_tags(row, stats)
            row["ai_mood"] = build_mood(stats)
            row["ai_caption"] = build_caption(row)
            row["ai_confidence"] = "0.6"
            row["ai_error"] = error
            writer.writerow(row)

    print("Wrote:", out_path.relative_to(project_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
