# Trip Finder data

Everything the app knows lives in these JSON files. `npm run build` combines them into
`docs/js/data.js` (the file the browser loads) and regenerates the place pages. Never edit
`docs/js/data.js` by hand: `node tools/build-data.js --check` reports when it does not match these files.

Figures are rough planning guides, not authoritative travel advice.

## Layout

| Path | What it holds |
| --- | --- |
| `core/interests.json` | The eight interests (beaches, culture, food and so on) with labels and icons. |
| `core/regions.json` | The 13 world regions with icons and blurbs. |
| `core/homes.json` | Home regions offered in the quiz, for the distance factor. |
| `countries/order.json` | The order destinations are listed in. |
| `countries/<id>.json` | One destination (country, microstate or territory) and its places. |
| `places/coords.json` | Each place's coordinates: `{ placeId: [lat, lon] }`. |
| `places/ranges.json` | Each place's average daily temperature range by month (NASA POWER), used for typical lows. |
| `places/areas.json` | Each place's state, province or region, for countries that keep it here. |
| `places/area-terms.json` | What a country calls its subdivisions ("states", "prefectures"). |
| `places/country-aliases.json` | Other names visitors search for ("usa", "holland"). |
| `places/remote.json` | Places with no permanent residents: `uninhabited`, `no-residents` or `expedition`. |
| `places/micronations.json` | Self-declared micronations shown as places in their host countries. |
| `places/linked.json` | Shared World Heritage sites also listed under other countries. |
| `facts/capitals-and-parks.json` | Each destination's capital and famous parks and trails. |
| `facts/lgbtq.json` | LGBTQ+ climate per destination: `welcoming`, `mixed` or `caution`, with a note. |
| `facts/advisory.json` | Travel advisories: `reconsider` or `avoid`, with a note. |
| `facts/family.json` | Family-friendly places, with what makes them so. |
| `unesco/world-heritage.json` | World Heritage site name per place. |
| `unesco/geoparks.json`, `unesco/biosphere-reserves.json` | UNESCO Global Geoparks and Biosphere Reserves near each place (written by `tools/unesco/link.js`). |
| `festivals.json` | Festivals, holidays, Pride events and Christmas markets per place. |
| `parks/systems/<id>.json` | The US National Park System, Parks Canada and Mexico's CONANP protected areas. |
| `parks/site-places.json` | Park sites linked to places by hand, such as a gateway town. |
| `parks/site-places-generated.json` | Park and historic sites linked to the nearest place within about 1.5 hours (written by `tools/parks/link_sites.js`). |
| `parks/np-extra.json` | Extra national park names per place (country parks, scenic areas, biosphere reserves). |
| `parks/historic-extra.json` | Historic sites whose gateway place is in a territory (written by `link_sites.js`). |
| `parks/nearest-place.json` | The nearest place to each site with none within reach, for the "No place nearby" card (written by `link_sites.js`). |
| `metros/<id>.json` | Metro areas by population rank for the US, Puerto Rico, Canada and Mexico. |

## Places

Each destination file has a `cities` list. A place is one line:

```
[name, tags, popularity, blurb, best months?, { area?, temps? }?]
```

- **tags:** eight digits from 0 to 5, in this order: beach, culture, food, nature, nightlife, adventure, shopping, relax.
- **popularity:** 1 (hidden gem) to 5 (iconic and busy).
- **best months:** months 1 to 12 that override the destination's own best months, or `null`.
- **area:** the state, province or region (some countries keep this in `places/areas.json` instead).
- **temps:** average daily highs in °C, January to December. Places in the US, Puerto Rico, Canada and Mexico take them from the climate tables in their Wikipedia articles (mostly 1991–2020 normals).

A place's id is `<destination id>-<name in lower case>`, with accents removed and anything other than letters and digits replaced by hyphens: "Reykjavík" in Iceland is `is-reykjavik`. The maps in the other files are keyed by these ids, and the app refuses to load if an id matches no place.

Destination fields: `cost` is 1 (very cheap) to 5 (very expensive); `temps` are representative highs; `best` are the best months. Microstates and territories also take `kind`, `status`, and optionally `of`, `sovereign`, `visitFrom` and `maxDays`.

## Festivals

`festivals.json` maps a place id to a list of `[name, months, note, kind?]`, where `kind` is `"pride"` for Pride events or `"market"` for Christmas markets.

## Changing the data

1. Edit the JSON file (or run the tool that writes it).
2. Run `npm run build`.
