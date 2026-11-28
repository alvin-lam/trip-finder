#!/usr/bin/env node
/*
 * QC & Bug Hunter for Trip Finder. Reads the data, the engine and the published site in
 * docs/ and reports anything broken, inconsistent or likely to bite a visitor.
 * It changes no files.
 *
 *   node tools/qc.js                 every static check (data, build, engine, security, SEO, PWA)
 *   node tools/qc.js --browser       also drive the real app in headless Chromium
 *   node tools/qc.js --only=data,pwa run only these sections
 *   node tools/qc.js --json          print the findings as JSON (for the qc-bug-hunter agent)
 *
 * Sections: build, data, text, docs, engine, security, seo, pwa, browser.
 * Exit code: 1 when any check fails, 0 when there are only warnings or nothing at all.
 * npm run qc runs the static checks; npm run qc:full adds the browser run.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = path.join(__dirname, "..");
const DOCS = path.join(REPO, "docs");
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const wantBrowser = args.includes("--browser") || only.includes("browser");
const asJSON = args.includes("--json");
const MAX_LISTED = 8; // examples shown per finding

const read = (rel) => fs.readFileSync(path.join(DOCS, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(DOCS, rel));

// ---------------------------------------------------------------------------------------
// Findings

const findings = [];
let current = "";
function report(level, title, items = []) {
  findings.push({ section: current, level, title, count: items.length, examples: items.slice(0, MAX_LISTED) });
}
const fail = (title, items) => report("fail", title, items);
const warn = (title, items) => report("warn", title, items);
/** Fail (or warn) when the list of problems is not empty. */
const expectNone = (items, title, level = "fail") => items.length && report(level, title, items);

async function section(name, fn) {
  if (only.length && !only.includes(name)) return;
  current = name;
  try {
    await fn();
  } catch (err) {
    fail(`section crashed: ${err.message}`, [String(err.stack).split("\n").slice(0, 4).join(" | ")]);
  }
}

// A seeded random generator, so a fuzz failure can be reproduced with the same seed.
const SEED = Number((args.find((a) => a.startsWith("--seed=")) || "--seed=20261128").slice(7));
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// ---------------------------------------------------------------------------------------
// Load the app the way the build does. If this fails, the app itself will not load.

let data, E, index, loadError;
try {
  data = require(path.join(DOCS, "js/data.js"));
  E = require(path.join(DOCS, "js/engine.js"));
  index = E.buildIndex(data);
} catch (err) {
  loadError = err;
}

const isMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
const isTemps = (t) => Array.isArray(t) && t.length === 12 && t.every((v) => typeof v === "number" && v >= -45 && v <= 50);

(async function main() {
  await section("build", () => {
    if (loadError) return fail(`the app does not load: ${loadError.message}`);
    // Generated files must match their sources, or the live site shows stale data.
    const { build: buildData, OUT } = require("./build-data.js");
    if (buildData() !== fs.readFileSync(OUT, "utf8")) fail("docs/js/data.js is out of date with data/ (run npm run build)");
    const { build: buildPages } = require("./build-pages.js");
    const files = buildPages();
    const stale = Object.entries(files).filter(([p, body]) => !exists(p) || read(p) !== body).map(([p]) => p);
    expectNone(stale, "generated pages are missing or out of date (run npm run build:pages)");
    const want = new Set(index.cities.map((c) => c.id));
    const orphans = fs.readdirSync(path.join(DOCS, "place")).filter((d) => !want.has(d));
    expectNone(orphans, "docs/place/ has folders for places that no longer exist");
  });

  if (loadError) return finish();

  await section("data", () => {
    const D = path.join(REPO, "data");
    // Destination files and the order list agree.
    const order = JSON.parse(fs.readFileSync(path.join(D, "countries/order.json"), "utf8"));
    const files = fs.readdirSync(path.join(D, "countries")).filter((f) => f !== "order.json").map((f) => f.replace(/\.json$/, ""));
    expectNone(files.filter((f) => !order.includes(f)), "destination files missing from countries/order.json");
    expectNone(order.filter((id, i) => order.indexOf(id) !== i), "countries/order.json lists a destination twice");
    for (const id of order) {
      const c = JSON.parse(fs.readFileSync(path.join(D, `countries/${id}.json`), "utf8"));
      if (c.id !== id) fail(`countries/${id}.json has id "${c.id}"`);
    }

    // Destinations.
    const bad = [];
    for (const c of index.countries) {
      if (!(Number.isInteger(c.cost) && c.cost >= 1 && c.cost <= 5)) bad.push(`${c.id}: cost ${c.cost}`);
      if (!Array.isArray(c.best) || !c.best.length || !c.best.every(isMonth)) bad.push(`${c.id}: best months ${JSON.stringify(c.best)}`);
      if (!isTemps(c.temps)) bad.push(`${c.id}: temps ${JSON.stringify(c.temps)}`);
      if (!(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180)) bad.push(`${c.id}: lat/lon ${c.lat},${c.lon}`);
      if (!c.cities.length) bad.push(`${c.id}: no places`);
      for (const k of ["name", "flag", "currency", "language", "blurb"]) if (!c[k] && c.kind !== "micronation") bad.push(`${c.id}: no ${k}`);
    }
    expectNone(bad, "destinations with invalid fields");

    // Places.
    const badPlace = [];
    const seen = new Map();
    for (const p of index.cities) {
      if (seen.has(p.id)) badPlace.push(`${p.id}: id shared by "${seen.get(p.id)}" and "${p.name}"`);
      seen.set(p.id, p.name);
      if (!(Number.isInteger(p.pop) && p.pop >= 1 && p.pop <= 5)) badPlace.push(`${p.id}: popularity ${p.pop}`);
      if (typeof p.blurb !== "string" || p.blurb.trim().length < 10) badPlace.push(`${p.id}: blurb "${p.blurb}"`);
      if (!Array.isArray(p.best) || !p.best.length || !p.best.every(isMonth)) badPlace.push(`${p.id}: best months ${JSON.stringify(p.best)}`);
      if (p.temps && !isTemps(p.temps)) badPlace.push(`${p.id}: temps ${JSON.stringify(p.temps)}`);
      if (!Object.values(p.tags).some((v) => v > 0)) badPlace.push(`${p.id}: every interest is 0`);
    }
    expectNone(badPlace, "places with invalid fields");

    // Coordinates: present, valid, and not on the wrong side of the world.
    const noLL = index.cities.filter((p) => !p.ll).map((p) => p.id);
    expectNone(noLL, "places with no coordinates (distance, nearby places and park links skip them)", "warn");
    const badLL = index.cities.filter((p) => p.ll && !(Math.abs(p.ll[0]) <= 90 && Math.abs(p.ll[1]) <= 180)).map((p) => `${p.id}: ${p.ll}`);
    expectNone(badLL, "places with impossible coordinates");
    // A place far from its destination's other places is usually a geocoding mix-up
    // (a namesake town in another country). Compare against the destination's median place.
    const far = [];
    for (const c of index.countries) {
      const pts = c.cities.filter((p) => p.ll);
      if (pts.length < 3) continue;
      const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const lat = med(pts.map((p) => p.ll[0]));
      const lon = med(pts.map((p) => p.ll[1]));
      const dists = pts.map((p) => E.haversineKm(lat, lon, p.ll[0], p.ll[1]));
      const typical = Math.max(med(dists), 150);
      pts.forEach((p, i) => {
        if (dists[i] > Math.max(2000, typical * 8)) far.push(`${p.id}: ${Math.round(dists[i])} km from the rest of ${c.name}`);
      });
    }
    expectNone(far, "places far from the rest of their destination (check their coordinates)", "warn");

    // Typical lows.
    const badRange = Object.entries(data.RANGES || {}).filter(([, r]) => !(Array.isArray(r) && r.length === 12 && r.every((v) => typeof v === "number" && v >= 0 && v <= 30)));
    expectNone(badRange.map(([id, r]) => `${id}: ${JSON.stringify(r)}`), "RANGES entries that are not 12 values from 0 to 30");
    const inverted = [];
    for (const p of index.cities)
      for (let m = 1; m <= 12; m++) {
        const hi = E.tempFor(p, m);
        const lo = E.lowFor(p, m);
        if (lo != null && hi != null && lo > hi) inverted.push(`${p.id} ${E.MONTHS[m - 1]}: low ${lo} above high ${hi}`);
      }
    expectNone(inverted, "typical lows above typical highs");

    // Festivals: every event has a usable name and note.
    const badFest = [];
    for (const [id, list] of Object.entries(data.FESTIVALS))
      for (const [name, , note] of list) if (!name || !note) badFest.push(`${id}: "${name}"`);
    expectNone(badFest, "festivals with no name or note");
    const dupFest = [];
    for (const [id, list] of Object.entries(data.FESTIVALS)) {
      const names = list.map((f) => f[0].toLowerCase());
      names.forEach((n, i) => names.indexOf(n) !== i && dupFest.push(`${id}: "${list[i][0]}"`));
    }
    expectNone(dupFest, "festivals listed twice at the same place", "warn");

    // Every destination has its facts, LGBTQ+ and region entries; advisories are known levels.
    const advisory = Object.entries(data.ADVISORY || {}).filter(([, a]) => !["reconsider", "avoid"].includes(a.level || a[0])).map(([id]) => id);
    expectNone(advisory, "ADVISORY entries with an unknown level");
    const lgbtq = Object.entries(data.LGBTQ || {}).filter(([, a]) => !["welcoming", "mixed", "caution"].includes(a.level || a[0])).map(([id]) => id);
    expectNone(lgbtq, "LGBTQ entries with an unknown level");
  });

  await section("text", () => {
    // Visitor-facing text from data/: no em dashes (house style), no stray spacing.
    const texts = [];
    for (const c of index.countries) {
      texts.push([`${c.id} blurb`, c.blurb], [`${c.id} status`, c.status]);
      for (const p of c.cities) texts.push([`${p.id} name`, p.name], [`${p.id} blurb`, p.blurb]);
    }
    for (const [id, list] of Object.entries(data.FESTIVALS)) for (const [name, , note] of list) texts.push([`${id} festival`, name], [`${id} festival note`, note]);
    for (const [id, v] of Object.entries(data.FAMILY || {})) texts.push([`${id} family`, typeof v === "string" ? v : JSON.stringify(v)]);
    const live = texts.filter(([, t]) => typeof t === "string");
    expectNone(live.filter(([, t]) => /—/.test(t)).map(([k, t]) => `${k}: ${t}`), "em dashes in visitor-facing text", "warn");
    expectNone(live.filter(([, t]) => /  |^\s|\s$/.test(t)).map(([k, t]) => `${k}: "${t}"`), "double, leading or trailing spaces");
    expectNone(live.filter(([, t]) => /<|>|&[a-z]+;/i.test(t)).map(([k, t]) => `${k}: ${t}`), "HTML-looking text in the data (it is escaped, so it shows literally)", "warn");
    const blurbs = live.filter(([k]) => /blurb$/.test(k) && !/[.!?)"”]$/.test(live.find(([kk]) => kk === k)[1]));
    expectNone(blurbs.map(([k, t]) => `${k}: ${t}`), "blurbs that do not end with a full stop", "warn");
    const dupBlurb = new Map();
    for (const p of index.cities) dupBlurb.set(p.blurb, [...(dupBlurb.get(p.blurb) || []), p.id]);
    expectNone([...dupBlurb.values()].filter((ids) => ids.length > 1).map((ids) => ids.join(", ")), "places sharing the exact same blurb", "warn");
  });

  await section("docs", () => {
    // The README quotes counts; they drift whenever data changes.
    const readme = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
    const n = (s) => Number(s.replace(/,/g, ""));
    const festivals = Object.values(data.FESTIVALS).flat();
    const claims = [
      [/ranks (\d+) world regions/, index.regions.length, "world regions"],
      [/and (\d[\d,]*) destinations/, index.countries.filter((c) => c.kind !== "micronation").length, "destinations"],
      [/cover (\d[\d,]*) cities and places/, index.cities.length, "cities and places"],
      [/(\d[\d,]*) Pride events/, festivals.filter((f) => f[3] === "pride").length, "Pride events"],
      [/(\d[\d,]*) Christmas markets/, festivals.filter((f) => f[3] === "market").length, "Christmas markets"],
      [/and (\d+) territories/, index.countries.filter((c) => c.kind === "territory").length, "territories"],
    ];
    const drift = [];
    for (const [re, actual, what] of claims) {
      const m = readme.match(re);
      if (!m) drift.push(`README no longer states the number of ${what} (pattern ${re})`);
      else if (n(m[1]) !== actual) drift.push(`README says ${m[1]} ${what}; the data has ${actual}`);
    }
    expectNone(drift, "README counts that no longer match the data", "warn");
    // Files the README points at still exist.
    const paths = [...readme.matchAll(/`((?:docs|data|tools)\/[\w./<>-]+)`/g)].map((m) => m[1]).filter((p) => !/[<>]/.test(p));
    expectNone([...new Set(paths)].filter((p) => !fs.existsSync(path.join(REPO, p))), "README mentions files that do not exist", "warn");
    const sw = read("sw.js");
    const cache = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
    const readmeCache = readme.match(/from `(wtt-v\d+)` to `(wtt-v\d+)`/);
    if (cache && readmeCache) {
      const v = (s) => Number(s.replace(/\D/g, ""));
      if (v(readmeCache[1]) < v(cache) - 10) warn(`README's cache-bump example (${readmeCache[1]}) is far behind sw.js (${cache})`);
    }
  });

  await section("engine", () => {
    const rand = rng(SEED);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const tags = E.TAG_ORDER;
    const problems = [];
    const runs = 400;
    for (let i = 0; i < runs; i++) {
      const prefs = {
        interests: Object.fromEntries(tags.filter(() => rand() < 0.35).map((t) => [t, pick([1, 2])])),
        month: Math.floor(rand() * 13),
        length: pick(Object.keys(E.LENGTHS)),
        budget: pick([1, 2, 3, 4]),
        climate: pick(Object.keys(E.CLIMATES)),
        company: pick(["solo", "couple", "family", "friends"]),
        vibe: pick(["mix", "iconic", "hidden"]),
        home: rand() < 0.5 ? pick(index.homes).id : "",
        distance: pick(["any", "near", "far", "medium"]),
        exclude: index.regions.filter(() => rand() < 0.1).map((r) => r.id),
      };
      const tag = `seed ${SEED} run ${i} ${JSON.stringify(prefs)}`;
      let res;
      try {
        res = E.recommend(index, prefs, { includeAvoid: rand() < 0.2 });
      } catch (err) {
        problems.push(`${tag}: recommend threw ${err.message}`);
        continue;
      }
      const L = E.LENGTHS[res.prefs.length];
      for (const r of res.cities)
        if (!Number.isFinite(r.score) || r.score < 0 || r.score > 100) problems.push(`${tag}: ${r.city.id} scored ${r.score}`);
      for (const c of res.countries) {
        if (!Number.isFinite(c.score) || c.score < 0 || c.score > 100) problems.push(`${tag}: ${c.country.id} scored ${c.score}`);
        const days = c.itinerary.reduce((a, s) => a + s.days, 0);
        if (days !== Math.min(L.days, c.country.maxDays)) problems.push(`${tag}: ${c.country.id} itinerary has ${days} days for a ${L.days}-day trip`);
        if (c.itinerary.some((s) => s.days < 1)) problems.push(`${tag}: ${c.country.id} has a stop with ${c.itinerary.map((s) => s.days)} days`);
        if (new Set(c.itinerary.map((s) => s.city.id)).size !== c.itinerary.length) problems.push(`${tag}: ${c.country.id} visits a stop twice`);
        if (c.pairWith && c.pairWith.id === c.country.id) problems.push(`${tag}: ${c.country.id} pairs with itself`);
        if (res.prefs.exclude.includes(c.country.region)) problems.push(`${tag}: ${c.country.id} is in an excluded region`);
        if (!(c.reasons || []).every((s) => typeof s === "string" && !/undefined|NaN|null/.test(s))) problems.push(`${tag}: ${c.country.id} reasons ${JSON.stringify(c.reasons)}`);
        if (!(c.warnings || []).every((s) => typeof s === "string" && !/undefined|NaN|null/.test(s))) problems.push(`${tag}: ${c.country.id} warnings ${JSON.stringify(c.warnings)}`);
      }
      for (const r of res.cities.slice(0, 20))
        for (const s of [...(r.reasons || []), ...(r.warnings || [])])
          if (typeof s !== "string" || /undefined|NaN|null|\[object/.test(s)) problems.push(`${tag}: ${r.city.id} says "${s}"`);
      if (!res.countries.every((c, j, a) => j === 0 || a[j - 1].score >= c.score)) problems.push(`${tag}: countries are not sorted by score`);
      // Shared links reproduce the same answers.
      const back = E.decodePrefs(E.encodePrefs(res.prefs, index), index);
      if (JSON.stringify(back) !== JSON.stringify(res.prefs)) problems.push(`${tag}: share link round trip gave ${JSON.stringify(back)}`);
    }
    expectNone(problems, `recommendations broke in fuzzing (${runs} random quizzes)`);

    // A must-have interest should matter: with beaches as a must, the top places have beaches.
    const beach = E.recommend(index, { ...E.DEFAULT_PREFS, interests: { beach: 2 } });
    const topNoBeach = beach.cities.slice(0, 20).filter((r) => r.city.tags.beach < 3).map((r) => `${r.city.id} (beach ${r.city.tags.beach})`);
    expectNone(topNoBeach, "a must-have beach quiz ranks places without good beaches in the top 20", "warn");

    // Every date for the colour schemes, in both hemispheres, through the end of the holiday tables.
    const src = read("js/engine.js");
    const lastYear = Math.min(...["LUNAR_NEW_YEAR", "DIWALI"].map((k) => Math.max(...[...(src.match(new RegExp(`${k} = \\{([^}]+)\\}`)) || ["", ""])[1].matchAll(/(\d{4}):/g)].map((m) => Number(m[1])))));
    const thisYear = new Date().getFullYear();
    if (lastYear - thisYear < 2) warn(`Lunar New Year and Diwali dates end in ${lastYear}; add later years to engine.js`);
    const schemeErrors = [];
    for (const zone of ["America/New_York", "Australia/Sydney", "UTC"])
      for (let t = Date.UTC(thisYear, 0, 1); t < Date.UTC(lastYear + 2, 0, 1); t += 86400000) {
        try {
          const s = E.seasonalScheme(new Date(t), zone);
          if (!s || typeof s !== "object") schemeErrors.push(`${new Date(t).toISOString().slice(0, 10)} ${zone}: ${s}`);
        } catch (err) {
          schemeErrors.push(`${new Date(t).toISOString().slice(0, 10)} ${zone}: ${err.message}`);
        }
      }
    expectNone(schemeErrors, "seasonalScheme fails on some dates");

    // Month formatting and units never print junk.
    const fmt = [];
    for (let m = 1; m < 4096; m += 37) {
      const months = [...Array(12).keys()].map((i) => i + 1).filter((i) => m & (1 << (i - 1)));
      const s = E.formatMonths(months);
      if (typeof s !== "string" || /undefined|NaN/.test(s)) fmt.push(`${JSON.stringify(months)} -> ${s}`);
    }
    expectNone(fmt, "formatMonths prints junk");
  });

  await section("security", () => {
    const cspOf = (html) => (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/) || [])[1];
    const csp = cspOf(read("index.html"));
    if (!csp) return fail("index.html has no Content-Security-Policy meta tag");
    if (/unsafe-inline|unsafe-eval|https?:/.test(csp)) fail(`the CSP allows inline code or other sites: ${csp}`);
    const samples = ["privacy.html", "explore/index.html", ...index.cities.filter((_, i) => i % 97 === 0).map((c) => `place/${c.id}/index.html`)];
    expectNone(samples.filter((p) => exists(p) && cspOf(read(p)) !== csp), "pages whose CSP differs from index.html");
    const readme = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
    const header = (readme.match(/`Content-Security-Policy: ([^`]+)`/) || [])[1];
    if (header && header !== `${csp}; frame-ancestors 'none'`) warn("the README's Cloudflare CSP header no longer matches the meta tag plus frame-ancestors");

    for (const f of ["index.html", "privacy.html", "explore/index.html", "place/jp-kyoto/index.html"].filter(exists)) {
      const html = read(f);
      const hits = [];
      if (/<style/i.test(html)) hits.push("inline <style>");
      if (/\sstyle="/i.test(html)) hits.push('style="…" attribute');
      if (/\son[a-z]+="/i.test(html)) hits.push("inline event handler");
      if ((html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).some((s) => !s.includes('type="application/ld+json"'))) hits.push("inline <script>");
      if (/<(script|link|img)[^>]+(src|href)="(https?:)?\/\/(?!tripfinder\.alltripsconsidered\.com)/i.test(html.replace(/<link rel="canonical"[^>]*>|<a [^>]*>/g, ""))) hits.push("loads a file from another site");
      expectNone(hits, `${f} uses something the CSP blocks`);
    }
    for (const f of ["js/app.js", "js/install.js", "js/theme-boot.js"]) {
      const js = read(f);
      const hits = [];
      if (/<[a-z][^>]*\sstyle="/.test(js)) hits.push('renders style="…" (use a class or data-css)');
      if (/\beval\(|new Function\(|setTimeout\(\s*["'`]/.test(js)) hits.push("uses eval or string timers");
      if (/\.outerHTML\s*=|document\.write/.test(js)) hits.push("uses outerHTML or document.write");
      // Rendered markup with onclick="…" is blocked by the CSP, so the handler silently never runs.
      js.split("\n").forEach((line, i) => /<[a-z][^>]*\son[a-z]+="/.test(line) && hits.push(`${f}:${i + 1} renders an inline event handler, which the CSP blocks`));
      expectNone(hits, `${f} has risky code`);
    }
    // innerHTML templates should escape every interpolated name or blurb.
    const app = read("js/app.js");
    // Only lines that build markup count; plain-text exports and regex tests do not.
    const unescaped = [];
    app.split("\n").forEach((line, i) => {
      if (!/<[a-z]/.test(line)) return;
      for (const m of line.matchAll(/\$\{([a-zA-Z_.]*\.(name|blurb|note|status|capital|site|area|label))\}/g)) unescaped.push(`docs/js/app.js:${i + 1} \${${m[1]}}`);
    });
    expectNone(unescaped, "app.js interpolates text into HTML without esc()", "warn");

    // Untrusted input is cleaned.
    const junk = { interests: { beach: 2, food: "<b>", nope: 1 }, month: "<img>", length: "forever", budget: 9, climate: "<script>", company: "crowd", vibe: 1, home: '"><svg>', distance: {}, exclude: ["bad id", 3] };
    const clean = E.normalizePrefs(junk);
    if (JSON.stringify(clean) !== JSON.stringify({ ...E.DEFAULT_PREFS, interests: { beach: 2 } })) fail(`normalizePrefs keeps junk: ${JSON.stringify(clean)}`);
    for (const v of [null, "text", 42, [], { __proto__: { month: 3 } }]) {
      try {
        E.normalizePrefs(v);
      } catch (err) {
        fail(`normalizePrefs(${JSON.stringify(v)}) throws ${err.message}`);
      }
    }
    const codes = ["", "r-", "r-<script>", "explore", "r-" + "9".repeat(40), "r-%00", "r-0110000000120100000<b>"];
    expectNone(codes.filter((c) => E.decodePrefs(c, index) !== null), "decodePrefs accepts codes that are not quiz answers");
    const protoIds = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];
    expectNone(protoIds.filter((id) => index.cityById[id] !== undefined || index.countryById[id] !== undefined), "id lookups match built-in object names");
  });

  await section("seo", () => {
    const html = read("index.html");
    const site = `https://${read("CNAME").trim()}/`;
    const meta = (h, attr, name) => (h.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1];
    const desc = meta(html, "name", "description");
    if (!desc || desc.length < 70 || desc.length > 160) fail(`home description is ${desc ? desc.length : 0} characters (aim for 70 to 160)`);
    if (meta(html, "property", "og:description") !== desc) fail("og:description differs from the description");
    if (meta(html, "property", "og:url") !== site) fail("og:url is not the live address");
    if (!new RegExp(`Sitemap: ${site}sitemap.xml`).test(read("robots.txt"))) fail("robots.txt does not point at the sitemap");
    const png = fs.readFileSync(path.join(DOCS, "img/og-image.png"));
    if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) fail("og-image.png is not 1200 x 630");
    try {
      JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    } catch (err) {
      fail(`index.html structured data does not parse: ${err.message}`);
    }

    const sitemap = read("sitemap.xml");
    const locs = sitemap.match(/<loc>/g) || [];
    if (locs.length !== index.cities.length + 3) fail(`sitemap lists ${locs.length} addresses; expected ${index.cities.length + 3}`);

    // Every place page: its own title, a usable description, canonical, parseable structured data.
    const titles = new Map();
    const problems = [];
    const emDash = [];
    for (const c of index.cities) {
      const f = `place/${c.id}/index.html`;
      if (!exists(f)) continue;
      const page = read(f);
      const title = (page.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
      titles.set(title, [...(titles.get(title) || []), c.id]);
      const d = meta(page, "name", "description") || "";
      if (d.length < 50 || d.length > 300) problems.push(`${c.id}: description is ${d.length} characters`);
      if (!page.includes(`<link rel="canonical" href="${site}place/${c.id}/" />`)) problems.push(`${c.id}: wrong canonical`);
      if (/—/.test(page)) emDash.push(c.id);
      try {
        JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      } catch {
        problems.push(`${c.id}: structured data does not parse`);
      }
      if (/undefined|NaN|\[object Object\]/.test(page.replace(/<script[\s\S]*?<\/script>/g, ""))) problems.push(`${c.id}: page text says undefined, NaN or [object Object]`);
    }
    expectNone(problems, "place pages with SEO problems");
    expectNone(emDash, "generated pages with em dashes", "warn");
    expectNone([...titles.entries()].filter(([, ids]) => ids.length > 1).map(([t, ids]) => `${t}: ${ids.join(", ")}`), "place pages that share a title", "warn");
  });

  await section("pwa", () => {
    const sw = read("sw.js");
    const shell = JSON.parse((sw.match(/const SHELL = (\[[\s\S]*?\]);/) || [])[1].replace(/,\s*\]/, "]"));
    expectNone(shell.filter((f) => f !== "./" && !exists(f)), "sw.js SHELL lists files that do not exist (install fails and the app never works offline)");
    // Files the home page loads should be cached so it opens offline.
    const html = read("index.html");
    const local = [...html.matchAll(/(?:href|src)="(?!https?:|#|\/|data:|mailto:)([^"]+)"/g)].map((m) => m[1].split(/[?#]/)[0]);
    expectNone([...new Set(local)].filter((f) => !exists(f)), "index.html refers to files that do not exist");
    expectNone([...new Set(local)].filter((f) => /\.(css|js|woff2|png|ico|webmanifest)$/.test(f) && !shell.includes(f)), "files index.html loads that sw.js does not cache", "warn");
    const css = read("css/fonts.css") + read("css/styles.css");
    const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:"));
    expectNone(urls.filter((u) => !fs.existsSync(path.join(DOCS, "css", u))), "CSS refers to files that do not exist");
    const manifest = JSON.parse(read("manifest.webmanifest"));
    expectNone((manifest.icons || []).map((i) => i.src).filter((s) => !exists(s.replace(/^\.?\//, ""))), "manifest icons that do not exist");

    // Shipping changed files without bumping CACHE leaves returning visitors on the old app.
    try {
      execFileSync("git", ["rev-parse", "--verify", "-q", "origin/prod"], { cwd: REPO, stdio: "ignore" });
      const changed = execFileSync("git", ["diff", "--name-only", "origin/prod", "--", "docs/"], { cwd: REPO, encoding: "utf8" })
        .split("\n")
        .filter((f) => f && !f.startsWith("docs/place/") && !f.startsWith("docs/explore/") && f !== "docs/sitemap.xml" && f !== "docs/sw.js");
      const prodSW = execFileSync("git", ["show", "origin/prod:docs/sw.js"], { cwd: REPO, encoding: "utf8" });
      const v = (s) => (s.match(/const CACHE = "([^"]+)"/) || [])[1];
      if (changed.length && v(prodSW) === v(sw)) fail(`cached files changed since prod but CACHE is still ${v(sw)} in sw.js`, changed);
    } catch {
      /* no prod branch here; skip */
    }
  });

  await section("browser", async () => {
    if (!wantBrowser) return;
    await browserChecks();
  });

  finish();
})();

// ---------------------------------------------------------------------------------------
// Browser checks: serve docs/ locally and drive the app in headless Chromium.

async function browserChecks() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    return warn("Playwright is not installed, so the browser checks were skipped");
  }
  const http = require("node:http");
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain" };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(DOCS, path.normalize(p));
    if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  const failures = [];
  const hidden = [];
  const watch = (page, label) => {
    page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${label}: console: ${m.text()}`));
    page.on("response", (r) => r.status() >= 400 && r.url().startsWith(base) && errors.push(`${label}: ${r.status()} ${r.url().slice(base.length)}`));
  };
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      failures.push(`${label}: ${err.message.split("\n")[0]}`);
    }
  };

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    watch(page, "desktop");

    await step("home loads", async () => {
      await page.goto(`${base}/`);
      await page.locator('[data-action="start"]').waitFor({ timeout: 10000 });
    });
    await step("Surprise me opens a place", async () => {
      await page.click('[data-action="surprise"]');
      await page.locator("#detail[open]").waitFor({ timeout: 5000 });
      if (!/^\/place\/[a-z0-9-]+\/$/.test(new URL(page.url()).pathname)) throw new Error(`address did not move to /place/<id>/ (${page.url()})`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#detail[open]"), null, { timeout: 3000 });
      if (new URL(page.url()).pathname !== "/") throw new Error(`closing the place left the address at ${page.url()}`);
    });
    await step("the quiz walks through every step to results", async () => {
      await page.goto(`${base}/`);
      await page.click('[data-action="start"]');
      await page.locator('[data-action="interest"]').first().click();
      for (let i = 0; i < 8 && !/#r-/.test(page.url()); i++) {
        const next = page.locator("#view-plan button", { hasText: /Next|See my matches/ }).last();
        if (!(await next.count())) break;
        await next.click();
        await page.waitForTimeout(150);
      }
      if (!/#r-/.test(page.url())) throw new Error("finishing the quiz did not reach results");
      await page.locator('#view-plan [data-action="open-city"]').first().waitFor({ timeout: 5000 });
    });
    await step("a shared results link reopens the same results", async () => {
      const top = async (pg) => (await pg.locator('#view-plan [data-action="open-city"]').allInnerTexts()).slice(0, 5).join(" | ");
      const before = await top(page);
      const p2 = await ctx.newPage();
      watch(p2, "shared link");
      await p2.goto(page.url());
      await p2.locator('#view-plan [data-action="open-city"]').first().waitFor({ timeout: 5000 });
      const after = await top(p2);
      if (before !== after) throw new Error(`a shared link shows different results (${before} vs ${after})`);
      await p2.close();
    });
    await step("a place from the results opens, and Back closes it", async () => {
      await page.locator('#view-plan [data-action="open-city"]').first().click();
      await page.locator("#detail[open]").waitFor({ timeout: 5000 });
      await page.goBack();
      await page.waitForFunction(() => !document.querySelector("#detail[open]"), null, { timeout: 3000 });
      if (!/#r-/.test(page.url())) throw new Error(`Back from a place did not return to the results (${page.url()})`);
    });
    await step("Explore search ignores accents and finds codes", async () => {
      await page.goto(`${base}/explore/`);
      const box = page.locator('#view-explore input[type="search"], #view-explore input[type="text"]').first();
      await box.waitFor({ timeout: 5000 });
      for (const [q, want] of [["kyoto", "Kyoto"], ["reykjavik", "Reykjavík"], ["zürich", "Zurich"], ["galapagos", "Galápagos"], ["usa", "United States"], ["pride in june", "Pride"]]) {
        await box.fill(q);
        await page.waitForTimeout(400);
        const shown = await page.locator("#explore-results").innerText();
        // Expand collapsed country cards before deciding the place is missing.
        for (const t of await page.locator('#explore-results [data-action="toggle-places"]').all()) await t.click().catch(() => {});
        const text = await page.locator("#explore-results").innerText();
        if (!text.includes(want)) throw new Error(`searching "${q}" did not list ${want}`);
        if (!shown.includes(want)) hidden.push(`searching "${q}" finds ${want} but hides it until "Show places" is clicked`);
      }
      await box.fill("zzqqxxnotaplace");
      await page.waitForTimeout(400);
      if (!(await page.locator("#explore-results").innerText()).trim()) throw new Error("an empty search shows a blank area with no message");
    });
    await step("a place address opens its details", async () => {
      await page.goto(`${base}/place/jp-kyoto/`);
      await page.locator("#detail[open]").waitFor({ timeout: 5000 });
      if (!(await page.title()).includes("Kyoto")) throw new Error(`tab title is "${await page.title()}"`);
    });
    await step("saving a place updates the Shortlist", async () => {
      await page.locator('#detail [data-action="save"]').first().click();
      await page.keyboard.press("Escape");
      await page.goto(`${base}/#shortlist`);
      await page.waitForTimeout(500);
      if (!(await page.locator("#view-shortlist").innerText()).includes("Kyoto")) throw new Error("Kyoto is not in the Shortlist after saving it");
    });
    await step("hostile links do not break the app", async () => {
      for (const h of ["#r-<img src=x onerror=alert(1)>", "#r-zzzz", "#explore", "#shortlist", "#constructor"]) {
        await page.goto(`${base}/${h}`);
        await page.waitForTimeout(250);
      }
      // An unknown place address is a 404 on GitHub Pages too; that one is expected.
      const before = errors.length;
      await page.goto(`${base}/place/constructor/`).catch(() => {});
      errors.splice(before);
    });
    await step("corrupt saved data does not break the app", async () => {
      await page.goto(`${base}/`);
      await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) localStorage.setItem(localStorage.key(i), "{not json");
        localStorage.setItem("wtt-prefs", '{"month":"<b>"}');
      });
      await page.reload();
      await page.locator('[data-action="start"]').waitFor({ timeout: 5000 });
      await page.evaluate(() => localStorage.clear());
    });
    await step("the privacy page loads", async () => {
      await page.goto(`${base}/privacy.html`);
    });
    await ctx.close();

    // Phone width: nothing may scroll sideways.
    const phone = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const mp = await phone.newPage();
    watch(mp, "phone");
    for (const [label, url, prep] of [
      ["home", "/", null],
      ["results", "/", async () => mp.click('[data-action="surprise"]')],
      ["explore", "/explore/", null],
      ["place", "/place/jp-kyoto/", null],
      ["privacy", "/privacy.html", null],
    ])
      await step(`no sideways scroll on a phone (${label})`, async () => {
        await mp.goto(base + url);
        await mp.waitForTimeout(400);
        if (prep) {
          await prep();
          await mp.waitForTimeout(600);
        }
        const over = await mp.evaluate(() => {
          const w = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > w + 1 && getComputedStyle(el).position !== "fixed")
            .filter((el) => !el.closest("[hidden], dialog:not([open])"))
            .slice(0, 3)
            .map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")}`);
          return { scroll: document.documentElement.scrollWidth - w, wide };
        });
        if (over.scroll > 1) throw new Error(`page is ${over.scroll}px wider than the screen (${over.wide.join(", ")})`);
      });
    await phone.close();

    // Dark mode renders without errors too.
    const dark = await browser.newContext({ colorScheme: "dark", serviceWorkers: "block" });
    const dp = await dark.newPage();
    watch(dp, "dark");
    await step("dark mode loads", () => dp.goto(`${base}/explore/`));
    await dark.close();
  } finally {
    await browser.close();
    server.close();
  }
  expectNone(failures, "app flows that failed in the browser");
  expectNone(hidden, "Explore search results the visitor cannot see without another click", "warn");
  expectNone([...new Set(errors)], "errors in the browser console (CSP violations, script errors, missing files)");
}

// ---------------------------------------------------------------------------------------

function finish() {
  const fails = findings.filter((f) => f.level === "fail").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  if (asJSON) {
    console.log(JSON.stringify({ seed: SEED, fails, warns, findings }, null, 2));
  } else {
    const ran = only.length ? only.join(", ") : `build, data, text, docs, engine, security, seo, pwa${wantBrowser ? ", browser" : ""}`;
    console.log(`Trip Finder QC (${ran})\n`);
    if (!findings.length) console.log("No problems found.");
    for (const f of findings) {
      console.log(`${f.level === "fail" ? "FAIL" : "WARN"} [${f.section}] ${f.title}${f.count > 1 ? ` (${f.count})` : ""}`);
      for (const e of f.examples) console.log(`     - ${e}`);
      if (f.count > f.examples.length) console.log(`     … and ${f.count - f.examples.length} more`);
    }
    console.log(`\n${fails} failed, ${warns} warnings.`);
  }
  process.exitCode = fails ? 1 : 0;
}
