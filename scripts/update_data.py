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
import sys
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

GIB_BASE = (
    "https://gib.uva.es/publications"
    "?from-year=2004&to-year=2027"
    f"&filter-author%5B%5D={GIB_AUTHOR_ID}&category_journal=on"
)

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


def parse_gib(page: str) -> list[dict]:
    """Parse the GIB list into publication records, tagged with their year."""
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


def wos_metrics() -> dict | None:
    """Citations and h-index from the Web of Science Starter API.

    Returns None unless a WOS_API_KEY is set in the environment, so that the
    hand-kept figures in data/content.json stay in charge until a key exists.

    Note on tiers: the open free plan does NOT return times-cited, only the
    plan granted through a subscribing institution's contract does. If every
    record comes back without a citation count, this returns None rather than
    publishing a total of zero.
    """
    key = os.environ.get("WOS_API_KEY", "").strip()
    if not key:
        return None

    counts: list[int] = []
    page = 1
    while True:
        url = (
            "https://api.clarivate.com/apis/wos-starter/v1/documents"
            f"?q=AI%3D({ORCID})&limit=50&page={page}&db=WOS"
        )
        payload = fetch_json(url, headers={"X-ApiKey": key})
        hits = payload.get("hits", [])
        if not hits:
            break

        for record in hits:
            for entry in record.get("citations", []) or []:
                if entry.get("db") in (None, "WOS"):
                    counts.append(int(entry.get("count", 0) or 0))
                    break

        total = (payload.get("metadata") or {}).get("total", 0)
        if page * 50 >= total:
            break
        page += 1

    if not counts or not any(counts):
        print(
            "  WOS_API_KEY is set but no times-cited data came back "
            "(the free tier omits it); keeping the manual figures.",
            file=sys.stderr,
        )
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

def main() -> int:
    print("Fetching GIB publication list ...", flush=True)
    page = fetch(GIB_BASE)
    publications = parse_gib(page)
    total = count_results(page)

    if not publications:
        print("ERROR: parsed zero publications from GIB; refusing to write.", file=sys.stderr)
        return 1
    if total and abs(len(publications) - total) > 2:
        print(
            f"ERROR: parsed {len(publications)} entries but the page reports {total}; "
            "the markup probably changed. Refusing to write.",
            file=sys.stderr,
        )
        return 1

    print(f"  parsed {len(publications)} JCR articles (page reports {total})", flush=True)

    print("Tagging JIF quartiles ...", flush=True)
    quartiles = tag_quartiles(publications)
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

    print("Fetching awards ...", flush=True)
    awards = parse_awards(fetch(GIB_AWARDS_URL))
    confirmed = sum(1 for a in awards if a["confirmed"])
    print(f"  {len(awards)} matched ({confirmed} by full name, "
          f"{len(awards) - confirmed} needing review)", flush=True)

    publications.sort(key=lambda p: (-p["year"], -p["month"], p["title"]))

    data = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "metrics": {
            "jcr_articles": len(publications),
            "quartiles": quartiles,
            "openalex": metrics,
            "citations_by_year": citations_by_year,
            "orcid": orcid,
            **({"wos": wos} if wos else {}),
        },
        "publications": publications,
        "awards": awards,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.URLError as exc:
        print(f"ERROR: network failure: {exc}", file=sys.stderr)
        sys.exit(1)
