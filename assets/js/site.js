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
      renderChart();
      state.repaintTrace?.();
    });
  }

  /* ── the trace strip ─────────────────────────────────────── */
  /* Seven oscillators whose integration window lengthens down the
     stack: slower and wider as they go. The subject of the research,
     drawn rather than illustrated. */

  function initTrace() {
    const canvas = $("#trace");
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const LAYERS = 7;
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

    function accent() {
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--accent").trim() || "#0d5c62";
    }

    function draw(time) {
      const colour = accent();
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = colour;
      ctx.lineJoin = "round";

      const mid = h / 2;
      for (let i = 0; i < LAYERS; i++) {
        const scale = 1 + i * 1.45;          // the timescale itself
        const amp = mid * (0.15 + i * 0.052);
        const freq = 0.015 / scale;
        const drift = time * 0.00013 * (1 / scale);

        ctx.globalAlpha = 0.46 - i * 0.052;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y = mid
            + Math.sin(x * freq + drift * 7) * amp
            + Math.sin(x * freq * 2.4 + drift * 4) * amp * 0.28;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function loop(time) {
      draw(time);
      raf = visible && !reduce.matches ? requestAnimationFrame(loop) : 0;
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      size();
      if (reduce.matches) { draw(0); return; }   // a still frame, still complete
      raf = requestAnimationFrame(loop);
    }

    // Stop the loop while the strip is off screen.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible && !raf) start(); else if (!visible && raf) {
          cancelAnimationFrame(raf); raf = 0;
        }
      }, { rootMargin: "120px" }).observe(canvas);
    }

    reduce.addEventListener?.("change", start);
    window.addEventListener("resize", () => {
      clearTimeout(window.__traceTimer);
      window.__traceTimer = setTimeout(start, 180);
    });

    start();
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

  function renderChart() {
    const box = $("#chart");
    if (!box || !state.profile) return;

    // Citations received per calendar year. The current year is still
    // accruing, so it is drawn muted and labelled as partial.
    const rows = (state.profile.metrics.citations_by_year || [])
      .filter((r) => r.year >= 2014);
    if (!rows.length) { box.innerHTML = ""; return; }

    const currentYear = new Date().getFullYear();
    const W = 1000, H = 260;
    const pad = { top: 26, right: 8, bottom: 30, left: 44 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const max = Math.max(...rows.map((r) => r.citations));
    // Round the top of the scale up to a clean step so the ticks read well.
    const step = max > 500 ? 200 : max > 200 ? 100 : 50;
    const top = Math.ceil(max / step) * step;

    const slot = plotW / rows.length;
    const barW = Math.min(slot * 0.62, 34);
    const y = (v) => pad.top + plotH - (v / top) * plotH;
    const fmt = nf();

    const ticks = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);

    const grid = ticks.map((v) => `
      <line x1="${pad.left}" y1="${y(v).toFixed(1)}" x2="${W - pad.right}" y2="${y(v).toFixed(1)}"
            class="grid${v === 0 ? " axis" : ""}"/>
      <text x="${pad.left - 9}" y="${(y(v) + 4).toFixed(1)}" class="tick" text-anchor="end">${fmt.format(v)}</text>
    `).join("");

    const peak = rows.reduce((a, b) => (b.citations > a.citations ? b : a), rows[0]);

    const bars = rows.map((r) => {
      const x = pad.left + slot * rows.indexOf(r) + (slot - barW) / 2;
      const h = Math.max(2, pad.top + plotH - y(r.citations));
      const partial = r.year >= currentYear;
      const label = partial
        ? (state.lang === "es" ? " (año en curso, parcial)" : " (current year, partial)")
        : "";
      // 4px rounded data-end, square against the baseline.
      const radius = Math.min(4, h / 2, barW / 2);
      return `
        <g class="bar${partial ? " partial" : ""}">
          <title>${r.year}: ${fmt.format(r.citations)} ${esc(t("chart.axis"))}${label}</title>
          <path d="M${x.toFixed(1)} ${(pad.top + plotH).toFixed(1)}
                   V${(y(r.citations) + radius).toFixed(1)}
                   a${radius} ${radius} 0 0 1 ${radius} ${-radius}
                   h${(barW - radius * 2).toFixed(1)}
                   a${radius} ${radius} 0 0 1 ${radius} ${radius}
                   V${(pad.top + plotH).toFixed(1)} Z"/>
          <rect x="${(x - 3).toFixed(1)}" y="${pad.top}" width="${(barW + 6).toFixed(1)}" height="${plotH}" fill="transparent"/>
        </g>`;
    }).join("");

    // Label only the first year, the peak and the latest: never every bar.
    const marked = new Set([rows[0].year, peak.year, rows[rows.length - 1].year]);
    const xLabels = rows.map((r, i) => {
      if (!marked.has(r.year)) return "";
      const x = pad.left + slot * i + slot / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 10}" class="tick" text-anchor="middle">${r.year}</text>`;
    }).join("");

    const peakX = pad.left + slot * rows.indexOf(peak) + slot / 2;
    const peakLabel = `
      <text x="${peakX.toFixed(1)}" y="${(y(peak.citations) - 9).toFixed(1)}"
            class="peak" text-anchor="middle">${fmt.format(peak.citations)}</text>`;

    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="${esc(t("chart.cap"))}: ${rows[0].year}–${rows[rows.length - 1].year}">
        <style>
          .grid { stroke: var(--rule); stroke-width: 1; }
          .grid.axis { stroke: var(--muted); }
          .tick { font: 400 15px var(--data); fill: var(--muted); }
          .peak { font: 500 15px var(--data); fill: var(--ink-soft); }
          .bar path { fill: var(--accent); }
          .bar.partial path { fill: var(--accent); opacity: .42; }
          .bar:hover path { fill: var(--accent-ink); }
        </style>
        ${grid}${bars}${xLabels}${peakLabel}
      </svg>
      <p class="count">${state.lang === "es"
        ? `Última barra: año en curso, incompleto · OpenAlex`
        : `Final bar: current year, incomplete · OpenAlex`}</p>
    `;
  }

  /* ── research lines ──────────────────────────────────────── */

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
    if (state.filter === "q1" && pub.quartile !== "Q1") return false;
    if (state.filter === "d1" && !pub.top_decile) return false;
    if (state.filter === "first" && !isFirstAuthor(pub)) return false;
    if (state.query) {
      const hay = `${pub.title} ${pub.journal} ${pub.authors}`.toLowerCase();
      if (!hay.includes(state.query)) return false;
    }
    return true;
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

    counter.textContent = t("pub.count")
      .replace("{n}", nf().format(visible.length))
      .replace("{total}", nf().format(all.length));

    if (!shown.length) {
      host.innerHTML = `<p class="count">${state.lang === "es"
        ? "Ningún artículo coincide con el filtro."
        : "No articles match this filter."}</p>`;
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

      const where = [
        pub.journal ? `<span class="journal">${esc(pub.journal)}</span>` : "",
        pub.volume ? `${state.lang === "es" ? "vol." : "vol."} ${esc(pub.volume)}` : "",
        pub.pages ? `pp. ${esc(pub.pages)}` : "",
      ].filter(Boolean).join(", ");

      const href = pub.doi ? `https://doi.org/${encodeURI(pub.doi)}` : pub.url;
      const title = href
        ? `<a href="${esc(href)}" rel="noopener">${esc(pub.title)}</a>`
        : esc(pub.title);

      html += `
        <article class="pub">
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
    $$(".chips button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filter = btn.dataset.filter;
        state.expanded.pubs = false;
        $$(".chips button").forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
        });
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

  /* ── contact form ────────────────────────────────────────── */
  /* The email address is deliberately absent from the page. The form
     posts to Web3Forms, which relays the message without the address
     ever appearing in the HTML. The access key is a public token. */

  function formConfigured() {
    const key = (state.content.contact_form || {}).access_key || "";
    return key && key !== "PENDIENTE";
  }

  function renderFormState() {
    const form = $("#contact-form");
    const status = $("#cf-status");
    const button = $("#cf-send");
    if (!form || !status || !button) return;

    if (formConfigured()) {
      form.classList.remove("unconfigured");
      button.disabled = false;
      if (status.dataset.state !== "sent") status.textContent = "";
      return;
    }
    // Never fail silently: say it is not wired up and point elsewhere.
    form.classList.add("unconfigured");
    button.disabled = true;
    status.textContent = t("form.nokey");
    status.className = "form-status warn";
  }

  function initForm() {
    const form = $("#contact-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!formConfigured()) return;

      const cfg = state.content.contact_form;
      const status = $("#cf-status");
      const button = $("#cf-send");
      const data = new FormData(form);

      // The honeypot is invisible, so only a bot fills it.
      if (data.get("botcheck")) {
        status.textContent = t("form.ok");
        form.reset();
        return;
      }
      data.delete("botcheck");
      data.append("access_key", cfg.access_key);
      if (!data.get("subject")) data.set("subject", "Mensaje desde la web");

      button.disabled = true;
      status.className = "form-status";
      status.textContent = t("form.sending");

      try {
        const res = await fetch(cfg.endpoint, { method: "POST", body: data });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.success) {
          form.reset();
          status.className = "form-status ok";
          status.textContent = t("form.ok");
          status.dataset.state = "sent";
        } else {
          throw new Error(body.message || `HTTP ${res.status}`);
        }
      } catch (err) {
        console.error("Contact form failed:", err);
        status.className = "form-status err";
        status.textContent = t("form.err");
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ── boot ────────────────────────────────────────────────── */

  function renderAll() {
    applyLang();
    renderMetrics();
    renderChart();
    renderLines();
    renderPublications();
    renderProjects();
    renderAtenea();
    renderTeaching();
    renderRecognition();
    renderFormState();
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
    initForm();
    renderAll();

    window.addEventListener("jgp:skinchange", () => {
      renderChart();
      state.repaintTrace?.();
    });

    window.addEventListener("resize", () => {
      clearTimeout(window.__chartTimer);
      window.__chartTimer = setTimeout(renderChart, 180);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
