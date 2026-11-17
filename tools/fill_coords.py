"""Add Wikipedia coordinates for places that still lack them.

Each run checks up to LIMIT candidate Wikipedia titles (default 250), in
batches of 50, and writes any coordinates it finds into the COORDS map in
js/data.js. Titles already checked are kept in tools/coords_tried.json so
later runs move on to new candidates. Run from the repository root:

    python3 tools/fill_coords.py [limit]
"""
import json, math, re, subprocess, sys, time, urllib.parse

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 250
TRIED = "tools/coords_tried.json"
DATA = "js/data.js"
# Countries large enough that a place can be far from the country's centre point.
BIG = set("ru us ca cn au br in ar kz dz cd sa mx id ly sd ir mn pe td ne ao ml za co et bo mr eg tz ng ve pk na mz tr cl zm mm af ss so cf ua mg bw ke fr ye th es tm cm pg se uz ma iq py zw no jp de fi vn my nz it ph ec gb ki fm mh pf sb fj vu nc ck cv pt gl dk sj".split())

def places():
    js = """const d=require('./js/data.js');const i=require('./js/engine.js').buildIndex(d);
    console.log(JSON.stringify(i.cities.map(c=>({id:c.id,name:c.name,area:c.area,country:c.country.name,
    lat:c.country.lat,lon:c.country.lon,cid:c.country.id,unesco:c.unesco,ll:c.ll}))))"""
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)

def candidates(p):
    head = re.split(r" & | \(|, ", p["name"])[0].strip()
    c = []
    if p["unesco"]: c.append(p["unesco"])
    if p["area"]: c.append(f"{head}, {p['area']}")
    c += [f"{head}, {p['country']}", head, p["name"]]
    out = []
    for x in c:
        if x and x not in out: out.append(x)
    return out

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

def query(titles):
    url = ("https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&colimit=max&redirects=1&format=json&titles="
           + urllib.parse.quote("|".join(titles)))
    for attempt in range(6):
        r = subprocess.run(["curl", "-s", "-A", "where-to-travel-data-import/1.0", url], capture_output=True)
        try:
            d = json.loads(r.stdout)
            if "query" in d: break
        except ValueError:
            pass
        time.sleep(10 * (attempt + 1))
    else:
        return None
    q = d["query"]
    norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
    red = {x["from"]: x["to"] for x in q.get("redirects", [])}
    co = {pg["title"]: [pg["coordinates"][0]["lat"], pg["coordinates"][0]["lon"]]
          for pg in q.get("pages", {}).values() if pg.get("coordinates")}
    out = {}
    for t in titles:
        x = norm.get(t, t); x = red.get(x, x)
        if x in co: out[t] = co[x]
    time.sleep(2)
    return out

def main():
    try: tried = json.load(open(TRIED))
    except FileNotFoundError: tried = {}
    missing = [p for p in places() if not p["ll"]]
    cands = {p["id"]: candidates(p) for p in missing}
    todo = []
    for rank in range(5):
        for ts in cands.values():
            if rank < len(ts) and ts[rank] not in tried and ts[rank] not in todo: todo.append(ts[rank])
    todo = todo[:LIMIT]
    checked = 0
    for k in range(0, len(todo), 50):
        batch = todo[k:k + 50]
        got = query(batch)
        if got is None: continue
        for t in batch: tried[t] = got.get(t)
        checked += len(batch)
    found = {}
    for p in missing:
        lim = 4500 if p["cid"] in BIG else 1500
        for t in cands[p["id"]]:
            ll = tried.get(t)
            if ll and km(ll, (p["lat"], p["lon"])) <= lim:
                found[p["id"]] = [round(ll[0], 3), round(ll[1], 3)]; break
    s = open(DATA, encoding="utf-8").read()
    m = re.search(r"const COORDS = (\{.*?\});\n", s)
    coords = json.loads(m.group(1)); coords.update(found)
    s = s[:m.start(1)] + json.dumps(coords, separators=(",", ":"), ensure_ascii=False) + s[m.end(1):]
    open(DATA, "w", encoding="utf-8").write(s)
    json.dump(dict(sorted(tried.items())), open(TRIED, "w"), ensure_ascii=False, indent=0)
    left = len(missing) - len(found)
    untried = sum(1 for ts in cands.values() if any(t not in tried for t in ts))
    print(f"checked {checked} titles | added {len(found)} places | {left} places still without coordinates | {untried} still have untried titles")

if __name__ == "__main__":
    main()
