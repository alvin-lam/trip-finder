#!/usr/bin/env node
/*
 * Builds the static pages that give Explore and every place its own web address:
 *   explore/index.html          /explore/
 *   place/<id>/index.html       /place/<id>/ (one per place)
 *   sitemap.xml                 every address above, plus the home page
 *
 * Each page is a copy of index.html with its own title, description, canonical
 * address, link-preview tags, structured data and a no-JavaScript summary. The app
 * reads the address and opens Explore or the place.
 *
 *   node tools/build-pages.js           write the pages
 *   node tools/build-pages.js --check   exit 1 if any page is missing or out of date
 *
 * Run it after changing docs/js/data.js or index.html (npm run build:pages).
 */
const fs = require("node:fs");
const path = require("node:path");

// The published site lives in docs/.
const ROOT = path.join(__dirname, "..", "docs");
const data = require(path.join(ROOT, "js/data.js"));
const E = require(path.join(ROOT, "js/engine.js"));

const SITE = `https://${fs.readFileSync(path.join(ROOT, "CNAME"), "utf8").trim()}/`;
const TEMPLATE = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const index = E.buildIndex(data);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const COST = { 1: "under US$70 a day", 2: "about US$70 to 120 a day", 3: "about US$120 to 180 a day", 4: "about US$180 to 280 a day", 5: "over US$280 a day" };
const fmt = (n) => n.toLocaleString("en-US");

// Swap one tag or block in the template, failing loudly if index.html changes shape.
function swap(html, re, value) {
  if (!re.test(html)) throw new Error(`build-pages: index.html no longer matches ${re}`);
  return html.replace(re, value);
}

const TAB_TITLE = "Trip Finder | All Trips Considered";

function page({ depth, url, title, description, jsonld, noscript }) {
  let html = TEMPLATE;
  // Relative files (css/, js/, img/, the manifest) are one or two folders up.
  const up = "../".repeat(depth);
  html = html.replace(/(href|src)="(?!https?:|#|\/|data:)([^"]+)"/g, (_, attr, p) => `${attr}="${up}${p}"`);
  // Every page keeps the same browser tab title; link previews use the page's own title.
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(TAB_TITLE)}</title>`);
  html = swap(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`);
  html = swap(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
  html = swap(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = swap(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(description)}" />`);
  html = swap(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  html = swap(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  html = swap(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(description)}" />`);
  html = swap(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2).replace(/</g, "\\u003c")}\n  </script>`
  );
  html = swap(html, /<noscript>[\s\S]*?<\/noscript>/, `<noscript>\n${noscript}\n    </noscript>`);
  return html;
}

const crumbs = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});

function explorePage() {
  const n = index.cities.length;
  const description = `Browse ${fmt(n)} places in ${index.countries.length} countries and territories. Filter by region, month, interest, cost, festivals, Pride events, Christmas markets, national parks, historic sites and World Heritage.`;
  const regions = index.regions
    .map((r) => `        <li>${esc(r.name)}: ${r.countries.length} destinations</li>`)
    .join("\n");
  return page({
    depth: 1,
    url: `${SITE}explore/`,
    title: "Explore destinations | Trip Finder | All Trips Considered",
    description,
    jsonld: {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "CollectionPage", "@id": `${SITE}explore/#page`, url: `${SITE}explore/`, name: "Explore destinations", description, isPartOf: { "@id": `${SITE}#website` } },
        crumbs([["Trip Finder", SITE], ["Explore", `${SITE}explore/`]]),
      ],
    },
    noscript: `      <h1>Explore destinations</h1>
      <p>${esc(description)}</p>
      <ul>
${regions}
      </ul>
      <p>Trip Finder needs JavaScript. Please turn it on to browse and filter places.</p>`,
  });
}

function placePage(city) {
  const c = city.country;
  const label = city.name === c.name ? city.name : `${city.name}, ${c.name}`;
  const url = `${SITE}place/${city.id}/`;
  const temps = city.temps || c.temps;
  const best = E.formatMonths(city.best);
  // Name the best-known nearby attraction when it still fits a search result (160 characters).
  const near1 = city.nationalParks[0] || city.unesco || city.historicSites[0];
  const plain = `${city.blurb} Best time to visit: ${best}.`;
  const withSight = near1 && `${city.blurb} Near ${near1}. Best time to visit: ${best}.`;
  const description = withSight && withSight.length <= 160 ? withSight : plain;
  const where = [city.area, city.name === c.name ? "" : c.name, city.region.name].filter(Boolean).join(" · ");
  const facts = [
    `<li>Where: ${esc(where)}</li>`,
    `<li>Best time to visit: ${esc(best)}</li>`,
    `<li>Typical daily highs: ${Math.min(...temps)} to ${Math.max(...temps)} °C through the year</li>`,
    `<li>Daily cost: ${COST[c.cost]}</li>`,
    city.unesco ? `<li>World Heritage: ${esc(city.unesco)}</li>` : "",
    city.nationalParks.length ? `<li>National parks: ${esc(city.nationalParks.join(", "))}</li>` : "",
    city.historicSites.length ? `<li>Historic sites: ${esc(city.historicSites.join(", "))}</li>` : "",
    city.geopark ? `<li>UNESCO Global Geopark: ${esc(city.geopark)}</li>` : "",
    city.biosphere ? `<li>UNESCO Biosphere Reserve: ${esc(city.biosphere)}</li>` : "",
    ...city.festivals.map((f) => `<li>${f.pride ? "Pride" : f.market ? "Christmas market" : "Festival"}: ${esc(f.name)} (${f.months.map((m) => E.MONTHS[m - 1]).join(", ")}). ${esc(f.note)}</li>`),
  ].filter(Boolean);
  const near = E.nearestPlaces(city, index.cities)
    .slice(0, 5)
    .map(({ city: x }) => `<a href="/place/${x.id}/">${esc(x.name)}</a>`)
    .join(", ");
  const dest = {
    "@type": "TouristDestination",
    "@id": `${url}#place`,
    name: city.name,
    url,
    description: city.blurb,
    containedInPlace: { "@type": c.kind === "territory" ? "AdministrativeArea" : "Country", name: c.name },
  };
  if (city.area) dest.address = { "@type": "PostalAddress", addressRegion: city.area, addressCountry: c.name };
  const sights = [
    ...city.nationalParks.map((n) => ["Park", n]),
    ...(city.unesco ? [["LandmarksOrHistoricalBuildings", city.unesco]] : []),
    ...city.historicSites.map((n) => ["LandmarksOrHistoricalBuildings", n]),
  ];
  if (sights.length) dest.includesAttraction = sights.map(([t, n]) => ({ "@type": ["TouristAttraction", t], name: n }));
  if (city.ll) dest.geo = { "@type": "GeoCoordinates", latitude: city.ll[0], longitude: city.ll[1] };
  return page({
    depth: 2,
    url,
    title: `${label}: when to go and what to see | Trip Finder`,
    description,
    jsonld: {
      "@context": "https://schema.org",
      "@graph": [dest, crumbs([["Trip Finder", SITE], ["Explore", `${SITE}explore/`], [city.name, url]])],
    },
    noscript: `      <h1>${esc(label)}</h1>
      <p>${esc(city.blurb)} ${esc(c.blurb)}</p>
      <ul>
        ${facts.join("\n        ")}
      </ul>
      ${near ? `<p>Nearby: ${near}</p>` : ""}
      <p><a href="/explore/">Explore more destinations</a>. Trip Finder needs JavaScript to show weather charts, maps and matches.</p>`,
  });
}

function sitemap() {
  const urls = [SITE, `${SITE}explore/`, `${SITE}privacy.html`, ...index.cities.map((x) => `${SITE}place/${x.id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}

/** Every generated file, as { "relative/path": contents }. */
function build() {
  const files = { "explore/index.html": explorePage(), "sitemap.xml": sitemap() };
  for (const city of index.cities) files[`place/${city.id}/index.html`] = placePage(city);
  return files;
}

module.exports = { build, SITE };

if (require.main === module) {
  const check = process.argv.includes("--check");
  const files = build();
  const placeDir = path.join(ROOT, "place");
  const want = new Set(index.cities.map((x) => x.id));
  const stale = fs.existsSync(placeDir) ? fs.readdirSync(placeDir).filter((d) => !want.has(d)) : [];
  const changed = Object.entries(files).filter(([p, body]) => {
    const f = path.join(ROOT, p);
    return !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== body;
  });
  if (check) {
    if (changed.length || stale.length) {
      console.error(`${changed.length} pages out of date and ${stale.length} stale. Run: npm run build:pages`);
      process.exit(1);
    }
    console.log(`All ${Object.keys(files).length} pages are up to date.`);
  } else {
    for (const d of stale) fs.rmSync(path.join(placeDir, d), { recursive: true });
    for (const [p, body] of changed) {
      fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, p), body);
    }
    console.log(`Wrote ${changed.length} of ${Object.keys(files).length} pages; removed ${stale.length} stale.`);
  }
}
