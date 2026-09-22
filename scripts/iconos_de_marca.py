# -*- coding: utf-8 -*-
"""[P1-PLAN-LOTE-163 · 2026-09-22] El icono de la app ES el de Bioboros.

La auditoría de la beta lo encontró al mirar el fichero: `AppIcon-512@2x.png` seguía siendo el de la plantilla de
Capacitor (la «X» azul sobre una rejilla) desde el primer build de iOS, y el lote 152 derivó de él los de Android.
Los testers habrían instalado una app con el logo de otro producto.

Este script construye el icono de iOS (1024×1024, sin transparencia: iOS pone él la máscara) desde la imagen de marca
`brand/favicon-source.png`, que es un cuadrado redondeado azul marino con esquinas NEGRAS: se rellenan con el mismo azul
para que el icono vaya a sangre. También rehace las pantallas de arranque de iOS. Los de Android los deriva después
`scripts/android_iconos.py` a partir de este mismo icono, para que las dos plataformas no puedan divergir.
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

RAIZ = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
MARCA = os.path.join(RAIZ, 'brand', 'favicon-source.png')
ICONO_IOS = os.path.join(RAIZ, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')
SPLASH_IOS = os.path.join(RAIZ, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset')

AZUL_MARCA = (1, 7, 29)      # el fondo del cuadrado de la marca (#01071D)
FONDO_APP = (11, 11, 11)     # el `backgroundColor` de capacitor.config.ts: sin destello al arrancar
PROPORCION_LOGO = 0.26


def icono_a_sangre() -> Image.Image:
    """La marca con las esquinas negras rellenas del azul: todo lo más oscuro que el azul pasa a ser el azul."""
    img = Image.open(MARCA).convert('RGB')
    px = img.load()
    umbral = sum(AZUL_MARCA)
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b = px[x, y]
            if r + g + b < umbral:
                px[x, y] = AZUL_MARCA
    return img.resize((1024, 1024), Image.LANCZOS)


def _esquinas_redondas(img: Image.Image, radio: int) -> Image.Image:
    mascara = Image.new('L', img.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radio, fill=255)
    fuera = Image.new('RGBA', img.size, (0, 0, 0, 0))
    fuera.paste(img.convert('RGBA'), (0, 0), mascara)
    return fuera


def main() -> int:
    if not os.path.exists(MARCA):
        print(f'ERROR: no encuentro la marca en {MARCA}')
        return 1
    icono = icono_a_sangre()
    icono.save(ICONO_IOS)          # RGB: el App Store rechaza iconos con canal alfa
    print(f'icono de iOS escrito: {ICONO_IOS}')

    hechos = 0
    for nombre in sorted(os.listdir(SPLASH_IOS)):
        if not nombre.lower().endswith('.png'):
            continue
        ruta = os.path.join(SPLASH_IOS, nombre)
        ancho, alto = Image.open(ruta).size
        lienzo = Image.new('RGB', (ancho, alto), FONDO_APP)
        lado = max(48, int(min(ancho, alto) * PROPORCION_LOGO))
        logo = _esquinas_redondas(icono.resize((lado, lado), Image.LANCZOS), int(lado * 0.22))
        lienzo.paste(logo, ((ancho - lado) // 2, (alto - lado) // 2), logo)
        lienzo.save(ruta)
        hechos += 1
    print(f'pantallas de arranque de iOS reescritas: {hechos}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
