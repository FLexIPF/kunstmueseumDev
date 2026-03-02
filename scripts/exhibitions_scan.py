#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[_\s]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-")


def parse_dir_name(name: str) -> tuple[str, str, str, str]:
    parts = name.split("_")
    year_part = parts[0] if parts else ""
    event_parts = parts[1:-1] if len(parts) > 2 else parts[1:] if len(parts) > 1 else []
    city_part = parts[-1] if len(parts) > 2 else ""

    year = ""
    start_date = ""
    end_date = ""
    m = re.match(r"(?P<y1>\d{4})(?:-(?P<y2>\d{4}))?", year_part)
    if m:
        year = m.group("y1") or ""
        start_date = year
        end_date = m.group("y2") or year

    title = " ".join(event_parts).strip() or name
    location = city_part.replace("-", " ").strip()

    return title, location, start_date, end_date


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan exhibitions folders into a CSV.")
    parser.add_argument("--root", default="data/exhibitions", help="Exhibitions root dir")
    parser.add_argument("--out", default="data/catalog/exhibitions.csv", help="Output CSV")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing CSV")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    root = (project_root / args.root).resolve()
    out_path = (project_root / args.out).resolve()

    if out_path.exists() and not args.overwrite:
        print(f"Output exists: {out_path}. Use --overwrite to replace.")
        return 1

    rows: list[dict[str, str]] = []
    if root.exists():
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            title, location, start_date, end_date = parse_dir_name(child.name)
            notes = ""
            for fname in ("overview.txt", "overview.md"):
                note_path = child / fname
                if note_path.exists():
                    notes = note_path.read_text(encoding="utf-8").strip()
                    break
            rows.append(
                {
                    "exhibition_id": slugify(child.name),
                    "title": title,
                    "location": location,
                    "start_date": start_date,
                    "end_date": end_date,
                    "notes": notes,
                    "asset_dir": child.relative_to(project_root).as_posix(),
                }
            )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    headers = ["exhibition_id", "title", "location", "start_date", "end_date", "notes", "asset_dir"]
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"Scanned {len(rows)} exhibitions.")
    print("Wrote:", out_path.relative_to(project_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
