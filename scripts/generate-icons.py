"""Rasterize the simple app icon system at Android / iOS PWA sizes."""
from PIL import Image, ImageDraw
from pathlib import Path

destination = Path(__file__).resolve().parents[1] / 'public' / 'icons'
destination.mkdir(parents=True, exist_ok=True)
for app in ['icon', 'picker', 'kitchen']:
    scale = 4
    image = Image.new('RGB', (512*scale, 512*scale), {'icon':'#f7f6f2','picker':'#eae5f4','kitchen':'#f9e9da'}[app])
    draw = ImageDraw.Draw(image)
    def box(bounds): return tuple(int(value*scale) for value in bounds)
    if app == 'icon':
        for x,y,color in [(128,128,'#a99acb'),(268,128,'#e9a389'),(128,268,'#a3bfac'),(268,268,'#e4c777')]:
            draw.rounded_rectangle(box((x,y,x+116,y+116)),radius=34*scale,fill=color)
    elif app == 'picker':
        draw.ellipse(box((115,130,397,412)),fill='white')
        for start,color in [(270,'#f3b2a1'),(0,'#e8cc82'),(90,'#a7c7b3'),(180,'#b5a3d5')]:
            draw.pieslice(box((125,140,387,402)),start,start+90,fill=color,outline='white',width=5*scale)
        draw.ellipse(box((219,234,293,308)),fill='#fff9e9',outline='white',width=9*scale)
        draw.polygon([(234*scale,108*scale),(256*scale,166*scale),(278*scale,108*scale)],fill='#957caf')
    else:
        draw.pieslice(box((120,102,392,394)),0,180,fill='white')
        draw.line([(180*scale,404*scale),(332*scale,404*scale)],fill='#c58f64',width=15*scale)
        for x in [203,255,308]:
            points=[(x*scale,204*scale),((x-8)*scale,184*scale),((x+8)*scale,167*scale),(x*scale,127*scale)]
            draw.line(points,fill='#c58f64',width=13*scale,joint='curve')
    for size in [192,512]:
        image.resize((size,size),Image.Resampling.LANCZOS).save(destination / f'{app}-{size}.png')
print('Six PWA icons generated.')
