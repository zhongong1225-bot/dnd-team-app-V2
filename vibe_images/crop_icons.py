import os
from PIL import Image

SRC = r"G:\dnd-team-app\vibe_images\item-category-icon-filled-v7_1788874232168_fa3141de.png"
OUT = r"G:\dnd-team-app\src\assets\category-icons"
NAMES = ["weapon", "armor", "focus", "gem", "container", "tool", "potion", "music", "other"]

img = Image.open(SRC).convert("RGB")
W, H = img.size
px = img.load()


from PIL import Image, ImageDraw

COL_X = [268, 768, 1268]
ROW_Y = [184, 512, 850]
DISC_R = 133
MASK_R = 130  # ring outer edge; anything beyond (backing-bar stubs) goes transparent

os.makedirs(OUT, exist_ok=True)


for idx, name in enumerate(NAMES):
    row, col = divmod(idx, 3)
    cx, cy = COL_X[col], ROW_Y[row]
    r = DISC_R
    crop = img.crop((cx - r, cy - r, cx + r, cy + r)).convert("RGBA")
    masked = Image.new("L", (r * 8, r * 8), 0)
    d = ImageDraw.Draw(masked)
    rr = MASK_R * 4
    c = r * 4
    d.ellipse((c - rr, c - rr, c + rr, c + rr), fill=255)
    crop.putalpha(masked.resize((r * 2, r * 2), Image.LANCZOS))
    print(name, "center", (cx, cy), "r", r)
    crop.save(os.path.join(OUT, name + ".png"))

print("saved to", OUT)
