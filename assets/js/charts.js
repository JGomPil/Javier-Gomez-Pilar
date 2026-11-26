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
  /* Rampa ordinal de un solo tono.
   *
   * El extremo claro de la version anterior (#bfdbfe) tenia 1,1:1 de
   * contraste contra el papel de este tema: practicamente invisible.
   * Ambas escalas estan recortadas para que su extremo mas debil
   * siga despegando del fondo, y validadas con el comprobador de
   * paleta contra la superficie de cada tema.
   */
  function ramp(n) {
    const stops = isDark()
      ? ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6"]
      : ["#172554", "#1e3a8a", "#1e40af", "#1d4ed8", "#2563eb", "#3b82f6"];
    if (n === 1) return [stops[isDark() ? 3 : 2]];
    return Array.from({ length: n }, (_, i) =>
      stops[Math.round(i * (stops.length - 1) / (n - 1))]);
  }

  /* Un tono aparte, calido, para lo que no es un escalon mas de la
     rampa sino una marca sobre ella: el primer decil dentro del Q1. */
  function mark() {
    return isDark() ? "#f59e0b" : "#b45309";
  }

  function base() {
    const ink = css("--ink", "#121d2b");
    const muted = css("--muted", "#62748a");
    const rule = css("--rule-soft", "#b8c3cb");
    const paper = css("--paper", "#cfd7dc");
    const surface = css("--surface", "#dde3e7");
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
        // A 10 px no se leen en un panel que ocupa media pantalla.
        axisLabel: { color: muted, fontSize: 12, fontFamily: data },
      },
      legend: {
        top: 0, left: 0, itemGap: 16, itemWidth: 10, itemHeight: 10,
        icon: "roundRect",
        textStyle: { color: css("--ink-soft", "#35475a"), fontSize: 11,
                     fontFamily: data },
      },
      ink, muted, rule, paper, surface, data,
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

  function mount(host, build, renderer) {
    const chart = window.echarts.init(host, null,
                                      { renderer: renderer || "svg" });
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
    const minDeg = Math.min(...degree, maxDeg);

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
        dimensions: ["name", "degree"],
        data: net.nodes.map((n, i) => ({
          name: n.name,
          works: n.works,
          degree: degree[i],
          value: degree[i],
          // El tamano codifica trabajos conjuntos; el color, el grado.
          symbolSize: 9 + Math.sqrt(n.works / max) * 27,
          // El color lo pone la barra de abajo, a partir de "value".
          itemStyle: { borderColor: b.paper, borderWidth: 1 },
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
      /* Una barra de color de verdad, con sus extremos numerados, en
         lugar de los circulitos de antes: aquellos crecian de tamano
         de izquierda a derecha mientras el color iba al reves, de
         modo que parecian decir dos cosas a la vez y ninguna era el
         grado. El tono es el calido del resto de la pagina. */
      visualMap: {
        type: "continuous",
        min: minDeg,
        max: maxDeg,
        // Sin "dimension": el dato de cada nodo es un escalar
        // ("value" = grado) y apuntar a la dimension 1 dejaba el
        // mapeo en NaN, es decir, todos los nodos fuera de rango y
        // sin pintar.
        seriesIndex: 0,
        calculable: false,
        orient: "horizontal",
        right: 10,
        bottom: 6,
        itemWidth: 11,
        itemHeight: 120,
        text: [String(maxDeg), String(minDeg)],
        textGap: 8,
        textStyle: { color: b.muted, fontSize: 11, fontFamily: b.data },
        inRange: { color: isDark() ? CALIDA_OSCURA : CALIDA_CLARA },
      },
      graphic: [{
        type: "text", right: 10, bottom: 30, silent: true,
        style: { text: t("g.net.degree"), fill: b.muted, fontSize: 11,
                 textAlign: "right",
                 font: `11px ${css("--ui", "Inter, sans-serif")}` },
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
    const d1 = q.D1 || 0;
    const CENTRO = ["40%", "50%"];

    const leyenda = keys.slice();
    if (d1) leyenda.push(t("g.q.d1"));

    const series = [{
      type: "pie",
      radius: ["48%", "72%"],
      center: CENTRO,
      avoidLabelOverlap: true,
      itemStyle: { borderColor: b.paper, borderWidth: 2 },
      label: { show: false },
      emphasis: {
        scaleSize: 6,
        label: { show: true, formatter: "{b}\n{c}", color: b.ink,
                 fontSize: 13, fontFamily: b.data, lineHeight: 18 },
      },
      data: keys.map((k, i) => ({ name: k, value: q[k],
                                  itemStyle: { color: colours[i] } })),
    }];

    /* El primer decil es un subconjunto del Q1, no un quinto cuartil.
       Por eso no entra en el anillo: va en un arco fino por fuera, que
       arranca donde arranca el Q1 y cubre solo su parte de decil. Asi
       se lee lo que es, "de estos 44 Q1, 16 son primer decil", y no
       "hay 16 articulos mas". */
    if (d1) {
      series.push({
        type: "pie",
        radius: ["76%", "82%"],
        center: CENTRO,
        silent: false,
        itemStyle: { borderWidth: 0 },
        labelLine: { show: false },
        // Con su porcentaje, como los demas: es el mismo
        // denominador, los articulos JCR.
        tooltip: { ...b.tooltip, trigger: "item",
                   formatter: () => `<b>${esc(t("g.q.d1"))}</b><br>${d1}`
                     + ` \u00b7 ${(d1 / total * 100).toFixed(1)}%` },
        label: { show: false },
        data: [
          { name: t("g.q.d1"), value: d1, itemStyle: { color: mark() } },
          { name: "", value: total - d1,
            itemStyle: { color: "transparent" },
            tooltip: { show: false } },
        ],
      });
    }

    mount(host, () => ({
      ...b,
      tooltip: { ...b.tooltip, trigger: "item",
                 formatter: (p) => `<b>${p.name}</b><br>${p.value} \u00b7 ${p.percent}%` },
      legend: { ...b.legend, orient: "vertical", right: 0, top: "middle",
                left: "auto", data: leyenda },
      series,
      /* El total iba como "graphic" anclado por su borde izquierdo, de
         modo que quedaba descentrado justo por media palabra. El
         componente "title" si admite textAlign, que convierte "left"
         en el punto medio del texto. */
      title: {
        text: String(total),
        subtext: t("m.jcr"),
        left: CENTRO[0], top: "center",
        textAlign: "center", textVerticalAlign: "middle",
        itemGap: 2,
        textStyle: { color: b.ink, fontSize: 28,
                     fontFamily: css("--display", "Manrope, sans-serif"),
                     fontWeight: 800 },
        subtextStyle: { color: b.muted, fontSize: 10, align: "center",
                        fontFamily: css("--ui", "Inter, sans-serif") },
      },
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
        label: {
          show: true,
          position: "top",
          fontSize: 12,
          fontFamily: b.data,
          color: b.ink,
          // Solo el ultimo: un numero sobre cada punto es ruido.
          formatter: (pt) => (pt.dataIndex === rows.length - 1
            ? String(pt.value) : ""),
        },
        labelLayout: { hideOverlap: true },
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
      const etq = p.label;           // cadena unica: un rotulo no se traduce
      if (etq) return etq;
      if (p.ref) return p.ref.split("-")[0];
      const titulo = (p[ctx.lang] || p.es || {}).title || "";
      const corto = titulo.split(/\s+/).slice(0, 3).join(" ");
      return corto.length > 22 ? corto.slice(0, 21) + "\u2026" : corto;
    }
    // El rol es ordinal (IP > co-IP > director > investigador): rampa
    // de un tono. "director" es el del trabajo de investigacion de un
    // contrato predoctoral, que no es IP de un proyecto pero tampoco
    // uno mas del equipo. Sin el en la lista caia al indice 0 y salia
    // pintado y rotulado como investigador principal.
    const ROLES = ["ip", "co-ip", "director", "researcher"];
    const colours = ramp(ROLES.length);
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
        data: ROLES.filter((r) => projects.some((p) => p.role === r))
                   .map((r) => t("g.role." + r)),
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
        // Solo para la leyenda: una entrada sin datos por rol presente.
        ...ROLES.filter((r) => projects.some((p) => p.role === r)).map((r) => ({
          name: t("g.role." + r), type: "bar", stack: "leyenda",
          data: [], itemStyle: { color: tone(r) },
        })),
      ],
      animationDuration: 700,
    }));
    return true;
  }

  /* ── 6. colaboracion por pais: mapa y lista ──── */

  const GEO_URL = "data/world.json";
  let geoCargado = null;

  /* Las instituciones se pintan en naranja y los paises en azul, que
     es como se distingue de un vistazo en que vista estamos. Dentro
     del naranja, cinco pasos de claro a oscuro segun cuantos
     trabajos en comun: el tamano ya lo dice, y el color lo repite,
     que es redundancia a proposito y no identidad por color. */
  /* Las cuatro rampas pasan el validador del cuaderno de estilo
     contra la superficie real de los graficos (#e9edf0 en claro,
     #192536 en oscuro): un solo tono, claridad monotona, escalones
     que se distinguen y un extremo claro que no se pierde en el
     fondo. El primer intento no pasaba: los naranjas palidos tenian
     1,34 de contraste sobre este gris y desaparecian. */
  const CALIDA_CLARA = ["#db8f52", "#c87533", "#ad5c1c", "#8f4510", "#713207"];
  const CALIDA_OSCURA = ["#8a5526", "#a86a2f", "#c8843e", "#e3a35e", "#f3c091"];

  const FRIA_CLARA = ["#8ba6d2", "#6788c0", "#456aa9", "#2a4d8c", "#17356b"];
  const FRIA_OSCURA = ["#3d5c90", "#5178b0", "#6b95ce", "#8bb0e4", "#aecbf4"];

  function paso(n, tope, rampa) {
    const k = Math.min(rampa.length - 1,
      Math.floor(Math.sqrt(n / Math.max(1, tope)) * rampa.length));
    return rampa[Math.max(0, k)];
  }

  const tonoCentro = (n, tope) =>
    paso(n, tope, isDark() ? CALIDA_OSCURA : CALIDA_CLARA);
  const tonoPais = (n, tope) =>
    paso(n, tope, isDark() ? FRIA_OSCURA : FRIA_CLARA);

  /* Natural Earth 110m, de dominio publico, recortado a lo que hace
     falta: el codigo ISO alfa-2 en properties.name — que es por donde
     casa con OpenAlex, sin depender de como escriba cada fuente el
     nombre del pais —, las coordenadas a dos decimales y el punto
     representativo de cada pais para colocar su burbuja. */
  function loadGeo() {
    if (geoCargado) return geoCargado;
    geoCargado = fetch(GEO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((geo) => {
        window.echarts.registerMap("mundo", geo);
        return geo;
      });
    return geoCargado;
  }

  /* La lista lateral.
   *
   * En HTML y no en ECharts: son barras y un numero, para eso no hace
   * falta un motor de graficos, y asi el texto se selecciona, se
   * busca con el navegador y lo lee un lector de pantalla.
   *
   * Las barras van normalizadas al mayor de la vista. Espana tiene 107
   * y el siguiente 24, de modo que las demas quedan cortas; pero el
   * numero esta escrito al lado, que es lo que de verdad se lee, y la
   * barra solo da la proporcion. Por eso aqui si cabe incluir Espana.
   */
  function pintaPanel(pais) {
    const host = document.getElementById("country-panel");
    if (!host) return;
    const rows = ctx.profile.countries || [];

    const filas = pais
      ? (pais.institutions || []).map((c) => ({ etiqueta: c.name, n: c.works,
                                                inst: c.name }))
      : rows.map((r) => ({ etiqueta: r.name, n: r.works, code: r.code }));

    const tope = Math.max(1, ...filas.map((f) => f.n));
    const titulo = pais
      ? esc(pais.name)
      : `${rows.length} ${esc(t("g.countries.n"))}`;
    const sub = pais
      ? `${(pais.institutions || []).length} ${esc(t("g.countries.orgs"))}`
      : `${rows.reduce((a, r) => a + r.works, 0)} ${esc(t("g.countries.works"))}`;

    host.innerHTML = `
      <header>
        <div>
          <h4>${titulo}</h4>
          <p>${sub}</p>
        </div>
        ${pais ? `<button type="button" class="back">${esc(t("g.countries.back"))}</button>` : ""}
      </header>
      <ol>
        ${filas.map((f) => `
          <li${f.code ? ` data-code="${esc(f.code)}" tabindex="0" role="button"` : ""}${f.inst ? ` data-inst="${esc(f.inst)}"` : ""}>
            <span class="nom">${esc(f.etiqueta)}</span>
            <b>${f.n}</b>
            <span class="bar"><i style="width:${Math.max(2, (f.n / tope) * 100)}%"></i></span>
          </li>`).join("")}
      </ol>`;

    // Primero el mapa y despues la lista, siempre: la lista se
    // engancha a los puntos que acaba de calcular el mapa, y al
    // reves llegaba tarde y las instituciones no marcaban nada.
    host.querySelector(".back")?.addEventListener("click", () => {
      vistaMapa(null);
      pintaPanel(null);
    });
    host.querySelectorAll("li[data-code]").forEach((li) => {
      const abre = () => {
        const p2 = rows.find((r) => r.code === li.dataset.code);
        if (!p2) return;
        vistaMapa(p2);
        pintaPanel(p2);
      };
      li.addEventListener("click", abre);
      li.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abre(); }
      });
    });
    /* Pasar el raton por una fila marca su punto en el mapa, y al
       reves. Son dos vistas de lo mismo y hasta ahora no se sabian
       la una de la otra.

       El anillo lo pinta una serie aparte en lugar del "emphasis" de
       ECharts. Esa via se probo primero y en este mapa no hace nada
       visible: el highlight despachado a mano apenas cambia la
       opacidad, ni crece ni cambia de color, y el globo no llega a
       aparecer. Una serie de un solo dato se dibuja siempre. */
    const enciende = (li, busca) => {
      if (!mapaChart) return;
      // El punto se busca al pasar el raton, no ahora: el corro de los
      // centros se recalcula con cada acercamiento, y una posicion
      // guardada aqui envejeceria en cuanto se moviera el mapa.
      li.addEventListener("mouseenter", () => marca(busca()));
      li.addEventListener("mouseleave", () => marca(null));
    };
    host.querySelectorAll("li[data-code]").forEach((li) => {
      enciende(li, () => mapaEstado?.puntoPais?.get(li.dataset.code));
    });
    host.querySelectorAll("li[data-inst]").forEach((li) => {
      enciende(li, () => mapaEstado?.puntoCentro?.get(li.dataset.inst));
    });

    host.scrollTop = 0;
  }

  /* El anillo sobre un punto del mapa. punto = [lon, lat, diametro,
     nombre]; sin punto, se apaga. */
  function marca(punto) {
    if (!mapaChart) return;
    mapaChart.setOption({
      series: [{
        id: "marca",
        data: punto
          ? [{ value: [punto[0], punto[1], punto[2]], name: punto[3] }]
          : [],
      }],
    });
  }

  /* El camino de vuelta: del mapa a la lista. */
  function marcaFila(clave, atributo, encendida) {
    const host = document.getElementById("country-panel");
    if (!host) return;
    host.querySelectorAll("li.on").forEach((li) => li.classList.remove("on"));
    if (!encendida || !clave) return;
    const li = host.querySelector(`li[${atributo}="${CSS.escape(clave)}"]`);
    if (!li) return;
    li.classList.add("on");
    // Si la institucion esta fuera de la parte visible de la lista,
    // no sirve de nada marcarla.
    const caja = host.querySelector("ol");
    if (caja && (li.offsetTop < caja.scrollTop
        || li.offsetTop > caja.scrollTop + caja.clientHeight - li.offsetHeight)) {
      caja.scrollTop = li.offsetTop - caja.clientHeight / 2;
    }
  }

  let mapaChart = null;
  let mapaEstado = null;            // { rows, centro, marco, radio, porCodigo }

  /* El encuadre de la vista mundial, el mismo que declara el geo. */
  const MUNDO = { lon: [-168, 180], lat: [-56, 78] };

  /* Zoom que hace que un encuadre llene el panel.
   *
   * Hay que contar con el tamano real del contenedor. A zoom 1 el
   * mapa encaja el mundo entero dentro del panel, y eso lo decide la
   * dimension que peor encaja: en un panel mas alto que ancho, el
   * ancho. Si se ignora, el zoom sale corto por el factor de esa
   * diferencia, que aqui son tres veces. El 0,88 deja aire.
   */
  /* Pixeles por grado a zoom 1: lo que mide el mapa cuando el mundo
     entero cabe en el panel. */
  function unidadMapa(w, h) {
    return Math.min(w / (MUNDO.lon[1] - MUNDO.lon[0]),
                    h / (MUNDO.lat[1] - MUNDO.lat[0]));
  }

  function zoomPara(marco, w, h) {
    const ancho = Math.max(0.4, marco[2] - marco[0]);
    const alto = Math.max(0.4, marco[3] - marco[1]);
    const unidad = unidadMapa(w, h);
    const z = Math.min(w / (ancho * unidad), h / (alto * unidad)) * 0.88;
    return Math.max(1, Math.min(24, z));
  }

  /* El encuadre de un pais no es su frontera, son sus instituciones.
   *
   * Espana con Canarias, Francia con la Guayana o Estados Unidos con
   * Alaska tienen una caja enorme y casi vacia: encuadrando por ahi,
   * el pais sale diminuto y descentrado. Lo que se ha venido a ver
   * son los centros con los que se ha colaborado, asi que se encuadra
   * por ellos y la frontera cae donde caiga.
   */
  function marcoDeCentros(centros) {
    const pts = centros.filter((c) => c.lat != null && c.lon != null);
    if (!pts.length) return null;
    const lon = pts.map((c) => c.lon);
    const lat = pts.map((c) => c.lat);
    const x0 = Math.min(...lon), x1 = Math.max(...lon);
    const y0 = Math.min(...lat), y1 = Math.max(...lat);
    // Con el margen justo, el encuadre se pega tanto a los puntos que
    // ya no se reconoce el pais: hay que dejar sitio alrededor. Un
    // solo centro no tiene caja, y entonces manda el minimo.
    const mx = Math.max(2.5, (x1 - x0) * 1.6);
    const my = Math.max(2.0, (y1 - y0) * 1.6);
    return [x0 - mx, y0 - my, x1 + mx, y1 + my];
  }

  /* Centros que comparten punto, abiertos en corro.
   *
   * OpenAlex sabe la ciudad, no la calle: los cuatro centros de
   * Madrid llegan con las mismas coordenadas, y los dos hospitales de
   * Valladolid tambien. Dibujados ahi, uno tapa al otro y no hay
   * acercamiento que los separe, porque el punto es literalmente el
   * mismo. A los que coinciden se les abre en corro alrededor de su
   * ciudad, con un radio medido en pixeles y traducido a grados segun
   * el zoom de cada momento. Asi se distinguen igual de cerca que de
   * lejos, y nunca se alejan de su ciudad mas de lo que ocupan.
   */
  function enCorro(centros, tam, gradoPorPx) {
    const grupos = new Map();
    centros.forEach((c) => {
      const clave = `${c.lon.toFixed(3)},${c.lat.toFixed(3)}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(c);
    });

    const sitio = new Map();
    grupos.forEach((grupo) => {
      if (grupo.length === 1) {
        sitio.set(grupo[0].name, [grupo[0].lon, grupo[0].lat]);
        return;
      }
      // Radio que deja hueco entre vecinos del corro: ni los simbolos
      // se tocan ni el corro se va mas lejos de lo necesario.
      const mayor = Math.max(...grupo.map((c) => tam(c.works)));
      const vuelta = grupo.reduce((n, c) => n + tam(c.works) + 5, 0);
      const r = Math.max(mayor / 2 + 4, vuelta / (2 * Math.PI)) * gradoPorPx;
      const paso = (2 * Math.PI) / grupo.length;
      grupo.forEach((c, i) => {
        const a = -Math.PI / 2 + i * paso;
        sitio.set(c.name, [c.lon + r * Math.cos(a), c.lat + r * Math.sin(a)]);
      });
    });
    return sitio;
  }

  /* Pinta los centros del pais actual para un zoom dado. Se repite en
     cada acercamiento, que es lo que mantiene el corro del tamano de
     siempre en pantalla. */
  function pintaCentros(zoom) {
    const pais = mapaEstado?.pais;
    if (!mapaChart || !pais) return;
    const centros = (pais.institutions || []).filter((c) => c.lat != null);
    if (!centros.length) return;
    const tope = Math.max(1, ...centros.map((c) => c.works));
    const tam = (w) => 8 + 22 * Math.sqrt(w / tope);
    const porPx = 1 / (unidadMapa(mapaChart.getWidth(),
                                  mapaChart.getHeight()) * zoom);
    const sitio = enCorro(centros, tam, porPx);
    mapaEstado.zoom = zoom;
    mapaEstado.puntoCentro = new Map(centros.map((c) => {
      const [lon, lat] = sitio.get(c.name);
      return [c.name, [lon, lat, tam(c.works) + 10, c.name]];
    }));
    mapaChart.setOption({
      series: [{
        id: "centros",
        data: centros.map((c) => {
          const [lon, lat] = sitio.get(c.name);
          return {
            name: c.name,
            value: [lon, lat, c.works],
            centro: c,
            itemStyle: { color: tonoCentro(c.works, tope) },
          };
        }),
        symbolSize: (val) => tam(val[2]),
      }],
    });
  }

  /* Pasa a la vista de un pais: acerca el mapa a su encuadre y cambia
     las burbujas de pais por las de sus centros. Sin pais, vuelve al
     mundo. */
  function vistaMapa(pais) {
    if (!mapaChart || !mapaEstado) return;
    const { rows, centro, marco, radio } = mapaEstado;

    if (!pais) {
      mapaChart.setOption({
        geo: { center: null, zoom: 1 },
        series: [
          { id: "paises", data: burbujasPais(rows, centro, radio) },
          { id: "centros", data: [] },
        ],
      });
      mapaChart.dispatchAction({ type: "geoUnselect", name: undefined });
      mapaEstado.pais = null;
      marca(null);
      return;
    }

    const bb = marco.get(pais.code);
    const encuadre = marcoDeCentros(pais.institutions || []) || bb;
    const zoom = encuadre
      ? zoomPara(encuadre, mapaChart.getWidth(), mapaChart.getHeight())
      : (mapaEstado.zoom || 1);

    mapaEstado.pais = pais;
    mapaChart.setOption({
      geo: encuadre
        ? { center: [(encuadre[0] + encuadre[2]) / 2,
                     (encuadre[1] + encuadre[3]) / 2],
            zoom }
        : {},
      series: [{ id: "paises", data: [] }],
    });
    pintaCentros(zoom);
    mapaChart.dispatchAction({ type: "geoUnselect", name: undefined });
    mapaChart.dispatchAction({ type: "geoSelect", name: pais.code });
    marca(null);
  }

  function burbujasPais(rows, centro, radio) {
    const tope = Math.max(1, ...rows.map((r) => r.works));
    const datos = rows
      .filter((r) => centro.get(r.code))
      .map((r) => ({
        name: r.code,
        value: [...centro.get(r.code), r.works],
        itemStyle: { color: tonoPais(r.works, tope) },
      }));
    if (mapaEstado) {
      // Donde esta cada pais y de que tamano se ha dibujado, que es
      // lo que necesita el anillo para caer encima y no dentro.
      mapaEstado.puntoPais = new Map(rows
        .filter((r) => centro.get(r.code))
        .map((r) => [r.code, [...centro.get(r.code),
                              radio(r.works) + 10, r.name]]));
    }
    return datos;
  }

  function chartMap(host) {
    const rows = ctx.profile.countries || [];
    if (!rows.length) return false;
    const b = base();
    const porCodigo = new Map(rows.map((r) => [r.code, r]));
    const tope = Math.max(...rows.map((r) => r.works));
    const accent = css("--accent", "#1b4ea8");

    loadGeo().then((geo) => {
      const centro = new Map(
        geo.features.map((f) => [f.properties.name, f.properties.cp]));
      const marco = new Map(
        geo.features.map((f) => [f.properties.name, f.properties.bb]));

      // El area de la burbuja es proporcional al numero, no el radio:
      // de lo contrario Espana, con 107 frente a 24, se dibujaria
      // cuatro veces mas ancha y parecerian dieciseis veces mas
      // trabajos. La raiz cuadrada lo corrige.
      const radio = (n) => 5 + 24 * Math.sqrt(n / tope);

      mapaEstado = { rows, centro, marco, radio,
                     puntoPais: new Map(), puntoCentro: new Map() };

      const marcador = (id, datos, tam) => ({
        id,
        type: "scatter",
        coordinateSystem: "geo",
        data: datos,
        symbolSize: tam,
        itemStyle: { color: accent, opacity: 0.6,
                     borderColor: b.paper, borderWidth: 1.5 },
        // Un 12 % mas grande no se ve cuando lo que lo enciende es el
        // raton pasando por una fila de la lista, al otro lado del
        // panel. Con el anillo calido se encuentra a la primera.
        emphasis: {
          scale: 1.5,
          itemStyle: { opacity: 1, borderWidth: 2.5,
                       borderColor: css("--warm-mark", "#d2650f") },
        },
        z: 5,
      });

      mapaChart = mount(host, () => ({
        ...b,
        tooltip: {
          ...b.tooltip, trigger: "item",
          formatter: (pt) => {
            if (pt.seriesId === "centros") {
              const c = pt.data.centro || {};
              return `<b>${esc(c.name)}</b><br>${c.works} `
                + `${t("g.countries.works")}`
                + (c.city ? `<br><span style="opacity:.6">${esc(c.city)}</span>` : "");
            }
            const pais = porCodigo.get(pt.name);
            if (!pais) return "";
            const lista = (pais.institutions || []).slice(0, 3)
              .map((c) => `<br>\u00b7 ${esc(c.name)} (${c.works})`).join("");
            return `<b>${esc(pais.name)}</b> \u2014 ${pais.works} `
              + `${t("g.countries.works")}${lista}`;
          },
        },
        geo: {
          map: "mundo",
          roam: true,
          // El globo de las regiones enseñaba el codigo ISO a secas
          // ("GB") al pasar por encima, que no le dice nada a nadie.
          // Lo que informa son las burbujas, y esas lo conservan.
          tooltip: { show: false },
          silent: false,
          scaleLimit: { min: 1, max: 160 },
          // Sin la Antartida el mundo habitado ocupa el doble de alto.
          boundingCoords: [[MUNDO.lon[0], MUNDO.lat[1]],
                           [MUNDO.lon[1], MUNDO.lat[0]]],
          itemStyle: { areaColor: b.surface, borderColor: b.rule,
                       borderWidth: 0.5 },
          emphasis: { label: { show: false },
                      itemStyle: { areaColor: b.surface } },
          // El pais en el que se ha entrado va en el tono calido, el
          // mismo de sus instituciones: con el azul claro de antes no
          // se distinguia del resto del mapa.
          select: { label: { show: false },
                    itemStyle: { areaColor: css("--warm-bg", "#f1ddcb"),
                                 borderColor: css("--warm-mark", "#d2650f"),
                                 borderWidth: 1 } },
          selectedMode: "single",
        },
        series: [
          marcador("paises", burbujasPais(rows, centro, radio),
                   (val) => radio(val[2])),
          marcador("centros", [], 10),
          // El anillo que marca lo que se esta senalando en la lista.
          // Vacio casi siempre; cuando lleva un punto, va encima de
          // todo y no estorba al raton.
          {
            id: "marca",
            type: "scatter",
            coordinateSystem: "geo",
            data: [],
            silent: true,
            symbol: "circle",
            symbolSize: (val) => val[2],
            itemStyle: { color: "transparent", borderWidth: 2.5,
                         borderColor: css("--warm-mark", "#d2650f") },
            label: {
              show: true, position: "top", distance: 7,
              formatter: (pt) => pt.name,
              color: b.ink, fontSize: 11, fontFamily: b.data,
              backgroundColor: b.paper, borderColor: b.rule, borderWidth: 1,
              padding: [3, 5],
            },
            z: 9,
            animationDuration: 180,
            animationDurationUpdate: 180,
          },
        ],
        animationDuration: 600,
        animationDurationUpdate: 500,
      }), "canvas");

      if (!mapaChart) return;
      mapaChart.on("click", (pt) => {
        if (pt.seriesId === "centros") return;   // ya estamos dentro
        const pais = porCodigo.get(pt.name);
        if (pais) { vistaMapa(pais); pintaPanel(pais); }
      });

      // Rueda y arrastre cambian el zoom, y con el la traduccion de
      // pixeles a grados del corro. La rueda dispara el evento muchas
      // veces seguidas, asi que se espera a que pare y se rehace una
      // vez, y solo si el zoom ha cambiado algo que se note.
      let encolado = 0;
      mapaChart.on("georoam", () => {
        if (!mapaEstado?.pais) return;
        clearTimeout(encolado);
        encolado = setTimeout(() => {
          const z = mapaChart.getOption()?.geo?.[0]?.zoom;
          const antes = mapaEstado.zoom || 0;
          if (!z || Math.abs(z - antes) < antes * 0.02) return;
          pintaCentros(z);
        }, 60);
      });

      // Y el camino de vuelta: lo que se senala en el mapa se marca
      // en la lista de la derecha.
      mapaChart.on("mouseover", (pt) => {
        if (pt.seriesId === "centros") marcaFila(pt.name, "data-inst", true);
        else if (pt.seriesId === "paises") marcaFila(pt.name, "data-code", true);
      });
      mapaChart.on("mouseout", () => marcaFila(null, null, false));
      mapaChart.on("globalout", () => marcaFila(null, null, false));

      // La lista se pinto antes de que existieran el mapa y sus
      // indices, asi que se repinta ahora: si no, las filas del
      // mundo no encenderian nada.
      pintaPanel(null);
    }).catch((err) => {
      console.error("mapa:", err);
      host.innerHTML = `<p class="chart-note">${esc(t("g.failed"))}</p>`;
    });

    pintaPanel(null);
    return true;
  }

  /* ── montaje ────────────────────────────────────────────────── */

  const BUILDERS = {
    "chart-output": chartOutput,
    "chart-network": chartNetwork,
    "chart-quartiles": chartQuartiles,
    "chart-citations": chartCitations,
    "chart-projects": chartProjects,
    "chart-map": chartMap,
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
