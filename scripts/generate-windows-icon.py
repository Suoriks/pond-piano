#!/usr/bin/env python3
"""Build the multi-resolution Windows icon from the canonical 512 px PNG."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "icon-512.png"
TARGET = ROOT / "build" / "icon.ico"
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

TARGET.parent.mkdir(exist_ok=True)
with Image.open(SOURCE) as source:
    source.convert("RGBA").save(TARGET, format="ICO", sizes=SIZES)

print(f"Generated {TARGET.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}")
