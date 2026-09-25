/* Mova prototype helpers — theme mode, reveals, FAQ accordion, tabs. */
(function () {
  // ---- theme: light / dark / system (Vercel-style single button + popover) ----
  var THEME_KEY = "mova-theme";
  function apply(theme) {
    var root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    var options = document.querySelectorAll(".ts-option");
    options.forEach(function (o) {
      var isActive = o.getAttribute("data-theme-choice") === theme;
      o.classList.toggle("active", isActive);
      o.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }
  var saved = localStorage.getItem(THEME_KEY) || "system";
  apply(saved);

  var wrap = document.querySelector(".ts-wrap");
  var btn = wrap ? wrap.querySelector(".ts-btn") : null;
  var pop = wrap ? wrap.querySelector(".ts-popover") : null;
  if (btn && pop) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = pop.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    pop.querySelectorAll(".ts-option").forEach(function (opt) {
      opt.addEventListener("click", function () {
        var choice = opt.getAttribute("data-theme-choice");
        localStorage.setItem(THEME_KEY, choice);
        apply(choice);
        pop.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      });
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) {
        pop.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        pop.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---- scroll reveals ----
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("visible"); });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll(".faq-q").forEach(function (q) {
    q.addEventListener("click", function () { q.parentElement.classList.toggle("open"); });
  });

  // ---- tabs ----
  document.querySelectorAll("[data-tabs]").forEach(function (group) {
    var name = group.getAttribute("data-tabs");
    var btns = group.querySelectorAll(".tab");
    var panels = document.querySelectorAll('[data-tab-panel="' + name + '"]');
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        panels.forEach(function (p) { p.classList.toggle("hidden", p.getAttribute("data-panel-index") !== String(i)); });
      });
    });
  });

  // ---- sidebar collapse toggle ----
  var toggleSidebar = function () {
    var sb = document.getElementById("sidebar");
    if (!sb) return;
    sb.classList.toggle("collapsed");
  };
  document.addEventListener("click", function (e) {
    var toggle = e.target.closest && e.target.closest(".tside-toggle");
    if (toggle) { toggleSidebar(); }
  });
  window.toggleSidebar = toggleSidebar;
})();