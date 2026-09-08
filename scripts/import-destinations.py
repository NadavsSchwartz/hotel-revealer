#!/usr/bin/env python3
"""Build the server-only GeoNames catalog using only the Python standard library."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://download.geonames.org/export/dump/"
SOURCE_FILES = ("cities5000.zip", "countryInfo.txt", "admin1CodesASCII.txt", "readme.txt")
# Search conveniences, not additional geographic records or provider IDs.
COUNTRY_ALIASES = {
    "IL": ["ישראל", "מדינת ישראל"],
    "US": ["United States of America", "USA", "America", "ארצות הברית", "ארהב"],
    "GB": ["UK", "Great Britain", "Britain", "בריטניה", "הממלכה המאוחדת"],
    "CZ": ["Czechia"],
    "KR": ["Republic of Korea"],
    "AE": ["UAE"],
}
LEGACY_ALIASES = {
    "San Buenaventura (Ventura), California": "Ventura",
    "Weymouth Town, Massachusetts": "Weymouth",
    "St. Peters, Missouri": "Saint Peters",
}


def normalize(value):
    value = "".join(c for c in unicodedata.normalize("NFKD", value.lower())
                    if not unicodedata.category(c).startswith("M"))
    value = re.sub(r"['’‘ʼ`.]", "", value)
    value = "".join(c if c.isalnum() else " " for c in value)
    return " ".join(value.split())


def json_write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def download(directory):
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {"retrievedAt": datetime.now(timezone.utc).isoformat(), "sources": []}
    for name in SOURCE_FILES:
        url = SOURCE_URL + name
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(30 * 1024 * 1024 + 1)
            if len(data) > 30 * 1024 * 1024:
                raise ValueError(f"Unexpected source size: {name}")
            modified = response.headers.get("Last-Modified")
        (directory / name).write_bytes(data)
        manifest["sources"].append({"file": name, "url": url, "bytes": len(data),
                                    "sha256": hashlib.sha256(data).hexdigest(),
                                    "lastModified": modified})
        print(f"Downloaded {name}: {len(data):,} bytes", flush=True)
    json_write(directory / "download-manifest.json", manifest)


def import_catalog(directory):
    manifest = json.loads((directory / "download-manifest.json").read_text())
    for source in manifest["sources"]:
        if source["file"] not in SOURCE_FILES:
            raise ValueError("Unexpected source in download manifest")
        actual = hashlib.sha256((directory / source["file"]).read_bytes()).hexdigest()
        if actual != source["sha256"]:
            raise ValueError(f"Source checksum mismatch: {source['file']}")
    if {source["file"] for source in manifest["sources"]} != set(SOURCE_FILES):
        raise ValueError("Incomplete download manifest")

    countries = {}
    for line in (directory / "countryInfo.txt").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        fields = line.split("\t")
        code, name = fields[0], fields[4]
        aliases = sorted({normalize(x) for x in [code, fields[1], name,
                                                  *COUNTRY_ALIASES.get(code, [])] if x})
        countries[code] = [name, aliases]
    regions = {}
    for line in (directory / "admin1CodesASCII.txt").read_text().splitlines():
        code, name, *_ = line.split("\t")
        regions[code] = name

    rows = []
    excluded = 0
    with zipfile.ZipFile(directory / "cities5000.zip") as archive:
        lines = archive.read("cities5000.txt").decode("utf-8").splitlines()
    for line in lines:
        fields = line.split("\t")
        if len(fields) != 19:
            raise ValueError("Unexpected GeoNames column count")
        # GeoNames includes historical, abandoned, and destroyed places in the dump.
        if fields[7] in {"PPLH", "PPLQ", "PPLW", "PPLCH"}:
            excluded += 1
            continue
        if fields[8] not in countries:
            raise ValueError(f"Unknown country: {fields[8]}")
        aliases = sorted({normalize(x) for x in [fields[1], fields[2], *fields[3].split(",")]
                          if normalize(x)})
        rows.append([int(fields[0]), fields[1], fields[8], fields[10],
                     float(fields[4]), float(fields[5]), fields[17], int(fields[14]), aliases])
    rows.sort(key=lambda row: (-row[7], normalize(row[1]), row[0]))
    if len(rows) < 50000 or len({row[2] for row in rows}) < 200:
        raise ValueError("Unexpectedly small global source; refusing to replace the catalog")
    if len({row[0] for row in rows}) != len(rows):
        raise ValueError("Duplicate GeoNames IDs")

    # Freeze the original US city+state URLs to exact IDs without shipping this list to browsers.
    original = (ROOT / "shared/cities.js").read_text()
    legacy_names = re.findall(r'^\s+"([^"]+)",?$', original, re.MULTILINE)
    legacy = {}
    legacy_public = []
    unresolved = []
    name_counts = Counter((row[2], normalize(row[1])) for row in rows)
    us_by_state = {}
    for row in rows:
        if row[2] == "US":
            state_key = normalize(regions.get(f"US.{row[3]}", ""))
            us_by_state.setdefault(state_key, []).append(row)
    for label in legacy_names:
        city, state = label.rsplit(", ", 1)
        city = LEGACY_ALIASES.get(label, city)
        city_key, state_key = normalize(city), normalize(state)
        candidates = [row for row in us_by_state.get(state_key, []) if city_key in row[8]]
        candidates.sort(key=lambda row: (normalize(row[1]) != city_key, -row[7], row[0]))
        if not candidates:
            unresolved.append(label)
        else:
            row = candidates[0]
            legacy[normalize(label)] = row[0]
            region = regions.get(f"{row[2]}.{row[3]}", "")
            parts = [row[1]]
            if name_counts[(row[2], normalize(row[1]))] > 1 and region:
                parts.append(region)
            parts.append(countries[row[2]][0])
            legacy_public.append([label, f"geonames:{row[0]}", ", ".join(parts)])
    if unresolved:
        raise ValueError(f"Legacy destinations need source-backed mapping: {unresolved}")

    output = ROOT / "data"
    output.mkdir(exist_ok=True)
    # One tuple per line keeps source updates reviewable while avoiding repeated object keys.
    with (output / "destinations.json").open("w") as file:
        file.write('{"version":1,"countries":')
        file.write(json.dumps(countries, ensure_ascii=False, separators=(",", ":")))
        file.write(',"regions":')
        file.write(json.dumps(regions, ensure_ascii=False, separators=(",", ":")))
        file.write(',"cities":[\n')
        for index, row in enumerate(rows):
            file.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            file.write(",\n" if index < len(rows) - 1 else "\n")
        file.write("]}\n")
    json_write(output / "destinations-legacy.json", legacy)
    json_write(output / "destinations-legacy-public.json", legacy_public)
    metadata = {**manifest, "license": "CC-BY-4.0", "attribution": "GeoNames",
                "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
                "catalogCount": len(rows), "countryCount": len({row[2] for row in rows}),
                "excludedHistoricalAbandonedDestroyed": excluded,
                "legacyCount": len(legacy),
                "columns": ["geonameId", "name", "countryCode", "admin1Code", "latitude",
                            "longitude", "timezone", "population", "normalizedAliases"],
                "catalogSha256": hashlib.sha256((output / "destinations.json").read_bytes()).hexdigest()}
    (output / "destinations-source.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Imported {len(rows):,} places in {metadata['countryCount']} country/territory codes; "
          f"preserved {len(legacy)} legacy URLs.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("/tmp/hotel-revealer-geonames"))
    parser.add_argument("--download", action="store_true", help="Fetch today's public source files first")
    args = parser.parse_args()
    if args.download:
        download(args.source_dir)
    import_catalog(args.source_dir)
