"""Add coordinates, area and year to the UNESCO Geopark and Biosphere Reserve lists.

Run from the repository root after geoparks.py and biospheres.py:

    python3 tools/unesco/fetch_details.py

- Biosphere Reserves: each reserve's UNESCO page gives its centre ("Latitude ... -
  Longitude ...") and its area in hectares.
- Geoparks: each Geopark's UNESCO page gives its area and designation year but no
  coordinates, so its location comes from OpenStreetMap's Nominatim search
  ("<name> Geopark, <country>", then "<name>, <country>").

UNESCO pages are fetched three at a time; Nominatim lookups go one a second, as its
usage policy asks. Results are saved after every 25 sites, so the script can be stopped and rerun.
Sites already filled in are skipped.
"""
import json
import re
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
import html as htmllib

UA = "TripFinder-data/1.0 (tripfinder.alltripsconsidered.com)"
DIR = "tools/unesco"


def get(url):
    """Fetch a page with curl, which retries dropped connections quickly on its own."""
    r = subprocess.run(
        ["curl", "-sSL", "--compressed", "--max-time", "60", "--retry", "6", "--retry-all-errors", "--retry-delay", "2",
         "-A", UA, "-H", "Accept-Language: en", url],
        capture_output=True,
    )
    if r.returncode != 0 or not r.stdout:
        print("  failed:", url, r.stderr.decode(errors="ignore").strip()[:120], flush=True)
        return None
    return r.stdout.decode("utf-8", "ignore")


def text(page):
    t = re.sub(r"<(script|style).*?</\1>", "", page, flags=re.S)
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", t)))


def num(s):
    return float(s.replace(",", "")) if s else None


def reserve_details(r):
    page = get(r["url"])
    if not page:
        return
    t = text(page)
    m = re.search(r"Latit\w*:\s*(-?\d+(?:\.\d+)?)\s*-\s*Longit\w*:\s*(-?\d+(?:\.\d+)?)", t)
    if m:
        r["lat"], r["lon"] = float(m.group(1)), float(m.group(2))
    a = re.search(r"Surface\s+([\d,]+(?:\.\d+)?)\s*ha", t)
    r["area_ha"] = num(a.group(1)) if a else None


def geopark_page(g):
    """Area and designation year from the Geopark's UNESCO page."""
    if not g.get("url") or "area_ha" in g:
        return
    page = get(g["url"])
    if page:
        t = text(page)
        a = re.search(r"Area \(ha\)\s*([\d,]+(?:\.\d+)?)", t)
        y = re.search(r"Designation date\s*((?:19|20)\d\d)", t)
        g["area_ha"] = num(a.group(1)) if a else None
        if y:
            g["year"] = int(y.group(1))


def country_codes():
    """UNESCO country name -> two-letter code, using Trip Finder's own country list."""
    out = subprocess.run(
        ["node", "-e", "const l=require('./tools/unesco/link.js');console.log(JSON.stringify(l.codes()))"],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out.strip().splitlines()[-1])


CODES = None


def name_variants(name):
    """The full name, then simpler forms: "Biokovo-Imotski Lakes" -> "Biokovo"."""
    base = re.sub(r"^The ", "", name)
    parts = [base, base + " Geopark"]
    for sep in (" – ", " - ", " / ", ", ", " & ", " and ", "-"):
        if sep in base:
            parts.append(base.split(sep)[0].strip())
    return list(dict.fromkeys(p for p in parts if len(p) >= 3))


def geocode(g):
    """The Geopark's location from OpenStreetMap, one request a second, searched within its country."""
    global CODES
    if "lat" in g:
        return
    CODES = CODES or country_codes()
    cc = ",".join(c for c in (CODES.get(n) for n in g["countries"]) if c)
    for q in name_variants(g["name"]):
        url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + urllib.parse.quote(q)
        if cc:
            url += "&countrycodes=" + cc
        res = get(url)
        time.sleep(1.1)
        try:
            hit = json.loads(res)[0] if res else None
        except (ValueError, IndexError):
            hit = None
        if hit:
            g["lat"], g["lon"], g["geocode_query"] = float(hit["lat"]), float(hit["lon"]), q
            return


def save(data, file):
    with open(f"{DIR}/{file}", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def run(file, key, fill, done, workers):
    data = json.load(open(f"{DIR}/{file}", encoding="utf-8"))
    todo = [r for r in data[key] if not done(r)]
    print(f"{file}: {len(todo)} of {len(data[key])} to fill ({fill.__name__})", flush=True)
    with ThreadPoolExecutor(workers) as pool:
        for n, _ in enumerate(pool.map(fill, todo), 1):
            if n % 25 == 0 or n == len(todo):
                save(data, file)
                print(f"  {n}/{len(todo)}", flush=True)


if __name__ == "__main__":
    # UNESCO pages three at a time; OpenStreetMap lookups one at a time, a second apart.
    run("biosphere-reserves.json", "reserves", reserve_details, lambda r: "lat" in r and "area_ha" in r, 3)
    run("geoparks.json", "geoparks", geopark_page, lambda g: "area_ha" in g or not g.get("url"), 3)
    run("geoparks.json", "geoparks", geocode, lambda g: "lat" in g, 1)
    print("done", flush=True)
