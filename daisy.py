#!/usr/bin/env python3
"""Generate a realistic daisy flower using Pillow."""

from PIL import Image, ImageDraw, ImageFilter
import math
import random

random.seed(42)

W, H = 800, 800
img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)

def draw_petal(draw, cx, cy, angle, length, max_width, color_base, color_tip):
    """Draw a single smooth petal."""
    steps = 50
    for i in range(steps + 1):
        t = i / steps
        px = cx + length * t * math.cos(angle)
        py = cy + length * t * math.sin(angle)
        w = max_width * math.sin(t * math.pi) * (1 - 0.06 * t)
        
        if t < 0.5:
            r = int(color_base[0] + (color_tip[0] - color_base[0]) * t * 2)
            g = int(color_base[1] + (color_tip[1] - color_base[1]) * t * 2)
            b = int(color_base[2] + (color_tip[2] - color_base[2]) * t * 2)
        else:
            r = int(color_tip[0] + (color_base[0] - color_tip[0]) * (t - 0.5) * 2)
            g = int(color_tip[1] + (color_base[1] - color_tip[1]) * (t - 0.5) * 2)
            b = int(color_tip[2] + (color_base[2] - color_tip[2]) * (t - 0.5) * 2)
        
        radius = max(2, int(w / 2.3))
        draw.ellipse([px - radius, py - radius, px + radius, py + radius], fill=(r, g, b))


def draw_petal_layer(draw, cx, cy, num_petals, length, width, rot_offset):
    """Draw a full ring of petals."""
    for i in range(num_petals):
        angle = 2 * math.pi * i / num_petals + rot_offset
        draw_petal(draw, cx, cy, angle, length, width, (255, 255, 252), (248, 250, 245))


def draw_center(draw, cx, cy, radius):
    """Draw textured yellow center."""
    for y in range(-radius, radius + 1):
        for x in range(-radius, radius + 1):
            if x * x + y * y > radius * radius:
                continue
            dist = math.sqrt(x * x + y * y) / radius
            r_val = int(255 - 25 * dist + random.randint(-12, 12))
            g_val = int(215 - 70 * dist + random.randint(-12, 12))
            b_val = int(15 + 35 * dist + random.randint(-8, 8))
            r_val = max(0, min(255, r_val))
            g_val = max(0, min(255, g_val))
            b_val = max(0, min(255, b_val))
            draw.point((cx + x, cy + y), fill=(r_val, g_val, b_val))
    
    # Bright center highlights
    for _ in range(60):
        a = random.uniform(0, 2 * math.pi)
        d = random.uniform(0, radius * 0.45)
        px = int(cx + d * math.cos(a))
        py = int(cy + d * math.sin(a))
        draw.ellipse([px - 1, py - 1, px + 1, py + 1], fill=(255, 250, 140))


def draw_stem(draw, cx, top_y, bottom_y):
    """Draw curved green stem."""
    segs = 80
    for i in range(segs):
        t = i / segs
        x = cx + math.sin(t * math.pi * 0.4) * 12
        y = top_y + (bottom_y - top_y) * t
        w = int(6 + 3 * math.sin(t * math.pi))
        shade = int(70 + 25 * math.sin(t * 10))
        draw.ellipse([x - w, y - 1, x + w, y + 1], fill=(45, shade, 35))


def draw_leaf(draw, sx, sy, angle, size):
    """Draw leaf polygon."""
    pts = []
    n = 20
    for i in range(n + 1):
        t = i / n
        w = math.sin(t * math.pi) * size
        px = sx + t * size * 1.8 * math.cos(angle)
        py = sy + t * size * 1.8 * math.sin(angle)
        pts.append((px - math.sin(angle) * w, py + math.cos(angle) * w))
    for i in range(n, -1, -1):
        t = i / n
        w = math.sin(t * math.pi) * size
        px = sx + t * size * 1.8 * math.cos(angle)
        py = sy + t * size * 1.8 * math.sin(angle)
        pts.append((px + math.sin(angle) * w, py - math.cos(angle) * w))
    draw.polygon(pts, fill=(55, 135, 45))
    vein = [(sx + t * size * 1.6 * math.cos(angle), sy + t * size * 1.6 * math.sin(angle)) for t in [i/20 for i in range(21)]]
    draw.line(vein, fill=(35, 95, 25), width=2)


# === Draw ===
fcx, fcy = W // 2, H // 2 - 40

draw_petal_layer(draw, fcx, fcy, 13, 155, 48, 0)
draw_petal_layer(draw, fcx, fcy, 13, 135, 42, math.pi / 13)
draw_petal_layer(draw, fcx, fcy, 10, 115, 38, math.pi / 20)
draw_center(draw, fcx, fcy, 42)

stem_start = fcy + 38
draw_stem(draw, fcx, stem_start, H - 60)
draw_leaf(draw, fcx - 3, stem_start + 100, 0.7, 35)
draw_leaf(draw, fcx + 6, stem_start + 200, -0.6, 30)

img = img.filter(ImageFilter.GaussianBlur(0.5))

output = "/Users/yipengfei/Desktop/pi-fork/daisy.png"
img.save(output, "PNG")
print(f"Done: {output}")
print(f"Size: {img.size}, Mode: {img.mode}")
