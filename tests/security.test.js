// Security checks: one Content-Security-Policy everywhere, nothing in the pages that the
// policy would block, and untrusted input (shared links, saved data, URLs) checked
// against known values before use.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const E = require("../js/engine.js");
const index = E.buildIndex(require("../js/data.js"));
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const cspOf = (html) => (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/) || [])[1];

test("every page carries the same Content-Security-Policy as _headers", () => {
  const csp = cspOf(read("index.html"));
  assert.ok(csp, "index.html has a CSP meta tag");
  for (const d of ["script-src 'self'", "style-src 'self'", "object-src 'none'", "base-uri 'none'"]) assert.ok(csp.includes(d), `CSP has ${d}`);
  assert.ok(!/unsafe-inline|unsafe-eval|https?:/.test(csp), "CSP allows no inline code and no other sites");
  assert.equal(cspOf(read("404.html")), csp, "404.html");
  for (const p of ["explore/index.html", "place/jp-kyoto/index.html"]) assert.equal(cspOf(read(p)), csp, p);
  const header = read("_headers").match(/Content-Security-Policy: (.+)/)[1];
  assert.equal(header, `${csp}; frame-ancestors 'none'`, "_headers matches the meta tag, plus frame-ancestors");
});

test("pages and scripts use nothing the policy blocks", () => {
  for (const f of ["index.html", "404.html"]) {
    const html = read(f);
    assert.ok(!/<style/i.test(html), `${f} has no inline <style>`);
    assert.ok(!/\son[a-z]+="/i.test(html), `${f} has no inline event handlers`);
    const scripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || [];
    assert.ok(scripts.every((s) => s.includes('type="application/ld+json"')), `${f} has no inline scripts except structured data`);
    const loads = html.match(/<script[^>]+src="[^"]+"|<link[^>]+rel="(stylesheet|preload|preconnect|modulepreload)"[^>]*>/g) || [];
    assert.ok(loads.every((l) => !/(src|href)="https?:/.test(l)), `${f} loads no files from other sites`);
  }
  for (const f of ["js/app.js", "js/install.js"]) {
    const js = read(f);
    assert.ok(!/<[a-z][^>]*\sstyle="/.test(js), `${f} renders no style attributes (use a class or data-css)`);
    assert.ok(!/\beval\(|new Function\(/.test(js), `${f} uses no eval`);
  }
});

test("saved or shared quiz answers keep only known values", () => {
  const junk = {
    interests: { beach: 2, culture: 5, food: "<b>", nope: 1 },
    month: "<img src=x onerror=alert(1)>",
    length: "forever",
    budget: 9,
    climate: "<script>",
    company: "crowd",
    vibe: 1,
    home: '"><svg onload=alert(1)>',
    distance: {},
    exclude: ["europe", "bad id", 3, "europe"],
    extra: "dropped",
  };
  assert.deepEqual(E.normalizePrefs(junk), { ...E.DEFAULT_PREFS, interests: { beach: 2 }, exclude: ["europe"] });
  assert.deepEqual(E.normalizePrefs(null), E.DEFAULT_PREFS);
  assert.deepEqual(E.normalizePrefs("text"), E.DEFAULT_PREFS);
  // Real answers survive unchanged.
  const real = { ...E.DEFAULT_PREFS, interests: { food: 1, culture: 2 }, month: 7, length: "two", budget: 3, climate: "warm", company: "family", vibe: "hidden", home: index.homes[0].id, distance: "near", exclude: [index.regions[0].id] };
  assert.deepEqual(E.normalizePrefs(real), real);
  assert.deepEqual(E.decodePrefs(E.encodePrefs(real, index), index), real);
});

test("shared links that are not quiz codes are ignored", () => {
  for (const code of ["", "r-", "r-<script>", "explore", "r-011000000012010000000x", "r-0110000000120100000<b>"]) assert.equal(E.decodePrefs(code, index), null, code);
});

test("ids from a URL or saved data match only real places", () => {
  for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(index.cityById[id], undefined, `cityById.${id}`);
    assert.equal(index.countryById[id], undefined, `countryById.${id}`);
  }
  assert.ok(index.cityById["jp-kyoto"]);
  assert.ok(index.countryById.jp);
});
