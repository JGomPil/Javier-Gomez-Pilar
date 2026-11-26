#!/usr/bin/env python3
"""El retrato de la tarjeta, recortado sobre la cara.

   python3 scripts/recorta_og.py

El original es un recorte de 800x800 con fondo transparente en el que
la cabeza va de y=110 a y=540 y su centro esta en x=378 (medido sobre
el canal alfa). Encuadrar eso con porcentajes de CSS salia mal: en la
tarjeta compartida el circulo cortaba la coronilla. Asi que el
encuadre se hace aqui, de una vez, y el CSS solo estira la imagen.
"""
import pathlib
from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets/img/javier.png"
SALIDA = RAIZ / "assets/img/retrato-tarjeta.png"

LADO = 660          # la cabeza ocupa asi dos tercios del circulo
CENTRO_X = 378      # centro de la cabeza
ARRIBA = 50         # aire sobre la coronilla, que esta en y=110

im = Image.open(ORIGEN)
caja = (CENTRO_X - LADO // 2, ARRIBA, CENTRO_X - LADO // 2 + LADO, ARRIBA + LADO)
im.crop(caja).resize((600, 600), Image.LANCZOS).save(SALIDA)
print(f"{SALIDA}  ·  recorte {caja}")
