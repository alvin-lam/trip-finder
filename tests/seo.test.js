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
