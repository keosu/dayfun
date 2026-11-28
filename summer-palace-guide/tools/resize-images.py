"""把 tools/raw/full/*.jpg 压成 img/spots/<id>.jpg（宽 ≤ 960）和 <id>-s.jpg（320×240 缩略图）。
需要 Pillow：pip install pillow
"""
import os
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(ROOT, "tools", "raw", "full")
dst = os.path.join(ROOT, "img", "spots")
os.makedirs(dst, exist_ok=True)
total = 0
for name in sorted(os.listdir(src)):
    sid = os.path.splitext(name)[0]
    im = ImageOps.exif_transpose(Image.open(os.path.join(src, name))).convert("RGB")
    big = im.copy()
    big.thumbnail((960, 960))
    big.save(os.path.join(dst, f"{sid}.jpg"), quality=80, optimize=True, progressive=True)
    small = ImageOps.fit(im, (320, 240), method=Image.LANCZOS, centering=(0.5, 0.45))
    small.save(os.path.join(dst, f"{sid}-s.jpg"), quality=78, optimize=True, progressive=True)
    total += os.path.getsize(os.path.join(dst, f"{sid}.jpg")) + os.path.getsize(os.path.join(dst, f"{sid}-s.jpg"))
print(f"完成，共 {len(os.listdir(dst))} 个文件，{total / 1024:.0f} KB")
