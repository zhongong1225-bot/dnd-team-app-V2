import os
from PIL import Image, ImageDraw

OUT = r"G:\dnd-team-app\src\assets\category-icons"

JOBS = [
    (r"G:\dnd-team-app\vibe_images\item-category-icon-extra-v8_1788876195541_f6933a94.png", "armorplate", 408, 510, 236, 233),
    (r"G:\dnd-team-app\vibe_images\item-category-icon-firearm-medieval-v9_1788876332135_1369b00c.png", "firearm", 510, 510, 337, 333),
]

os.makedirs(OUT, exist_ok=True)

for src, name, cx, cy, r, mr in JOBS:
    img = Image.open(src).convert("RGB")
    crop = img.crop((cx - r, cy - r, cx + r, cy + r)).convert("RGBA")
    mask = Image.new("L", (r * 8, r * 8), 0)
    d = ImageDraw.Draw(mask)
    rr = mr * 4
    c = r * 4
    d.ellipse((c - rr, c - rr, c + rr, c + rr), fill=255)
    crop.putalpha(mask.resize((r * 2, r * 2), Image.LANCZOS))
    crop.save(os.path.join(OUT, name + ".png"))
    print(name, "saved", crop.size)
