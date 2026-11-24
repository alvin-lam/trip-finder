#!/usr/bin/env node
/*
 * Links park system sites that have no place of their own to a gateway place
 * within about 1.5 hours (110 km in a straight line), and writes the links into
 * js/data.js:
 *
 *   - historic sites, historical parks, memorials, battlefields and military parks
 *     in the US and Canada (HISTORIC SITE label), and
 *   - Mexico's national parks, biosphere reserves and natural monuments from CONANP
 *     (NATIONAL PARK label).
 *
 *   node tools/parks/link_sites.js          write the links and print a summary
 *   node tools/parks/link_sites.js --dry    print the summary only
 *
 * Coordinates come from tools/parks/site_coords.json (geocode_sites.py). Links to a
 * place in the same country go in the SITE_PLACES map, between the
 * "linked by tools/parks/link_sites.js" markers; links to a place in one of the
 * country's territories (a US site in Puerto Rico) go in HISTORIC_EXTRA or NP_EXTRA.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "js", "data.js");
const E = require(path.join(ROOT, "js", "engine.js"));
const coords = JSON.parse(fs.readFileSync(path.join(__dirname, "site_coords.json"), "utf8"));

const REACH_KM = 110;
const HISTORIC = /^(National (Historic Site|Historical Park|Memorial|Battlefield( Park| Site)?|Military Park)|International Historic Site)$/;
const START = "    // --- linked by tools/parks/link_sites.js (do not edit by hand) ---";
const END = "    // --- end of tools/parks/link_sites.js links ---";

const km = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// Build the index without earlier generated links, so a rerun starts fresh.
let src = fs.readFileSync(DATA, "utf8");
const stripped = src.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`), "");
const tmp = path.join(ROOT, "js", ".data-unlinked.tmp.js");
fs.writeFileSync(tmp, stripped);
let index;
try {
  index = E.buildIndex(require(tmp));
} finally {
  fs.unlinkSync(tmp);
}

const sitePlaces = {}; // site name -> [place names] (same country)
const historicExtra = {}; // place id -> [site names] (a territory's place)
const npExtra = {}; // place id -> [site names] (a territory's place, Mexico parks)
const tally = { historic: [0, 0], mxpark: [0, 0] };
const unlinked = [];

for (const cid of ["us", "ca", "mx"]) {
  const c = index.countryById[cid];
  for (const site of c.sites || []) {
    const kind = HISTORIC.test(site.type) ? "historic" : cid === "mx" ? "mxpark" : null;
    if (!kind) continue;
    tally[kind][0]++;
    const already = E.placeForSite(c, site) || index.cities.find((x) => x.nationalParks.includes(site.name) || x.historicSites.includes(site.name));
    if (already) {
      tally[kind][1]++;
      continue;
    }
    const at = coords[site.name];
    if (!at) {
      unlinked.push(`${site.name} (no coordinates)`);
      continue;
    }
    const pool = index.cities.filter((x) => x.ll && !x.remote && (x.country === c || x.country.sovereignCountry === c));
    const best = pool.map((x) => ({ x, d: km(at, x.ll) })).sort((a, b) => a.d - b.d)[0];
    if (!best || best.d > REACH_KM) {
      unlinked.push(site.name);
      continue;
    }
    tally[kind][1]++;
    if (best.x.country === c) (sitePlaces[site.name] = sitePlaces[site.name] || []).push(best.x.name);
    else {
      const map = kind === "historic" ? historicExtra : npExtra;
      (map[best.x.id] = map[best.x.id] || []).push(site.name);
    }
  }
}

console.log(`Historic sites: ${tally.historic[1]} of ${tally.historic[0]} reach a place.`);
console.log(`Mexico (CONANP): ${tally.mxpark[1]} of ${tally.mxpark[0]} reach a place.`);
console.log(`${unlinked.length} sites stay unlinked.`);
if (process.argv.includes("--dry")) process.exit(0);

const line = (k, v) => `    ${JSON.stringify(k)}: ${JSON.stringify(v.length === 1 ? v[0] : v)},`;
// SITE_PLACES values are always lists of place names.
const block = `${START}\n${Object.keys(sitePlaces).sort().map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(sitePlaces[k])},`).join("\n")}\n${END}\n`;
src = stripped.replace("  const SITE_PLACES = {\n", `  const SITE_PLACES = {\n${block}`);
src = src.replace(/  const HISTORIC_EXTRA = \{[\s\S]*?\};/, `  const HISTORIC_EXTRA = {${Object.keys(historicExtra).length ? `\n${Object.keys(historicExtra).sort().map((k) => line(k, historicExtra[k])).join("\n")}\n  ` : ""}};`);
// Mexico parks in a territory are not expected; NP_EXTRA is only extended if one appears.
for (const [id, names] of Object.entries(npExtra)) {
  src = src.replace("  const NP_EXTRA = {\n", `  const NP_EXTRA = {\n${line(id, names)}\n`);
}
fs.writeFileSync(DATA, src);
console.log("Wrote the links into js/data.js.");
