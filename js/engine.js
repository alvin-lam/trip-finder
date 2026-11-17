/*
 * Recommendation engine for Where to Travel.
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
    const regionById = Object.fromEntries(regions.map((r) => [r.id, r]));
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
          unesco: null,
          family: null,
          country,
          region,
        };
        country.cities.push(city);
        cities.push(city);
      }
    }
    const cityById = Object.fromEntries(cities.map((c) => [c.id, c]));
    for (const [id, site] of Object.entries(data.UNESCO || {})) {
      if (!cityById[id]) throw new Error(`UNESCO entry ${id} matches no place`);
      cityById[id].unesco = site;
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
    return {
      regions,
      countries,
      cities,
      regionById,
      countryById: Object.fromEntries(countries.map((c) => [c.id, c])),
      cityById,
      homes: data.HOMES,
      interests: data.INTERESTS,
    };
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

  function normalizePrefs(prefs) {
    return { ...DEFAULT_PREFS, ...(prefs || {}), interests: { ...(prefs && prefs.interests) }, exclude: [...((prefs && prefs.exclude) || [])] };
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

  /** Temperature in both systems, e.g. "24°C (75°F)". */
  function fmtTemp(c) {
    return `${Math.round(c)}°C (${cToF(c)}°F)`;
  }

  /** Distance in both systems, rounded for readability, e.g. "1,400 km (870 mi)". */
  function fmtDistance(km) {
    const round = (v) => (v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10);
    const n = (v) => round(v).toLocaleString("en-US");
    return `${n(km)} km (${n(km * 0.621371)} mi)`;
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
    if (city.unesco && (prefs.interests.culture || 0) > 0) reasons.push("UNESCO World Heritage Site");
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
    recommend,
    scoreCity,
    planItinerary,
    formatMonths,
    haversineKm,
    cToF,
    fmtTemp,
    fmtDistance,
    seasonScore,
    climateScore,
    budgetScore,
    tempFor,
    encodePrefs,
    decodePrefs,
    normalizePrefs,
  };
  root.WTT_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
