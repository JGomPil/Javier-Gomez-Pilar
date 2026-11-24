/* ─────────────────────────────────────────────────────────────
   SELECTOR TEMPORAL DE ASPECTO

   Pinta una barra flotante para cambiar entre los tres aspectos
   definidos en skins.css. Guarda la elección en el navegador, así
   que al recargar sigue en el que estabas.

   Provisional: cuando elijas uno, este fichero y skins.css
   desaparecen y sus valores pasan a style.css.
   ───────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const KEY = "jgp-skin";
  const DEFAULT = "grafito";
  const SKINS = [
    { id: "grafito",  name: "Grafito" },
    { id: "arenisca", name: "Arenisca" },
    { id: "pizarra",  name: "Pizarra" },
  ];

  function read() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  function write(value) {
    try { localStorage.setItem(KEY, value); } catch { /* modo privado */ }
  }

  function apply(id) {
    document.documentElement.dataset.skin = id;
    // Cada aspecto trae su propia luz, así que la elección
    // claro/oscuro de style.css no debe pelearse con él.
    delete document.documentElement.dataset.theme;
    document.querySelectorAll(".picker button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.skin === id));
    });
    // Repinta las trazas y la gráfica con el acento nuevo.
    window.dispatchEvent(new Event("jgp:skinchange"));
  }

  function build(current) {
    const bar = document.createElement("div");
    bar.className = "picker";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Elegir aspecto de la web");

    const label = document.createElement("span");
    label.className = "picker-label";
    label.textContent = "Aspecto";
    bar.appendChild(label);

    for (const skin of SKINS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.skin = skin.id;
      button.textContent = skin.name;
      button.setAttribute("aria-pressed", String(skin.id === current));
      button.addEventListener("click", () => {
        write(skin.id);
        apply(skin.id);
      });
      bar.appendChild(button);
    }
    document.body.appendChild(bar);
  }

  function start() {
    const saved = read();
    const current = SKINS.some((s) => s.id === saved) ? saved : DEFAULT;
    build(current);
    apply(current);
    // El botón claro/oscuro no tiene sentido mientras se elige.
    const toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.hidden = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
