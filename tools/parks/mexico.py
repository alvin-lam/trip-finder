"""Build Mexico's national parks, biosphere reserves and natural monuments from CONANP.

Source: CONANP's SIMEC (simec.conanp.gob.mx), the official register of Mexico's
federal protected areas (Áreas Naturales Protegidas). Run from the repository root:

    python3 tools/parks/mexico.py

1. The record-sheet search page lists every protected area with its id, and the
   all-regions spreadsheet export gives each one's management category.
2. Each Parque Nacional, Reserva de la Biosfera and Monumento Natural record sheet
   gives its state(s), municipality and area.
3. OpenStreetMap's Nominatim places each area (its name in its state, then its
   first municipality), one request a second as its usage policy asks.

Writes tools/parks/mexico_anp.json and .csv, and adds the coordinates to
tools/parks/site_coords.json under the English site names used in docs/js/data.js.
Progress is saved as it goes, so the script can be stopped and rerun.
"""
import csv
import html
import io
import json
import os
import re
import subprocess
import time
import urllib.parse
import zipfile

BASE = "https://simec.conanp.gob.mx"
UA = "Mozilla/5.0 (Trip Finder data download; tripfinder.alltripsconsidered.com)"
OUT = "tools/parks/mexico_anp.json"
COORDS = "tools/parks/site_coords.json"
KEEP = {"Parque Nacional": "National Park", "Reserva de la Biosfera": "Biosphere Reserve", "Monumento Natural": "Natural Monument"}


def get(url, binary=False):
    r = subprocess.run(["curl", "-sSL", "--compressed", "--max-time", "60", "--retry", "5", "--retry-all-errors", "--retry-delay", "2", "-A", UA, url], capture_output=True)
    if r.returncode != 0:
        print("  failed:", url, flush=True)
        return None
    return r.stdout if binary else r.stdout.decode("utf-8", "ignore")


def xlsx_rows(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = [re.sub(r"<[^>]+>", "", s) for s in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode(), re.S)]
    rows = []
    for row in re.findall(r"<row[^>]*>(.*?)</row>", z.read("xl/worksheets/sheet1.xml").decode(), re.S):
        cells = []
        for attrs, body in re.findall(r"<c([^>]*)>(.*?)</c>", row, re.S):
            v = re.search(r"<v>(.*?)</v>", body)
            v = v.group(1) if v else re.sub(r"<[^>]+>", "", body)
            cells.append(html.unescape(shared[int(v)] if 't="s"' in attrs and v.isdigit() else v))
        rows.append(cells)
    return rows


def flat(page):
    t = re.sub(r"<(script|style).*?</\1>", "", page, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " | ", t)))


def field(text, label):
    m = re.search(re.escape(label) + r"[ |]*([^|]+)", text)
    return m.group(1).strip() if m else None


def area_list():
    page = get(f"{BASE}/consulta_fichas.php")
    ids = {}
    for m in re.finditer(r'<option[^>]*value="(\d+)"[^>]*data-url="([^"]+)"[^>]*>([^<]+)</option>', page):
        ids[html.unescape(m.group(3)).strip()] = (int(m.group(1)), html.unescape(m.group(2)))
    rows = xlsx_rows(get(f"{BASE}/informacion/consulta_fichas/excel?region=11", binary=True))
    out = []
    for r in rows:
        if len(r) >= 3 and r[1] in KEEP and r[0] in ids:
            sid, url = ids[r[0]]
            out.append({"id": sid, "name": r[0], "category": r[1], "type": KEEP[r[1]], "region": r[2], "url": url.split("?")[0]})
    return out


def english(a):
    return f"{a['name']} {a['type']}"


def search(q):
    url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=" + urllib.parse.quote(q)
    r = get(url)
    time.sleep(1.1)
    try:
        hit = json.loads(r)[0]
        return [float(hit["lat"]), float(hit["lon"]), q]
    except (TypeError, ValueError, IndexError, KeyError):
        return None


def main():
    areas = json.load(open(OUT))["areas"] if os.path.exists(OUT) else area_list()
    print(f"{len(areas)} national parks, biosphere reserves and natural monuments", flush=True)
    coords = json.load(open(COORDS)) if os.path.exists(COORDS) else {}
    for n, a in enumerate(areas, 1):
        if not a.get("state"):
            t = flat(get(a["url"]) or "")
            # Areas in several states say "Estados:" and "Municipios:".
            a["state"] = field(t, "Estado:") or field(t, "Estados:")
            a["municipality"] = field(t, "Municipio:") or field(t, "Municipios:")
            ha = re.search(r"Superficie Total:[ |]*([\d,]+(?:\.\d+)?) ha", t)
            a["area_ha"] = float(ha.group(1).replace(",", "")) if ha else None
            decree = re.search(r"Fecha de Decreto:[ |]*(\d\d/\d\d/(\d{4}))", t)
            a["decreed"] = int(decree.group(2)) if decree else None
        name = english(a)
        if not coords.get(name):
            state = (a["state"] or "").split(",")[0]
            muni = (a["municipality"] or "").split(",")[0]
            coords[name] = (
                search(f"{a['name']}, {state}")
                or (muni and search(f"{muni}, {state}"))
                or search(a["name"])
                or search(f"{a['name'].split(' o ')[0].split(',')[0]}")
                or None
            )
            if coords[name] and coords[name][2] != f"{a['name']}, {state}":
                coords[name][2] += " (municipality)"
        if n % 10 == 0 or n == len(areas):
            json.dump({"source": f"{BASE} (CONANP SIMEC)", "count": len(areas), "areas": areas}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            json.dump(coords, open(COORDS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {n}/{len(areas)}", flush=True)
    with open("tools/parks/mexico_anp.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "category", "english_type", "state", "municipality", "area_ha", "decreed", "region", "url"])
        for a in areas:
            w.writerow([a["name"], a["category"], a["type"], a["state"], a["municipality"], a["area_ha"], a["decreed"], a["region"], a["url"]])
    print("done", flush=True)


if __name__ == "__main__":
    main()
