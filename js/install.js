/*
 * "Add to Home Screen" prompt.
 *  - Chrome, Edge and Android: captures the browser's install event and offers an Install button.
 *  - iPhone and iPad Safari: no install API exists, so it shows the Share > Add to Home Screen steps.
 * It waits until the visitor is engaged (results shown, or 25 seconds on the page),
 * never shows once installed, and stays quiet for 30 days after being dismissed.
 */
(function () {
  const KEY = "wtt:install-dismissed";
  const QUIET_DAYS = 30;
  const ENGAGE_MS = 25000;

  // Not inside an embedded viewer or frame: install prompts only make sense on the real site.
  if (window.top !== window.self) return;

  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (standalone) return;

  // sw.js sits beside the js/ folder, so this works from /, /explore/ and /place/<id>/.
  const SW_URL = new URL("../sw.js", document.currentScript.src).href;
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register(SW_URL).catch(() => {}));
  }

  function recentlyDismissed() {
    try {
      const t = Number(localStorage.getItem(KEY) || 0);
      return t && Date.now() - t < QUIET_DAYS * 864e5;
    } catch (_) {
      return false;
    }
  }

  const ua = navigator.userAgent || "";
  // iPadOS reports itself as a Mac, so also check for touch support.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // Safari, and Chrome or Edge on iOS 16.4+, all offer Add to Home Screen from their Share menu.
  const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

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
             <button class="btn btn--ghost btn--sm" data-install="later">Not now</button>
           </div>`
        : `<ol class="install__steps">
             <li>Tap ${share} <b>Share</b> ${isIOSSafari ? "in Safari's toolbar" : "in your browser's address bar or menu"}.</li>
             <li>Scroll and tap <b>Add to Home Screen</b>.</li>
           </ol>
           <div class="install__actions"><button class="btn btn--ghost btn--sm" data-install="later">Got it</button></div>`;
    el.innerHTML = `
      <img class="install__icon" src="img/icon-192.png" alt="" width="48" height="48" />
      <div class="install__text">
        <h2 id="install-title">Add Trip Finder to your home screen</h2>
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
