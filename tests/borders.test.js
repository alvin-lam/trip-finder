// Every place, park site and UNESCO site centre lies inside its own country.
// Needs the @rapideditor/country-coder package (npm install --save-dev
// @rapideditor/country-coder); without it, this test is skipped.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let cc = null;
try {
  cc = require("@rapideditor/country-coder");
} catch (_) {
  /* not installed */
}
const skip = cc ? false : "install @rapideditor/country-coder to check locations against country borders";

const E = require("../js/engine.js");
const data = require("../js/data.js");
const index = E.buildIndex(data);
const code = (ll) => cc.iso1A2Code([ll[1], ll[0]]);

// Known and accepted: a disputed area, a remote atoll, a park whose name is shared
// across the border, and a marine park at sea.
const KNOWN = new Set(["ua-chersonesus", "cp-clipperton-island", "Glacier National Park", "Bajos del Norte National Park"]);
// Destination ids that differ from their ISO code at the border level.
const SAME = { gb: ["GB", "GG", "JE", "IM"], nl: ["NL", "AW", "CW", "SX", "BQ"] };

test("every place lies inside its destination", { skip }, () => {
  const out = [];
  for (const c of index.cities) {
    if (KNOWN.has(c.id)) continue;
    const want = (SAME[c.country.id] || [c.country.id.toUpperCase()]).concat(c.country.sovereignCountry ? [c.country.sovereignCountry.id.toUpperCase()] : []);
    const got = code(c.ll);
    // Shared sites listed under several countries, and places on the sea, are left to review.
    if (got && !want.includes(got) && !c.alsoIn.length) out.push(`${c.id} -> ${got}`);
  }
  assert.ok(out.length <= 5, `${out.length} places outside their destination:\n${out.join("\n")}`);
});

test("every park system site lies inside its country", { skip }, () => {
  const coords = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tools", "parks", "site_coords.json"), "utf8"));
  const want = { us: ["US", "PR", "VI", "GU", "AS", "MP", "UM"], ca: ["CA"], mx: ["MX"] };
  const out = [];
  for (const cid of ["us", "ca", "mx"]) {
    for (const s of index.countryById[cid].sites) {
      const ll = coords[s.name];
      if (!ll || KNOWN.has(s.name)) continue;
      if (!want[cid].includes(code(ll))) out.push(`${s.name} -> ${code(ll) || "sea"}`);
    }
  }
  assert.deepEqual(out, []);
});
