"""Build tools/unesco/biosphere-reserves.json and .csv from UNESCO's reserve list.

Download the list view first, then run from the repository root:

    curl -sL "https://www.unesco.org/en/mab/list?sort=sort_country_asc" -o /tmp/mab.html
    python3 tools/unesco/biospheres.py /tmp/mab.html

The list view shows every reserve on one page. Each entry carries UNESCO's own
structured data: an id, the country, and tags for the year of designation and
the UNESCO region (missing for some reserves). A reserve that spans a border is
listed once per country, as UNESCO counts it.
"""
import csv
import html
import json
import re
import sys

SOURCE = "https://www.unesco.org/en/mab/list"
ENTRY = re.compile(r'<a href="([^"]+)"[^>]*title="([^"]*)"[^>]*data-trk="([^"]+)"')


def parse(page):
    rows, seen = [], set()
    for url, title, trk in ENTRY.findall(page):
        try:
            data = json.loads(html.unescape(trk))["content"]
        except (ValueError, KeyError):
            continue
        if data.get("dataset", {}).get("id") != "mab001" or data["uuid"] in seen:
            continue
        seen.add(data["uuid"])
        tags = data.get("tags", [])
        year = next((t for t in tags if re.fullmatch(r"(19|20)\d\d", t)), None)
        region = next((t for t in tags if t not in ("man and the biosphere", "yes", "no") and t != year), None)
        region = region.title().replace(" And ", " and ").replace(" The ", " the ") if region else None
        rows.append({
            "name": html.unescape(data.get("title") or title),
            "countries": data.get("countries", []),
            "year": int(year) if year else None,
            "region": region,
            "url": url,
        })
    return rows


def main(path, outdir="tools/unesco"):
    page = open(path, encoding="utf-8").read()
    rows = parse(page)
    stated = re.search(r'sdh-results--block--number">(\d+)<', page)
    data = {"source": SOURCE, "stated_total": int(stated.group(1)) if stated else None, "count": len(rows), "reserves": rows}
    with open(f"{outdir}/biosphere-reserves.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(f"{outdir}/biosphere-reserves.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "countries", "year", "region", "url"])
        for r in rows:
            w.writerow([r["name"], "; ".join(r["countries"]), r["year"] or "", r["region"] or "", r["url"]])
    print(f"{len(rows)} Biosphere Reserves written (UNESCO shows {data['stated_total']}).")


if __name__ == "__main__":
    main(sys.argv[1])
