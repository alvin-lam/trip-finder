const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const site = `https://${read("CNAME").trim()}/`;
const html = read("index.html");
const meta = (attr, name) => (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1];

test("search engine basics point at the live domain", () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${site}" />`));
  assert.equal(meta("property", "og:url"), site);
  assert.equal(meta("property", "og:image"), `${site}img/og-image.png`);
  assert.equal(meta("name", "twitter:image"), `${site}img/og-image.png`);
  assert.equal(meta("name", "robots"), "index, follow");
  assert.match(read("robots.txt"), new RegExp(`Sitemap: ${site}sitemap.xml`));
  assert.match(read("sitemap.xml"), new RegExp(`<loc>${site}</loc>`));
});

test("descriptions fit search results and contain no em dashes", () => {
  const desc = meta("name", "description");
  assert.ok(desc.length >= 70 && desc.length <= 160, `description is ${desc.length} characters`);
  assert.equal(meta("property", "og:description"), desc);
  assert.equal(JSON.parse(read("manifest.webmanifest")).description, desc);
  assert.ok(!/—/.test(html), "index.html has no em dash");
});

test("structured data parses and the preview image is 1200x630", () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const types = ld["@graph"].map((x) => x["@type"]);
  assert.deepEqual(types, ["WebSite", "WebApplication", "Organization"]);
  const png = fs.readFileSync(path.join(root, "img/og-image.png"));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test("the not-found page is kept out of search results", () => {
  const page = read("404.html");
  assert.match(page, /<meta name="robots" content="noindex" \/>/);
  assert.match(page, /<a class="btn" href="\/">/);
  assert.ok(!/\u2014/.test(page), "404.html has no em dash");
});

test("Explore and every place have their own up-to-date page", () => {
  const { build, SITE } = require("../tools/build-pages.js");
  const files = build();
  const E = require("../js/engine.js");
  const index = E.buildIndex(require("../js/data.js"));
  for (const city of index.cities) assert.ok(files[`place/${city.id}/index.html`], city.id);
  // Pages on disk match what the data produces; run npm run build:pages after edits.
  const stale = Object.entries(files).filter(([p, body]) => !fs.existsSync(path.join(root, p)) || read(p) !== body).map(([p]) => p);
  assert.deepEqual(stale.slice(0, 5), [], `${stale.length} pages out of date`);
  const onDisk = fs.readdirSync(path.join(root, "place"));
  assert.equal(onDisk.length, index.cities.length, "no stale place folders");
  // Every page points at its own address, and the sitemap lists them all.
  const kyoto = files["place/jp-kyoto/index.html"];
  assert.match(kyoto, new RegExp(`<link rel="canonical" href="${SITE}place/jp-kyoto/" />`));
  assert.match(kyoto, /<title>Kyoto, Japan: when to go and what to see \| Trip Finder<\/title>/);
  assert.match(kyoto, /<link rel="stylesheet" href="..\/..\/css\/styles.css" \/>/);
  assert.equal(JSON.parse(kyoto.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"][0]["@type"], "TouristDestination");
  assert.match(files["explore/index.html"], new RegExp(`<link rel="canonical" href="${SITE}explore/" />`));
  const locs = files["sitemap.xml"].match(/<loc>/g).length;
  assert.equal(locs, index.cities.length + 3); // home, Explore and the privacy page, plus every place
  assert.ok(!Object.values(files).some((b) => /—/.test(b)), "no em dashes in generated pages");
});

test("place pages name nearby parks in search data", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "place", "us-big-bend-terlingua", "index.html"), "utf8");
  assert.match(html, /<meta name="description" content="[^"]*Near Big Bend National Park\./);
  const ld = JSON.parse(html.match(/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(ld["@graph"][0].includesAttraction.map((a) => a.name), ["Big Bend National Park"]);
  assert.equal(ld["@graph"][0].address.addressRegion, "Texas");
});
