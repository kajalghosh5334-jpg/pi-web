#!/usr/bin/env python3
"""Generate a simplified Cardcaptor Sakura illustration - flying pose with starry sky."""

from PIL import Image, ImageDraw, ImageFont
import math
import random

random.seed(123)

W, H = 800, 1000
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# ===== STARFIELD BACKGROUND =====
bg = Image.new("RGB", (W, H), (5, 5, 30))
bg_draw = ImageDraw.Draw(bg)

# Stars
for _ in range(300):
    x = random.randint(0, W)
    y = random.randint(0, H)
    r = random.uniform(0.5, 2)
    brightness = random.randint(150, 255)
    size = int(r * 2)
    bg_draw.ellipse([x - r, y - r, x + r, y + r], fill=(brightness, brightness, brightness + random.randint(0, 30)))

# Brighter stars with glow
for _ in range(30):
    x = random.randint(50, W - 50)
    y = random.randint(50, H - 200)
    r = random.uniform(1.5, 3)
    for dr in range(int(r * 3), 0, -1):
        frac = dr / (r * 3)
        brightness = int(220 * frac)
        bg_draw.ellipse([x - dr, y - dr, x + dr, y + dr], fill=(brightness, brightness, brightness))

# Subtle nebula
for _ in range(5):
    nx = random.randint(100, W - 100)
    ny = random.randint(100, H - 300)
    nr = random.randint(60, 120)
    for dy in range(-nr, nr + 1):
        for dx in range(-nr, nr + 1):
            if dx * dx + dy * dy > nr * nr:
                continue
            dist = math.sqrt(dx * dx + dy * dy) / nr
            alpha = int(15 * (1 - dist))
            r_val = int(100 + 50 * (1 - dist))
            g_val = int(50 + 80 * (1 - dist))
            b_val = int(180 + 75 * dist)
            px, py = nx + dx, ny + dy
            if 0 <= px < W and 0 <= py < H:
                old = bg.getpixel((px, py))
                bg_draw.point((px, py), fill=(
                    min(255, old[0] + r_val),
                    min(255, old[1] + g_val),
                    min(255, old[2] + b_val)
                ))

# Merge bg into main
img.paste(bg, (0, 0))

# ===== CHARACTER =====
cx = W // 2
cy = H // 2 - 80

# --- Hair (brown, short with bangs) ---
hair_color = (120, 70, 40)
hair_light = (160, 100, 60)
hair_dark = (80, 45, 25)

# Head shape
head_cx, head_cy = cx, cy - 120
head_r_x, head_r_y = 55, 60

# Face
face_color = (255, 230, 210)
face_shadow = (240, 210, 190)
draw.ellipse([head_cx - head_r_x, head_cy - head_r_y, head_cx + head_r_x, head_cy + head_r_y], fill=face_color)

# Face shadow (lower half)
for dy in range(0, head_r_y):
    for dx in range(-head_r_x, head_r_x):
        if dx * dx / (head_r_x ** 2) + dy * dy / (head_r_y ** 2) > 1:
            continue
        if dy > head_r_y * 0.3:
            shade = int(face_shadow[0] - 10 * (dy / head_r_y))
            shade_g = int(face_shadow[1] - 10 * (dy / head_r_y))
            shade_b = int(face_shadow[2] - 10 * (dy / head_r_y))
            draw.point((head_cx + dx, head_cy + dy), fill=(shade, shade_g, shade_b))

# Eyes (large anime style)
eye_y = head_cy - 5
eye_spacing = 22
eye_w, eye_h = 14, 16

for side in [-1, 1]:
    ex = head_cx + side * eye_spacing
    
    # Eye white
    draw.ellipse([ex - eye_w, eye_y - eye_h, ex + eye_w, eye_y + eye_h], fill=(240, 245, 255))
    
    # Iris (brown)
    iris_r = 10
    draw.ellipse([ex - iris_r, eye_y - iris_r + 2, ex + iris_r, eye_y + iris_r + 2], fill=(60, 35, 20))
    
    # Pupil
    draw.ellipse([ex - 4, eye_y - 4 + 2, ex + 4, eye_y + 4 + 2], fill=(20, 10, 5))
    
    # Eye highlights
    draw.ellipse([ex - 3, eye_y - 5 + 2, ex + 1, eye_y - 1 + 2], fill=(255, 255, 255))
    draw.ellipse([ex + 2, eye_y + 1 + 2, ex + 5, eye_y + 4 + 2], fill=(255, 255, 255, 180))
    
    # Upper eyelid (thick line)
    for i in range(-eye_w - 2, eye_w + 3):
        ey_top = eye_y - eye_h + 2 - abs(i) * 0.3
        draw.point((ex + i, int(ey_top)), fill=(30, 15, 10))
    
    # Eyebrow
    brow_y = eye_y - eye_h - 8
    brow_pts = [(ex + i, brow_y - abs(i) * 0.5) for i in range(-12, 13)]
    for bx, by in brow_pts:
        draw.ellipse([bx - 1, by - 1, bx + 1, by + 1], fill=hair_color)

# Nose (small dot)
draw.point((head_cx, eye_y + 12), fill=(220, 195, 175))

# Mouth (small smile)
mouth_y = eye_y + 28
draw.arc([head_cx - 8, mouth_y - 3, head_cx + 8, mouth_y + 6], 10, 170, fill=(200, 100, 100), width=2)

# --- Hair ---
# Hair covers top and sides of head
for dy in range(-head_r_y - 5, 5):
    for dx in range(-head_r_x - 8, head_r_x + 8):
        # Hair shape: extends beyond head
        dist_x = dx / (head_r_x + 8)
        dist_y = dy / (head_r_y + 5)
        if dist_x * dist_x + dist_y * dist_y > 1.1:
            continue
        if dy > -head_r_y * 0.2:
            continue  # hair only on top/sides
        
        if dy < -head_r_y * 0.5:
            c = hair_light
        elif dy < 0:
            c = hair_color
        else:
            c = hair_dark
        draw.point((head_cx + dx, head_cy + dy), fill=c)

# Hair bangs (fringe)
bang_y_start = head_cy - head_r_y + 5
for i in range(-head_r_x, head_r_x + 5):
    t = (i + head_r_x) / (2 * head_r_x)
    bang_drop = 20 + math.sin(t * math.pi) * 35
    by = bang_y_start + bang_drop
    bh = 8 + math.sin(t * math.pi) * 5
    for dy in range(int(by), int(by + bh)):
        draw.point((head_cx + i, dy), fill=hair_color)

# Side hair strands
for side in [-1, 1]:
    sx = head_cx + side * (head_r_x - 5)
    for dy in range(0, 80):
        t = dy / 80
        sway = side * math.sin(t * 3) * 8
        draw.point((sx + sway, head_cy + dy), fill=hair_color)
        draw.point((sx + sway + side * 2, head_cy + dy), fill=hair_light)

# --- Red bow on hair ---
bow_cx = head_cx + 35
bow_cy = head_cy - head_r_y + 10
draw.polygon([(bow_cx, bow_cy), (bow_cx - 20, bow_cy - 15), (bow_cx - 18, bow_cy + 10)], fill=(200, 30, 50))
draw.polygon([(bow_cx, bow_cy), (bow_cx + 18, bow_cy - 12), (bow_cx + 20, bow_cy + 8)], fill=(200, 30, 50))
draw.ellipse([bow_cx - 5, bow_cy - 5, bow_cx + 5, bow_cy + 5], fill=(180, 25, 40))

# --- Body (flying pose - leaning forward slightly) ---
body_cx = cx
body_cy = cy + 40

# Torso - red dress
# Simplified body shape
body_pts = [
    (body_cx - 30, body_cy - 20),   # left shoulder
    (body_cx + 30, body_cy - 20),   # right shoulder
    (body_cx + 35, body_cy + 60),   # right hip
    (body_cx - 35, body_cy + 60),   # left hip
    (body_cx - 30, body_cy - 5),    # neck area
]

# Dress (red)
dress_color = (200, 30, 50)
dress_highlight = (230, 60, 80)
dress_shadow = (160, 20, 40)

# Main dress body
for dy in range(-20, 70):
    for dx in range(-35, 36):
        t = dy / 90
        w = 30 + 10 * (1 - t)
        if abs(dx) > w:
            continue
        if dy < 0:
            c = dress_highlight
        elif dy < 30:
            c = dress_color
        else:
            c = dress_shadow
        draw.point((body_cx + dx, body_cy + dy), fill=c)

# White collar
collar_y = body_cy - 18
for dx in range(-25, 26):
    cw = 8 - abs(dx) * 0.2
    if cw > 0:
        for dy in range(int(collar_y - cw), int(collar_y + cw)):
            draw.point((body_cx + dx, dy), fill=(255, 255, 255))

# Gold buttons
for i in range(3):
    by = body_cy + i * 18
    draw.ellipse([body_cx - 3, by - 3, body_cx + 3, by + 3], fill=(220, 180, 50))

# --- Skirt (flared, flowing in wind) ---
skirt_y = body_cy + 55
skirt_color = (200, 30, 50)
skirt_highlight = (225, 55, 75)
skirt_shadow = (150, 15, 35)

for dy in range(0, 50):
    t = dy / 50
    sw = 45 + 20 * t  # flares out
    for dx in range(-int(sw), int(sw)):
        dt = abs(dx) / sw
        if dt > 1:
            continue
        if dy < 15:
            c = skirt_highlight
        elif dy < 35:
            c = skirt_color
        else:
            c = skirt_shadow
        draw.point((body_cx + dx, skirt_y + dy), fill=c)

# Skirt folds (dark lines)
for fold_i in range(-2, 3):
    fold_x = body_cx + fold_i * 15
    fold_pts = [(fold_x + fold_i * 3, skirt_y + dy) for dy in range(0, 50)]
    for fx, fy in fold_pts:
        draw.point((fx, fy), fill=skirt_shadow)

# --- Arms ---
arm_color = face_color
arm_shadow = (230, 200, 180)

# Left arm (reaching forward/up with card)
left_arm_angle = -0.8  # angled up
la_len = 55
la_end_x = body_cx - 30 + la_len * math.cos(left_arm_angle)
la_end_y = body_cy - 10 + la_len * math.sin(left_arm_angle)

for t in range(20):
    at = t / 20
    ax = body_cx - 28 + (la_end_x - (body_cx - 28)) * at
    ay = body_cy - 5 + (la_end_y - (body_cy - 5)) * at
    aw = 7 - at * 2
    for dy in range(-int(aw), int(aw)):
        for dx in range(-int(aw), int(aw)):
            if dx * dx + dy * dy > aw * aw:
                continue
            if dy < 0:
                draw.point((int(ax) + dx, int(ay) + dy), fill=arm_color)
            else:
                draw.point((int(ax) + dx, int(ay) + dy), fill=arm_shadow)

# Right arm (holding card)
ra_end_x = body_cx + 50
ra_end_y = body_cy - 30

for t in range(20):
    at = t / 20
    rx = body_cx + 28 + (ra_end_x - (body_cx + 28)) * at
    ry = body_cy - 5 + (ra_end_y - (body_cy - 5)) * at
    rw = 7 - at * 2
    for dy in range(-int(rw), int(rw)):
        for dx in range(-int(rw), int(rw)):
            if dx * dx + dy * dy > rw * rw:
                continue
            if dy < 0:
                draw.point((int(rx) + dx, int(ry) + dy), fill=arm_color)
            else:
                draw.point((int(rx) + dx, int(ry) + dy), fill=arm_shadow)

# --- Hands ---
hand_color = face_color
# Left hand
lh_x, lh_y = la_end_x, la_end_y
draw.ellipse([lh_x - 5, lh_y - 5, lh_x + 5, lh_y + 5], fill=hand_color)
# Right hand
rh_x, rh_y = ra_end_x, ra_end_y
draw.ellipse([rh_x - 5, rh_y - 5, rh_x + 5, rh_y + 5], fill=hand_color)

# --- Legs (short, visible under skirt) ---
leg_color = face_color
leg_shadow = (235, 210, 190)

for side in [-1, 1]:
    lx = body_cx + side * 15
    for dy in range(0, 35):
        lw = 6 - dy * 0.1
        for dx in range(-int(lw), int(lw)):
            if dx * dx > lw * lw:
                continue
            if dy < 15:
                draw.point((lx + dx, skirt_y + dy), fill=leg_color)
            else:
                draw.point((lx + dx, skirt_y + dy), fill=leg_shadow)

# Shoes
for side in [-1, 1]:
    sx = body_cx + side * 15
    draw.ellipse([sx - 8, skirt_y + 33, sx + 8, skirt_y + 40], fill=(180, 40, 30))

# --- Cape/ribbon flowing in wind ---
ribbon_color = (200, 30, 50)
ribbon_highlight = (230, 70, 90)

# Back ribbon flowing
ribbon_pts = []
for t in range(40):
    rt = t / 40
    rx = body_cx - 20 + rt * 80 + math.sin(rt * 5) * 15
    ry = body_cy + rt * 60
    ribbon_pts.append((rx, ry))

for t in range(len(ribbon_pts) - 1):
    r1 = ribbon_pts[t]
    r2 = ribbon_pts[t + 1]
    rw = max(2, 10 - t * 0.2)
    for dy in range(-int(rw), int(rw)):
        for dx in range(-2, 3):
            draw.point((int(r1[0]) + dx, int(r1[1]) + dy), fill=ribbon_color if dy < 0 else ribbon_highlight)

# Front ribbon
front_ribbon = []
for t in range(30):
    ft = t / 30
    fx = body_cx + 10 + ft * 60 + math.sin(ft * 4) * 10
    fy = body_cy + ft * 40
    front_ribbon.append((fx, fy))

for pt in front_ribbon:
    for dy in range(-4, 5):
        for dx in range(-1, 2):
            draw.point((int(pt[0]) + dx, int(pt[1]) + dy), fill=ribbon_color)

# --- Clow Card ---
card_x = ra_end_x + 5
card_y = ra_end_y - 15
card_w, card_h = 35, 55

# Card body
draw.rectangle([card_x - card_w // 2, card_y - card_h // 2, card_x + card_w // 2, card_y + card_h // 2], fill=(255, 255, 240))
draw.rectangle([card_x - card_w // 2 + 2, card_y - card_h // 2 + 2, card_x + card_w // 2 - 2, card_y + card_h // 2 - 2], outline=(180, 160, 100), width=1)

# Card symbol (star)
star_cx = card_x
star_cy = card_y
star_r = 10
for i in range(5):
    a1 = 2 * math.pi * i / 5 - math.pi / 2
    a2 = 2 * math.pi * (i + 2) / 5 - math.pi / 2
    draw.line([(star_cx, star_cy),
               (star_cx + star_r * math.cos(a1), star_cy + star_r * math.sin(a1)),
               (star_cx + star_r * math.cos(a2), star_cy + star_r * math.sin(a2))],
              fill=(200, 160, 40), width=2)

# Card text
draw.text((card_x - 10, card_y + card_h // 2 - 12), "STAR", fill=(180, 160, 100))

# --- Floating particles/sparkles ---
for _ in range(20):
    sx = random.randint(50, W - 50)
    sy = random.randint(100, H - 100)
    sr = random.uniform(1, 3)
    sparkle = random.randint(200, 255)
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=(sparkle, sparkle, sparkle))

# Small cross sparkles
for _ in range(15):
    sx = random.randint(100, W - 100)
    sy = random.randint(150, H - 150)
    sl = random.randint(4, 8)
    draw.line([(sx, sy - sl), (sx, sy + sl)], fill=(255, 255, 200), width=1)
    draw.line([(sx - sl, sy), (sx + sl, sy)], fill=(255, 255, 200), width=1)

# ===== FINAL TOUCHES =====
# Slight vignette
for dy in range(H):
    for dx in range(W):
        dist = math.sqrt((dx - W // 2) ** 2 + (dy - H // 2) ** 2)
        max_dist = math.sqrt((W // 2) ** 2 + (H // 2) ** 2)
        if dist / max_dist > 0.7:
            darkness = int(255 * (1 - (dist / max_dist - 0.7) / 0.3))
            r, g, b = bg.getpixel((dx, dy))
            bg.putpixel((dx, dy), (r * darkness // 255, g * darkness // 255, b * darkness // 255))

# Composite bg
img.paste(bg, (0, 0))

# Light glow around character
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for dy in range(-150, 150):
    for dx in range(-150, 150):
        d = math.sqrt(dx * dx + dy * dy)
        if d > 150:
            continue
        alpha = int(30 * (1 - d / 150))
        gd.point((cx + dx, cy + dy + 20), fill=(255, 250, 200, alpha))

img = Image.alpha_composite(img, glow)

output = "/Users/yipengfei/Desktop/pi-fork/sakura.png"
img.save(output, "PNG")
print(f"Done: {output}")
print(f"Size: {img.size}")
