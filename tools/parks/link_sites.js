#!/usr/bin/env node
/*
 * Links park system sites that have no place of their own to a gateway place
 * within about 1.5 hours (110 km in a straight line), and writes the links into
 * the data/ files (then run npm run build):
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
 * place in the same country go in data/parks/site-places-generated.json; links to a
 * place in one of the country's territories (a US site in Puerto Rico) go in
 * data/parks/historic-extra.json (or np-extra.json); unlinked sites get their nearest
 * place in data/parks/nearest-place.json.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const E = require(path.join(ROOT, "docs", "js", "engine.js"));
const coords = JSON.parse(fs.readFileSync(path.join(__dirname, "site_coords.json"), "utf8"));

const REACH_KM = 110;
// US and Canadian park kinds: not linked here beyond their own rules, but those with no
// place nearby get a nearest place for the "No place nearby" card.
const PARKS = /^National (Park( Reserve)?|Monument|Preserve|Reserve|Recreation Area|Seashore|Lakeshore)$/;
const HISTORIC = /^(National (Historic Site|Historical Park|Memorial|Battlefield( Park| Site)?|Military Park)|International Historic Site)$/;

const km = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// Build the index without earlier generated links, so a rerun starts fresh.
const F = require(path.join(ROOT, "tools", "data-files.js"));
const index = E.buildIndex({ ...F.load({ withGeneratedSitePlaces: false }), HISTORIC_EXTRA: {}, NEAREST_PLACE: {} });

const sitePlaces = {}; // site name -> [place names] (same country)
const historicExtra = {}; // place id -> [site names] (a territory's place)
const npExtra = {}; // place id -> [site names] (a territory's place, Mexico parks)
const tally = { historic: [0, 0], mxpark: [0, 0], park: [0, 0] };
const unlinked = [];
const nearest = {}; // site name -> [place id, km], for sites with no place within reach

for (const cid of ["us", "ca", "mx"]) {
  const c = index.countryById[cid];
  for (const site of c.sites || []) {
    const kind = HISTORIC.test(site.type) ? "historic" : cid === "mx" ? "mxpark" : PARKS.test(site.type) ? "park" : null;
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
      if (best) nearest[site.name] = [best.x.id, Math.round(best.d)];
      continue;
    }
    if (kind === "park") {
      // Parks keep their own linking rules: an unlinked park gets only a nearest place.
      unlinked.push(site.name);
      nearest[site.name] = [best.x.id, Math.round(best.d)];
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
console.log(`${unlinked.length} sites stay unlinked; ${Object.keys(nearest).length} of them get a nearest place.`);
if (process.argv.includes("--dry")) process.exit(0);

const sorted = (map, flat) => Object.fromEntries(Object.keys(map).sort().map((k) => [k, flat && map[k].length === 1 ? map[k][0] : map[k]]));
// SITE_PLACES values are always lists of place names.
F.writeJSON(F.SITE_PLACES_GENERATED, sorted(sitePlaces, false));
F.save("HISTORIC_EXTRA", sorted(historicExtra, true));
F.save("NEAREST_PLACE", sorted(nearest, false));
// Mexico parks in a territory are not expected; NP_EXTRA is only extended if one appears.
if (Object.keys(npExtra).length) F.save("NP_EXTRA", { ...F.readJSON(F.FILES.NP_EXTRA), ...sorted(npExtra, true) });
console.log("Wrote data/parks/site-places-generated.json, historic-extra.json and nearest-place.json. Run npm run build.");
