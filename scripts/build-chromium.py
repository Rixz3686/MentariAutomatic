#!/usr/bin/env python3
"""Build a zero-warning Chromium / Microsoft Edge MV3 distribution folder and .zip."""

from __future__ import annotations

import hashlib
import json
import shutil
import struct
import sys
import zipfile
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
EXT_ROOT = WORKSPACE_ROOT
DIST_DIR = WORKSPACE_ROOT / "dist"
LEGACY_UNPACKED_DIR = DIST_DIR / "mentari-mod-edge-chrome"

TOP_LEVEL_ALLOWLIST = ("LICENSE", "pet.html", "pet.js")
EXCLUDED_NAMES = {".gitignore", "README.md", "__pycache__"}


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG file: {path}")
    return struct.unpack(">II", data[16:24])


def build_chromium_manifest(src_manifest: dict) -> dict:
    manifest = json.loads(json.dumps(src_manifest))
    manifest.pop("browser_specific_settings", None)
    manifest["minimum_chrome_version"] = "116"

    bg = manifest.get("background") or {}
    sw = bg.get("service_worker")
    if not sw:
        raise ValueError("background.service_worker is required for Chromium/Edge")
    manifest["background"] = {"service_worker": sw}
    return manifest


def collect_referenced_paths(manifest: dict) -> list[str]:
    refs: list[str] = []
    bg = manifest.get("background") or {}
    if bg.get("service_worker"):
        refs.append(bg["service_worker"])

    action = manifest.get("action") or {}
    popup = action.get("default_popup")
    if popup:
        refs.append(popup)
    options_page = (manifest.get("options_ui") or {}).get("page")
    if options_page:
        refs.append(options_page)
    default_icon = action.get("default_icon")
    if isinstance(default_icon, str):
        refs.append(default_icon)
    elif isinstance(default_icon, dict):
        refs.extend(default_icon.values())

    for icon_path in (manifest.get("icons") or {}).values():
        refs.append(icon_path)
    for cs in manifest.get("content_scripts") or []:
        refs.extend(cs.get("js") or [])
        refs.extend(cs.get("css") or [])
    for war in manifest.get("web_accessible_resources") or []:
        refs.extend(war.get("resources") or [])
    return sorted(set(refs))


def validate_chromium_manifest(manifest: dict) -> list[str]:
    if manifest.get("manifest_version") != 3:
        raise ValueError("manifest_version must be 3")
    if "browser_specific_settings" in manifest:
        raise ValueError("browser_specific_settings must be stripped for Chromium/Edge")
    if "scripts" in (manifest.get("background") or {}):
        raise ValueError("background.scripts must be stripped for Chromium/Edge")

    for size_str, rel in (manifest.get("icons") or {}).items():
        expected = int(size_str)
        actual = png_size(EXT_ROOT / rel)
        if actual != (expected, expected):
            raise ValueError(f"Icon {rel} has size {actual}, expected ({expected}, {expected})")

    referenced = collect_referenced_paths(manifest)
    for rel in referenced:
        if not (EXT_ROOT / rel).is_file():
            raise FileNotFoundError(f"Referenced manifest path missing: {rel}")
    return referenced


def main() -> int:
    src_manifest = json.loads((EXT_ROOT / "manifest.json").read_text(encoding="utf-8"))
    edge_manifest = build_chromium_manifest(src_manifest)
    referenced = validate_chromium_manifest(edge_manifest)

    if LEGACY_UNPACKED_DIR.exists():
        shutil.rmtree(LEGACY_UNPACKED_DIR)
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    version = str(edge_manifest.get("version", "1.0")).strip() or "1.0"
    zip_path = DIST_DIR / f"mentari-mod-edge-chrome-v{version}.zip"

    entries: list[tuple[str, Path]] = []
    for name in TOP_LEVEL_ALLOWLIST:
        entries.append((name, EXT_ROOT / name))

    src_dir = EXT_ROOT / "src"
    for fp in sorted(src_dir.rglob("*")):
        if not fp.is_file():
            continue
        rel = fp.relative_to(EXT_ROOT)
        if any(part.startswith(".") or part in EXCLUDED_NAMES for part in rel.parts):
            continue
        if fp.suffix == ".map":
            continue
        entries.append((rel.as_posix(), fp))

    manifest_bytes = (json.dumps(edge_manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.writestr("manifest.json", manifest_bytes)
        for arcname, fp in sorted(entries, key=lambda item: item[0]):
            zf.write(fp, arcname)

    with zipfile.ZipFile(zip_path, "r") as zf:
        bad = zf.testzip()
        if bad is not None:
            raise RuntimeError(f"CRC check failed for {bad}")
        names = zf.namelist()
        if "manifest.json" not in names:
            raise RuntimeError("manifest.json missing at ZIP root")
        if any("\\" in n for n in names):
            raise RuntimeError("Backslash found in ZIP entry")
        for rel in referenced:
            if rel not in names:
                raise RuntimeError(f"Referenced path missing in ZIP: {rel}")

    sha256 = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    print(f"Source Root    : {EXT_ROOT}")
    print(f"Built ZIP      : {zip_path}")
    print(f"Files          : {len(names)}")
    print(f"Size           : {zip_path.stat().st_size} bytes")
    print(f"SHA-256        : {sha256}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
