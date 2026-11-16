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
    1: { label: "Shoestring", range: "under $70 a day", maxCost: 1 },
    2: { label: "Moderate", range: "$70 to $150 a day", maxCost: 2.5 },
    3: { label: "Comfortable", range: "$150 to $300 a day", maxCost: 4 },
    4: { label: "Luxury", range: "$300+ a day", maxCost: 5 },
  };

  const COST_LABELS = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$", 5: "$$$$$" };
  const COST_DAILY = { 1: "~$40–70", 2: "~$70–120", 3: "~$120–180", 4: "~$180–280", 5: "$280+" };

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
      const country = { ...raw, cities: [] };
      const region = regionById[raw.region];
      if (!region) throw new Error(`Unknown region ${raw.region} for ${raw.name}`);
      country.regionObj = region;
      region.countries.push(country);
      countries.push(country);
      for (const [name, tagStr, pop, blurb, bestOverride] of raw.cities) {
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
          country,
          region,
        };
        country.cities.push(city);
        cities.push(city);
      }
    }
    return {
      regions,
      countries,
      cities,
      regionById,
      countryById: Object.fromEntries(countries.map((c) => [c.id, c])),
      cityById: Object.fromEntries(cities.map((c) => [c.id, c])),
      homes: data.HOMES,
      interests: data.INTERESTS,
    };
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
    const temps = city.country.temps;
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

  function fmtKm(km) {
    return km >= 1000 ? `${(Math.round(km / 100) / 10).toLocaleString("en-US")}k km` : `${Math.round(km)} km`;
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
      if (climate === 1) reasons.push(`${CLIMATES[prefs.climate].label} weather, around ${temp}°C`);
      else if (climate < 0.6) warnings.push(`Around ${temp}°C, outside your ${CLIMATES[prefs.climate].label.toLowerCase()} preference`);
    }
    if (budget >= 1 && prefs.budget < 4) reasons.push(`Fits a ${BUDGETS[prefs.budget].label.toLowerCase()} budget`);
    else if (budget < 0.7) warnings.push(`Pricier than your budget (${COST_DAILY[city.country.cost]} a day)`);
    if (km !== null && prefs.distance !== "any") {
      if (distance >= 0.7) reasons.push(`About ${fmtKm(km)} from home`);
      else if (distance < 0.35) warnings.push(`About ${fmtKm(km)} from home`);
    }
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
  function planItinerary(scoredCities, lengthKey) {
    const L = LENGTHS[lengthKey] || LENGTHS.week;
    const stops = scoredCities.slice(0, Math.min(L.stops, scoredCities.length));
    if (!stops.length) return [];
    if (stops.length === 1) return [{ city: stops[0].city, days: L.days }];
    const minDays = 2;
    const spare = L.days - minDays * stops.length;
    const weightSum = stops.reduce((a, s) => a + s.score, 0) || 1;
    const plan = stops.map((s) => ({ city: s.city, days: minDays + Math.floor((spare * s.score) / weightSum) }));
    let used = plan.reduce((a, p) => a + p.days, 0);
    for (let i = 0; used < L.days; i = (i + 1) % plan.length, used++) plan[i].days++;
    return plan;
  }

  /** Main entry point: rank regions, countries and cities. */
  function recommend(index, rawPrefs) {
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

    const cityResults = index.cities.filter((c) => !excluded.has(c.region.id)).map((c) => scoreCity(c, prefs, ctx));
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
      countryResults.push({
        country,
        score: Math.max(0, Math.round(score)),
        cities: list,
        itinerary: planItinerary(list, prefs.length),
        reasons: mergeReasons(top, labels),
        warnings: mergeWarnings(top),
      });
    }
    countryResults.sort((a, b) => b.score - a.score);

    const regionResults = index.regions
      .filter((r) => !excluded.has(r.id))
      .map((region) => {
        const cs = countryResults.filter((c) => c.country.region === region.id);
        const top = cs.slice(0, 2);
        const score = top.length ? Math.round(top.reduce((a, c) => a + c.score, 0) / top.length) : 0;
        return { region, score, countries: cs };
      })
      .sort((a, b) => b.score - a.score);

    // For long trips, suggest pairing the top country with a neighbour in the same region.
    for (const c of countryResults) {
      if (prefs.length === "long") {
        const partner = countryResults.find((o) => o !== c && o.country.region === c.country.region);
        c.pairWith = partner ? partner.country : null;
      }
    }

    cityResults.sort((a, b) => b.score - a.score);
    return { prefs, regions: regionResults, countries: countryResults, cities: cityResults };
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

  /** Compact, URL-safe encoding of preferences for sharing. */
  function encodePrefs(prefs) {
    const p = normalizePrefs(prefs);
    const i = TAG_ORDER.map((t) => p.interests[t] || 0).join("");
    const parts = [
      `i=${i}`,
      `m=${p.month}`,
      `l=${p.length}`,
      `b=${p.budget}`,
      `c=${p.climate}`,
      `w=${p.company}`,
      `v=${p.vibe}`,
      `h=${p.home}`,
      `d=${p.distance}`,
      `x=${p.exclude.join(",")}`,
    ];
    return parts.join("&");
  }

  function decodePrefs(str) {
    const q = new URLSearchParams(str);
    const p = normalizePrefs({});
    const i = q.get("i") || "";
    TAG_ORDER.forEach((t, idx) => {
      const v = Number(i[idx] || 0);
      if (v === 1 || v === 2) p.interests[t] = v;
    });
    const m = Number(q.get("m"));
    if (m >= 0 && m <= 12) p.month = m;
    if (LENGTHS[q.get("l")]) p.length = q.get("l");
    const b = Number(q.get("b"));
    if (BUDGETS[b]) p.budget = b;
    if (CLIMATES[q.get("c")]) p.climate = q.get("c");
    if (COMPANY_BOOST[q.get("w")]) p.company = q.get("w");
    if (["mix", "iconic", "hidden"].includes(q.get("v"))) p.vibe = q.get("v");
    p.home = q.get("h") || "";
    if (["any", "near", "medium", "far"].includes(q.get("d"))) p.distance = q.get("d");
    p.exclude = (q.get("x") || "").split(",").filter(Boolean);
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
