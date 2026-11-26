#!/usr/bin/env python3
"""
Regenerate data/profile.json from public sources.

Sources, all free and keyless:
  * GIB-UVa publication list  -> JCR article list + JIF quartile per article
  * OpenAlex                  -> citations, h-index, i10, citations per year
  * ORCID                     -> cross-check of the most recent indexed work

Run locally with:  python3 scripts/update_data.py
Runs weekly in CI: .github/workflows/update-data.yml

Only the Python standard library is used, so CI needs no pip install.
"""

from __future__ import annotations

import html
import json
import os
import re
import ssl
import unicodedata
from collections import Counter
from itertools import combinations
from difflib import SequenceMatcher
import sys
import time
from urllib.parse import quote
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:  # Only needed on machines whose Python has no system CA bundle.
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

# --- configuration -----------------------------------------------------------

GIB_AUTHOR_ID = "139"
OPENALEX_AUTHOR_IDS = ["A5028137676", "A5159625863"]  # main profile + duplicate
ORCID = "0000-0001-7882-7890"
RESEARCHER_ID = "B-9123-2018"   # ResearcherID de Web of Science

GIB_QUERY = (
    "https://gib.uva.es/publications"
    "?from-year=2004&to-year=2027"
    f"&filter-author%5B%5D={GIB_AUTHOR_ID}"
)
# Las seis categorias del filtro de GIB, en el orden en que importan.
# La clave es el parametro de su formulario; el valor, el tipo que guardamos.
GIB_CATEGORIES = {
    "category_journal":          "journal",
    "category_book":             "book",
    "category_inter_conference": "conf_int",
    "category_nat_conference":   "conf_nat",
    "category_teaching":         "conf_teach",
    "category_non_journal":      "journal_other",
}
# Solo los articulos indexados cuentan como "papers" en la cifra principal.
GIB_BASE = f"{GIB_QUERY}&category_journal=on"

USER_AGENT = "javiergomezpilar-site/1.0 (static site data build; +https://github.com/)"
TIMEOUT = 45

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "profile.json"

MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}


# --- helpers -----------------------------------------------------------------

def fetch(url: str, accept: str = "*/*", headers: dict | None = None) -> str:
    all_headers = {"User-Agent": USER_AGENT, "Accept": accept}
    if headers:
        all_headers.update(headers)
    req = urllib.request.Request(url, headers=all_headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_json(url: str, headers: dict | None = None) -> dict:
    return json.loads(fetch(url, accept="application/json", headers=headers))


def strip_tags(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", "", fragment)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


# --- GIB: the authoritative JCR article list --------------------------------

ENTRY_RE = re.compile(r"<div align='justify'>(.*?)</div>", re.S)
YEAR_RE = re.compile(r"<h2>(\d{4})</h2>")
CITE_RE = re.compile(r"<cite>(.*?)</cite>", re.S)
JOURNAL_RE = re.compile(r"<font class='link-journal'>(.*?)</font>", re.S)
DOI_RE = re.compile(r"href='https://doi\.org/([^']+)'")
LINK_RE = re.compile(r"href='(https?://(?!doi\.org)[^']+)'[^>]*>\s*Enlace")
VOL_RE = re.compile(r"\bvol\.\s*([^,]+)")
PAGES_RE = re.compile(r"\bpp\.\s*([^,]+)")


def normalise_doi(doi: str) -> str:
    return doi.strip().rstrip(".").lower()


def parse_gib(page: str, kind: str = "journal") -> list[dict]:
    """Parse the GIB list into publication records, tagged with year and kind."""
    # Split the page into year blocks so each entry inherits the right <h2> year.
    blocks = YEAR_RE.split(page)
    publications: list[dict] = []

    # blocks == [preamble, year, body, year, body, ...]
    for i in range(1, len(blocks) - 1, 2):
        year = int(blocks[i])
        for raw in ENTRY_RE.findall(blocks[i + 1]):
            cite = CITE_RE.search(raw)
            if not cite:
                continue

            title = strip_tags(cite.group(1))
            authors = strip_tags(raw[: cite.start()]).rstrip(",").strip()

            journal_match = JOURNAL_RE.search(raw)
            journal = strip_tags(journal_match.group(1)) if journal_match else ""

            # Everything after the journal holds volume, pages and month.
            tail = strip_tags(raw[journal_match.end():]) if journal_match else ""
            vol = VOL_RE.search(tail)
            pages = PAGES_RE.search(tail)

            month = 0
            for name, number in MONTHS.items():
                if re.search(rf"\b{name}\b", tail, re.I):
                    month = number
                    break

            doi_match = DOI_RE.search(raw)
            link_match = LINK_RE.search(raw)

            publications.append({
                "kind": kind,
                "year": year,
                "month": month,
                "title": title,
                "authors": authors,
                "journal": journal,
                "volume": vol.group(1).strip() if vol else "",
                "pages": pages.group(1).strip() if pages else "",
                "doi": normalise_doi(doi_match.group(1)) if doi_match else "",
                "url": link_match.group(1) if link_match else "",
                "quartile": "",
                "top_decile": False,
            })

    return publications


def normalise_name(name: str) -> str:
    """Nombre reducido a letras sin acentos, para comparar variantes."""
    plain = unicodedata.normalize("NFKD", name)
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    return re.sub(r"[^a-z ]", "", plain.lower()).strip()


SELF_NAMES = {
    normalise_name(n) for n in (
        "Javier Gomez-Pilar", "Javier Gomez Pilar", "J. Gomez-Pilar",
        "Gomez-Pilar J", "Javier Gómez-Pilar",
    )
}


def is_self(name: str) -> bool:
    return normalise_name(name) in SELF_NAMES


def collaboration(publications: list[dict], min_works: int = 5,
                  min_shared: int = 2) -> dict:
    """Red de coautoria calculada sobre las publicaciones propias.

    El autor del perfil queda fuera a proposito: aparece en todas las
    entradas, asi que incluirlo convierte el grafo en una estrella y tapa
    lo interesante, que es que sus colaboradores se agrupan por lineas.

    Un nodo por coautor con al menos `min_works` trabajos compartidos; una
    arista por cada par que coincide en al menos `min_shared`.
    """
    works: Counter[str] = Counter()
    pairs: Counter[tuple[str, str]] = Counter()
    display: dict[str, str] = {}

    for pub in publications:
        people = [a.strip() for a in pub["authors"].split(",") if a.strip()]
        others = [a for a in people if not is_self(a)]

        keys = set()
        for person in others:
            key = normalise_name(person)
            if not key:
                continue
            works[key] += 1
            # Guarda la grafia mas larga: suele ser la mas completa.
            if len(person) > len(display.get(key, "")):
                display[key] = person
            keys.add(key)

        for a, b in combinations(sorted(keys), 2):
            pairs[(a, b)] += 1

    kept = {k for k, n in works.items() if n >= min_works}
    nodes = sorted(kept, key=lambda k: (-works[k], display[k]))
    index = {k: i for i, k in enumerate(nodes)}

    return {
        "threshold": min_works,
        "total_coauthors": len(works),
        "nodes": [{"name": display[k], "works": works[k]} for k in nodes],
        "links": [
            {"source": index[a], "target": index[b], "weight": n}
            for (a, b), n in sorted(pairs.items())
            if a in kept and b in kept and n >= min_shared
        ],
    }


def doi_set(page: str) -> set[str]:
    return {normalise_doi(d) for d in DOI_RE.findall(page)}


def tag_quartiles(publications: list[dict]) -> dict[str, int]:
    """Tag each publication with its JIF quartile, using one filtered fetch each."""
    by_doi: dict[str, list[dict]] = {}
    for pub in publications:
        if pub["doi"]:
            by_doi.setdefault(pub["doi"], []).append(pub)

    counts: dict[str, int] = {}

    for quartile in ("q1", "q2", "q3", "q4"):
        page = fetch(f"{GIB_BASE}&jif-{quartile}={quartile}")
        dois = doi_set(page)
        counts[quartile.upper()] = count_results(page)
        for doi in dois:
            for pub in by_doi.get(doi, []):
                pub["quartile"] = quartile.upper()

    page = fetch(f"{GIB_BASE}&jif-d1=d1")
    counts["D1"] = count_results(page)
    for doi in doi_set(page):
        for pub in by_doi.get(doi, []):
            pub["top_decile"] = True

    return counts


COUNT_RE = re.compile(r"Se han encontrado\s+(\d+)\s+resultados")


def count_results(page: str) -> int:
    match = COUNT_RE.search(page)
    return int(match.group(1)) if match else 0


# --- GIB: awards -------------------------------------------------------------

GIB_AWARDS_URL = "https://gib.uva.es/awards"

# The awards page lists the whole group's awards with no author filter, so
# entries are selected by name. "Javier Gomez-Pilar" and "Javier Gomez Pilar"
# are unambiguous; a bare "Javier Gomez" is not, and is flagged for review
# rather than silently claimed.
NAME_FULL_RE = re.compile(r"Javier\s+G[oó]mez[-\s]+Pilar", re.I)
NAME_SHORT_RE = re.compile(r"Javier\s+G[oó]mez\b", re.I)
TRAILING_YEAR_RE = re.compile(r",?\s*(\d{4})\.?\s*$")


def parse_awards(page: str) -> list[dict]:
    awards: list[dict] = []
    seen: set[str] = set()

    for raw in ENTRY_RE.findall(page):
        text = strip_tags(raw)
        if not text:
            continue

        full = bool(NAME_FULL_RE.search(text))
        short = bool(NAME_SHORT_RE.search(text))
        if not (full or short):
            continue

        year = 0
        year_match = TRAILING_YEAR_RE.search(text)
        if year_match:
            year = int(year_match.group(1))
            text = TRAILING_YEAR_RE.sub("", text).rstrip(" .,")

        key = text[:120].lower()
        if key in seen:
            continue
        seen.add(key)

        awards.append({
            "year": year,
            "text": text,
            # True when the entry spells the full surname, so the attribution
            # is certain; False entries are shown only after manual review.
            "confirmed": full,
        })

    awards.sort(key=lambda a: (-a["year"], a["text"]))
    return awards


# --- OpenAlex: citation metrics, recomputed over merged profiles -------------

PORTAL_ID = "180080"
PORTAL_FUNDING = (f"https://portaldelaciencia.uva.es/investigadores/"
                  f"{PORTAL_ID}/financiacion")
PORTAL_DETAIL = "https://portaldelaciencia.uva.es/proyectos/{}/detalle"

PORTAL_SCOPE = {
    "europeo": "europeo", "europea": "europeo",
    "internacional": "europeo",
    "nacional": "nacional",
    "autonomico": "autonomico", "autonómico": "autonomico",
    "regional": "autonomico", "local": "autonomico",
}


def portal_text(page: str) -> list[str]:
    """The detail pages are server-rendered; this flattens one to the
    sequence of visible strings, which is what the fields are read from."""
    page = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", page,
                  flags=re.S | re.I)
    flat = html.unescape(re.sub(r"<[^>]+>", "\x00", page))
    return [p.strip() for p in flat.split("\x00") if p.strip()]


def portal_projects() -> list[dict]:
    """Competitive projects from the UVa's Portal de la Ciencia.

    Only the ones marked "Con carácter Público": the Portal uses that
    to separate a competitive call from a company contract, and the
    site lists the former. Company work is his and the university's
    business, not a research merit to advertise.

    The amount a detail page shows is the UVa's share, never the whole
    project, so it is reported as such and never passed off as a total.
    """
    try:
        listing = fetch(PORTAL_FUNDING)
    except Exception as exc:                       # noqa: BLE001
        print(f"  Portal unreachable ({exc}); projects keep their "
              f"hand-kept data.", file=sys.stderr)
        return []

    ids = sorted(set(re.findall(r"/proyectos/(\d+)", listing)))
    out: list[dict] = []
    for pid in ids:
        try:
            parts = portal_text(fetch(PORTAL_DETAIL.format(pid)))
        except Exception:                          # noqa: BLE001
            continue

        joined = " ".join(parts)
        caracter = re.search(r"Con carácter\s*(\w+)", joined)
        if not caracter or caracter.group(1).lower() != "público":
            continue

        fechas = re.search(
            r"Duración del (\d{2}) de (\w+) de (\d{4}) al "
            r"(\d{2}) de (\w+) de (\d{4})", joined)
        # El portal separa cifra y simbolo con un espacio duro.
        amount = re.search(r"([\d.]+),\d\d[\s\u00a0]*€", joined)
        scope = re.search(r"De ámbito\s*([A-Za-zÁ-ú]+)", joined)

        # The PI is the person tagged "Responsable" in the team list;
        # the name sits in the two entries just before that tag.
        ip = ""
        if "Responsable" in parts:
            i = parts.index("Responsable")
            if i >= 2:
                ip = " ".join(parts[i - 2:i]).title()

        funder = ""
        if "Financiador:" in parts:
            funder = parts[parts.index("Financiador:") + 1]

        # Hay apuntes administrativos colados entre los proyectos: la
        # incorporacion de un grupo al consorcio CIBER figura con una
        # dotacion de 0,01 EUR. No son meritos de investigacion y no
        # deben aparecer solos en la web.
        if amount and int(amount.group(1).replace(".", "")) < 1000:
            continue

        out.append({
            "portal_id": pid,
            "title": parts[0] if parts else "",
            "from": fechas.group(3) if fechas else "",
            "to": fechas.group(6) if fechas else "",
            "amount_uva": int(amount.group(1).replace(".", ""))
                          if amount else None,
            "scope": PORTAL_SCOPE.get(
                (scope.group(1) if scope else "").lower(), ""),
            "funder": funder,
            "ip": ip,
            "live": "Vigente" in parts,
            "url": PORTAL_DETAIL.format(pid),
        })
    return out


CONTENT = Path(__file__).resolve().parent.parent / "data" / "content.json"


def flatten_title(text: str) -> str:
    text = unicodedata.normalize("NFKD", (text or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text).split())


def merge_projects(portal: list[dict]) -> dict:
    """Matches the Portal's projects against the hand-kept ones.

    content.json stays in charge of what is already there. Its amounts
    are the project totals, taken from the CVN, while the Portal only
    knows the UVa's share, and its scope has been checked by hand. So
    the Portal is used for two things: to carry the facts it alone
    keeps fresh (the UVa's share, whether the project is still running,
    a link to its record), and to notice projects that are not on the
    list yet.

    Anything that disagrees is reported, never overwritten: the weekly
    run prints it so a human decides.
    """
    if not portal:
        return {"overlay": {}, "new": [], "conflicts": []}

    try:
        content = json.loads(CONTENT.read_text(encoding="utf-8"))
    except Exception as exc:                        # noqa: BLE001
        print(f"  content.json unreadable ({exc}); Portal data is kept "
              f"aside.", file=sys.stderr)
        return {"overlay": {}, "new": [], "conflicts": []}

    mine = content.get("projects", [])
    overlay: dict[str, dict] = {}
    conflicts: list[str] = []
    taken: set[str] = set()

    for p in portal:
        best, score = None, 0.0
        flat = flatten_title(p["title"])
        palabras = set(flat.split())
        for q in mine:
            s = 0.0
            for lang in ("es", "en"):
                suyo = flatten_title(q[lang]["title"])
                s = max(s, SequenceMatcher(None, suyo, flat).ratio())
                # El Portal suele guardar el titulo largo y completo
                # mientras que aqui esta el corto, asi que la razon de
                # parecido se hunde aunque sea el mismo proyecto. El
                # solapamiento de palabras no sufre por esa diferencia
                # de longitud.
                otras = set(suyo.split())
                if otras and palabras:
                    s = max(s, len(otras & palabras)
                            / min(len(otras), len(palabras)))
            # The start year breaks the tie between projects whose
            # titles are near-identical, which happens here: a JCyL
            # pre-doctoral contract and a national grant can both be
            # about the same dementia work.
            if p["from"] and p["from"] == str(q.get("from", "")):
                s += 0.12
            if s > score:
                best, score = q, s
        key = (best or {}).get("acronym") or (best or {}).get("label") or ""

        if score < 0.62 or not key or key in taken:
            p["unmatched"] = True
            continue

        taken.add(key)
        overlay[key] = {
            "amount_uva": p["amount_uva"],
            "live": p["live"],
            "url": p["url"],
        }
        for field, theirs in (("from", p["from"]), ("to", p["to"]),
                              ("scope", p["scope"])):
            ours = str(best.get(field, ""))
            if theirs and ours and theirs != ours:
                conflicts.append(
                    f"{key}: {field} — a mano {ours}, Portal {theirs}")

    nuevos = [p for p in portal if p.get("unmatched")]
    for p in nuevos:
        print(f"  Portal: proyecto que no esta en content.json — "
              f"{p['title'][:58]}", flush=True)
    for c in conflicts:
        print(f"  Portal discrepa: {c}", flush=True)

    return {"overlay": overlay, "new": nuevos, "conflicts": conflicts}


def openalex_works(author_id: str) -> list[dict]:
    """Every work for an author, paged, keeping only the fields we need."""
    works: list[dict] = []
    cursor = "*"
    while cursor:
        url = (
            "https://api.openalex.org/works"
            f"?filter=author.id:{author_id}"
            "&select=id,doi,publication_year,cited_by_count"
            "&per-page=200"
            f"&cursor={cursor}"
        )
        payload = fetch_json(url)
        works.extend(payload.get("results", []))
        cursor = payload.get("meta", {}).get("next_cursor")
    return works


def openalex_countries(author_ids: list[str]) -> list[dict]:
    """Paises coautores, cada uno con las instituciones que hay detras.

    Dos fuentes, cada una para lo que hace bien:

      - el agrupado del servidor da el recuento por pais y su nombre, y
        es una sola peticion;
      - los trabajos con sus autorias dan las afiliaciones concretas,
        que el agrupado no incluye y que son las que permiten pulsar un
        pais en el mapa y ver sus centros.

    Espana entra en la lista: es su pais y en el mapa tiene que salir.
    La pestana de ranking la descarta aparte, porque aparece en casi
    todo y aplastaria la escala de los demas.
    """
    ids = "%7C".join(author_ids)       # el OR de OpenAlex es la barra vertical

    # 1. Recuento y nombre de cada pais.
    url = ("https://api.openalex.org/works"
           f"?filter=author.id:{ids}"
           "&group_by=institutions.country_code&per-page=200")
    paises: dict[str, dict] = {}
    for row in fetch_json(url).get("group_by", []):
        code = (row.get("key") or "").rsplit("/", 1)[-1].upper()
        count = int(row.get("count") or 0)
        if not code or code == "UNKNOWN" or not count:
            continue
        paises[code] = {
            "code": code,
            "name": row.get("key_display_name") or code,
            "works": count,
            "_inst": {},
            "_ids": {},
        }

    # 2. Afiliaciones concretas, trabajo a trabajo.
    cursor = "*"
    for _ in range(5):                 # 122 trabajos caben de sobra
        payload = fetch_json(
            "https://api.openalex.org/works"
            f"?filter=author.id:{ids}"
            f"&select=id,authorships&per-page=200&cursor={cursor}")
        resultados = payload.get("results") or []
        if not resultados:
            break

        for work in resultados:
            # Un trabajo suma uno por centro, no uno por firmante: si
            # cinco autores comparten institucion, sigue siendo un
            # trabajo de esa institucion.
            vistos: set[tuple[str, str, str]] = set()
            for authorship in work.get("authorships") or []:
                for inst in authorship.get("institutions") or []:
                    code = (inst.get("country_code") or "").upper()
                    nombre = (inst.get("display_name") or "").strip()
                    ident = (inst.get("id") or "").rsplit("/", 1)[-1]
                    if code in paises and nombre:
                        vistos.add((code, nombre, ident))
            for code, nombre, ident in vistos:
                centros = paises[code]["_inst"]
                centros[nombre] = centros.get(nombre, 0) + 1
                if ident:
                    paises[code]["_ids"][nombre] = ident

        cursor = (payload.get("meta") or {}).get("next_cursor")
        if not cursor:
            break

    rows = []
    por_id: dict[str, dict] = {}
    for pais in paises.values():
        centros = sorted(pais.pop("_inst").items(),
                         key=lambda kv: (-kv[1], kv[0]))
        ids = pais.pop("_ids")
        pais["institutions"] = []
        for nombre, n in centros[:14]:
            ficha = {"name": nombre, "works": n}
            ident = ids.get(nombre)
            if ident:
                ficha["id"] = ident
                por_id[ident] = ficha
            pais["institutions"].append(ficha)
        rows.append(pais)

    # 3. Coordenadas de cada centro, para poder marcarlo en el mapa.
    #    OpenAlex acepta hasta 50 identificadores por peticion, asi que
    #    esto son dos o tres llamadas, no una por institucion.
    identificadores = sorted(por_id)
    for i in range(0, len(identificadores), 50):
        lote = identificadores[i:i + 50]
        try:
            payload = fetch_json(
                "https://api.openalex.org/institutions"
                f"?filter=ids.openalex:{'%7C'.join(lote)}"
                "&select=id,display_name,geo&per-page=50")
        except Exception as exc:
            print(f"    sin coordenadas para un lote: {exc}", flush=True)
            continue
        for inst in payload.get("results") or []:
            ident = (inst.get("id") or "").rsplit("/", 1)[-1]
            geo = inst.get("geo") or {}
            lat, lon = geo.get("latitude"), geo.get("longitude")
            ficha = por_id.get(ident)
            if ficha and lat is not None and lon is not None:
                ficha["lat"] = round(float(lat), 4)
                ficha["lon"] = round(float(lon), 4)
                if geo.get("city"):
                    ficha["city"] = geo["city"]

    con_coords = sum(1 for f in por_id.values() if "lat" in f)
    print(f"    {con_coords} de {len(por_id)} centros con coordenadas",
          flush=True)

    rows.sort(key=lambda r: (-r["works"], r["name"]))
    return rows


def h_index(citation_counts: list[int]) -> int:
    h = 0
    for rank, citations in enumerate(sorted(citation_counts, reverse=True), start=1):
        if citations >= rank:
            h = rank
        else:
            break
    return h


def openalex_metrics(author_ids: list[str]) -> dict:
    """Merge the author profiles, deduplicate, then recompute the metrics.

    Metrics are recomputed rather than read from the author records because a
    researcher can hold more than one OpenAlex profile, and an h-index cannot
    be summed across them.
    """
    merged: dict[str, dict] = {}
    for author_id in author_ids:
        for work in openalex_works(author_id):
            # Prefer the DOI as identity so the same paper under two profiles
            # collapses into one record.
            key = normalise_doi(work["doi"]) if work.get("doi") else work["id"]
            existing = merged.get(key)
            if existing is None or work.get("cited_by_count", 0) > existing.get("cited_by_count", 0):
                merged[key] = work

    works = list(merged.values())
    counts = [w.get("cited_by_count", 0) or 0 for w in works]

    by_year: dict[int, int] = {}
    for work in works:
        year = work.get("publication_year")
        if year:
            by_year[year] = by_year.get(year, 0) + (work.get("cited_by_count", 0) or 0)

    return {
        "works": len(works),
        "citations": sum(counts),
        "h_index": h_index(counts),
        "i10_index": sum(1 for c in counts if c >= 10),
        "citations_by_publication_year": [
            {"year": y, "citations": by_year[y]} for y in sorted(by_year)
        ],
        "profiles": author_ids,
    }


def wos_documents(key: str, identifier: str) -> list[int]:
    """Times-cited de cada documento de un autor en Web of Science.

    Devuelve una lista vacia si el identificador no encuentra nada, para que
    quien llama pueda probar con otro.
    """
    counts: list[int] = []
    page = 1
    while page <= 20:          # tope de seguridad: 1000 documentos
        url = (
            "https://api.clarivate.com/apis/wos-starter/v2/documents"
            f"?q=AI%3D({quote(identifier)})&limit=50&page={page}&db=WOS"
        )
        payload = fetch_json(url, headers={"X-ApiKey": key})
        hits = payload.get("hits", []) or []
        if not hits:
            break

        for record in hits:
            for entry in record.get("citations", []) or []:
                if entry.get("db") in (None, "WOS"):
                    counts.append(int(entry.get("count", 0) or 0))
                    break

        total = (payload.get("metadata") or {}).get("total", 0) or 0
        if page * 50 >= total:
            break
        page += 1
        time.sleep(0.4)        # el plan institucional admite 5 peticiones/s

    return counts


def wos_metrics() -> dict | None:
    """Citas e indice h desde la Web of Science Starter API.

    Devuelve None si no hay WOS_API_KEY en el entorno, de modo que las cifras
    mantenidas a mano en data/content.json siguen al mando hasta que exista
    una clave.

    Sobre los planes: el Free Trial, abierto a cualquiera, NO devuelve el
    numero de citas. Solo lo hacen los planes institucionales, que requieren
    que tu organizacion tenga Web of Science contratado. Si todos los
    registros llegan sin citas, esto devuelve None en lugar de publicar un
    total de cero.

    La API no ofrece indice h: se calcula aqui a partir de las citas de cada
    documento, que es como lo calcula la propia plataforma.
    """
    key = os.environ.get("WOS_API_KEY", "").strip()
    if not key:
        return None

    # El ResearcherID es la forma documentada para el campo AI; el ORCID
    # funciona en la practica pero no esta en la especificacion, asi que
    # queda como respaldo.
    counts: list[int] = []
    for identifier in (RESEARCHER_ID, ORCID):
        counts = wos_documents(key, identifier)
        if counts:
            if identifier != RESEARCHER_ID:
                print(f"  WoS: sin resultados para {RESEARCHER_ID}, "
                      f"usando el ORCID.", flush=True)
            break

    if not counts:
        print("  WOS_API_KEY puesta pero la consulta no devuelve documentos; "
              "se mantienen las cifras manuales.", file=sys.stderr)
        return None
    if not any(counts):
        print("  WOS_API_KEY puesta pero no llega el numero de citas (el plan "
              "Free Trial no lo incluye); se mantienen las cifras manuales.",
              file=sys.stderr)
        return None

    return {
        "citations": sum(counts),
        "h_index": h_index(counts),
        "records": len(counts),
        "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": "Web of Science Starter API",
    }


def openalex_citations_by_year(author_ids: list[str]) -> list[dict]:
    """Citations received per calendar year, summed over the merged profiles."""
    totals: dict[int, int] = {}
    for author_id in author_ids:
        record = fetch_json(f"https://api.openalex.org/authors/{author_id}")
        for entry in record.get("counts_by_year", []):
            year = entry.get("year")
            if year:
                totals[year] = totals.get(year, 0) + (entry.get("cited_by_count", 0) or 0)
    return [{"year": y, "citations": totals[y]} for y in sorted(totals)]


# --- ORCID: a light cross-check ---------------------------------------------

def orcid_latest() -> dict:
    payload = fetch_json(f"https://pub.orcid.org/v3.0/{ORCID}/works")
    groups = payload.get("group", [])
    latest = {"works": len(groups), "title": "", "year": 0}

    best_year = 0
    for group in groups:
        for summary in group.get("work-summary", []):
            year_block = (summary.get("publication-date") or {}).get("year") or {}
            try:
                year = int(year_block.get("value", 0))
            except (TypeError, ValueError):
                continue
            if year > best_year:
                best_year = year
                latest["year"] = year
                latest["title"] = (
                    ((summary.get("title") or {}).get("title") or {}).get("value", "")
                )
    return latest


# --- main --------------------------------------------------------------------

# ── Red de seguridad ─────────────────────────────────────────────────
#
# Las fuentes de aqui son paginas ajenas y una API. El dia que gib.uva.es
# cambie su HTML, que el Portal devuelva media respuesta o que OpenAlex
# falle a medias, este script no se rompe: raspa menos y se queda tan
# ancho. Sin nadie mirando, el lunes siguiente la web publicaria una
# version empobrecida de si misma —menos articulos, menos paises, sin
# premios— y el primero en enterarse seria quien la leyera.
#
# Asi que antes de escribir se compara con lo ultimo publicado. Si
# alguna cifra se desploma, no se escribe nada y la ejecucion termina en
# rojo, que es la unica forma de que se note. Para un recorte
# deliberado —quitar una fuente, por ejemplo— esta JGP_SIN_RED=1.

MARGEN = 0.85            # por debajo de esto, algo se ha roto

VIGILADOS = (
    ("articulos JCR", lambda d: d["metrics"]["jcr_articles"]),
    ("publicaciones", lambda d: len(d["publications"])),
    ("paises", lambda d: len(d["countries"])),
    ("premios", lambda d: len(d["awards"])),
    ("proyectos", lambda d: len(d["projects"]["overlay"])
                          + len(d["projects"]["new"])),
    ("coautores", lambda d: d["collaboration"]["total_coauthors"]),
    ("citas (WoS)", lambda d: (d["metrics"].get("wos") or {}).get("citations")),
    ("indice h (WoS)", lambda d: (d["metrics"].get("wos") or {}).get("h_index")),
    ("citas (OpenAlex)", lambda d: d["metrics"]["openalex"]["citations"]),
)


def desplomes(antes: dict, ahora: dict) -> list[str]:
    """Cifras que caen mas de lo admisible respecto a lo publicado."""
    malas = []
    for nombre, saca in VIGILADOS:
        try:
            viejo, nuevo = saca(antes), saca(ahora)
        except (KeyError, TypeError, IndexError):
            continue
        if not isinstance(viejo, (int, float)) or viejo <= 0:
            continue          # no habia nada antes: nada que proteger
        if nuevo is None:
            malas.append(f"{nombre}: habia {viejo} y ahora no viene nada")
        elif not isinstance(nuevo, (int, float)):
            malas.append(f"{nombre}: {viejo} -> {nuevo!r}, que no es un numero")
        elif nuevo < viejo * MARGEN:
            caida = (1 - nuevo / viejo) * 100
            malas.append(f"{nombre}: {viejo} -> {nuevo} ({caida:.0f}% menos)")
    return malas


def main() -> int:
    print("Fetching GIB publication list ...", flush=True)
    publications: list[dict] = []
    by_kind: dict[str, int] = {}

    for param, kind in GIB_CATEGORIES.items():
        page = fetch(f"{GIB_QUERY}&{param}=on")
        found = parse_gib(page, kind)
        total = count_results(page)

        # Una categoria vacia es legitima: no tiene articulos en revistas no
        # indexadas. Lo que no es legitimo es que la pagina diga que hay
        # entradas y nosotros no las encontremos.
        if total and abs(len(found) - total) > 2:
            print(
                f"ERROR: {kind}: parsed {len(found)} entries but the page "
                f"reports {total}; the markup probably changed. "
                "Refusing to write.",
                file=sys.stderr,
            )
            return 1

        publications.extend(found)
        by_kind[kind] = len(found)
        print(f"  {kind:14} {len(found):3}", flush=True)

    jcr = by_kind.get("journal", 0)
    if not jcr:
        print("ERROR: parsed zero JCR articles from GIB; refusing to write.",
              file=sys.stderr)
        return 1

    print(f"  {len(publications)} entradas en total, {jcr} de ellas JCR",
          flush=True)

    print("Tagging JIF quartiles ...", flush=True)
    quartiles = tag_quartiles([r for r in publications if r["kind"] == "journal"])
    print(f"  {quartiles}", flush=True)

    print("Computing OpenAlex metrics over merged profiles ...", flush=True)
    metrics = openalex_metrics(OPENALEX_AUTHOR_IDS)
    citations_by_year = openalex_citations_by_year(OPENALEX_AUTHOR_IDS)
    print(
        f"  {metrics['works']} works, {metrics['citations']} citations, "
        f"h={metrics['h_index']}, i10={metrics['i10_index']}",
        flush=True,
    )

    print("Cross-checking ORCID ...", flush=True)
    orcid = orcid_latest()
    print(f"  {orcid['works']} works, latest {orcid['year']}", flush=True)

    print("Querying Web of Science (if a key is configured) ...", flush=True)
    wos = wos_metrics()
    print(f"  {wos['citations']} citations, h={wos['h_index']}" if wos
          else "  no key configured; content.json keeps the WoS figures", flush=True)

    print("Grouping co-authoring institutions by country ...", flush=True)
    countries = openalex_countries(OPENALEX_AUTHOR_IDS)
    print(f"  {len(countries)} countries with co-authoring institutions"
          + (f", top {countries[0]['name']} ({countries[0]['works']})"
             if countries else ""), flush=True)

    print("Building the co-authorship network ...", flush=True)
    network = collaboration(publications)
    print(f"  {len(network['nodes'])} nodes of {network['total_coauthors']} "
          f"co-authors, {len(network['links'])} links", flush=True)

    print("Fetching awards ...", flush=True)
    awards = parse_awards(fetch(GIB_AWARDS_URL))
    confirmed = sum(1 for a in awards if a["confirmed"])
    print(f"  {len(awards)} matched ({confirmed} by full name, "
          f"{len(awards) - confirmed} needing review)", flush=True)

    publications.sort(key=lambda p: (-p["year"], -p["month"], p["title"]))

    # Lo ultimo publicado, que hace de referencia dos veces: para
    # heredar lo que esta vuelta no haya podido averiguar y para
    # comparar al final.
    anterior = None
    if OUT.exists():
        try:
            anterior = json.loads(OUT.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            anterior = None

    # Si esta vuelta no trae cifras de Web of Science, se conservan las
    # que ya hubiera. Perderlas degradaria la web en silencio, y basta
    # una ejecucion a mano sin la clave —en el ordenador de casa, por
    # ejemplo— para vaciarlas sin querer. Que la consulta falle
    # teniendo clave es otra cosa, y se avisa mas abajo.
    wos_roto = bool(os.environ.get("WOS_API_KEY", "").strip()) and not wos
    if not wos and anterior:
        heredado = (anterior.get("metrics") or {}).get("wos")
        if heredado:
            wos = dict(heredado)
            print(f"  se conservan las cifras de WoS ya publicadas "
                  f"({heredado.get('as_of', 'sin fecha')}).", flush=True)

    print("Reading funded projects from the UVa Portal ...", flush=True)
    portal = portal_projects()
    proyectos = merge_projects(portal)
    print(f"  {len(portal)} competitive projects, "
          f"{len(proyectos['overlay'])} matched, "
          f"{len(proyectos['new'])} not on the list, "
          f"{len(proyectos['conflicts'])} disagreements", flush=True)

    data = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "metrics": {
            "jcr_articles": jcr,
            "by_kind": by_kind,
            "quartiles": quartiles,
            "openalex": metrics,
            "citations_by_year": citations_by_year,
            "orcid": orcid,
            **({"wos": wos} if wos else {}),
        },
        "publications": publications,
        "collaboration": network,
        "countries": countries,
        "awards": awards,
        "projects": proyectos,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)

    malas = desplomes(anterior, data) if anterior else []
    if wos_roto:
        malas.append("Web of Science: la clave esta puesta pero la consulta "
                     "no ha devuelto citas")
    if malas and not os.environ.get("JGP_SIN_RED"):
        print("ERROR: los datos de esta vuelta no son de fiar; no se escribe "
              "nada y se deja lo que ya habia.", file=sys.stderr)
        for m in malas:
            print(f"  - {m}", file=sys.stderr)
        print("Lo normal es que una fuente haya cambiado o haya respondido a "
              "medias. Si el recorte es a proposito, repite con "
              "JGP_SIN_RED=1.", file=sys.stderr)
        return 1
    if malas:
        print("AVISO: se escribe con JGP_SIN_RED pese a: " + "; ".join(malas),
              flush=True)

    # Leave the file alone when only the timestamp would move. Otherwise
    # every weekly run would produce a commit with no change in substance,
    # and the page's "as of" date would claim freshness it does not have.
    if anterior is not None and \
       {k: v for k, v in anterior.items() if k != "generated"} == \
       {k: v for k, v in data.items() if k != "generated"}:
        print(f"No substantive change; {OUT.relative_to(ROOT)} left as it was "
              f"(data unchanged since {anterior.get('generated', '?')}).", flush=True)
        return 0

    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.URLError as exc:
        print(f"ERROR: network failure: {exc}", file=sys.stderr)
        sys.exit(1)
