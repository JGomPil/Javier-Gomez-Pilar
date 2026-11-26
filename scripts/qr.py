#!/usr/bin/env python3
"""El QR de la seccion Contacto, en SVG y con un solo trazo.

   pip install segno
   python3 scripts/qr.py            # la tarjeta entera, sin internet
   python3 scripts/qr.py vcf-url    # la direccion del .vcf
   python3 scripts/qr.py web        # la direccion de la web

Que lleva dentro cambia cuanto ocupa, y eso decide a que tamano hay
que ensenarlo:

  tarjeta corta    57x57 modulos   necesita unos 240 px o 4 cm impreso
  direccion .vcf   33x33           con 104 px sobra
  direccion web    33x33           con 104 px sobra

Con la tarjeta dentro, el telefono guarda el contacto sin conexion y
sin abrir ninguna pagina; con una direccion, el QR es diminuto pero
hace falta cobertura. El color no va dentro: el trazo es currentColor.
"""
import json
import pathlib
import sys

import segno

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "assets/img/qr.svg"
QUE = (sys.argv[1] if len(sys.argv) > 1 else "vcf").lower()

datos = json.loads((RAIZ / "data/content.json").read_text(encoding="utf-8"))
WEB = datos["contact_card"]["url"]

if QUE == "web":
    texto, rotulo, ecc = WEB, WEB, "m"
elif QUE == "vcf-url":
    texto = WEB + "assets/javier-gomez-pilar.vcf"
    rotulo, ecc = texto, "m"
else:
    # La tarjeta, pero recortada: nombre, cargo, organismo, correo y
    # web. Con el departamento, la direccion postal y el ORCID dentro,
    # el QR se va a 73 modulos y a tamano de pantalla deja de leerse;
    # con esto se queda en 57. Lo que falta esta en el .vcf, que es
    # adonde lleva el boton de al lado.
    c = datos["contact_card"]
    ui = datos["ui"]["es"]
    texto = "\r\n".join([
        "BEGIN:VCARD", "VERSION:3.0",
        "N:Gómez Pilar;Javier;;;", "FN:Javier Gómez Pilar",
        f"TITLE:{ui['hero.pos']}",
        f"ORG:{c['org']}",
        f"EMAIL;TYPE=INTERNET,WORK:{c['email']}",
        f"URL:{c['url']}",
        "END:VCARD",
    ]) + "\r\n"
    rotulo, ecc = "Javier Gómez Pilar", "l"

qr = segno.make(texto, error=ecc)
m = qr.matrix
n = len(m)

# Un rectangulo por modulo, pero fundiendo los seguidos de una fila:
# la mitad de trozos y la mitad de fichero.
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
    f'role="img" aria-label="{rotulo}">'
    f'<path fill="currentColor" d="{"".join(partes)}"/></svg>\n'
)
SALIDA.write_text(svg, encoding="utf-8")
print(f"{SALIDA}  ·  {QUE}  ·  {n}x{n} modulos  ·  {len(svg)} bytes")
