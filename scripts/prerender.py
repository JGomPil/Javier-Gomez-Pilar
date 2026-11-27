#!/usr/bin/env python3
"""Escribe en index.html lo esencial de la web, para quien no ejecuta JS.

   python3 scripts/prerender.py

La pagina se pinta desde data/*.json con JavaScript. Google ejecuta
el JS, pero otros buscadores, los lectores de enlaces y los resumenes
de IA leen solo el HTML que llega, y ahi no habia mas que la cabecera.
Este script mete en el HTML, en espanol, lo que mas pesa:

- las líneas de investigación, con el mismo marcado que pinta site.js,
  asi que al cargar el JS las reemplaza sin que se note el cambio;
- un <noscript> con las cuatro cifras de la portada y los artículos de
  primer decil;
- un <noscript> con los proyectos.

Las cifras no se escriben en sus <dd> de la portada, aunque seria lo
natural: initCounters() las hace subir desde cero al verlas, y con un
valor ya puesto se veria "68", luego 0 y luego otra vez hasta 68.

Cada bloque va entre marcadores <!-- prerender:x --> y
<!-- /prerender:x -->. Fuera de ellos no toca nada, y si falta un
marcador se niega a escribir. Es idempotente: con los mismos datos
deja el fichero igual, que es lo que permite al cron de los lunes
saber si hay algo que publicar.

Nunca escribe el correo: no esta en el HTML a proposito (ver README).
"""
import html
import json
import pathlib
import re
import sys
from urllib.parse import quote

RAIZ = pathlib.Path(__file__).resolve().parent.parent
INDEX = RAIZ / "index.html"
CONTENT = RAIZ / "data/content.json"
PROFILE = RAIZ / "data/profile.json"


def esc(x) -> str:
    return html.escape(str(x if x is not None else ""), quote=True)


def num_es(n: int) -> str:
    """Como Intl.NumberFormat("es-ES"): punto de millares, pero solo a
    partir de cinco cifras (2037, 12.345). Asi no cambia el numero
    cuando el JS lo reescribe."""
    s = str(int(n))
    if len(s) < 5:
        return s
    return f"{int(n):,}".replace(",", ".")


def lineas(content: dict) -> str:
    out = []
    for i, line in enumerate(content["lines"], start=1):
        L = line["es"]
        senales = "".join(f"<li>{esc(s)}</li>" for s in line["signals"])
        out.append(
            "\n        <article class=\"line\">\n"
            f"          <span class=\"line-n\"><svg class=\"icon line-icon\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#i-line-{i}\"></use></svg><b>{i:02d}</b></span>\n"
            f"          <h3>{esc(L['title'])}</h3>\n"
            f"          <p>{esc(L['text'])}</p>\n"
            f"          <ul class=\"signals\">{senales}</ul>\n"
            "        </article>"
        )
    return "".join(out)


# Lo que encodeURI() deja sin escapar, ademas de letras y cifras.
ENCODE_URI = ";,/?:@&=+$!*'()#"


def primer_decil(content: dict, profile: dict) -> str:
    pubs = [p for p in profile["publications"]
            if p.get("kind") == "journal" and p.get("top_decile")]
    pubs.sort(key=lambda p: (p.get("year") or 0, p.get("month") or 0),
              reverse=True)
    items = []
    for p in pubs:
        # Igual que doiLimpio() en site.js: el GIB da unos DOI con
        # https://doi.org/ delante y otros sin el.
        doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", p.get("doi") or "",
                     flags=re.I)
        enlace = f"https://doi.org/{quote(doi, safe=ENCODE_URI)}" if doi \
            else (p.get("url") or "")
        titulo = esc(p["title"])
        if enlace:
            titulo = f"<a href=\"{esc(enlace)}\">{titulo}</a>"
        items.append(
            f"<li>{titulo}. <i>{esc(p.get('journal'))}</i>, {esc(p.get('year'))}.</li>"
        )
    c = cifras(content, profile)
    resumen = (f"{c['jcr']} artículos en revistas JCR, {c['q1']} de ellos en "
               "el primer cuartil")
    if "citations" in c and "h" in c:
        resumen += (f"; {c['citations']} citas e índice h {c['h']} "
                    "en Web of Science")
    return (
        f"\n          <p>{esc(resumen)}.</p>"
        f"\n          <h3>Artículos en revistas del primer decil ({len(pubs)})</h3>"
        "\n          <ol>\n            "
        + "\n            ".join(items)
        + "\n          </ol>\n        "
    )


# Las mismas etiquetas que pone site.js en la lista de proyectos.
ROL = {"ip": "Investigador principal", "co-ip": "co-IP · coordinador"}


def proyectos(content: dict) -> str:
    ps = sorted(content["projects"], key=lambda p: (str(p["from"]), str(p["to"])),
                reverse=True)
    items = []
    for p in ps:
        nombre = esc(p["es"]["title"])
        sigla = p.get("acronym")
        if sigla and not p["es"]["title"].upper().startswith(sigla.upper()):
            nombre = f"{esc(sigla)}: {nombre}"
        partes = [esc(p.get("funder")), f"{esc(p['from'])}–{esc(p['to'])}"]
        if p.get("role") in ROL:
            partes.append(ROL[p["role"]])
        elif p.get("role") == "director":
            partes.append(content["ui"]["es"]["proj.director"])
        items.append(f"<li>{nombre} · {' · '.join(x for x in partes if x)}</li>")
    return (
        f"\n          <h3>Proyectos de investigación ({len(ps)})</h3>"
        "\n          <ul>\n            "
        + "\n            ".join(items)
        + "\n          </ul>\n        "
    )


def cifras(content: dict, profile: dict) -> dict:
    m = profile["metrics"]
    wos = m.get("wos") or content.get("wos") or {}
    out = {
        "jcr": num_es(m["jcr_articles"]),
        "q1": num_es(m["quartiles"].get("Q1", 0)),
    }
    if wos.get("citations") is not None:
        out["citations"] = num_es(wos["citations"])
    if wos.get("h_index") is not None:
        out["h"] = num_es(wos["h_index"])
    return out


def sustituye(texto: str, nombre: str, nuevo: str) -> str:
    patron = re.compile(
        rf"(<!-- prerender:{nombre} -->)(.*?)(<!-- /prerender:{nombre} -->)", re.S)
    if len(patron.findall(texto)) != 1:
        sys.exit(f"prerender: falta el marcador '{nombre}' en index.html "
                 "(o esta repetido). No se escribe nada.")
    return patron.sub(lambda mt: mt.group(1) + nuevo + mt.group(3), texto)


def main() -> int:
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    antes = INDEX.read_text(encoding="utf-8")

    texto = sustituye(antes, "lines", lineas(content))
    texto = sustituye(texto, "d1", primer_decil(content, profile))
    texto = sustituye(texto, "projects", proyectos(content))

    if texto == antes:
        print("prerender: index.html ya estaba al dia.")
        return 0
    INDEX.write_text(texto, encoding="utf-8")
    print("prerender: index.html actualizado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
