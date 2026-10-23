#!/usr/bin/env python3
"""Draw the dashboard's home-screen icons (web/manifest.json).

    python scripts/app_icons.py

The drawing is web/icons/icon.svg (the tractor of src/ui/icons.js on
Default's slate), redrawn here with Pillow, so change both together:
- icon-192.png and icon-512.png: rounded, like the SVG;
- icon-maskable-512.png and apple-touch-icon.png (180): the whole square,
  since Android and iOS cut their own shape out of it, with the drawing
  smaller, inside the middle 80 %.
"""

from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
ICONS = REPO / "web" / "icons"

TOP, BOTTOM = (0x1E, 0x29, 0x3B), (0x0F, 0x17, 0x2A)   # #1e293b -> #0f172a
INK = (0x22, 0xD3, 0xEE)                               # --accent
GROUND = (0x33, 0x41, 0x55)                            # --border
SUPER = 4                                              # supersampling


def draw(size: int, full_bleed: bool) -> Image.Image:
    big = size * SUPER
    u = big / 48                                       # one unit of the 48 box
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))

    background = Image.new("RGBA", (big, big))
    bg = ImageDraw.Draw(background)
    for y in range(big):
        t = y / (big - 1)
        bg.line([(0, y), (big, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=0 if full_bleed else 11 * u, fill=255)
    im.paste(background, (0, 0), mask)

    d = ImageDraw.Draw(im)
    # the SVG's transforms: translate(9 8) scale(1.25), or (12 11.5) scale(1)
    (ox, oy, k) = (12, 11.5, 1.0) if full_bleed else (9, 8, 1.25)
    w = 2 * k * u                                      # stroke width

    def p(x, y):
        return ((ox + x * k) * u, (oy + y * k) * u)

    def line(points, colour):
        pts = [p(x, y) for x, y in points]
        d.line(pts, fill=colour, width=round(w), joint="curve")
        for x, y in pts:                               # round caps
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=colour)

    def ring(cx, cy, r):
        x, y = p(cx, cy)
        r *= k * u
        d.ellipse([x - r - w / 2, y - r - w / 2, x + r + w / 2, y + r + w / 2], outline=INK, width=round(w))

    # the ground: M9 36.5h30, or M12 33.5h24 (in the 48 box)
    gy, gx0, gx1 = (33.5, 12, 36) if full_bleed else (36.5, 9, 39)
    for x in (gx0, gx1):
        d.ellipse([x * u - w / 2 / k, gy * u - w / 2 / k, x * u + w / 2 / k, gy * u + w / 2 / k], fill=GROUND)
    d.line([(gx0 * u, gy * u), (gx1 * u, gy * u)], fill=GROUND, width=round(w / k))
    # the tractor: body and cab, exhaust, wheels and hub
    line([(3, 12.5), (3, 3.5), (11, 3.5), (12.5, 11.5), (20.5, 11.5), (20.5, 15)], INK)
    line([(16.5, 11.5), (16.5, 8)], INK)
    ring(7, 16.5, 4.5)
    ring(18.5, 18, 2.8)
    hx, hy = p(7, 16.5)
    hr = (1 + 1) * k * u                               # r=1 filled, plus its stroke
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=INK)

    return im.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    for name, size, full in [("icon-192", 192, False), ("icon-512", 512, False),
                             ("icon-maskable-512", 512, True), ("apple-touch-icon", 180, True)]:
        out = ICONS / f"{name}.png"
        img = draw(size, full)
        if full:
            img = img.convert("RGB")                   # no transparency: iOS would fill it black
        img.save(out, optimize=True)
        print(f"wrote {out.relative_to(REPO)}")


if __name__ == "__main__":
    main()
