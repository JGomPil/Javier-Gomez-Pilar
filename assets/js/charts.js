/* Gráficos interactivos, al estilo del Portal de la Ciencia de la UVa.
 *
 * Decisiones que conviene conocer antes de tocar esto:
 *
 * - ECharts se carga SOLO cuando el primer gráfico entra en pantalla. Pesa
 *   1 MB y la página entera pesa 60 KB: cargarlo de entrada seria regalar
 *   el tiempo de carga a quien quizá no baje nunca hasta aquí.
 *
 * - Los colores no están escritos aquí dos veces. Se leen de las variables
 *   CSS, de modo que el modo claro y el oscuro no se pueden desincronizar
 *   del resto de la página. Las dos paletas de serie están validadas para
 *   daltonismo (deutan, protan y tritan) en todos los pares, no solo en los
 *   adyacentes.
 *
 * - Las publicaciones se agrupan en TRES series, no en las seis categorías
 *   de GIB. Con cinco o seis colores es imposible mantener la separación
 *   para daltonismo; el desglose fino está en los filtros de la lista.
 */
(function () {
  "use strict";

  const ECHARTS_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js";

  /* Las tres series y las categorías de GIB que agrupa cada una. */
  const GROUPS = [
    { key: "journal", kinds: ["journal", "journal_other"], slot: 0 },
    { key: "confs",   kinds: ["conf_int", "conf_nat"],     slot: 1 },
    { key: "other",   kinds: ["book", "conf_teach"],       slot: 2 },
  ];

  let ctx = null;          // { profile, content, lang, onYearClick }
  let charts = [];         // instancias vivas, para redibujar y redimensionar
  let loading = null;      // promesa de carga de ECharts
  let failed = false;

  /* Los textos viven en data/content.json, igual que el resto de la
     pagina: una sola fuente, nada que desincronizar. */
  const esc = (v) => String(v).replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  const t = (key) => ctx?.content?.ui?.[ctx.lang]?.[key]
                  || ctx?.content?.ui?.es?.[key] || key;

  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
    return v || fallback;
  }

  function isDark() {
    const set = document.documentElement.dataset.theme;
    if (set) return set === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  /* Paletas de serie validadas contra el fondo real de cada modo.
     Claro  (#cfd7dc): azul #1d4ed8, naranja #c2410c, verde #15803d
     Oscuro (#0e1621): azul #3b82f6, ámbar #d97706, verde #16a34a */
  function series() {
    return isDark()
      ? ["#3b82f6", "#d97706", "#16a34a"]
      : ["#1d4ed8", "#c2410c", "#15803d"];
  }

  /* Rampa de un solo tono para lo ordinal (cuartiles, antigüedad del rol):
     una escala secuencial, nunca tonos distintos. */
  function ramp(n) {
    const dark = isDark();
    const stops = dark
      ? ["#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"]
      : ["#1e3a8a", "#1d4ed8", "#60a5fa", "#bfdbfe"];
    return Array.from({ length: n }, (_, i) =>
      stops[Math.round(i * (stops.length - 1) / Math.max(1, n - 1))]);
  }

  function base() {
    const ink = css("--ink", "#121d2b");
    const muted = css("--muted", "#62748a");
    const rule = css("--rule-soft", "#b8c3cb");
    const paper = css("--paper", "#cfd7dc");
    const data = "IBM Plex Mono, ui-monospace, monospace";

    return {
      textStyle: { fontFamily: css("--reading", "Inter, sans-serif"), color: ink },
      grid: { left: 2, right: 16, top: 8, bottom: 0, containLabel: true },
      tooltip: {
        backgroundColor: paper,
        borderColor: rule,
        borderWidth: 1,
        padding: [8, 11],
        textStyle: { color: ink, fontSize: 12,
                     fontFamily: css("--reading", "Inter, sans-serif") },
        extraCssText: "box-shadow: 0 6px 24px rgba(0,0,0,.14); border-radius: 0;",
      },
      axisCommon: {
        axisLine: { lineStyle: { color: rule } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: rule, type: [3, 4] } },
        axisLabel: { color: muted, fontSize: 10, fontFamily: data },
      },
      legend: {
        top: 0, left: 0, itemGap: 16, itemWidth: 10, itemHeight: 10,
        icon: "roundRect",
        textStyle: { color: css("--ink-soft", "#35475a"), fontSize: 11,
                     fontFamily: data },
      },
      ink, muted, rule, paper, data,
    };
  }

  /* ── carga perezosa ─────────────────────────────────────────── */

  function loadECharts() {
    if (window.echarts) return Promise.resolve(window.echarts);
    if (loading) return loading;

    loading = new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = ECHARTS_URL;
      tag.async = true;
      tag.onload = () => window.echarts ? resolve(window.echarts)
                                        : reject(new Error("echarts ausente"));
      tag.onerror = () => reject(new Error("no se pudo cargar echarts"));
      document.head.appendChild(tag);
    });
    return loading;
  }

  function mount(host, build) {
    const chart = window.echarts.init(host, null, { renderer: "svg" });
    chart.setOption(build());
    charts.push({ chart, host, build });
    return chart;
  }

  /* ── 1. producción por año y tipo ───────────────────────────── */

  function chartOutput(host) {
    const pubs = ctx.profile.publications;
    const years = [...new Set(pubs.map((p) => p.year))].sort();
    const colours = series();
    const b = base();

    const data = GROUPS.map((g) => years.map((y) =>
      pubs.filter((p) => p.year === y && g.kinds.includes(p.kind || "journal")).length));

    mount(host, () => ({
      ...b,
      color: colours,
      legend: { ...b.legend, data: GROUPS.map((g) => t("g." + g.key)) },
      tooltip: { ...b.tooltip, trigger: "axis",
                 axisPointer: { type: "shadow" },
                 order: "seriesDesc" },
      grid: { ...b.grid, top: 34 },
      xAxis: { type: "category", data: years, ...b.axisCommon,
               splitLine: { show: false } },
      yAxis: { type: "value", ...b.axisCommon, minInterval: 1 },
      series: GROUPS.map((g, i) => ({
        name: t("g." + g.key),
        type: "bar",
        stack: "total",
        data: data[i],
        barMaxWidth: 26,
        // 2px de hueco entre segmentos: se leen como piezas, no como un bloque.
        itemStyle: { borderColor: b.paper, borderWidth: 2 },
        emphasis: { focus: "series" },
      })),
      animationDuration: 700,
    }));

    charts[charts.length - 1].chart.on("click", (ev) => {
      if (ev.componentType === "series") ctx.onYearClick?.(years[ev.dataIndex]);
    });
  }

  /* ── 2. red de coautoría ────────────────────────────────────── */

  function chartNetwork(host) {
    const net = ctx.profile.collaboration;
    if (!net?.nodes?.length) return false;
    const b = base();
    const max = Math.max(...net.nodes.map((n) => n.works));

    // Grado = coautores distintos con los que comparte trabajos DENTRO de
    // esta red. Es una magnitud, asi que rampa de un solo tono, nunca
    // tonos distintos.
    const degree = net.nodes.map(() => 0);
    net.links.forEach((l) => { degree[l.source]++; degree[l.target]++; });
    const maxDeg = Math.max(1, ...degree);
    const steps = ramp(5);
    const tone = (d) => steps[steps.length - 1
      - Math.min(steps.length - 1, Math.floor((d / maxDeg) * steps.length))];

    mount(host, () => ({
      ...b,
      tooltip: {
        ...b.tooltip,
        formatter: (p) => p.dataType === "node"
          ? `<b>${p.data.name}</b><br>${p.data.works} ${t("g.net.works")}`
            + `<br>${p.data.degree} ${t("g.net.degree")}`
          : "",
      },
      series: [{
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        force: { repulsion: 260, edgeLength: [40, 120], gravity: 0.12 },
        data: net.nodes.map((n, i) => ({
          name: n.name,
          works: n.works,
          degree: degree[i],
          // El tamano codifica trabajos conjuntos; el color, el grado.
          symbolSize: 9 + Math.sqrt(n.works / max) * 27,
          itemStyle: { color: tone(degree[i]),
                       borderColor: b.paper, borderWidth: 1 },
          label: {
            show: n.works >= max * 0.28,     // solo los centrales llevan nombre
            position: "right",
            color: b.ink,
            fontSize: 10,
            fontFamily: b.data,
            formatter: (p) => p.data.name,
          },
        })),
        links: net.links.map((l) => ({
          source: l.source, target: l.target,
          lineStyle: { width: Math.min(3, 0.4 + l.weight * 0.12), opacity: 0.22 },
        })),
        lineStyle: { color: b.muted, curveness: 0.08 },
        emphasis: {
          focus: "adjacency",
          label: { show: true, color: b.ink, fontSize: 11 },
          lineStyle: { opacity: 0.7, width: 2 },
        },
        scaleLimit: { min: 0.6, max: 3 },
      }],
      graphic: [{
        type: "group",
        right: 4, bottom: 2,
        children: [
          { type: "text", left: 0, top: 0,
            style: { text: t("g.net.legend"), fill: b.muted, fontSize: 9,
                     fontFamily: b.data } },
          ...steps.map((c, i) => ({
            type: "rect", left: i * 13, top: 13,
            shape: { width: 11, height: 5 },
            style: { fill: c },
          })),
        ],
        silent: true,
      }],
      animationDuration: 900,
    }));
    return true;
  }

  /* ── 3. cuartiles ───────────────────────────────────────────── */

  function chartQuartiles(host) {
    const q = ctx.profile.metrics.quartiles || {};
    const keys = ["Q1", "Q2", "Q3", "Q4"].filter((k) => q[k]);
    if (!keys.length) return false;
    const b = base();
    const colours = ramp(keys.length);
    const total = keys.reduce((s, k) => s + q[k], 0);

    mount(host, () => ({
      ...b,
      color: colours,
      tooltip: { ...b.tooltip, trigger: "item",
                 formatter: (p) => `<b>${p.name}</b><br>${p.value} · ${p.percent}%` },
      legend: { ...b.legend, orient: "vertical", right: 0, top: "middle",
                left: "auto", data: keys },
      series: [{
        type: "pie",
        radius: ["52%", "78%"],
        center: ["38%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: b.paper, borderWidth: 2 },
        label: { show: false },
        emphasis: {
          scaleSize: 6,
          label: { show: true, formatter: "{b}\n{c}", color: b.ink,
                   fontSize: 13, fontFamily: b.data, lineHeight: 18 },
        },
        data: keys.map((k) => ({ name: k, value: q[k] })),
      }],
      graphic: [{
        type: "text", left: "35%", top: "middle",
        style: { text: String(total), fill: b.ink, fontSize: 26,
                 fontFamily: css("--display", "Manrope, sans-serif"),
                 fontWeight: 800, textAlign: "center" },
        silent: true,
      }],
      animationDuration: 700,
    }));
    return true;
  }

  /* ── 4. citas por año ───────────────────────────────────────── */

  function chartCitations(host) {
    const rows = ctx.profile.metrics.citations_by_year || [];
    if (rows.length < 3) return false;
    const b = base();
    const colour = css("--accent", "#1b4ea8");
    const thisYear = new Date().getFullYear();

    mount(host, () => ({
      ...b,
      tooltip: {
        ...b.tooltip, trigger: "axis",
        formatter: (ps) => {
          const p = ps[0];
          const partial = Number(p.name) >= thisYear
            ? ` · ${t("g.cites.partial")}` : "";
          return `<b>${p.name}</b><br>${p.value}${partial}`;
        },
      },
      grid: { ...b.grid, right: 22 },   // sitio para la etiqueta del último año
      xAxis: { type: "category", data: rows.map((r) => r.year),
               ...b.axisCommon, boundaryGap: false,
               splitLine: { show: false },
               axisLabel: { ...b.axisCommon.axisLabel,
                            showMaxLabel: true, margin: 10 } },
      yAxis: { type: "value", ...b.axisCommon },
      series: [{
        type: "line",
        data: rows.map((r) => r.citations),
        smooth: 0.25,
        symbol: "circle",
        symbolSize: 8,
        showSymbol: false,
        lineStyle: { width: 2, color: colour },
        itemStyle: { color: colour, borderColor: b.paper, borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: colour + "44" },
              { offset: 1, color: colour + "04" },
            ],
          },
        },
        emphasis: { focus: "series" },
      }],
      animationDuration: 800,
    }));
    return true;
  }

  /* ── 5. proyectos en el tiempo ──────────────────────────────── */

  function chartProjects(host) {
    const projects = (ctx.content.projects || [])
      .filter((p) => p.from && p.to)
      .map((p) => ({ ...p, from: Number(p.from), to: Number(p.to) }))
      .sort((a, b2) => a.from - b2.from || a.to - b2.to);
    if (!projects.length) return false;

    const b = base();
    /* No todos los proyectos tienen acronimo. Antes de dejar la fila en
       blanco, se prueba la referencia de la convocatoria y, en ultimo
       termino, el arranque del titulo. */
    function rotulo(p) {
      if (p.acronym) return p.acronym;
      if (p.ref) return p.ref.split("-")[0];
      const titulo = (p[ctx.lang] || p.es || {}).title || "";
      const corto = titulo.split(/\s+/).slice(0, 3).join(" ");
      return corto.length > 22 ? corto.slice(0, 21) + "\u2026" : corto;
    }
    // El rol es ordinal (IP > co-IP > investigador): rampa de un tono.
    const ROLES = ["ip", "co-ip", "researcher"];
    const colours = ramp(3);
    const tone = (role) => colours[Math.max(0, ROLES.indexOf(role))];

    const from = Math.min(...projects.map((p) => p.from));
    const to = Math.max(...projects.map((p) => p.to));

    mount(host, () => ({
      ...b,
      tooltip: {
        ...b.tooltip, trigger: "item",
        formatter: (p) => {
          const d = projects[p.dataIndex];
          if (!d) return "";
          const titulo = (d[ctx.lang] || d.es || {}).title || "";
          return `<b>${esc(rotulo(d))}</b><br>${d.from}\u2013${d.to}`
            + `<br>${esc(titulo)}`
            + `<br>${t("g.role." + d.role)} · ${esc(d.funder)}`
            + (d.ref ? `<br><span style="opacity:.6">${esc(d.ref)}</span>` : "");
        },
      },
      legend: {
        ...b.legend,
        data: ROLES.map((r) => t("g.role." + r)),
        selectedMode: false,
      },
      grid: { ...b.grid, top: 34, left: 2 },
      xAxis: { type: "value", min: from, max: to + 1, ...b.axisCommon,
               minInterval: 1, axisLabel: { ...b.axisCommon.axisLabel,
                                            formatter: (v) => String(v) } },
      yAxis: {
        type: "category",
        data: projects.map(rotulo),
        inverse: true,
        ...b.axisCommon,
        splitLine: { show: false },
        axisLabel: { ...b.axisCommon.axisLabel, fontSize: 10 },
      },
      // Serie invisible que desplaza cada barra hasta su año de inicio.
      // Tiene que ser el año absoluto: el eje va de 2012 a 2027, y un
      // desplazamiento relativo (0..N) cae fuera de ese rango y no pinta.
      series: [
        { type: "bar", stack: "x", silent: true,
          itemStyle: { color: "transparent" },
          data: projects.map((p) => p.from) },
        { type: "bar", stack: "x", barMaxWidth: 14,
          data: projects.map((p) => ({
            value: p.to - p.from + 1,
            itemStyle: { color: tone(p.role) },
          })),
          emphasis: { focus: "self" } },
        // Solo para la leyenda: tres entradas sin datos.
        ...ROLES.map((r) => ({
          name: t("g.role." + r), type: "bar", stack: "leyenda",
          data: [], itemStyle: { color: tone(r) },
        })),
      ],
      animationDuration: 700,
    }));
    return true;
  }

  /* ── 6. paises de colaboracion ─────────────────── */

  function chartCountries(host) {
    const rows = ctx.profile.countries || [];
    if (!rows.length) return false;
    const b = base();
    const colour = css("--accent", "#1b4ea8");
    const max = rows[0].works;

    // Barras horizontales: los nombres de pais se leen de corrido y no
    // hay que girar la cabeza.
    const shown = rows.slice(0, 14).slice().reverse();

    mount(host, () => ({
      ...b,
      grid: { ...b.grid, left: 2, right: 34, top: 6, bottom: 2 },
      tooltip: {
        ...b.tooltip, trigger: "item",
        formatter: (pt) => `<b>${esc(pt.name)}</b><br>${pt.value} `
          + `${t("g.countries.works")}`,
      },
      xAxis: { type: "value", ...b.axisCommon, minInterval: 1,
               axisLabel: { show: false }, axisLine: { show: false },
               splitLine: { lineStyle: { color: b.rule, type: [3, 4] } } },
      yAxis: {
        type: "category",
        data: shown.map((r) => r.name),
        ...b.axisCommon,
        splitLine: { show: false },
        axisLabel: { ...b.axisCommon.axisLabel, fontSize: 11,
                     fontFamily: css("--reading", "Inter, sans-serif") },
      },
      series: [{
        type: "bar",
        data: shown.map((r) => ({
          value: r.works,
          // Un solo tono, mas intenso cuanto mas peso: es magnitud.
          itemStyle: { color: colour, opacity: 0.32 + 0.68 * (r.works / max) },
        })),
        barMaxWidth: 16,
        label: {
          show: true, position: "right",
          color: b.muted, fontSize: 10, fontFamily: b.data,
          formatter: "{c}",
        },
        emphasis: { itemStyle: { color: colour, opacity: 1 } },
      }],
      animationDuration: 700,
    }));
    return true;
  }

  /* ── montaje ────────────────────────────────────────────────── */

  const BUILDERS = {
    "chart-output": chartOutput,
    "chart-network": chartNetwork,
    "chart-quartiles": chartQuartiles,
    "chart-citations": chartCitations,
    "chart-projects": chartProjects,
    "chart-countries": chartCountries,
  };

  const built = new Set();

  function note(host, message) {
    host.innerHTML = `<p class="chart-note">${esc(message)}</p>`;
  }

  /* Oculta la pestana de un grafico que no tiene datos, en lugar de
     dejar un panel vacio al que se puede entrar. */
  function hideTab(host) {
    const panel = host.closest('[role="tabpanel"]');
    if (!panel) { host.remove(); return; }
    const tab = document.getElementById(
      panel.getAttribute("aria-labelledby") || "");
    panel.remove();
    tab?.remove();
  }

  /* Un contenedor oculto mide cero, y ECharts no puede dibujar en cero.
     De ahi que cada grafico se construya la primera vez que su panel se
     hace visible, y se redimensione en las siguientes. */
  function ensure(host) {
    if (!window.echarts || !ctx) return;
    if (!host.offsetWidth) return;              // sigue oculto

    if (built.has(host.id)) {
      charts.find((c) => c.host === host)?.chart.resize();
      return;
    }
    const fn = BUILDERS[host.id];
    if (!fn) return;
    built.add(host.id);
    try {
      host.innerHTML = "";
      if (fn(host) === false) hideTab(host);
    } catch (err) {
      console.error(`chart ${host.id} failed:`, err);
      note(host, t("g.failed"));
    }
  }

  function build() {
    document.querySelectorAll("[data-chart]").forEach(ensure);
  }

  function status(message) {
    document.querySelectorAll("[data-chart]").forEach((host) => {
      if (!host.firstChild) note(host, message);
    });
  }

  function start() {
    if (failed) return;
    status(t("g.loading"));
    loadECharts().then(() => { build(); })
      .catch((err) => {
        failed = true;
        console.error("echarts:", err);
        status(t("g.failed"));
      });
  }

  let armed = false;
  function arm() {
    if (armed) return;
    armed = true;

    const first = document.querySelector("[data-chart]");
    if (!first) return;

    if (!("IntersectionObserver" in window)) { start(); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      start();
    }, { rootMargin: "320px" });

    // Vigila un contenedor por seccion, no solo el primero: si alguien
    // entra directo a #projects, sus graficos tambien deben cargarse.
    document.querySelectorAll("[data-chart]").forEach((host) => io.observe(host));
  }

  // Un panel recien mostrado ya puede medirse.
  window.addEventListener("jgp:tabshown", (ev) => {
    ev.detail?.querySelectorAll?.("[data-chart]").forEach(ensure);
  });

  window.addEventListener("resize", () => {
    charts.forEach(({ chart }) => chart.resize());
  }, { passive: true });

  window.JGPCharts = {
    render(context) {
      ctx = context;
      arm();
      // Tema o idioma cambiados: se reconstruyen con los colores nuevos.
      if (window.echarts && charts.length) {
        charts.forEach(({ chart }) => chart.dispose());
        charts = [];
        built.clear();
        build();
      }
    },
  };
})();
