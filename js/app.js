/* UI layer for Where to Travel. Plain JavaScript, no build step. */
(function () {
  const E = window.WTT_ENGINE;
  const index = E.buildIndex(window.WTT_DATA);
  const STORE_KEY = "wtt:v1";

  // ---------- State ----------
  const state = {
    view: "plan",
    stage: "intro", // intro | wizard | results
    step: 0,
    prefs: E.normalizePrefs({}),
    results: null,
    focusRegion: null,
    explore: { q: "", region: "", month: 0, interest: "", cost: 5 },
    saved: new Set(),
  };

  // ---------- Helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const toF = (c) => Math.round((c * 9) / 5 + 32);
  const SEG_COLORS = ["#d9572b", "#1f7a74", "#7a5ab8", "#b8862b"];
  const POP_LABELS = { 1: "Hidden gem", 2: "Lesser known", 3: "Popular", 4: "Very popular", 5: "Iconic" };
  const interestLabel = Object.fromEntries(index.interests.map((i) => [i.id, i]));

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.prefs) state.prefs = E.normalizePrefs(data.prefs);
      if (Array.isArray(data.saved)) state.saved = new Set(data.saved.filter((k) => lookupSaved(k)));
      if (data.theme) document.documentElement.dataset.theme = data.theme;
    } catch (_) {
      /* storage unavailable: start fresh */
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ prefs: state.prefs, saved: [...state.saved], theme: document.documentElement.dataset.theme || "" })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function lookupSaved(key) {
    const [kind, id] = key.split(":");
    return kind === "city" ? index.cityById[id] : kind === "country" ? index.countryById[id] : null;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  function ring(score, cls = "") {
    return `<div class="ring ${cls}" style="--v:${score}" role="img" aria-label="${score}% match"><span>${score}</span></div>`;
  }

  function monthStrip(best, sel) {
    return `<div class="months" aria-label="Best months: ${esc(E.formatMonths(best))}">${E.MONTHS.map(
      (m, i) =>
        `<span class="${best.includes(i + 1) ? "is-best" : ""} ${sel === i + 1 ? "is-sel" : ""}" title="${E.MONTHS_LONG[i]}">${m[0]}</span>`
    ).join("")}</div>`;
  }

  function heart(kind, id, label) {
    const on = state.saved.has(`${kind}:${id}`);
    return `<button class="heart" data-action="save" data-kind="${kind}" data-id="${esc(id)}" aria-pressed="${on}" aria-label="${on ? "Remove" : "Save"} ${esc(label)} ${on ? "from" : "to"} shortlist" title="${on ? "Saved" : "Save to shortlist"}">${on ? "♥" : "♡"}</button>`;
  }

  function costFact(cost) {
    return `<span class="fact" title="Typical daily spend per person"><b>${E.COST_LABELS[cost]}</b> ${E.COST_DAILY[cost]}/day</span>`;
  }

  function topStrengths(city, n = 3) {
    return E.TAG_ORDER.filter((t) => city.tags[t] >= 4)
      .sort((a, b) => city.tags[b] - city.tags[a])
      .slice(0, n)
      .map((t) => interestLabel[t].label);
  }

  // ---------- Navigation ----------
  function setView(view) {
    state.view = view;
    for (const v of ["plan", "explore", "shortlist"]) $(`#view-${v}`).hidden = v !== view;
    document.querySelectorAll(".tab").forEach((t) => {
      if (t.dataset.nav === view) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    render();
    syncHash();
  }

  function syncHash() {
    let h = state.view;
    if (state.view === "plan" && state.stage === "results") h = E.encodePrefs(state.prefs, index);
    if (location.hash.slice(1) !== h) history.replaceState(null, "", `#${h}`);
  }

  function readHash() {
    const h = location.hash.slice(1);
    const shared = h.startsWith("r-") ? E.decodePrefs(h, index) : null;
    if (shared) {
      state.prefs = shared;
      state.stage = "results";
      state.view = "plan";
      runRecommend();
    } else if (["explore", "shortlist"].includes(h)) {
      state.view = h;
    }
  }

  function render() {
    updateShortlistBadge();
    if (state.view === "plan") renderPlan();
    if (state.view === "explore") renderExplore();
    if (state.view === "shortlist") renderShortlist();
  }

  function updateShortlistBadge() {
    const b = $("#shortlist-count");
    b.textContent = state.saved.size;
    b.hidden = state.saved.size === 0;
  }

  // ---------- Plan: intro ----------
  function renderPlan() {
    const el = $("#view-plan");
    if (state.stage === "wizard") el.innerHTML = wizardHTML();
    else if (state.stage === "results") el.innerHTML = resultsHTML();
    else el.innerHTML = introHTML();
  }

  function introHTML() {
    const tiles = [
      ["🏖️", "Beaches"],
      ["🏛️", "History"],
      ["🍜", "Food"],
      ["🏔️", "Mountains"],
      ["🦁", "Safari"],
      ["🎉", "Nightlife"],
    ];
    const hasPrev = Object.keys(state.prefs.interests).length > 0;
    return `
      <div class="hero">
        <div>
          <p class="eyebrow">Trip finder</p>
          <h1>Not sure where to go next?</h1>
          <p class="hero__lead">Answer five quick questions about what you enjoy, when you can travel and what you want to spend. We will rank ${index.regions.length} world regions, ${index.countries.length} countries and ${index.cities.length} cities, then sketch a route for your trip.</p>
          <div class="row">
            <button class="btn btn--primary" data-action="start">Find my destination →</button>
            ${hasPrev ? `<button class="btn btn--ghost" data-action="show-results">See my last results</button>` : ""}
            <button class="btn btn--ghost" data-action="surprise">🎲 Surprise me</button>
          </div>
          <div class="steps-preview">
            <span><b>1.</b> Interests</span><span><b>2.</b> Timing</span><span><b>3.</b> Budget & weather</span><span><b>4.</b> Travel style</span><span><b>5.</b> Starting point</span>
          </div>
        </div>
        <div class="hero__art" aria-hidden="true">
          ${tiles.map(([i, t]) => `<div class="hero__tile"><span>${i}</span><small>${t}</small></div>`).join("")}
        </div>
      </div>`;
  }

  // ---------- Plan: wizard ----------
  const STEPS = [
    {
      title: "What do you love on a trip?",
      sub: "Tap once if you like it and twice if it is a must. Tap again to clear.",
      body: () => `
        <div class="choice-grid">
          ${index.interests
            .map((i) => {
              const lvl = state.prefs.interests[i.id] || 0;
              return `<button class="choice" data-action="interest" data-id="${i.id}" data-level="${lvl}" aria-pressed="${lvl > 0}">
                <span class="choice__icon" aria-hidden="true">${i.icon}</span>
                <span class="choice__title">${i.label}</span>
                ${lvl ? `<span class="choice__level">${lvl === 2 ? "Must" : "Like"}</span>` : ""}
              </button>`;
            })
            .join("")}
        </div>`,
    },
    {
      title: "When are you going, and for how long?",
      sub: "Season changes everything, from monsoons to midnight sun.",
      body: () => `
        <div class="field">
          <span class="field__label">Travel month</span>
          <div class="chips" role="radiogroup" aria-label="Travel month">
            ${chip("month", 0, "I'm flexible")}
            ${E.MONTHS.map((m, i) => chip("month", i + 1, m)).join("")}
          </div>
        </div>
        <div class="field">
          <span class="field__label">Trip length</span>
          <div class="choice-grid" role="radiogroup" aria-label="Trip length">
            ${Object.entries(E.LENGTHS)
              .map(([k, l]) => choice("length", k, l.label, `${l.days} days, ${l.stops} ${l.stops === 1 ? "stop" : "stops"}`))
              .join("")}
          </div>
        </div>`,
    },
    {
      title: "Budget and weather",
      sub: "Daily budget per person, covering a bed, food and local transport.",
      body: () => `
        <div class="field">
          <span class="field__label">Daily budget</span>
          <div class="choice-grid" role="radiogroup" aria-label="Daily budget">
            ${Object.entries(E.BUDGETS)
              .map(([k, b]) => choice("budget", Number(k), b.label, b.range, ["🎒", "🧳", "🛎️", "🥂"][k - 1]))
              .join("")}
          </div>
        </div>
        <div class="field">
          <span class="field__label">Ideal weather</span>
          <div class="choice-grid" role="radiogroup" aria-label="Ideal weather">
            ${choice("climate", "hot", "Hot", "28°C (82°F) and up", "🔥")}
            ${choice("climate", "warm", "Warm", "22 to 30°C (72 to 86°F)", "☀️")}
            ${choice("climate", "mild", "Mild", "14 to 24°C (57 to 75°F)", "⛅")}
            ${choice("climate", "cool", "Cool or snowy", "Below 14°C (57°F)", "❄️")}
            ${choice("climate", "any", "No preference", "Weather is not a factor", "🤷")}
          </div>
        </div>`,
    },
    {
      title: "Who's coming, and what's the vibe?",
      sub: "We tweak the weighting depending on who you travel with.",
      body: () => `
        <div class="field">
          <span class="field__label">Travelling as</span>
          <div class="choice-grid" role="radiogroup" aria-label="Travelling as">
            ${choice("company", "solo", "Solo", "Culture and adventure", "🧍")}
            ${choice("company", "couple", "Couple", "Food and downtime", "💑")}
            ${choice("company", "family", "Family", "Nature, beaches, easy days", "👨‍👩‍👧")}
            ${choice("company", "friends", "Friends", "Nightlife and action", "🍻")}
          </div>
        </div>
        <div class="field">
          <span class="field__label">Crowds</span>
          <div class="choice-grid" role="radiogroup" aria-label="Crowds">
            ${choice("vibe", "iconic", "Iconic highlights", "Bucket-list classics", "📸")}
            ${choice("vibe", "mix", "A mix", "Some of each", "⚖️")}
            ${choice("vibe", "hidden", "Off the beaten path", "Fewer tourists", "🧭")}
          </div>
        </div>`,
    },
    {
      title: "Where are you starting from?",
      sub: "Optional. Helps us weigh flight time. You can also rule out regions.",
      body: () => `
        <div class="field">
          <label class="field__label" for="home">Home region</label>
          <select class="select" id="home" data-pref="home">
            <option value="">Prefer not to say</option>
            ${index.homes.map((h) => `<option value="${h.id}" ${state.prefs.home === h.id ? "selected" : ""}>${esc(h.label)}</option>`).join("")}
          </select>
        </div>
        <div class="field" ${state.prefs.home ? "" : "hidden"}>
          <span class="field__label">How far are you willing to go?</span>
          <div class="chips" role="radiogroup" aria-label="Distance">
            ${chip("distance", "near", "Close to home")}
            ${chip("distance", "medium", "Medium haul")}
            ${chip("distance", "far", "Somewhere far")}
            ${chip("distance", "any", "Distance doesn't matter")}
          </div>
        </div>
        <div class="field">
          <span class="field__label">Rule out regions <span class="field__hint">(tap to exclude)</span></span>
          <div class="chips">
            ${index.regions
              .map((r) => {
                const on = state.prefs.exclude.includes(r.id);
                return `<button class="chip chip--exclude" data-action="exclude" data-id="${r.id}" aria-pressed="${on}">${r.icon} ${esc(r.name)}</button>`;
              })
              .join("")}
          </div>
        </div>`,
    },
  ];

  function chip(key, value, label) {
    const on = state.prefs[key] === value;
    return `<button class="chip" role="radio" aria-checked="${on}" data-action="set" data-key="${key}" data-value="${value}">${esc(label)}</button>`;
  }

  function choice(key, value, title, sub, icon) {
    const on = state.prefs[key] === value;
    return `<button class="choice" role="radio" aria-checked="${on}" data-action="set" data-key="${key}" data-value="${value}">
      ${icon ? `<span class="choice__icon" aria-hidden="true">${icon}</span>` : ""}
      <span class="choice__title">${esc(title)}</span>
      ${sub ? `<span class="choice__sub">${esc(sub)}</span>` : ""}
    </button>`;
  }

  function wizardHTML() {
    const s = STEPS[state.step];
    const last = state.step === STEPS.length - 1;
    const picked = Object.values(state.prefs.interests).filter(Boolean).length;
    return `
      <div class="wizard">
        <div class="progress" aria-hidden="true">
          ${STEPS.map((_, i) => `<div class="progress__seg ${i < state.step ? "is-done" : i === state.step ? "is-current" : ""}"></div>`).join("")}
        </div>
        <div class="wizard__head">
          <p class="eyebrow">Step ${state.step + 1} of ${STEPS.length}</p>
          <h2 id="step-title" tabindex="-1">${s.title}</h2>
          <p class="muted">${s.sub}</p>
        </div>
        ${s.body()}
        <div class="wizard__foot">
          <button class="btn btn--ghost" data-action="back">${state.step === 0 ? "Cancel" : "← Back"}</button>
          <div class="row">
            ${state.step === 0 && picked === 0 ? `<span class="muted" style="font-size:.9rem">Pick a few, or skip ahead</span>` : ""}
            ${!last && state.results ? `<button class="btn btn--ghost" data-action="show-results">Jump to results</button>` : ""}
            <button class="btn btn--primary" data-action="${last ? "show-results" : "next"}">${last ? "See my matches →" : "Next →"}</button>
          </div>
        </div>
      </div>`;
  }

  function goStep(n) {
    state.step = Math.max(0, Math.min(STEPS.length - 1, n));
    state.stage = "wizard";
    renderPlan();
    syncHash();
    const t = $("#step-title");
    if (t) t.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Plan: results ----------
  function runRecommend() {
    state.results = E.recommend(index, state.prefs);
    persist();
  }

  function summaryChips() {
    const p = state.prefs;
    const ints = E.TAG_ORDER.filter((t) => p.interests[t]).map((t) => (p.interests[t] === 2 ? `${interestLabel[t].label}!` : interestLabel[t].label));
    const home = index.homes.find((h) => h.id === p.home);
    const items = [
      [0, ints.length ? ints.join(", ") : "Any interests"],
      [1, p.month ? E.MONTHS_LONG[p.month - 1] : "Flexible dates"],
      [1, E.LENGTHS[p.length].label],
      [2, `${E.BUDGETS[p.budget].label} budget`],
      [2, p.climate === "any" ? "Any weather" : `${E.CLIMATES[p.climate].label} weather`],
      [3, { solo: "Solo", couple: "Couple", family: "Family", friends: "Friends" }[p.company]],
      [3, { mix: "Mixed crowds", iconic: "Iconic sights", hidden: "Off the beaten path" }[p.vibe]],
      [4, home ? `From ${home.label}` : "Any starting point"],
    ];
    if (p.exclude.length) items.push([4, `${p.exclude.length} region${p.exclude.length > 1 ? "s" : ""} excluded`]);
    return items.map(([step, label]) => `<button data-action="goto" data-step="${step}" title="Edit">${esc(label)} ✎</button>`).join("");
  }

  function resultsHTML() {
    if (!state.results) runRecommend();
    const r = state.results;
    if (!r.countries.length) {
      return `<div class="empty"><div class="empty__icon">🗺️</div><p>Every region is excluded. Loosen your filters to see matches.</p><button class="btn btn--primary" data-action="goto" data-step="4">Edit regions</button></div>`;
    }
    const regions = r.regions.filter((x) => x.countries.length);
    const focus = state.focusRegion && regions.find((x) => x.region.id === state.focusRegion);
    const countries = focus ? focus.countries : r.countries.slice(0, 6);
    const best = r.countries[0];
    return `
      <div class="results-head">
        <div>
          <p class="eyebrow">Your matches</p>
          <h2>Your best match is ${esc(best.country.name)} ${best.country.flag}</h2>
          <p class="muted" style="margin:0">Strongest region overall: ${esc(r.regions[0].region.name)}. Tap any place for weather, highlights and nearby stops.</p>
          <div class="summary">${summaryChips()}</div>
        </div>
        <div class="row">
          <button class="btn btn--ghost btn--sm" data-action="share">🔗 Share</button>
          <button class="btn btn--ghost btn--sm" data-action="surprise">🎲 Surprise me</button>
          <button class="btn btn--ghost btn--sm" data-action="restart">Start over</button>
        </div>
      </div>
      <div class="share-box" id="share-box" hidden>
        <label for="share-url">Link to these results</label>
        <input class="input" id="share-url" readonly onclick="this.select()" />
      </div>

      <section class="section" aria-labelledby="h-regions">
        <div class="section__head">
          <h3 id="h-regions">1. Best regions</h3>
          <span class="muted" style="font-size:.9rem">${focus ? `Showing ${esc(focus.region.name)}. <button class="btn btn--ghost btn--sm" data-action="focus-region" data-id="">Show all</button>` : "Tap a region to see all of its countries."}</span>
        </div>
        <div class="region-strip">
          ${regions
            .slice(0, 8)
            .map(
              (x, i) => `
            <button class="region-card" data-action="focus-region" data-id="${x.region.id}" aria-pressed="${state.focusRegion === x.region.id}">
              <span class="region-card__rank">${i + 1}</span>
              <span>
                <span class="region-card__name">${x.region.icon} ${esc(x.region.name)}</span><br/>
                <span class="region-card__sub">Top: ${x.countries
                  .slice(0, 2)
                  .map((c) => esc(c.country.name))
                  .join(", ")}</span>
              </span>
              ${ring(x.score)}
            </button>`
            )
            .join("")}
        </div>
      </section>

      <section class="section" aria-labelledby="h-countries">
        <div class="section__head">
          <h3 id="h-countries">2. ${focus ? `Countries in ${esc(focus.region.name)}` : "Top countries"}</h3>
          <span class="muted" style="font-size:.9rem">Suggested route for ${E.LENGTHS[state.prefs.length].days} days included</span>
        </div>
        <div class="cards">
          ${countries.map((c) => countryResultCard(c, c === best)).join("")}
        </div>
      </section>

      <section class="section" aria-labelledby="h-cities">
        <div class="section__head">
          <h3 id="h-cities">3. Top cities and places anywhere</h3>
        </div>
        <div class="top-cities">
          ${r.cities
            .slice(0, 12)
            .map(
              (c) => `
            <div class="city-card">
              ${ring(c.score)}
              <button class="city-card__main" data-action="open-city" data-id="${c.city.id}">
                <div class="city-card__name">${esc(c.city.name)}</div>
                <div class="city-card__sub">${c.city.country.flag} ${esc(c.city.country.name)} · ${esc(topStrengths(c.city, 2).join(", ") || c.city.region.name)}</div>
              </button>
              ${heart("city", c.city.id, c.city.name)}
            </div>`
            )
            .join("")}
        </div>
      </section>`;
  }

  function countryResultCard(cr, isTop) {
    const c = cr.country;
    const days = cr.itinerary.reduce((a, s) => a + s.days, 0);
    return `
      <article class="card ${isTop ? "card--top" : ""}">
        <div class="card__head">
          <span class="card__flag" aria-hidden="true">${c.flag}</span>
          <div class="card__title">
            <h3>${esc(c.name)}${isTop ? `<span class="pill">Best match</span>` : ""}</h3>
            <div class="card__meta">${esc(c.regionObj.name)}</div>
          </div>
          ${ring(cr.score, "ring--lg")}
        </div>
        <p class="card__blurb">${esc(c.blurb)}</p>
        <ul class="reasons">
          ${cr.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}
          ${cr.warnings.map((x) => `<li class="warn">${esc(x)}</li>`).join("")}
        </ul>
        ${monthStrip(c.best, state.prefs.month)}
        <div class="facts">${costFact(c.cost)}<span class="fact">💱 ${esc(c.currency)}</span><span class="fact">🗣️ ${esc(c.language)}</span></div>
        <div class="itinerary">
          <div class="itinerary__title">Suggested ${days}-day route</div>
          <div class="itinerary__bar">
            ${cr.itinerary
              .map(
                (s) =>
                  `<button class="itinerary__seg" style="flex:${s.days}" data-action="open-city" data-id="${s.city.id}" title="${esc(s.city.name)}: ${s.days} days" aria-label="${esc(s.city.name)}, ${s.days} days">${s.days}d</button>`
              )
              .join("")}
          </div>
          <ol class="itinerary__legend">
            ${cr.itinerary
              .map(
                (s, i) =>
                  `<li><i style="background:${SEG_COLORS[i]}"></i><button data-action="open-city" data-id="${s.city.id}">${esc(s.city.name)}</button><span class="muted">${s.days} days</span></li>`
              )
              .join("")}
          </ol>
          ${cr.pairWith ? `<div class="itinerary__pair">Got extra time? Pair it with ${cr.pairWith.flag} <a href="#" data-action="open-country" data-id="${cr.pairWith.id}">${esc(cr.pairWith.name)}</a>.</div>` : ""}
        </div>
        <details class="more">
          <summary>All ${cr.cities.length} places ranked</summary>
          <ul class="city-list">
            ${cr.cities
              .map(
                (s) => `
              <li class="city-row">
                <span class="score-chip">${s.score}</span>
                <button class="city-row__main" data-action="open-city" data-id="${s.city.id}">
                  <span class="city-row__name">${esc(s.city.name)}</span>
                  <span class="city-row__blurb">${esc(s.city.blurb)}</span>
                </button>
                ${heart("city", s.city.id, s.city.name)}
              </li>`
              )
              .join("")}
          </ul>
        </details>
        <div class="card__actions">
          <button class="btn btn--ghost btn--sm" data-action="save" data-kind="country" data-id="${c.id}">${state.saved.has(`country:${c.id}`) ? "♥ Saved" : "♡ Save country"}</button>
          <button class="btn btn--ghost btn--sm" data-action="open-city" data-id="${cr.cities[0].city.id}">Details</button>
        </div>
      </article>`;
  }

  // ---------- Explore ----------
  function renderExplore() {
    const el = $("#view-explore");
    // Only rebuild the filter bar if it is missing, so typing keeps focus.
    if (!$("#explore-filters", el)) {
      el.innerHTML = `
        <p class="eyebrow">Browse everything</p>
        <h2>Explore regions, countries and cities</h2>
        <p class="muted">Filter by month, interest or cost, or search for a place you have in mind.</p>
        <div class="filters" id="explore-filters">
          <label>Search<input class="input" type="search" data-filter="q" placeholder="e.g. Kyoto, safari, Portugal" value="${esc(state.explore.q)}" /></label>
          <label>Region<select class="select" data-filter="region"><option value="">All regions</option>${index.regions
            .map((r) => `<option value="${r.id}">${esc(r.name)}</option>`)
            .join("")}</select></label>
          <label>Good in<select class="select" data-filter="month"><option value="0">Any month</option>${E.MONTHS_LONG.map(
            (m, i) => `<option value="${i + 1}">${m}</option>`
          ).join("")}</select></label>
          <label>Great for<select class="select" data-filter="interest"><option value="">Anything</option>${index.interests
            .map((i) => `<option value="${i.id}">${i.icon} ${esc(i.label)}</option>`)
            .join("")}</select></label>
          <label>Max cost<select class="select" data-filter="cost">${[5, 4, 3, 2, 1]
            .map((c) => `<option value="${c}">${c === 5 ? "Any" : `Up to ${E.COST_LABELS[c]}`}</option>`)
            .join("")}</select></label>
        </div>
        <div id="explore-results"></div>`;
      el.querySelector('[data-filter="region"]').value = state.explore.region;
      el.querySelector('[data-filter="month"]').value = state.explore.month;
      el.querySelector('[data-filter="interest"]').value = state.explore.interest;
      el.querySelector('[data-filter="cost"]').value = state.explore.cost;
    }
    $("#explore-results", el).innerHTML = exploreResultsHTML();
  }

  function exploreResultsHTML() {
    const f = state.explore;
    const q = f.q.trim().toLowerCase();
    const interestQ = index.interests.find((i) => q && i.label.toLowerCase().includes(q));
    let total = 0;
    const blocks = index.regions
      .filter((r) => !f.region || r.id === f.region)
      .map((r) => {
        const countries = r.countries
          .filter((c) => c.cost <= f.cost)
          .map((c) => {
            const countryHit = !q || c.name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || c.blurb.toLowerCase().includes(q);
            const cities = c.cities.filter((city) => {
              if (f.month && !city.best.includes(f.month)) return false;
              if (f.interest && city.tags[f.interest] < 4) return false;
              if (!q || countryHit) return true;
              return (
                city.name.toLowerCase().includes(q) ||
                city.blurb.toLowerCase().includes(q) ||
                (interestQ && city.tags[interestQ.id] >= 4)
              );
            });
            return { c, cities };
          })
          .filter((x) => x.cities.length);
        total += countries.reduce((a, x) => a + x.cities.length, 0);
        return { r, countries };
      })
      .filter((b) => b.countries.length);

    if (!blocks.length)
      return `<div class="empty"><div class="empty__icon">🔍</div><p>No places match those filters.</p><button class="btn btn--ghost" data-action="clear-filters">Clear filters</button></div>`;

    return (
      `<p class="muted" style="margin-top:16px">${total} place${total === 1 ? "" : "s"} found</p>` +
      blocks
        .map(
          ({ r, countries }) => `
        <section class="region-block">
          <div class="region-block__head"><span class="region-block__icon" aria-hidden="true">${r.icon}</span><h3 style="margin:0">${esc(r.name)}</h3></div>
          <p class="muted">${esc(r.blurb)}</p>
          <div class="cards">${countries.map(({ c, cities }) => exploreCountryCard(c, cities)).join("")}</div>
        </section>`
        )
        .join("")
    );
  }

  function exploreCountryCard(c, cities) {
    return `
      <article class="card">
        <div class="card__head">
          <span class="card__flag" aria-hidden="true">${c.flag}</span>
          <div class="card__title"><h3>${esc(c.name)}</h3><div class="card__meta">Best: ${esc(E.formatMonths(c.best))}</div></div>
          ${heart("country", c.id, c.name)}
        </div>
        <p class="card__blurb">${esc(c.blurb)}</p>
        ${monthStrip(c.best, state.explore.month)}
        <div class="facts">${costFact(c.cost)}<span class="fact">💱 ${esc(c.currency)}</span></div>
        <ul class="city-list">
          ${cities
            .map(
              (city) => `
            <li class="city-row">
              <button class="city-row__main" data-action="open-city" data-id="${city.id}">
                <span class="city-row__name">${esc(city.name)}</span>
                <span class="city-row__blurb">${esc(topStrengths(city).join(" · ") || city.blurb)}</span>
              </button>
              ${heart("city", city.id, city.name)}
            </li>`
            )
            .join("")}
        </ul>
      </article>`;
  }

  // ---------- Shortlist ----------
  function renderShortlist() {
    const el = $("#view-shortlist");
    const cities = [...state.saved].filter((k) => k.startsWith("city:")).map(lookupSaved).filter(Boolean);
    const countries = [...state.saved].filter((k) => k.startsWith("country:")).map(lookupSaved).filter(Boolean);
    if (!cities.length && !countries.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty__icon">♡</div>
          <h2>Your shortlist is empty</h2>
          <p>Tap the heart on any country or city to save it here and compare side by side.</p>
          <div class="row" style="justify-content:center">
            <button class="btn btn--primary" data-nav="plan">Find matches</button>
            <button class="btn btn--ghost" data-nav="explore">Browse places</button>
          </div>
        </div>`;
      return;
    }
    const scoreOf = (city) => {
      if (!state.results) return null;
      const r = state.results.cities.find((x) => x.city === city);
      return r ? r.score : null;
    };
    const month = state.prefs.month;
    const sortedCities = [...cities].sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0));
    el.innerHTML = `
      <div class="results-head">
        <div>
          <p class="eyebrow">Shortlist</p>
          <h2>Compare your favourites</h2>
          <p class="muted">${state.results ? "Match scores reflect your latest answers." : "Answer the quiz to add match scores."}</p>
        </div>
        <button class="btn btn--ghost btn--sm" data-action="clear-saved">Clear shortlist</button>
      </div>
      ${
        sortedCities.length
          ? `<div class="compare-wrap"><table class="compare">
        <thead><tr><th>Place</th>${state.results ? "<th>Match</th>" : ""}<th>Best time</th><th>${month ? `${E.MONTHS[month - 1]} high` : "Typical high"}</th><th>Cost</th><th>Great for</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${sortedCities
          .map((city) => {
            const t = E.tempFor(city, month);
            const s = scoreOf(city);
            return `<tr>
              <td><button class="city-row__main" data-action="open-city" data-id="${city.id}"><span class="city-row__name">${esc(city.name)}</span><span class="city-row__blurb">${city.country.flag} ${esc(city.country.name)}</span></button></td>
              ${state.results ? `<td data-label="Match">${s === null ? "–" : `${s}%`}</td>` : ""}
              <td data-label="Best time">${esc(E.formatMonths(city.best))}${month ? (city.best.includes(month) ? " ✓" : "") : ""}</td>
              <td data-label="${month ? `${E.MONTHS[month - 1]} high` : "Typical high"}">${t}°C / ${toF(t)}°F</td>
              <td data-label="Cost" title="${E.COST_DAILY[city.country.cost]} per day">${E.COST_LABELS[city.country.cost]}</td>
              <td data-label="Great for">${esc(topStrengths(city).join(", ") || "All-rounder")}</td>
              <td>${heart("city", city.id, city.name)}</td>
            </tr>`;
          })
          .join("")}</tbody></table></div>`
          : ""
      }
      ${
        countries.length
          ? `<div class="section"><h3>Saved countries</h3><div class="cards">${countries.map((c) => exploreCountryCard(c, c.cities)).join("")}</div></div>`
          : ""
      }`;
  }

  // ---------- Detail dialog ----------
  function openCity(id) {
    const city = index.cityById[id];
    if (!city) return;
    const res = state.results ? state.results.cities.find((r) => r.city === city) : null;
    const month = state.prefs.month;
    const temps = city.country.temps;
    const tMin = Math.min(...temps, 0);
    const tMax = Math.max(...temps);
    const liked = (t) => (state.prefs.interests[t] || 0) > 0;
    const others = city.country.cities.filter((c) => c !== city);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${city.name}, ${city.country.name}`)}`;
    $("#detail-body").innerHTML = `
      <button class="icon-btn detail__close" data-action="close-detail" aria-label="Close">✕</button>
      <div class="detail__hero">
        <span class="card__flag" aria-hidden="true">${city.country.flag}</span>
        <div style="flex:1;min-width:0">
          <h2 id="detail-title" style="margin:0">${esc(city.name)}</h2>
          <div class="card__meta">${esc(city.country.name)} · ${esc(city.region.name)}</div>
        </div>
        ${res ? ring(res.score, "ring--lg") : ""}
      </div>
      <p style="margin:0">${esc(city.blurb)} <span class="muted">${esc(city.country.blurb)}</span></p>
      ${
        res
          ? `<ul class="reasons">${res.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}${res.warnings.map((x) => `<li class="warn">${esc(x)}</li>`).join("")}</ul>`
          : ""
      }
      <div class="facts">
        ${costFact(city.country.cost)}
        <span class="fact">👥 ${POP_LABELS[city.pop]}</span>
        <span class="fact">💱 ${esc(city.country.currency)}</span>
        <span class="fact">🗣️ ${esc(city.country.language)}</span>
      </div>
      <div>
        <h3>What it's great for</h3>
        <div class="tagbars">
          ${E.TAG_ORDER.map(
            (t) =>
              `<span>${interestLabel[t].icon} ${esc(interestLabel[t].label)}</span><div class="tagbar ${liked(t) ? "is-liked" : ""}" role="img" aria-label="${city.tags[t]} out of 5"><span style="width:${city.tags[t] * 20}%"></span></div>`
          ).join("")}
        </div>
      </div>
      <div>
        <h3>Weather and best time</h3>
        <div class="temps" role="img" aria-label="Average daily highs by month. Best months: ${esc(E.formatMonths(city.best))}">
          ${temps
            .map((t, i) => {
              const h = 12 + ((t - tMin) / (tMax - tMin || 1)) * 70;
              return `<div class="temps__col ${city.best.includes(i + 1) ? "is-best" : ""} ${month === i + 1 ? "is-sel" : ""}" title="${E.MONTHS_LONG[i]}: ${t}°C / ${toF(t)}°F">
                <span class="temps__val">${t}°</span><div class="temps__bar" style="height:${h}%"></div><span class="temps__m">${E.MONTHS[i][0]}</span></div>`;
            })
            .join("")}
        </div>
        <div class="legend" style="margin-top:8px">
          <span><i style="background:var(--teal)"></i>Best months (${esc(E.formatMonths(city.best))})</span>
          ${month ? `<span><i style="background:var(--accent)"></i>Your month</span>` : ""}
          <span>Average daily high, °C</span>
        </div>
      </div>
      ${
        others.length
          ? `<div><h3>Also in ${esc(city.country.name)}</h3><div class="chips">${others
              .map((o) => `<button class="chip" data-action="open-city" data-id="${o.id}">${esc(o.name)}</button>`)
              .join("")}</div></div>`
          : ""
      }
      <div class="row">
        <button class="btn btn--primary" data-action="save" data-kind="city" data-id="${city.id}">${state.saved.has(`city:${city.id}`) ? "♥ Saved" : "♡ Save to shortlist"}</button>
        <a class="btn btn--ghost" href="${mapUrl}" target="_blank" rel="noopener">View on map ↗</a>
      </div>`;
    const dlg = $("#detail");
    if (!dlg.open) {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    }
    $("#detail-body").scrollTop = 0;
    dlg.scrollTop = 0;
  }

  function closeDetail() {
    const dlg = $("#detail");
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }

  // ---------- Actions ----------
  function toggleSaved(kind, id) {
    const key = `${kind}:${id}`;
    const item = lookupSaved(key);
    if (!item) return;
    if (state.saved.has(key)) {
      state.saved.delete(key);
      toast(`Removed ${item.name} from your shortlist`);
    } else {
      state.saved.add(key);
      toast(`Saved ${item.name} to your shortlist`);
    }
    persist();
    render();
    if ($("#detail").open && kind === "city") openCity(id);
  }

  function surprise() {
    let pool;
    if (state.results && state.results.cities.length) pool = state.results.cities.slice(0, 10).map((r) => r.city);
    else pool = index.cities;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    openCity(pick.id);
  }

  function shareUrl() {
    // When hosted inside a viewer frame, a meta tag names the public page URL.
    const meta = document.querySelector('meta[name="wtt:share-base"]');
    const base = meta ? meta.content : `${location.origin}${location.pathname}`;
    return `${base}#${E.encodePrefs(state.prefs, index)}`;
  }

  function share() {
    const url = shareUrl();
    const box = $("#share-box");
    if (box) {
      box.hidden = false;
      const input = $("#share-url");
      input.value = url;
      input.focus();
      input.select();
    }
    // Clipboard writes must start inside the click handler.
    try {
      navigator.clipboard
        .writeText(url)
        .then(() => toast("Link copied. Anyone with it sees these results."))
        .catch(() => toast("Select the link below and copy it."));
    } catch (_) {
      toast("Select the link below and copy it.");
    }
  }

  const ACTIONS = {
    start: () => {
      state.focusRegion = null;
      goStep(0);
    },
    next: () => goStep(state.step + 1),
    back: () => {
      if (state.step === 0) {
        state.stage = state.results ? "results" : "intro";
        renderPlan();
        syncHash();
      } else goStep(state.step - 1);
    },
    goto: (el) => {
      setView("plan");
      goStep(Number(el.dataset.step));
    },
    "show-results": () => {
      state.stage = "results";
      state.focusRegion = null;
      runRecommend();
      setView("plan");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    restart: () => {
      state.prefs = E.normalizePrefs({});
      state.results = null;
      state.focusRegion = null;
      state.stage = "intro";
      persist();
      renderPlan();
      syncHash();
    },
    interest: (el) => {
      const id = el.dataset.id;
      const next = ((state.prefs.interests[id] || 0) + 1) % 3;
      if (next) state.prefs.interests[id] = next;
      else delete state.prefs.interests[id];
      renderPlan();
      const again = document.querySelector(`[data-action="interest"][data-id="${id}"]`);
      if (again) again.focus();
    },
    set: (el) => {
      const key = el.dataset.key;
      const raw = el.dataset.value;
      state.prefs[key] = ["month", "budget"].includes(key) ? Number(raw) : raw;
      renderPlan();
      const again = document.querySelector(`[data-action="set"][data-key="${key}"][data-value="${raw}"]`);
      if (again) again.focus();
    },
    exclude: (el) => {
      const id = el.dataset.id;
      const ex = new Set(state.prefs.exclude);
      ex.has(id) ? ex.delete(id) : ex.add(id);
      state.prefs.exclude = [...ex];
      renderPlan();
      const again = document.querySelector(`[data-action="exclude"][data-id="${id}"]`);
      if (again) again.focus();
    },
    "focus-region": (el) => {
      const id = el.dataset.id || null;
      state.focusRegion = state.focusRegion === id ? null : id;
      renderPlan();
      const h = $("#h-countries");
      if (h && id) h.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    "open-city": (el) => openCity(el.dataset.id),
    "open-country": (el) => {
      const c = index.countryById[el.dataset.id];
      if (c) openCity(c.cities[0].id);
    },
    "close-detail": closeDetail,
    save: (el) => toggleSaved(el.dataset.kind, el.dataset.id),
    "clear-saved": (el) => {
      // Two-step confirmation inside the page (native confirm dialogs may be blocked).
      if (el.dataset.armed !== "1") {
        el.dataset.armed = "1";
        el.textContent = "Tap again to clear all";
        setTimeout(() => {
          if (el.isConnected) {
            el.dataset.armed = "";
            el.textContent = "Clear shortlist";
          }
        }, 4000);
        return;
      }
      state.saved.clear();
      persist();
      render();
    },
    "clear-filters": () => {
      state.explore = { q: "", region: "", month: 0, interest: "", cost: 5 };
      $("#view-explore").innerHTML = "";
      renderExplore();
    },
    surprise,
    share,
  };

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      e.preventDefault();
      closeDetail();
      if (nav.dataset.nav === "plan" && nav.classList.contains("brand")) {
        state.stage = state.results ? "results" : "intro";
      }
      setView(nav.dataset.nav);
      return;
    }
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(el);
    }
  });

  // Close the dialog when clicking the backdrop.
  $("#detail").addEventListener("click", (e) => {
    if (e.target.id === "detail") closeDetail();
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.pref === "home") {
      state.prefs.home = el.value;
      renderPlan();
      $("#home").focus();
    }
    if (el.dataset.filter && el.dataset.filter !== "q") {
      const k = el.dataset.filter;
      state.explore[k] = ["month", "cost"].includes(k) ? Number(el.value) : el.value;
      renderExplore();
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.dataset.filter === "q") {
      state.explore.q = e.target.value;
      renderExplore();
    }
  });

  $("#theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = isDark ? "light" : "dark";
    persist();
  });

  window.addEventListener("hashchange", () => {
    readHash();
    setView(state.view);
  });

  // ---------- Boot ----------
  load();
  readHash();
  setView(state.view);
})();
