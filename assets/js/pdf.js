/* ─────────────────────────────────────────────────────────────
   Javier Gómez Pilar — el dosier en PDF

   El botón no imprime la página: genera un PDF de verdad y lo
   descarga. El documento se compone aquí, con pdfmake, a partir de
   los mismos datos que la web (content.json y profile.json) y en el
   idioma que esté activo.

   Se hace en el navegador y no en un servidor porque no hay servidor:
   esto es GitHub Pages. pdfmake pesa dos megas, así que se carga la
   primera vez que se pulsa el botón y no antes.

   Lo que no entra: el correo electrónico, que no está en ninguna
   parte del sitio, y las calificaciones de los trabajos dirigidos,
   que son rendimiento académico de terceros.
   ───────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const VERSION = "0.2.12";
  const BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdfmake/${VERSION}`;

  const URL_SITIO = "jgompil.github.io/Javier-Gomez-Pilar";
  const SURNAME = /(G[oó]mez[-\s]?Pilar|G[oó]mez\s+Pilar)/i;

  /* A4 son 595,28 pt de ancho; con 54 de margen a cada lado quedan
     487 para el contenido. Hace falta el número para dibujar las
     reglas, que en pdfmake son líneas de un canvas. */
  const ANCHO = 487;

  const TINTA = "#16222e";
  const SUAVE = "#41566b";
  const APAGADO = "#73869b";
  const FILETE = "#ccd5dc";
  const AZUL = "#184a9e";

  const ORDEN_TIPOS = ["journal", "book", "conf_int", "conf_nat",
                       "conf_teach", "journal_other"];

  const PERFILES = [
    ["ORCID", "0000-0001-7882-7890", "orcid.org/0000-0001-7882-7890"],
    ["Scopus", "55977922600", "scopus.com/authid/detail.url?authorId=55977922600"],
    ["Web of Science", "B-9123-2018",
     "webofscience.com/wos/author/record/B-9123-2018"],
    ["Google Scholar", "", "scholar.google.es/citations?user=m8XACpMAAAAJ"],
    ["Portal de la Ciencia UVa", "",
     "portaldelaciencia.uva.es/investigadores/180080/detalle"],
    ["CVN-FECYT", "", "cvn.fecyt.es/0000-0001-7882-7890"],
  ];

  let ctx = null;

  const t = (clave) => ctx?.content?.ui?.[ctx.lang]?.[clave] ?? clave;
  const loc = () => (ctx.lang === "es" ? "es-ES" : "en-GB");
  const nf = () => new Intl.NumberFormat(loc());
  const euros = () => new Intl.NumberFormat(loc(), {
    style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const fechaLarga = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(loc(),
      { day: "numeric", month: "long", year: "numeric" });
  };

  /* ── piezas de maquetación ───────────────────────────────── */

  const regla = (color, grosor, arriba, abajo) => ({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: ANCHO, y2: 0,
               lineWidth: grosor, lineColor: color }],
    margin: [0, arriba, 0, abajo],
  });

  /* Su apellido en negrita dentro de la lista de autores: en un CV es
     lo primero que busca quien lo lee. pdfmake no entiende HTML, así
     que la línea se parte en trozos con estilo propio. split() con un
     grupo de captura deja las coincidencias en las posiciones
     impares. */
  function autores(lista) {
    return String(lista).split(SURNAME).map((trozo, i) => (
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

  const doiLimpio = (doi) =>
    String(doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");

  /* Cada sección arranca en página nueva, con su número, su título y,
     si la tiene, su cuenta a la derecha. */
  function cabecera(n, titulo, extra) {
    return [
      {
        pageBreak: "before",
        columns: [
          { text: String(n).padStart(2, "0"), width: 26, style: "secn" },
          { text: titulo, style: "sech" },
          extra
            ? { text: extra, width: 60, style: "secn", alignment: "right" }
            : { text: "", width: 1 },
        ],
      },
      regla(AZUL, 1.1, 5, 16),
    ];
  }

  function tituloGrupo(texto, cuenta) {
    return {
      unbreakable: true,
      margin: [0, 10, 0, 0],
      stack: [
        { columns: [
            { text: texto, style: "grupoH" },
            cuenta != null
              ? { text: String(cuenta), width: 60, style: "meta",
                  alignment: "right", margin: [0, 3, 0, 0] }
              : { text: "", width: 1 },
          ] },
        regla(FILETE, 0.5, 3, 9),
      ],
    };
  }

  /* ── portada ─────────────────────────────────────────────── */

  function portada() {
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const fmt = nf();
    const cita = ctx.content.epigraph;

    const cifras = [
      [fmt.format(m.jcr_articles), t("m.jcr")],
      [fmt.format(m.quartiles.Q1 ?? 0), t("m.q1")],
      [wos.citations != null ? fmt.format(wos.citations) : "—", t("m.cit")],
      [wos.h_index != null ? fmt.format(wos.h_index) : "—", t("m.h")],
    ];

    const bloques = [];

    if (cita) {
      bloques.push({ text: cita.lines.join("\n"), style: "cita" });
      bloques.push({ text: `— ${cita.author.toUpperCase()}`, style: "firma" });
      bloques.push(regla(FILETE, 0.5, 18, 0));
    }

    bloques.push(
      { text: t("pdf.kicker").toUpperCase(), style: "kicker",
        margin: [0, 95, 0, 7] },
      { text: "Javier Gómez Pilar", style: "nombre" },
      { text: t("hero.pos"), style: "cargo" },
      { text: [t("contact.dept"), t("contact.school"),
               `${t("hero.group")} · CIBER-BBN`].join("\n"),
        style: "afiliacion" },
      { text: t("hero.eyebrow").toUpperCase(), style: "eyebrow" },
      regla(FILETE, 0.7, 24, 0),
      { columns: cifras.map(([valor, etiqueta]) => ({
          width: "*",
          stack: [
            { text: valor, style: "cifra" },
            { text: etiqueta.toUpperCase(), style: "cifraPie" },
          ],
        })),
        columnGap: 10, margin: [0, 13, 0, 13] },
      regla(FILETE, 0.7, 0, 0),
    );

    // El colofón se ancla al pie de la portada: pdfmake no tiene nada
    // parecido a un flex, así que va en posición absoluta.
    bloques.push({
      absolutePosition: { x: 54, y: 735 },
      stack: [
        { text: PERFILES.map(([n, id]) => (id ? `${n} ${id}` : n))
            .join("  ·  "), style: "colofon", width: ANCHO },
        { text: t("pdf.gen").replace("{url}", URL_SITIO)
            .replace("{date}", fechaLarga()),
          style: "colofon", margin: [0, 6, 0, 0] },
      ],
    });

    return bloques;
  }

  /* ── 01 investigación ────────────────────────────────────── */

  function investigacion() {
    const bloques = cabecera(1, t("research.h"), null);
    bloques.push({ text: t("research.lede"), style: "lede" });

    ctx.content.lines.forEach((linea, i) => {
      const L = linea[ctx.lang];
      bloques.push({
        unbreakable: true,
        margin: [0, 0, 0, 15],
        stack: [
          { columns: [
              { text: String(i + 1).padStart(2, "0"), width: 26, style: "secn",
                margin: [0, 2, 0, 0] },
              { text: L.title, style: "lineaH" },
            ] },
          { text: L.text, style: "cuerpo", margin: [26, 5, 0, 5] },
          { text: linea.signals.join("   ·   ").toUpperCase(),
            style: "senales", margin: [26, 0, 0, 0] },
        ],
      });
    });
    return bloques;
  }

  /* ── 02 publicaciones ────────────────────────────────────── */

  function tablaCifras(titulo, pares) {
    return {
      width: "*",
      stack: [
        { text: titulo.toUpperCase(), style: "tablaH" },
        { table: {
            widths: ["*", "auto"],
            body: pares.map(([k, v]) => [
              { text: k, style: "cuerpo", color: SUAVE },
              { text: v, style: "dato", alignment: "right" },
            ]),
          },
          layout: {
            hLineWidth: (i, nodo) => (i === 0 ? 0 : 0.5),
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

    const bloques = cabecera(2, t("pub.h"), fmt.format(todas.length));

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
        ]),
        tablaCifras(t("f.kind"), ORDEN_TIPOS
          .filter((k) => (m.by_kind || {})[k])
          .map((k) => [t("k." + k), fmt.format(m.by_kind[k])])),
      ],
      columnGap: 26,
    });

    ORDEN_TIPOS.forEach((tipo) => {
      const items = todas
        .filter((p) => (p.kind || "journal") === tipo)
        .sort((a, b) => (b.year - a.year) || ((b.month || 0) - (a.month || 0)));
      if (!items.length) return;

      bloques.push(tituloGrupo(t("k." + tipo), items.length));

      // Numeradas de la más reciente a la más antigua, que es como se
      // listan en un CV y como se citan en una solicitud.
      items.forEach((p, i) => {
        const doi = doiLimpio(p.doi);
        const donde = [
          p.journal || "",
          p.volume ? `vol. ${p.volume}` : "",
          p.pages ? `pp. ${p.pages}` : "",
        ].filter(Boolean).join(", ");
        const insignias = [p.quartile || "", p.top_decile ? "D1" : ""]
          .filter(Boolean).join(" · ");

        const texto = [
          ...autores(p.authors),
          { text: ` (${p.year}). `, color: SUAVE },
          { text: p.title, bold: true, color: TINTA },
        ];
        if (donde) texto.push({ text: `. ${donde}`, color: SUAVE,
                                italics: true });
        if (doi) texto.push({ text: `. doi.org/${doi}`, color: APAGADO,
                              fontSize: 7.4 });
        if (insignias) texto.push({ text: `   ${insignias}`, color: AZUL,
                                    bold: true, fontSize: 7.4 });

        bloques.push({
          unbreakable: true,
          margin: [0, 0, 0, 5],
          columns: [
            { text: String(items.length - i), width: 24, style: "num" },
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
      amount_basis: "uva", live: p.live,
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
    const bloques = cabecera(3, t("proj.h"), nf().format(lista.length));

    lista.forEach((p) => {
      const P = p[ctx.lang] || {};
      const vivo = p.live !== undefined ? p.live : Number(p.to) >= ahora;
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
      const pie = [dinero, p.ref || ""].filter(Boolean).join("   ·   ");

      const cuando = [{ text: `${p.from}–${p.to}`, color: APAGADO }];
      if (vivo) cuando.push({ text: `    ${t("proj.active").toUpperCase()}`,
                              color: AZUL });

      const titulo = [];
      if (p.acronym) titulo.push({ text: `${p.acronym}    `, color: AZUL,
                                   bold: true });
      titulo.push({ text: P.title || "" });

      const dentro = [
        { text: cuando, style: "cuando" },
        { text: titulo, style: "proyH" },
        { text: sello, style: "papel" },
        { text: (p.funder || "") + (P.note ? ` — ${P.note}` : ""),
          style: "cuerpo", color: SUAVE },
      ];
      if (gente) dentro.push({ text: gente, style: "meta" });
      if (pie) dentro.push({ text: pie, style: "meta" });

      // El filete de la izquierda se hace con el borde de una tabla
      // de una sola celda, y no con una linea dibujada: una linea
      // tiene el alto que le pongas, y las fichas no miden todas lo
      // mismo. Asi acompana al bloque, mida lo que mida.
      bloques.push({
        unbreakable: true,
        margin: [0, 0, 0, 11],
        table: { widths: ["*"], body: [[{ stack: dentro }]] },
        layout: {
          vLineWidth: (i) => (i === 0 ? 1 : 0),
          hLineWidth: () => 0,
          vLineColor: () => FILETE,
          paddingLeft: () => 11, paddingRight: () => 0,
          paddingTop: () => 1, paddingBottom: () => 3,
        },
      });
    });

    return bloques;
  }

  /* ── 04 docencia ─────────────────────────────────────────── */

  function recuadro(dentro) {
    return {
      unbreakable: true,
      margin: [0, 0, 0, 14],
      table: { widths: ["*"], body: [[{ margin: [13, 10, 13, 10],
                                        stack: dentro }]] },
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5,
        hLineColor: () => FILETE, vLineColor: () => FILETE,
      },
    };
  }

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
    const bloques = cabecera(4, t("teach.h"), null);

    bloques.push(recuadro([
      { text: [
          { text: t("atenea.h"), bold: true, fontSize: 12.5 },
          { text: `     ${A.role.toUpperCase()}`, color: AZUL, fontSize: 7.5,
            characterSpacing: 1.2 },
        ] },
      { text: A.expansion, style: "meta", margin: [0, 2, 0, 9] },
      { columns: a.stats.map((s) => ({
          width: "*",
          stack: [
            { text: fmt.format(s.value), fontSize: 14, bold: true,
              color: AZUL },
            { text: t(s.key).toUpperCase(), style: "cifraPie" },
          ],
        })), margin: [0, 0, 0, 11] },
      { text: conNegritas(A.text), style: "cuerpo", margin: [0, 0, 0, 6] },
      { text: A.award, style: "cuerpo", bold: true, margin: [0, 0, 0, 6] },
      { text: conNegritas(A.next), style: "cuerpo" },
    ]));

    // Asignaturas, a dos columnas.
    bloques.push(tituloGrupo(t("teach.courses"), ctx.content.teaching.length));
    const cursos = ctx.content.teaching.map((c) => c[ctx.lang]);
    const mitad = Math.ceil(cursos.length / 2);
    const columna = (trozo) => ({
      width: "*",
      stack: trozo.map((C) => ({
        margin: [0, 0, 0, 7],
        stack: [
          { text: C.name, bold: true, fontSize: 9.2 },
          { text: C.degree, style: "meta" },
        ],
      })),
    });
    bloques.push({
      columns: [columna(cursos.slice(0, mitad)), columna(cursos.slice(mitad))],
      columnGap: 26,
    });

    // Tesis en dirección.
    bloques.push(tituloGrupo(
      t("sup.h.phd"), `${ctx.content.theses.length} ${t("sup.inprog")}`));
    bloques.push({ text: t("sup.note"), style: "meta", margin: [0, 0, 0, 8] });
    ctx.content.theses.forEach((th, i) => {
      bloques.push(entradaTrabajo(i + 1, th[ctx.lang],
        `${th.student} · ${th.programme[ctx.lang]} · ${th.from}–`));
    });

    // TFM y TFG.
    ["tfm", "tfg"].forEach((kind) => {
      const items = (ctx.content.tfgs || []).filter((x) => x.kind === kind);
      if (!items.length) return;
      bloques.push(tituloGrupo(t("sup.h." + kind), items.length));
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

    const bloques = cabecera(5, t("rec.h"), null);
    bloques.push({ text: t("rec.lede"), style: "lede" });

    bloques.push(tituloGrupo(t("rec.awards"), premios.length));
    premios.forEach((a) => {
      bloques.push({
        unbreakable: true,
        margin: [0, 0, 0, 6],
        columns: [
          { text: String(a.year || "—"), width: 34, style: "num",
            color: AZUL },
          { text: a.text, style: "cuerpo" },
        ],
      });
    });

    bloques.push(tituloGrupo(t("rec.service"), ctx.content.service.length));
    bloques.push({
      ul: ctx.content.service.map((s) => s[ctx.lang]),
      style: "cuerpo", markerColor: APAGADO,
    });

    bloques.push(tituloGrupo(t("rec.ip"), null));
    (ctx.content.patents || []).forEach((p) => {
      bloques.push(recuadro([
        { text: t("rec.patent").toUpperCase(), style: "kicker" },
        { text: p[ctx.lang], bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
        { text: `${p.number}   ·   ${p.pct}   ·   `
            + `${t("rec.patent.of")}: ${p.holder}`, style: "meta" },
      ]));
    });
    bloques.push({ text: t("rec.ip.soft"), style: "grupoH",
                   margin: [0, 2, 0, 6] });
    bloques.push({
      ul: ctx.content.ip.map((s) => s[ctx.lang]),
      style: "cuerpo", markerColor: APAGADO,
    });

    return bloques;
  }

  /* ── 06 contacto ─────────────────────────────────────────── */

  function contacto() {
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const bloques = cabecera(6, t("contact.h"), null);

    bloques.push({
      columns: [
        { width: "*", style: "cuerpo", lineHeight: 1.5,
          text: [t("contact.dept"), t("contact.school"),
                 "Paseo de Belén 15, 47011 Valladolid, España"].join("\n") },
        { width: "*", stack: [
            { text: t("contact.profiles"), style: "grupoH",
              margin: [0, 0, 0, 6] },
            ...PERFILES.map(([nombre, id, url]) => ({
              margin: [0, 0, 0, 5],
              stack: [
                { text: id ? `${nombre} ${id}` : nombre, fontSize: 8.8,
                  bold: true },
                { text: url, style: "meta" },
              ],
            })),
          ] },
      ],
      columnGap: 26,
    });

    bloques.push(regla(FILETE, 0.5, 24, 7));
    bloques.push({
      text: t("pdf.note").replace("{date}",
        wos.as_of ? fechaLarga(wos.as_of) : "—"),
      style: "colofon",
    });
    return bloques;
  }

  /* ── el documento ────────────────────────────────────────── */

  function documento() {
    return {
      pageSize: "A4",
      pageMargins: [54, 52, 54, 58],
      info: {
        title: `Javier Gómez Pilar — ${t("pdf.kicker")}`,
        author: "Javier Gómez Pilar",
        subject: t("hero.eyebrow"),
      },
      content: [
        ...portada(),
        ...investigacion(),
        ...publicaciones(),
        ...proyectos(),
        ...docencia(),
        ...reconocimiento(),
        ...contacto(),
      ],
      // La portada no lleva pie. El resto, nombre a la izquierda y
      // número de página a la derecha.
      footer: (pagina, total) => (pagina === 1 ? null : {
        margin: [54, 18, 54, 0],
        columns: [
          { text: `Javier Gómez Pilar · ${t("pdf.kicker")}`, style: "pie" },
          { text: `${pagina} / ${total}`, style: "pie", alignment: "right" },
        ],
      }),
      defaultStyle: { font: "Roboto", fontSize: 9, color: TINTA,
                      lineHeight: 1.3 },
      styles: {
        cita: { fontSize: 13, italics: true, color: SUAVE, lineHeight: 1.55 },
        firma: { fontSize: 7.5, characterSpacing: 1.4, color: APAGADO,
                 margin: [0, 9, 0, 0] },
        kicker: { fontSize: 7.5, bold: true, characterSpacing: 1.8,
                  color: AZUL },
        nombre: { fontSize: 31, bold: true, margin: [0, 0, 0, 6] },
        cargo: { fontSize: 13.5, bold: true, margin: [0, 0, 0, 6] },
        afiliacion: { fontSize: 9.2, color: SUAVE, lineHeight: 1.45 },
        eyebrow: { fontSize: 7.2, characterSpacing: 1.1, color: APAGADO,
                   margin: [0, 11, 0, 0] },
        cifra: { fontSize: 21, bold: true, color: AZUL },
        cifraPie: { fontSize: 6.6, characterSpacing: .9, color: APAGADO,
                    margin: [0, 3, 0, 0] },
        colofon: { fontSize: 7.4, color: APAGADO, lineHeight: 1.4 },
        secn: { fontSize: 8.5, bold: true, color: AZUL, characterSpacing: .6,
                margin: [0, 7, 0, 0] },
        sech: { fontSize: 17, bold: true },
        lede: { fontSize: 10.4, color: SUAVE, lineHeight: 1.4,
                margin: [0, 0, 0, 14] },
        grupoH: { fontSize: 10.5, bold: true },
        tablaH: { fontSize: 7.4, characterSpacing: 1.2, color: APAGADO,
                  margin: [0, 0, 0, 4] },
        dato: { fontSize: 9.6, bold: true },
        cuerpo: { fontSize: 9, lineHeight: 1.35 },
        meta: { fontSize: 8.1, color: APAGADO, lineHeight: 1.3 },
        num: { fontSize: 7.6, color: APAGADO, margin: [0, 1.5, 0, 0] },
        ref: { fontSize: 8.7, lineHeight: 1.3 },
        lineaH: { fontSize: 11.5, bold: true },
        senales: { fontSize: 7.3, characterSpacing: 1, color: APAGADO },
        cuando: { fontSize: 7.6, characterSpacing: .8, margin: [0, 0, 0, 3] },
        proyH: { fontSize: 10.3, bold: true, margin: [0, 0, 0, 3] },
        papel: { fontSize: 7.5, characterSpacing: .9, color: AZUL,
                 margin: [0, 0, 0, 3] },
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
    return `Javier-Gomez-Pilar-${ctx.lang === "es" ? "dosier" : "dossier"}`
      + `-${hoy}.pdf`;
  }

  function genera(contexto) {
    ctx = contexto;
    if (!ctx?.content || !ctx?.profile) {
      return Promise.reject(new Error("sin datos"));
    }
    return libreria().then(() => {
      window.pdfMake.createPdf(documento()).download(nombreFichero());
    });
  }

  // document() y setCtx() los usa la comprobacion de scripts/preview_pdf.
  window.JGPPdf = {
    generate: genera,
    document: documento,
    setCtx: (c) => { ctx = c; },
  };
})();
