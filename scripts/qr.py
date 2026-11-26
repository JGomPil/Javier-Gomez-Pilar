#!/usr/bin/env python3
"""El QR de la seccion Contacto, en SVG y con un solo trazo.

   pip install segno && python3 scripts/qr.py

El color no va dentro: el trazo es currentColor, asi que el QR cambia
con el tema de la pagina como cualquier otro texto. El contenido es la
direccion de la web, no la tarjeta entera: la web no caduca y lleva
dentro la tarjeta, los perfiles y los dos PDF.
"""
import pathlib
import segno

URL = "https://jgompil.github.io/Javier-Gomez-Pilar/"
SALIDA = pathlib.Path(__file__).resolve().parent.parent / "assets/img/qr.svg"

qr = segno.make(URL, error="m")
m = [list(fila) for fila in qr.matrix]
n = len(m)

# Un rectangulo por modulo, pero fundiendo los seguidos en la misma
# fila: menos de la mitad de trozos y el fichero baja a la mitad.
partes = []
for y, fila in enumerate(m):
    x = 0
    while x < n:
        if fila[x]:
            ini = x
            while x < n and fila[x]:
                x += 1
            partes.append(f"M{ini} {y}h{x - ini}v1h-{x - ini}z")
        else:
            x += 1

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 {n + 4} {n + 4}" '
    f'role="img" aria-label="{URL}">'
    f'<path fill="currentColor" d="{"".join(partes)}"/></svg>\n'
)
SALIDA.write_text(svg, encoding="utf-8")
print(f"{SALIDA}  ·  {n}x{n} modulos  ·  {len(svg)} bytes")
