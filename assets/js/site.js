/* ─────────────────────────────────────────────────────────────
   Javier Gómez Pilar — site behaviour
   Loads data/content.json (hand-edited) and data/profile.json
   (regenerated weekly by scripts/update_data.py), then renders.
   ───────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  /* El nombre entero, no solo el apellido: en una lista de doce
     coautores lo que se busca es "Javier Gomez-Pilar". Admite el
     acento y la inicial porque las fuentes no se ponen de acuerdo. */
  const YO = /((?:Javier\s+|J\.\s*)?G[oó]mez[-\s]?Pilar(?:,\s*(?:Javier|J\.))?)/gi;
  const LANG_KEY = "jgp-lang";
  const THEME_KEY = "jgp-theme";

  const state = {
    lang: "es",
    repaintTrace: null,
    content: null,
    profile: null,
    filter: "all",
    kinds: new Set(["journal"]),   // arranca priorizando los JCR
    year: null,                    // lo fija una barra del gráfico
    query: "",
    expanded: { pubs: false, projects: false, awards: false,
               tfgs: false, tfms: false, pracs: false },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const safeGet = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const safeSet = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  };

  const t = (key) => state.content?.ui?.[state.lang]?.[key] ?? key;

  const nf = () => new Intl.NumberFormat(state.lang === "es" ? "es-ES" : "en-GB");

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  /* Un <use> contra el sprite del documento. Hereda currentColor, asi
     que cambia solo con el tema, y al no ser una imagen externa no
     cuesta una peticion ni parpadea al cargar. */
  const icon = (nombre, clase) =>
    `<svg class="icon ${clase || ""}" aria-hidden="true" focusable="false">`
    + `<use href="#${nombre}"></use></svg>`;

  /* ── theme ───────────────────────────────────────────────── */

  function initTheme() {
    const saved = safeGet(THEME_KEY);
    if (saved === "dark" || saved === "light") {
      document.documentElement.dataset.theme = saved;
    }
    $("#theme-toggle")?.addEventListener("click", () => {
      const root = document.documentElement;
      const isDark = root.dataset.theme
        ? root.dataset.theme === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = isDark ? "light" : "dark";
      root.dataset.theme = next;
      safeSet(THEME_KEY, next);
        state.repaintTrace?.();
    });
  }

  /* ── la banda de separacion ──────────────────────────────── */
  // La banda de separacion: cuatro curvas lentas que se cruzan.
  //
  // Cada una tiene su propia mezcla de senoides y su propia deriva,
  // de modo que se adelantan y se cruzan entre si en lugar de ir en
  // paralelo. Dos van en el azul de la pagina y dos en el naranja,
  // que es lo unico que destaca sobre este gris azulado.
  //
  // Ondas lentas superpuestas es lo que se mira en M/EEG, asi que la
  // banda dice de que va la pagina sin ilustrar nada ni afirmar
  // ningun dato.
  function initTrace() {
    const canvas = $("#trace");
    if (!canvas) return;
    const cx = canvas.getContext("2d", { alpha: true });
    if (!cx) return;

    // Cada curva:
    //   y       donde se apoya, 0 arriba y 1 abajo
    //   amp     desviacion maxima, en fraccion del alto
    //   onda    [ciclos a lo ancho, deriva rad/s, fase, peso] por
    //           componente; los pesos suman 1
    //   tono    "frio" o "calido"
    //   alpha   opacidad
    const LINEAS = [
      { y: 0.34, amp: 0.21, tono: "frio", alpha: 0.50, onda: [
          [1.5, 0.22, 0.7, 0.60], [3.1, -0.17, 2.3, 0.40]] },
      { y: 0.50, amp: 0.25, tono: "calido", alpha: 0.62, onda: [
          [1.1, -0.19, 2.1, 0.55], [2.4, 0.26, 0.4, 0.45]] },
      { y: 0.58, amp: 0.19, tono: "frio", alpha: 0.40, onda: [
          [2.0, 0.28, 4.2, 0.50], [3.7, 0.15, 1.6, 0.50]] },
      { y: 0.66, amp: 0.23, tono: "calido", alpha: 0.34, onda: [
          [1.3, 0.16, 5.1, 0.65], [2.9, -0.24, 3.4, 0.35]] },
    ];

    const PASO = 3;                // px entre muestras de la curva
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    let w = 0, h = 0, dpr = 1, raf = 0, origen = 0;

    const color = (nombre, respaldo) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(nombre).trim() || respaldo;

    function medir() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const caja = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(caja.width));
      h = Math.max(1, Math.round(caja.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function pinta(t) {
      cx.clearRect(0, 0, w, h);
      const tintas = {
        frio: color("--accent", "#1b4ea8"),
        calido: color("--warm-mark", "#d2650f"),
      };
      cx.lineWidth = 1.25;
      cx.lineJoin = "round";
      cx.lineCap = "round";

      for (const linea of LINEAS) {
        const tinta = tintas[linea.tono];
        // Las puntas se desvanecen: una curva cortada a cuchillo en
        // el borde no parece una curva, parece un recorte mal hecho.
        const degradado = cx.createLinearGradient(0, 0, w, 0);
        degradado.addColorStop(0, "transparent");
        degradado.addColorStop(0.11, tinta);
        degradado.addColorStop(0.89, tinta);
        degradado.addColorStop(1, "transparent");

        cx.globalAlpha = linea.alpha;
        cx.strokeStyle = degradado;
        cx.beginPath();
        for (let x = 0; x <= w; x += PASO) {
          const u = x / w;
          let d = 0;
          for (const [ciclos, deriva, fase, peso] of linea.onda) {
            d += peso * Math.sin(2 * Math.PI * ciclos * u + deriva * t + fase);
          }
          const y = linea.y * h + linea.amp * h * d;
          if (x === 0) cx.moveTo(x, y);
          else cx.lineTo(x, y);
        }
        cx.stroke();
      }
      cx.globalAlpha = 1;
    }

    function cuadro(ahora) {
      // Todo es funcion del tiempo absoluto: no hay estado que
      // acumular ni nada que se desajuste si se pierde un fotograma o
      // si la pestana se queda en segundo plano un rato.
      pinta((ahora - origen) / 1000);
      raf = requestAnimationFrame(cuadro);
    }

    function start() {
      cancelAnimationFrame(raf);
      medir();
      if (reduce.matches) { pinta(0); return; }
      origen = origen || performance.now();
      raf = requestAnimationFrame(cuadro);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entradas) => {
        for (const en of entradas) {
          if (en.isIntersecting) start();
          else cancelAnimationFrame(raf);
        }
      }, { rootMargin: "120px" }).observe(canvas);
    } else {
      start();
    }
    window.addEventListener("resize", start, { passive: true });
    reduce.addEventListener?.("change", start);

    return start;
  }

  /* ── language ────────────────────────────────────────────── */

  /* El idioma puede venir en la direccion (?lang=en). Manda sobre lo
     guardado y sobre el navegador, porque un enlace compartido tiene
     que abrirse en el idioma de quien lo mando. Al cambiarlo, la
     direccion se reescribe sin recargar: asi la barra del navegador
     siempre dice que se esta viendo, y el enlace se puede copiar. */
  function langUrl() {
    try {
      const v = new URL(location.href).searchParams.get("lang");
      return v === "en" || v === "es" ? v : "";
    } catch { return ""; }
  }

  function marcaUrl() {
    try {
      const u = new URL(location.href);
      if (state.lang === "es") u.searchParams.delete("lang");
      else u.searchParams.set("lang", state.lang);
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch { /* en file:// no se puede, y no pasa nada */ }
  }

  function initLang() {
    const saved = safeGet(LANG_KEY);
    const browser = (navigator.language || "es").slice(0, 2).toLowerCase();
    state.lang = langUrl()
      || (saved === "en" || saved === "es"
        ? saved
        : (browser === "es" ? "es" : "en"));

    $$(".lang button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.lang === state.lang) return;
        state.lang = btn.dataset.lang;
        safeSet(LANG_KEY, state.lang);
        marcaUrl();
        applyLang();
        renderAll();
      });
    });
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    marcaUrl();
    $$("[data-i18n]").forEach((el) => {
      const value = state.content?.ui?.[state.lang]?.[el.dataset.i18n];
      if (value) el.textContent = value;
    });
    $$("[data-i18n-aria]").forEach((el) => {
      const value = state.content?.ui?.[state.lang]?.[el.dataset.i18nAria];
      if (value) el.setAttribute("aria-label", value);
    });
    $$("[data-i18n-ph]").forEach((el) => {
      const value = state.content?.ui?.[state.lang]?.[el.dataset.i18nPh];
      if (value) el.setAttribute("placeholder", value);
    });
    $$(".lang button").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === state.lang));
    });

    // textContent se lleva por delante a los hijos, asi que el icono
    // de cada cabecera se repone despues de traducir y no antes.
    $$("[data-icon]").forEach((el) => {
      if (!el.querySelector(".icon")) {
        el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon, "h-icon"));
      }
    });
  }

  /* ── el epigrafe ─────────────────────────────────────────── */

  /* Va igual en las dos versiones: una cita no se traduce. Las tres
     lineas son las que son, asi que se escriben como tres lineas y no
     se deja que el navegador decida donde parte. */
  function renderEpigraph() {
    const host = $("#epigraph");
    const cita = state.content.epigraph;
    if (!host || !cita) return;
    host.innerHTML = `<p>`
      // Separadas por un espacio: en pantalla ancha cada una es un
      // bloque y el espacio no cuenta, pero en movil las lineas se
      // juntan en un parrafo y sin el se pegarian las palabras.
      + cita.lines.map((l) => `<span>${esc(l)}</span>`).join(" ")
      + `</p><cite>${esc(cita.author)}</cite>`;
  }

  /* ── metrics ─────────────────────────────────────────────── */

  function renderMetrics() {
    const m = state.profile.metrics;
    const fmt = nf();
    const set = (name, value) => {
      const el = $(`[data-metric="${name}"]`);
      if (el) el.textContent = value;
    };

    set("jcr", fmt.format(m.jcr_articles));
    set("q1", fmt.format(m.quartiles.Q1 ?? 0));

    // Citations and h-index come from Web of Science: the figures Spanish
    // evaluation committees use. The script fills metrics.wos when a
    // WOS_API_KEY is configured; otherwise the hand-kept values in
    // content.json are used, and either way the date of the figures shows.
    const wos = m.wos || state.content.wos || {};
    set("citations", wos.citations != null ? fmt.format(wos.citations) : "—");
    set("h", wos.h_index != null ? fmt.format(wos.h_index) : "—");

    const asOf = wos.as_of
      ? new Date(wos.as_of).toLocaleDateString(
          state.lang === "es" ? "es-ES" : "en-GB",
          { month: "short", year: "numeric" }
        )
      : "";
    const wosSrc = `Web of Science${asOf ? ` · ${asOf}` : ""}`;
    set("cit-src", wosSrc);
    set("h-src", wosSrc);
    // Los cuartiles son dato del JCR, de Web of Science: la lista se
    // refresca cada semana desde GIB, que es su espejo, pero la autoridad
    // de la clasificacion es WoS y es lo que se acredita.
    set("jcr-src", wosSrc);

    const pct = m.jcr_articles
      ? Math.round((m.quartiles.Q1 / m.jcr_articles) * 100)
      : 0;
    const d1 = m.quartiles.D1 ?? 0;
    set("q1pct", state.lang === "es"
      ? `${pct}% · ${d1} en primer decil`
      : `${pct}% · ${d1} in top decile`);

    const stamp = $("#stamp-date");
    if (stamp && m.generated !== undefined) stamp.textContent = m.generated;
    if (stamp && state.profile.generated) {
      const date = new Date(state.profile.generated);
      stamp.textContent = date.toLocaleDateString(
        state.lang === "es" ? "es-ES" : "en-GB",
        { day: "numeric", month: "long", year: "numeric" }
      );
    }
  }

  /* ── citations chart ─────────────────────────────────────── */

  /* Las etiquetas de cada linea solo se traducen donde cambian: EEG
     es EEG en los dos idiomas, "Teoria de grafos" no. */
  const senales = (linea) =>
    (state.lang === "en" && linea.signals_en) || linea.signals;

  function renderLines() {
    const host = $("#lines");
    if (!host) return;
    host.innerHTML = state.content.lines.map((line, i) => {
      const L = line[state.lang];
      return `
        <article class="line">
          <span class="line-n">${icon("i-line-" + (i + 1), "line-icon")}<b>${String(i + 1).padStart(2, "0")}</b></span>
          <h3>${esc(L.title)}</h3>
          <p>${esc(L.text)}</p>
          <ul class="signals">${senales(line).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        </article>`;
    }).join("");
  }

  /* ── collapsing long lists ───────────────────────────────── */
  /* Every long list shows a head and keeps the rest one click away,
     so the page can be skimmed without scrolling past 68 entries. */

  function appendToggle(host, opts) {
    const { total, limit, flag, moreKey, lessKey, rerender } = opts;
    if (total <= limit) return;
    const expanded = state.expanded[flag];
    const count = opts.remaining ?? total;
    const label = expanded
      ? t(lessKey)
      : t(moreKey).replace("{n}", nf().format(count));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "more";
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = label;
    button.addEventListener("click", () => {
      state.expanded[flag] = !state.expanded[flag];
      rerender();
      // Keep the button under the thumb instead of jumping to the top.
      const again = host.querySelector(".more");
      if (again) {
        again.focus({ preventScroll: true });
        again.scrollIntoView({ block: "center", behavior: "auto" });
      }
    });
    host.appendChild(button);
  }

  /* ── publications ────────────────────────────────────────── */

  function highlightName(authors) {
    return esc(authors).replace(YO, '<span class="me">$1</span>');
  }

  /* Tres de los ochenta y un DOI vienen del raspado con la URL
     entera. Sin quitarla, el enlace salia como
     doi.org/https://doi.org/10..., que no lleva a ninguna parte, y
     la ficha enseñaba el churro completo. */
  const doiLimpio = (doi) =>
    String(doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");

  function isFirstAuthor(pub) {
    const first = pub.authors.split(",")[0] || "";
    return /G[oó]mez[-\s]?Pilar/i.test(first);
  }

  function matches(pub) {
    if (state.year && pub.year !== state.year) return false;
    if (state.kinds.size && !state.kinds.has(pub.kind || "journal")) return false;
    if (state.filter === "q1" && pub.quartile !== "Q1") return false;
    if (state.filter === "d1" && !pub.top_decile) return false;
    if (state.filter === "first" && !isFirstAuthor(pub)) return false;
    if (state.query) {
      const hay = `${pub.title} ${pub.journal} ${pub.authors}`.toLowerCase();
      if (!hay.includes(state.query)) return false;
    }
    return true;
  }

  /* Las categorias se marcan como las casillas de GIB: varias a la vez.
     Ninguna marcada equivale a todas, para que la lista nunca quede vacia
     sin que el usuario lo haya pedido. */
  function renderKindChips() {
    const host = $("#kind-chips");
    if (!host) return;
    const counts = state.profile.metrics.by_kind || {};
    const order = ["journal", "book", "conf_int", "conf_nat", "conf_teach",
                   "journal_other"];

    host.innerHTML = order
      .filter((kind) => counts[kind])
      .map((kind) => {
        const on = state.kinds.has(kind);
        return `<button type="button" data-kind="${kind}" aria-pressed="${on}">`
          + `${esc(t("k." + kind))}<span class="chip-n">${counts[kind]}</span>`
          + `</button>`;
      }).join("");

    host.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.kind;
        if (state.kinds.has(kind)) state.kinds.delete(kind);
        else state.kinds.add(kind);
        if (!state.kinds.size) state.kinds.add("journal");   // nunca vacio
        state.expanded.pubs = false;
        renderKindChips();
        syncQualityRow();
        renderPublications();
      });
    });
  }

  /* Cuartil y decil solo existen en revistas indexadas: con otra categoria
     seleccionada, la fila entera se retira en lugar de ofrecer filtros que
     vaciarian la lista. */
  function syncQualityRow() {
    const row = $("#qual-row");
    if (!row) return;
    // No basta con que haya revistas seleccionadas: si ademas hay
    // capitulos o congresos, "Q1" los excluiria a todos y el chip se
    // quedaria encendido sin mostrar nada. El cuartil solo tiene
    // sentido cuando lo unico elegido son revistas.
    const revistas = ["journal", "journal_other"];
    const relevant = Array.from(state.kinds).length > 0
      && Array.from(state.kinds).every((k) => revistas.includes(k))
      && revistas.some((k) => state.kinds.has(k));
    row.hidden = !relevant;
    if (!relevant && state.filter !== "all") {
      state.filter = "all";
      $$("#qual-chips button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.filter === "all"));
      });
    }
  }

  /* Selector de año, poblado con lo que hay en la categoria elegida. */
  function renderYearPicker() {
    const select = $("#pub-year");
    if (!select) return;

    const pool = state.profile.publications.filter((p) =>
      !state.kinds.size || state.kinds.has(p.kind || "journal"));
    const counts = {};
    pool.forEach((p) => { counts[p.year] = (counts[p.year] || 0) + 1; });
    const years = Object.keys(counts).map(Number).sort((a, b) => b - a);

    // Si el año elegido ya no existe en esta categoria, se suelta.
    if (state.year && !counts[state.year]) state.year = null;

    select.innerHTML = `<option value="">${esc(t("f.year.all"))}</option>`
      + years.map((y) => `<option value="${y}"${y === state.year ? " selected" : ""}>`
          + `${y} (${counts[y]})</option>`).join("");
  }

  function renderPublications() {
    renderYearPicker();
    const host = $("#pub-list");
    const counter = $("#pub-count");
    if (!host) return;

    const all = state.profile.publications;
    const shown = all.filter(matches);

    // A search is already a narrowing, so it is never capped on top.
    const limit = state.content.collapse?.publications ?? 12;
    const cap = !state.expanded.pubs && !state.query && shown.length > limit;
    const visible = cap ? shown.slice(0, limit) : shown;

    const pool = all.filter((pub) => (!state.kinds.size
      || state.kinds.has(pub.kind || "journal"))
      && (!state.year || pub.year === state.year)).length;

    const note = $("#year-note");
    if (note) {
      note.hidden = !state.year;
      if (state.year) {
        note.innerHTML = `<button type="button" id="year-clear">`
          + `${state.year}<span aria-hidden="true">×</span></button>`;
        $("#year-clear").addEventListener("click", () => {
          state.year = null;
          renderPublications();
        });
      }
    }
    counter.textContent = t("pub.count")
      .replace("{n}", nf().format(visible.length))
      .replace("{total}", nf().format(pool));

    if (!shown.length) {
      host.innerHTML = `<p class="count">${esc(t("pub.none"))}</p>`;
      return;
    }

    let html = "";
    let year = null;
    for (const pub of visible) {
      if (pub.year !== year) {
        year = pub.year;
        html += `<p class="pub-year">${year}</p>`;
      }

      const badges = [];
      if (pub.quartile) {
        badges.push(`<span class="q ${pub.quartile === "Q1" ? "q1" : ""}">${pub.quartile}</span>`);
      }
      if (pub.top_decile) badges.push(`<span class="q d1">D1</span>`);

      const kind = pub.kind || "journal";

      const where = [
        // El tipo va aqui y no en la columna de insignias: ahi solo caben
        // tres caracteres y "Congresos internacionales" se desbordaba
        // encima del titulo.
        kind !== "journal" ? `<span class="kind">${esc(t("k." + kind))}</span>` : "",
        pub.journal ? `<span class="journal">${esc(pub.journal)}</span>` : "",
        pub.volume ? `vol. ${esc(pub.volume)}` : "",
        pub.pages ? `pp. ${esc(pub.pages)}` : "",
      ].filter(Boolean).join(", ");

      const doi = doiLimpio(pub.doi);
      const href = doi ? `https://doi.org/${encodeURI(doi)}` : pub.url;
      const title = href
        ? `<a href="${esc(href)}" rel="noopener">${esc(pub.title)}</a>`
        : esc(pub.title);

      html += `
        <article class="pub" data-kind="${kind}">
          <div class="pub-badges">${badges.join("")}</div>
          <div class="pub-body">
            <h3 class="pub-title">${title}</h3>
            <p class="pub-meta">${where}</p>
            <p class="pub-authors">${highlightName(pub.authors)}</p>
            ${doi ? `<p class="pub-doi"><a href="https://doi.org/${encodeURI(doi)}" rel="noopener">${esc(doi)}</a></p>` : ""}
          </div>
        </article>`;
    }
    host.innerHTML = html;

    if (!state.query) {
      appendToggle(host, {
        total: shown.length, limit,
        flag: "pubs", moreKey: "more.pubs", lessKey: "less.pubs",
        rerender: renderPublications,
      });
    }
  }

  function initFilters() {
    const quality = $$("#qual-chips button");
    quality.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filter = btn.dataset.filter;
        state.expanded.pubs = false;
        quality.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        renderPublications();
      });
    });

    const search = $("#pub-search");
    search?.addEventListener("input", () => {
      state.query = search.value.trim().toLowerCase();
      renderPublications();
    });

    $("#pub-year")?.addEventListener("change", (ev) => {
      state.year = ev.target.value ? Number(ev.target.value) : null;
      state.expanded.pubs = false;
      renderPublications();
    });
  }

  /* ── projects ────────────────────────────────────────────── */

  function renderProjects() {
    const host = $("#projects-list");
    if (!host) return;

    const roleLabel = {
      "co-ip": state.lang === "es" ? "co-IP · coordinador" : "co-PI · coordinator",
      "ip": state.lang === "es" ? "Investigador principal" : "Principal investigator",
      // Un contrato predoctoral no tiene IP al uso: tiene quien dirige
      // el trabajo de investigacion.
      "director": t("proj.director"),
    };

    // El Portal de la Ciencia refresca cada semana lo que solo el
    // sabe: la aportacion de la UVa, si el proyecto sigue vivo y el
    // enlace a su ficha. El importe propio no se toca, porque es el
    // total del proyecto y el del Portal solo la parte de la UVa.
    const portal = state.profile.projects || {};
    const capa = portal.overlay || {};
    const propios = state.content.projects.map((p) => {
      const extra = capa[p.acronym] || capa[p.label];
      return extra ? { ...p, ...extra, amount: p.amount } : p;
    });

    // Y los que aparecen en el Portal sin estar todavia en la lista a
    // mano: salen igualmente, con lo que el Portal sepa de ellos.
    const nuevos = (portal.new || []).map((p) => ({
      acronym: "",
      label: "",
      role: "researcher",
      from: p.from,
      to: p.to,
      funder: p.funder,
      scope: p.scope,
      ip: p.ip,
      amount: p.amount_uva,
      amount_basis: "uva",
      live: p.live,
      url: p.url,
      es: { title: p.title },
      en: { title: p.title },
    }));

    const lista = [...propios, ...nuevos].sort(
      (a, b) => Number(b.from) - Number(a.from));

    // Un proyecto sin ambito puesto todavia no debe desaparecer al
    // filtrar: solo se le exige el ambito a quien lo tiene declarado.
    const ambito = state.projectScope || "all";
    const todos = ambito === "all"
      ? lista
      : lista.filter((p) => p.scope === ambito);

    const limit = state.content.collapse?.projects ?? 5;
    const total = todos.length;
    const visible = state.expanded.projects ? todos : todos.slice(0, limit);

    // Un proyecto que acaba este ano o mas tarde sigue vivo. Se marca,
    // porque es lo primero que se mira en una lista de proyectos.
    const ahora = new Date().getFullYear();
    const euros = new Intl.NumberFormat(
      state.lang === "es" ? "es-ES" : "en-GB",
      { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

    host.innerHTML = visible.map((p) => {
      const P = p[state.lang];
      // El Portal marca "Vigente"; si no ha hablado, se deduce del año.
      const vivo = p.live !== undefined ? p.live : Number(p.to) >= ahora;
      const pi = roleLabel[p.role]
        ? `<span class="pi">${esc(roleLabel[p.role])}</span>`
        : "";
      const gente = [
        p.ip ? `<span class="who"><b>${esc(t("pr.ip"))}</b> ${esc(p.ip)}</span>` : "",
        p.coip ? `<span class="who"><b>${esc(t("pr.coip"))}</b> ${esc(p.coip)}</span>` : "",
      ].filter(Boolean).join("");
      const datos = [
        p.amount
          ? `<span class="amount">${esc(euros.format(Number(p.amount)))}`
            + (p.amount_basis === "uva"
                ? ` <i>${esc(t("pr.uva"))}</i>` : "")
            + `</span>`
          : "",
        p.ref ? `<span class="ref">${esc(p.ref)}</span>` : "",
        p.url ? `<a class="ref-link" href="${esc(p.url)}" target="_blank"`
          + ` rel="noopener">${esc(t("pr.portal"))}</a>` : "",
      ].filter(Boolean).join("");

      return `
        <article class="project${vivo ? " live" : ""}">
          <p class="when">
            <span class="years">${esc(p.from)}\u2013${esc(p.to)}</span>
            ${vivo ? `<span class="live-tag">${esc(t("proj.active"))}</span>` : ""}
          </p>
          <h3>${p.acronym ? `<span class="acronym">${esc(p.acronym)}</span>` : ""}${esc(P.title)}${pi}</h3>
          <p class="funder">${esc(p.funder)}${P.note ? ` \u2014 ${esc(P.note)}` : ""}</p>
          ${gente ? `<p class="people">${gente}</p>` : ""}
          ${datos ? `<p class="meta">${datos}</p>` : ""}
        </article>`;
    }).join("");

    appendToggle(host, {
      total, limit, flag: "projects",
      moreKey: "more.generic", lessKey: "less.generic",
      remaining: total - limit,
      rerender: renderProjects,
    });

    $$("#scope-chips button").forEach((btn) => {
      const mio = btn.dataset.scope;
      btn.setAttribute("aria-pressed", String(mio === ambito));
      btn.onclick = () => {
        state.projectScope = mio;
        // Al cambiar de filtro la lista se recoge: si no, "ver mas"
        // queda pulsado sobre un conjunto que ya no es el mismo.
        state.expanded.projects = false;
        renderProjects();
      };
    });
  }

  /* ── teaching & supervision ──────────────────────────────── */

  function renderAtenea() {
    const host = $("#atenea");
    const a = state.content.atenea;
    if (!host || !a) return;
    const A = a[state.lang];
    const fmt = nf();

    // The three branch names and the two highlighted sentences carry inline
    // <b> from content.json, so this block is written as trusted content.
    host.innerHTML = `
      <div class="feature-head">
        <div class="feature-id">
          <span class="atenea-logo" aria-hidden="true"></span>
          <div>
            <h3>${esc(t("atenea.h"))}</h3>
            <p class="feature-sub">${esc(A.expansion)}</p>
          </div>
        </div>
        <ul class="feature-stats">
          ${a.stats.map((s) => `
            <li><b>${fmt.format(s.value)}</b><span>${esc(t(s.key))}</span></li>
          `).join("")}
        </ul>
      </div>
      <div class="feature-body">
        <p>${A.text}</p>
        <p class="feature-award">${esc(A.award)}</p>
        <p>${A.next}</p>
        <p><a href="${esc(a.url)}" rel="noopener">${esc(t("atenea.visit"))}</a></p>
      </div>`;
  }

  /* Docencia en cifras, con el mismo bloque que las bibliometricas:
     la seccion era la unica que entraba sin un solo numero. Salen a
     mano de content.json, que no hay de donde rasparlas. */
  function renderTeachingFigures() {
    const host = $("#teach-metrics");
    const cfg = state.content.teaching_figures;
    if (!host || !cfg) return;
    const fmt = nf();
    host.innerHTML = cfg.items.map((m) => `
      <div class="metric">
        <dt>${esc(t(m.key))}</dt>
        <dd class="num">${fmt.format(m.value)}</dd>
        <dd class="src">${esc(t(m.src))}</dd>
      </div>`).join("");
  }

  /* Las convocatorias de innovacion docente del programa ATENEA, bajo
     su ficha: son la misma historia contada por sus concesiones. */
  /* "IPs: A, B y C". La conjuncion y el rotulo estan traducidos; los
     nombres, en orden, van en cada convocatoria. */
  function ips(x) {
    const n = x.ips || [];
    if (!n.length) return "";
    const lista = n.length === 1 ? n[0]
      : `${n.slice(0, -1).join(", ")} ${t("conj.y")} ${n[n.length - 1]}`;
    return `${t("pid.ips")}: ${lista}`;
  }

  function renderPids() {
    const host = $("#pid-list");
    const cfg = state.content.teaching_projects;
    if (!host || !cfg) return;
    host.innerHTML = `
      <h4 class="pids-h">${esc(t("pid.h"))}</h4>`
      + cfg.items.map((x) => `
        <div class="course">
          <b>${esc(x[state.lang])}</b>
          <span>${esc(x.call)} \u00b7 ${esc(x.course)} \u00b7 `
          + `${esc(ips(x))}</span>
        </div>`).join("");
  }

  /* La guia docente de cada asignatura, en la web de la UVa.
   *
   * El enlace no se guarda entero: en content.json van el plan y el
   * codigo, que no cambian, y el curso va una sola vez. Asi, pasar al
   * curso siguiente es cambiar un numero. Quien no tiene codigo sale
   * sin enlace, que es mejor que un enlace roto. */
  function urlGuia(c) {
    const cfg = state.content.teaching_guides;
    if (!c.guia || !cfg || !cfg.patron) return "";
    return cfg.patron
      .replace("{curso}", cfg.curso)
      .replace("{plan}", c.guia.plan)
      .replace("{codigo}", c.guia.codigo);
  }

  // El logo del centro de la titulacion, para la cabecera del grupo.
  // Va como mascara: el ancho lo fija la proporcion, que la mascara
  // no conoce, y el color lo pone la hoja de estilos.
  function logoTit(c) {
    const cfg = state.content.degree_logos;
    const L = cfg && c.guia && cfg[String(c.guia.plan)];
    if (!L) return "";
    // La mascara va en el atributo y no en una variable: una url
    // dentro de una propiedad personalizada se resuelve contra la
    // hoja de estilos, y saldria assets/css/assets/img/... Ya paso
    // una vez con el logo del GIB.
    const ruta = esc(cfg.carpeta + L.archivo);
    return `<span class="courses-logo" style="`
      + `-webkit-mask-image:url('${ruta}');mask-image:url('${ruta}');`
      + `--prop:${Number(L.proporcion) || 1};`
      + `--esc:${Number(L.escala) || 1}"></span>`;
  }

  function renderTeaching() {
    const host = $("#teaching-list");
    if (host) {
      const cfg = state.content.teaching_guides || {};
      const curso = cfg.curso ? `${cfg.curso}-${cfg.curso + 1}` : "";
      // Agrupadas por titulacion: siete titulos seguidos no dicen de
      // donde sale cada uno, y la titulacion repetida debajo de cada
      // uno es un estribillo. Va de cabecera, y el orden lo pone el
      // JSON, que ya viene de grado a master.
      let titulacion = null;
      host.innerHTML = state.content.teaching.map((c) => {
        const C = c[state.lang];
        const url = urlGuia(c);
        const rotulo = url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener"`
            + ` title="${esc(t("teach.guia").replace("{curso}", curso))}">`
            + `${esc(C.name)}</a>`
          : esc(C.name);
        // Los simuladores que escribe para la asignatura, cuando los hay
        const sim = state.content.simulab;
        const extra = (c.simulab && sim && sim.patron)
          ? `<span><a class="simu" target="_blank" rel="noopener"`
            + ` href="${esc(sim.patron.replace("{sitio}", c.simulab))}">`
            + `${esc(t("teach.simu"))}</a></span>`
          : "";
        const cabecera = C.degree === titulacion
          ? "" : `<h4 class="courses-h${logoTit(c) ? " con-logo" : ""}">`
            + `${logoTit(c)}${esc(C.degree)}</h4>`;
        titulacion = C.degree;
        return `${cabecera}<div class="course"><b>${rotulo}</b>${extra}</div>`;
      }).join("");
    }

    const sup = $("#supervision");
    if (!sup) return;
    const theses = state.content.theses;
    sup.innerHTML = `
      <section class="sup-block">
      <h4>${esc(t("sup.h.phd"))}<span class="n">${theses.length}</span><i>${esc(t("sup.inprog"))}</i></h4>
      <div class="courses">
        ${theses.map((th) => `
          <div class="course">
            <b>${esc(th[state.lang])}</b>
            <span>${esc(th.student)} · ${esc(th.programme[state.lang])} · ${esc(th.from)}–</span>
          </div>`).join("")}
      </div>
      </section>
    `;
    renderTfgs();
  }

  // Tesis, TFM y TFG son tres cosas distintas y antes se leian como
  // una sola lista. Cada una va en su bloque, con su encabezado y su
  // contador.
  //
  // Director y tutor no se distinguen: segun el son lo mismo, y la
  // web no va a inventar una jerarquia que la universidad no hace.
  /* El texto completo, en UVaDOC.
   *
   * De cada trabajo se guarda solo el handle: el que no lo tiene sale
   * sin enlace, porque o no esta depositado o aun no se ha
   * defendido. */
  function rotuloTfg(x) {
    const titulo = esc(x[state.lang]);
    const cfg = state.content.tfg_repo;
    if (!x.uvadoc || !cfg || !cfg.patron) return titulo;
    // Admite el handle (10324/NNNNN) y la direccion entera, que es
    // como UVaDOC las da desde que cambio de version.
    const url = /^https?:/.test(x.uvadoc)
      ? x.uvadoc : cfg.patron.replace("{id}", x.uvadoc);
    return `<a href="${esc(url)}" target="_blank" rel="noopener"`
      + ` title="${esc(t("sup.uvadoc"))}">${titulo}</a>`;
  }

  function renderTfgs() {
    const host = $("#tfg-list");
    const todos = state.content.tfgs;
    if (!host || !todos || !todos.length) return;

    const limit = state.content.collapse?.tfgs ?? 5;

    const bloque = (kind, flag) => {
      const items = todos.filter((x) => x.kind === kind);
      if (!items.length) return "";
      const visible = state.expanded[flag] ? items : items.slice(0, limit);
      return `
        <section class="sup-block" data-kind="${kind}" data-flag="${flag}">
          <h4>${esc(t("sup.h." + kind))}<span class="n">${items.length}</span></h4>
          <ol class="tfg-items">
            ${visible.map((x) => `
              <li>
                <b>${rotuloTfg(x)}</b>
                <span>`
                  + (x.student ? `${esc(x.student)} \u00b7 ` : "")
                  + `${esc(x.degree[state.lang])} \u00b7 ${esc(x.course)}`
                  + `</span>
              </li>`).join("")}
          </ol>
        </section>`;
    };

    // Las practicas externas van detras, con la misma ficha que un
    // trabajo dirigido: entidad de acogida, estudiante y curso.
    host.innerHTML = bloque("tfm", "tfms") + bloque("tfg", "tfgs")
      + bloque("prac", "pracs");

    $$(".sup-block", host).forEach((sec) => {
      const n = todos.filter((x) => x.kind === sec.dataset.kind).length;
      appendToggle(sec, {
        total: n, limit, flag: sec.dataset.flag,
        moreKey: "more.generic", lessKey: "less.generic",
        remaining: n - limit,
        rerender: renderTfgs,
      });
    });
  }

  /* ── recognition ─────────────────────────────────────────── */

  /* El raspado trae los premios en español. La version inglesa busca
     su traduccion en content.json por un fragmento del texto; si no
     la encuentra, deja el original, que es mejor que un hueco. */
  function enIngles(texto) {
    if (state.lang !== "en") return texto;
    const tabla = state.content.awards_en?.items || [];
    const hallado = tabla.find((x) => texto.includes(x.match));
    return hallado ? hallado.text : texto;
  }

  function renderRecognition() {
    const awardsHost = $("#awards-list");
    if (awardsHost) {
      awardsHost.parentNode.querySelector(".more")?.remove();
      // Entries the scraper could not attribute by full surname are shown only
      // when the CV corroborates them (content.json → awards_confirmed_by_cv).
      const allow = state.content.awards_confirmed_by_cv || [];
      const scraped = (state.profile.awards || [])
        .filter((a) => a.confirmed || allow.some((needle) => a.text.includes(needle)))
        .map((a) => ({ year: a.year, text: enIngles(a.text) }));

      // Teaching awards do not appear in the group's research repository,
      // so they are kept by hand in content.json and merged in here.
      const extra = (state.content.awards_extra || [])
        .map((a) => ({ year: a.year, text: a[state.lang] }));

      const awards = [...scraped, ...extra]
        .sort((a, b) => (b.year || 0) - (a.year || 0));

      const limit = state.content.collapse?.awards ?? 5;
      const visible = state.expanded.awards ? awards : awards.slice(0, limit);

      awardsHost.innerHTML = visible.map((a) => `
        <li><span class="yr">${a.year || "—"}</span><span>${esc(a.text)}</span></li>
      `).join("");

      appendToggle(awardsHost.parentNode, {
        total: awards.length, limit, flag: "awards",
        moreKey: "more.generic", lessKey: "less.generic",
        remaining: awards.length - limit,
        rerender: renderRecognition,
      });
    }

    const serviceHost = $("#service-list");
    if (serviceHost) {
      serviceHost.innerHTML = state.content.service
        .map((s) => `<li>${icon("i-advise")}<span>${esc(s[state.lang])}</span></li>`)
        .join("");
    }

    const patHost = $("#patents");
    if (patHost) {
      // La patente pesa mas que los registros de software, asi que va
      // delante y con su propia ficha, no como un punto mas de lista.
      patHost.innerHTML = (state.content.patents || []).map((p) => `
        <article class="patent">
          <p class="kicker">${icon("i-patent")}${esc(t("rec.patent"))}</p>
          <h4>${esc(p[state.lang])}</h4>
          <p class="refs">
            <span class="num">${esc(p.number)}</span>
            <span>${esc(p.pct)}</span>
            <span>${esc(t("rec.patent.of"))}: ${esc(p.holder)}</span>
          </p>
        </article>`).join("");
    }

    const ipHost = $("#ip-list");
    if (ipHost) {
      ipHost.innerHTML = state.content.ip
        .map((s) => `<li>${icon("i-code")}<span>${esc(s[state.lang])}</span></li>`)
        .join("");
    }
  }

  /* ── pestañas ────────────────────────────────── */
  /* Un solo panel visible por grupo. Teclado completo, porque un
     tablist que no responde a las flechas no es un tablist.

     Al mostrarse un panel se avisa con un evento: ECharts no sabe
     dimensionarse dentro de un contenedor oculto, asi que necesita
     enterarse del momento exacto en que deja de estarlo. */
  function initTabs() {
    $$("[data-tabs]").forEach((group) => {
      const tabs = Array.from(group.querySelectorAll('[role="tab"]'));
      if (!tabs.length) return;

      const show = (tab, focus) => {
        tabs.forEach((other) => {
          const on = other === tab;
          other.setAttribute("aria-selected", String(on));
          other.tabIndex = on ? 0 : -1;
          const panel = document.getElementById(
            other.getAttribute("aria-controls"));
          if (panel) panel.hidden = !on;
        });
        if (focus) tab.focus();
        const panel = document.getElementById(tab.getAttribute("aria-controls"));
        if (panel) {
          window.dispatchEvent(new CustomEvent("jgp:tabshown", { detail: panel }));
        }
      };

      tabs.forEach((tab, i) => {
        tab.addEventListener("click", () => show(tab, false));
        tab.addEventListener("keydown", (ev) => {
          const map = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
          const move = map[ev.key];
          if (move === undefined) return;
          ev.preventDefault();
          const next = move === "first" ? 0
            : move === "last" ? tabs.length - 1
            : (i + move + tabs.length) % tabs.length;
          show(tabs[next], true);
        });
      });
    });
  }

  /* ── gráficos ─────────────────────────────────────────────── */

  function paintCharts() {
    if (!window.JGPCharts || !state.profile) return;

    const net = state.profile.collaboration;
    const sub = $("#net-sub");
    if (sub && net) {
      sub.textContent = t("g.net.sub")
        .replace("{n}", nf().format(net.nodes.length))
        .replace("{m}", net.threshold)
        .replace("{total}", nf().format(net.total_coauthors));
      // En un movil los nodos van sin nombre, porque se pisarian: hay
      // que decir donde esta el nombre.
      if (window.matchMedia("(max-width: 560px)").matches) {
        sub.textContent += ` \u00b7 ${t("g.net.tap")}`;
      }
    }

    window.JGPCharts.render({
      profile: state.profile,
      content: state.content,
      lang: state.lang,
      onYearClick: (year) => {
        // Pulsar el mismo año otra vez lo suelta.
        state.year = state.year === year ? null : year;
        state.expanded.pubs = false;
        renderPublications();
        $("#pub-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });
  }

  /* ── efectos ──────────────────────────────────────────────── */

  /* Aparicion al entrar en pantalla. Si no hay IntersectionObserver, todo
     queda visible: el efecto es un anadido, nunca un requisito. */
  function initReveal() {
    const targets = $$(".band-body > *, .hero-text > *, .hero-photo");
    if (!targets.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("reveal", "seen"));
      return;
    }

    targets.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("seen");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    targets.forEach((el) => io.observe(el));
  }

  /* Las cifras suben desde cero la primera vez que se ven. Con movimiento
     reducido se escriben directamente. */
  function initCounters() {
    const nums = $$(".metric .num");
    if (!nums.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || !("IntersectionObserver" in window)) return;

    const run = (el) => {
      const text = el.textContent.trim();
      const target = Number(text.replace(/[^\d]/g, ""));
      if (!target || target > 100000) return;      // solo cifras limpias
      const suffix = text.replace(/[\d.,\s]/g, "");
      const t0 = performance.now();
      const ms = 900;

      const tick = (now) => {
        // El primer fotograma puede traer una marca de tiempo anterior
        // a t0, y sin el max la cifra salia en negativo un instante.
        const k = Math.min(1, Math.max(0, (now - t0) / ms));
        const eased = 1 - Math.pow(1 - k, 3);      // frena al final
        el.textContent = nf().format(Math.round(target * eased)) + suffix;
        if (k < 1) requestAnimationFrame(tick);
        else el.textContent = text;                // el valor exacto, intacto
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    nums.forEach((el) => io.observe(el));
  }

  /* ── el PDF ──────────────────────────────────────────────── */

  /* El PDF lo compone assets/js/pdf.js con los mismos datos que la
     pagina y en el idioma activo. Aqui solo se le pasa el contexto y
     se entretiene al que ha pulsado: la primera vez hay que bajar dos
     megas de libreria y componer veintitantas paginas, y sin aviso
     parece que el boton no ha hecho nada. */
  function initPdf() {
    const boton = $("#pdf-btn");
    const menu = $("#pdf-menu");
    if (!boton) return;
    if (!window.JGPPdf) { boton.hidden = true; return; }

    const etiqueta = boton.querySelector("span");
    let ocupado = false;

    const abre = (si) => {
      if (!menu) return;
      menu.hidden = !si;
      boton.setAttribute("aria-expanded", String(si));
    };

    const descarga = (cual) => {
      if (ocupado) return;
      ocupado = true;
      abre(false);
      boton.disabled = true;
      if (etiqueta) etiqueta.textContent = t("pdf.wait");

      window.JGPPdf.generate({
        content: state.content,
        profile: state.profile,
        lang: state.lang,
      }, cual).catch((err) => {
        console.error("PDF:", err);
        if (etiqueta) etiqueta.textContent = t("pdf.fail");
      }).finally(() => {
        ocupado = false;
        boton.disabled = false;
        // Si ha fallado, el aviso se queda un momento antes de
        // volver a poner "PDF".
        setTimeout(() => {
          if (etiqueta) etiqueta.textContent = t("pdf.btn");
        }, 2600);
      });
    };

    // Sin menu en el HTML —una version vieja en cache— el boton
    // sigue bajando el dosier, que es lo que hacia antes.
    if (!menu) {
      boton.addEventListener("click", () => descarga("dosier"));
      return;
    }

    boton.addEventListener("click", (e) => {
      e.stopPropagation();
      abre(menu.hidden);
    });
    menu.querySelectorAll("[data-pdf]").forEach((b) => {
      b.addEventListener("click", () => descarga(b.dataset.pdf));
    });
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target)) abre(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) { abre(false); boton.focus(); }
    });
  }

  /* ── la tarjeta de contacto ──────────────────────────────── */

  /* El .vcf es un fichero de verdad (tarjeta.vcf, en la raiz, que
     hace scripts/vcf.py con los datos de content.json). Se armaba
     aqui con un blob y habia navegadores que se tragaban la descarga
     sin decir nada; un enlace normal lo abre cualquiera, y el telefono
     ensena la ficha y pregunta si se guarda. Aqui solo queda el
     correo, que sale del JSON y se escribe desde aqui: asi no esta
     en el HTML que leen los robots que recolectan direcciones. */
  function initVcard() {
    const correo = $("#correo");
    const c = state.content.contact_card || {};
    if (!correo) return;
    if (c.email) {
      correo.textContent = c.email;
      correo.href = `mailto:${c.email}`;
    } else {
      correo.closest("span")?.remove();
    }
  }

  /* ── boot ────────────────────────────────────────────────── */

  function renderAll() {
    applyLang();
    renderEpigraph();
    renderMetrics();
    renderLines();
    renderKindChips();
    syncQualityRow();
    renderPublications();
    paintCharts();
    renderProjects();
    renderAtenea();
    renderTeachingFigures();
    renderPids();
    renderTeaching();
    renderRecognition();
  }

  async function boot() {
    initTheme();
    state.repaintTrace = initTrace();

    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    try {
      const [content, profile] = await Promise.all([
        fetch("data/content.json").then((r) => r.json()),
        fetch("data/profile.json").then((r) => r.json()),
      ]);
      state.content = content;
      state.profile = profile;
    } catch (err) {
      console.error("Data load failed:", err);
      const counter = $("#pub-count");
      if (counter) counter.textContent = "No se han podido cargar los datos. Recarga la página.";
      return;
    }

    initLang();
    initFilters();
    initPdf();
    initVcard();
    initTabs();
    initReveal();
    initCounters();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
