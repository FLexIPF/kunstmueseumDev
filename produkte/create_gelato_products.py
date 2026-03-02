from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request


REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL_PATH = REPO_ROOT / ".env.local"
CSV_PATH = REPO_ROOT / "produkte/gelato_jobs.csv"
LOG_PATH = REPO_ROOT / "produkte/gelato_created_products.csv"
ASSET_DIR = REPO_ROOT / "public/gelato-assets"
API_BASE_URL = "https://ecommerce.gelatoapis.com/v1"


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create Gelato products from produkte/gelato_jobs.csv")
    parser.add_argument("--csv", default=str(CSV_PATH), help="Path to gelato_jobs.csv")
    parser.add_argument("--log", default=str(LOG_PATH), help="Path to CSV log output")
    parser.add_argument("--artist", help="Only process one artist_id")
    parser.add_argument("--limit", type=int, help="Process only the first N rows after filtering")
    parser.add_argument("--apply", action="store_true", help="Actually create products via Gelato API")
    parser.add_argument("--force", action="store_true", help="Create even if artwork_id already exists in Gelato tags")
    parser.add_argument("--fit-method", default="meet", choices=["meet", "fill"], help="How Gelato should fit the artwork into the template placeholder")
    parser.add_argument("--skip-asset-prepare", action="store_true", help="Do not create/copy public gelato-assets files before building requests")
    parser.add_argument("--template-id", help="Override GELATO_TEMPLATE_ID for this run")
    parser.add_argument("--public-file-base-url", help="Override GELATO_PUBLIC_FILE_BASE_URL for this run, e.g. https://your-domain.com")
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
    missing = [
        name
        for name, value in [
            ("GELATO_API_KEY", api_key),
            ("GELATO_STORE_ID", store_id),
            ("GELATO_PUBLIC_FILE_BASE_URL", public_file_base_url),
            ("GELATO_TEMPLATE_ID", template_id),
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
        "Accept": "application/json",
        "X-API-KEY": api_key,
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
        raise RuntimeError(f"{method} {url} failed: {exc.code} {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"{method} {url} failed: {exc}") from exc


def load_jobs(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows = [row for row in rows if (row.get("artwork_id") or "").strip()]
    rows.sort(key=lambda row: ((row.get("artist_id") or "").strip(), (row.get("year") or "").strip(), (row.get("title") or "").strip().casefold()))
    return rows


def choose_template_id(row: dict[str, str], config: Config) -> str:
    _ = row
    if config.template_id:
        return config.template_id
    raise RuntimeError("No Gelato template configured")


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


def existing_artwork_ids(products: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for product in products:
        tags = product.get("tags") or []
        for tag in tags:
            if isinstance(tag, str) and tag.startswith("artwork_id:"):
                out.add(tag.split(":", 1)[1])
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


def build_product_title(row: dict[str, str]) -> str:
    artist_id = (row.get("artist_id") or "").strip()
    artist_name = {
        "felix": "Felix Ipfling",
        "luca": "Luca Schweiger",
    }.get(artist_id, artist_id.replace("-", " ").title())
    title = (row.get("title") or "").strip()
    year = (row.get("year") or "").strip()
    if year:
        return f"{artist_name} — {title} ({year})"
    return f"{artist_name} — {title}"


def build_description(row: dict[str, str]) -> str:
    parts = []
    title = (row.get("title") or "").strip()
    artist_id = (row.get("artist_id") or "").strip()
    year = (row.get("year") or "").strip()
    medium = (row.get("medium") or "").strip()
    width = (row.get("width_cm") or "").strip()
    height = (row.get("height_cm") or "").strip()
    status = (row.get("status_original") or "").strip()
    parts.append(f"Print based on the artwork '{title}' by {artist_id}.")
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


def build_tags(row: dict[str, str]) -> list[str]:
    tags = [
        f"artist:{(row.get('artist_id') or '').strip()}",
        f"artwork_id:{(row.get('artwork_id') or '').strip()}",
        f"category:{(row.get('category') or '').strip()}",
        f"orientation:{(row.get('orientation') or '').strip()}",
    ]
    year = (row.get("year") or "").strip()
    if year:
        tags.append(f"year:{year}")
    return [tag for tag in tags if tag and not tag.endswith(":")]


def build_payload(row: dict[str, str], config: Config, template: dict[str, Any], fit_method: str) -> dict[str, Any]:
    template_id = str(template.get("id") or "")
    if not template_id:
        raise RuntimeError(f"Template response missing id for artwork {row.get('artwork_id')}")
    asset_route = (row.get("gelato_asset_route") or "").strip()
    if not asset_route:
        raise RuntimeError(f"Row {row.get('artwork_id')} is missing gelato_asset_route")
    file_url = f"{config.public_file_base_url}{asset_route}"
    placeholder_names = collect_placeholder_names(template)
    if not placeholder_names:
        raise RuntimeError(f"Template {template_id} has no image placeholders")

    variants_payload: list[dict[str, Any]] = []
    for variant in template.get("variants") or []:
        variant_id = variant.get("id")
        if not variant_id:
            continue
        variants_payload.append(
            {
                "templateVariantId": variant_id,
                "imagePlaceholders": [
                    {
                        "name": placeholder_name,
                        "fileUrl": file_url,
                        "fitMethod": fit_method,
                    }
                    for placeholder_name in placeholder_names
                ],
            }
        )

    return {
        "title": build_product_title(row),
        "description": build_description(row),
        "templateId": template_id,
        "isVisibleInTheOnlineStore": True,
        "currency": config.default_currency,
        "salesChannels": [config.default_sales_channel],
        "tags": build_tags(row),
        "productType": str(template.get("productType") or "").strip(),
        "vendor": str(template.get("vendor") or "").strip(),
        "variants": variants_payload,
    }


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


def main() -> None:
    args = parse_args()
    config = load_config(args)
    csv_path = Path(args.csv)
    log_path = Path(args.log)

    rows = load_jobs(csv_path)
    if args.artist:
        rows = [row for row in rows if (row.get("artist_id") or "").strip() == args.artist]
    if args.limit is not None:
        rows = rows[: args.limit]

    if not args.skip_asset_prepare:
        for row in rows:
            row["gelato_asset_route"] = prepare_public_asset(row, config)

    existing_ids: set[str] = set()
    if args.apply and not args.force:
        products = list_existing_products(config)
        existing_ids = existing_artwork_ids(products)

    template_cache: dict[str, dict[str, Any]] = {}
    mode = "apply" if args.apply else "dry_run"

    print(f"Mode: {mode}")
    print(f"Rows selected: {len(rows)}")
    if args.apply and not args.force:
        print(f"Existing Gelato artwork_ids detected: {len(existing_ids)}")

    created = 0
    skipped = 0
    failed = 0

    for row in rows:
        artwork_id = (row.get("artwork_id") or "").strip()
        artist_id = (row.get("artist_id") or "").strip()
        title = (row.get("title") or "").strip()
        try:
            if artwork_id in existing_ids and not args.force:
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
                        "template_id": "",
                        "file_url": build_file_url_from_public_route(row, config),
                        "gelato_product_id": "",
                        "notes": "artwork_id tag already exists in Gelato",
                    },
                )
                print(f"SKIP existing: {artist_id} / {title}")
                continue

            template_id = choose_template_id(row, config)
            template = get_template(template_id, config, template_cache) if args.apply else {"id": template_id, "variants": [{"id": "template-variant-preview", "imagePlaceholders": [{"name": "default"}]}]}
            payload = build_payload(row, config, template, args.fit_method)
            file_url = f"{config.public_file_base_url}{row.get('gelato_asset_route', '')}"

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
                        "template_id": template_id,
                        "file_url": file_url,
                        "gelato_product_id": gelato_product_id,
                        "notes": "",
                    },
                )
                print(f"CREATED: {artist_id} / {title} -> {gelato_product_id}")
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
                        "template_id": template_id,
                        "file_url": file_url,
                        "gelato_product_id": "",
                        "notes": payload["title"],
                    },
                )
                print(f"DRY RUN: {artist_id} / {title} -> template {template_id}")
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
                    "template_id": "",
                    "file_url": "",
                    "gelato_product_id": "",
                    "notes": str(exc),
                },
            )
            print(f"FAILED: {artist_id} / {title} -> {exc}", file=sys.stderr)

    print(f"Done. ok={created} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
