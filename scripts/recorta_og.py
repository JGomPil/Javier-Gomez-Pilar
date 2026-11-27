#!/usr/bin/env python3
"""El retrato de la tarjeta, recortado sobre la cara.

   python3 scripts/recorta_og.py

El original es un recorte de 800x800 con fondo transparente, guardado
en fuentes/javier-original.png (privado: la web sirve una copia WebP
de 600 px, assets/img/javier.webp). En el original la cabeza va de y=110 a y=540 y su centro esta en x=378 (medido sobre
el canal alfa). Encuadrar eso con porcentajes de CSS salia mal: en la
tarjeta compartida el circulo cortaba la coronilla. Asi que el
encuadre se hace aqui, de una vez, y el CSS solo estira la imagen.
"""
import pathlib
from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "fuentes/javier-original.png"
# Pieza intermedia: solo la usa scripts/og-card.html para componer la
# tarjeta, y esta en .gitignore. Se regenera antes de cada captura.
SALIDA = RAIZ / "scripts/retrato-tarjeta.png"

LADO = 660          # la cabeza ocupa asi dos tercios del circulo
CENTRO_X = 378      # centro de la cabeza
ARRIBA = 50         # aire sobre la coronilla, que esta en y=110

im = Image.open(ORIGEN)
caja = (CENTRO_X - LADO // 2, ARRIBA, CENTRO_X - LADO // 2 + LADO, ARRIBA + LADO)
im.crop(caja).resize((600, 600), Image.LANCZOS).save(SALIDA)
print(f"{SALIDA}  ·  recorte {caja}")
