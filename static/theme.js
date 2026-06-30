"use strict";
// Alternancia de tema claro/escuro, compartilhada entre o site e o admin.
// A definicao inicial do tema acontece via script inline no <head> (evita "flash").
(function () {
  const KEY = "barber_theme";

  function current() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (e) { /* ignore */ }
    const btn = document.getElementById("themeToggle");
    if (btn) {
      const dark = theme === "dark";
      btn.textContent = dark ? "☀️" : "🌙";
      btn.setAttribute("aria-label", dark ? "Mudar para modo claro" : "Mudar para modo escuro");
      btn.title = btn.getAttribute("aria-label");
    }
  }

  function init() {
    apply(current());
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", function () {
        apply(current() === "dark" ? "light" : "dark");
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
