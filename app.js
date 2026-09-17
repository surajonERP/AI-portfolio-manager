// Your AI Portfolio Manager — tab navigation
// Each tab is a <section data-view="...">. The URL hash (#profile, #analytics...)
// decides which one is visible, so every tab has its own shareable link.

(function () {
  const TITLES = {
    home: "Your AI Portfolio Manager",
    profile: "Your plan · Your AI Portfolio Manager",
    analytics: "Analytics · Your AI Portfolio Manager",
    optimisation: "Optimisation · Your AI Portfolio Manager",
    projections: "Projections · Your AI Portfolio Manager",
    methodology: "Methodology · Your AI Portfolio Manager"
  };

  const views = document.querySelectorAll("[data-view]");
  const tabLinks = document.querySelectorAll("[data-tab]");
  const main = document.getElementById("main");

  function show(name, moveFocus) {
    // A link to something inside a tab (e.g. #stock-basket) opens that tab and scrolls to it
    let anchor = null;
    if (!TITLES[name]) {
      const el = name ? document.getElementById(name) : null;
      const view = el && el.closest("[data-view]");
      if (view) { anchor = el; name = view.dataset.view; }
      else name = "home";
    }

    views.forEach(v => { v.hidden = v.dataset.view !== name; });
    tabLinks.forEach(a => {
      if (a.dataset.tab === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    document.title = TITLES[name];
    if (anchor) anchor.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
    if (moveFocus && !anchor) main.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("apm:view", { detail: name }));
  }

  const current = () => location.hash.replace("#", "") || "home";

  window.addEventListener("hashchange", () => show(current(), true));
  show(current(), false);
})();
