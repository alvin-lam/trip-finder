// Runs in <head> on pages that do not load the full app (privacy.html):
// applies a saved light or dark mode before the page paints.
// A file, not inline code, because the Content-Security-Policy forbids inline scripts.
(function () {
  "use strict";
  try {
    var t = JSON.parse(localStorage.getItem("wtt:v1") || "{}").theme;
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (e) { /* storage may be blocked */ }
})();
