# Where to Travel

An interactive trip finder that helps visitors decide which region, country and cities to visit.

## Features

- **Five-step quiz.** Interests (like or must-have), travel month, trip length, daily budget, ideal weather, travel companions, crowd preference, home region and excluded regions.
- **Ranked results.** The app ranks 13 world regions and 249 destinations: every sovereign country (187 countries plus 10 microstates such as Monaco and Singapore, 197 in all) and 52 territories. The territories cover every inhabited overseas territory of the United States, United Kingdom, France, the Netherlands, Denmark, Norway, New Zealand, Australia and China, plus the British Crown Dependencies (Jersey, Guernsey and the Isle of Man) and remote uninhabited islands such as Bouvet Island and Heard Island. Each territory stays in its region, and choosing Territories in the Type filter groups them under the country they belong to. Four visitable micronations, such as Užupis, appear as places in their host countries with a MICRONATION tag. Choosing Micronations in the Type filter lists just them under their host countries. The small microstates name their best day-trip base and link from their neighbour. Together they cover 2,440 cities and places, including a place for every UNESCO World Heritage Site. A site shared by several countries keeps one place, which Explore also lists under the other countries (the `LINKED` map in `js/data.js`), with at least two per country except single-site Vatican City. Each match comes with plain-language reasons and warnings, such as "July is off season" or "Pricier than your budget".
- **Shortlist export.** The Shortlist can be saved as a CSV, JSON or plain-text file. Each file lists the saved places with their best time, typical high and low, daily cost and strengths, followed by any saved countries.
- **Country facts.** Every destination lists its capital and famous national parks and trails. Places that are the capital carry a CAPITAL tag, and Explore search covers these facts.
- **US states and Canadian provinces.** The US has a place in all 50 states plus D.C., and Canada in all 10 provinces and 3 territories. Each of these places shows its state or province and uses its own monthly temperatures. Places in the US, Puerto Rico, Canada and Mexico take their average daily highs from the climate table in their Wikipedia article (mostly 1991–2020 normals), or from the nearest town with one. Explore groups both countries by state or province. The United Kingdom's places are grouped by its four countries: England, Scotland, Wales and Northern Ireland. Explore also groups places by subdivision in Germany and Switzerland (states and cantons), France, Italy and Iceland (regions), Spain (autonomous communities), the Netherlands, China, South Korea and South Africa (provinces), Japan (prefectures), Hong Kong (Hong Kong Island, Kowloon and the New Territories), India (states and union territories), Brazil (states), Thailand (provinces), Taiwan (counties and cities), Singapore (planning regions), Macau (Macau Peninsula, Taipa, Cotai and Coloane), Russia (federal districts), Iran and Argentina (provinces), Turkey (its seven geographic regions), Australia (states and territories), Greece, Portugal, Peru and Czechia (regions), Poland (voivodeships), Sweden (counties), Belgium (Flanders, Wallonia and Brussels), Indonesia, Bulgaria and Sri Lanka (provinces), Morocco, Ethiopia, Denmark and Finland (regions), Vietnam (North, Central and South), the Philippines (Luzon, Visayas and Mindanao), Kenya (counties), Colombia (departments) and Austria (states). A country is grouped only when it has more than five places in the results; smaller lists show the subdivision in each row.
- **Stay limits.** Tiny places get a capped stay, such as one day for Vatican City, and the app suggests where to spend the rest of the trip.
- **Suggested route.** Each country card splits your trip days across its best stops. For trips of three weeks or more, it also suggests a neighbouring country to pair with.
- **Place details.** A details view for each city shows interest ratings, a 12-month temperature chart with the best months marked, typical cost, currency and language.
- **Explore mode.** Browse every destination with search and filters for region, month, interest and cost.
- **Shortlist.** Save cities and countries, then compare them side by side. The shortlist is stored in the browser.
- **Shareable links.** Your answers are encoded in the URL, so a link reproduces the same results.
- Light and dark themes, mobile layout and keyboard support.

## Install and offline use

The app is a Progressive Web App. `manifest.webmanifest` and the icons in `img/` make it installable, and `sw.js` caches the app so it works offline after the first visit.

`js/install.js` prompts visitors to add it to their home screen:

- **Chrome, Edge and Android:** an Install button opens the browser's own install dialog.
- **iPhone and iPad:** browsers there have no install API, so the prompt shows the steps (tap Share, then Add to Home Screen).

The prompt appears only after the visitor sees results or spends 25 seconds on the page. It never appears once the app is installed or inside an embedded frame, and it stays hidden for 30 days after being dismissed.

**When you ship changes,** bump `CACHE` in `sw.js` (for example `wtt-v2`) and add any new files to its `SHELL` list, so returning visitors get the new version. Service workers need HTTPS (GitHub Pages provides it) and do not run from a local `file://` page.

## Run it

No build step or dependencies are needed. Open `index.html` in a browser, or serve the folder:

```bash
npm start
```

Then visit http://localhost:8080.

## Test

```bash
npm test
```

## How scoring works

`js/engine.js` scores every city from 0 to 100 using a weighted blend of six factors:

| Factor | Weight | Notes |
| --- | --- | --- |
| Interest fit | 40% | Uses your liked and must-have interests, nudged by who you travel with |
| Season | 15% | Best months score highest. Flexible dates reduce this weight. |
| Budget | 15% | Penalises countries above your daily budget |
| Distance | 15% | Only applies when you give a home region and a distance preference |
| Climate | 12% | Average daily high in your month against your preferred range |
| Crowds | 8% | Iconic versus off the beaten path |

Unused factors drop out and the remaining weights are rescaled. A country's score is the average of its best cities for your trip length. A region's score is the average of its top two countries.

## Project layout

```
index.html        App shell
css/styles.css    Styles and theme tokens
js/data.js        Regions, countries and cities dataset
js/engine.js      Scoring and itinerary logic (no DOM, unit tested)
js/app.js         UI rendering and interactions
tests/            Node test suite for the engine
```

To add a destination, append a city to a country's `cities` array in `js/data.js`. The comment at the top of that file explains the format. A place can also take a sixth element, `{ area, temps }`, giving its state or province and its own monthly highs. Capitals and parks live in the `FACTS` map. Typical lows come from the `RANGES` map, which holds each place's average daily temperature range by month from NASA POWER climate averages (MERRA-2 reanalysis). A low is that month's high minus the range. For territories added in November 2026, ranges from ocean-dominated grid cells are raised to a floor of 6 °C within 30° of the equator and 5 °C elsewhere. Microstates and territories also take `kind`, `status` (shown to visitors), an optional `of` (a related country id used for pairing and the "Nearby microstates" line) and an optional `maxDays`. Territories name their country in `sovereign`, and day-trip microstates name their base in `visitFrom`. Micronations are ordinary places listed in the `MICRONATIONS` map. National parks reach places through park system sites, the `SITE_PLACES` map (which also tags a gateway place within about 1.5 hours when a park has no place of its own) and the `NP_EXTRA` map. `NP_EXTRA` also tags Hong Kong and Macau country parks, Taiwan's National Scenic Areas and Mexico's biosphere reserves as national parks. To label a place as UNESCO World Heritage, add its id and site name to the `UNESCO` map in the same file; the app refuses to load if an id does not match a place.

Temperatures, costs and seasons are rough planning guides, not authoritative travel advice.

## Roadmap

Planned work that is not in the app yet.

- **UNESCO Global Geoparks.** Add the 241 UNESCO Global Geoparks (51 countries, as of April 2026) as their own GEOPARK tag. The tag stays separate from UNESCO World Heritage because geoparks are a UNESCO programme rather than a treaty listing. Hong Kong's Sai Kung would be one example. The work would add a `GEOPARKS` map in `js/data.js`, a pill and details line in the app, a "Geoparks" option in Show only, and search support. Until then, a geopark may appear only as text in a country's parks and trails facts, as Hong Kong's does.
- **UNESCO Biosphere Reserves.** Add the 797 UNESCO Biosphere Reserves (145 countries, as of June 2026) as their own BIOSPHERE tag. They come from UNESCO's Man and the Biosphere programme, which recognises areas that balance conservation with local livelihoods and research. The tag stays separate from World Heritage and Geoparks. The work would add a `BIOSPHERES` map in `js/data.js`, a pill and details line in the app, a "Biosphere Reserves" option in Show only, and search support. Many reserves are large regions rather than single sites, so each would attach to the places that lie inside it, with shared reserves listed under each country.
