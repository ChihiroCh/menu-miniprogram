"""Reproducible, local recipe illustrations; requires Pillow only to regenerate."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math

out = Path(__file__).resolve().parents[1] / 'apps/server/prisma/assets'
out.mkdir(parents=True, exist_ok=True)
S = 2
def make(kind, bg, plate):
    rng = random.Random(kind)
    im = Image.new('RGB', (640*S, 440*S), bg)
    d = ImageDraw.Draw(im)
    def ell(box, fill, outline=None, width=1): d.ellipse(tuple(int(x*S) for x in box), fill, outline, width=width*S)
    def line(points, fill, width): d.line([(int(x*S),int(y*S)) for x,y in points],fill,width=width*S)
    def polygon(points, fill): d.polygon([(int(x*S),int(y*S)) for x,y in points],fill)
    # Linen table, ceramic plate, warm shadow.
    for x in range(0,640,4): line([(x,0),(x,440)],tuple(max(0,c-2) for c in bg),1)
    shadow = Image.new('RGBA', im.size); sd=ImageDraw.Draw(shadow)
    sd.ellipse((137*S,38*S,534*S,416*S),fill=(57,65,34,40)); shadow=shadow.filter(ImageFilter.GaussianBlur(14*S)); im=Image.alpha_composite(im.convert('RGBA'),shadow).convert('RGB');d=ImageDraw.Draw(im)
    ell((128,25,512,409),plate)
    ell((145,42,495,392),tuple(max(0,c-12) for c in plate))
    ell((151,48,489,386),tuple(min(255,c+2) for c in plate))
    ell((170,67,470,367),(235,225,194) if kind!='soup' else (214,182,109))
    if kind == 'tomato':
        for _ in range(32):
            x,y=rng.uniform(210,400),rng.uniform(110,300); r=rng.randint(15,34)
            polygon([(x-r,y-8),(x-7,y-r),(x+r,y-3),(x+r-3,y+17),(x-5,y+r)],rng.choice(['#f2cc70','#f8db88','#eeb755']))
        for _ in range(15):
            x,y=rng.uniform(211,404),rng.uniform(112,300); r=rng.randint(18,31)
            polygon([(x-r,y),(x+r,y-18),(x+15,y+20),(x-8,y+r)],rng.choice(['#d96642','#e67b49','#d65e3b']))
            line([(x-r+6,y+2),(x+11,y-9)],'#f6a76b',3)
    elif kind == 'greens':
        for _ in range(30):
            x,y=rng.uniform(206,407),rng.uniform(105,310)
            ell((x-22,y-18,x+27,y+26),rng.choice(['#768c4e','#8aa159','#a3b16a','#617f44']))
            line([(x-8,y+22),(x+12,y-12)],'#c1cd96',3)
    elif kind == 'soup':
        for _ in range(25):
            x,y=rng.uniform(205,420),rng.uniform(100,319)
            ell((x-19,y-12,x+16,y+10),rng.choice(['#e4d6aa','#eee2bc','#b99461']))
        for _ in range(9):
            x,y=rng.uniform(217,404),rng.uniform(120,300)
            ell((x-18,y-18,x+18,y+18),'#edc45d');ell((x-13,y-13,x+13,y+13),'#f8da7b')
    elif kind == 'rice':
        ell((201,97,442,334),'#eee9d4')
        for _ in range(170):
            x,y=rng.uniform(212,432),rng.uniform(110,325)
            if ((x-322)/106)**2+((y-217)/106)**2<1: ell((x,y,x+8,y+3),rng.choice(['#fbf6e5','#e3ddc6','#fffbee']))
        for _ in range(25):
            x,y=rng.uniform(240,400),rng.uniform(135,290);ell((x,y,x+7,y+7),rng.choice(['#dd9858','#8b9a59']))
    elif kind == 'chicken':
        for _ in range(34):
            x,y=rng.uniform(210,409),rng.uniform(108,309)
            polygon([(x-13,y-13),(x+15,y-10),(x+18,y+17),(x-15,y+19)],rng.choice(['#bb7845','#ce955e','#d7a16c','#ab663b']))
        for _ in range(17):
            x,y=rng.uniform(210,410),rng.uniform(120,300);ell((x-7,y-5,x+7,y+5),'#e7c191')
    else:
        for _ in range(23):
            x,y=rng.uniform(208,410),rng.uniform(110,307)
            polygon([(x-18,y-15),(x+23,y-10),(x+18,y+22),(x-20,y+16)],rng.choice(['#e5bc79','#e8c68f','#dba969']))
            line([(x-13,y-10),(x+17,y-6)],'#f3d7a6',3)
    # Scallions and sesame, plus herbs outside the plate.
    for _ in range(24):
        x,y=rng.uniform(215,408),rng.uniform(115,300);line([(x,y),(x+6,y+3)],rng.choice(['#65894b','#8fa667','#b0be81']),3)
    for _ in range(12):
        x,y=rng.uniform(230,400),rng.uniform(130,290);ell((x,y,x+3,y+2),'#eee1b6')
    line([(530,80),(535,350)],'#9a805a',5);line([(545,80),(547,350)],'#b29a72',5)
    for i in range(4):
        x,y=80+i*8,280-i*24;ell((x-17,y-19,x+9,y+13),['#8f9d6a','#a0ac7e'][i%2]);line([(80,340),(x,y)],'#abb48d',2)
    im.resize((640,440),Image.Resampling.LANCZOS).save(out / f'{kind}.png',optimize=True)
for i,kind in enumerate(['tomato','greens','soup','rice','chicken','tofu']):
    make(kind,[(230,229,212),(224,230,213),(235,225,207),(229,224,208),(227,222,202),(229,228,213)][i],(250,248,238))
