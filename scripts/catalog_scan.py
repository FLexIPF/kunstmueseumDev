#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Iterable


IMG_EXTS = {".jpg", ".jpeg", ".png"}


def _normalize_for_match(s: str) -> str:
    s = s.strip().lower().replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"\s+", " ", s)
    return s


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFC", s.strip())
    repl = {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "Ä": "Ae",
        "Ö": "Oe",
        "Ü": "Ue",
        "ß": "ss",
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[_\s]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-")


def _split_camel(s: str) -> str:
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    s = re.sub(r"([A-Z])([A-Z][a-z])", r"\1 \2", s)
    return s


_RE_DIMS = re.compile(r"(?P<w>\d{2,3})\s*[xX]\s*(?P<h>\d{2,3})")
_RE_YEAR = re.compile(r"\b(19\d{2}|20\d{2})\b")


def parse_dims(stem: str) -> tuple[int | None, int | None]:
    m = _RE_DIMS.search(stem)
    if not m:
        return None, None
    try:
        return int(m.group("w")), int(m.group("h"))
    except ValueError:
        return None, None


def parse_year(stem: str) -> int | None:
    years = [int(m.group(1)) for m in _RE_YEAR.finditer(stem)]
    if not years:
        return None
    return years[-1]


def parse_medium(stem: str) -> str | None:
    s = _normalize_for_match(stem)
    if "aquarell" in s:
        return "Aquarell"
    if "acryl" in s or "acry" in s:
        return "Acryl"
    if "oil" in s or "oel" in s:
        return "Oel"
    if "papier" in s:
        return "Papier"
    if "leinwand" in s or "leihnwand" in s:
        return "Leinwand"
    return None


def clean_title(stem: str) -> str:
    s = stem.replace("_", " ").replace("-", " ")
    s = _split_camel(s)
    s = re.sub(r"\s+", " ", s).strip()
    s = _RE_DIMS.sub("", s)
    s = re.sub(r"\bcm\b", "", s, flags=re.IGNORECASE)
    s = _RE_YEAR.sub("", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    s = s.strip(" .,_-")
    return s or stem


def detect_category(path: Path) -> str:
    s = _normalize_for_match(str(path))
    if "canvas_large" in s or "leinwand gross" in s or "leinwand-gross" in s or "gross" in s:
        return "canvas_large"
    if "canvas_small" in s or "leinwand klein" in s or "leinwand-klein" in s or "klein" in s:
        return "canvas_small"
    if "paper" in s or "papier" in s:
        return "paper"
    return "other"


def extract_artist_series(path: Path) -> tuple[str | None, str | None]:
    parts = [p for p in path.parts]
    if "artists" in parts:
        idx = parts.index("artists")
        if len(parts) > idx + 3:
            artist_id = parts[idx + 1]
            if parts[idx + 2] == "series":
                series_id = parts[idx + 3] if len(parts) > idx + 3 else None
            else:
                series_id = None
            return artist_id, series_id
    return None, None


def iter_images(paths: Iterable[Path]) -> Iterable[Path]:
    for root in paths:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in IMG_EXTS:
                yield p


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan data folders and create a draft artworks CSV.")
    parser.add_argument("--root", default="data", help="Root data directory (default: data)")
    parser.add_argument("--out", default="data/catalog/artworks.draft.csv", help="Output CSV path")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing output CSV")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    data_root = (project_root / args.root).resolve()
    out_path = (project_root / args.out).resolve()

    if out_path.exists() and not args.overwrite:
        print(f"Output exists: {out_path}. Use --overwrite to replace.")
        return 1

    artist_root = data_root / "artists"
    inbox_root = data_root / "inbox"

    rows: list[dict[str, str]] = []
    seen_ids: dict[str, int] = {}

    for img in iter_images([artist_root, inbox_root]):
        stem = img.stem
        title = clean_title(stem)
        width, height = parse_dims(stem)
        year = parse_year(stem)
        medium = parse_medium(stem)
        category = detect_category(img)

        prefix = {
            "canvas_large": "canvas-large",
            "canvas_small": "canvas-small",
            "paper": "paper",
            "other": "other",
        }.get(category, "other")
        base_id = f"{prefix}-{slugify(title)}" if title else f"{prefix}-{slugify(stem)}"
        count = seen_ids.get(base_id, 0) + 1
        seen_ids[base_id] = count
        art_id = base_id if count == 1 else f"{base_id}-{count}"

        artist_id, series_id = extract_artist_series(img)

        rel_path = img.relative_to(project_root).as_posix()

        rows.append(
            {
                "id": art_id,
                "title": title,
                "year": str(year or ""),
                "medium": medium or "",
                "width_cm": str(width or ""),
                "height_cm": str(height or ""),
                "category": category,
                "status": "available",
                "price_eur": "",
                "images_source": rel_path,
                "series_id": series_id or "",
                "artist_id": artist_id or "",
                "room_id": "",
                "edition": "",
                "tags": "",
                "story": "",
                "shopify_handle": "",
                "shopify_collection_url": "",
                "availability_notes": "",
            }
        )

    rows.sort(key=lambda r: r["id"])
    out_path.parent.mkdir(parents=True, exist_ok=True)

    headers = list(rows[0].keys()) if rows else [
        "id",
        "title",
        "year",
        "medium",
        "width_cm",
        "height_cm",
        "category",
        "status",
        "price_eur",
        "images_source",
        "series_id",
        "artist_id",
        "room_id",
        "edition",
        "tags",
        "story",
        "shopify_handle",
        "shopify_collection_url",
        "availability_notes",
    ]

    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"Scanned {len(rows)} images.")
    print("Wrote:", out_path.relative_to(project_root))
    print("Timestamp:", datetime.now().isoformat(timespec="seconds"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
