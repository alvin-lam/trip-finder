# Where to Travel

An interactive trip finder that helps visitors decide which region, country and cities to visit.

## Features

- **Five-step quiz.** Interests (like or must-have), travel month, trip length, daily budget, ideal weather, travel companions, crowd preference, home region and excluded regions.
- **Ranked results.** The app ranks 13 world regions and 221 destinations: every sovereign country (187 countries plus 10 microstates such as Monaco and Singapore, 197 in all), 20 territories (such as Puerto Rico and French Polynesia) and 4 visitable micronations (such as Užupis). Together they cover 1,392 cities and places, with at least two per country except single-site Vatican City. Each match comes with plain-language reasons and warnings, such as "July is off season" or "Pricier than your budget".
- **Country facts.** Every destination except the micronations lists its capital and famous national parks and trails. Places that are the capital carry a CAPITAL tag, and Explore search covers these facts.
- **US states and Canadian provinces.** The US has a place in all 50 states plus D.C., and Canada in all 10 provinces and 3 territories. Each of these places shows its state or province and uses its own monthly temperatures. Places in the US, Puerto Rico, Canada and Mexico take their average daily highs from the climate table in their Wikipedia article (mostly 1991–2020 normals), or from the nearest town with one. Explore groups both countries by state or province. The United Kingdom's places are grouped by its four countries: England, Scotland, Wales and Northern Ireland.
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

To add a destination, append a city to a country's `cities` array in `js/data.js`. The comment at the top of that file explains the format. A place can also take a sixth element, `{ area, temps }`, giving its state or province and its own monthly highs. Capitals and parks live in the `FACTS` map. Microstates, territories and micronations also take `kind`, `status` (shown to visitors), an optional `of` (a related country id used for pairing) and an optional `maxDays`. To label a place as UNESCO World Heritage, add its id and site name to the `UNESCO` map in the same file; the app refuses to load if an id does not match a place.

Temperatures, costs and seasons are rough planning guides, not authoritative travel advice.
