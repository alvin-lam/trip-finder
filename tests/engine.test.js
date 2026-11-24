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
    assert.ok(["country", "microstate", "territory"].includes(c.kind), `${c.name} kind`);
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

test("microstates and territories appear in results", () => {
  const r = E.recommend(index, { interests: { beach: 2, relax: 2 }, month: 2, climate: "hot", budget: 4 });
  const kinds = new Set(r.countries.map((c) => c.country.kind));
  for (const k of ["country", "microstate", "territory"]) assert.ok(kinds.has(k), k);
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
  assert.ok(r.cities.find((c) => c.city.id === "it-rome").reasons.includes("World Heritage Site"));
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

test("every destination has capital and parks facts", () => {
  for (const c of index.countries) {
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

test("UNESCO Global Geoparks and Biosphere Reserves link to nearby places", () => {
  const fs = require("node:fs");
  const geo = JSON.parse(fs.readFileSync(`${__dirname}/../tools/unesco/geoparks.json`, "utf8"));
  const bio = JSON.parse(fs.readFileSync(`${__dirname}/../tools/unesco/biosphere-reserves.json`, "utf8"));
  // UNESCO's own totals, and every site has a centre.
  assert.equal(geo.count, geo.stated_total);
  assert.equal(bio.count, bio.stated_total);
  assert.ok(geo.geoparks.every((g) => typeof g.lat === "number") && bio.reserves.every((r) => typeof r.lat === "number"));
  const withGeo = index.cities.filter((c) => c.geopark).length;
  const withBio = index.cities.filter((c) => c.biosphere).length;
  assert.ok(withGeo >= 150 && withBio >= 500, `${withGeo} geopark places, ${withBio} biosphere places`);
  assert.match(index.cityById["es-lanzarote"].geopark, /Lanzarote and Chinijo Islands/);
  assert.match(index.cityById["es-lanzarote"].biosphere, /Lanzarote/);
  assert.match(index.cityById["us-yellowstone"].biosphere, /Yellowstone/);
  assert.match(index.cityById["cn-zhangjiajie"].geopark, /Zhangjiajie/);
  // Big cities far from any site stay unlabelled.
  for (const id of ["us-new-york-city", "gb-london", "jp-tokyo"]) assert.ok(!index.cityById[id].geopark && !index.cityById[id].biosphere, id);
  // A place near several sites lists them all.
  assert.ok(Object.values(data.BIOSPHERES).some(Array.isArray));
  // An entry attaches to its place, and an unknown id is refused.
  const withSites = E.buildIndex({ ...data, GEOPARKS: { "ie-galway-connemara": "Test Geopark" }, BIOSPHERES: { "ie-dublin": "Test Reserve" } });
  assert.equal(withSites.cityById["ie-galway-connemara"].geopark, "Test Geopark");
  assert.equal(withSites.cityById["ie-dublin"].biosphere, "Test Reserve");
  assert.throws(() => E.buildIndex({ ...data, BIOSPHERES: { "zz-nowhere": "x" } }), /matches no place/);
});

test("all 387 US metro areas are each linked to a place", () => {
  assert.equal(data.US_METROS.length, 387);
  assert.deepEqual(data.US_METROS.map((m) => m[0]), Array.from({ length: 387 }, (_, i) => i + 1));
  const us = index.countryById.us.cities;
  assert.equal(us.flatMap((c) => c.metros).length, 387);
  const place = (rank) => us.find((c) => c.metros.some((m) => m.rank === rank));
  assert.equal(place(1).name, "New York City");
  assert.equal(place(100).name, "New Haven");
  assert.equal(place(299).name, "Grand Canyon");
  assert.equal(place(387).name, "Carson City");
  assert.ok(us.every((c) => c.area && c.temps && c.temps.length === 12));
  assert.equal(new Set(us.map((c) => c.name)).size, us.length, "US place names are unique");
});

test("Puerto Rico's 6 and Mexico's 74 metro areas are each linked to a place", () => {
  assert.equal(index.countryById.pr.cities.flatMap((c) => c.metros).length, 6);
  const mx = index.countryById.mx.cities;
  assert.equal(mx.flatMap((c) => c.metros).length, 74);
  assert.equal(new Set(mx.map((c) => c.area)).size, 32, "every Mexican state has a place");
  assert.ok(mx.every((c) => c.area && c.temps));
  const tij = mx.find((c) => c.name === "Tijuana");
  assert.ok(E.tempFor(tij, 7) < E.tempFor(mx.find((c) => c.name === "Mexicali"), 7));
});

test("all 41 Canadian census metropolitan areas are each linked to a place", () => {
  assert.equal(data.CA_METROS.length, 41);
  assert.deepEqual(data.CA_METROS.map((m) => m[0]), Array.from({ length: 41 }, (_, i) => i + 1));
  const ca = index.countryById.ca.cities;
  assert.equal(ca.flatMap((c) => c.metros).length, 41);
  const place = (rank) => ca.find((c) => c.metros.some((m) => m.rank === rank));
  assert.equal(place(1).name, "Toronto");
  assert.equal(place(4).name, "Ottawa");
  assert.equal(place(41).name, "Red Deer");
  assert.ok(ca.every((c) => c.area && c.temps));
});

test("national parks are labelled on the places that hold them", () => {
  const parks = (id) => index.cityById[id].nationalParks;
  assert.deepEqual(parks("us-yellowstone").sort(), ["Grand Teton National Park", "Yellowstone National Park"]);
  assert.deepEqual(parks("us-utah-national-parks").sort(), ["Arches National Park", "Bryce Canyon National Park", "Canyonlands National Park", "Capitol Reef National Park", "Zion National Park"]);
  assert.ok(parks("ca-banff").includes("Banff National Park"));
  assert.ok(parks("us-fort-collins").includes("Rocky Mountain National Park"));
  assert.ok(parks("cl-torres-del-paine").length);
  assert.equal(parks("us-greeley").length, 0);
  // National monuments and recreation areas count too: the Statue of Liberty, Stonewall and Gateway.
  assert.ok(parks("us-new-york-city").includes("Statue of Liberty National Monument"));
  assert.ok(index.cities.filter((c) => c.nationalParks.length).length > 100);
});

test("Puerto Rico places are grouped by informal region", () => {
  const pr = index.countryById.pr.cities;
  assert.ok(pr.every((c) => c.area));
  assert.equal(new Set(pr.map((c) => c.area)).size, 7);
  assert.equal(index.cityById["pr-culebra"].area, "Vieques & Culebra");
});

test("UK places are grouped by England, Scotland, Wales and Northern Ireland", () => {
  const gb = index.countryById.gb.cities;
  assert.deepEqual([...new Set(gb.map((c) => c.area))].sort(), ["England", "Northern Ireland", "Scotland", "Wales"]);
  assert.equal(index.cityById["gb-stonehenge"].area, "England");
  assert.ok(index.cityById["gb-stonehenge"].unesco.startsWith("Stonehenge"));
});

test("every UNESCO World Heritage Site in the US, Canada and Mexico has a place", () => {
  // A shared site's single place counts for every country it is listed under.
  const sites = (ids) =>
    new Set(index.cities.filter((c) => c.unesco && (ids.includes(c.country.id) || c.alsoIn.some((o) => ids.includes(o.id)))).map((c) => c.unesco));
  // The US list includes La Fortaleza in Puerto Rico.
  assert.equal(sites(["us", "pr"]).size, 27);
  assert.equal(sites(["ca"]).size, 22);
  assert.equal(sites(["mx"]).size, 36);
  assert.equal(index.cityById["mx-teotihuacan"].area, "State of Mexico");
  assert.equal(index.cityById["us-mesa-verde-national-park"].area, "Colorado");
  assert.equal(index.cityById["ca-lunenburg"].unesco, "Old Town Lunenburg");
  assert.deepEqual(index.cityById["us-hawai-i-volcanoes-national-park"].nationalParks.length, 1);
});

test("shared World Heritage Sites keep one place listed under each country", () => {
  const forest = index.cityById["by-bia-owieza-forest"];
  assert.deepEqual(forest.alsoIn.map((c) => c.id), ["pl"]);
  assert.ok(index.countryById.pl.linked.includes(forest));
  assert.equal(index.cityById["ua-carpathians"].alsoIn.length, 17);
  const moravian = index.cityById["de-moravian-church-settlements"];
  assert.deepEqual(moravian.alsoIn.map((c) => c.id).sort(), ["dk", "gb", "us"]);
  assert.equal(index.cityById["us-lehigh-valley-allentown-bethlehem"].unesco, null);
});

test("every World Heritage Site has a place", () => {
  const sites = new Set(index.cities.filter((c) => c.unesco).map((c) => c.unesco));
  assert.ok(sites.size >= 1200, `${sites.size} distinct sites`);
  assert.equal(index.cityById["eg-pyramids-of-giza"].unesco.startsWith("Memphis"), true);
  assert.equal(index.cityById["gb-hadrian-s-wall"].area, "England");
});

test("Also in lists nearby places first", () => {
  const potsdam = index.cityById["de-potsdam"];
  assert.ok(potsdam.ll, "Potsdam has coordinates");
  const near = E.nearestPlaces(potsdam, potsdam.country.cities.concat(potsdam.country.linked));
  assert.ok(!near.some((x) => x.city === potsdam));
  assert.ok(near[0].km < 50, `${near[0].city.name} is ${near[0].km} km away`);
  for (let k = 1; k < near.length && near[k].km !== null; k++) assert.ok(near[k].km >= near[k - 1].km);
  assert.equal(E.fmtDistance(4), "4 km (2 mi)");
  const withLL = index.cities.filter((c) => c.ll).length;
  assert.equal(withLL, index.cities.length, "every place has coordinates");
});

test("places in the grouped countries all have a subdivision", () => {
  for (const id of ["de", "fr", "it", "es", "nl", "ch", "hk", "cn", "jp", "kr", "is", "za", "tw", "th", "sg", "in", "br", "ru", "ir", "tr", "au", "gr", "pl", "pt", "se", "ar", "pe", "be", "cz", "id", "ma", "et", "dk", "bg", "vn", "ph", "lk", "ke", "co", "at", "fi", "nz", "mn", "pa", "tz", "sk", "ua", "ge", "uz", "tj", "kh", "lb", "sa", "om", "mg", "ec", "ae", "jm", "pf", "bo", "il", "pk", "cr", "cl", "hr", "eg", "kz", "no", "ro", "cu", "hu", "jo", "tn", "my", "af", "ag", "al", "am", "aw", "az", "ba", "bb", "bd", "bh", "bm", "bn", "bq", "bs", "bt", "by", "bz", "cw", "cy", "dm", "do", "ee", "fk", "fo", "gd", "gf", "gg", "gl", "gp", "gt", "gy", "hn", "ht", "ie", "im", "iq", "je", "kg", "kn", "kp", "kw", "ky", "la", "lc", "lt", "lv", "md", "me", "mk", "mm", "mq", "ms", "mv", "ni", "np", "ps", "py", "qa", "rs", "si", "sj", "sr", "sv", "sy", "tc", "tl", "tm", "tt", "uy", "vc", "ve", "vg", "vi", "xb", "xk", "ye"]) {
    const c = index.countryById[id];
    assert.ok(c.areaTerm, `${c.name} has a term`);
    assert.ok(c.cities.every((x) => x.area), `${c.name} places all have a subdivision`);
  }
  assert.equal(index.countryById.es.areaTerm, "autonomous communities");
  assert.equal(index.cityById["es-barcelona"].area, "Catalonia");
  assert.equal(index.cityById["de-berlin"].area, "Berlin");
  assert.equal(index.cityById["hk-sai-kung"].area, "New Territories");
});

test("territories, microstates and micronations link to their countries", () => {
  const C = index.countryById;
  assert.deepEqual(C.gb.territories.map((t) => t.id).sort(), ["ai", "bm", "fk", "gg", "gi", "gs", "im", "io", "je", "ky", "ms", "pn", "sh", "tc", "vg", "xb"]);
  for (const c of index.countries) assert.equal(c.kind === "territory", !!c.sovereignCountry, c.name);
  assert.equal(C.mo.sovereignCountry, C.cn);
  assert.deepEqual(C.it.nearbyMicrostates.map((m) => m.id).sort(), ["sm", "va"]);
  assert.deepEqual(C.ch.nearbyMicrostates.map((m) => m.id), ["li"]);
  assert.deepEqual(C.es.nearbyMicrostates.map((m) => m.id), ["ad"]);
  for (const id of ["va", "sm", "mc", "li"]) assert.ok(C[id].visitFrom, id);
  const micro = index.countries.flatMap((c) => c.cities).filter((x) => x.micronation).map((x) => x.id).sort();
  assert.deepEqual(micro, ["dk-freetown-christiania", "it-seborga", "lt-uzupis", "se-ladonia-nimis-arx"]);
  assert.equal(index.cityById["mt-al-saflieni-hypogeum"].area, "Malta");
});

test("every place has a typical low below its high", () => {
  for (const c of index.countries)
    for (const x of c.cities) {
      assert.ok(x.ranges && x.ranges.length === 12, `${x.id} ranges`);
      for (let m = 1; m <= 12; m++) assert.ok(E.lowFor(x, m) < E.tempFor(x, m), `${x.id} month ${m}`);
    }
  const kyoto = index.cityById["jp-kyoto"];
  assert.ok(E.lowFor(kyoto, 1) <= 3 && E.lowFor(kyoto, 8) >= 20, "Kyoto lows look plausible");
});

test("Hong Kong and Macau country parks count as national parks", () => {
  const np = (id) => index.cityById[id].nationalParks;
  assert.deepEqual(np("hk-sai-kung"), ["Sai Kung East Country Park", "Sai Kung West Country Park"]);
  assert.deepEqual(np("hk-dragon-s-back"), ["Shek O Country Park"]);
  assert.deepEqual(np("mo-hac-sa-beach"), ["Hac Sa Reservoir Country Park"]);
  for (const id of Object.keys(data.NP_EXTRA)) assert.ok(index.cityById[id], `NP_EXTRA ${id} matches a place`);
});

test("Taiwan, South Korea and Japan parks and scenic areas are tagged", () => {
  const np = (id) => index.cityById[id].nationalParks;
  assert.deepEqual(np("tw-alishan"), ["Alishan National Scenic Area"]);
  assert.ok(np("tw-hualien-taroko-gorge").includes("Taroko National Park"));
  assert.deepEqual(np("kr-seoraksan"), ["Seoraksan National Park"]);
  assert.deepEqual(np("jp-hakone"), ["Fuji-Hakone-Izu National Park"]);
  const tagged = (c) => index.countryById[c].cities.filter((x) => x.nationalParks.length).length;
  assert.deepEqual([tagged("tw"), tagged("kr"), tagged("jp")], [8, 6, 10]);
});

test("US, Canada and Mexico parks reach their gateway places", () => {
  const np = (id) => index.cityById[id].nationalParks;
  assert.ok(np("us-yellowstone").includes("Grand Teton National Park"));
  assert.deepEqual(np("ca-windsor"), ["Point Pelee National Park"]);
  assert.deepEqual(np("mx-tulum"), ["Tulum National Park"]);
  assert.deepEqual(np("mx-sian-ka-an"), ["Sian Ka'an Biosphere Reserve"]);
  const tagged = (c) => index.countryById[c].cities.filter((x) => x.nationalParks.length).length;
  assert.deepEqual([tagged("us"), tagged("ca"), tagged("mx")], [112, 23, 25]);
});

test("Saint Pierre and Miquelon is a French territory near Canada", () => {
  const pm = index.countryById.pm;
  assert.equal(pm.kind, "territory");
  assert.equal(pm.sovereignCountry, index.countryById.fr);
  assert.equal(pm.of, "ca");
  assert.deepEqual(pm.cities.filter((x) => x.isCapital).map((x) => x.name), ["Saint-Pierre"]);
});

test("overseas territories and crown dependencies are complete", () => {
  const C = index.countryById;
  const ids = (c) => C[c].territories.map((t) => t.id).sort();
  assert.deepEqual(ids("us"), ["as", "gu", "mp", "pr", "um", "vi"]);
  assert.deepEqual(ids("fr"), ["bl", "cp", "gf", "gp", "mf", "mq", "nc", "pf", "pm", "re", "tf", "wf", "yt"]);
  assert.deepEqual(ids("nl"), ["aw", "bq", "cw", "sx"]);
  assert.deepEqual(ids("au"), ["cc", "cx", "hm", "nf"]);
  assert.deepEqual(ids("nz"), ["ck", "nu", "tk"]);
  assert.deepEqual(ids("no"), ["bv", "sj"]);
  // Remote World Heritage places now sit in their own territories.
  assert.ok(index.cityById["pn-henderson-island"].unesco);
  assert.ok(index.cityById["sh-gough-and-inaccessible-islands"].unesco);
  assert.equal(index.cityById["gb-henderson-island"], undefined);
  assert.deepEqual(index.cityById["vi-st-john"].nationalParks, ["Virgin Islands National Park", "Virgin Islands Coral Reef National Monument"]);
});

test("Russia groups by federal district, and Crimea stays with Ukraine", () => {
  const area = (id) => index.cityById[id].area;
  assert.equal(index.countryById.ru.areaTerm, "federal districts");
  assert.equal(area("ru-saint-petersburg"), "Northwestern");
  assert.equal(area("ru-kizhi"), "Northwestern");
  assert.equal(area("ru-moscow"), "Central");
  assert.equal(area("ru-yekaterinburg"), "Ural");
  assert.equal(new Set(index.countryById.ru.cities.map((x) => x.area)).size, 8, "all 8 federal districts");
  // Occupied Ukrainian territory is listed under Ukraine, never Russia.
  assert.ok(index.countryById.ua.cities.some((x) => x.id === "ua-chersonesus"));
  const occupied = /crimea|sevastopol|chersones|yalta|bakhchys|simferopol|donetsk|luhansk|zaporizh|kherson|mariupol/i;
  assert.ok(!index.countryById.ru.cities.some((x) => occupied.test(`${x.name} ${x.blurb} ${x.area || ""}`)));
});

test("misplaced coordinates are fixed and Tunis keeps its World Heritage tag", () => {
  const near = (id, lat, lon) => {
    const [a, b] = index.cityById[id].ll;
    assert.ok(E.haversineKm(a, b, lat, lon) < 100, id);
  };
  near("vn-trang-an", 20.25, 105.9);
  near("th-kaeng-krachan", 12.8, 99.45);
  near("ma-tetouan", 35.57, -5.37);
  near("ro-frontiers-of-the-roman-empire-dacia", 47.18, 23.15);
  // Border-side places sit in their own country, and labels match their coordinates.
  near("us-manhattan-kansas", 39.18, -96.57);
  near("pe-lake-titicaca-puno", -15.84, -70.02);
  near("ar-san-ignacio-mini", -27.26, -55.53);
  near("ls-sani-pass", -29.59, 29.27);
  near("in-mountain-railways-of-india", 27.04, 88.27);
  near("cn-ming-tombs", 40.26, 116.22);
  assert.equal(index.cityById["au-australian-convict-sites"].area, "New South Wales");
  const tunis = index.cityById["tn-tunis-carthage"];
  assert.ok(tunis.isCapital && tunis.unesco.includes("Carthage"));
  assert.ok(index.cityById["tn-sidi-bou-said"].unesco);
});

test("destinations carry search codes and other names", () => {
  const C = index.countryById;
  assert.equal(C.fr.code, "FR");
  assert.equal(C.de.code, "DE");
  assert.equal(C.xb.code, null);
  assert.ok(C.us.aliases.includes("usa") && C.gb.aliases.includes("uk") && C.ae.aliases.includes("uae"));
  // Codes are unique, so a code search never lists two destinations.
  const codes = index.countries.map((c) => c.code).filter(Boolean);
  assert.equal(new Set(codes).size, codes.length);
  assert.throws(() => E.buildIndex({ ...data, COUNTRY_ALIASES: { zz: ["nowhere"] } }), /matches no destination/);
});

test("Ireland covers its main cities, sights and national parks", () => {
  const ie = index.countryById.ie;
  assert.equal(ie.cities.length, 19);
  for (const id of ["ie-cork", "ie-cliffs-of-moher-the-burren", "ie-glendalough-the-wicklow-mountains", "ie-rock-of-cashel"]) assert.ok(index.cityById[id], id);
  const parks = new Set(ie.cities.flatMap((x) => x.nationalParks));
  for (const np of ["Killarney", "Connemara", "Burren", "Wicklow Mountains", "Wild Nephin", "Glenveagh"]) assert.ok(parks.has(`${np} National Park`), np);
  assert.deepEqual([...new Set(ie.cities.map((x) => x.area))].sort(), ["Connacht", "Leinster", "Munster", "Ulster"]);
});

test("Iceland covers its main sights and all three national parks", () => {
  const is = index.countryById.is;
  assert.equal(is.cities.length, 14);
  assert.ok(index.cityById["is-blue-lagoon-reykjanes-peninsula"]);
  const parks = new Set(is.cities.flatMap((x) => x.nationalParks));
  for (const np of ["Þingvellir", "Vatnajökull", "Snæfellsjökull"]) assert.ok(parks.has(`${np} National Park`), np);
  // A World Heritage name that extends a park's name is not listed twice.
  assert.deepEqual(index.cityById["is-vatnajokull-national-park"].nationalParks, ["Vatnajökull National Park"]);
});

test("national forests are tagged as national parks", () => {
  for (const [id, name] of [["pr-el-yunque", "El Yunque National Forest"], ["cy-troodos-mountains", "Troodos National Forest Park"], ["cn-zhangjiajie", "Zhangjiajie National Forest Park"], ["us-alexandria-louisiana", "Kisatchie National Forest"]]) {
    assert.ok(index.cityById[id].nationalParks.includes(name), id);
  }
});

test("the UAE covers all seven emirates and its national parks", () => {
  const ae = index.countryById.ae;
  assert.deepEqual([...new Set(ae.cities.map((x) => x.area))].sort(), ["Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain"]);
  assert.deepEqual(index.cityById["ae-wadi-wurayah"].nationalParks, ["Wadi Wurayah National Park"]);
  assert.deepEqual(index.cityById["ae-abu-dhabi"].nationalParks, ["Mangrove National Park"]);
  assert.equal(ae.cities.filter((x) => x.unesco).length, 3);
});

test("no two places share coordinates except a site and its host city", () => {
  const seen = new Map();
  const shared = [];
  for (const [id, ll] of Object.entries(data.COORDS)) {
    const k = ll.join(",");
    if (seen.has(k)) shared.push(`${seen.get(k)}+${id}`);
    else seen.set(k, id);
  }
  assert.deepEqual(shared, ["be-belfries-of-belgium+be-ghent"]);
  assert.equal(index.cityById["gw-bijagos-islands"], undefined);
});

test("places without residents are labelled by how visitors reach them", () => {
  const r = (id) => index.cityById[id].remote;
  assert.equal(r("is-surtsey"), "uninhabited");
  assert.equal(r("um-wake-island"), "uninhabited");
  assert.equal(r("ie-skellig-michael"), "no-residents");
  assert.equal(r("bv-bouvet-island"), "expedition");
  assert.equal(r("gs-grytviken"), "expedition");
  // Inhabited places are not labelled, however remote.
  assert.equal(r("sh-tristan-da-cunha"), null);
  assert.equal(r("fr-paris"), null);
  for (const id of ["um", "cp", "bv", "hm", "tf", "gs", "io"]) assert.ok(index.countryById[id].cities.every((x) => x.remote), id);
  assert.throws(() => E.buildIndex({ ...data, REMOTE: { "zz-nowhere": "uninhabited" } }), /matches no place/);
  assert.throws(() => E.buildIndex({ ...data, REMOTE: { "fr-paris": "closed" } }), /unknown kind/);
});

test("Hong Kong covers its famous sights and major country parks", () => {
  const hk = index.countryById.hk;
  assert.equal(hk.cities.length, 28);
  for (const id of ["hk-ngong-ping-the-big-buddha", "hk-hong-kong-disneyland", "hk-ocean-park", "hk-wong-tai-sin-temple", "hk-west-kowloon-cultural-district"]) assert.ok(index.cityById[id], id);
  const parks = new Set(hk.cities.flatMap((x) => x.nationalParks));
  for (const cp of ["Tai Mo Shan", "Lion Rock", "Plover Cove", "Tai Tam", "Shing Mun", "Sai Kung East", "Lantau North", "Shek O", "Pok Fu Lam"]) assert.ok(parks.has(`${cp} Country Park`), cp);
  assert.ok(hk.cities.every((x) => ["Hong Kong Island", "Kowloon", "New Territories"].includes(x.area)));
});

test("Singapore covers its famous sights and all four nature reserves", () => {
  const sg = index.countryById.sg;
  assert.equal(sg.cities.length, 23);
  assert.ok(index.cityById["sg-gardens-by-the-bay"].family);
  const parks = new Set(sg.cities.flatMap((x) => x.nationalParks));
  for (const nr of ["Bukit Timah", "Central Catchment", "Sungei Buloh Wetland", "Labrador"]) assert.ok(parks.has(`${nr} ${nr.endsWith("Wetland") ? "Reserve" : "Nature Reserve"}`), nr);
  assert.ok(index.cityById["sg-singapore-botanic-gardens"].unesco);
});

test("festivals attach to places with valid months and notes", () => {
  const withFest = index.cities.filter((x) => x.festivals.length);
  assert.ok(withFest.length >= 90, `${withFest.length} places with festivals`);
  for (const x of withFest)
    for (const f of x.festivals) {
      assert.ok(f.name && f.note, `${x.id} festival text`);
      assert.ok(f.months.length && f.months.every((m) => m >= 1 && m <= 12), `${x.id} ${f.name} months`);
      assert.ok(!/—/.test(f.name + f.note), `${x.id} ${f.name} has no em dash`);
    }
  const names = (id) => index.cityById[id].festivals.map((f) => f.name);
  assert.ok(names("br-rio-de-janeiro").includes("Rio Carnival"));
  assert.ok(names("de-munich").includes("Oktoberfest"));
  assert.ok(names("mx-oaxaca").includes("Día de Muertos"));
  assert.deepEqual(index.cityById["fr-paris"].festivals.find((f) => f.name === "Bastille Day").months, [7]);
  assert.throws(() => E.buildIndex({ ...data, FESTIVALS: { "zz-nowhere": [["X", [1], "y"]] } }), /matches no place/);
  assert.throws(() => E.buildIndex({ ...data, FESTIVALS: { "fr-paris": [["X", [13], "y"]] } }), /bad months/);
});

test("Pride events are festivals marked pride", () => {
  const pride = index.cities.flatMap((x) => x.festivals.filter((f) => f.pride).map((f) => ({ id: x.id, ...f })));
  assert.ok(pride.length >= 110, `${pride.length} Pride events`);
  const find = (id, name) => index.cityById[id].festivals.find((f) => f.name === name);
  assert.deepEqual(find("br-rio-de-janeiro", "Rio Pride Parade").months, [11]);
  assert.deepEqual(find("tw-taipei", "Taiwan Pride").months, [10]);
  assert.deepEqual(find("jp-tokyo", "Tokyo Pride").months, [6]);
  assert.ok(find("mx-mexico-city", "Marcha del Orgullo").pride);
  assert.ok(find("au-sydney", "Sydney Gay & Lesbian Mardi Gras").pride);
  // Other festivals stay unmarked, including New Orleans Mardi Gras.
  assert.equal(find("us-new-orleans", "Mardi Gras").pride, false);
  assert.equal(find("de-munich", "Oktoberfest").pride, false);
  // Hong Kong has held no street parade since 2018, so it has no Pride event.
  assert.ok(!index.cities.some((x) => x.country.id === "hk" && x.festivals.some((f) => f.pride)));
  assert.throws(() => E.buildIndex({ ...data, FESTIVALS: { "fr-paris": [["X", [6], "y", "parade"]] } }), /unknown kind/);
});

test("Brighton, Manchester, Gran Canaria and Sitges are listed with Pride events", () => {
  const c = (id) => index.cityById[id];
  assert.equal(c("gb-brighton").area, "England");
  assert.equal(c("gb-manchester").area, "England");
  assert.equal(c("es-gran-canaria").area, "Canary Islands");
  assert.equal(c("es-sitges").area, "Catalonia");
  for (const id of ["gb-brighton", "gb-manchester", "es-gran-canaria", "es-sitges"]) {
    assert.ok(c(id).ll && c(id).ranges, `${id} coordinates and ranges`);
    assert.ok(c(id).festivals.some((f) => f.pride), `${id} Pride event`);
  }
  // Gran Canaria stays warm at night in winter.
  assert.ok(E.lowFor(c("es-gran-canaria"), 1) >= 15);
});

test("seasonal colors follow the local date, time zone and holidays", () => {
  const at = (iso, zone) => E.seasonalScheme(new Date(iso), zone).id;
  // Seasons flip south of the equator.
  assert.equal(at("2026-11-24T12:00:00Z", "America/Los_Angeles"), "autumn");
  assert.equal(at("2026-11-24T12:00:00Z", "Australia/Sydney"), "spring");
  assert.equal(at("2026-07-15T12:00:00Z", "Europe/Berlin"), "summer");
  assert.equal(at("2026-07-15T12:00:00Z", "America/Argentina/Buenos_Aires"), "winter");
  assert.equal(at("2027-01-20T12:00:00Z", "Pacific/Auckland"), "summer");
  // Holidays, on the visitor's own calendar date.
  assert.equal(at("2026-12-25T12:00:00Z", "Australia/Sydney"), "christmas");
  assert.equal(at("2026-12-31T20:00:00Z", "Pacific/Auckland"), "newyear"); // already 1 January there
  assert.equal(at("2026-12-31T20:00:00Z", "America/Los_Angeles"), "newyear");
  assert.equal(at("2026-12-28T12:00:00Z", "Europe/London"), "winter");
  assert.equal(at("2026-02-14T12:00:00Z", "Europe/Paris"), "valentine");
  assert.equal(at("2026-02-18T12:00:00Z", "Asia/Hong_Kong"), "lunar");
  assert.equal(at("2026-03-17T12:00:00Z", "Europe/Dublin"), "stpatrick");
  assert.equal(at("2026-04-05T12:00:00Z", "Europe/Rome"), "easter");
  assert.equal(at("2027-03-28T12:00:00Z", "Europe/Rome"), "easter"); // Easter Sunday 2027
  assert.equal(at("2026-06-20T12:00:00Z", "America/New_York"), "pride");
  assert.equal(at("2026-10-31T12:00:00Z", "America/Chicago"), "halloween");
  assert.equal(at("2026-11-08T12:00:00Z", "Asia/Kolkata"), "diwali");
  // Every scheme has light and dark accents with enough contrast for text.
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [id, s] of Object.entries(E.SEASON_SCHEMES)) {
    assert.ok(s.label && s.icon, id);
    assert.ok(ratio(s.light, "#ffffff") >= 4.5 && ratio(s.light, "#faf7f2") >= 4.5, `${id} light contrast`);
    assert.ok(ratio(s.dark, "#1a0f0a") >= 4.5 && ratio(s.dark, "#1c1f27") >= 4.5, `${id} dark contrast`);
  }
});

test("Christmas markets are festivals marked market", () => {
  const markets = index.cities.flatMap((x) => x.festivals.filter((f) => f.market).map((f) => ({ id: x.id, ...f })));
  assert.ok(markets.length >= 40, `${markets.length} Christmas markets`);
  for (const m of markets) {
    assert.ok(m.months.includes(12), `${m.id} ${m.name} runs in December`);
    assert.equal(m.pride, false);
  }
  const has = (id, name) => index.cityById[id].festivals.some((f) => f.market && f.name === name);
  assert.ok(has("hr-zagreb", "Advent in Zagreb"));
  assert.ok(has("de-munich", "Christmas markets"));
  assert.ok(has("us-chicago", "Christkindlmarket"));
  // Other festivals stay unmarked.
  assert.equal(index.cityById["de-munich"].festivals.find((f) => f.name === "Oktoberfest").market, false);
});

test("national monuments, preserves, reserves, recreation areas, seashores and lakeshores carry the national park label", () => {
  const np = (id) => index.cityById[id].nationalParks;
  assert.ok(np("us-grand-canyon").includes("Walnut Canyon National Monument"));
  assert.ok(np("us-san-francisco").includes("Muir Woods National Monument"));
  assert.ok(np("us-san-francisco").includes("Golden Gate National Recreation Area"));
  assert.ok(np("us-las-vegas").includes("Lake Mead National Recreation Area"));
  assert.ok(np("us-pensacola").includes("Gulf Islands National Seashore"));
  assert.ok(np("us-new-york-city").includes("Fire Island National Seashore"));
  assert.ok(np("us-traverse-city-sleeping-bear-dunes").includes("Sleeping Bear Dunes National Lakeshore"));
  assert.ok(np("us-twin-falls").includes("City of Rocks National Reserve"));
  assert.ok(np("us-santa-fe").includes("Valles Caldera National Preserve"));
  assert.ok(np("vi-st-croix").includes("Buck Island Reef National Monument"));
  // All three National Lakeshores are listed.
  const lake = index.countryById.us.sites.filter((s) => s.type === "National Lakeshore").map((s) => s.name);
  assert.equal(lake.length, 3);
  // A site more than about 1.5 hours from any place stays unlinked.
  assert.ok(!index.cities.some((x) => x.nationalParks.includes("Mill Springs Battlefield National Monument")));
  assert.ok(!index.cities.some((x) => x.nationalParks.includes("Noatak National Preserve")));
});

test("major cities and landmarks added in the 32-place sweep are complete", () => {
  const ids = ["de-nuremberg", "de-dresden", "de-leipzig", "de-dusseldorf", "de-heidelberg", "de-rothenburg-ob-der-tauber", "gb-liverpool", "gb-glasgow", "gb-oxford", "gb-cambridge", "gb-cotswolds", "gb-windsor-castle", "fr-marseille", "it-capri", "es-malaga-the-costa-del-sol", "es-ronda", "es-lanzarote", "us-key-west-the-florida-keys", "us-sedona", "us-monument-valley", "us-page-antelope-canyon", "us-aspen", "ca-whistler", "mx-playa-del-carmen", "au-brisbane", "au-adelaide", "in-kolkata", "in-bengaluru", "in-amritsar", "th-pattaya", "vn-da-nang", "eg-sharm-el-sheikh"];
  for (const id of ids) {
    const c = index.cityById[id];
    assert.ok(c, id);
    assert.ok(c.area && c.ll && c.ranges && c.temps, `${id} area, coordinates, range and highs`);
  }
  const np = (id) => index.cityById[id].nationalParks;
  assert.ok(np("us-sedona").includes("Montezuma Castle National Monument"));
  assert.ok(np("us-key-west-the-florida-keys").includes("Dry Tortugas National Park"));
  assert.ok(np("fr-marseille").includes("Calanques National Park"));
  assert.ok(index.cityById["de-nuremberg"].festivals.some((f) => f.market));
  assert.ok(index.cityById["in-kolkata"].festivals.some((f) => f.name === "Durga Puja"));
});
