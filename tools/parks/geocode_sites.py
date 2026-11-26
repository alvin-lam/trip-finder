"""Find coordinates for historic park system sites, for the HISTORIC SITE gateways.

Run from the repository root:

    python3 tools/parks/geocode_sites.py

Reads the US and Canadian park system sites (and Mexico's, once listed) from
js/data.js through the engine, keeps the historic kinds (historic sites, historical
parks, memorials, battlefields and military parks), and looks each one up in
OpenStreetMap's Nominatim, one request a second as its usage policy asks:
"<name>, <state or province>" within the country, then the name alone. Results go
to tools/parks/site_coords.json, saved every 20 sites; sites already there are
skipped, so the script can be stopped and rerun.
"""
import json
import re
import os
import subprocess
import time
import urllib.parse

OUT = "tools/parks/site_coords.json"
UA = "TripFinder-data/1.0 (tripfinder.alltripsconsidered.com)"
PARK_KINDS = ["National Park", "National Park Reserve", "National Monument", "National Preserve", "National Reserve",
              "National Recreation Area", "National Seashore", "National Lakeshore"]
KINDS = ["National Historic Site", "National Historical Park", "National Memorial", "National Battlefield",
         "National Battlefield Park", "National Battlefield Site", "National Military Park", "International Historic Site"]


def sites():
    js = ("const i=require('./docs/js/engine.js').buildIndex(require('./docs/js/data.js'));"
          "console.log(JSON.stringify(['us','ca','mx'].flatMap(c=>(i.countryById[c].sites||[]).map(s=>({...s,country:c})))))")
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


def search(q, cc):
    url = f"https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes={cc}&q=" + urllib.parse.quote(q)
    r = subprocess.run(["curl", "-sS", "--max-time", "30", "--retry", "4", "--retry-all-errors", "-A", UA, url], capture_output=True)
    time.sleep(1.1)
    try:
        hit = json.loads(r.stdout)[0]
        return [float(hit["lat"]), float(hit["lon"]), q]
    except (ValueError, IndexError, KeyError):
        return None


def main():
    done = json.load(open(OUT)) if os.path.exists(OUT) else {}
    # Historic kinds for the HISTORIC SITE gateways, plus every park kind that can end up
    # in the "No place nearby" card (which names the nearest place).
    todo = [s for s in sites() if s["type"] in KINDS + PARK_KINDS and not done.get(s["name"])]
    print(f"{len(todo)} sites to look up", flush=True)
    for n, s in enumerate(todo, 1):
        area = s["area"].split(",")[0]
        # OpenStreetMap often knows a site by its plain name: "Fort Langley", not
        # "Fort Langley National Historic Site".
        plain = re.sub(r"\s+(and Preserve|National (Historic Site|Historical Park|Memorial|Park( Reserve)?( of Canada)?|Monument)( and Preserve)?)\b.*$", "", s["name"]).strip()
        hit = (search(f"{s['name']}, {area}", s["country"]) or search(s["name"], s["country"])
               or (plain != s["name"] and (search(f"{plain}, {area}", s["country"]) or search(plain, s["country"]))) or None)
        done[s["name"]] = hit
        if n % 20 == 0 or n == len(todo):
            json.dump(done, open(OUT, "w"), ensure_ascii=False, indent=1)
            print(f"  {n}/{len(todo)}", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
