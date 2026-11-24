/* ─────────────────────────────────────────────────────────────
   Javier Gómez Pilar — site behaviour
   Loads data/content.json (hand-edited) and data/profile.json
   (regenerated weekly by scripts/update_data.py), then renders.
   ───────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const SURNAME = /(G[oó]mez[-\s]?Pilar|G[oó]mez\s+Pilar)/gi;
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
    expanded: { pubs: false, projects: false, awards: false },
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

  /* ── the trace strip ─────────────────────────────────────── */
  /* Seven oscillators whose integration window lengthens down the
     stack: slower and wider as they go. The subject of the research,
     drawn rather than illustrated. */

  /* Un campo de líneas en flujo.
   *
   * Vuelve la primera version, que es la que funcionaba. Son líneas de
   * nivel de un campo que se deforma despacio: la amplitud se abre en
   * el centro de la banda y se cierra en los bordes, así que el
   * conjunto respira como una lente. No finge ser un dato, que es
   * justo lo que estropeaba al EEG y al espectrograma.
   *
   * Dos reglas que lo mantienen sobrio: las líneas nunca se cruzan, y
   * la opacidad es baja. Lo que se ve es el tejido, no cada hilo.
   *
   * Sobre la banda corta: con menos alto hacen falta menos líneas, o
   * se empastan unas con otras.
   */
  function initTrace() {
    const canvas = $("#trace");
    if (!canvas) return;
    const cx = canvas.getContext("2d", { alpha: true });
    if (!cx) return;

    const LINES = 15;
    const STEP = 7;            // muestreo horizontal; la curva se interpola
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0, h = 0, raf = 0, visible = true;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function token(nombre, porDefecto) {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(nombre).trim() || porDefecto;
    }

    /* Tres senoides inconmensurables: el patrón no se repite a la
       vista y el cálculo sigue siendo trivial. */
    function onda(x, tiempo, fase) {
      return Math.sin(x * 0.0062 + tiempo * 0.21 + fase) * 1.00
           + Math.sin(x * 0.0113 - tiempo * 0.147 + fase * 1.7) * 0.52
           + Math.sin(x * 0.0029 + tiempo * 0.085 + fase * 0.6) * 0.78;
    }

    function draw(transcurrido) {
      cx.clearRect(0, 0, w, h);
      const tiempo = transcurrido / 1000;

      cx.strokeStyle = token("--accent", "#1b4ea8");
      cx.lineWidth = 1;
      cx.lineJoin = "round";
      cx.lineCap = "round";

      const medio = h / 2;

      for (let i = 0; i < LINES; i++) {
        const k = i / (LINES - 1);            // 0 arriba, 1 abajo
        const y0 = k * h;

        // La amplitud se abre en el centro de la banda: seno elevado,
        // que llega a cero justo en los bordes y no los desborda.
        const lente = Math.pow(Math.sin(k * Math.PI), 1.45);
        const amp = (h * 0.26) * lente;

        // Cada linea va algo retrasada respecto a la anterior: eso es
        // lo que hace que el conjunto parezca una superficie y no
        // quince curvas sueltas.
        const fase = k * 2.35;

        cx.globalAlpha = 0.08 + lente * 0.28;
        cx.beginPath();

        for (let x = 0; x <= w + STEP; x += STEP) {
          const y = y0 + (medio - y0) * 0.06 + onda(x, tiempo, fase) * amp * 0.42;
          if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
        }
        cx.stroke();
      }

      cx.globalAlpha = 1;
    }

    let t0 = 0;
    function loop(ahora) {
      if (!t0) t0 = ahora;
      draw(ahora - t0);
      raf = visible && !reduce.matches ? requestAnimationFrame(loop) : 0;
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      size();
      t0 = 0;
      // Un fotograma fijo sigue siendo una composicion completa.
      if (reduce.matches) { draw(2600); return; }
      raf = requestAnimationFrame(loop);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible && !raf) start();
        else if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      }, { rootMargin: "120px" }).observe(canvas);
    }
    window.addEventListener("resize", start, { passive: true });
    reduce.addEventListener?.("change", start);

    return start;
  }

  /* ── language ────────────────────────────────────────────── */

  function initLang() {
    const saved = safeGet(LANG_KEY);
    const browser = (navigator.language || "es").slice(0, 2).toLowerCase();
    state.lang = saved === "en" || saved === "es"
      ? saved
      : (browser === "es" ? "es" : "en");

    $$(".lang button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.lang === state.lang) return;
        state.lang = btn.dataset.lang;
        safeSet(LANG_KEY, state.lang);
        applyLang();
        renderAll();
      });
    });
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    $$("[data-i18n]").forEach((el) => {
      const value = state.content?.ui?.[state.lang]?.[el.dataset.i18n];
      if (value) el.textContent = value;
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
          <ul class="signals">${line.signals.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
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
    return esc(authors).replace(SURNAME, '<span class="me">$1</span>');
  }

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

      const href = pub.doi ? `https://doi.org/${encodeURI(pub.doi)}` : pub.url;
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
            ${pub.doi ? `<p class="pub-doi"><a href="https://doi.org/${encodeURI(pub.doi)}" rel="noopener">${esc(pub.doi)}</a></p>` : ""}
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
    };

    const limit = state.content.collapse?.projects ?? 5;
    const total = state.content.projects.length;
    const visible = state.expanded.projects
      ? state.content.projects
      : state.content.projects.slice(0, limit);

    // Un proyecto que acaba este ano o mas tarde sigue vivo. Se marca,
    // porque es lo primero que se mira en una lista de proyectos.
    const ahora = new Date().getFullYear();
    const euros = new Intl.NumberFormat(
      state.lang === "es" ? "es-ES" : "en-GB",
      { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

    host.innerHTML = visible.map((p) => {
      const P = p[state.lang];
      const vivo = Number(p.to) >= ahora;
      const pi = roleLabel[p.role]
        ? `<span class="pi">${esc(roleLabel[p.role])}</span>`
        : "";
      const datos = [
        p.amount ? `<span class="amount">${esc(euros.format(Number(p.amount)))}</span>` : "",
        p.ref ? `<span class="ref">${esc(p.ref)}</span>` : "",
      ].filter(Boolean).join("");

      return `
        <article class="project${vivo ? " live" : ""}">
          <p class="when">
            <span class="years">${esc(p.from)}\u2013${esc(p.to)}</span>
            ${vivo ? `<span class="live-tag">${esc(t("proj.active"))}</span>` : ""}
          </p>
          <h3>${p.acronym ? `<span class="acronym">${esc(p.acronym)}</span>` : ""}${esc(P.title)}${pi}</h3>
          <p class="funder">${esc(p.funder)}${P.note ? ` \u2014 ${esc(P.note)}` : ""}</p>
          ${datos ? `<p class="meta">${datos}</p>` : ""}
        </article>`;
    }).join("");

    appendToggle(host, {
      total, limit, flag: "projects",
      moreKey: "more.generic", lessKey: "less.generic",
      remaining: total - limit,
      rerender: renderProjects,
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
        <div>
          <span class="line-n">${esc(A.role)}</span>
          <h3>${esc(t("atenea.h"))}</h3>
          <p class="feature-sub">${esc(A.expansion)}</p>
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

  function renderTeaching() {
    const host = $("#teaching-list");
    if (host) {
      host.innerHTML = state.content.teaching.map((c) => {
        const C = c[state.lang];
        return `<div class="course"><b>${esc(C.name)}</b><span>${esc(C.degree)}</span></div>`;
      }).join("");
    }

    const sup = $("#supervision");
    if (!sup) return;
    const theses = state.content.theses;
    sup.innerHTML = `
      <p><span class="big">${theses.length}</span>${esc(t("sup.phd"))}</p>
      <p>${esc(t("sup.note"))}</p>
      <div class="courses">
        ${theses.map((th) => `
          <div class="course">
            <b>${esc(th[state.lang])}</b>
            <span>${esc(th.student)} · ${esc(th.programme[state.lang])} · ${esc(th.from)}–</span>
          </div>`).join("")}
      </div>
      <p>${esc(t("sup.tfg"))}</p>
    `;
  }

  /* ── recognition ─────────────────────────────────────────── */

  function renderRecognition() {
    const awardsHost = $("#awards-list");
    if (awardsHost) {
      awardsHost.parentNode.querySelector(".more")?.remove();
      // Entries the scraper could not attribute by full surname are shown only
      // when the CV corroborates them (content.json → awards_confirmed_by_cv).
      const allow = state.content.awards_confirmed_by_cv || [];
      const scraped = (state.profile.awards || [])
        .filter((a) => a.confirmed || allow.some((needle) => a.text.includes(needle)))
        .map((a) => ({ year: a.year, text: a.text }));

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
        const k = Math.min(1, (now - t0) / ms);
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

  /* ── boot ────────────────────────────────────────────────── */

  function renderAll() {
    applyLang();
    renderMetrics();
    renderLines();
    renderKindChips();
    syncQualityRow();
    renderPublications();
    paintCharts();
    renderProjects();
    renderAtenea();
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
