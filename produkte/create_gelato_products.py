from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
import math
from pathlib import Path
from typing import Any
from urllib import error, parse, request


REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL_PATH = REPO_ROOT / ".env.local"
CSV_PATH = REPO_ROOT / "produkte/gelato_jobs.csv"
LOG_PATH = REPO_ROOT / "produkte/gelato_created_products.csv"
ASSET_DIR = REPO_ROOT / "public/gelato-assets"
API_BASE_URL = "https://ecommerce.gelatoapis.com/v1"
SQUARE_EPSILON = 0.04
DEFAULT_MAX_CROP_PER_SIDE = 0.05
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)


@dataclass
class Config:
    api_key: str
    store_id: str
    public_file_base_url: str
    api_base_url: str
    default_sales_channel: str
    default_currency: str
    asset_route_prefix: str
    template_id: str


@dataclass(frozen=True)
class TemplateRun:
    key: str
    template_id: str
    title_suffix: str
    description_label: str
    fit_method: str
    variant_mode: str


@dataclass
class VariantDebugRow:
    variant_id: str
    variant_title: str
    placeholder_name: str
    placeholder_width: float
    placeholder_height: float
    variant_ratio: float | None
    variant_orientation: str
    crop_per_side: float
    ratio_distance: float
    orientation_match: bool
    selected: bool = False


PROFILE_DEFAULTS: dict[str, dict[str, str]] = {
    "poster": {
        "title_suffix": "Poster",
        "description_label": "Poster",
        "fit_method": "slice",
        "variant_mode": "ratio_cover",
    },
    "framed": {
        "title_suffix": "Kunstdruck mit Rahmen",
        "description_label": "Kunstdruck mit Rahmen",
        "fit_method": "slice",
        "variant_mode": "ratio_cover",
    },
    "canvas": {
        "title_suffix": "Leinwanddruck",
        "description_label": "Leinwanddruck",
        "fit_method": "slice",
        "variant_mode": "ratio_cover",
    },
    "tshirt": {
        "title_suffix": "T-Shirt",
        "description_label": "T-Shirt",
        "fit_method": "meet",
        "variant_mode": "all",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create Gelato products from produkte/gelato_jobs.csv")
    parser.add_argument("--csv", default=str(CSV_PATH), help="Path to gelato_jobs.csv")
    parser.add_argument("--log", default=str(LOG_PATH), help="Path to CSV log output")
    parser.add_argument("--artist", help="Only process one artist_id")
    parser.add_argument("--limit", type=int, help="Process only the first N rows after filtering")
    parser.add_argument("--sample-diverse", type=int, help="Pick N artworks with different aspect ratios")
    parser.add_argument("--apply", action="store_true", help="Actually create products via Gelato API")
    parser.add_argument("--force", action="store_true", help="Create even if artwork_id already exists in Gelato tags")
    parser.add_argument("--fit-method", choices=["slice", "meet"], help="Override the profile-specific Gelato fit method")
    parser.add_argument(
        "--max-crop-per-side",
        type=float,
        default=DEFAULT_MAX_CROP_PER_SIDE,
        help="Maximum allowed crop per edge/side when filling a poster variant (default: 0.05 = 5%%)",
    )
    parser.add_argument("--skip-asset-prepare", action="store_true", help="Do not create/copy public gelato-assets files before building requests")
    parser.add_argument("--template-id", help="Override GELATO_TEMPLATE_ID for this run")
    parser.add_argument(
        "--template-profile",
        action="append",
        help="Repeatable template selection in the form profile=templateId, e.g. poster=<uuid>, framed=<uuid>, tshirt=<uuid>, canvas=<uuid>",
    )
    parser.add_argument("--public-file-base-url", help="Override GELATO_PUBLIC_FILE_BASE_URL for this run, e.g. https://your-domain.com")
    parser.add_argument("--live-template-preview", action="store_true", help="Fetch real Gelato template data even in dry-run mode")
    parser.add_argument("--debug-variants", action="store_true", help="Print selected variant metrics for each artwork/template")
    parser.add_argument("--debug-variants-csv", help="Optional CSV path for full variant debug output")
    return parser.parse_args()


def load_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def env_get(key: str, loaded: dict[str, str], default: str | None = None) -> str | None:
    value = os.environ.get(key)
    if value is not None and value != "":
        return value
    value = loaded.get(key)
    if value is not None and value != "":
        return value
    return default


def load_config(args: argparse.Namespace) -> Config:
    loaded = load_env_file(ENV_LOCAL_PATH)
    api_key = env_get("GELATO_API_KEY", loaded)
    store_id = env_get("GELATO_STORE_ID", loaded)
    public_file_base_url = args.public_file_base_url or env_get("GELATO_PUBLIC_FILE_BASE_URL", loaded) or env_get("GELATO_FILE_BASE_URL", loaded)
    template_id = args.template_id or env_get("GELATO_TEMPLATE_ID", loaded)
    require_template_id = not (args.template_profile or [])
    missing = [
        name
        for name, value in [
            ("GELATO_API_KEY", api_key),
            ("GELATO_STORE_ID", store_id),
            ("GELATO_PUBLIC_FILE_BASE_URL", public_file_base_url),
            *([("GELATO_TEMPLATE_ID", template_id)] if require_template_id else []),
        ]
        if not value
    ]
    if missing:
        raise SystemExit(f"Missing required env values in .env.local or shell: {', '.join(missing)}")
    return Config(
        api_key=api_key or "",
        store_id=store_id or "",
        public_file_base_url=(public_file_base_url or "").rstrip("/"),
        api_base_url=(env_get("GELATO_API_BASE_URL", loaded, API_BASE_URL) or API_BASE_URL).rstrip("/"),
        default_sales_channel=env_get("GELATO_DEFAULT_SALES_CHANNEL", loaded, "web") or "web",
        default_currency=env_get("GELATO_DEFAULT_CURRENCY", loaded, "EUR") or "EUR",
        asset_route_prefix="/" + (env_get("GELATO_ASSET_ROUTE_PREFIX", loaded, "gelato-assets") or "gelato-assets").strip("/"),
        template_id=template_id or "",
    )


def request_json(method: str, url: str, api_key: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    headers = {
        "Accept": "application/json, text/plain, */*",
        "X-API-KEY": api_key,
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9,de-DE;q=0.8,de;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Origin": "https://dashboard.gelato.com",
        "Referer": "https://dashboard.gelato.com/",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url, method=method, headers=headers, data=data)
    try:
        with request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code == 403 and ("Cloudflare" in body or "Access denied" in body):
            raise RuntimeError(
                f"{method} {url} failed: 403 Cloudflare access block. "
                "This is likely a bot-signature/IP block, not a bad API key."
            ) from exc
        raise RuntimeError(f"{method} {url} failed: {exc.code} {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"{method} {url} failed: {exc}") from exc


def load_jobs(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows = [row for row in rows if (row.get("artwork_id") or "").strip()]
    rows.sort(key=lambda row: ((row.get("artist_id") or "").strip(), (row.get("year") or "").strip(), (row.get("title") or "").strip().casefold()))
    return rows


def normalize_profile_key(value: str) -> str:
    key = value.strip().casefold().replace("_", "-").replace(" ", "-")
    aliases = {
        "framed-art-print": "framed",
        "framed-print": "framed",
        "gerahmt": "framed",
        "kunstdruck-mit-rahmen": "framed",
        "art-print": "poster",
        "shirt": "tshirt",
        "t-shirt": "tshirt",
        "tee": "tshirt",
    }
    return aliases.get(key, key)


def build_template_runs(args: argparse.Namespace, config: Config) -> list[TemplateRun]:
    raw_profiles = args.template_profile or []
    profiles: list[TemplateRun] = []

    if raw_profiles:
        for raw_profile in raw_profiles:
            if "=" not in raw_profile:
                raise SystemExit(f"Invalid --template-profile value '{raw_profile}'. Expected profile=<template-id>.")
            raw_key, template_id = raw_profile.split("=", 1)
            key = normalize_profile_key(raw_key)
            defaults = PROFILE_DEFAULTS.get(key)
            if defaults is None:
                raise SystemExit(f"Unknown template profile '{raw_key}'. Allowed: {', '.join(sorted(PROFILE_DEFAULTS))}")
            profiles.append(
                TemplateRun(
                    key=key,
                    template_id=template_id.strip(),
                    title_suffix=defaults["title_suffix"],
                    description_label=defaults["description_label"],
                    fit_method=args.fit_method or defaults["fit_method"],
                    variant_mode=defaults["variant_mode"],
                )
            )
    else:
        if not config.template_id:
            raise RuntimeError("No Gelato template configured")
        defaults = PROFILE_DEFAULTS["poster"]
        profiles.append(
            TemplateRun(
                key="poster",
                template_id=config.template_id,
                title_suffix=defaults["title_suffix"],
                description_label=defaults["description_label"],
                fit_method=args.fit_method or defaults["fit_method"],
                variant_mode=defaults["variant_mode"],
            )
        )

    return profiles


def select_diverse_rows(rows: list[dict[str, str]], count: int) -> list[dict[str, str]]:
    if count <= 0 or len(rows) <= count:
        return rows

    ranked = sorted(rows, key=lambda row: (artwork_ratio(row), (row.get("artist_id") or "").strip(), (row.get("title") or "").strip().casefold()))
    selected: list[dict[str, str]] = []
    used_indices: set[int] = set()

    def claim_index(target_index: int) -> int:
        if target_index not in used_indices:
            used_indices.add(target_index)
            return target_index
        for offset in range(1, len(ranked)):
            lower = target_index - offset
            upper = target_index + offset
            if lower >= 0 and lower not in used_indices:
                used_indices.add(lower)
                return lower
            if upper < len(ranked) and upper not in used_indices:
                used_indices.add(upper)
                return upper
        raise RuntimeError("Could not select enough diverse sample rows")

    for sample_index in range(count):
        target = round(sample_index * (len(ranked) - 1) / max(1, count - 1))
        selected.append(ranked[claim_index(target)])

    return selected


def normalize_public_route(row: dict[str, str]) -> str:
    route = (row.get("public_full_path_abs") or "").strip()
    if route.startswith("http://") or route.startswith("https://"):
        return route
    if route.startswith(str(REPO_ROOT / "public")):
        route = route.replace(str(REPO_ROOT / "public"), "", 1)
    elif route.startswith(str(REPO_ROOT)):
        route = route.replace(str(REPO_ROOT), "", 1)
    if not route.startswith("/"):
        route = "/" + route.lstrip("/")
    return route


def build_file_url_from_public_route(row: dict[str, str], config: Config) -> str:
    route = normalize_public_route(row)
    if route.startswith("http://") or route.startswith("https://"):
        return route
    return f"{config.public_file_base_url}{route}"


def ensure_asset_dir() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)


def file_extension(path: Path) -> str:
    return path.suffix.lower().lstrip(".")


def convert_image_to_jpg(src: Path, dest: Path) -> None:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required to convert images to JPG. Install with: python3 -m pip install pillow") from exc
    with Image.open(src) as image:
        converted = image.convert("RGB")
        dest.parent.mkdir(parents=True, exist_ok=True)
        converted.save(dest, format="JPEG", quality=94)


def prepare_public_asset(row: dict[str, str], config: Config) -> str:
    artwork_id = (row.get("artwork_id") or "").strip()
    source_abs = Path((row.get("preferred_upload_path_abs") or "").strip()) if (row.get("preferred_upload_path_abs") or "").strip() else None
    public_abs = Path((row.get("public_full_path_abs") or "").strip()) if (row.get("public_full_path_abs") or "").strip() else None

    source_candidate = None
    for candidate in [source_abs, public_abs]:
        if candidate and candidate.exists():
            source_candidate = candidate
            break
    if source_candidate is None:
        raise RuntimeError(f"No local source file found for {artwork_id}")

    ext = file_extension(source_candidate)
    if ext in {"jpg", "jpeg", "png", "pdf"}:
        out_ext = "jpg" if ext == "jpeg" else ext
        target = ASSET_DIR / f"{artwork_id}.{out_ext}"
        if not target.exists():
            ensure_asset_dir()
            shutil.copy2(source_candidate, target)
    else:
        target = ASSET_DIR / f"{artwork_id}.jpg"
        if not target.exists():
            ensure_asset_dir()
            convert_image_to_jpg(source_candidate, target)

    return f"{config.asset_route_prefix}/{target.name}"


def list_existing_products(config: Config) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    offset = 0
    limit = 100
    while True:
        query = parse.urlencode({"limit": limit, "offset": offset, "orderBy": "createdAt", "order": "asc"})
        url = f"{config.api_base_url}/stores/{config.store_id}/products?{query}"
        data = request_json("GET", url, config.api_key)
        batch = data.get("products") or []
        if not isinstance(batch, list):
            break
        products.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return products


def existing_product_keys(products: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for product in products:
        tags = product.get("tags") or []
        artwork_id = ""
        product_profile = ""
        for tag in tags:
            if not isinstance(tag, str):
                continue
            if tag.startswith("product_key:"):
                out.add(tag.split(":", 1)[1])
            elif tag.startswith("artwork_id:"):
                artwork_id = tag.split(":", 1)[1]
            elif tag.startswith("product_profile:"):
                product_profile = tag.split(":", 1)[1]
        if artwork_id and product_profile:
            out.add(f"{artwork_id}:{product_profile}")
        elif artwork_id:
            out.add(f"{artwork_id}:poster")
    return out


def get_template(template_id: str, config: Config, cache: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if template_id not in cache:
        cache[template_id] = request_json("GET", f"{config.api_base_url}/templates/{template_id}", config.api_key)
    return cache[template_id]


def collect_placeholder_names(template: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for variant in template.get("variants") or []:
        for placeholder in variant.get("imagePlaceholders") or []:
            name = placeholder.get("name")
            if isinstance(name, str) and name not in names:
                names.append(name)
    return names


def parse_number(value: str) -> float | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return None


def artwork_ratio(row: dict[str, str]) -> float:
    width = parse_number(row.get("width_cm") or "")
    height = parse_number(row.get("height_cm") or "")
    if not width or not height:
        raise RuntimeError(f"Missing width/height for artwork {row.get('artwork_id')}")
    return width / height


def ratio_orientation(ratio: float) -> str:
    if abs(ratio - 1.0) <= SQUARE_EPSILON:
        return "square"
    return "landscape" if ratio > 1.0 else "portrait"


def placeholder_ratio(placeholder: dict[str, Any]) -> float | None:
    width = placeholder.get("width")
    height = placeholder.get("height")
    if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
        return None
    if height == 0:
        return None
    return float(width) / float(height)


def primary_placeholder(variant: dict[str, Any]) -> dict[str, Any] | None:
    placeholders = variant.get("imagePlaceholders") or []
    best: dict[str, Any] | None = None
    best_area = -1.0
    for placeholder in placeholders:
        width = placeholder.get("width")
        height = placeholder.get("height")
        if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
            continue
        area = float(width) * float(height)
        if area > best_area:
            best = placeholder
            best_area = area
    return best


def ratio_distance(a: float, b: float) -> float:
    return abs(math.log(a / b))


def variant_sort_key(variant: dict[str, Any]) -> tuple[float, str]:
    placeholder = primary_placeholder(variant) or {}
    width = float(placeholder.get("width") or 0.0)
    height = float(placeholder.get("height") or 0.0)
    area = width * height
    title = str(variant.get("title") or "")
    return (area, title.casefold())


def crop_per_side_for_cover(art_ratio: float, variant_ratio: float) -> float:
    if art_ratio <= 0 or variant_ratio <= 0:
        return 1.0
    if abs(art_ratio - variant_ratio) <= 1e-9:
        return 0.0
    if variant_ratio > art_ratio:
        visible_fraction = art_ratio / variant_ratio
    else:
        visible_fraction = variant_ratio / art_ratio
    total_crop = max(0.0, 1.0 - visible_fraction)
    return total_crop / 2.0


def collect_variant_debug_rows(row: dict[str, str], template: dict[str, Any]) -> list[VariantDebugRow]:
    target_ratio = artwork_ratio(row)
    target_orientation = ratio_orientation(target_ratio)
    metrics: list[VariantDebugRow] = []

    for variant in template.get("variants") or []:
        placeholder = primary_placeholder(variant)
        if not placeholder:
            continue
        variant_ratio = placeholder_ratio(placeholder)
        variant_orientation = ratio_orientation(variant_ratio) if variant_ratio is not None else "unknown"
        orientation_match = False
        crop_per_side = 1.0
        distance = 999.0
        if variant_ratio is not None:
            orientation_match = (
                target_orientation == variant_orientation
                or (target_orientation == "square" and abs(variant_ratio - 1.0) <= 0.08)
            )
            crop_per_side = crop_per_side_for_cover(target_ratio, variant_ratio)
            distance = ratio_distance(target_ratio, variant_ratio)
        metrics.append(
            VariantDebugRow(
                variant_id=str(variant.get("id") or ""),
                variant_title=str(variant.get("title") or ""),
                placeholder_name=str(placeholder.get("name") or ""),
                placeholder_width=float(placeholder.get("width") or 0.0),
                placeholder_height=float(placeholder.get("height") or 0.0),
                variant_ratio=variant_ratio,
                variant_orientation=variant_orientation,
                crop_per_side=crop_per_side,
                ratio_distance=distance,
                orientation_match=orientation_match,
            )
        )
    return metrics


def select_matching_variants(
    row: dict[str, str],
    template: dict[str, Any],
    max_crop_per_side: float,
) -> tuple[list[dict[str, Any]], list[VariantDebugRow]]:
    metrics = collect_variant_debug_rows(row, template)
    variants_by_id = {
        str(variant.get("id") or ""): variant
        for variant in (template.get("variants") or [])
        if variant.get("id")
    }
    candidates: list[tuple[float, float, VariantDebugRow]] = []

    for metric in metrics:
        if not metric.variant_id or metric.variant_ratio is None or not metric.orientation_match:
            continue
        if metric.crop_per_side <= max_crop_per_side:
            candidates.append((metric.crop_per_side, metric.ratio_distance, metric))

    if candidates:
        selected_metrics = [
            metric
            for _, _, metric in sorted(
                candidates,
                key=lambda item: (
                    item[0],
                    item[1],
                    variant_sort_key(variants_by_id.get(item[2].variant_id, {})),
                ),
            )
        ]
        selected_ids = {metric.variant_id for metric in selected_metrics}
        for metric in metrics:
            metric.selected = metric.variant_id in selected_ids
        return [variants_by_id[metric.variant_id] for metric in selected_metrics if metric.variant_id in variants_by_id], metrics

    for metric in metrics:
        metric.selected = False
    return [], metrics


def select_variants_for_profile(
    row: dict[str, str],
    template: dict[str, Any],
    template_run: TemplateRun,
    max_crop_per_side: float,
) -> tuple[list[dict[str, Any]], list[VariantDebugRow]]:
    if template_run.variant_mode == "all":
        variants = [variant for variant in (template.get("variants") or []) if variant.get("id") and (variant.get("imagePlaceholders") or [])]
        if variants:
            metrics = collect_variant_debug_rows(row, template)
            selected_ids = {str(variant.get("id") or "") for variant in variants}
            for metric in metrics:
                metric.selected = metric.variant_id in selected_ids
            return sorted(variants, key=variant_sort_key), metrics
    return select_matching_variants(row, template, max_crop_per_side)


def build_product_title(row: dict[str, str], template_run: TemplateRun) -> str:
    artist_id = (row.get("artist_id") or "").strip()
    artist_name = {
        "felix": "Felix Ipfling",
        "luca": "Luca Schweiger",
    }.get(artist_id, artist_id.replace("-", " ").title())
    title = (row.get("title") or "").strip()
    return f"{artist_name} — {title} {template_run.title_suffix}"


def build_description(row: dict[str, str], template_run: TemplateRun) -> str:
    parts = []
    title = (row.get("title") or "").strip()
    artist_id = (row.get("artist_id") or "").strip()
    year = (row.get("year") or "").strip()
    medium = (row.get("medium") or "").strip()
    width = (row.get("width_cm") or "").strip()
    height = (row.get("height_cm") or "").strip()
    status = (row.get("status_original") or "").strip()
    parts.append(f"{template_run.description_label} based on the artwork '{title}' by {artist_id}.")
    if year:
        parts.append(f"Year: {year}.")
    if medium:
        parts.append(f"Medium: {medium}.")
    if width and height:
        parts.append(f"Original format: {width} x {height} cm.")
    if status == "available":
        parts.append("Original artwork currently marked as available.")
    elif status == "not_available":
        parts.append("Original artwork currently marked as not available; this product is a print edition.")
    return " ".join(parts)


def build_tags(row: dict[str, str], template_run: TemplateRun) -> list[str]:
    artwork_id = (row.get("artwork_id") or "").strip()
    tags = [
        f"artist:{(row.get('artist_id') or '').strip()}",
        f"artwork_id:{artwork_id}",
        f"product_profile:{template_run.key}",
        f"product_key:{artwork_id}:{template_run.key}",
        f"category:{(row.get('category') or '').strip()}",
        f"orientation:{(row.get('orientation') or '').strip()}",
    ]
    year = (row.get("year") or "").strip()
    if year:
        tags.append(f"year:{year}")
    return [tag for tag in tags if tag and not tag.endswith(":")]


def preview_template_for_row(template_id: str, row: dict[str, str]) -> dict[str, Any]:
    width = parse_number(row.get("width_cm") or "") or 100.0
    height = parse_number(row.get("height_cm") or "") or 100.0
    return {
        "id": template_id,
        "productType": "Preview",
        "vendor": "Gelato",
        "variants": [
            {
                "id": "template-variant-preview",
                "title": "Preview",
                "imagePlaceholders": [
                    {
                        "name": "ImageFront",
                        "width": width,
                        "height": height,
                    }
                ],
            }
        ],
    }


def build_payload(
    row: dict[str, str],
    config: Config,
    template: dict[str, Any],
    template_run: TemplateRun,
    max_crop_per_side: float,
) -> tuple[dict[str, Any], list[VariantDebugRow]]:
    template_id = str(template.get("id") or "")
    if not template_id:
        raise RuntimeError(f"Template response missing id for artwork {row.get('artwork_id')}")
    asset_route = (row.get("gelato_asset_route") or "").strip()
    if not asset_route:
        raise RuntimeError(f"Row {row.get('artwork_id')} is missing gelato_asset_route")
    file_url = f"{config.public_file_base_url}{asset_route}"
    selected_variants, variant_metrics = select_variants_for_profile(row, template, template_run, max_crop_per_side)
    if not selected_variants:
        raise RuntimeError(f"Template {template_id} has no matching variants for artwork {row.get('artwork_id')}")

    variants_payload: list[dict[str, Any]] = []
    for variant in selected_variants:
        variant_id = variant.get("id")
        if not variant_id:
            continue
        placeholders = variant.get("imagePlaceholders") or []
        variants_payload.append(
            {
                "templateVariantId": variant_id,
                "imagePlaceholders": [
                    {
                        "name": str(placeholder.get("name") or ""),
                        "fileUrl": file_url,
                        "fitMethod": template_run.fit_method,
                    }
                    for placeholder in placeholders
                    if placeholder.get("name")
                ],
            }
        )
    if not variants_payload:
        raise RuntimeError(f"No payload variants remained for artwork {row.get('artwork_id')}")

    return (
        {
            "title": build_product_title(row, template_run),
            "description": build_description(row, template_run),
            "templateId": template_id,
            "isVisibleInTheOnlineStore": True,
            "currency": config.default_currency,
            "salesChannels": [config.default_sales_channel],
            "tags": build_tags(row, template_run),
            "productType": str(template.get("productType") or "").strip(),
            "vendor": str(template.get("vendor") or "").strip(),
            "variants": variants_payload,
        },
        variant_metrics,
    )


def ensure_log(path: Path) -> None:
    if path.exists():
        return
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "timestamp",
                "mode",
                "status",
                "artwork_id",
                "artist_id",
                "title",
                "template_id",
                "file_url",
                "gelato_product_id",
                "notes",
            ],
        )
        writer.writeheader()


def append_log(path: Path, row: dict[str, str]) -> None:
    ensure_log(path)
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "timestamp",
                "mode",
                "status",
                "artwork_id",
                "artist_id",
                "title",
                "template_id",
                "file_url",
                "gelato_product_id",
                "notes",
            ],
        )
        writer.writerow(row)


def ensure_variant_debug_log(path: Path) -> None:
    if path.exists():
        return
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "artwork_id",
                "artist_id",
                "title",
                "product_profile",
                "template_id",
                "variant_id",
                "variant_title",
                "placeholder_name",
                "placeholder_width",
                "placeholder_height",
                "variant_ratio",
                "variant_orientation",
                "crop_per_side",
                "ratio_distance",
                "orientation_match",
                "selected",
            ],
        )
        writer.writeheader()


def append_variant_debug_rows(
    path: Path,
    row: dict[str, str],
    template_run: TemplateRun,
    metrics: list[VariantDebugRow],
) -> None:
    ensure_variant_debug_log(path)
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "artwork_id",
                "artist_id",
                "title",
                "product_profile",
                "template_id",
                "variant_id",
                "variant_title",
                "placeholder_name",
                "placeholder_width",
                "placeholder_height",
                "variant_ratio",
                "variant_orientation",
                "crop_per_side",
                "ratio_distance",
                "orientation_match",
                "selected",
            ],
        )
        for metric in metrics:
            writer.writerow(
                {
                    "artwork_id": (row.get("artwork_id") or "").strip(),
                    "artist_id": (row.get("artist_id") or "").strip(),
                    "title": (row.get("title") or "").strip(),
                    "product_profile": template_run.key,
                    "template_id": template_run.template_id,
                    "variant_id": metric.variant_id,
                    "variant_title": metric.variant_title,
                    "placeholder_name": metric.placeholder_name,
                    "placeholder_width": f"{metric.placeholder_width:.4f}",
                    "placeholder_height": f"{metric.placeholder_height:.4f}",
                    "variant_ratio": "" if metric.variant_ratio is None else f"{metric.variant_ratio:.6f}",
                    "variant_orientation": metric.variant_orientation,
                    "crop_per_side": f"{metric.crop_per_side:.6f}",
                    "ratio_distance": f"{metric.ratio_distance:.6f}",
                    "orientation_match": "yes" if metric.orientation_match else "no",
                    "selected": "yes" if metric.selected else "no",
                }
            )


def print_variant_debug(row: dict[str, str], template_run: TemplateRun, metrics: list[VariantDebugRow]) -> None:
    selected_metrics = [metric for metric in metrics if metric.selected]
    print(
        f"VARIANT DEBUG: {(row.get('artist_id') or '').strip()} / {(row.get('title') or '').strip()} / {template_run.key} "
        f"selected={len(selected_metrics)} total={len(metrics)}"
    )
    for metric in selected_metrics[:12]:
        ratio_text = "n/a" if metric.variant_ratio is None else f"{metric.variant_ratio:.3f}"
        print(
            "   "
            f"{metric.variant_title or metric.variant_id} | placeholder={metric.placeholder_width:.0f}x{metric.placeholder_height:.0f} "
            f"| ratio={ratio_text} | crop/side={metric.crop_per_side * 100:.2f}% | orientation={metric.variant_orientation}"
        )
    if len(selected_metrics) > 12:
        print(f"   ... {len(selected_metrics) - 12} more selected variants")


def main() -> None:
    args = parse_args()
    config = load_config(args)
    csv_path = Path(args.csv)
    log_path = Path(args.log)
    template_runs = build_template_runs(args, config)

    rows = load_jobs(csv_path)
    if args.artist:
        rows = [row for row in rows if (row.get("artist_id") or "").strip() == args.artist]
    if args.sample_diverse:
        rows = select_diverse_rows(rows, args.sample_diverse)
    if args.limit is not None:
        rows = rows[: args.limit]

    if not args.skip_asset_prepare:
        for row in rows:
            row["gelato_asset_route"] = prepare_public_asset(row, config)

    existing_ids: set[str] = set()
    if args.apply and not args.force:
        try:
            products = list_existing_products(config)
            existing_ids = existing_product_keys(products)
        except Exception as exc:
            print(
                "WARNING: Could not list existing Gelato products. "
                "Continuing without duplicate check.",
                file=sys.stderr,
            )
            print(f"DETAIL: {exc}", file=sys.stderr)
            existing_ids = set()

    template_cache: dict[str, dict[str, Any]] = {}
    mode = "apply" if args.apply else "dry_run"

    print(f"Mode: {mode}")
    print(f"Rows selected: {len(rows)}")
    print("Template runs:", ", ".join(f"{template_run.key}={template_run.template_id}" for template_run in template_runs))
    for row in rows:
        width = (row.get("width_cm") or "").strip()
        height = (row.get("height_cm") or "").strip()
        print(f" - sample: {(row.get('artist_id') or '').strip()} / {(row.get('title') or '').strip()} / {width}x{height} cm")
    if args.apply and not args.force:
        print(f"Existing Gelato artwork_ids detected: {len(existing_ids)}")

    created = 0
    skipped = 0
    failed = 0

    for row in rows:
        artwork_id = (row.get("artwork_id") or "").strip()
        artist_id = (row.get("artist_id") or "").strip()
        title = (row.get("title") or "").strip()
        for template_run in template_runs:
            product_key = f"{artwork_id}:{template_run.key}"
            try:
                if product_key in existing_ids and not args.force:
                    skipped += 1
                    append_log(
                        log_path,
                        {
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "mode": mode,
                            "status": "skipped_existing",
                            "artwork_id": artwork_id,
                            "artist_id": artist_id,
                            "title": title,
                            "template_id": template_run.template_id,
                            "file_url": build_file_url_from_public_route(row, config),
                            "gelato_product_id": "",
                            "notes": f"product_key already exists in Gelato: {product_key}",
                        },
                    )
                    print(f"SKIP existing: {artist_id} / {title} / {template_run.key}")
                    continue

                template = (
                    get_template(template_run.template_id, config, template_cache)
                    if args.apply or args.live_template_preview
                    else preview_template_for_row(template_run.template_id, row)
                )
                payload, variant_metrics = build_payload(row, config, template, template_run, args.max_crop_per_side)
                file_url = f"{config.public_file_base_url}{row.get('gelato_asset_route', '')}"
                if args.debug_variants:
                    print_variant_debug(row, template_run, variant_metrics)
                if args.debug_variants_csv:
                    append_variant_debug_rows(Path(args.debug_variants_csv), row, template_run, variant_metrics)

                if args.apply:
                    response = request_json("POST", f"{config.api_base_url}/stores/{config.store_id}/products:create-from-template", config.api_key, payload)
                    gelato_product_id = str(response.get("id") or response.get("productId") or "")
                    created += 1
                    append_log(
                        log_path,
                        {
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "mode": mode,
                            "status": "created",
                            "artwork_id": artwork_id,
                            "artist_id": artist_id,
                            "title": title,
                            "template_id": template_run.template_id,
                            "file_url": file_url,
                            "gelato_product_id": gelato_product_id,
                            "notes": f"profile={template_run.key}",
                        },
                    )
                    print(f"CREATED: {artist_id} / {title} / {template_run.key} -> {gelato_product_id}")
                else:
                    created += 1
                    append_log(
                        log_path,
                        {
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "mode": mode,
                            "status": "dry_run_ok",
                            "artwork_id": artwork_id,
                            "artist_id": artist_id,
                            "title": title,
                            "template_id": template_run.template_id,
                            "file_url": file_url,
                            "gelato_product_id": "",
                            "notes": f"profile={template_run.key} | {payload['title']} | variants={len(payload['variants'])}",
                        },
                    )
                    print(f"DRY RUN: {artist_id} / {title} / {template_run.key} -> template {template_run.template_id} / variants={len(payload['variants'])}")
            except Exception as exc:
                failed += 1
                append_log(
                    log_path,
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "mode": mode,
                        "status": "failed",
                        "artwork_id": artwork_id,
                        "artist_id": artist_id,
                        "title": title,
                        "template_id": template_run.template_id,
                        "file_url": "",
                        "gelato_product_id": "",
                        "notes": f"profile={template_run.key} | {exc}",
                    },
                )
                print(f"FAILED: {artist_id} / {title} / {template_run.key} -> {exc}", file=sys.stderr)

    print(f"Done. ok={created} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
