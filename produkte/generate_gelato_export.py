from __future__ import annotations

import csv
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = REPO_ROOT / "data/catalog/artworks.csv"
OUTPUT_PATH = REPO_ROOT / "produkte/gelato_export.csv"
JOBS_OUTPUT_PATH = REPO_ROOT / "produkte/gelato_jobs.csv"
ARTWORKS_TS = REPO_ROOT / "src/content/artworks.generated.ts"
PACKS_TS = REPO_ROOT / "src/content/artist_packs.generated.ts"
GENERATED_OVERRIDES_TS = REPO_ROOT / "src/content/artworks.overrides.generated.ts"
MANUAL_OVERRIDES_TS = REPO_ROOT / "src/content/artworks.overrides.ts"
ARTWORKS_INDEX_TS = REPO_ROOT / "src/content/artworks.ts"


def parse_int(value: str) -> int | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return int(float(value.replace(",", ".")))
    except ValueError:
        return None


def parse_float(value: str) -> float | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return None


def extract_json_block(path: Path, start_marker: str, open_char: str, close_char: str) -> str:
    text = path.read_text(encoding="utf-8")
    start = text.index(start_marker)
    assign = text.index("=", start)
    start = text.index(open_char, assign)
    depth = 0
    for idx in range(start, len(text)):
        char = text[idx]
        if char == open_char:
            depth += 1
        elif char == close_char:
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]
    raise ValueError(f"Could not extract block from {path}")


def parse_generated_array(path: Path, start_marker: str) -> list[dict]:
    return json.loads(extract_json_block(path, start_marker, "[", "]"))


def parse_generated_object(path: Path, start_marker: str) -> dict:
    return json.loads(extract_json_block(path, start_marker, "{", "}"))


def parse_manual_overrides(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
    block = extract_json_block_from_text(text, "export const artworkOverrides", "{", "}")
    block = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', block)
    block = re.sub(r",(\s*[}\]])", r"\1", block)
    return json.loads(block)


def extract_json_block_from_text(text: str, start_marker: str, open_char: str, close_char: str) -> str:
    start = text.index(start_marker)
    assign = text.index("=", start)
    start = text.index(open_char, assign)
    depth = 0
    for idx in range(start, len(text)):
        char = text[idx]
        if char == open_char:
            depth += 1
        elif char == close_char:
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]
    raise ValueError(f"Could not extract block for marker {start_marker}")


def parse_artist_photo_ids(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"ARTIST_PHOTO_IDS\s*=\s*\[(.*?)\]", text, re.S)
    if not match:
        return set()
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def normalize_status(value: str) -> str:
    value = (value or "").strip().lower()
    if value in {"available", "original available", "avalable"}:
        return "available"
    if value in {"not", "not available", "sold", "unavailable", "not_for_sale"}:
        return "not_available"
    return "unknown"


def orientation_for(width_cm: int | None, height_cm: int | None) -> str:
    if not width_cm or not height_cm:
        return "unknown"
    if width_cm == height_cm:
        return "square"
    if width_cm > height_cm:
        return "landscape"
    return "portrait"


def aspect_ratio_for(width_cm: int | None, height_cm: int | None) -> str:
    if not width_cm or not height_cm:
        return ""
    return f"{width_cm / height_cm:.4f}"


def choose_profile(category: str, width_cm: int | None, height_cm: int | None) -> str:
    if category == "other":
        return "manual_review"
    if not width_cm or not height_cm:
        return "manual_review"
    ratio = width_cm / height_cm
    if 0.9 <= ratio <= 1.1:
        return "square_standard"
    if ratio < 1:
        return "portrait_standard"
    return "landscape_standard"


def choose_material(category: str) -> str:
    if category in {"canvas_large", "canvas_small"}:
        return "canvas"
    if category == "paper":
        return "fine_art_paper"
    return "manual"


def choose_finish(material: str) -> str:
    if material == "canvas":
        return "none"
    if material == "fine_art_paper":
        return "matte"
    return "manual"


def choose_sizes(profile: str) -> str:
    if profile == "portrait_standard":
        return "21x30|30x40|50x70|70x100"
    if profile == "square_standard":
        return "20x20|30x30|50x50"
    if profile == "landscape_standard":
        return "30x21|40x30|70x50|100x70"
    return "manual"


def should_create_print_product(category: str, source_exists: bool, width_cm: int | None, height_cm: int | None) -> str:
    if category not in {"canvas_large", "canvas_small", "paper"}:
        return "no"
    if not source_exists:
        return "yes"
    if not width_cm or not height_cm:
        return "no"
    return "yes"


def manual_review_required(category: str, source_exists: bool, width_cm: int | None, height_cm: int | None) -> str:
    if category == "other":
        return "yes"
    if not width_cm or not height_cm:
        return "yes"
    if not source_exists:
        return "yes"
    return "no"


def product_mode(category: str, normalized_status: str, create_print_product: str) -> str:
    if create_print_product != "yes":
        return "manual_review"
    if category == "other":
        return "manual_review"
    if normalized_status == "available":
        return "original_available_plus_prints"
    if normalized_status == "not_available":
        return "prints_only_original_sold"
    return "prints_only_status_unknown"


def rel_path_or_empty(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return ""


def main() -> None:
    generated_artworks = parse_generated_array(ARTWORKS_TS, "export const generatedArtworks")
    generated_overrides = parse_generated_object(GENERATED_OVERRIDES_TS, "export const artworkOverrides")
    manual_overrides = parse_manual_overrides(MANUAL_OVERRIDES_TS)
    artist_packs = parse_generated_array(PACKS_TS, "export const artistPacks")
    artist_photo_ids = parse_artist_photo_ids(ARTWORKS_INDEX_TS)

    catalog_rows: dict[str, dict[str, str]] = {}
    with INPUT_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            if not any((value or "").strip() for value in row.values()):
                continue
            artwork_id = (row.get("id") or "").strip()
            if artwork_id:
                catalog_rows[artwork_id] = row

    displayed: list[dict] = []
    for artwork in generated_artworks:
        displayed.append({"display_source": "generated_catalog", **artwork})
    for pack in artist_packs:
        for artwork in pack.get("artworks", []) or []:
            displayed.append({"display_source": f"artist_pack:{pack['artist']['id']}", **artwork})

    rows_out: list[dict[str, str]] = []
    for artwork in displayed:
        artwork_id = (artwork.get("id") or "").strip()
        if not artwork_id:
            continue

        merged = dict(artwork)
        generated_override = generated_overrides.get(artwork_id)
        if isinstance(generated_override, dict):
            merged = deep_merge(merged, generated_override)
        manual_override = manual_overrides.get(artwork_id)
        if isinstance(manual_override, dict):
            merged = deep_merge(merged, manual_override)

        catalog_row = catalog_rows.get(artwork_id, {})

        title = (merged.get("title") or catalog_row.get("title") or "").strip()
        artist_id = (merged.get("artistId") or catalog_row.get("artist_id") or "").strip()
        category = (merged.get("category") or catalog_row.get("category") or "").strip()
        year_value = merged.get("year")
        year = str(year_value) if year_value not in (None, "") else (catalog_row.get("year") or "").strip()
        medium = (merged.get("medium") or catalog_row.get("medium") or "").strip()
        width_cm = parse_int(str(merged.get("widthCm", ""))) or parse_int(catalog_row.get("width_cm") or "")
        height_cm = parse_int(str(merged.get("heightCm", ""))) or parse_int(catalog_row.get("height_cm") or "")
        original_status = normalize_status(str(merged.get("status") or catalog_row.get("status") or ""))
        original_price = parse_float(str(merged.get("priceEur", ""))) or parse_float(catalog_row.get("price_eur") or "")

        source_rel = (catalog_row.get("images_source") or "").strip()
        source_abs = (REPO_ROOT / source_rel).resolve() if source_rel else Path()
        source_exists = bool(source_rel) and source_abs.exists()

        images = merged.get("images") or {}
        public_full_path = (images.get("full") or "").strip()
        public_texture_path = (images.get("texture") or "").strip()
        public_thumb_path = (images.get("thumb") or "").strip()
        public_full_abs = (REPO_ROOT / "public" / public_full_path.lstrip("/")) if public_full_path.startswith("/") else Path(public_full_path)
        public_texture_abs = (REPO_ROOT / "public" / public_texture_path.lstrip("/")) if public_texture_path.startswith("/") else Path(public_texture_path)
        public_thumb_abs = (REPO_ROOT / "public" / public_thumb_path.lstrip("/")) if public_thumb_path.startswith("/") else Path(public_thumb_path)

        preferred_upload_abs = source_abs if source_exists else public_full_abs
        profile = choose_profile(category, width_cm, height_cm)
        material = choose_material(category)
        finish = choose_finish(material)
        is_artist_photo = "yes" if artwork_id in artist_photo_ids else "no"
        create_print = should_create_print_product(category, source_exists or public_full_abs.exists(), width_cm, height_cm)
        if is_artist_photo == "yes":
            create_print = "no"
        review_required = manual_review_required(category, source_exists or public_full_abs.exists(), width_cm, height_cm)
        if is_artist_photo == "yes":
            review_required = "yes"
        notes: list[str] = []

        if not source_exists:
            notes.append("original_source_missing_or_not_catalogued")
        if not width_cm or not height_cm:
            notes.append("missing_dimensions")
        if category == "other":
            notes.append("non_standard_category")
        if original_status == "unknown":
            notes.append("unknown_original_status")
        if is_artist_photo == "yes":
            notes.append("artist_photo_not_product")
        if not public_full_abs.exists():
            notes.append("public_full_missing")

        shopify = merged.get("shopify") or {}
        rows_out.append(
            {
                "artwork_id": artwork_id,
                "title": title,
                "artist_id": artist_id,
                "display_source": str(artwork.get("display_source") or ""),
                "category": category,
                "year": year,
                "medium": medium,
                "width_cm": "" if width_cm is None else str(width_cm),
                "height_cm": "" if height_cm is None else str(height_cm),
                "orientation": orientation_for(width_cm, height_cm),
                "aspect_ratio": aspect_ratio_for(width_cm, height_cm),
                "status_original": original_status,
                "original_price_eur": "" if original_price is None else f"{original_price:.2f}",
                "is_artist_photo": is_artist_photo,
                "create_print_product": create_print,
                "manual_review_required": review_required,
                "product_mode": product_mode(category, original_status, create_print),
                "gelato_profile": profile,
                "gelato_material": material,
                "gelato_finish": finish,
                "gelato_size_candidates_cm": choose_sizes(profile),
                "source_image_path": source_rel,
                "source_image_path_abs": str(source_abs) if source_rel else "",
                "source_image_exists": "yes" if source_exists else "no",
                "public_full_path": public_full_path,
                "public_full_path_abs": str(public_full_abs) if public_full_path else "",
                "public_texture_path": public_texture_path,
                "public_thumb_path": public_thumb_path,
                "preferred_upload_path_abs": str(preferred_upload_abs) if str(preferred_upload_abs) else "",
                "shopify_handle": str(shopify.get("productHandle") or catalog_row.get("shopify_handle") or "").strip(),
                "shopify_collection_url": str(shopify.get("collectionUrl") or catalog_row.get("shopify_collection_url") or "").strip(),
                "notes": "|".join(notes),
            }
        )

    fieldnames = [
        "artwork_id",
        "title",
        "artist_id",
        "display_source",
        "category",
        "year",
        "medium",
        "width_cm",
        "height_cm",
        "orientation",
        "aspect_ratio",
        "status_original",
        "original_price_eur",
        "is_artist_photo",
        "create_print_product",
        "manual_review_required",
        "product_mode",
        "gelato_profile",
        "gelato_material",
        "gelato_finish",
        "gelato_size_candidates_cm",
        "source_image_path",
        "source_image_path_abs",
        "source_image_exists",
        "public_full_path",
        "public_full_path_abs",
        "public_texture_path",
        "public_thumb_path",
        "preferred_upload_path_abs",
        "shopify_handle",
        "shopify_collection_url",
        "notes",
    ]

    job_fieldnames = [
        "artwork_id",
        "title",
        "artist_id",
        "display_source",
        "category",
        "year",
        "medium",
        "width_cm",
        "height_cm",
        "orientation",
        "status_original",
        "original_price_eur",
        "gelato_profile",
        "gelato_material",
        "gelato_finish",
        "gelato_size_candidates_cm",
        "preferred_upload_path_abs",
        "public_full_path_abs",
        "shopify_handle",
        "shopify_collection_url",
        "notes",
    ]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_out)

    job_rows = [
        row
        for row in rows_out
        if row["create_print_product"] == "yes"
        and row["manual_review_required"] == "no"
        and row["is_artist_photo"] == "no"
    ]

    with JOBS_OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=job_fieldnames)
        writer.writeheader()
        writer.writerows([{key: row.get(key, "") for key in job_fieldnames} for row in job_rows])

    print(f"Wrote {len(rows_out)} rows to {OUTPUT_PATH}")
    print(f"Wrote {len(job_rows)} rows to {JOBS_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
