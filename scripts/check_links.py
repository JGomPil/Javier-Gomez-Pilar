#!/usr/bin/env python3
"""Revisa los enlaces externos de la web y dice cuáles están rotos.

   python3 scripts/check_links.py            # informe en pantalla
   python3 scripts/check_links.py --md F     # ademas, informe en Markdown

Reúne los mismos enlaces que ve un visitante: los que están escritos en
index.html y en los dos JSON, los que se arman con un patrón (fichas de
UVaDOC, guías docentes, simuladores) y el DOI de cada publicación.

Solo cuenta como roto lo que lo está sin duda:

- un 404 o un 410 (la página ya no existe), y
- un DOI que doi.org no reconoce (404 o 400; pasa con un ISBN colado
  como DOI).

Lo demás —un 403 de una editorial que bloquea robots, un 5xx, una
conexión cortada— se apunta como «no comprobable» y no avisa. El Portal
de la Ciencia, por ejemplo, corta las conexiones desde GitHub: contarlo
como roto daría un aviso cada mes.

Sale con código 1 si hay algún enlace roto, para que el workflow lo vea,
y con 2 si algo falla por dentro.
Solo usa la biblioteca estándar.
"""
import concurrent.futures as cf
import json
import pathlib
import re
import ssl
import sys
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent

# Servidores que no contestan desde fuera de la UVa: no se revisan.
EXCLUIDOS = ("apps.stic.uva.es",)

UA = "Mozilla/5.0 (compatible; javiergomezpilar-site link check)"
TIMEOUT = 25

try:                                   # mismo truco que update_data.py
    import certifi
    SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL = ssl.create_default_context()


class SinRedireccion(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def recoge() -> dict[str, str]:
    """{url: de donde sale}"""
    c = json.loads((RAIZ / "data/content.json").read_text(encoding="utf-8"))
    p = json.loads((RAIZ / "data/profile.json").read_text(encoding="utf-8"))
    out: dict[str, str] = {}

    for t in c.get("tfgs", []):
        if t.get("uvadoc"):
            out[c["tfg_repo"]["patron"].format(id=t["uvadoc"])] = "UVaDOC"
    g = c.get("teaching_guides", {})
    for a in c.get("teaching", []):
        if a.get("guia") and g:
            out[g["patron"].format(curso=g["curso"], **a["guia"])] = "guía docente"
        if a.get("simulab"):
            out[c["simulab"]["patron"].format(sitio=a["simulab"])] = "simulador"
    for x in p.get("publications", []):
        doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", x.get("doi") or "",
                     flags=re.I)
        if doi:
            out.setdefault(f"https://doi.org/{doi}", "DOI · " + x["title"][:60])
        elif x.get("url"):
            out.setdefault(x["url"], "publicación · " + x["title"][:60])

    def recorre(v):
        if isinstance(v, dict):
            for w in v.values():
                recorre(w)
        elif isinstance(v, list):
            for w in v:
                recorre(w)
        elif isinstance(v, str):
            for u in re.findall(r"https?://[^\s\"'<>)]+", v):
                out.setdefault(u, "datos")
    recorre(c)
    recorre(p)
    html = (RAIZ / "index.html").read_text(encoding="utf-8")
    for u in re.findall(r'href="(https?://[^"]+)"', html):
        out.setdefault(u.replace("&amp;", "&"), "index.html")

    # Fuera las plantillas de los patrones ({id}, {curso}…), los propios
    # de la web y los servidores excluidos.
    return {u: o for u, o in out.items()
            if "{" not in u
            and "jgompil.github.io/Javier-Gomez-Pilar" not in u
            and not any(h in u for h in EXCLUIDOS)}


def estado(url: str) -> int:
    """Codigo HTTP final; 0 si no hubo respuesta."""
    es_doi = url.startswith("https://doi.org/")
    abre = (urllib.request.build_opener(SinRedireccion(),
                                        urllib.request.HTTPSHandler(context=SSL))
            if es_doi else
            urllib.request.build_opener(urllib.request.HTTPSHandler(context=SSL)))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for _ in range(2):                         # un reintento si no contesta
        try:
            with abre.open(req, timeout=TIMEOUT) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code
        except Exception:                      # noqa: BLE001
            continue
    return 0


def roto(url: str, codigo: int) -> bool:
    if url.startswith("https://doi.org/"):
        return codigo in (400, 404)
    return codigo in (404, 410)


def main() -> int:
    md = sys.argv[sys.argv.index("--md") + 1] if "--md" in sys.argv else None
    enlaces = recoge()
    print(f"Revisando {len(enlaces)} enlaces ...", flush=True)
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        codigos = dict(zip(enlaces, pool.map(estado, enlaces)))

    rotos = [(u, c) for u, c in codigos.items() if roto(u, c)]
    dudosos = [(u, c) for u, c in codigos.items()
               if not roto(u, c) and not (200 <= c < 400)]
    print(f"  {len(enlaces) - len(rotos) - len(dudosos)} bien, "
          f"{len(dudosos)} no comprobables, {len(rotos)} rotos")
    for u, c in sorted(dudosos):
        print(f"  ?  {c or 'sin respuesta'}  {u}")
    for u, c in sorted(rotos):
        print(f"  ✗  {c}  {u}  ({enlaces[u]})")

    if md:
        lineas = [f"- `{c}` {u} — {enlaces[u]}" for u, c in sorted(rotos)]
        pathlib.Path(md).write_text("\n".join(lineas) + "\n", encoding="utf-8")
    return 1 if rotos else 0


if __name__ == "__main__":
    # Un fallo inesperado sale con 2, no con 1: el workflow lee el 1
    # como "hay enlaces rotos" y abriria un aviso con la lista vacia.
    try:
        sys.exit(main())
    except Exception as exc:                   # noqa: BLE001
        print(f"check_links: fallo inesperado: {exc!r}", file=sys.stderr)
        sys.exit(2)
