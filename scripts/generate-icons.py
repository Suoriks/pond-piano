#!/usr/bin/env python3
"""Generate Pond Piano launcher icons from one deterministic water motif."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)


def pond_icon(size: int, maskable: bool = False) -> Image.Image:
    scale = 4
    s = size * scale
    image = Image.new("RGB", (s, s), "#041313")
    pixels = image.load()
    cx, cy = s * 0.48, s * 0.43
    for y in range(s):
        for x in range(s):
            d = min(1.0, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / (s * 0.78))
            glow = max(0.0, 1.0 - d)
            pixels[x, y] = (
                int(4 + glow * 13),
                int(19 + glow * 35),
                int(19 + glow * 32),
            )

    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    center = (s * 0.51, s * 0.49)
    gd.ellipse((center[0] - s*.11, center[1] - s*.11, center[0] + s*.11, center[1] + s*.11), fill=(151, 221, 188, 80))
    glow = glow.filter(ImageFilter.GaussianBlur(s * .055))
    image = Image.alpha_composite(image.convert("RGBA"), glow)
    draw = ImageDraw.Draw(image)

    safe = .21 if maskable else .12
    radii = (.16, .27, .38)
    for index, radius in enumerate(radii):
        rx = s * radius
        ry = rx * .43
        width = max(scale * 2, int(s * (.013 - index * .0018)))
        alpha = 225 - index * 52
        box = (center[0] - rx, center[1] - ry, center[0] + rx, center[1] + ry)
        draw.ellipse(box, outline=(185, 235 - index*12, 201 - index*10, alpha), width=width)

    # A tiny falling drop makes the icon read as water interaction, not a target.
    drop_y = s * (safe + .05)
    drop_r = s * .035
    draw.ellipse((center[0]-drop_r, drop_y-drop_r*1.4, center[0]+drop_r, drop_y+drop_r*1.4), fill=(218, 231, 180, 235))
    return image.resize((size, size), Image.Resampling.LANCZOS)


pond_icon(192).save(OUT / "icon-192.png", optimize=True)
pond_icon(512).save(OUT / "icon-512.png", optimize=True)
pond_icon(512, maskable=True).save(OUT / "icon-maskable-512.png", optimize=True)
pond_icon(180).save(OUT / "apple-touch-icon.png", optimize=True)
