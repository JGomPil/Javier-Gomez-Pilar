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
        dimensions: ["name", "degree"],
        data: net.nodes.map((n, i) => ({
          name: n.name,
          works: n.works,
          degree: degree[i],
          value: degree[i],
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
      /* El tirador se va. Lo preguntaste dos veces y la respuesta
         honesta es que no servia de nada util: recortar la red por
         grado es una operacion de analista, no algo que un lector de
         esta pagina vaya a querer. Queda lo que si informa, que es
         saber que el tono mas oscuro es el mas conectado. */
      graphic: [{
        type: "group", right: 6, bottom: 4, silent: true,
        children: [
          { type: "text", left: 0, top: 0,
            style: { text: t("g.net.legend"), fill: b.muted, fontSize: 11,
                     fontFamily: css("--ui", "Inter, sans-serif") } },
          ...ramp(4).map((color, i) => ({
            type: "circle", left: i * 20, top: 19,
            shape: { cx: 6, cy: 6, r: 4 + i * 1.2 },
            style: { fill: color },
          })),
        ],
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
        tooltip: { ...b.tooltip, trigger: "item",
                   formatter: () => `<b>${esc(t("g.q.d1"))}</b><br>${d1}` },
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

  /* ── 6. colaboracion por pais: mapa y lista ──── */

  const GEO_URL = "data/world.json";
  let geoCargado = null;

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
      ? (pais.institutions || []).map((c) => ({ etiqueta: c.name, n: c.works }))
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
          <li${f.code ? ` data-code="${esc(f.code)}" tabindex="0" role="button"` : ""}>
            <span class="nom">${esc(f.etiqueta)}</span>
            <b>${f.n}</b>
            <span class="bar"><i style="width:${Math.max(2, (f.n / tope) * 100)}%"></i></span>
          </li>`).join("")}
      </ol>`;

    host.querySelector(".back")?.addEventListener("click", () => {
      pintaPanel(null);
      vistaMapa(null);
    });
    host.querySelectorAll("li[data-code]").forEach((li) => {
      const abre = () => {
        const p2 = rows.find((r) => r.code === li.dataset.code);
        if (!p2) return;
        pintaPanel(p2);
        vistaMapa(p2);
      };
      li.addEventListener("click", abre);
      li.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abre(); }
      });
    });
    host.scrollTop = 0;
  }

  let mapaChart = null;
  let mapaEstado = null;            // { rows, centro, marco, radio, porCodigo }

  /* El encuadre de la vista mundial, el mismo que declara el geo. */
  const MUNDO = { lon: [-168, 180], lat: [-56, 78] };

  /* Zoom que hace que un pais llene el panel.
   *
   * No es el cociente de anchos sin mas: hay que respetar la
   * dimension que peor encaja, o un pais ancho y bajo como Estados
   * Unidos se saldria por arriba. El 0,78 deja aire alrededor.
   */
  function zoomPara(marco) {
    const ancho = Math.max(0.6, marco[2] - marco[0]);
    const alto = Math.max(0.6, marco[3] - marco[1]);
    const z = Math.min((MUNDO.lon[1] - MUNDO.lon[0]) / ancho,
                       (MUNDO.lat[1] - MUNDO.lat[0]) / alto) * 0.78;
    return Math.max(1, Math.min(14, z));
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
      return;
    }

    const bb = marco.get(pais.code);
    const centros = (pais.institutions || []).filter((c) => c.lat != null);
    const tope = Math.max(1, ...centros.map((c) => c.works));

    mapaChart.setOption({
      geo: bb
        ? { center: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2],
            zoom: zoomPara(bb) }
        : {},
      series: [
        { id: "paises", data: [] },
        {
          id: "centros",
          data: centros.map((c) => ({
            name: c.name,
            value: [c.lon, c.lat, c.works],
            centro: c,
          })),
          symbolSize: (val) => 7 + 20 * Math.sqrt(val[2] / tope),
        },
      ],
    });
    mapaChart.dispatchAction({ type: "geoUnselect", name: undefined });
    mapaChart.dispatchAction({ type: "geoSelect", name: pais.code });
  }

  function burbujasPais(rows, centro, radio) {
    return rows
      .filter((r) => centro.get(r.code))
      .map((r) => ({ name: r.code, value: [...centro.get(r.code), r.works] }));
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

      mapaEstado = { rows, centro, marco, radio };

      const marcador = (id, datos, tam) => ({
        id,
        type: "scatter",
        coordinateSystem: "geo",
        data: datos,
        symbolSize: tam,
        itemStyle: { color: accent, opacity: 0.6,
                     borderColor: b.paper, borderWidth: 1.5 },
        emphasis: { itemStyle: { opacity: 0.95 }, scale: 1.12 },
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
          scaleLimit: { min: 1, max: 16 },
          // Sin la Antartida el mundo habitado ocupa el doble de alto.
          boundingCoords: [[MUNDO.lon[0], MUNDO.lat[1]],
                           [MUNDO.lon[1], MUNDO.lat[0]]],
          itemStyle: { areaColor: b.surface, borderColor: b.rule,
                       borderWidth: 0.5 },
          emphasis: { label: { show: false },
                      itemStyle: { areaColor: b.surface } },
          select: { label: { show: false },
                    itemStyle: { areaColor: css("--accent-bg", "#d7e0f2"),
                                 borderColor: b.ink, borderWidth: 1 } },
          selectedMode: "single",
        },
        series: [
          marcador("paises", burbujasPais(rows, centro, radio),
                   (val) => radio(val[2])),
          marcador("centros", [], 10),
        ],
        animationDuration: 600,
        animationDurationUpdate: 500,
      }), "canvas");

      if (!mapaChart) return;
      mapaChart.on("click", (pt) => {
        if (pt.seriesId === "centros") return;   // ya estamos dentro
        const pais = porCodigo.get(pt.name);
        if (pais) { pintaPanel(pais); vistaMapa(pais); }
      });
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
