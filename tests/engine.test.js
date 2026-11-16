const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../js/data.js");
const E = require("../js/engine.js");

const index = E.buildIndex(data);

test("dataset is well formed", () => {
  assert.equal(index.regions.length, 12);
  for (const c of index.countries) {
    assert.equal(c.temps.length, 12, `${c.name} temps`);
    assert.ok(c.cost >= 1 && c.cost <= 5, `${c.name} cost`);
    assert.ok(c.best.every((m) => m >= 1 && m <= 12), `${c.name} months`);
    assert.ok(c.cities.length >= 2, `${c.name} cities`);
  }
  assert.equal(new Set(index.cities.map((c) => c.id)).size, index.cities.length, "city ids unique");
});

test("beach lovers in January get tropical picks", () => {
  const r = E.recommend(index, { interests: { beach: 2, relax: 1 }, month: 1, climate: "hot", budget: 2 });
  const topRegions = r.regions.slice(0, 3).map((x) => x.region.id);
  assert.ok(topRegions.includes("sea"), topRegions.join());
  assert.ok(r.cities[0].city.tags.beach >= 4);
});

test("winter-sun seekers do not get Norway in January", () => {
  const r = E.recommend(index, { interests: { beach: 2 }, month: 1, climate: "hot" });
  const rank = r.countries.findIndex((c) => c.country.id === "no");
  assert.ok(rank > r.countries.length / 2);
});

test("excluded regions are removed", () => {
  const r = E.recommend(index, { exclude: ["sea", "eas"] });
  assert.ok(r.countries.every((c) => !["sea", "eas"].includes(c.country.region)));
  assert.ok(r.regions.every((x) => !["sea", "eas"].includes(x.region.id)));
});

test("near preference favours nearby countries", () => {
  const r = E.recommend(index, { interests: { culture: 1 }, home: "uk", distance: "near" });
  const uk = index.homes.find((h) => h.id === "uk");
  for (const c of r.countries.slice(0, 5)) {
    const km = E.haversineKm(uk.lat, uk.lon, c.country.lat, c.country.lon);
    assert.ok(km < 3500, `${c.country.name} is ${Math.round(km)} km away`);
  }
});

test("itinerary fills the whole trip", () => {
  for (const length of Object.keys(E.LENGTHS)) {
    const r = E.recommend(index, { length });
    for (const c of r.countries) {
      const days = c.itinerary.reduce((a, s) => a + s.days, 0);
      assert.equal(days, E.LENGTHS[length].days, `${c.country.name} ${length}`);
    }
  }
});

test("scores stay within 0-100", () => {
  const r = E.recommend(index, { interests: { nightlife: 2 }, budget: 1, climate: "cool", vibe: "hidden", month: 7 });
  for (const c of r.cities) assert.ok(c.score >= 0 && c.score <= 100);
});

test("preferences survive a share-link round trip", () => {
  const p = { interests: { food: 2, nature: 1 }, month: 9, length: "two", budget: 3, climate: "mild", company: "family", vibe: "hidden", home: "eu-w", distance: "far", exclude: ["oce"] };
  const code = E.encodePrefs(p, index);
  assert.match(code, /^[A-Za-z0-9-]+$/);
  assert.deepEqual(E.decodePrefs(code, index), E.normalizePrefs(p));
  assert.equal(E.decodePrefs("r-garbage", index), null);
});

test("month ranges wrap around the new year", () => {
  assert.equal(E.formatMonths([11, 12, 1, 2]), "Nov–Feb");
  assert.equal(E.formatMonths([4, 5, 6, 9, 10]), "Apr–Jun, Sep–Oct");
});
