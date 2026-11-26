#!/usr/bin/env python3
"""La tarjeta de contacto, como fichero.

   python3 scripts/vcf.py

Se armaba en el navegador, con un blob, y habia navegadores que se
tragaban la descarga sin decir nada —Safari y el iPhone, sobre todo—.
Un .vcf de verdad en el servidor lo abre cualquiera: el telefono
ensena directamente la ficha de contacto y pregunta si se guarda.

Los datos siguen saliendo de content.json, asi que la unica copia que
hay que rehacer al cambiar el cargo o el departamento es esta, con un
comando.
"""
import json
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((RAIZ / "data/content.json").read_text(encoding="utf-8"))
c = d["contact_card"]
ui = d["ui"]["es"]


def esc(x):
    return (str(x or "").replace("\\", r"\\")
            .replace(",", r"\,").replace(";", r"\;"))


lineas = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Gómez Pilar;Javier;;;",
    "FN:Javier Gómez Pilar",
    f"TITLE:{esc(ui['hero.pos'])}",
    f"ORG:{esc(c['org'])};{esc(ui['contact.dept'])}",
    f"EMAIL;TYPE=INTERNET,WORK:{c['email']}",
    f"ADR;TYPE=WORK:;;{esc(c['street'])};{esc(c['city'])};;"
    f"{esc(c['zip'])};{esc(c['country'])}",
    f"URL:{c['url']}",
    f"NOTE:ORCID {c['orcid']} · {esc(ui['hero.group'])} · CIBER-BBN",
    "END:VCARD",
]

# Plegado a 75 octetos, que lo pide la norma
plegadas = []
for l in lineas:
    b = l.encode("utf-8")
    if len(b) <= 73:
        plegadas.append(l)
        continue
    trozo, resto = b[:73], b[73:]
    # no partir un caracter por la mitad
    while trozo and resto and (resto[0] & 0xC0) == 0x80:
        resto = bytes([trozo[-1]]) + resto
        trozo = trozo[:-1]
    partes = [trozo.decode("utf-8")]
    while resto:
        t, resto = resto[:72], resto[72:]
        while t and resto and (resto[0] & 0xC0) == 0x80:
            resto = bytes([t[-1]]) + resto
            t = t[:-1]
        partes.append(" " + t.decode("utf-8"))
    plegadas.append("\r\n".join(partes))

salida = RAIZ / "assets/javier-gomez-pilar.vcf"
salida.write_bytes(("\r\n".join(plegadas) + "\r\n").encode("utf-8"))
print(f"{salida}  ·  {salida.stat().st_size} bytes")
