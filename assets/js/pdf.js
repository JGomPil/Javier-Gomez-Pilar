/* ─────────────────────────────────────────────────────────────
   Javier Gómez Pilar — el CV en PDF

   El botón no imprime la página: genera un PDF de verdad y lo
   descarga. El documento se compone aquí, con pdfmake, a partir de
   los mismos datos que la web (content.json y profile.json) y en el
   idioma que esté activo.

   Se hace en el navegador y no en un servidor porque no hay servidor:
   esto es GitHub Pages. pdfmake pesa dos megas, así que se carga la
   primera vez que se pulsa el botón y no antes.

   El documento es un currículum, no un folleto: cabecera con retrato
   y cifras, secciones en cajas, numeración ascendente y enlaces vivos
   en los identificadores, los DOI y las fichas de los proyectos.

   Lo que no entra: el correo electrónico, que no está en ninguna
   parte del sitio, y las calificaciones de los trabajos dirigidos,
   que son rendimiento académico de terceros.
   ───────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const VERSION = "0.2.12";
  const BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdfmake/${VERSION}`;

  const URL_SITIO = "jgompil.github.io/Javier-Gomez-Pilar";
  const RUTA_FOTO = "assets/img/javier.png";
  const RUTA_ATENEA = "assets/img/logos/atenea.png";

  /* El nombre entero en negrita, no solo el apellido: en una lista de
     doce coautores lo que se busca es "Javier Gomez-Pilar". Admite el
     acento y la inicial porque las fuentes no se ponen de acuerdo. */
  const YO = /((?:Javier\s+|J\.\s*)?G[oó]mez[-\s]?Pilar(?:,\s*(?:Javier|J\.))?)/i;

  /* A4 son 595,28 pt de ancho; con 52 de margen a cada lado quedan
     491 para el contenido. Hace falta el número para las reglas, que
     en pdfmake son líneas de un canvas. */
  const ANCHO = 491;

  const TINTA = "#16222e";
  const SUAVE = "#41566b";
  const APAGADO = "#73869b";
  const FILETE = "#ccd5dc";
  const BLANCO = "#ffffff";

  const AZUL = "#184a9e";
  const AZUL_CLARO = "#4e79c4";
  const AZUL_BG = "#e9eff8";
  const NARANJA = "#a3521a";
  const NARANJA_CLARO = "#c87533";
  const NARANJA_BG = "#f8ede2";
  const GRIS_BG = "#f2f5f7";

  const ORDEN_TIPOS = ["journal", "book", "conf_int", "conf_nat",
                       "conf_teach", "journal_other"];

  const PERFILES = [
    ["ORCID", "0000-0001-7882-7890", "https://orcid.org/0000-0001-7882-7890"],
    ["Scopus", "55977922600",
     "https://www.scopus.com/authid/detail.url?authorId=55977922600"],
    ["Web of Science", "B-9123-2018",
     "https://www.webofscience.com/wos/author/record/B-9123-2018"],
    ["Google Scholar", "",
     "https://scholar.google.es/citations?user=m8XACpMAAAAJ"],
    ["Portal de la Ciencia UVa", "",
     "https://portaldelaciencia.uva.es/investigadores/180080/detalle"],
    ["CVN-FECYT", "", "https://cvn.fecyt.es/0000-0001-7882-7890"],
  ];

  // [ancla, clave del título]. El índice de la cabecera y las propias
  // secciones salen de aquí, así que no pueden descuadrarse.
  const SECCIONES = [
    ["sec-inv", "research.h"],
    ["sec-pub", "pub.h"],
    ["sec-pro", "proj.h"],
    ["sec-doc", "teach.h"],
    ["sec-rec", "rec.h"],
    ["sec-con", "contact.h"],
  ];

  let ctx = null;
  let imagenes = { retrato: "", atenea: "" };

  const t = (clave) => ctx?.content?.ui?.[ctx.lang]?.[clave] ?? clave;
  const loc = () => (ctx.lang === "es" ? "es-ES" : "en-GB");
  const nf = () => new Intl.NumberFormat(loc());
  const euros = () => new Intl.NumberFormat(loc(), {
    style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const dos = (n) => String(n).padStart(2, "0");

  const fechaLarga = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(loc(),
      { day: "numeric", month: "long", year: "numeric" });
  };

  /* ── el retrato ──────────────────────────────────────────── */

  /* La foto se recorta en redondo sobre un lienzo, con el mismo
     encuadre que en la web, y se le dibuja el aro de dos colores que
     allí gira. pdfmake solo admite imágenes como data URI, y de paso
     el recorte evita tener que guardar una segunda copia del retrato
     en el repositorio. */
  let retrato;

  function foto() {
    if (retrato !== undefined) return Promise.resolve(retrato);
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        try {
          const S = 520, r = S / 2 - 16, c = S / 2;
          const lienzo = document.createElement("canvas");
          lienzo.width = lienzo.height = S;
          const g = lienzo.getContext("2d");

          g.save();
          g.beginPath();
          g.arc(c, c, r, 0, Math.PI * 2);
          g.clip();
          g.fillStyle = AZUL_BG;
          g.fill();
          // Como en la web: 103 % de ancho, apoyada abajo y corrida un
          // 4 % para que la cara quede en el eje del círculo.
          const w = (2 * r) * 1.03;
          const h = w * (img.height / img.width);
          g.drawImage(img, c - w * 0.46, c + r - h, w, h);
          g.restore();

          // El aro: un circulo fino entero que cierra el recorte, y
          // encima un arco calido, que es el guino a la web.
          g.lineWidth = 3;
          g.strokeStyle = "#c3d2ea";
          g.beginPath();
          g.arc(c, c, r + 5, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = 8;
          g.lineCap = "round";
          g.strokeStyle = AZUL;
          g.beginPath();
          g.arc(c, c, r + 5, Math.PI * 0.72, Math.PI * 1.46);
          g.stroke();
          g.strokeStyle = NARANJA_CLARO;
          g.beginPath();
          g.arc(c, c, r + 5, Math.PI * 1.54, Math.PI * 1.94);
          g.stroke();

          retrato = lienzo.toDataURL("image/png");
        } catch (e) {
          // Un lienzo contaminado (file://) no se puede exportar. El
          // documento se hace igual, sin foto.
          retrato = "";
        }
        ok(retrato);
      };
      img.onerror = () => { retrato = ""; ok(retrato); };
      img.src = RUTA_FOTO;
    });
  }

  /* El logo de ATENEA es una silueta con transparencia. Se tiñe del
     color que haga falta pintando encima con "source-in", que solo
     pinta donde ya habia algo. */
  const tenidos = new Map();

  function silueta(ruta, tinta) {
    const clave = ruta + tinta;
    if (tenidos.has(clave)) return Promise.resolve(tenidos.get(clave));
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        let url = "";
        try {
          const lienzo = document.createElement("canvas");
          lienzo.width = img.width;
          lienzo.height = img.height;
          const g = lienzo.getContext("2d");
          g.drawImage(img, 0, 0);
          g.globalCompositeOperation = "source-in";
          g.fillStyle = tinta;
          g.fillRect(0, 0, lienzo.width, lienzo.height);
          url = lienzo.toDataURL("image/png");
        } catch (e) {
          url = "";
        }
        tenidos.set(clave, url);
        ok(url);
      };
      img.onerror = () => { tenidos.set(clave, ""); ok(""); };
      img.src = ruta;
    });
  }

  /* ── piezas de maquetación ───────────────────────────────── */

  const regla = (color, grosor, arriba, abajo) => ({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: ANCHO, y2: 0,
               lineWidth: grosor, lineColor: color }],
    margin: [0, arriba, 0, abajo],
  });

  /* Una caja con una banda de color a la izquierda. La banda es una
     celda de tres puntos con fondo, y no una línea dibujada: una
     línea mide lo que se le diga y las fichas no miden todas igual,
     mientras que la celda crece con la fila. */
  function caja(dentro, { banda = AZUL_CLARO, fondo = GRIS_BG,
                          abajo = 9 } = {}) {
    return {
      unbreakable: true,
      margin: [0, 0, 0, abajo],
      table: {
        widths: [3, "*"],
        body: [[{ text: "", fillColor: banda },
                { stack: dentro, fillColor: fondo }]],
      },
      layout: {
        defaultBorder: false,
        paddingLeft: (i) => (i === 0 ? 0 : 11),
        paddingRight: (i) => (i === 0 ? 0 : 11),
        paddingTop: (i) => (i === 0 ? 0 : 9),
        paddingBottom: (i) => (i === 0 ? 0 : 9),
      },
    };
  }

  /* Cabecera de sección: el número en un cuadro lleno de color y el
     título sobre un fondo claro, con la cuenta a la derecha. */
  function cabecera(n, ancla, titulo, extra) {
    return {
      unbreakable: true,
      headlineLevel: 1,
      margin: [0, 18, 0, 11],
      // Sin cuenta a la derecha la tabla lleva dos columnas y no
      // tres: una tercera celda vacia deja una muesca blanca en el
      // extremo de la barra.
      table: {
        widths: extra ? [24, "*", "auto"] : [24, "*"],
        body: [[
          { text: dos(n), fillColor: AZUL, color: BLANCO, bold: true,
            fontSize: 9.5, alignment: "center" },
          { text: titulo.toUpperCase(), id: ancla, fillColor: AZUL_BG,
            color: AZUL, bold: true, fontSize: 10.5, characterSpacing: 1.3 },
          ...(extra
            ? [{ text: extra, fillColor: AZUL_BG, color: SUAVE,
                 fontSize: 8.6, alignment: "right" }]
            : []),
        ]],
      },
      layout: {
        defaultBorder: false,
        paddingLeft: (i) => (i === 0 ? 0 : 10),
        paddingRight: (i, nodo) =>
          (i === nodo.table.widths.length - 1 ? 10 : 0),
        paddingTop: () => 5.5,
        paddingBottom: () => 5.5,
      },
    };
  }

  /* Subtítulo dentro de una sección: una barra fina de color. */
  function barra(texto, cuenta, { color = NARANJA, fondo = NARANJA_BG } = {}) {
    return {
      unbreakable: true,
      margin: [0, 11, 0, 7],
      table: {
        widths: ["*", "auto"],
        body: [[
          { text: texto.toUpperCase(), fillColor: fondo, color,
            bold: true, fontSize: 8.4, characterSpacing: 1 },
          { text: cuenta != null ? String(cuenta) : "", fillColor: fondo,
            color: APAGADO, fontSize: 8, alignment: "right" },
        ]],
      },
      layout: {
        defaultBorder: false,
        paddingLeft: (i) => (i === 0 ? 9 : 0),
        paddingRight: (i) => (i === 1 ? 9 : 0),
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    };
  }

  const enlace = (texto, url, tam) => ({
    text: texto, link: url, color: AZUL_CLARO, fontSize: tam || 8,
    decoration: "underline", decorationColor: "#c3d2ea",
  });

  /* El nombre propio en negrita dentro de la lista de autores.
     pdfmake no entiende HTML, así que la línea se parte en trozos con
     estilo propio: split() con un grupo de captura deja las
     coincidencias en las posiciones impares. */
  function autores(lista) {
    return String(lista).split(YO).map((trozo, i) => (
      i % 2
        ? { text: trozo, bold: true, color: TINTA }
        : { text: trozo, color: SUAVE }
    ));
  }

  /* Los textos de ATENEA llevan <b> escrito a mano en content.json.
     Es el único sitio con marcado, y aquí se convierte en trozos. */
  function conNegritas(html) {
    const salida = [];
    const re = /<b>(.*?)<\/b>/gi;
    let ultimo = 0, m;
    while ((m = re.exec(html)) !== null) {
      if (m.index > ultimo) salida.push({ text: html.slice(ultimo, m.index) });
      salida.push({ text: m[1], bold: true });
      ultimo = m.index + m[0].length;
    }
    if (ultimo < html.length) salida.push({ text: html.slice(ultimo) });
    return salida.map((x) => ({ ...x, text: x.text.replace(/<[^>]+>/g, "") }));
  }

  /* Las etiquetas de cada línea solo se traducen donde cambian:
     EEG es EEG en los dos idiomas, "Teoría de grafos" no. */
  const senales = (linea) =>
    (ctx.lang === "en" && linea.signals_en) || linea.signals;

  const doiLimpio = (doi) =>
    String(doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");

  /* ── cabecera del currículum ─────────────────────────────── */

  function identidad(img) {
    const datos = [
      { text: t("pdf.kicker").toUpperCase(), style: "kicker" },
      { text: "Javier Gómez Pilar", style: "nombre" },
      { text: t("hero.pos"), style: "cargo" },
      { text: [t("contact.dept"), t("contact.school"),
               `${t("hero.group")} · CIBER-BBN`].join("\n"),
        style: "afiliacion" },
      { text: t("hero.eyebrow").toUpperCase(), style: "eyebrow" },
    ];

    const identificadores = [];
    PERFILES.forEach(([n, id, url], i) => {
      if (i) identificadores.push({ text: "   ·   ", color: FILETE });
      // Espacio duro: "Google Scholar" partido entre dos lineas
      // parece otra cosa.
      identificadores.push(
        enlace((n + (id ? ` ${id}` : "")).replace(/ /g, "\u00a0"), url, 7.8));
    });
    datos.push({ text: identificadores, margin: [0, 9, 0, 0],
                 lineHeight: 1.5 });

    return img
      ? { columns: [{ image: img, width: 96 },
                    { width: "*", stack: datos }],
          columnGap: 20 }
      : { stack: datos };
  }

  /* Las cuatro cifras, cada una en su caja. Entre caja y caja va una
     columna vacía: dos fondos pegados se leen como uno solo. */
  function cifras() {
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const fmt = nf();
    const datos = [
      [fmt.format(m.jcr_articles), t("m.jcr"), AZUL, AZUL_BG],
      [fmt.format(m.quartiles.Q1 ?? 0), t("m.q1"), AZUL, AZUL_BG],
      [wos.citations != null ? fmt.format(wos.citations) : "—", t("m.cit"),
       NARANJA, NARANJA_BG],
      [wos.h_index != null ? fmt.format(wos.h_index) : "—", t("m.h"),
       NARANJA, NARANJA_BG],
    ];

    const celdas = [];
    const anchos = [];
    datos.forEach(([valor, etiqueta, tinta, fondo], i) => {
      if (i) { celdas.push({ text: "" }); anchos.push(7); }
      anchos.push("*");
      celdas.push({
        fillColor: fondo,
        stack: [
          { text: valor, fontSize: 19, bold: true, color: tinta },
          { text: etiqueta.toUpperCase(), style: "cifraPie" },
        ],
      });
    });

    return {
      margin: [0, 15, 0, 0],
      table: { widths: anchos, body: [celdas] },
      layout: {
        defaultBorder: false,
        paddingLeft: (i) => (i % 2 ? 0 : 10),
        paddingRight: (i) => (i % 2 ? 0 : 10),
        paddingTop: (i) => (i % 2 ? 0 : 8),
        paddingBottom: (i) => (i % 2 ? 0 : 8),
      },
    };
  }

  function indice() {
    const trozos = [];
    SECCIONES.forEach(([ancla, clave], i) => {
      if (i) trozos.push({ text: "     ", color: BLANCO });
      trozos.push({ text: dos(i + 1) + " ", color: AZUL, bold: true });
      trozos.push({ text: t(clave), linkToDestination: ancla, color: SUAVE });
    });
    return { text: trozos, fontSize: 8.2, margin: [0, 13, 0, 0] };
  }

  /* ── 01 investigación ────────────────────────────────────── */

  function investigacion() {
    const bloques = [cabecera(1, "sec-inv", t("research.h"), null)];
    bloques.push({ text: t("research.lede"), style: "lede" });

    ctx.content.lines.forEach((linea, i) => {
      const L = linea[ctx.lang];
      bloques.push(caja([
        { columns: [
            { text: dos(i + 1), width: 22, color: NARANJA_CLARO, bold: true,
              fontSize: 9 },
            { text: L.title, style: "lineaH" },
          ] },
        { text: L.text, style: "cuerpo", margin: [22, 5, 0, 5] },
        { text: senales(linea).join("   ·   ").toUpperCase(),
          style: "senales", margin: [22, 0, 0, 0] },
      ], { banda: i % 2 ? NARANJA_CLARO : AZUL_CLARO }));
    });
    return bloques;
  }

  /* ── 02 publicaciones ────────────────────────────────────── */

  function tablaCifras(titulo, pares, tinta) {
    return {
      width: "*",
      stack: [
        { text: titulo.toUpperCase(), style: "tablaH" },
        { table: {
            widths: ["*", "auto"],
            body: pares.map(([k, v]) => [
              { text: k, style: "cuerpo", color: SUAVE },
              { text: v, fontSize: 9.6, bold: true, color: tinta,
                alignment: "right" },
            ]),
          },
          layout: {
            hLineWidth: (i) => (i === 0 ? 0 : 0.5),
            vLineWidth: () => 0,
            hLineColor: () => FILETE,
            paddingLeft: () => 0, paddingRight: () => 0,
            paddingTop: () => 3.5, paddingBottom: () => 3.5,
          } },
      ],
    };
  }

  function publicaciones() {
    const todas = ctx.profile.publications;
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const q = m.quartiles || {};
    const fmt = nf();

    const bloques = [cabecera(2, "sec-pub", t("pub.h"),
                              fmt.format(todas.length))];

    bloques.push({
      columns: [
        tablaCifras(t("pdf.bib"), [
          [t("m.jcr"), fmt.format(m.jcr_articles)],
          ["Q1", fmt.format(q.Q1 ?? 0)],
          ["Q2", fmt.format(q.Q2 ?? 0)],
          ["Q3", fmt.format(q.Q3 ?? 0)],
          ["Q4", fmt.format(q.Q4 ?? 0)],
          [t("g.q.d1"), fmt.format(q.D1 ?? 0)],
          [t("m.cit"), wos.citations != null ? fmt.format(wos.citations) : "—"],
          [t("m.h"), wos.h_index != null ? fmt.format(wos.h_index) : "—"],
        ], AZUL),
        tablaCifras(t("f.kind"), ORDEN_TIPOS
          .filter((k) => (m.by_kind || {})[k])
          .map((k) => [t("k." + k), fmt.format(m.by_kind[k])]), NARANJA),
      ],
      columnGap: 26,
    });

    ORDEN_TIPOS.forEach((tipo) => {
      const items = todas
        .filter((p) => (p.kind || "journal") === tipo)
        .sort((a, b) => (b.year - a.year) || ((b.month || 0) - (a.month || 0)));
      if (!items.length) return;

      bloques.push(barra(t("k." + tipo), items.length,
        tipo === "journal" ? { color: AZUL, fondo: AZUL_BG } : {}));

      // De la más reciente a la más antigua, pero numeradas 1, 2,
      // 3... Contar hacia atrás desde sesenta y ocho no lo hace nadie.
      items.forEach((p, i) => {
        const doi = doiLimpio(p.doi);
        const donde = [
          p.journal || "",
          p.volume ? `vol. ${p.volume}` : "",
          p.pages ? `pp. ${p.pages}` : "",
        ].filter(Boolean).join(", ");

        const texto = [
          ...autores(p.authors),
          { text: ` (${p.year}). `, color: SUAVE },
          { text: p.title, bold: true, color: TINTA },
        ];
        if (donde) texto.push({ text: `. ${donde}`, color: SUAVE,
                                italics: true });
        if (doi) {
          texto.push({ text: ". " , color: SUAVE });
          texto.push(enlace(`doi.org/${doi}`, `https://doi.org/${doi}`, 7.4));
        } else if (p.url) {
          texto.push({ text: ". ", color: SUAVE });
          texto.push(enlace(t("pdf.link"), p.url, 7.4));
        }
        if (p.quartile) texto.push({ text: `   ${p.quartile}`, color: AZUL,
                                     bold: true, fontSize: 7.6 });
        if (p.top_decile) texto.push({ text: "   D1", color: NARANJA,
                                       bold: true, fontSize: 7.6 });

        bloques.push({
          unbreakable: true,
          margin: [0, 0, 0, 5],
          columns: [
            { text: String(i + 1), width: 24, style: "num" },
            { text: texto, style: "ref" },
          ],
        });
      });
    });

    return bloques;
  }

  /* ── 03 proyectos ────────────────────────────────────────── */

  function proyectos() {
    // La misma fusión que en la web: lo de content.json manda y el
    // Portal de la Ciencia solo añade lo que únicamente él sabe.
    const portal = ctx.profile.projects || {};
    const capa = portal.overlay || {};
    const propios = ctx.content.projects.map((p) => {
      const extra = capa[p.acronym] || capa[p.label];
      return extra ? { ...p, ...extra, amount: p.amount } : p;
    });
    const nuevos = (portal.new || []).map((p) => ({
      acronym: "", role: "researcher", from: p.from, to: p.to,
      funder: p.funder, scope: p.scope, ip: p.ip, amount: p.amount_uva,
      amount_basis: "uva", live: p.live, url: p.url,
      es: { title: p.title }, en: { title: p.title },
    }));
    const lista = [...propios, ...nuevos]
      .sort((a, b) => Number(b.from) - Number(a.from));

    const papel = {
      "ip": ctx.lang === "es" ? "Investigador principal" : "Principal investigator",
      "co-ip": ctx.lang === "es" ? "Co-IP · coordinador" : "Co-PI · coordinator",
      "director": t("proj.director"),
      "researcher": t("g.role.researcher"),
    };

    const ahora = new Date().getFullYear();
    const eur = euros();
    const bloques = [cabecera(3, "sec-pro", t("proj.h"),
                              nf().format(lista.length))];

    lista.forEach((p) => {
      const P = p[ctx.lang] || {};
      const vivo = p.live !== undefined ? p.live : Number(p.to) >= ahora;
      const tinta = vivo ? NARANJA : AZUL;
      const sello = [papel[p.role], p.scope ? t("pdf.scope." + p.scope) : ""]
        .filter(Boolean).join("   ·   ").toUpperCase();
      const gente = [
        p.ip ? `${t("pr.ip")}: ${p.ip}` : "",
        p.coip ? `${t("pr.coip")}: ${p.coip}` : "",
      ].filter(Boolean).join("   ·   ");
      const dinero = p.amount
        ? eur.format(Number(p.amount))
          + (p.amount_basis === "uva" ? ` (${t("pr.uva")})` : "")
        : "";

      const cuando = [{ text: `${p.from}–${p.to}`, color: APAGADO }];
      if (vivo) cuando.push({ text: `    ${t("proj.active").toUpperCase()}`,
                              color: NARANJA, bold: true });

      const titulo = [];
      if (p.acronym) titulo.push({ text: `${p.acronym}    `, color: tinta,
                                   bold: true });
      titulo.push({ text: P.title || "" });

      const pie = [];
      if (dinero) pie.push({ text: dinero, color: SUAVE, bold: true });
      if (p.ref) pie.push({ text: `${dinero ? "   ·   " : ""}${p.ref}`,
                            color: APAGADO });
      if (p.url) {
        pie.push({ text: pie.length ? "   ·   " : "", color: APAGADO });
        pie.push(enlace(t("pdf.record"), p.url, 8.1));
      }

      const dentro = [
        { text: cuando, style: "cuando" },
        { text: titulo, style: "proyH" },
        { text: sello, style: "papel", color: tinta },
        { text: (p.funder || "") + (P.note ? ` — ${P.note}` : ""),
          style: "cuerpo", color: SUAVE },
      ];
      if (gente) dentro.push({ text: gente, style: "meta" });
      if (pie.length) dentro.push({ text: pie, style: "meta",
                                    margin: [0, 2, 0, 0] });

      bloques.push(caja(dentro, {
        banda: vivo ? NARANJA_CLARO : AZUL_CLARO,
        fondo: vivo ? NARANJA_BG : GRIS_BG,
      }));
    });

    return bloques;
  }

  /* ── 04 docencia ─────────────────────────────────────────── */

  function entradaTrabajo(n, titulo, pie) {
    return {
      unbreakable: true,
      margin: [0, 0, 0, 6],
      columns: [
        { text: `${n}.`, width: 22, style: "num" },
        { stack: [
            { text: titulo, bold: true, fontSize: 9 },
            { text: pie, style: "meta" },
          ] },
      ],
    };
  }

  function docencia() {
    const a = ctx.content.atenea;
    const A = a[ctx.lang];
    const fmt = nf();
    const bloques = [cabecera(4, "sec-doc", t("teach.h"), null)];

    const dentro = [
      { text: [
          { text: t("atenea.h"), bold: true, fontSize: 12.5, color: AZUL },
          { text: `     ${A.role.toUpperCase()}`, color: NARANJA,
            fontSize: 7.5, bold: true, characterSpacing: 1.2 },
        ] },
      { text: [
          { text: A.expansion },
          { text: "   " },
          enlace("atenea.uva.es", "https://atenea.uva.es/", 8.1),
        ], style: "meta", margin: [0, 2, 0, 9] },
      { columns: a.stats.map((s, i) => ({
          width: "*",
          stack: [
            { text: fmt.format(s.value), fontSize: 15, bold: true,
              color: i % 2 ? NARANJA : AZUL },
            { text: t(s.key).toUpperCase(), style: "cifraPie" },
          ],
        })), margin: [0, 0, 0, 11] },
      { text: conNegritas(A.text), style: "cuerpo", margin: [0, 0, 0, 6] },
      { text: A.award, style: "cuerpo", bold: true, color: NARANJA,
        margin: [0, 0, 0, 6] },
      { text: conNegritas(A.next), style: "cuerpo" },
    ];

    bloques.push(caja([
      imagenes.atenea
        ? { columns: [{ image: imagenes.atenea, width: 40,
                        margin: [0, 2, 0, 0] },
                      { width: "*", stack: dentro }],
            columnGap: 13 }
        : { stack: dentro },
    ], { banda: AZUL, fondo: AZUL_BG, abajo: 4 }));

    // Asignaturas: dos columnas, con las filas alternadas para no
    // perder el renglón en una lista de veintitantas.
    const cursos = ctx.content.teaching.map((c) => c[ctx.lang]);
    bloques.push(barra(t("teach.courses"), cursos.length));
    const mitad = Math.ceil(cursos.length / 2);
    const celda = (C) => (C
      ? { stack: [{ text: C.name, bold: true, fontSize: 8.9 },
                  { text: C.degree, style: "meta" }] }
      : { text: "" });
    const filas = [];
    for (let i = 0; i < mitad; i += 1) {
      filas.push([celda(cursos[i]), celda(cursos[i + mitad])]);
    }
    bloques.push({
      table: { widths: ["*", "*"], body: filas },
      layout: {
        defaultBorder: false,
        fillColor: (fila) => (fila % 2 ? GRIS_BG : null),
        paddingLeft: () => 9, paddingRight: () => 9,
        paddingTop: () => 5, paddingBottom: () => 5,
      },
    });

    // Tesis en dirección.
    bloques.push(barra(t("sup.h.phd"),
      `${ctx.content.theses.length} ${t("sup.inprog")}`));
    ctx.content.theses.forEach((th, i) => {
      bloques.push(entradaTrabajo(i + 1, th[ctx.lang],
        `${th.student} · ${th.programme[ctx.lang]} · ${th.from}–`));
    });

    // TFM y TFG.
    ["tfm", "tfg"].forEach((kind) => {
      const items = (ctx.content.tfgs || []).filter((x) => x.kind === kind);
      if (!items.length) return;
      bloques.push(barra(t("sup.h." + kind), items.length));
      items.forEach((x, i) => {
        bloques.push(entradaTrabajo(i + 1, x[ctx.lang],
          [x.student, x.degree[ctx.lang], x.course].filter(Boolean)
            .join(" · ")));
      });
    });

    return bloques;
  }

  /* ── 05 reconocimiento ───────────────────────────────────── */

  function reconocimiento() {
    // Mismo criterio que la web: del raspado solo entran los premios
    // confirmados, y los docentes vienen a mano de content.json.
    const permitidos = ctx.content.awards_confirmed_by_cv || [];
    const raspados = (ctx.profile.awards || [])
      .filter((a) => a.confirmed
        || permitidos.some((aguja) => a.text.includes(aguja)))
      .map((a) => ({ year: a.year, text: a.text }));
    const extra = (ctx.content.awards_extra || [])
      .map((a) => ({ year: a.year, text: a[ctx.lang] }));
    const premios = [...raspados, ...extra]
      .sort((a, b) => (b.year || 0) - (a.year || 0));

    const bloques = [cabecera(5, "sec-rec", t("rec.h"), null)];
    bloques.push({ text: t("rec.lede"), style: "lede" });

    bloques.push(barra(t("rec.awards"), premios.length));
    premios.forEach((a) => {
      bloques.push({
        unbreakable: true,
        margin: [0, 0, 0, 6],
        columns: [
          { text: String(a.year || "—"), width: 34, fontSize: 8.6, bold: true,
            color: NARANJA },
          { text: a.text, style: "cuerpo" },
        ],
      });
    });

    bloques.push(barra(t("rec.service"), ctx.content.service.length,
      { color: AZUL, fondo: AZUL_BG }));
    bloques.push({
      ul: ctx.content.service.map((s) => s[ctx.lang]),
      style: "cuerpo", markerColor: AZUL_CLARO, margin: [9, 0, 0, 0],
    });

    bloques.push(barra(t("rec.ip"), null));
    (ctx.content.patents || []).forEach((p) => {
      bloques.push(caja([
        { text: t("rec.patent").toUpperCase(), style: "kicker",
          color: NARANJA },
        { text: p[ctx.lang], bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
        { text: `${p.number}   ·   ${p.pct}   ·   `
            + `${t("rec.patent.of")}: ${p.holder}`, style: "meta" },
      ], { banda: NARANJA_CLARO, fondo: NARANJA_BG }));
    });
    bloques.push({ text: t("rec.ip.soft"), style: "grupoH",
                   margin: [0, 4, 0, 6] });
    bloques.push({
      ul: ctx.content.ip.map((s) => s[ctx.lang]),
      style: "cuerpo", markerColor: APAGADO, margin: [9, 0, 0, 0],
    });

    return bloques;
  }

  /* ── 06 contacto ─────────────────────────────────────────── */

  function contacto() {
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const bloques = [cabecera(6, "sec-con", t("contact.h"), null)];

    bloques.push(caja([{
      columns: [
        { width: "*", style: "cuerpo", lineHeight: 1.5,
          text: [t("contact.dept"), t("contact.school"),
                 "Paseo de Belén 15, 47011 Valladolid, España"].join("\n") },
        { width: "*", stack: [
            { text: t("contact.profiles"), style: "grupoH",
              margin: [0, 0, 0, 6] },
            ...PERFILES.map(([nombre, id, url]) => ({
              margin: [0, 0, 0, 4],
              // Los que no tienen numero (Scholar, el Portal, el CVN)
              // llevan el enlace en el propio nombre: si no, se
              // quedaban sin enlace ninguno.
              text: id
                ? [{ text: `${nombre} `, fontSize: 8.6, bold: true },
                   enlace(id, url, 8.6)]
                : [enlace(nombre, url, 8.6)],
            })),
          ] },
      ],
      columnGap: 22,
    }], { banda: AZUL_CLARO, fondo: GRIS_BG }));

    // La cita cierra el documento. Abrir un currículum con ella era
    // raro; cerrarlo, no.
    const cita = ctx.content.epigraph;
    if (cita) {
      bloques.push(regla(FILETE, 0.5, 22, 12));
      bloques.push({ text: cita.lines.join(" "), style: "cita" });
      bloques.push({ text: `— ${cita.author.toUpperCase()}`, style: "firma" });
    }

    bloques.push(regla(FILETE, 0.5, 20, 7));
    bloques.push({
      text: [
        { text: t("pdf.note").replace("{date}",
            wos.as_of ? fechaLarga(wos.as_of) : "—") },
        { text: "\n" },
        { text: t("pdf.gen").replace("{url}", URL_SITIO)
            .replace("{date}", fechaLarga()) },
      ],
      style: "colofon",
    });
    return bloques;
  }

  /* ── el documento ────────────────────────────────────────── */

  function documento(recursos) {
    // Admite la foto suelta por compatibilidad con la pagina de
    // prueba, que llamaba a documento(dataUri).
    imagenes = typeof recursos === "string"
      ? { retrato: recursos, atenea: "" }
      : { retrato: "", atenea: "", ...(recursos || {}) };
    const img = imagenes.retrato;

    return {
      pageSize: "A4",
      pageMargins: [52, 46, 52, 56],
      info: {
        title: `Javier Gómez Pilar — ${t("pdf.kicker")}`,
        author: "Javier Gómez Pilar",
        subject: t("hero.eyebrow"),
      },
      content: [
        identidad(img),
        cifras(),
        indice(),
        ...investigacion(),
        ...publicaciones(),
        ...proyectos(),
        ...docencia(),
        ...reconocimiento(),
        ...contacto(),
      ],
      // Una cabecera de sección sola al pie de la página no dice
      // nada: si no le caben detrás unas cuantas líneas, se baja
      // entera a la siguiente.
      pageBreakBefore: (nodo, siguientes) =>
        nodo.headlineLevel === 1 && siguientes.length > 0
        && siguientes.length < 3,
      footer: (pagina, total) => (pagina === 1 ? null : {
        margin: [52, 16, 52, 0],
        columns: [
          { text: `Javier Gómez Pilar · ${t("pdf.kicker")}`, style: "pie" },
          { text: `${pagina} / ${total}`, style: "pie", alignment: "right" },
        ],
      }),
      defaultStyle: { font: "Roboto", fontSize: 9, color: TINTA,
                      lineHeight: 1.3 },
      styles: {
        cita: { fontSize: 10.5, italics: true, color: SUAVE,
                lineHeight: 1.5, alignment: "center" },
        firma: { fontSize: 7, characterSpacing: 1.4, color: APAGADO,
                 alignment: "center", margin: [0, 6, 0, 0] },
        kicker: { fontSize: 7.5, bold: true, characterSpacing: 1.8,
                  color: AZUL },
        nombre: { fontSize: 29, bold: true, margin: [0, 2, 0, 5] },
        cargo: { fontSize: 13, bold: true, margin: [0, 0, 0, 5] },
        afiliacion: { fontSize: 9, color: SUAVE, lineHeight: 1.45 },
        eyebrow: { fontSize: 7.2, characterSpacing: 1.1, color: APAGADO,
                   margin: [0, 9, 0, 0] },
        cifraPie: { fontSize: 6.6, characterSpacing: .9, color: APAGADO,
                    margin: [0, 3, 0, 0] },
        colofon: { fontSize: 7.4, color: APAGADO, lineHeight: 1.5 },
        lede: { fontSize: 10.2, color: SUAVE, lineHeight: 1.4,
                margin: [0, 0, 0, 12] },
        grupoH: { fontSize: 10, bold: true },
        tablaH: { fontSize: 7.4, characterSpacing: 1.2, color: APAGADO,
                  margin: [0, 0, 0, 4] },
        cuerpo: { fontSize: 9, lineHeight: 1.35 },
        meta: { fontSize: 8.1, color: APAGADO, lineHeight: 1.35 },
        num: { fontSize: 7.6, color: AZUL_CLARO, bold: true,
               margin: [0, 1.5, 0, 0] },
        ref: { fontSize: 8.7, lineHeight: 1.3 },
        lineaH: { fontSize: 11, bold: true },
        senales: { fontSize: 7.3, characterSpacing: 1, color: NARANJA },
        cuando: { fontSize: 7.6, characterSpacing: .8, margin: [0, 0, 0, 3] },
        proyH: { fontSize: 10.2, bold: true, margin: [0, 0, 0, 3] },
        papel: { fontSize: 7.5, characterSpacing: .9, margin: [0, 0, 0, 3] },
        pie: { fontSize: 7.2, color: APAGADO },
      },
    };
  }

  /* ── carga y descarga ────────────────────────────────────── */

  let cargando = null;

  function carga(url) {
    return new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = ok;
      s.onerror = () => mal(new Error(url));
      document.head.appendChild(s);
    });
  }

  /* Dos megas de librería: se piden la primera vez que se pulsa el
     botón, no al cargar la página. */
  function libreria() {
    if (window.pdfMake?.vfs) return Promise.resolve();
    if (!cargando) {
      cargando = carga(`${BASE}/pdfmake.min.js`)
        .then(() => carga(`${BASE}/vfs_fonts.js`))
        .catch((err) => { cargando = null; throw err; });
    }
    return cargando;
  }

  function nombreFichero() {
    const hoy = new Date().toISOString().slice(0, 10);
    return `Javier-Gomez-Pilar-CV-${ctx.lang}-${hoy}.pdf`;
  }

  function genera(contexto) {
    ctx = contexto;
    if (!ctx?.content || !ctx?.profile) {
      return Promise.reject(new Error("sin datos"));
    }
    return Promise.all([libreria(), foto(), silueta(RUTA_ATENEA, AZUL)])
      .then(([, retrato, atenea]) => {
        window.pdfMake.createPdf(documento({ retrato, atenea }))
          .download(nombreFichero());
      });
  }

  // document(), foto() y setCtx() los usa la comprobación del PDF.
  window.JGPPdf = {
    generate: genera,
    document: documento,
    foto,
    silueta,
    RUTA_ATENEA,
    setCtx: (c) => { ctx = c; },
  };
})();
