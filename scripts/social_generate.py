#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path


DEFAULT_HASHTAGS = [
    "#kunst",
    "#contemporaryart",
    "#gallery",
    "#painting",
    "#artstudio",
    "#digitalmuseum",
]


def normalize_status(status: str) -> str:
    s = status.strip().lower()
    if s in {"sold", "verkauft"}:
        return "sold"
    if s in {"not_for_sale", "nfs"}:
        return "not_for_sale"
    return "available"


def build_caption(row: dict[str, str], account: str) -> str:
    title = row.get("title") or "Neues Werk"
    year = row.get("year") or ""
    medium = row.get("medium") or ""
    dims = ""
    if row.get("width_cm") and row.get("height_cm"):
        dims = f"{row['width_cm']}x{row['height_cm']} cm"
    detail = " · ".join([x for x in [year, medium, dims] if x])
    if account == "museum":
        return f"Museum-Highlight: {title}. {detail}".strip()
    return f"{title} — {detail}".strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate social drafts from artworks CSV.")
    parser.add_argument("--catalog", default="data/catalog/artworks.csv", help="Input catalog CSV")
    parser.add_argument("--out", default="data/social/drafts.csv", help="Output drafts CSV")
    parser.add_argument("--weeks", type=int, default=4, help="Number of weeks to plan")
    parser.add_argument("--posts-per-week", type=int, default=3, help="Posts per week")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for selection")
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
        rows = [r for r in reader if r.get("id")]

    available = [r for r in rows if normalize_status(r.get("status", "")) != "sold"]
    if not available:
        print("No available artworks found.")
        return 1

    random.seed(args.seed)
    random.shuffle(available)

    total_posts = args.weeks * args.posts_per_week
    selection = available[: total_posts]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    headers = ["post_id", "platform", "type", "asset_path", "caption", "hashtags", "cta", "scheduled_week", "account", "status"]

    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        idx = 0
        for week in range(1, args.weeks + 1):
            for _ in range(args.posts_per_week):
                row = selection[idx % len(selection)]
                idx += 1
                for platform in ("instagram", "tiktok"):
                    for account in ("art", "museum"):
                        post_id = f"{account}-{row['id']}-w{week}-{platform}"
                        caption = build_caption(row, account)
                        writer.writerow(
                            {
                                "post_id": post_id,
                                "platform": platform,
                                "type": "image",
                                "asset_path": row.get("images_source", ""),
                                "caption": caption,
                                "hashtags": " ".join(DEFAULT_HASHTAGS),
                                "cta": "Link in Bio",
                                "scheduled_week": str(week),
                                "account": account,
                                "status": "draft",
                            }
                        )

    print("Wrote:", out_path.relative_to(project_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
