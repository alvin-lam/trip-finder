/*
 * Where each part of the dataset lives in data/, and how to read and write it.
 * Used by tools/build-data.js (which assembles js/data.js) and by the tools that
 * update the data (tools/unesco/link.js, tools/parks/link_sites.js).
 */
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "data");

// Dataset key -> file in data/. COUNTRIES, PARK_SYSTEMS and SITE_PLACES are split
// further below. The order here is the order of the keys in js/data.js.
const FILES = {
  INTERESTS: "core/interests.json",
  REGIONS: "core/regions.json",
  COUNTRIES: null, // countries/order.json and countries/<id>.json
  HOMES: "core/homes.json",
  UNESCO: "unesco/world-heritage.json",
  LGBTQ: "facts/lgbtq.json",
  FAMILY: "facts/family.json",
  ADVISORY: "facts/advisory.json",
  FACTS: "facts/capitals-and-parks.json",
  PARK_SYSTEMS: null, // parks/systems/<country>.json
  US_METROS: "metros/us.json",
  PR_METROS: "metros/pr.json",
  CA_METROS: "metros/ca.json",
  MX_METROS: "metros/mx.json",
  SITE_PLACES: null, // parks/site-places.json (by hand) + parks/site-places-generated.json
  NP_EXTRA: "parks/np-extra.json",
  LINKED: "places/linked.json",
  COORDS: "places/coords.json",
  AREAS: "places/areas.json",
  AREA_TERMS: "places/area-terms.json",
  MICRONATIONS: "places/micronations.json",
  RANGES: "places/ranges.json",
  GEOPARKS: "unesco/geoparks.json",
  BIOSPHERES: "unesco/biosphere-reserves.json",
  COUNTRY_ALIASES: "places/country-aliases.json",
  REMOTE: "places/remote.json",
  FESTIVALS: "festivals.json",
  HISTORIC_EXTRA: "parks/historic-extra.json",
  NEAREST_PLACE: "parks/nearest-place.json",
};
const SITE_PLACES_HAND = "parks/site-places.json";
const SITE_PLACES_GENERATED = "parks/site-places-generated.json";

// A record such as a place tuple ["Reykjavík", "03333224", 4, "...", null, {"temps": [...]}]:
// an array of plain values, lists of plain values, or small objects of those.
const plain = (v) => v === null || typeof v !== "object" || (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"));
const isRecord = (v) => Array.isArray(v) && v.every((x) => plain(x) || (!Array.isArray(x) && Object.values(x).every(plain)));

/** JSON that stays readable: one line per record (a place, a festival, a coordinate pair). */
function format(value, indent = "") {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== "object" || flat.length + indent.length <= 120 || isRecord(value)) return flat;
  const inner = indent + "  ";
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + format(v, inner)).join(",\n")}\n${indent}]`;
  return `{\n${Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`).join(",\n")}\n${indent}}`;
}

const file = (rel) => path.join(DIR, rel);
const readJSON = (rel) => JSON.parse(fs.readFileSync(file(rel), "utf8"));
function writeJSON(rel, value) {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), format(value) + "\n");
}

/** The whole dataset, as js/data.js exports it. */
function load({ withGeneratedSitePlaces = true } = {}) {
  const data = {};
  for (const [key, rel] of Object.entries(FILES)) {
    if (key === "COUNTRIES") data.COUNTRIES = readJSON("countries/order.json").map((id) => readJSON(`countries/${id}.json`));
    else if (key === "PARK_SYSTEMS") {
      data.PARK_SYSTEMS = {};
      for (const id of readJSON("parks/systems/order.json")) data.PARK_SYSTEMS[id] = readJSON(`parks/systems/${id}.json`);
    } else if (key === "SITE_PLACES") data.SITE_PLACES = { ...(withGeneratedSitePlaces ? readJSON(SITE_PLACES_GENERATED) : {}), ...readJSON(SITE_PLACES_HAND) };
    else data[key] = readJSON(rel);
  }
  return data;
}

/** Write one dataset key back to its file (not COUNTRIES or PARK_SYSTEMS). */
function save(key, value) {
  if (!FILES[key]) throw new Error(`save: ${key} is not a single-file dataset`);
  writeJSON(FILES[key], value);
}

module.exports = { DIR, FILES, SITE_PLACES_HAND, SITE_PLACES_GENERATED, format, readJSON, writeJSON, load, save };
