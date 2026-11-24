"""Build tools/unesco/geoparks.json and geoparks.csv from UNESCO's Geopark page.

Download the page first, then run from the repository root:

    curl -sL https://www.unesco.org/en/iggp/geoparks -o /tmp/geoparks.html
    python3 tools/unesco/geoparks.py /tmp/geoparks.html

Reads the "Full list of UNESCO Global Geoparks" section, which lists Geoparks by
country. A Geopark that spans two countries appears under both and is kept once,
with both countries. Former names go in "note".
"""
import csv
import html
import json
import re
import sys

SOURCE = "https://www.unesco.org/en/iggp/geoparks"
ENTRY = re.compile(r"(UNESCO )?Global Geopark|UGGp")
END = "List of transnational UNESCO Global Geoparks"


def split(s):
    """Country names in a bracket. "&" separates two countries whose names contain "and"."""
    if "&" in s:
        return [c.strip() for c in s.split("&") if c.strip()]
    return [c.strip() for c in re.split(r", (?:and )?| and ", s) if c.strip()]


def apply_note(g, text):
    """A bracket names a former name, the countries of a transnational Geopark, or both."""
    for part in [p.strip() for p in text.split(";")]:
        if re.match(r"(formerly|extended|renamed)", part):
            g["note"] = f"{g['note']}; {part}" if g.get("note") else part
        elif part:
            g["countries"] = split(part)


def lines_of(page):
    i = page.find('id="full-list-of-unesco-global-geoparks"')
    if i < 0:
        sys.exit("The full list section was not found; UNESCO may have changed the page.")
    seg = page[i:]
    text = html.unescape(re.sub(r"<[^>]+>", "\n", re.sub(r"<(script|style).*?</\1>", "", seg, flags=re.S)))
    lines = [re.sub(r"\s+", " ", l).strip() for l in text.split("\n")]
    lines = [l for l in lines if l][3:]  # the heading and the note about asterisks
    return lines[: lines.index(END)] if END in lines else lines, seg


def parse(page):
    lines, seg = lines_of(page)
    links = {}
    for m in re.finditer(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', seg, re.S):
        label = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", m.group(2)))).strip()
        links.setdefault(label, m.group(1).split("?")[0])
    out, country = [], None
    for l in lines:
        if l.startswith("(") and out:
            apply_note(out[-1], l.strip("()"))
        elif ENTRY.search(l):
            head = l.split("(")[0]
            name = ENTRY.split(head)[0].strip(" ,*")
            url = next((v for k, v in links.items() if k.startswith(head.split("*")[0].strip())), None)
            g = {"name": name, "countries": [country], "url": url}
            note = re.search(r"\(([^)]*)\)", l)
            if note:
                apply_note(g, note.group(1))
            out.append(g)
        elif l != "*":
            country = l.replace("*", "").strip()
    seen, unique = set(), []
    for g in out:
        if g["name"] not in seen:
            seen.add(g["name"])
            unique.append(g)
    return unique


def main(path, outdir="tools/unesco"):
    page = open(path, encoding="utf-8").read()
    rows = parse(page)
    stated = re.search(r"At present, (\d+) geoparks are found in (\d+) countries", html.unescape(re.sub(r"<[^>]+>", " ", page)))
    data = {
        "source": SOURCE,
        "stated_total": int(stated.group(1)) if stated else None,
        "stated_countries": int(stated.group(2)) if stated else None,
        "count": len(rows),
        "geoparks": rows,
    }
    with open(f"{outdir}/geoparks.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(f"{outdir}/geoparks.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "countries", "note", "url"])
        for g in rows:
            w.writerow([g["name"], "; ".join(g["countries"]), g.get("note", ""), g["url"] or ""])
    print(f"{len(rows)} Geoparks written (UNESCO states {data['stated_total']} in {data['stated_countries']} countries).")


if __name__ == "__main__":
    main(sys.argv[1])
