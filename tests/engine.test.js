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

test("no UNESCO Biosphere Reserve data remains", () => {
  assert.equal(data.BIOSPHERE, undefined);
  assert.ok(index.countries.every((c) => c.biosphere === undefined));
  const text = JSON.stringify(data.COUNTRIES) + JSON.stringify(data.FACTS);
  assert.doesNotMatch(text, /biosphere/i);
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
  assert.equal(parks("us-new-york-city").length, 0);
  assert.ok(index.cities.filter((c) => c.nationalParks.length).length > 100);
});

test("Puerto Rico places are grouped by informal region", () => {
  const pr = index.countryById.pr.cities;
  assert.ok(pr.every((c) => c.area));
  assert.equal(new Set(pr.map((c) => c.area)).size, 6);
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
  for (const id of ["de", "fr", "it", "es", "nl", "ch", "hk", "cn", "jp", "kr", "is", "za", "tw", "th", "sg", "in", "br", "ru", "ir", "tr", "au", "gr", "pl", "pt", "se", "ar", "pe", "be", "cz", "id", "ma", "et", "dk", "bg", "vn", "ph", "lk", "ke", "co", "at", "fi", "nz", "mn", "pa", "tz", "sk", "ua", "ge", "uz", "tj", "kh", "lb", "sa", "om", "mg", "ec", "ae", "jm", "pf", "bo", "il", "pk", "cr", "cl", "hr", "eg", "kz", "no", "ro", "cu", "hu", "jo", "tn", "my"]) {
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
  assert.deepEqual([tagged("us"), tagged("ca"), tagged("mx")], [44, 23, 25]);
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
  assert.deepEqual(index.cityById["vi-st-john"].nationalParks, ["Virgin Islands National Park"]);
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
