# Where to Travel

An interactive trip finder that helps visitors decide which region, country and cities to visit.

## Features

- **Five-step quiz.** Interests (like or must-have), travel month, trip length, daily budget, ideal weather, travel companions, crowd preference, home region and excluded regions.
- **Ranked results.** The app ranks 13 world regions and 221 destinations: every sovereign country (187 countries plus 10 microstates such as Monaco and Singapore, 197 in all), 20 territories (such as Puerto Rico and French Polynesia) and 4 visitable micronations (such as Užupis). Together they cover 1,332 cities and places, with at least two per country except single-site Vatican City. Each match comes with plain-language reasons and warnings, such as "July is off season" or "Pricier than your budget".
- **UNESCO World Heritage labels.** 125 places that are, or contain, a World Heritage Site carry a UNESCO tag, with the site name in the details view. Country cards count their heritage places, culture lovers see it as a match reason, and Explore can filter to UNESCO sites only.
- **Family friendly labels.** 91 places that work especially well with children carry a FAMILY tag and a specific reason (for example, "Friendly deer to feed in Nara Park"). When the visitor travels as a family, these places get a small boost and a "Family friendly" match reason.
- **National park labels.** 125 places that hold or sit beside a national park carry a NATIONAL PARK tag, with the park names in its tooltip and in the place details. Parks come from the US and Canadian park systems, from place names and UNESCO sites, and from a checked list (`SITE_PLACES` and `NP_EXTRA` in `js/data.js`) for gateways such as Fort Collins for Rocky Mountain. Explore's Show only menu can filter to national parks.
- **LGBTQ+ labels.** Every destination is marked LGBTQ+ welcoming, mixed or caution, with a one-line summary of the law and links to ILGA World and Equaldex. Welcoming means marriage equality and broad protections. Mixed means legal but with limited recognition. Caution means same-sex relations are criminalised or LGBTQ+ expression is legally restricted. Laws change, so review the `LGBTQ` map in `js/data.js` regularly.
- **Travel advisories.** Countries where many governments advise against all travel (for example, Syria or Ukraine) are marked "Do not travel" and hidden from recommendations by default; a notice in the results lets visitors show them, ranked lower. Countries under "reconsider travel" advice show a warning and rank a little lower. Explore can filter to places with no advisory. Advisories change quickly, so review the `ADVISORY` map in `js/data.js` often.
- **Costs in US dollars.** Daily spending figures (for example, ~US$70–120/day per person) and the quiz's budget options are always in US dollars so places can be compared. Each card also names the local currency.
- **Country facts.** Every destination except the micronations lists its capital and famous national parks and trails. Places that are the capital carry a CAPITAL tag, and Explore search covers these facts.
- **Search.** Explore search covers places, states and provinces, capitals, and parks and trails. When a search matches a capital, park or trail, the result shows the match with the search text highlighted, linked to the matching place when there is one.
- **Every metro area in North America.** All 387 US metropolitan statistical areas (Census Bureau, July 2025 estimates), Puerto Rico's 6, Canada's 41 census metropolitan areas (2021 census) and Mexico's 74 metropolitan areas (2020 census) are each covered by a place. Place details show the metro's rank and population, and Explore search finds places by metro name. Smaller metros take their monthly temperatures from a nearby place with a similar climate. Mexico's places are grouped by state in Explore, like the US and Canada. Puerto Rico's places are grouped by informal region: San Juan Metro Area, East, North, West (Porta del Sol), South, and Vieques & Culebra. The rankings live in `US_METROS`, `PR_METROS`, `CA_METROS` and `MX_METROS` in `js/data.js`.
- **National park systems.** Explore search covers all 490 current units of the US National Park System and 222 Parks Canada sites (national parks, park reserves, marine conservation areas, Rouge National Urban Park and the national historic sites Parks Canada administers). Each match shows its designation and state or province and links to a matching place when there is one. A search for a designation, such as "national monument" or "parks canada", lists every matching site.
- **Data sources.** The park systems were imported from Wikipedia's lists in November 2026 (see the comments on `PARK_SYSTEMS` in `js/data.js`). Re-import them periodically, since new sites are designated each year.
- **US states and Canadian provinces.** The US has a place in all 50 states plus D.C., and Canada in all 10 provinces and 3 territories. Each of these places shows its state or province and uses its own monthly temperatures. Explore groups both countries by state or province.
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
