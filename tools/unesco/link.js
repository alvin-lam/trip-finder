#!/usr/bin/env node
/*
 * Links UNESCO Global Geoparks and Biosphere Reserves to Trip Finder places and
 * writes the GEOPARKS and BIOSPHERES maps in js/data.js.
 *
 *   node tools/unesco/link.js          write the maps and print a summary
 *   node tools/unesco/link.js --dry    print the summary only
 *
 * Reads tools/unesco/geoparks.json and biosphere-reserves.json after
 * fetch_details.py has added each site's centre and area. A site links to the
 * places in its own country (or that country's territories) that lie within its
 * reach: the radius of a circle with the site's area, plus 35 km, capped at
 * 160 km. At most the three nearest places are linked.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "js", "data.js");
const E = require(path.join(ROOT, "js", "engine.js"));
const index = E.buildIndex(require(DATA));

const MAX_PLACES = 3;
const EXTRA_KM = 35;
const CAP_KM = 160;

// UNESCO's names for countries whose Trip Finder name differs.
const COUNTRY = {
  "Kingdom of the Netherlands": "nl",
  "Netherlands (Kingdom of the)": "nl",
  "Democratic People's Republic of Korea": "kp",
  "Iran (Islamic Republic of)": "ir",
  "United Kingdom of Great Britain and Northern Ireland": "gb",
  "Bolivia (Plurinational State of)": "bo",
  Congo: "cg",
  "Micronesia (Federated States of)": "fm",
  "Republic of Moldova": "md",
  "Syrian Arab Republic": "sy",
  "United Republic of Tanzania": "tz",
  "Venezuela (Bolivarian Republic of)": "ve",
  "Viet Nam": "vn",
};
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const byName = {};
for (const c of index.countries) {
  byName[norm(c.name)] = c.id;
  for (const a of c.aliases || []) byName[norm(a)] = c.id;
}
const countryId = (name) => COUNTRY[name] || byName[norm(name)] || null;

// Two-letter codes for UNESCO's country names (Trip Finder ids are ISO codes), for fetch_details.py.
const codes = () => {
  const out = {};
  for (const [f, key] of [["geoparks.json", "geoparks"], ["biosphere-reserves.json", "reserves"]])
    for (const s of JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"))[key]) for (const n of s.countries) if (countryId(n)) out[n] = countryId(n);
  return out;
};

// Centres that fall outside their own country in UNESCO's data or the geocoding,
// checked against country borders (tools/unesco/README note in the main README).
const FIXES = {
  "Irati": [42.98, -1.14], // UNESCO gives longitude +1.14, which is in France
  "Long Point": [42.58, -80.4], // UNESCO's point is in Lake Erie on the US side
  "Araucarias": [-38.65, -71.55], // UNESCO's point is just over the Argentine border
  "Radom": [9.9, 24.3], // UNESCO's point is just inside South Sudan
  "Mount Changbaishan": [42.25, 128.1], // the summit sits on the border; this is the Chinese side
};

const km = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

function link(sites) {
  const map = {};
  const unknown = new Set();
  let linked = 0;
  const unlinked = [];
  for (const s of sites) {
    if (FIXES[s.name]) [s.lat, s.lon] = FIXES[s.name];
    if (typeof s.lat !== "number") {
      unlinked.push(`${s.name} (no coordinates)`);
      continue;
    }
    const ids = new Set();
    for (const n of s.countries) {
      const id = countryId(n);
      if (id) ids.add(id);
      else unknown.add(n);
    }
    const pool = index.cities.filter((x) => x.ll && !x.remote && (ids.has(x.country.id) || (x.country.sovereignCountry && ids.has(x.country.sovereignCountry.id))));
    const radius = s.area_ha ? Math.sqrt(s.area_ha / 100 / Math.PI) : 10;
    const reach = Math.min(radius + EXTRA_KM, CAP_KM);
    const near = pool
      .map((x) => ({ x, d: km([s.lat, s.lon], x.ll) }))
      .filter((p) => p.d <= reach)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_PLACES);
    if (!near.length) {
      unlinked.push(s.name);
      continue;
    }
    linked++;
    for (const { x } of near) (map[x.id] = map[x.id] || []).push(s.name);
  }
  return { map, linked, unlinked, unknown: [...unknown] };
}

function literal(map) {
  const keys = Object.keys(map).sort();
  if (!keys.length) return "{}";
  return `{\n${keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(map[k].length === 1 ? map[k][0] : map[k])},`).join("\n")}\n  }`;
}

module.exports = { codes };
if (require.main !== module) return;

const read = (f, key) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"))[key];
const geo = link(read("geoparks.json", "geoparks"));
const bio = link(read("biosphere-reserves.json", "reserves"));
for (const [label, r, total] of [["Geoparks", geo, read("geoparks.json", "geoparks").length], ["Biosphere Reserves", bio, read("biosphere-reserves.json", "reserves").length]]) {
  console.log(`${label}: ${r.linked} of ${total} linked to ${Object.keys(r.map).length} places; ${r.unlinked.length} unlinked.`);
  if (r.unknown.length) console.log(`  Unknown countries: ${r.unknown.join(", ")}`);
}

if (!process.argv.includes("--dry")) {
  let src = fs.readFileSync(DATA, "utf8");
  for (const [name, r] of [["GEOPARKS", geo], ["BIOSPHERES", bio]]) {
    const re = new RegExp(`  const ${name} = (\\{\\}|\\{\\n[\\s\\S]*?\\n  \\});`);
    if (!re.test(src)) throw new Error(`${name} not found in js/data.js`);
    src = src.replace(re, `  const ${name} = ${literal(r.map)};`);
  }
  fs.writeFileSync(DATA, src);
  console.log("Wrote GEOPARKS and BIOSPHERES in js/data.js.");
}
