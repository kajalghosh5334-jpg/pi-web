#!/usr/bin/env python3
"""Generate a realistic daisy flower using Pillow - path-based approach."""

from PIL import Image, ImageDraw, ImageFilter
import math
import random

random.seed(42)

W, H = 800, 800
img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)

def draw_smooth_petal(draw, cx, cy, angle, length, max_width, color1, color2):
    """Draw a single smooth petal using filled circles along a curve."""
    steps = 40
    for i in range(steps + 1):
        t = i / steps
        # Position along petal
        px = cx + length * t * math.cos(angle)
        py = cy + length * t * math.sin(angle)
        
        # Width profile - elliptical with slight asymmetry
        w = max_width * math.sin(t * math.pi) * (1 - 0.08 * t)
        
        # Color blend
        if t < 0.5:
            r = int(color1[0] + (color2[0] - color1[0]) * t * 2)
            g = int(color1[1] + (color2[1] - color1[1]) * t * 2)
            b = int(color1[2] + (color2[2] - color1[2]) * t * 2)
        else:
            r = int(color2[0] + (color1[0] - color2[0]) * (t - 0.5) * 2)
            g = int(color2[1] + (color2[1] - color1[1]) * (t - 0.5) * 2)
            b = int(color2[2] + (color2[2] - color1[2]) * (t - 0.5) * 2)
        
        # Radius based on width
        radius = max(2, int(w / 2.2))
        
        # Draw small ellipse-like shape
        draw.ellipse(
            [px - radius, py - radius, px + radius, py + radius],
            fill=(r, g, b)
        )


def draw_petal_layer(draw, cx, cy, num_petals, length, width, rotation_offset):
    """Draw a full layer of petals."""
    for i in range(num_petals):
        angle = 2 * math.pi * i / num_petals + rotation_offset
        # White with slight warm tint
        color_base = (255, 255, 252)
        color_tip = (248, 250, 245)
        draw_smooth_petal(draw, cx, cy, angle, length, width, color_base, color_tip)


def draw_center_texture(draw, cx, cy, radius):
    """Draw detailed yellow center with texture."""
    # Base disc
    for y in range(-radius, radius + 1):
        for x in range(-radius, radius + 1):
            if x * x + y * y > radius * radius:
                continue
            dist = math.sqrt(x * x + y * y) / radius
            
            # Yellow-orange gradient
            r_val = int(255 - 25 * dist)
            g_val = int(215 - 70 * dist)
            b_val = int(15 + 35 * dist)
            
            # Add noise for texture
            noise = random.randint(-15, 15)
            r_val = max(0, min(255, r_val + noise))
            g_val = max(0, min(255, g_val + noise))
            b_val = max(0, min(255, b_val + noise))
            
            draw.point((cx + x, cy + y), fill=(r_val, g_val, b_val))
    
    # Bright spots in center
    for _ in range(80):
        angle = random.uniform(0, 2 * math.pi)
        dist = random.uniform(0, radius * 0.5)
        x = int(cx + dist * math.cos(angle))
        y = int(cy + dist * math.sin(angle))
        draw.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(255, 250, 150))


def draw_stem(draw, cx, top_y, bottom_y):
    """Draw curved green stem."""
    segments = 60
    for i in range(segments):
        t = i / segments
        x = cx + math.sin(t * math.pi * 0.4) * 12
        y = top_y + (bottom_y - top_y) * t
        
        # Varying width
        w = int(6 + 3 * math.sin(t * math.pi))
        
        # Green shades
        shade = int(70 + 25 * math.sin(t * 10))
        draw.ellipse([x - w, y - 1, x + w, y + 1], fill=(45, shade, 35))


def draw_leaf(draw, sx, sy, angle, size):
    """Draw a leaf using polygon."""
    points = []
    n = 20
    for i in range(n + 1):
        t = i / n
        w = math.sin(t * math.pi) * size
        px = sx + t * size * 1.8 * math.cos(angle)
        py = sy + t * size * 1.8 * math.sin(angle)
        perp_x = -math.sin(angle) * w
        perp_y = math.cos(angle) * w
        points.append((px + perp_x, py + perp_y))
    for i in range(n, -1, -1):
        t = i / n
        w = math.sin(t * math.pi) * size
        px = sx + t * size * 1.8 * math.cos(angle)
        py = sy + t * size * 1.8 * math.sin(angle)
        perp_x = -math.sin(angle) * w
        perp_y = math.cos(angle) * w
        points.append((px - perp_x, py - perp_y))
    
    draw.polygon(points, fill=(55, 135, 45))
    # Vein
    vein = []
    for i in range(n + 1):
        t = i / n
        px = sx + t * size * 1.6 * math.cos(angle)
        py = sy + t * size * 1.6 * math.sin(angle)
        vein.append((px, py))
    draw.line(vein, fill=(35, 95, 25), width=2)


# === Main ===

fcx, fcy = W // 2, H // 2 - 40

# Three layers of petals for depth
draw_petal_layer(draw, fcx, fcy, 13, 155, 48, 0)
draw_petal_layer(draw, fcx, fcy, 13, 135, 42, math.pi / 13)
draw_petal_layer(draw, fcx, fcy, 10, 115, 38, math.pi / 20)

# Center
draw_center_texture(draw, fcx, fcy, 42)

# Stem
stem_start = fcy + 38
draw_stem(draw, fcx, stem_start, H - 60)

# Leaves
draw_leaf(draw, fcx - 3, stem_start + 100, 0.7, 35)
draw_leaf(draw, fcx + 6, stem_start + 200, -0.6, 30)

# Slight blur for softness
img = img.filter(ImageFilter.GaussianBlur(0.5))

output_path = "/Users/yipengfei/Desktop/pi-fork/daisy.png"
img.save(output_path, "PNG")
print(f"Daisy saved to {output_path}")
