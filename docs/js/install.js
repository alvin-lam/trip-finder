/*
 * "Add to Home Screen" prompt.
 *  - Chrome and Edge: capture the browser's install event and offer an Install button.
 *  - iPhone and iPad: no install API exists, so it shows the Share > Add to Home Screen steps.
 *  - Browsers that can add the app from their own menu but offer no install event
 *    (Firefox and Samsung Internet on Android, other Android browsers, Safari on a Mac)
 *    get that browser's steps instead. Browsers that cannot add apps at all show nothing.
 * It waits until the visitor is engaged (results shown, or 25 seconds on the page),
 * never shows once installed, and stays quiet for 24 hours after being closed.
 */
(function () {
  const KEY = "wtt:install-dismissed";
  const QUIET_HOURS = 24;
  const ENGAGE_MS = 25000;

  // Not inside an embedded viewer or frame: install prompts only make sense on the real site.
  if (window.top !== window.self) return;

  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (standalone) return;

  // sw.js sits beside the js/ folder, so this works from /, /explore/ and /place/<id>/.
  const SW_URL = new URL("../sw.js", document.currentScript.src).href;
  // The icon is found from the script's own folder, so it shows on /place/<id>/ pages too.
  const ICON_URL = new URL("../img/icon-192.png", document.currentScript.src).href;
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register(SW_URL).catch(() => {}));
  }

  function recentlyDismissed() {
    try {
      const t = Number(localStorage.getItem(KEY) || 0);
      return t && Date.now() - t < QUIET_HOURS * 36e5;
    } catch (_) {
      return false;
    }
  }

  const ua = navigator.userAgent || "";
  // iPadOS reports itself as a Mac, so also check for touch support.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // Safari, and Chrome or Edge on iOS 16.4+, all offer Add to Home Screen from their Share menu.
  const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
  // Steps for browsers that add the app from their own menu, with no install event.
  const MENU = '<b aria-label="menu">⋮</b>';
  const manualSteps = (() => {
    if (isAndroid && /Firefox/.test(ua)) return [`Tap the ${MENU} menu.`, "Tap <b>Install</b> or <b>Add to Home screen</b>."];
    if (isAndroid && /SamsungBrowser/.test(ua)) return ['Tap the <b aria-label="menu">☰</b> menu.', "Tap <b>Add page to</b>, then <b>Home screen</b>."];
    if (isAndroid) return [`Open your browser's ${MENU} menu.`, "Tap <b>Add to Home screen</b> or <b>Install app</b>."];
    if (isMacSafari) return ["In the menu bar, choose <b>File</b>.", "Choose <b>Add to Dock</b>."];
    return null;
  })();

  let deferred = null; // the browser's install event, when it offers one
  let engaged = false;
  let shown = false;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    maybeShow();
  });

  window.addEventListener("appinstalled", () => {
    hide();
    deferred = null;
  });

  // The app signals engagement when results appear.
  window.addEventListener("wtt:engaged", () => {
    engaged = true;
    maybeShow();
  });
  setTimeout(() => {
    engaged = true;
    maybeShow();
  }, ENGAGE_MS);

  function maybeShow() {
    if (shown || !engaged || recentlyDismissed()) return;
    if (deferred) render("native");
    else if (isIOS) render("ios");
    // The install event can arrive a moment late; give it a few seconds before
    // falling back to the browser's own menu steps.
    else if (manualSteps) setTimeout(() => !shown && !deferred && !recentlyDismissed() && render("manual"), 4000);
  }

  function render(mode) {
    shown = true;
    const el = document.createElement("aside");
    el.className = "install";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-labelledby", "install-title");
    const share =
      '<svg class="install__share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 11H5v10h14V11h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const body =
      mode === "native"
        ? `<p>Get quick access from your home screen. It works offline too.</p>
           <div class="install__actions">
             <button class="btn btn--primary btn--sm" data-install="go">Install</button>
             <button class="btn btn--ghost btn--sm" data-install="later">Close</button>
           </div>`
        : mode === "manual"
        ? `<p>Your browser adds apps from its own menu. It works offline too.</p>
           <ol class="install__steps">${manualSteps.map((s) => `<li>${s}</li>`).join("")}</ol>
           <div class="install__actions"><button class="btn btn--ghost btn--sm" data-install="later">Got it</button></div>`
        : `<ol class="install__steps">
             <li>Tap ${share} <b>Share</b> ${isIOSSafari ? "in Safari's toolbar" : "in your browser's address bar or menu"}.</li>
             <li>Scroll and tap <b>Add to Home Screen</b>.</li>
           </ol>
           <div class="install__actions"><button class="btn btn--ghost btn--sm" data-install="later">Got it</button></div>`;
    el.innerHTML = `
      <img class="install__icon" src="${ICON_URL}" alt="" width="48" height="48" />
      <div class="install__text">
        <h2 id="install-title">${mode === "manual" && isMacSafari ? "Add Trip Finder to your Dock" : "Add Trip Finder to your home screen"}</h2>
        ${body}
      </div>
      <button class="install__close" data-install="later" aria-label="Dismiss">✕</button>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-on"));

    el.addEventListener("click", async (e) => {
      const action = e.target.closest("[data-install]");
      if (!action) return;
      if (action.dataset.install === "go" && deferred) {
        deferred.prompt();
        const choice = await deferred.userChoice.catch(() => null);
        deferred = null;
        if (choice && choice.outcome === "dismissed") remember();
        hide();
      } else {
        remember();
        hide();
      }
    });
  }

  function remember() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch (_) {
      /* storage unavailable */
    }
  }

  function hide() {
    const el = document.querySelector(".install");
    if (!el) return;
    el.classList.remove("is-on");
    setTimeout(() => el.remove(), 250);
  }
})();
