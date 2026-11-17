const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../js/data.js");
const E = require("../js/engine.js");

const index = E.buildIndex(data);

test("dataset is well formed", () => {
  assert.equal(index.regions.length, 13);
  assert.equal(new Set(index.countries.map((c) => c.id)).size, index.countries.length, "country ids unique");
  for (const c of index.countries) {
    assert.equal(c.temps.length, 12, `${c.name} temps`);
    assert.ok(c.cost >= 1 && c.cost <= 5, `${c.name} cost`);
    assert.ok(c.best.every((m) => m >= 1 && m <= 12), `${c.name} months`);
    assert.ok(c.cities.length >= 1, `${c.name} cities`);
    assert.ok(["country", "microstate", "territory", "micronation"].includes(c.kind), `${c.name} kind`);
    if (c.kind !== "country") assert.ok(c.status, `${c.name} status`);
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
      assert.equal(days, Math.min(E.LENGTHS[length].days, c.country.maxDays), `${c.country.name} ${length}`);
      assert.equal(days + c.spareDays, E.LENGTHS[length].days);
      if (c.spareDays > 0) assert.ok(c.pairWith, `${c.country.name} should suggest somewhere for spare days`);
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

test("temperatures and distances show metric and imperial", () => {
  assert.equal(E.fmtTemp(24), "24°C (75°F)");
  assert.equal(E.fmtTemp(-2), "-2°C (28°F)");
  assert.equal(E.fmtDistance(1394), "1,400 km (870 mi)");
  assert.equal(E.fmtDistance(11234), "11,200 km (7,000 mi)");
  const r = E.recommend(index, { interests: { beach: 2 }, month: 1, climate: "hot", home: "uk", distance: "far" });
  const text = r.countries.flatMap((c) => [...c.reasons, ...c.warnings]).join(" | ");
  assert.match(text, /°C \(\d+°F\)/);
  assert.match(text, /km \([\d,]+ mi\)/);
  assert.doesNotMatch(text.replace(/°C \(-?\d+°F\)/g, "").replace(/km \([\d,]+ mi\)/g, ""), /°C|km/);
});

test("microstates, territories and micronations appear in results", () => {
  const r = E.recommend(index, { interests: { beach: 2, relax: 2 }, month: 2, climate: "hot", budget: 4 });
  const kinds = new Set(r.countries.map((c) => c.country.kind));
  for (const k of ["country", "microstate", "territory", "micronation"]) assert.ok(kinds.has(k), k);
  const top10 = r.countries.slice(0, 10).map((c) => c.country.kind);
  assert.ok(top10.includes("territory"), "Caribbean or Pacific territories should rank for luxury beach trips");
});

test("tiny places pair with their neighbour instead of filling a long trip", () => {
  const r = E.recommend(index, { interests: { culture: 2 }, length: "two" });
  const va = r.countries.find((c) => c.country.id === "va");
  assert.equal(va.itinerary.reduce((a, s) => a + s.days, 0), 1);
  assert.equal(va.spareDays, 13);
  assert.equal(va.pairWith.id, "it");
});

test("UNESCO World Heritage tags attach to real places", () => {
  const tagged = index.cities.filter((c) => c.unesco);
  assert.equal(tagged.length, Object.keys(data.UNESCO).length);
  for (const id of ["it-rome", "es-granada", "jp-nara", "mx-chichen-itza", "va-vatican-city"]) {
    assert.ok(index.cityById[id] && index.cityById[id].unesco, id);
  }
  assert.equal(index.cityById["th-phuket"].unesco, null);
  const r = E.recommend(index, { interests: { culture: 2 } });
  assert.ok(r.cities.find((c) => c.city.id === "it-rome").reasons.includes("UNESCO World Heritage Site"));
  assert.throws(() => E.buildIndex({ ...data, UNESCO: { "zz-nowhere": "Fake" } }), /matches no place/);
});

test("every destination has an LGBTQ+ note and family tags resolve", () => {
  for (const c of index.countries) {
    assert.ok(c.lgbtq && ["welcoming", "mixed", "caution"].includes(c.lgbtq.level), c.name);
    assert.ok(c.lgbtq.note.length > 10, c.name);
  }
  assert.equal(index.cities.filter((c) => c.family).length, Object.keys(data.FAMILY).length);
  assert.throws(() => E.buildIndex({ ...data, FAMILY: { "zz-nowhere": "x" } }), /matches no place/);
});

test("families get family-friendly places nudged up", () => {
  const base = { interests: { beach: 1, nature: 1 }, month: 7 };
  const couple = E.recommend(index, { ...base, company: "couple" });
  const family = E.recommend(index, { ...base, company: "family" });
  const share = (r) => r.cities.slice(0, 20).filter((c) => c.city.family).length;
  assert.ok(share(family) >= share(couple));
  assert.ok(family.cities.find((c) => c.city.family).reasons.includes("Family friendly"));
});

test("every sovereign country is included", () => {
  const sovereign = index.countries.filter((c) => c.kind === "country" || c.kind === "microstate");
  // 193 UN members plus Vatican City, Palestine, Taiwan and Kosovo.
  assert.equal(sovereign.length, 197);
  for (const id of ["de", "ng", "kz", "tv", "va", "ps", "tw", "xk", "ss", "kp"]) assert.ok(index.countryById[id], id);
});

test("do-not-travel destinations are hidden unless requested", () => {
  const prefs = { interests: { culture: 2 } };
  const r = E.recommend(index, prefs);
  assert.ok(r.countries.every((c) => !c.country.advisory || c.country.advisory.level !== "avoid"));
  assert.ok(r.hiddenAvoid.length >= 15);
  const all = E.recommend(index, prefs, { includeAvoid: true });
  const sy = all.countries.find((c) => c.country.id === "sy");
  assert.ok(sy && sy.warnings[0] === "Travel advisory: avoid all travel");
  assert.equal(all.hiddenAvoid.length, 0);
  const il = r.countries.find((c) => c.country.id === "il");
  assert.equal(il.warnings[0], "Travel advisory: reconsider travel");
});

test("share codes round-trip with the newest region excluded", () => {
  const p = { interests: { culture: 1 }, home: "caribbean", exclude: ["wne", "cas"] };
  const code = E.encodePrefs(p, index);
  assert.deepEqual(E.decodePrefs(code, index), E.normalizePrefs(p));
  // Links made before the new region still decode.
  assert.ok(E.decodePrefs("r-110200000502120100000", index));
});

test("every country beyond Vatican City offers at least two places", () => {
  const sovereign = index.countries.filter((c) => c.kind === "country" || c.kind === "microstate");
  const single = sovereign.filter((c) => c.cities.length < 2).map((c) => c.id);
  assert.deepEqual(single, ["va"]);
});

test("daily spending is labelled in US dollars", () => {
  for (const v of Object.values(E.COST_DAILY)) assert.match(v, /US\$/);
  for (const b of Object.values(E.BUDGETS)) assert.match(b.range, /US\$/);
});

test("the US covers all 50 states plus D.C., and Canada all 13 provinces and territories", () => {
  const states = new Set(index.countryById.us.cities.map((c) => c.area));
  assert.equal(states.size, 51);
  assert.ok(states.has("District of Columbia") && states.has("Alaska") && states.has("Wyoming"));
  const provinces = new Set(index.countryById.ca.cities.map((c) => c.area));
  assert.equal(provinces.size, 13);
  assert.ok(index.countryById.us.cities.every((c) => c.area && c.temps && c.temps.length === 12));
});

test("places use their own climate when they have one", () => {
  const alaska = index.countryById.us.cities.find((c) => c.area === "Alaska");
  const miami = index.cityById["us-miami"];
  assert.ok(E.tempFor(alaska, 1) < 0 && E.tempFor(miami, 1) > 20);
});

test("every destination except micronations has capital and parks facts", () => {
  for (const c of index.countries) {
    if (c.kind === "micronation") continue;
    assert.ok(c.facts && c.facts.capital && c.facts.parks.length >= 1, c.name);
    assert.equal(c.facts.hub, undefined, c.name);
  }
  const tag = (id) => index.countryById[id].cities.filter((x) => x.isCapital).map((x) => x.name);
  assert.deepEqual(tag("fr"), ["Paris"]);
  assert.deepEqual(tag("us"), ["Washington, D.C."]);
  assert.deepEqual(tag("ca"), ["Ottawa"]);
  assert.deepEqual(tag("pf"), ["Tahiti"]);
  assert.deepEqual(tag("ch"), ["Bern"]);
});

test("US National Park System and Parks Canada sites are loaded", () => {
  const us = index.countryById.us.sites;
  const ca = index.countryById.ca.sites;
  assert.ok(us.length >= 430, `US sites: ${us.length}`);
  for (const n of ["Yellowstone National Park", "Statue of Liberty National Monument", "Manzanar National Historic Site", "Blue Ridge Parkway", "Cape Cod National Seashore"]) {
    assert.ok(us.some((x) => x.name === n), n);
  }
  assert.ok(us.filter((x) => x.type === "National Park").length >= 63);
  assert.ok(us.every((x) => x.system === "US National Park System" && x.area));
  assert.equal(ca.filter((x) => x.type === "National Park").length, 37);
  assert.ok(ca.filter((x) => x.type === "National Historic Site").length >= 160);
  for (const n of ["Pituamkek National Park Reserve", "Rouge National Urban Park", "Fortress of Louisbourg National Historic Site", "Fort Langley National Historic Site"]) {
    assert.ok(ca.some((x) => x.name === n), n);
  }
  assert.equal(new Set(us.map((x) => x.name)).size, us.length, "no duplicate US sites");
  assert.equal(new Set(ca.map((x) => x.name)).size, ca.length, "no duplicate Canadian sites");
});

test("no UNESCO Biosphere Reserve data remains", () => {
  assert.equal(data.BIOSPHERE, undefined);
  assert.ok(index.countries.every((c) => c.biosphere === undefined));
  const text = JSON.stringify(data.COUNTRIES) + JSON.stringify(data.FACTS);
  assert.doesNotMatch(text, /biosphere/i);
});
