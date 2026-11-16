# Where to Travel

An interactive trip finder that helps visitors decide which region, country and cities to visit.

## Features

- **Five-step quiz.** Interests (like or must-have), travel month, trip length, daily budget, ideal weather, travel companions, crowd preference, home region and excluded regions.
- **Ranked results.** The app ranks 12 world regions and 83 destinations: 49 countries, 10 microstates (such as Monaco and Singapore), 20 territories (such as Puerto Rico and French Polynesia) and 4 visitable micronations (such as Užupis). Together they cover 238 cities and places. Each match comes with plain-language reasons and warnings, such as "July is off season" or "Pricier than your budget".
- **UNESCO World Heritage labels.** 125 places that are, or contain, a World Heritage Site carry a UNESCO tag, with the site name in the details view. Country cards count their heritage places, culture lovers see it as a match reason, and Explore can filter to UNESCO sites only.
- **Family friendly labels.** 91 places that work especially well with children carry a FAMILY tag and a specific reason (for example, "Friendly deer to feed in Nara Park"). When the visitor travels as a family, these places get a small boost and a "Family friendly" match reason.
- **LGBTQ+ labels.** Every destination is marked LGBTQ+ welcoming, mixed or caution, with a one-line summary of the law and links to ILGA World and Equaldex. Welcoming means marriage equality and broad protections. Mixed means legal but with limited recognition. Caution means same-sex relations are criminalised or LGBTQ+ expression is legally restricted. Laws change, so review the `LGBTQ` map in `js/data.js` regularly.
- **Stay limits.** Tiny places get a capped stay, such as one day for Vatican City, and the app suggests where to spend the rest of the trip.
- **Suggested route.** Each country card splits your trip days across its best stops. For trips of three weeks or more, it also suggests a neighbouring country to pair with.
- **Place details.** A details view for each city shows interest ratings, a 12-month temperature chart with the best months marked, typical cost, currency and language.
- **Explore mode.** Browse every destination with search and filters for region, month, interest and cost.
- **Shortlist.** Save cities and countries, then compare them side by side. The shortlist is stored in the browser.
- **Shareable links.** Your answers are encoded in the URL, so a link reproduces the same results.
- Light and dark themes, mobile layout and keyboard support.

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

To add a destination, append a city to a country's `cities` array in `js/data.js`. The comment at the top of that file explains the format. Microstates, territories and micronations also take `kind`, `status` (shown to visitors), an optional `of` (a related country id used for pairing) and an optional `maxDays`. To label a place as UNESCO World Heritage, add its id and site name to the `UNESCO` map in the same file; the app refuses to load if an id does not match a place.

Temperatures, costs and seasons are rough planning guides, not authoritative travel advice.
