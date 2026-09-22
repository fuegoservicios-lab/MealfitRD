# -*- coding: utf-8 -*-
"""[P1-PLAN-LOTE-152] Deriva los iconos de Android del icono de iOS. Ver scripts/android-iconos.mjs."""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

RAIZ = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
ORIGEN = os.path.join(RAIZ, 'ios', 'App', 'App', 'Assets.xcassets',
                      'AppIcon.appiconset', 'AppIcon-512@2x.png')
RES = os.path.join(RAIZ, 'android', 'app', 'src', 'main', 'res')

# densidad -> lado en px del icono legado (48 dp) y del adaptativo (108 dp)
DENSIDADES = {
    'mdpi': (48, 108),
    'hdpi': (72, 162),
    'xhdpi': (96, 216),
    'xxhdpi': (144, 324),
    'xxxhdpi': (192, 432),
}
# Zona segura del icono adaptativo: el sistema recorta hasta 18 dp por lado.
#
# [P1-PLAN-LOTE-163 · 2026-09-22] 0,62 → 1,0. Con el logo de Capacitor (un dibujo que llenaba casi todo el cuadro) había
# que encogerlo; el icono de Bioboros es un fondo A SANGRE con el brote en el ~49 % central, así que a lienzo completo
# el brote cae en ~53 dp de 108: dentro de los 66 dp de la zona segura. Encogerlo pintaría un cuadrado azul flotando
# sobre el color de fondo del adaptativo, que ahora es el mismo azul (`values/ic_launcher_background.xml`).
PROPORCION_SEGURA = 1.0


def _redondo(img: Image.Image) -> Image.Image:
    mascara = Image.new('L', img.size, 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
    fuera = Image.new('RGBA', img.size, (0, 0, 0, 0))
    fuera.paste(img, (0, 0), mascara)
    return fuera


def main() -> int:
    if not os.path.exists(ORIGEN):
        print(f'ERROR: no encuentro el icono de iOS en {ORIGEN}')
        return 1
    base = Image.open(ORIGEN).convert('RGBA')
    escritos = 0
    for densidad, (legado, adaptativo) in DENSIDADES.items():
        carpeta = os.path.join(RES, f'mipmap-{densidad}')
        os.makedirs(carpeta, exist_ok=True)

        cuadrado = base.resize((legado, legado), Image.LANCZOS)
        cuadrado.save(os.path.join(carpeta, 'ic_launcher.png'))
        _redondo(cuadrado).save(os.path.join(carpeta, 'ic_launcher_round.png'))

        # Capa de delante: el dibujo centrado dentro del lienzo de 108 dp, al 62 %.
        lienzo = Image.new('RGBA', (adaptativo, adaptativo), (0, 0, 0, 0))
        lado = int(adaptativo * PROPORCION_SEGURA)
        dibujo = base.resize((lado, lado), Image.LANCZOS)
        margen = (adaptativo - lado) // 2
        lienzo.paste(dibujo, (margen, margen), dibujo)
        lienzo.save(os.path.join(carpeta, 'ic_launcher_foreground.png'))
        escritos += 3
    print(f'iconos de Android escritos: {escritos} ({len(DENSIDADES)} densidades)')
    splashes(base)
    return 0


# ---------------------------------------------------------------------------------------------------
# [P1-PLAN-LOTE-152] La pantalla de arranque. La plantilla deja el logo de Capacitor sobre blanco, y
# eso es lo PRIMERO que ve un tester al abrir la app. Se sustituye por el icono de la marca sobre el
# mismo negro que `backgroundColor` de capacitor.config.ts: si el arranque fuera blanco y el WebView
# negro, cada apertura daría un destello.
FONDO = (11, 11, 11)
PROPORCION_LOGO = 0.26   # del lado MENOR, para que en apaisado no ocupe media pantalla


def _esquinas_redondas(img, radio):
    mascara = Image.new('L', img.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radio, fill=255)
    fuera = Image.new('RGBA', img.size, (0, 0, 0, 0))
    fuera.paste(img, (0, 0), mascara)
    return fuera


def splashes(base):
    import glob
    hechos = 0
    for ruta in sorted(glob.glob(os.path.join(RES, 'drawable*', 'splash.png'))):
        ancho, alto = Image.open(ruta).size
        lienzo = Image.new('RGB', (ancho, alto), FONDO)
        lado = max(48, int(min(ancho, alto) * PROPORCION_LOGO))
        logo = _esquinas_redondas(base.resize((lado, lado), Image.LANCZOS), int(lado * 0.22))
        lienzo.paste(logo, ((ancho - lado) // 2, (alto - lado) // 2), logo)
        lienzo.save(ruta)
        hechos += 1
    print(f'pantallas de arranque reescritas: {hechos}')


if __name__ == "__main__":
    sys.exit(main())
