#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import os
import re
import unicodedata
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


def parse_dims(text: str) -> tuple[int | None, int | None]:
    m = _RE_DIMS.search(text)
    if not m:
        return None, None
    try:
        return int(m.group("w")), int(m.group("h"))
    except ValueError:
        return None, None


def parse_year(text: str) -> int | None:
    years = [int(m.group(1)) for m in _RE_YEAR.finditer(text)]
    if not years:
        return None
    return years[-1]


def parse_medium(text: str) -> str | None:
    s = _normalize_for_match(text)
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
    if "gross" in s:
        return "canvas_large"
    if "klein" in s:
        return "canvas_small"
    if "papier" in s:
        return "paper"
    return "other"


def iter_images(dir_path: Path) -> Iterable[Path]:
    for p in sorted(dir_path.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        if p.suffix.lower() not in IMG_EXTS:
            continue
        yield p


def build_reference_index(ref_root: Path) -> dict[str, dict]:
    index: dict[str, dict] = {}
    if not ref_root.exists():
        return index
    for p in iter_images(ref_root):
        stem = p.stem
        title = clean_title(stem)
        key = slugify(title)
        width, height = parse_dims(stem)
        if not width or not height:
            folder_dims = parse_dims(p.parent.name)
            if folder_dims[0] and folder_dims[1]:
                width, height = folder_dims
        year = parse_year(stem)
        medium = parse_medium(stem)
        if key and key not in index:
            index[key] = {
                "width_cm": width,
                "height_cm": height,
                "year": year,
                "medium": medium,
            }
    return index


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate artworks.csv from kunst/Bilder/for sale (+ reference folder).")
    parser.add_argument(
        "--for-sale",
        default="../kunst/Bilder/for sale",
        help="Path to 'for sale' folder (relative to project root)",
    )
    parser.add_argument(
        "--reference",
        default="../kunst/Bilder/bilderF.IPFLING",
        help="Reference folder with size names (relative to project root)",
    )
    parser.add_argument("--out", default="data/catalog/artworks.csv", help="Output CSV path")
    parser.add_argument("--artist-id", default="felix", help="Artist id to set in CSV")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    for_sale_root = (project_root / args.for_sale).resolve()
    reference_root = (project_root / args.reference).resolve()
    out_path = (project_root / args.out).resolve()

    if not for_sale_root.exists():
        print("Missing for-sale folder:", for_sale_root)
        return 1

    ref_index = build_reference_index(reference_root)
    rows: list[dict[str, str]] = []
    seen_ids: dict[str, int] = {}

    for img in iter_images(for_sale_root):
        stem = img.stem.strip()
        title = clean_title(stem)
        key = slugify(title)
        width, height = parse_dims(stem)
        year = parse_year(stem)
        medium = parse_medium(stem)

        if key in ref_index:
            ref = ref_index[key]
            if not width:
                width = ref.get("width_cm")
            if not height:
                height = ref.get("height_cm")
            if not year:
                year = ref.get("year")
            if not medium:
                medium = ref.get("medium")

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

        rel_path = Path(os.path.relpath(img, project_root)).as_posix()

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
                "series_id": "",
                "artist_id": args.artist_id,
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

    print(f"Scanned {len(rows)} images from for sale.")
    print("Wrote:", out_path.relative_to(project_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
