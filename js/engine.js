/*
 * Recommendation engine for Trip Finder.
 * Pure functions with no DOM access, so it can be unit tested in Node.
 */
(function (root) {
  const TAG_ORDER = ["beach", "culture", "food", "nature", "nightlife", "adventure", "shopping", "relax"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const LENGTHS = {
    weekend: { label: "A long weekend", days: 3, stops: 1 },
    week: { label: "About a week", days: 7, stops: 2 },
    two: { label: "Two weeks", days: 14, stops: 3 },
    long: { label: "Three weeks or more", days: 21, stops: 4 },
  };

  const BUDGETS = {
    1: { label: "Shoestring", range: "under US$70 a day", maxCost: 1 },
    2: { label: "Moderate", range: "US$70 to US$150 a day", maxCost: 2.5 },
    3: { label: "Comfortable", range: "US$150 to US$300 a day", maxCost: 4 },
    4: { label: "Luxury", range: "US$300+ a day", maxCost: 5 },
  };

  const COST_LABELS = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$", 5: "$$$$$" };
  // Typical daily spend per person, always in US dollars so places can be compared.
  const COST_DAILY = { 1: "~US$40–70", 2: "~US$70–120", 3: "~US$120–180", 4: "~US$180–280", 5: "US$280+" };

  const CLIMATES = {
    any: { label: "No preference" },
    hot: { label: "Hot", min: 28, max: 40 },
    warm: { label: "Warm", min: 22, max: 30 },
    mild: { label: "Mild", min: 14, max: 24 },
    cool: { label: "Cool or snowy", min: -10, max: 14 },
  };

  // Companion type nudges interest weights.
  const COMPANY_BOOST = {
    solo: { culture: 0.5, adventure: 0.4, food: 0.3 },
    couple: { relax: 0.6, food: 0.5, beach: 0.3 },
    family: { nature: 0.6, beach: 0.6, relax: 0.4, nightlife: -0.8 },
    friends: { nightlife: 0.7, adventure: 0.5, food: 0.3 },
  };

  const BASE_WEIGHTS = { interest: 0.4, season: 0.15, climate: 0.12, budget: 0.15, distance: 0.15, vibe: 0.08 };

  const DEFAULT_PREFS = {
    interests: {},
    month: 0,
    length: "week",
    budget: 2,
    climate: "any",
    company: "couple",
    vibe: "mix",
    home: "",
    distance: "any",
    exclude: [],
  };

  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

  function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
  }

  function slug(s) {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  /** Flatten the raw dataset into linked region, country and city objects. */
  function buildIndex(data) {
    const regions = data.REGIONS.map((r) => ({ ...r, countries: [] }));
    // Lookup tables have no prototype, so ids such as "constructor" from a URL match nothing.
    const lookup = (entries) => Object.assign(Object.create(null), Object.fromEntries(entries));
    const regionById = lookup(regions.map((r) => [r.id, r]));
    const countries = [];
    const cities = [];
    for (const raw of data.COUNTRIES) {
      const country = { ...raw, kind: raw.kind || "country", maxDays: raw.maxDays || Infinity, cities: [] };
      const region = regionById[raw.region];
      if (!region) throw new Error(`Unknown region ${raw.region} for ${raw.name}`);
      country.regionObj = region;
      region.countries.push(country);
      countries.push(country);
      // A place is [name, tags, popularity, blurb, best months?, { area, temps }?].
      // `area` is a state or province; `temps` overrides the country's monthly highs.
      for (const [name, tagStr, pop, blurb, bestOverride, extra] of raw.cities) {
        if (!/^[0-5]{8}$/.test(tagStr)) throw new Error(`Bad tag string for ${name}`);
        const tags = {};
        TAG_ORDER.forEach((t, i) => (tags[t] = Number(tagStr[i])));
        const city = {
          id: `${raw.id}-${slug(name)}`,
          name,
          tags,
          pop,
          blurb,
          best: bestOverride || raw.best,
          area: (extra && extra.area) || null,
          temps: (extra && extra.temps) || null,
          isCapital: false,
          metros: [],
          nationalParks: [],
          historicSites: [],
          alsoIn: [],
          ll: null,
          ranges: null,
          micronation: null,
          geopark: null,
          remote: null, // "uninhabited", "no-residents" or "expedition"
          biosphere: null,
          festivals: [],
          unesco: null,
          family: null,
          country,
          region,
        };
        country.cities.push(city);
        cities.push(city);
      }
    }
    const cityById = lookup(cities.map((c) => [c.id, c]));
    for (const [id, site] of Object.entries(data.UNESCO || {})) {
      if (!cityById[id]) throw new Error(`UNESCO entry ${id} matches no place`);
      cityById[id].unesco = site;
    }
    // Link every metro area in the US, Puerto Rico, Canada and Mexico to the place
    // that covers it.
    for (const [countryId, list] of [["us", data.US_METROS], ["pr", data.PR_METROS], ["ca", data.CA_METROS], ["mx", data.MX_METROS]]) {
      const country = countries.find((c) => c.id === countryId);
      for (const [rank, name, population, placeName] of list || []) {
        const place = country && country.cities.find((x) => x.name === placeName);
        if (!place) throw new Error(`${countryId} metro #${rank} points at unknown place "${placeName}"`);
        place.metros.push({ rank, name, population, country: countryId });
      }
    }
    for (const [id, why] of Object.entries(data.FAMILY || {})) {
      if (!cityById[id]) throw new Error(`FAMILY entry ${id} matches no place`);
      cityById[id].family = why;
    }
    for (const c of countries) {
      const entry = (data.LGBTQ || {})[c.id];
      if (data.LGBTQ && !entry) throw new Error(`No LGBTQ+ entry for ${c.name}`);
      c.lgbtq = entry ? { level: entry[0], note: entry[1] } : null;
      const f = (data.FACTS || {})[c.id];
      if (data.FACTS && !f && c.kind !== "micronation") throw new Error(`No facts entry for ${c.name}`);
      c.facts = f ? { capital: f[0], parks: f[1] } : null;
      if (c.facts) {
        const alias = f[2] || {};
        for (const city of c.cities) {
          city.isCapital = alias.capitalPlace ? city.name === alias.capitalPlace : namesPlace(c.facts.capital, city.name);
        }
        for (const [key, name] of Object.entries(alias)) {
          if (!c.cities.some((x) => x.name === name)) throw new Error(`${key} "${name}" matches no place in ${c.name}`);
        }
      }
      const ps = (data.PARK_SYSTEMS || {})[c.id];
      c.sites = ps ? ps.sites.map(([name, type, area]) => ({ name, type, area, system: ps.system })) : [];
      const adv = (data.ADVISORY || {})[c.id];
      c.advisory = adv ? { level: adv[0], note: adv[1] } : null;
    }
    SITE_PLACES = data.SITE_PLACES || {};
    for (const [park, names] of Object.entries(SITE_PLACES)) {
      for (const n of names) {
        if (!cities.some((x) => x.name === n)) throw new Error(`SITE_PLACES: "${park}" points at unknown place "${n}"`);
      }
    }
    markNationalParks(countries, data.NP_EXTRA || {});

    // The state, province, canton, department or prefecture of places outside North
    // America and the UK, and each country's word for these subdivisions.
    for (const [id, area] of Object.entries(data.AREAS || {})) {
      if (!cityById[id]) throw new Error(`AREAS entry ${id} matches no place`);
      if (!cityById[id].area) cityById[id].area = area;
    }
    for (const c of countries) c.areaTerm = (data.AREA_TERMS || {})[c.id] || null;

    // Search codes and other names. A destination's id is its two-letter code, except
    // for the Akrotiri and Dhekelia base areas, which have none.
    for (const c of countries) {
      c.code = c.id === "xb" ? null : c.id.toUpperCase();
      c.aliases = [];
    }
    for (const [id, names] of Object.entries(data.COUNTRY_ALIASES || {})) {
      const c = countries.find((x) => x.id === id);
      if (!c) throw new Error(`COUNTRY_ALIASES entry ${id} matches no destination`);
      c.aliases = names;
    }

    // Places where nobody lives permanently, by how visitors can reach them.
    for (const [id, kind] of Object.entries(data.REMOTE || {})) {
      if (!cityById[id]) throw new Error(`REMOTE entry ${id} matches no place`);
      if (!["uninhabited", "no-residents", "expedition"].includes(kind)) throw new Error(`REMOTE entry ${id} has unknown kind ${kind}`);
      cityById[id].remote = kind;
    }

    // UNESCO Global Geoparks and Biosphere Reserves near each place (tools/unesco/link.js).
    for (const [key, field] of [["GEOPARKS", "geopark"], ["BIOSPHERES", "biosphere"]]) {
      for (const [id, site] of Object.entries(data[key] || {})) {
        if (!cityById[id]) throw new Error(`${key} entry ${id} matches no place`);
        // A place near several sites lists them all: "Hong Kong" or ["A", "B"].
        cityById[id][field] = [].concat(site).join(", ");
      }
    }

    // Major festivals, holidays, Pride events and Christmas markets: [name, months, note, "pride" | "market"?].
    for (const [id, list] of Object.entries(data.FESTIVALS || {})) {
      if (!cityById[id]) throw new Error(`FESTIVALS entry ${id} matches no place`);
      cityById[id].festivals = list.map(([name, months, note, kind]) => {
        if (!months.length || months.some((m) => !(m >= 1 && m <= 12))) throw new Error(`FESTIVALS ${id}: bad months for ${name}`);
        if (kind !== undefined && kind !== "pride" && kind !== "market") throw new Error(`FESTIVALS ${id}: unknown kind ${kind} for ${name}`);
        return { name, months, note, pride: kind === "pride", market: kind === "market" };
      });
    }

    // Historic sites whose gateway place is in another destination, such as a US site
    // in Puerto Rico: { placeId: name | [names] }.
    for (const [id, names] of Object.entries(data.HISTORIC_EXTRA || {})) {
      if (!cityById[id]) throw new Error(`HISTORIC_EXTRA entry ${id} matches no place`);
      for (const n of [].concat(names)) if (!cityById[id].historicSites.includes(n)) cityById[id].historicSites.push(n);
    }

    // Nearest place for sites with no place nearby: { "Site name": [placeId, km] }.
    const nearestForSite = {};
    for (const [site, [id, km]] of Object.entries(data.NEAREST_PLACE || {})) {
      if (!cityById[id]) throw new Error(`NEAREST_PLACE: "${site}" points at unknown place ${id}`);
      nearestForSite[site] = { city: cityById[id], km };
    }

    // Self-declared micronations inside their host countries.
    for (const [id, status] of Object.entries(data.MICRONATIONS || {})) {
      if (!cityById[id]) throw new Error(`MICRONATIONS entry ${id} matches no place`);
      cityById[id].micronation = status;
    }

    // Territories point at their sovereign country, which lists them back; microstates
    // that are usually a day trip name where to visit from.
    const countryIndex = Object.fromEntries(countries.map((c) => [c.id, c]));
    for (const c of countries) c.territories = [];
    for (const c of countries) {
      c.sovereignCountry = null;
      if (c.sovereign) {
        const sov = countryIndex[c.sovereign];
        if (!sov) throw new Error(`${c.name} names unknown sovereign ${c.sovereign}`);
        c.sovereignCountry = sov;
        sov.territories.push(c);
      }
    }
    for (const c of countries) c.nearbyMicrostates = countries.filter((m) => m.kind === "microstate" && m.of === c.id);

    // Coordinates of each place, [lat, lon], used to list nearby places first.
    for (const [id, ll] of Object.entries(data.COORDS || {})) {
      if (!cityById[id]) throw new Error(`COORDS entry ${id} matches no place`);
      cityById[id].ll = ll;
    }

    // Average daily temperature range (high minus low) for each month, used for typical lows.
    for (const [id, r] of Object.entries(data.RANGES || {})) {
      if (!cityById[id]) throw new Error(`RANGES entry ${id} matches no place`);
      cityById[id].ranges = r;
    }

    // A site shared by several countries keeps one place, which is also listed under
    // the other countries in Explore: { placeId: [countryId, ...] }.
    const byCountryId = lookup(countries.map((c) => [c.id, c]));
    for (const c of countries) c.linked = [];
    for (const [id, ids] of Object.entries(data.LINKED || {})) {
      const city = cityById[id];
      if (!city) throw new Error(`LINKED entry ${id} matches no place`);
      city.alsoIn = ids.map((cid) => {
        const other = byCountryId[cid];
        if (!other) throw new Error(`LINKED entry ${id} points at unknown country ${cid}`);
        other.linked.push(city);
        return other;
      });
    }

    return {
      regions,
      countries,
      cities,
      regionById,
      countryById: byCountryId,
      cityById,
      nearestForSite,
      homes: data.HOMES,
      interests: data.INTERESTS,
    };
  }

  // National forests count as national parks too.
  const NP = /National (Park|Forest)\b/;

  // The park's own name without its designation: "Mount Rainier National Park" -> "Mount Rainier".
  function siteKey(name) {
    return name.replace(/\s+National (Park|Urban Park|Marine Park)\b.*$/, "").trim();
  }

  // Links a US or Canadian park system site to the place(s) that hold it: a place named
  // for it (Yellowstone, Banff), a place whose name contains the park's own name (Bay of
  // Fundy), or the checked SITE_PLACES list (Zion -> Utah National Parks).
  let SITE_PLACES = {};
  function placesForSite(c, site) {
    const l = site.name.toLowerCase();
    const sameArea = c.cities.filter((x) => !x.area || site.area.includes(x.area));
    const byName = sameArea.find((x) => {
      const head = x.name.toLowerCase().split(/ & |, | \(/)[0];
      return head.length >= 4 && (l === head || l.startsWith(head + " "));
    });
    if (byName) return [byName];
    const listed = (SITE_PLACES[site.name] || []).map((n) => c.cities.find((x) => x.name === n)).filter(Boolean);
    if (listed.length) return listed;
    const key = siteKey(site.name).toLowerCase();
    const named = key.length >= 4 && sameArea.find((x) => x.area && x.name.toLowerCase().includes(key));
    return named ? [named] : [];
  }

  function placeForSite(c, site) {
    return placesForSite(c, site)[0] || null;
  }

  // Marks every place that is, or contains, a national park, from four sources: US and
  // Canadian park system sites, UNESCO site names, place names, and the country's
  // famous parks list.
  const HISTORIC_SITE_TYPES = /^(National (Historic Site|Historical Park|Memorial|Battlefield( Park| Site)?|Military Park)|International Historic Site)$/;
  // Mexico's biosphere reserves and natural monuments (CONANP) count as national parks too.
  const NP_SITE_TYPES = /^(National (Park|Park Reserve|Monument|Preserve|Reserve|Recreation Area|Seashore|Lakeshore)|Biosphere Reserve|Natural Monument)$/;

  function markNationalParks(countries, extra) {
    for (const c of countries) {
      // "Hawaii Volcanoes National Park" and "Hawaiʻi Volcanoes National Park", or a park and
      // its "Reserve", count as one park.
      const parkKey = (name) => name.normalize("NFD").replace(/[^A-Za-z ]/g, "").replace(/ Reserve$/, "").toLowerCase();
      // A World Heritage name that extends a park's own name, such as "Vatnajökull
      // National Park – Dynamic Nature of Fire and Ice", counts as the same park; the
      // shorter name is kept.
      const same = (a, b) => a === b || a.startsWith(b + " ") || b.startsWith(a + " ");
      const add = (city, name) => {
        if (!city) return;
        const i = city.nationalParks.findIndex((p) => same(parkKey(p), parkKey(name)));
        if (i < 0) city.nationalParks.push(name);
        else if (name.length < city.nationalParks[i].length) city.nationalParks[i] = name;
      };
      for (const site of c.sites || []) {
        // National monuments, preserves, reserves, recreation areas, seashores and lakeshores
        // carry the NATIONAL PARK label too.
        // Historic sites, historical parks, memorials and battlefields carry the HISTORIC SITE label.
        if (HISTORIC_SITE_TYPES.test(site.type)) {
          for (const place of placesForSite(c, site)) if (!place.historicSites.includes(site.name)) place.historicSites.push(site.name);
          continue;
        }
        if (NP_SITE_TYPES.test(site.type)) {
          for (const place of placesForSite(c, site)) add(place, site.name);
        }
      }
      for (const city of c.cities) {
        if (city.unesco && NP.test(city.unesco)) add(city, city.unesco);
        if (NP.test(city.name)) add(city, city.name);
        for (const name of [].concat(extra[city.id] || [])) add(city, name);
      }
      for (const park of (c.facts && c.facts.parks) || []) {
        if (!NP.test(park)) continue;
        const l = park.toLowerCase();
        add(
          c.cities.find((x) => {
            const head = x.name.toLowerCase().split(/ & |, | \(/)[0];
            return head.length >= 4 && l.startsWith(head);
          }),
          park
        );
      }
    }
  }

  // True when a capital description ("Kuala Lumpur (administrative centre: Putrajaya)") names this place
  // ("Paris", or "Tunis & Sidi Bou Said" for "Tunis").
  function namesPlace(desc, placeName) {
    const norm = (x) => slug(x).replace(/-/g, " ");
    const main = norm(desc.split(/[(;]/)[0]);
    const place = norm(placeName);
    const placeHead = norm(placeName.split(/ & |, | \(/)[0]);
    return main === place || main === placeHead || main.split(/ and /).includes(placeHead);
  }

  // Quiz answers come from saved storage and shared links, so every field is checked
  // against its known values; anything else falls back to the default and unknown
  // fields are dropped.
  function normalizePrefs(prefs) {
    const p = prefs && typeof prefs === "object" ? prefs : {};
    const pick = (v, list, d) => (list.includes(v) ? v : d);
    const interests = {};
    if (p.interests && typeof p.interests === "object")
      for (const t of TAG_ORDER) if (p.interests[t] === 1 || p.interests[t] === 2) interests[t] = p.interests[t];
    const ID = /^[a-z0-9-]{1,40}$/;
    return {
      interests,
      month: Number.isInteger(p.month) && p.month >= 0 && p.month <= 12 ? p.month : DEFAULT_PREFS.month,
      length: pick(p.length, CODE_LENGTHS, DEFAULT_PREFS.length),
      budget: BUDGETS[p.budget] && Number.isInteger(p.budget) ? p.budget : DEFAULT_PREFS.budget,
      climate: pick(p.climate, CODE_CLIMATES, DEFAULT_PREFS.climate),
      company: pick(p.company, CODE_COMPANY, DEFAULT_PREFS.company),
      vibe: pick(p.vibe, CODE_VIBES, DEFAULT_PREFS.vibe),
      home: typeof p.home === "string" && ID.test(p.home) ? p.home : "",
      distance: pick(p.distance, CODE_DISTANCES, DEFAULT_PREFS.distance),
      exclude: Array.isArray(p.exclude) ? [...new Set(p.exclude.filter((r) => typeof r === "string" && ID.test(r)))] : [],
    };
  }

  function interestWeights(prefs) {
    const w = {};
    let any = false;
    for (const t of TAG_ORDER) {
      w[t] = Number(prefs.interests[t] || 0);
      if (w[t] > 0) any = true;
    }
    // With no stated interests, treat everything as mildly interesting.
    if (!any) TAG_ORDER.forEach((t) => (w[t] = 0.5));
    const boost = COMPANY_BOOST[prefs.company] || {};
    for (const [t, b] of Object.entries(boost)) {
      // Boosts only nudge topics the visitor already cares about, except
      // negative boosts which always apply (e.g. nightlife for families).
      if (b < 0) w[t] = Math.max(0, w[t] + b);
      else if (w[t] > 0) w[t] += b;
    }
    return w;
  }

  function monthDistance(a, b) {
    const d = Math.abs(a - b) % 12;
    return Math.min(d, 12 - d);
  }

  function seasonScore(best, month) {
    if (!month) return 1;
    if (best.includes(month)) return 1;
    const nearest = Math.min(...best.map((b) => monthDistance(b, month)));
    return nearest === 1 ? 0.6 : nearest === 2 ? 0.35 : 0.2;
  }

  function tempFor(city, month) {
    const temps = city.temps || city.country.temps;
    if (month) return temps[month - 1];
    const vals = city.best.map((m) => temps[m - 1]);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  // Typical low: the month's high minus the average daily range there. With no month,
  // it averages the best months, like tempFor. Null when the range is unknown.
  function lowFor(city, month) {
    if (!city.ranges) return null;
    const temps = city.temps || city.country.temps;
    const low = (m) => temps[m - 1] - city.ranges[m - 1];
    if (month) return Math.round(low(month));
    return Math.round(city.best.reduce((a, m) => a + low(m), 0) / city.best.length);
  }

  function climateScore(temp, climate) {
    const c = CLIMATES[climate];
    if (!c || c.min === undefined) return 1;
    if (temp >= c.min && temp <= c.max) return 1;
    const off = temp < c.min ? c.min - temp : temp - c.max;
    return clamp(1 - off / 10);
  }

  function budgetScore(cost, budget) {
    const b = BUDGETS[budget] || BUDGETS[2];
    const over = cost - b.maxCost;
    let s = over <= 0 ? 1 : clamp(1 - 0.4 * over);
    // Luxury travellers get a small nudge toward places with high-end options.
    if (budget === 4) s = 0.85 + 0.03 * cost;
    return clamp(s);
  }

  function distanceScore(km, pref) {
    switch (pref) {
      case "near":
        return clamp(1 - km / 7000);
      case "medium":
        return clamp(1 - Math.abs(km - 5500) / 6000);
      case "far":
        return clamp(km / 10000);
      default:
        return 1;
    }
  }

  function vibeScore(pop, vibe) {
    if (vibe === "iconic") return pop / 5;
    if (vibe === "hidden") return (6 - pop) / 5;
    return 1;
  }

  function activeWeights(prefs) {
    const w = { ...BASE_WEIGHTS };
    if (!prefs.month) w.season *= 0.3; // flexible dates: we assume they go in season
    if (prefs.climate === "any") w.climate = 0;
    if (prefs.distance === "any" || !prefs.home) w.distance = 0;
    if (prefs.vibe === "mix") w.vibe = 0;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) w[k] /= total;
    return w;
  }

  const cToF = (c) => Math.round((c * 9) / 5 + 32);

  // ---------- Units ----------
  // The app shows temperatures, distances and numbers the way the visitor's device does:
  // its region decides °C or °F and kilometres or miles, and its locale formats numbers.
  // Without a device (the tests), both systems show: "24°C (75°F)".
  const UNITS = { temp: "both", dist: "both", locale: "en-US" };
  // Regions that use °F, and regions whose road distances are in miles.
  const FAHRENHEIT = new Set(["US", "PR", "GU", "VI", "AS", "MP", "UM", "BS", "BZ", "KY", "PW", "FM", "MH", "LR"]);
  const MILES = new Set(["US", "PR", "GU", "VI", "AS", "MP", "UM", "GB", "LR", "MM"]);

  /** The units a device locale implies, e.g. "en-US" -> °F and miles, "en-GB" -> °C and miles. */
  function unitsForLocale(locale) {
    let region = "";
    try {
      region = new Intl.Locale(locale).maximize().region || "";
    } catch (_) {
      region = (String(locale).match(/[-_]([A-Z]{2})\b/) || [])[1] || "";
    }
    return { temp: FAHRENHEIT.has(region) ? "F" : "C", dist: MILES.has(region) ? "mi" : "km", locale, region };
  }

  function setUnits(u) {
    Object.assign(UNITS, u);
    return UNITS;
  }

  const num = (v) => v.toLocaleString(UNITS.locale);

  /** A temperature in the device's units: "24°C", "75°F", or both without a device. */
  function fmtTemp(c) {
    if (UNITS.temp === "F") return `${cToF(c)}°F`;
    if (UNITS.temp === "C") return `${Math.round(c)}°C`;
    return `${Math.round(c)}°C (${cToF(c)}°F)`;
  }

  /** A temperature value alone in the device's units (for charts): 24 or 75. */
  const tempValue = (c) => (UNITS.temp === "F" ? cToF(c) : Math.round(c));

  /** A distance rounded for readability in the device's units: "1,400 km", "870 mi", or both. */
  function fmtDistance(km) {
    const round = (v) => (v >= 1000 ? Math.round(v / 100) * 100 : v >= 100 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v)));
    const n = (v) => num(round(v));
    if (UNITS.dist === "mi") return `${n(km * 0.621371)} mi`;
    if (UNITS.dist === "km") return `${n(km)} km`;
    return `${n(km)} km (${n(km * 0.621371)} mi)`;
  }

  /**
   * Other places sorted nearest first: [{ city, km }]. Places without coordinates
   * follow, most popular first, with km null.
   */
  function nearestPlaces(city, list) {
    const others = list.filter((x) => x !== city);
    const withKm = others.map((x) => ({
      city: x,
      km: city.ll && x.ll ? haversineKm(city.ll[0], city.ll[1], x.ll[0], x.ll[1]) : null,
    }));
    return withKm.sort((a, b) => {
      if (a.km !== null && b.km !== null) return a.km - b.km;
      if (a.km !== null) return -1;
      if (b.km !== null) return 1;
      return b.city.pop - a.city.pop;
    });
  }

  /** Score a single city against the visitor's preferences. */
  function scoreCity(city, prefs, ctx) {
    const iw = ctx.interestWeights;
    let num = 0;
    let den = 0;
    for (const t of TAG_ORDER) {
      num += iw[t] * (city.tags[t] / 5);
      den += iw[t];
    }
    const interest = den ? num / den : 0.5;
    const season = seasonScore(city.best, prefs.month);
    const temp = tempFor(city, prefs.month);
    const climate = climateScore(temp, prefs.climate);
    const budget = budgetScore(city.country.cost, prefs.budget);
    const km = ctx.home ? haversineKm(ctx.home.lat, ctx.home.lon, city.country.lat, city.country.lon) : null;
    const distance = km === null ? 1 : distanceScore(km, prefs.distance);
    const vibe = vibeScore(city.pop, prefs.vibe);

    const parts = { interest, season, climate, budget, distance, vibe };
    const w = ctx.weights;
    let total = 0;
    for (const k in w) total += w[k] * parts[k];
    // Strong mismatches on interests should sink a place even when logistics fit.
    total *= 0.75 + 0.25 * interest;
    // Travel advisories: a firm penalty for "reconsider", a heavy one for "avoid" (only scored when shown).
    const adv = city.country.advisory;
    if (adv) total *= adv.level === "avoid" ? 0.6 : 0.88;
    // Families get a gentle nudge toward places that work well with children.
    if (prefs.company === "family") total *= city.family ? 1.04 : 0.97;

    const reasons = [];
    const warnings = [];
    const liked = TAG_ORDER.filter((t) => (prefs.interests[t] || 0) > 0 && city.tags[t] >= 4).sort(
      (a, b) => city.tags[b] * (prefs.interests[b] || 0) - city.tags[a] * (prefs.interests[a] || 0)
    );
    if (liked.length) reasons.push(greatFor(liked, ctx.labels));
    if (prefs.month) {
      if (season === 1) reasons.push(`${MONTHS_LONG[prefs.month - 1]} is a top time to go`);
      else if (season >= 0.6) warnings.push(`${MONTHS_LONG[prefs.month - 1]} is shoulder season`);
      else warnings.push(`${MONTHS_LONG[prefs.month - 1]} is off season (best: ${formatMonths(city.best)})`);
    }
    if (prefs.climate !== "any") {
      if (climate === 1) reasons.push(`${CLIMATES[prefs.climate].label} weather, around ${fmtTemp(temp)}`);
      else if (climate < 0.6) warnings.push(`Around ${fmtTemp(temp)}, outside your ${CLIMATES[prefs.climate].label.toLowerCase()} preference`);
    }
    if (budget >= 1 && prefs.budget < 4) reasons.push(`Fits a ${BUDGETS[prefs.budget].label.toLowerCase()} budget`);
    else if (budget < 0.7) warnings.push(`Pricier than your budget (${COST_DAILY[city.country.cost]} a day)`);
    if (km !== null && prefs.distance !== "any") {
      if (distance >= 0.7) reasons.push(`About ${fmtDistance(km)} from home`);
      else if (distance < 0.35) warnings.push(`About ${fmtDistance(km)} from home`);
    }
    if (city.family && prefs.company === "family") reasons.push("Family friendly");
    if (city.unesco && (prefs.interests.culture || 0) > 0) reasons.push("World Heritage Site");
    if (adv) warnings.unshift(adv.level === "avoid" ? "Travel advisory: avoid all travel" : "Travel advisory: reconsider travel");
    if (prefs.vibe === "hidden" && city.pop <= 2) reasons.push("Off the beaten path");
    if (prefs.vibe === "iconic" && city.pop >= 5) reasons.push("A world-famous highlight");

    return { city, score: Math.round(clamp(total) * 100), parts, temp, km, liked, reasons, warnings };
  }

  function greatFor(tags, labels) {
    return `Great for ${tags.slice(0, 3).map((t) => labels[t].toLowerCase()).join(", ")}`;
  }

  function formatMonths(months) {
    const sorted = [...new Set(months)].sort((a, b) => a - b);
    // Group consecutive months, treating Dec->Jan as consecutive.
    const runs = [];
    for (const m of sorted) {
      const last = runs[runs.length - 1];
      if (last && m === last[last.length - 1] + 1) last.push(m);
      else runs.push([m]);
    }
    if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1].slice(-1)[0] === 12) {
      const first = runs.shift();
      runs[runs.length - 1].push(...first);
    }
    return runs
      .map((r) => (r.length === 1 ? MONTHS[r[0] - 1] : `${MONTHS[r[0] - 1]}–${MONTHS[r[r.length - 1] - 1]}`))
      .join(", ");
  }

  /** Split trip days across the chosen stops, weighting by score. */
  // Small places get a capped stay; the rest of the trip goes elsewhere.
  function planItinerary(scoredCities, lengthKey, maxDays = Infinity) {
    const L = LENGTHS[lengthKey] || LENGTHS.week;
    const total = Math.min(L.days, maxDays);
    const minDays = 2;
    const nStops = Math.min(L.stops, scoredCities.length, Math.max(1, Math.floor(total / minDays)));
    const stops = scoredCities.slice(0, nStops);
    if (!stops.length) return [];
    if (stops.length === 1) return [{ city: stops[0].city, days: total }];
    const spare = total - minDays * stops.length;
    const weightSum = stops.reduce((a, s) => a + s.score, 0) || 1;
    const plan = stops.map((s) => ({ city: s.city, days: minDays + Math.floor((spare * s.score) / weightSum) }));
    let used = plan.reduce((a, p) => a + p.days, 0);
    for (let i = 0; used < total; i = (i + 1) % plan.length, used++) plan[i].days++;
    return plan;
  }

  /** Main entry point: rank regions, countries and cities. */
  function recommend(index, rawPrefs, options = {}) {
    const prefs = normalizePrefs(rawPrefs);
    const labels = Object.fromEntries(index.interests.map((i) => [i.id, i.label]));
    const ctx = {
      interestWeights: interestWeights(prefs),
      weights: activeWeights(prefs),
      home: index.homes.find((h) => h.id === prefs.home) || null,
      labels,
    };
    const L = LENGTHS[prefs.length] || LENGTHS.week;
    const excluded = new Set(prefs.exclude);

    // Places under "avoid all travel" advisories stay out of recommendations unless asked for.
    const isAvoid = (c) => c.country.advisory && c.country.advisory.level === "avoid";
    const inRegion = index.cities.filter((c) => !excluded.has(c.region.id));
    const hiddenAvoid = options.includeAvoid ? [] : [...new Set(inRegion.filter(isAvoid).map((c) => c.country))];
    const cityResults = inRegion.filter((c) => options.includeAvoid || !isAvoid(c)).map((c) => scoreCity(c, prefs, ctx));
    const byCountry = new Map();
    for (const r of cityResults) {
      if (!byCountry.has(r.city.country.id)) byCountry.set(r.city.country.id, []);
      byCountry.get(r.city.country.id).push(r);
    }

    const countryResults = [];
    for (const [id, list] of byCountry) {
      list.sort((a, b) => b.score - a.score);
      const country = index.countryById[id];
      const k = Math.min(L.stops, list.length);
      const top = list.slice(0, k);
      let score = top.reduce((a, r) => a + r.score, 0) / k;
      // Longer trips favour countries that can fill the time with several good stops.
      if (list.length < L.stops) score -= (L.stops - list.length) * 2;
      // A place you can see in a day or two fits a long trip less well on its own.
      if (country.maxDays < L.days) score *= 0.85 + (0.15 * country.maxDays) / L.days;
      const itinerary = planItinerary(list, prefs.length, country.maxDays);
      countryResults.push({
        country,
        score: Math.max(0, Math.round(score)),
        cities: list,
        itinerary,
        spareDays: L.days - itinerary.reduce((a, s) => a + s.days, 0),
        reasons: mergeReasons(top, labels),
        warnings: mergeWarnings(top),
      });
    }
    countryResults.sort((a, b) => b.score - a.score);

    const regionResults = index.regions
      .filter((r) => !excluded.has(r.id))
      .map((region) => {
        const cs = countryResults.filter((c) => c.country.region === region.id);
        // Micronations are curiosities; they appear in lists but do not drive region rankings.
        const top = cs.filter((c) => c.country.kind !== "micronation").slice(0, 2);
        const score = top.length ? Math.round(top.reduce((a, c) => a + c.score, 0) / top.length) : 0;
        return { region, score, countries: cs };
      })
      .sort((a, b) => b.score - a.score);

    // Suggest a partner when the trip has spare days or is long: the related
    // country if there is one (Monaco -> France), else the best neighbour in the region.
    for (const c of countryResults) {
      if (prefs.length === "long" || c.spareDays > 0) {
        const related = c.country.of && countryResults.find((o) => o.country.id === c.country.of);
        const partner =
          related ||
          countryResults.find(
            (o) => o !== c && o.country.region === c.country.region && o.country.kind !== "micronation" && o.spareDays === 0
          ) ||
          countryResults.find((o) => o !== c && o.country.region === c.country.region);
        c.pairWith = partner ? partner.country : null;
      }
    }

    cityResults.sort((a, b) => b.score - a.score);
    return { prefs, regions: regionResults, countries: countryResults, cities: cityResults, hiddenAvoid };
  }

  function mergeReasons(top, labels) {
    // Combine the interest highlights of every stop into one line, ordered by
    // how many stops share them, then append the other unique reasons.
    const counts = new Map();
    for (const r of top) r.liked.forEach((t, i) => counts.set(t, (counts.get(t) || 0) + 10 - i));
    const liked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const out = liked.length ? [greatFor(liked, labels)] : [];
    const seen = new Set(out);
    for (const r of top) {
      for (const x of r.reasons) {
        if (x.startsWith("Great for") || seen.has(x)) continue;
        seen.add(x);
        out.push(x);
      }
    }
    return out.slice(0, 4);
  }

  function mergeWarnings(top) {
    // Only surface a warning if it applies to the best city in the country.
    return top.length ? top[0].warnings.slice(0, 2) : [];
  }

  // Option lists for the compact share code. Append only, never reorder,
  // or links shared earlier will decode differently.
  const CODE_LENGTHS = ["weekend", "week", "two", "long"];
  const CODE_CLIMATES = ["any", "hot", "warm", "mild", "cool"];
  const CODE_COMPANY = ["solo", "couple", "family", "friends"];
  const CODE_VIBES = ["mix", "iconic", "hidden"];
  const CODE_DISTANCES = ["any", "near", "medium", "far"];

  /**
   * Encode preferences as a short code of letters, digits and hyphens, e.g.
   * "r-110200000502120100000", so it can live in a plain #hash.
   */
  function encodePrefs(prefs, index) {
    const p = normalizePrefs(prefs);
    const idx = (list, v) => Math.max(0, list.indexOf(v));
    const homeIdx = index.homes.findIndex((h) => h.id === p.home) + 1;
    let mask = 0;
    index.regions.forEach((r, i) => {
      if (p.exclude.includes(r.id)) mask |= 1 << i;
    });
    return [
      "r-",
      TAG_ORDER.map((t) => p.interests[t] || 0).join(""),
      String(p.month).padStart(2, "0"),
      idx(CODE_LENGTHS, p.length),
      p.budget,
      idx(CODE_CLIMATES, p.climate),
      idx(CODE_COMPANY, p.company),
      idx(CODE_VIBES, p.vibe),
      String(homeIdx).padStart(2, "0"),
      idx(CODE_DISTANCES, p.distance),
      mask.toString(16).padStart(3, "0"),
    ].join("");
  }

  function decodePrefs(code, index) {
    const p = normalizePrefs({});
    const m = /^r-([0-2]{8})(\d\d)(\d)(\d)(\d)(\d)(\d)(\d\d)(\d)([0-9a-f]{3,4})$/.exec(code || "");
    if (!m) return null;
    TAG_ORDER.forEach((t, i) => {
      const v = Number(m[1][i]);
      if (v) p.interests[t] = v;
    });
    const month = Number(m[2]);
    if (month <= 12) p.month = month;
    p.length = CODE_LENGTHS[Number(m[3])] || p.length;
    if (BUDGETS[Number(m[4])]) p.budget = Number(m[4]);
    p.climate = CODE_CLIMATES[Number(m[5])] || p.climate;
    p.company = CODE_COMPANY[Number(m[6])] || p.company;
    p.vibe = CODE_VIBES[Number(m[7])] || p.vibe;
    const home = index.homes[Number(m[8]) - 1];
    p.home = home ? home.id : "";
    p.distance = CODE_DISTANCES[Number(m[9])] || p.distance;
    const mask = parseInt(m[10], 16);
    p.exclude = index.regions.filter((r, i) => mask & (1 << i)).map((r) => r.id);
    return p;
  }

  // ---------- Seasonal and holiday colors ----------
  // The app's accent color follows the visitor's season or a holiday, worked out from
  // the device's own date and time zone. Each scheme passes WCAG AA contrast (4.5:1)
  // for white text on the light accent and dark text on the dark accent.
  const SEASON_SCHEMES = {
    winter: { label: "Winter", icon: "❄️", light: "#2a65a8", dark: "#7fb4ee" },
    spring: { label: "Spring", icon: "🌸", light: "#b13a6c", dark: "#f29cc2" },
    summer: { label: "Summer", icon: "☀️", light: "#0b7581", dark: "#5fd0d9" },
    autumn: { label: "Autumn", icon: "🍂", light: "#a5481a", dark: "#f0a06a" },
    newyear: { label: "New Year", icon: "🎆", light: "#7f6417", dark: "#e6c35c", stripe: "linear-gradient(90deg, #7f6417, #e6c35c, #7f6417)" },
    lunar: { label: "Lunar New Year", icon: "🧧", light: "#c0122d", dark: "#ff8a8a", stripe: "linear-gradient(90deg, #c0122d, #e6b422, #c0122d)" },
    valentine: { label: "Valentine's Day", icon: "💝", light: "#bb1b58", dark: "#ff8fb8", stripe: "linear-gradient(90deg, #bb1b58, #ff8fb8, #bb1b58)" },
    stpatrick: { label: "St. Patrick's Day", icon: "☘️", light: "#1d7a3a", dark: "#73d68f", stripe: "linear-gradient(90deg, #169b62, #ffffff, #ff883e)" },
    easter: { label: "Easter", icon: "🐣", light: "#7346b3", dark: "#c3a4f2", stripe: "linear-gradient(90deg, #c3a4f2, #f6d36b, #9fd9b4, #f7a8c4)" },
    pride: { label: "Pride Month", icon: "🏳️‍🌈", light: "#7a3db3", dark: "#c9a3f5", stripe: "linear-gradient(90deg, #e40303, #ff8c00, #ffed00, #008026, #004dff, #750787)" },
    halloween: { label: "Halloween", icon: "🎃", light: "#b84a09", dark: "#ffa45c", stripe: "linear-gradient(90deg, #ff7a1a, #5b2a86, #ff7a1a)" },
    diwali: { label: "Diwali", icon: "🪔", light: "#a8510a", dark: "#ffbf5c", stripe: "linear-gradient(90deg, #ffbf5c, #c0122d, #ffbf5c)" },
    christmas: { label: "Christmas", icon: "🎄", light: "#b31b1b", dark: "#ff8c8c", stripe: "linear-gradient(90deg, #b31b1b, #1f7a4a, #b31b1b)" },
  };

  // Lunar New Year and Diwali follow lunar calendars; their dates are listed to 2035.
  // Outside these years the season shows instead.
  const LUNAR_NEW_YEAR = { 2025: "01-29", 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03", 2031: "01-23", 2032: "02-11", 2033: "01-31", 2034: "02-19", 2035: "02-08" };
  const DIWALI = { 2025: "10-20", 2026: "11-08", 2027: "10-29", 2028: "10-17", 2029: "11-05", 2030: "10-26", 2031: "11-14", 2032: "11-02", 2033: "10-22", 2034: "11-10", 2035: "10-30" };

  // Time zones south of the equator, where the seasons are flipped.
  const SOUTHERN_ZONE = new RegExp(
    "^(Australia/|Antarctica/|America/Argentina/|America/(Buenos_Aires|Cordoba|Santiago|Punta_Arenas|Montevideo|Asuncion|Sao_Paulo|La_Paz|Lima|Campo_Grande|Cuiaba|Porto_Velho|Bahia|Maceio|Recife|Araguaina)$|" +
      "Africa/(Johannesburg|Maseru|Mbabane|Windhoek|Gaborone|Harare|Maputo|Lusaka|Blantyre|Lubumbashi|Luanda|Dar_es_Salaam)$|" +
      "Indian/(Mauritius|Reunion|Antananarivo|Mayotte|Comoro|Kerguelen)$|Atlantic/(Stanley|South_Georgia|St_Helena)$|" +
      "Pacific/(Auckland|Chatham|Fiji|Tongatapu|Apia|Pago_Pago|Noumea|Efate|Tahiti|Rarotonga|Port_Moresby|Guadalcanal|Easter|Norfolk|Niue|Gambier|Marquesas|Fakaofo|Wallis|Funafuti)$|" +
      "Asia/(Jakarta|Makassar|Jayapura|Dili)$)"
  );
  const isSouthern = (timeZone) => SOUTHERN_ZONE.test(timeZone || "");

  // The visitor's own calendar date (year, month 1-12, day) in their time zone.
  function localDate(date, timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
      const get = (t) => Number(parts.find((p) => p.type === t).value);
      return { y: get("year"), m: get("month"), d: get("day") };
    } catch (_) {
      return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
    }
  }

  // Easter Sunday (Gregorian), by the anonymous Gregorian algorithm.
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    return { m: month, d: ((h + l - 7 * m + 114) % 31) + 1 };
  }

  const dayNumber = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;

  /** The color scheme for a moment: { id, label, icon, kind: "holiday" | "season", southern }. */
  function seasonalScheme(date = new Date(), timeZone) {
    const zone = timeZone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "");
    const { y, m, d } = localDate(date, zone);
    const today = dayNumber(y, m, d);
    const near = (md, before, after) => {
      if (!md) return false;
      const [mm, dd] = md.split("-").map(Number);
      const n = dayNumber(y, mm, dd);
      return today >= n - before && today <= n + after;
    };
    const e = easterSunday(y);
    const easter = dayNumber(y, e.m, e.d);
    const holidays = [
      ["newyear", (m === 12 && d === 31) || (m === 1 && d <= 2)],
      ["valentine", m === 2 && d >= 12 && d <= 14],
      ["stpatrick", m === 3 && d >= 15 && d <= 17],
      ["easter", today >= easter - 2 && today <= easter + 1],
      ["halloween", m === 10 && d >= 25],
      ["diwali", near(DIWALI[y], 2, 2)],
      ["lunar", near(LUNAR_NEW_YEAR[y], 2, 7)],
      ["christmas", m === 12 && d <= 26],
      ["pride", m === 6],
    ];
    const southern = isSouthern(zone);
    const hit = holidays.find(([, on]) => on);
    let id;
    if (hit) id = hit[0];
    else {
      const north = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][m - 1];
      const flip = { winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" };
      id = southern ? flip[north] : north;
    }
    const s = SEASON_SCHEMES[id];
    return { id, label: s.label, icon: s.icon, kind: hit ? "holiday" : "season", southern };
  }

  const api = {
    TAG_ORDER,
    MONTHS,
    MONTHS_LONG,
    LENGTHS,
    BUDGETS,
    CLIMATES,
    COST_LABELS,
    COST_DAILY,
    DEFAULT_PREFS,
    buildIndex,
    placeForSite,
    recommend,
    scoreCity,
    planItinerary,
    formatMonths,
    haversineKm,
    cToF,
    fmtTemp,
    fmtDistance,
    unitsForLocale,
    setUnits,
    UNITS,
    tempValue,
    num,
    nearestPlaces,
    seasonScore,
    climateScore,
    budgetScore,
    tempFor,
    lowFor,
    encodePrefs,
    decodePrefs,
    normalizePrefs,
    SEASON_SCHEMES,
    seasonalScheme,
    isSouthern,
  };
  root.WTT_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
