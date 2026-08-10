# -*- coding: utf-8 -*-
"""[P1-LIGHT-INK-CONTRACT · 2026-08-10] Aplana el fondo del dashboard.

El fondo aqua no es CSS: es un raster pintado al 85% de opacidad
(DashboardLayout.module.css:25-48), y por eso ningún grep de color lo
encontraba.

Su defecto medido no es que sea fuerte, es que SALTA 33,8 L* dentro de la misma
pantalla — manchas moradas de #7176AA junto a zonas de #E2F7EC casi blancas.
Como la barra lateral y el encabezado son traslúcidos, su legibilidad dependía
de qué mancha les tocara detrás: el texto de navegación medía 2,05:1 sobre la
zona más clara.

Se descartó bajar la opacidad, que era la solución intuitiva y la primera que
se propuso: ataca a la vez el salto y el color, y por eso se lleva el aqua por
delante (saturación media 0,200 -> 0,054) además de EMPEORAR la separación de
las tarjetas (5,5 -> 2,9 L*).

Comprimir solo la LUMINOSIDAD conservando la cromaticidad quita los grumos y
deja el color intacto: variación 33,8 -> ~10 L*, separación de la tarjeta
5,5 -> ~10, saturación 0,200 -> 0,169.

Se escala en luz lineal (los tres canales por el mismo factor), que es la
operación que preserva la cromaticidad.

Uso:  conda activate mealfit && cd frontend && python scripts/flatten-dashboard-bg.py
"""
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
PUBLIC = AQUI.parent / "public"
ORIGEN = PUBLIC / "dashboard_bg.webp"
K = 0.30  # factor de compresión de L* hacia la mediana
LIENZO = (248, 250, 252)  # el #f8fafc de .container, debajo del raster
OPACIDAD = 0.85           # la del ::before


def a_lineal(v):
    c = v / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def a_srgb(c):
    c = max(0.0, min(1.0, c))
    return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)


def luminancia(px):
    return 0.2126 * a_lineal(px[0]) + 0.7152 * a_lineal(px[1]) + 0.0722 * a_lineal(px[2])


def lstar(y):
    return y * 24389 / 27 if y <= 216 / 24389 else y ** (1 / 3) * 116 - 16


def y_de_lstar(luz):
    return luz * 27 / 24389 if luz <= 8 else ((luz + 16) / 116) ** 3


def saturacion(px):
    mx, mn = max(px), min(px)
    return 0 if mx == 0 else (mx - mn) / mx


def rejilla(pix, w, h, n=40):
    return [pix[int(w * x / n), int(h * y / n)] for y in range(1, n) for x in range(1, n)]


def compuesto(px):
    return tuple(px[i] * OPACIDAD + LIENZO[i] * (1 - OPACIDAD) for i in range(3))


def percentil(vals, p):
    s = sorted(vals)
    return s[min(len(s) - 1, int(len(s) * p / 100))]


img = Image.open(ORIGEN).convert("RGB")
W, H = img.size
pix_o = img.load()

muestras_o = rejilla(pix_o, W, H)
ancla = percentil([lstar(luminancia(p)) for p in muestras_o], 50)
sat_antes = sum(saturacion(compuesto(p)) for p in muestras_o) / len(muestras_o)
ls_antes = [lstar(luminancia(compuesto(p))) for p in muestras_o]
var_antes = percentil(ls_antes, 95) - percentil(ls_antes, 5)
sep_antes = 100 - percentil(ls_antes, 95)

print(f"origen {W}x{H} · mediana L* {ancla:.1f} · comprimiendo con k={K}")
print(f"ANTES  variacion {var_antes:.1f} L* · separacion tarjeta {sep_antes:.1f} L* · saturacion {sat_antes:.3f}")

destino = Image.new("RGB", (W, H))
pix_d = destino.load()
for y in range(H):
    for x in range(W):
        px = pix_o[x, y]
        lum = luminancia(px)
        objetivo = y_de_lstar(ancla + (lstar(lum) - ancla) * K)
        f = 1.0 if lum <= 1e-6 else objetivo / lum
        pix_d[x, y] = tuple(round(a_srgb(a_lineal(px[i]) * f)) for i in range(3))

muestras_d = rejilla(pix_d, W, H)
sat_despues = sum(saturacion(compuesto(p)) for p in muestras_d) / len(muestras_d)
ls_despues = [lstar(luminancia(compuesto(p))) for p in muestras_d]
var_despues = percentil(ls_despues, 95) - percentil(ls_despues, 5)
sep_despues = 100 - percentil(ls_despues, 95)

print(f"DESPUES variacion {var_despues:.1f} L* · separacion tarjeta {sep_despues:.1f} L* · saturacion {sat_despues:.3f}")

# Si el aplanado no cumple, NO se escribe el archivo: mejor abortar que dejar un
# raster peor que el original creyendo que se arreglo algo.
assert var_despues <= 12, f"la variacion sigue en {var_despues:.1f} L* (objetivo <= 12): sube K"
assert sep_despues >= 4, f"la tarjeta quedo a {sep_despues:.1f} L* del fondo (objetivo >= 4)"
assert sat_despues >= sat_antes * 0.85, (
    f"la saturacion cayo de {sat_antes:.3f} a {sat_despues:.3f}: el aqua se esta diluyendo, "
    "que es justo lo que este metodo existe para evitar"
)

destino.save(PUBLIC / "dashboard_bg_v2.webp", "WEBP", quality=88, method=6)
destino.save(PUBLIC / "dashboard_bg_v2.png", "PNG", optimize=True)
kb = (PUBLIC / "dashboard_bg_v2.webp").stat().st_size / 1024
print(f"escritos dashboard_bg_v2.webp ({kb:.1f} KB) y dashboard_bg_v2.png")
