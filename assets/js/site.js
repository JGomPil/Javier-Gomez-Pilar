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

  /* Un EEG, no una onda decorativa. Seis derivaciones del montaje
     longitudinal, cada una con su propia mezcla de ritmos: delta y theta
     de fondo, husos de alfa que aparecen y se van, beta rapido encima y
     alguna punta aislada. El trazado corre hacia la izquierda como en un
     registro real. */
  function initTrace() {
    const canvas = $("#trace");
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const CHANNELS = [
      { label: "Fp1-F3", alpha: 0.22, beta: 0.55, theta: 0.80, spikes: 0.00 },
      { label: "F3-C3",  alpha: 0.45, beta: 0.40, theta: 0.60, spikes: 0.00 },
      { label: "C3-P3",  alpha: 0.70, beta: 0.30, theta: 0.45, spikes: 0.35 },
      { label: "P3-O1",  alpha: 1.00, beta: 0.22, theta: 0.35, spikes: 0.00 },
      { label: "T3-T5",  alpha: 0.35, beta: 0.48, theta: 0.70, spikes: 0.55 },
      { label: "Fz-Cz",  alpha: 0.30, beta: 0.52, theta: 0.75, spikes: 0.00 },
    ];
    const SPEED = 42;          // pixeles por segundo, como la velocidad de barrido
    const STEP = 1.5;          // resolucion horizontal del trazo

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0, h = 0, raf = 0, visible = true;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function token(name, fallback) {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim() || fallback;
    }

    /* Ruido suave y reproducible: suma de senoides inconmensurables, de
       modo que el trazo no se repita a la vista pero sea el mismo en cada
       fotograma para una misma posicion. */
    function band(t, seed, freq, n) {
      let v = 0;
      for (let k = 1; k <= n; k++) {
        v += Math.sin(t * freq * (1 + k * 0.37) + seed * (k + 1.7)) / k;
      }
      return v / n;
    }

    /* Los husos de alfa van y vienen: una envolvente lenta que pasa por
       cero, como en un registro con ojos cerrados de forma intermitente. */
    function spindle(t, seed) {
      const env = Math.sin(t * 0.21 + seed) * Math.sin(t * 0.073 + seed * 2.1);
      return Math.max(0, env);
    }

    function draw(elapsed) {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = token("--accent", "#1b4ea8");
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      const rows = CHANNELS.length;
      const pad = h * 0.07;
      const labels = w > 460;            // en movil estorban mas que informan
      const left = labels ? 54 : 0;
      const lane = (h - pad * 2) / rows;
      const gain = lane * 0.40;
      const shift = elapsed * SPEED / 1000;

      if (labels) {
        ctx.save();
        ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = token("--muted", "#62748a");
        ctx.textBaseline = "middle";
        CHANNELS.forEach((ch, i) => {
          ctx.fillText(ch.label, 0, pad + lane * (i + 0.5));
        });
        ctx.restore();
      }

      CHANNELS.forEach((ch, i) => {
        const mid = pad + lane * (i + 0.5);
        const seed = i * 2.7 + 1.3;

        ctx.globalAlpha = 0.30 + (rows - i) * 0.035;
        ctx.beginPath();

        for (let x = left; x <= w; x += STEP) {
          const t = (x + shift) / 26;        // tiempo en el eje horizontal

          // Delta y theta: el fondo lento sobre el que va todo lo demas.
          let v = band(t, seed, 0.30, 2) * ch.theta * 1.05
                + band(t, seed + 9, 0.12, 2) * 0.55;

          // Alfa en husos, el ritmo dominante en las derivaciones posteriores.
          v += Math.sin(t * 2.05 + seed) * spindle(t, seed) * ch.alpha * 0.95;

          // Beta: la textura rapida de poca amplitud.
          v += band(t, seed + 21, 4.4, 2) * ch.beta * 0.30;

          // Alguna punta aislada, estrecha y de amplitud alta.
          if (ch.spikes) {
            const phase = (t * 0.085 + seed * 0.31) % 1;
            if (phase < 0.03) {
              const k = phase / 0.03;
              v -= Math.sin(k * Math.PI) * ch.spikes * 2.3;
            }
          }

          const y = mid + v * gain;
          if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
    }

    let t0 = 0;
    function loop(time) {
      if (!t0) t0 = time;
      draw(time - t0);
      raf = visible && !reduce.matches ? requestAnimationFrame(loop) : 0;
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      size();
      t0 = 0;
      if (reduce.matches) { draw(0); return; }   // un fotograma fijo, completo
      raf = requestAnimationFrame(loop);
    }

    // Para el bucle mientras la franja esta fuera de pantalla.
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
          <span class="line-n">${String(i + 1).padStart(2, "0")}</span>
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
        renderPublications();
      });
    });
  }

  function renderPublications() {
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
      if (kind !== "journal" && !badges.length) {
        badges.push(`<span class="q kind">${esc(t("k." + kind))}</span>`);
      }

      const where = [
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

    host.innerHTML = visible.map((p) => {
      const P = p[state.lang];
      const pi = roleLabel[p.role]
        ? `<span class="pi">${esc(roleLabel[p.role])}</span>`
        : "";
      return `
        <article class="project">
          <h3>${p.acronym ? `<span class="acronym">${esc(p.acronym)}</span>` : ""}${esc(P.title)}${pi}</h3>
          <p>${esc(p.funder)}${P.note ? ` — ${esc(P.note)}` : ""}</p>
          <p class="when">${esc(p.from)}–${esc(p.to)}</p>
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
        .map((s) => `<li>${esc(s[state.lang])}</li>`).join("");
    }

    const ipHost = $("#ip-list");
    if (ipHost) {
      ipHost.innerHTML = state.content.ip
        .map((s) => `<li>${esc(s[state.lang])}</li>`).join("");
    }
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
