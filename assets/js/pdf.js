/* ─────────────────────────────────────────────────────────────
   Javier Gómez Pilar — exportación a PDF

   La web se lee por pestañas y filtros: una cosa cada vez. Un PDF no
   puede funcionar así, porque nadie va a pulsar nada. Así que no se
   imprime la página, se construye un documento aparte con todo el
   contenido de content.json y profile.json en el idioma activo, y se
   imprime ese. El navegador lo convierte en PDF desde su propio
   diálogo ("Guardar como PDF" / "Save as PDF").

   El documento vive solo mientras dura la impresión: se monta al
   pulsar el botón y se retira al cerrar el diálogo. En pantalla nunca
   se ve (display: none), y el CSS de impresión lo deja a él solo.

   Lo que no entra: el correo electrónico, que no está en ninguna
   parte del sitio, y las calificaciones de los trabajos dirigidos,
   que son rendimiento académico de terceros.
   ───────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const URL_SITIO = "jgompil.github.io/Javier-Gomez-Pilar";
  const SURNAME = /(G[oó]mez[-\s]?Pilar|G[oó]mez\s+Pilar)/gi;

  // El orden en que un currículum enumera la producción: primero lo
  // que se acredita, después lo demás.
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

  let ctx = null;

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const t = (key) => ctx?.content?.ui?.[ctx.lang]?.[key] ?? key;

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

  /* Su apellido en negrita dentro de la lista de autores: en un CV es
     lo primero que busca quien lo lee. */
  const resalta = (autores) =>
    esc(autores).replace(SURNAME, "<b>$1</b>");

  /* El DOI viene unas veces desnudo y otras como URL entera. */
  const doiLimpio = (doi) =>
    String(doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");

  /* ── piezas ──────────────────────────────────────────────── */

  function seccion(n, titulo, cuerpo, extra) {
    return `
      <section class="pdf-sec">
        <h2><span class="pdf-n">${String(n).padStart(2, "0")}</span>`
      + `${esc(titulo)}${extra ? `<i>${esc(extra)}</i>` : ""}</h2>
        ${cuerpo}
      </section>`;
  }

  /* La cita de apertura, la misma que preside la web y en el mismo
     idioma siempre: una cita no se traduce. */
  function epigrafe() {
    const c = ctx.content.epigraph;
    if (!c) return "";
    return `
      <blockquote class="pdf-epi">
        <p>${c.lines.map((l) => `<span>${esc(l)}</span>`).join(" ")}</p>
        <cite>${esc(c.author)}</cite>
      </blockquote>`;
  }

  function portada() {
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const fmt = nf();
    const cifras = [
      [fmt.format(m.jcr_articles), t("m.jcr")],
      [fmt.format(m.quartiles.Q1 ?? 0), t("m.q1")],
      [wos.citations != null ? fmt.format(wos.citations) : "—", t("m.cit")],
      [wos.h_index != null ? fmt.format(wos.h_index) : "—", t("m.h")],
    ];

    return `
      <header class="pdf-cover">
        ${epigrafe()}
        <div class="pdf-ident">
        <p class="pdf-kicker">${esc(t("pdf.kicker"))}</p>
        <h1>Javier Gómez Pilar</h1>
        <p class="pdf-role">${esc(t("hero.pos"))}</p>
        <p class="pdf-affil">${esc(t("contact.dept"))}<br>`
      + `${esc(t("contact.school"))}<br>`
      + `${esc(t("hero.group"))} · CIBER-BBN</p>
        <p class="pdf-eyebrow">${esc(t("hero.eyebrow"))}</p>
        <p class="pdf-thesis">${esc(t("hero.thesis"))}</p>
        <ul class="pdf-metrics">
          ${cifras.map(([v, k]) => `
            <li><b>${esc(v)}</b><span>${esc(k)}</span></li>`).join("")}
        </ul>
        </div>
        <footer class="pdf-colofon">
          <p class="pdf-ids">${PERFILES.map(([nombre, id]) =>
              `${esc(nombre)}${id ? ` ${esc(id)}` : ""}`).join(" · ")}</p>
          <p class="pdf-gen">${esc(t("pdf.gen")
              .replace("{url}", URL_SITIO)
              .replace("{date}", fechaLarga()))}</p>
        </footer>
      </header>`;
  }

  function investigacion() {
    const cuerpo = `
      <p class="pdf-lede">${esc(t("research.lede"))}</p>
      ${ctx.content.lines.map((linea, i) => {
        const L = linea[ctx.lang];
        return `
          <article class="pdf-line">
            <h3><span class="pdf-ln">${String(i + 1).padStart(2, "0")}</span>`
          + `${esc(L.title)}</h3>
            <p>${esc(L.text)}</p>
            <p class="pdf-signals">${linea.signals.map(esc).join(" · ")}</p>
          </article>`;
      }).join("")}`;
    return seccion(1, t("research.h"), cuerpo);
  }

  function resumenBibliometrico() {
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const fmt = nf();
    const q = m.quartiles || {};

    const filas = [
      [t("m.jcr"), fmt.format(m.jcr_articles)],
      ["Q1", fmt.format(q.Q1 ?? 0)],
      ["Q2", fmt.format(q.Q2 ?? 0)],
      ["Q3", fmt.format(q.Q3 ?? 0)],
      ["Q4", fmt.format(q.Q4 ?? 0)],
      [t("g.q.d1"), fmt.format(q.D1 ?? 0)],
      [t("m.cit"), wos.citations != null ? fmt.format(wos.citations) : "—"],
      [t("m.h"), wos.h_index != null ? fmt.format(wos.h_index) : "—"],
    ];

    const porTipo = ORDEN_TIPOS
      .filter((k) => (m.by_kind || {})[k])
      .map((k) => [t("k." + k), fmt.format(m.by_kind[k])]);

    const tabla = (titulo, pares) => `
      <div class="pdf-tab">
        <h4>${esc(titulo)}</h4>
        <dl>${pares.map(([k, v]) =>
          `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      </div>`;

    return `
      <div class="pdf-tabs">
        ${tabla(t("pdf.bib"), filas)}
        ${tabla(t("f.kind"), porTipo)}
      </div>`;
  }

  function publicaciones() {
    const todas = ctx.profile.publications;
    const fmt = nf();

    const grupos = ORDEN_TIPOS.map((tipo) => {
      const items = todas
        .filter((p) => (p.kind || "journal") === tipo)
        .sort((a, b) => (b.year - a.year) || (b.month || 0) - (a.month || 0));
      if (!items.length) return "";

      // Numeradas de la más nueva a la más antigua, que es como se
      // listan en un CV y como se citan en una solicitud.
      return `
        <div class="pdf-group">
          <h3>${esc(t("k." + tipo))}<i>${fmt.format(items.length)}</i></h3>
          <ol class="pdf-refs" reversed start="${items.length}">
            ${items.map((p) => {
              const doi = doiLimpio(p.doi);
              const insignias = [
                p.quartile ? p.quartile : "",
                p.top_decile ? "D1" : "",
              ].filter(Boolean);
              const donde = [
                p.journal ? `<i>${esc(p.journal)}</i>` : "",
                p.volume ? `vol.&nbsp;${esc(p.volume)}` : "",
                p.pages ? `pp.&nbsp;${esc(p.pages)}` : "",
              ].filter(Boolean).join(", ");
              // La puntuacion va escrita, no dibujada con CSS: asi
              // una referencia copiada del PDF sigue leyendose.
              const partes = [
                `<span class="aut">${resalta(p.authors)}</span>`
                  + ` <span class="yr">(${esc(p.year)})</span>.`,
                `<span class="tit">${esc(p.title)}</span>.`,
                donde ? `<span class="src">${donde}</span>.` : "",
                doi ? `<span class="doi">doi.org/${esc(doi)}</span>` : "",
                insignias.length
                  ? `<span class="badge">${esc(insignias.join(" "))}</span>`
                  : "",
              ].filter(Boolean).join(" ");
              return `<li>${partes}</li>`;
            }).join("")}
          </ol>
        </div>`;
    }).join("");

    const cuerpo = resumenBibliometrico() + grupos;
    return seccion(2, t("pub.h"), cuerpo, fmt.format(todas.length));
  }

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

    const cuerpo = `
      <ol class="pdf-projs">
        ${lista.map((p) => {
          const P = p[ctx.lang] || {};
          const vivo = p.live !== undefined ? p.live : Number(p.to) >= ahora;
          const sello = [
            papel[p.role],
            p.scope ? t("pdf.scope." + p.scope) : "",
          ].filter(Boolean).join(" · ");
          const gente = [
            p.ip ? `${t("pr.ip")}: ${p.ip}` : "",
            p.coip ? `${t("pr.coip")}: ${p.coip}` : "",
          ].filter(Boolean).join(" · ");
          const dinero = p.amount
            ? eur.format(Number(p.amount))
              + (p.amount_basis === "uva" ? ` (${t("pr.uva")})` : "")
            : "";
          const pie = [dinero, p.ref || ""].filter(Boolean).join(" · ");
          return `
            <li class="pdf-proj">
              <p class="when">${esc(p.from)}–${esc(p.to)}`
            + (vivo ? ` <b>${esc(t("proj.active"))}</b>` : "") + `</p>
              <h3>${p.acronym ? `<span class="acr">${esc(p.acronym)}</span>` : ""}`
            + `${esc(P.title || "")}</h3>
              <p class="role">${esc(sello)}</p>
              <p class="funder">${esc(p.funder || "")}`
            + (P.note ? ` — ${esc(P.note)}` : "") + `</p>`
            + (gente ? `<p class="people">${esc(gente)}</p>` : "")
            + (pie ? `<p class="meta">${esc(pie)}</p>` : "")
            + `</li>`;
        }).join("")}
      </ol>`;
    return seccion(3, t("proj.h"), cuerpo, nf().format(lista.length));
  }

  function docencia() {
    const a = ctx.content.atenea;
    const A = a[ctx.lang];
    const fmt = nf();

    // El texto de ATENEA lleva <b> dentro, escrito a mano en
    // content.json: va tal cual, igual que en la web.
    const atenea = `
      <article class="pdf-atenea">
        <h3>${esc(t("atenea.h"))}<i>${esc(A.role)}</i></h3>
        <p class="sub">${esc(A.expansion)}</p>
        <ul class="pdf-stats">
          ${a.stats.map((s) => `
            <li><b>${fmt.format(s.value)}</b><span>${esc(t(s.key))}</span></li>`
          ).join("")}
        </ul>
        <p>${A.text}</p>
        <p class="award">${esc(A.award)}</p>
        <p>${A.next}</p>
      </article>`;

    const cursos = `
      <div class="pdf-group">
        <h3>${esc(t("teach.courses"))}<i>${fmt.format(ctx.content.teaching.length)}</i></h3>
        <ul class="pdf-courses">
          ${ctx.content.teaching.map((c) => {
            const C = c[ctx.lang];
            return `<li><b>${esc(C.name)}</b><span>${esc(C.degree)}</span></li>`;
          }).join("")}
        </ul>
      </div>`;

    const tesis = `
      <div class="pdf-group">
        <h3>${esc(t("sup.h.phd"))}<i>${ctx.content.theses.length} ${esc(t("sup.inprog"))}</i></h3>
        <p class="pdf-note">${esc(t("sup.note"))}</p>
        <ol class="pdf-works">
          ${ctx.content.theses.map((th) => `
            <li><b>${esc(th[ctx.lang])}</b>
              <span>${esc(th.student)} · ${esc(th.programme[ctx.lang])} · ${esc(th.from)}–</span>
            </li>`).join("")}
        </ol>
      </div>`;

    const bloque = (kind) => {
      const items = (ctx.content.tfgs || []).filter((x) => x.kind === kind);
      if (!items.length) return "";
      return `
        <div class="pdf-group">
          <h3>${esc(t("sup.h." + kind))}<i>${fmt.format(items.length)}</i></h3>
          <ol class="pdf-works">
            ${items.map((x) => `
              <li><b>${esc(x[ctx.lang])}</b>
                <span>`
              + (x.student ? `${esc(x.student)} · ` : "")
              + `${esc(x.degree[ctx.lang])} · ${esc(x.course)}</span>
              </li>`).join("")}
          </ol>
        </div>`;
    };

    return seccion(4, t("teach.h"),
      atenea + cursos + tesis + bloque("tfm") + bloque("tfg"));
  }

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

    const patentes = (ctx.content.patents || []).map((p) => `
      <article class="pdf-patent">
        <p class="kicker">${esc(t("rec.patent"))}</p>
        <h4>${esc(p[ctx.lang])}</h4>
        <p class="refs">${esc(p.number)} · ${esc(p.pct)} · `
      + `${esc(t("rec.patent.of"))}: ${esc(p.holder)}</p>
      </article>`).join("");

    const cuerpo = `
      <p class="pdf-lede">${esc(t("rec.lede"))}</p>
      <div class="pdf-group">
        <h3>${esc(t("rec.awards"))}<i>${nf().format(premios.length)}</i></h3>
        <ul class="pdf-awards">
          ${premios.map((a) => `
            <li><span class="yr">${esc(a.year || "—")}</span>`
          + `<span>${esc(a.text)}</span></li>`).join("")}
        </ul>
      </div>
      <div class="pdf-group">
        <h3>${esc(t("rec.service"))}<i>${nf().format(ctx.content.service.length)}</i></h3>
        <ul class="pdf-list">
          ${ctx.content.service.map((s) =>
            `<li>${esc(s[ctx.lang])}</li>`).join("")}
        </ul>
      </div>
      <div class="pdf-group">
        <h3>${esc(t("rec.ip"))}</h3>
        ${patentes}
        <h4 class="pdf-sub">${esc(t("rec.ip.soft"))}</h4>
        <ul class="pdf-list">
          ${ctx.content.ip.map((s) => `<li>${esc(s[ctx.lang])}</li>`).join("")}
        </ul>
      </div>`;
    return seccion(5, t("rec.h"), cuerpo);
  }

  function contacto() {
    const m = ctx.profile.metrics;
    const wos = m.wos || ctx.content.wos || {};
    const cuerpo = `
      <div class="pdf-two">
        <div>
          <p class="pdf-addr">
            ${esc(t("contact.dept"))}<br>
            ${esc(t("contact.school"))}<br>
            Paseo de Belén 15, 47011 Valladolid, España
          </p>
        </div>
        <div>
          <h4 class="pdf-sub">${esc(t("contact.profiles"))}</h4>
          <ul class="pdf-links">
            ${PERFILES.map(([nombre, id, url]) => `
              <li><b>${esc(nombre)}</b>${id ? ` ${esc(id)}` : ""}`
            + `<span>${esc(url.replace(/^https?:\/\//, ""))}</span></li>`
            ).join("")}
          </ul>
        </div>
      </div>
      <p class="pdf-foot">${esc(t("pdf.note")
          .replace("{date}", wos.as_of ? fechaLarga(wos.as_of) : "—"))}</p>`;
    return seccion(6, t("contact.h"), cuerpo);
  }

  /* ── montaje e impresión ─────────────────────────────────── */

  function construye() {
    const doc = document.createElement("article");
    doc.id = "pdf-doc";
    doc.lang = ctx.lang;
    doc.setAttribute("aria-hidden", "true");
    doc.innerHTML = portada() + investigacion() + publicaciones()
      + proyectos() + docencia() + reconocimiento() + contacto();
    return doc;
  }

  function imprime(contexto) {
    ctx = contexto;
    if (!ctx?.content || !ctx?.profile) return;

    document.getElementById("pdf-doc")?.remove();
    const doc = construye();
    document.body.appendChild(doc);
    document.documentElement.dataset.printing = "doc";

    const limpia = () => {
      doc.remove();
      delete document.documentElement.dataset.printing;
      window.removeEventListener("afterprint", limpia);
      medio?.removeEventListener?.("change", alCambiar);
    };
    // Safari no siempre dispara afterprint; el cambio de medio sí.
    const medio = window.matchMedia ? window.matchMedia("print") : null;
    const alCambiar = (ev) => { if (!ev.matches) limpia(); };
    window.addEventListener("afterprint", limpia);
    medio?.addEventListener?.("change", alCambiar);

    // Un fotograma para que el navegador componga el documento antes
    // de medirlo: si se imprime en el mismo tick, Chrome pagina a
    // veces con las fuentes todavía sin aplicar.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  window.JGPPdf = { print: imprime };
})();
