// Checks on the data files in data/: the build is current, the files are tidy, every
// place is complete, and the links between files point at real places.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const F = require("../tools/data-files.js");
const { build, OUT } = require("../tools/build-data.js");
const E = require("../js/engine.js");
const data = require("../js/data.js");
const index = E.buildIndex(data);

const files = (dir = F.DIR) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const jsonFiles = files().filter((f) => f.endsWith(".json"));

test("js/data.js is built from the current data/ files", () => {
  assert.equal(fs.readFileSync(OUT, "utf8"), build(), "js/data.js is out of date. Run: npm run build");
});

test("every data file is tidy JSON in the standard layout", () => {
  for (const f of jsonFiles) {
    const text = fs.readFileSync(f, "utf8");
    const value = JSON.parse(text);
    assert.equal(text, F.format(value) + "\n", `${path.relative(F.DIR, f)} is not in the standard layout. Rewrite it with tools/data-files.js.`);
  }
});

test("data files have no em dashes", () => {
  for (const f of files()) assert.ok(!/—/.test(fs.readFileSync(f, "utf8")), `${path.relative(F.DIR, f)} has an em dash`);
});

test("every place has coordinates, a climate range and plausible values", () => {
  for (const c of index.cities) {
    assert.ok(c.ll && Math.abs(c.ll[0]) <= 90 && Math.abs(c.ll[1]) <= 180, `${c.id} coordinates`);
    assert.ok(c.ranges && c.ranges.length === 12 && c.ranges.every((r) => r >= 0 && r <= 30), `${c.id} climate range`);
    assert.match(c.tags ? Object.values(c.tags).join("") : "", /^[0-5]{8}$/, `${c.id} tags`);
    assert.ok(c.blurb && c.blurb.length >= 10, `${c.id} blurb`);
    const temps = c.temps || c.country.temps;
    assert.ok(temps.length === 12 && temps.every((t) => t > -40 && t < 50), `${c.id} temperatures`);
  }
});

test("every map keyed by place id points at a real place", () => {
  // buildIndex refuses unknown ids in most maps; these are checked here too.
  for (const key of ["COORDS", "RANGES", "AREAS", "UNESCO", "FAMILY", "REMOTE", "MICRONATIONS", "GEOPARKS", "BIOSPHERES", "FESTIVALS", "NP_EXTRA", "HISTORIC_EXTRA"]) {
    for (const id of Object.keys(data[key])) assert.ok(index.cityById[id], `${key}: ${id} matches no place`);
  }
  for (const [site, [id]] of Object.entries(data.NEAREST_PLACE)) assert.ok(index.cityById[id], `NEAREST_PLACE: ${site} -> ${id}`);
  // Every place has exactly one coordinate and one range entry.
  assert.equal(Object.keys(data.COORDS).length, index.cities.length);
  assert.equal(Object.keys(data.RANGES).length, index.cities.length);
});

test("each destination file is named after its id and listed once", () => {
  const order = F.readJSON("countries/order.json");
  assert.equal(new Set(order).size, order.length);
  const onDisk = fs.readdirSync(path.join(F.DIR, "countries")).filter((f) => f !== "order.json").map((f) => f.replace(/\.json$/, ""));
  assert.deepEqual([...onDisk].sort(), [...order].sort());
  for (const id of order) assert.equal(F.readJSON(`countries/${id}.json`).id, id);
});
