from __future__ import annotations

import colorsys
import csv
import json
import math
import re
import shutil
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageOps


IMG_EXTS = {".jpg", ".jpeg", ".png"}


@dataclass(frozen=True)
class SourceCategory:
    category: str  # matches ArtworkCategory in TS (canvas_large, canvas_small, paper, ...)
    id_prefix: str  # used in artwork id (canvas-large, canvas-small, paper)
    dir_match: tuple[str, ...]  # keywords to match the source directory (normalized)


SOURCES: list[SourceCategory] = [
    SourceCategory(
        category="canvas_large",
        id_prefix="canvas-large",
        dir_match=("leihnwa", "gross"),
    ),
    SourceCategory(
        category="canvas_small",
        id_prefix="canvas-small",
        dir_match=("leihnwa", "klein"),
    ),
    SourceCategory(
        category="paper",
        id_prefix="paper",
        dir_match=("papier", "bilder"),
    ),
    SourceCategory(
        category="other",
        id_prefix="other",
        dir_match=("material",),
    ),
]


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
    # "BierBassBelanglosigkeit" -> "Bier Bass Belanglosigkeit"
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
    # take the last year if multiple appear
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
    s = stem
    s = s.replace("_", " ").replace("-", " ")
    s = _split_camel(s)
    s = re.sub(r"\s+", " ", s).strip()

    # remove dims like 70x100, optionally followed by cm
    s = _RE_DIMS.sub("", s)
    s = re.sub(r"\bcm\b", "", s, flags=re.IGNORECASE)

    # remove year
    s = _RE_YEAR.sub("", s)

    # remove repeated spaces
    s = re.sub(r"\s{2,}", " ", s).strip()

    # remove stray punctuation at ends
    s = s.strip(" .,_-")
    return s or stem


def _resize_to_max(img: Image.Image, max_edge: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_edge:
        return img
    if w >= h:
        new_w = max_edge
        new_h = round(h * (max_edge / w))
    else:
        new_h = max_edge
        new_w = round(w * (max_edge / h))
    return img.resize((new_w, new_h), resample=Image.Resampling.LANCZOS)


def _ensure_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGB",):
        return img
    if img.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        return bg
    return img.convert("RGB")


def _save_webp(img: Image.Image, path: Path, *, quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="WEBP", quality=quality, method=6)


def _rgb_to_hex(r: float, g: float, b: float) -> str:
    return f"#{int(r):02x}{int(g):02x}{int(b):02x}"


def image_features(img: Image.Image) -> tuple[list[float], str]:
    small = img.resize((64, 64), resample=Image.Resampling.BILINEAR)
    pixels = list(small.getdata())
    if not pixels:
        return [0.5, 0.5, 0.5, 0.0, 0.5, 0.5, 0.0], "#808080"

    n = len(pixels)
    sum_r = 0.0
    sum_g = 0.0
    sum_b = 0.0
    sum_s = 0.0
    sum_v = 0.0
    lums: list[float] = []

    for r, g, b in pixels:
        sum_r += r
        sum_g += g
        sum_b += b
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        sum_s += s
        sum_v += v
        lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
        lums.append(lum)

    mean_r = sum_r / n
    mean_g = sum_g / n
    mean_b = sum_b / n
    mean_s = sum_s / n
    mean_v = sum_v / n
    mean_l = sum(lums) / n
    var_l = sum((l - mean_l) ** 2 for l in lums) / n
    std_l = math.sqrt(var_l)

    features = [
        mean_r / 255.0,
        mean_g / 255.0,
        mean_b / 255.0,
        mean_s,
        mean_v,
        mean_l,
        std_l,
    ]
    dominant = _rgb_to_hex(mean_r, mean_g, mean_b)
    return features, dominant


def _dist(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def kmeans(features: list[list[float]], k: int = 3, max_iter: int = 22) -> tuple[list[int], list[list[float]], list[list[int]]]:
    n = len(features)
    if n == 0:
        return [], [], []
    if n <= k:
        assignments = list(range(n))
        centers = [features[i] for i in assignments]
        clusters = [[i] for i in assignments]
        return assignments, centers, clusters

    ordered = sorted(range(n), key=lambda i: features[i][5])  # mean luminance
    seeds = [ordered[0], ordered[n // 2], ordered[-1]]
    centers = [features[i][:] for i in seeds]

    assignments: list[int] = [0] * n
    for _ in range(max_iter):
        clusters = [[] for _ in range(k)]
        for i, f in enumerate(features):
            dists = [_dist(f, c) for c in centers]
            idx = min(range(k), key=lambda j: dists[j])
            assignments[i] = idx
            clusters[idx].append(i)

        new_centers: list[list[float]] = []
        for ci in range(k):
            if not clusters[ci]:
                new_centers.append(centers[ci])
                continue
            dims = len(features[0])
            mean = [0.0] * dims
            for i in clusters[ci]:
                for d in range(dims):
                    mean[d] += features[i][d]
            mean = [v / len(clusters[ci]) for v in mean]
            new_centers.append(mean)

        if new_centers == centers:
            break
        centers = new_centers

    clusters = [[] for _ in range(k)]
    for idx, cluster_id in enumerate(assignments):
        clusters[cluster_id].append(idx)

    return assignments, centers, clusters


def _find_source_dirs(for_sale_dir: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    if not for_sale_dir.exists():
        raise SystemExit(f"Missing source directory: {for_sale_dir}")

    dirs = [p for p in for_sale_dir.iterdir() if p.is_dir()]
    for src in SOURCES:
        for d in dirs:
            name = _normalize_for_match(d.name)
            if all(k in name for k in src.dir_match):
                out[src.category] = d
                break

    missing = [s.category for s in SOURCES if s.category not in out]
    if missing:
        raise SystemExit(f"Could not find source folders for: {missing}. Found: {[d.name for d in dirs]}")

    return out


def _iter_images(dir_path: Path) -> Iterable[Path]:
    for p in sorted(dir_path.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        if p.suffix.lower() not in IMG_EXTS:
            continue
        yield p


def build_artworks(project_root: Path) -> tuple[list[dict], dict[int, dict[str, str]]]:
    for_sale_dir = project_root.parent / "kunst" / "Bilder" / "for sale"
    src_dirs = _find_source_dirs(for_sale_dir)

    seen_ids: set[str] = set()
    artworks: list[dict] = []
    features: list[list[float]] = []

    # map category -> id_prefix
    prefix_by_cat = {s.category: s.id_prefix for s in SOURCES}

    out_base = project_root / "public" / "artworks"
    out_base.mkdir(parents=True, exist_ok=True)

    # Clean previously generated folders (keeps output stable across reruns).
    prefixes = {s.id_prefix + "-" for s in SOURCES}
    for child in out_base.iterdir():
        if not child.is_dir():
            continue
        if any(child.name.startswith(p) for p in prefixes):
            shutil.rmtree(child)

    for category, src_dir in src_dirs.items():
        id_prefix = prefix_by_cat[category]
        for img_path in _iter_images(src_dir):
            stem = img_path.stem.strip()
            title = clean_title(stem)
            base_slug = slugify(title) or slugify(stem) or "untitled"
            art_id = f"{id_prefix}-{base_slug}"
            if art_id in seen_ids:
                n = 2
                while f"{art_id}-{n}" in seen_ids:
                    n += 1
                art_id = f"{art_id}-{n}"

            seen_ids.add(art_id)

            # Open + orient image
            img = Image.open(img_path)
            img = ImageOps.exif_transpose(img)
            img = _ensure_rgb(img)

            aspect = img.size[0] / img.size[1] if img.size[1] else 1.0
            feat, dominant = image_features(img)

            # Output paths
            out_dir = out_base / art_id
            texture_path = out_dir / "texture.webp"
            full_path = out_dir / "full.webp"
            thumb_path = out_dir / "thumb.webp"

            # Generate variants
            tex = _resize_to_max(img, 2048)
            full = _resize_to_max(img, 3000)
            thumb = _resize_to_max(img, 600)

            _save_webp(tex, texture_path, quality=82)
            _save_webp(full, full_path, quality=88)
            _save_webp(thumb, thumb_path, quality=72)

            w_cm, h_cm = parse_dims(stem)
            year = parse_year(stem)
            medium = parse_medium(stem)

            artworks.append(
                {
                    "id": art_id,
                    "artistId": "felix",
                    "title": title,
                    "year": year,
                    "medium": medium,
                    "widthCm": w_cm,
                    "heightCm": h_cm,
                    "aspect": round(float(aspect), 6),
                    "category": category,
                    "status": "available",
                    "zoneId": 0,
                    "dominantColor": dominant,
                    "images": {
                        "texture": f"/artworks/{art_id}/texture.webp",
                        "full": f"/artworks/{art_id}/full.webp",
                        "thumb": f"/artworks/{art_id}/thumb.webp",
                    },
                    "shopify": {},
                }
            )
            features.append(feat)

    zone_meta: dict[int, dict[str, str]] = {0: {}, 1: {}, 2: {}}
    assignments, centers, clusters = kmeans(features, k=3, max_iter=24)
    if assignments and centers:
        brightness = {i: centers[i][5] for i in range(len(centers))}
        ordered = sorted(brightness.keys(), key=lambda i: brightness[i], reverse=True)
        mapping: dict[int, int] = {}
        if len(ordered) >= 3:
            mapping[ordered[0]] = 1  # brightest -> modern
            mapping[ordered[1]] = 0  # middle -> loft
            mapping[ordered[2]] = 2  # darkest -> castle
        else:
            mapping = {i: 0 for i in ordered}

        for i, art in enumerate(artworks):
            art["zoneId"] = mapping.get(assignments[i], 0)

        for cluster_id, indices in enumerate(clusters):
            if not indices:
                continue
            center = centers[cluster_id]
            closest = min(indices, key=lambda idx: _dist(features[idx], center))
            zone_id = mapping.get(cluster_id, 0)
            lead_id = artworks[closest]["id"]
            accent = artworks[closest].get("dominantColor") or "#b8b8b8"
            zone_meta[zone_id] = {
                "leadArtworkId": lead_id,
                "accentColor": accent,
            }

    return artworks, zone_meta


def write_generated_ts(project_root: Path, artworks: list[dict], zone_meta: dict[int, dict[str, str]]) -> Path:
    out_path = project_root / "src" / "content" / "artworks.generated.ts"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    now_iso = datetime.now(timezone.utc).isoformat()

    # Drop empty keys to keep file cleaner
    def cleanup(obj: dict) -> dict:
        out: dict = {}
        for k, v in obj.items():
            if v is None:
                continue
            if isinstance(v, dict) and not v:
                continue
            out[k] = v
        return out

    cleaned = [cleanup(a) for a in artworks]

    header = [
        "/* eslint-disable */",
        "// This file is generated by scripts/import_artworks.py",
        "// Do not edit by hand; use `artworks.overrides.ts` for manual changes.",
        "",
        'import type { Artwork } from "@/content/types";',
        "",
        f'export const generatedAtIso = {json.dumps(now_iso)};',
        "",
        "export const generatedArtworks: Artwork[] = ",
    ]

    body = json.dumps(cleaned, ensure_ascii=False, indent=2)
    zone_block = []
    if zone_meta:
        zone_block = [
            "",
            f"export const generatedZoneMeta = {json.dumps(zone_meta, ensure_ascii=False, indent=2)} as const;",
            "",
        ]

    footer = [";"] + zone_block + [""]

    out_path.write_text("\n".join(header) + body + "\n" + "\n".join(footer), encoding="utf-8")
    return out_path


def _normalize_status(value: str) -> str | None:
    s = value.strip().lower()
    if not s:
        return None
    if s in {"sold", "verkauft"}:
        return "sold"
    if s in {
        "not_for_sale",
        "not for sale",
        "not_available",
        "not available",
        "not",
        "unavailable",
        "nicht verfuegbar",
        "nicht verfügbar",
        "nfs",
    }:
        return "not_for_sale"
    return "available"


def _to_int(value: str) -> int | None:
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def _to_price(value: str) -> float | None:
    if not value:
        return None
    cleaned = (
        value.replace("EUR", "")
        .replace("€", "")
        .replace("eur", "")
        .replace(",", ".")
        .strip()
    )
    cleaned = re.sub(r"[^\d.]", "", cleaned)
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def load_overrides_from_csv(project_root: Path) -> dict[str, dict]:
    csv_path = project_root / "data" / "catalog" / "artworks.csv"
    if not csv_path.exists():
        return {}

    overrides: dict[str, dict] = {}
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        sample = f.read(2048)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        except csv.Error:
            dialect = csv.excel
            dialect.delimiter = ";" if ";" in sample else ","
        reader = csv.DictReader(f, dialect=dialect)
        for row in reader:
            art_id = (row.get("id") or "").strip()
            if not art_id:
                continue

            ov: dict[str, object] = {}

            title = (row.get("title") or "").strip()
            if title:
                ov["title"] = title

            year = _to_int((row.get("year") or "").strip())
            if year:
                ov["year"] = year

            medium = (row.get("medium") or "").strip()
            if medium:
                ov["medium"] = medium

            width = _to_int((row.get("width_cm") or "").strip())
            height = _to_int((row.get("height_cm") or "").strip())
            if width:
                ov["widthCm"] = width
            if height:
                ov["heightCm"] = height

            status = _normalize_status(row.get("status") or "")
            if status:
                ov["status"] = status

            price = _to_price((row.get("price_eur") or "").strip())
            if price is not None:
                ov["priceEur"] = price

            artist_id = (row.get("artist_id") or "").strip()
            if artist_id:
                ov["artistId"] = artist_id

            category = (row.get("category") or "").strip()
            if category:
                ov["category"] = category

            story = (row.get("story") or "").strip()
            if story:
                ov["infoBox"] = story

            shopify_handle = (row.get("shopify_handle") or "").strip()
            shopify_collection_url = (row.get("shopify_collection_url") or "").strip()
            if shopify_handle or shopify_collection_url:
                shopify: dict[str, str] = {}
                if shopify_handle:
                    shopify["productHandle"] = shopify_handle
                if shopify_collection_url:
                    shopify["collectionUrl"] = shopify_collection_url
                ov["shopify"] = shopify

            if ov:
                overrides[art_id] = ov

    return overrides


def write_overrides_ts(project_root: Path, overrides: dict[str, dict]) -> Path:
    out_path = project_root / "src" / "content" / "artworks.overrides.generated.ts"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(timezone.utc).isoformat()

    header = [
        "/* eslint-disable */",
        "// This file is generated by scripts/import_artworks.py from data/catalog/artworks.csv",
        "// Do not edit by hand.",
        "",
        'import type { ArtworkOverride } from "@/content/artworks.overrides";',
        "",
        f"export const generatedOverridesAtIso = {json.dumps(now_iso)};",
        "",
        "export const artworkOverrides: Record<string, ArtworkOverride> = ",
    ]
    body = json.dumps(overrides, ensure_ascii=False, indent=2)
    footer = [";", ""]

    out_path.write_text("\n".join(header) + body + "\n" + "\n".join(footer), encoding="utf-8")
    return out_path


def copy_about_pdf(project_root: Path) -> Path | None:
    src = project_root.parent / "kunst" / "Felix Malerei-Kurzportrait-2024-09.pdf"
    if not src.exists():
        return None
    dest = project_root / "public" / "artist" / "felix-ipfling-kurzportrait-2024-09.pdf"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return dest


def copy_video(project_root: Path) -> Path | None:
    src = project_root / "vidhelloWorld1.mp4"
    if not src.exists():
        return None
    dest = project_root / "public" / "video" / "helloworld.mp4"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return dest


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    print("Project root:", project_root)

    artworks, zone_meta = build_artworks(project_root)
    artworks.sort(key=lambda a: a["id"])

    ts_path = write_generated_ts(project_root, artworks, zone_meta)
    overrides = load_overrides_from_csv(project_root)
    override_path = None
    if overrides:
        override_path = write_overrides_ts(project_root, overrides)
    pdf_path = copy_about_pdf(project_root)
    video_path = copy_video(project_root)

    print(f"Artworks processed: {len(artworks)}")
    print("Wrote:", ts_path.relative_to(project_root))
    if override_path:
        print("Overrides:", override_path.relative_to(project_root))
    if pdf_path:
        print("Copied:", pdf_path.relative_to(project_root))
    else:
        print("No about PDF copied (source missing).")
    if video_path:
        print("Copied:", video_path.relative_to(project_root))
    else:
        print("No video copied (source missing).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
