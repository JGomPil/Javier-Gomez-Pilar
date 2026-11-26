# javiergomezpilar — web personal

Web estática, bilingüe (ES/EN), para GitHub Pages. Las métricas bibliométricas se
regeneran solas cada semana; el resto del contenido se edita a mano en un único
fichero JSON.

---

## Qué se actualiza solo y qué no

| Bloque | Fuente | Frecuencia |
|---|---|---|
| Lista de artículos JCR, cuartiles, primer decil | GIB-UVa (`gib.uva.es/publications`) | Automático, lunes |
| Gráfica de citas por año | OpenAlex (perfiles `A5028137676` + `A5159625863`) | Automático, lunes |
| Último trabajo indexado | ORCID `0000-0001-7882-7890` | Automático, lunes |
| Premios de investigación | GIB-UVa (`gib.uva.es/awards`) | Automático, lunes |
| Proyectos: aportación UVa, si sigue vigente, ficha, altas nuevas | Portal de la Ciencia (`investigadores/180080/financiacion`) | Automático, lunes |
| Citas e índice h (Web of Science) | Web of Science Starter API (ResearcherID `B-9123-2018`) | Automático, lunes |
| Bio, líneas, proyectos, docencia, tesis, ATENEA, premios docentes | `data/content.json` | A mano, 1-2 veces al año |

### Citas e índice h de Web of Science

La web muestra las cifras de WoS, no las de OpenAlex, porque son las que usan
las comisiones de acreditación españolas. Desde noviembre de 2026 llegan solas
de la **Web of Science Starter API**, y la web enseña la fecha de consulta
junto al número.

De los tres planes de la API, solo los institucionales devuelven el número de
citas, y esa es la diferencia que importa:

| Plan | Peticiones/día | ¿Devuelve citas? |
|---|---|---|
| Free Trial | 50 | **No** |
| Free Institutional Member | 5.000 | Sí |
| Free Institutional Integration | 20.000 | Sí |

El institucional requiere que la organización tenga Web of Science contratado,
que es el caso de la UVa, y hay que pedirlo desde el correo `@uva.es`. La
aplicación registrada es `web-personal-uva`, en el plan **Free Institutional
Member**.

Una advertencia sobre las cifras: la API devuelve **89 documentos**, que es
todo lo que WoS indexa de él, mientras que la web cuenta **68 artículos JCR**.
No se contradicen — WoS incluye actas de congreso y otros tipos que no son
artículo en revista indexada. Las citas y el índice h se calculan sobre los 89,
que es como los calcula la propia plataforma.

### La clave ya esta puesta

Estado a 25 de noviembre de 2026: Clarivate aprobo la aplicacion
`web-personal-uva` en el **Free Institutional Member Plan**, que es el unico
plan gratuito que devuelve el numero de citas. La clave esta guardada como
secreto `WOS_API_KEY` del repositorio, no en ningun fichero.

Desde entonces las citas y el indice h los trae el script y ya no se escriben
a mano: `wos_metrics()` consulta `/documents?q=AI=(B-9123-2018)`, suma las
citas de cada documento y calcula el indice h, porque la API no lo ofrece. El
resultado va a `metrics.wos` en `data/profile.json`, que es lo que la web lee.

El bloque `wos` de `data/content.json` queda como respaldo y solo entra si la
consulta falla. Conviene que no envejezca: cuando cambien mucho las cifras
automaticas, copiarlas ahi.

**Si hay que cambiar la clave** (por ejemplo, porque se haya expuesto):
genera una nueva en <https://developer.clarivate.com/apis/wos-starter>,
guardala en un fichero y pasala desde ahi, sin escribirla en una conversacion
ni en el historial del shell:

```sh
printf '%s' 'LA_CLAVE_NUEVA' > ~/.wos-key && chmod 600 ~/.wos-key

# 1. Probarla sin imprimirla
WOS_API_KEY="$(cat ~/.wos-key)" python3 scripts/update_data.py

# 2. Reemplazar el secreto
gh secret set WOS_API_KEY < ~/.wos-key

# 3. Borrar el fichero
rm ~/.wos-key
```

Para comprobar que el cron la usa bien:

```sh
gh workflow run "Refresh bibliometrics"
gh run watch
```

### Cómo se escribe el financiador de un proyecto

Un criterio único para los diecinueve, porque antes cada uno decía lo suyo y
tres proyectos del mismo programa se leían como si fueran de tres sitios
distintos:

```
<convocatoria o programa> · <agencia> · <cofinanciación>
```

Por ejemplo `Plan Estatal · AEI · FEDER`, o `Interreg POCTEP · FEDER`.

El dato sale de la ficha del Portal, que para cada proyecto declara programa,
subprograma y lista de financiadores. Interreg, por ejemplo: los tres
proyectos son «Programa de Cooperación Interreg España-Portugal (POCTEP)»
financiado por FEDER, y lo único que cambia entre ellos es el periodo —V-A
para MIGRAINEE, VI-A para los otros dos—, que ya se deduce de los años.

**No es un descuido que dos proyectos digan «Plan Nacional» y el resto «Plan
Estatal».** El programa se llamó Plan Nacional de I+D+i hasta 2013 y Plan
Estatal de Investigación Científica y Técnica y de Innovación desde entonces.
Los de 2012-2015 son de la etapa anterior.

Esto se mantiene a mano: traducir el nombre largo y en mayúsculas del Portal a
una etiqueta legible exige criterio, y automatizarlo daría cadenas como
«PROGRAMA ESTATAL PARA IMPULSAR LA INVESTIGACIÓN CIENTÍFICO-TÉCNICA Y SU
TRANSFERENCIA».

### Proyectos: qué trae el Portal y qué no

El Portal de la Ciencia recoge los proyectos gestionados por la UVa, no los
del CIBER ni los de la Gerencia Regional de Salud. Esos se añaden a mano en
`data/content.json`.

De los que sí están, el script se queda **solo con los de «carácter
Público»**: el Portal usa ese campo para separar una convocatoria competitiva
de un contrato con empresa, y la web lista las primeras. También descarta los
apuntes de menos de 1.000 €, porque hay asientos administrativos colados entre
los proyectos: la incorporación de un grupo al consorcio CIBER figura con una
dotación de 0,01 €.

**`content.json` manda sobre lo que ya está.** El Portal solo aporta lo que
únicamente él mantiene al día, y nunca pisa un dato comprobado a mano:

| Dato | Quién manda | Por qué |
|---|---|---|
| Importe | `content.json` | Es el **total del proyecto**, sacado del CVN. El Portal solo conoce la aportación de la UVa, que se guarda aparte en `amount_uva`. |
| Ámbito, IP, co-IP | `content.json` | Comprobados a mano contra el CVN. |
| ¿Sigue vigente? | Portal | Lo marca él; sin su dato se deduce del año de fin. |
| Enlace a la ficha | Portal | Solo existe allí. |

Cuando los dos discrepan, el script **lo dice y no toca nada**. La decisión es
de una persona. Ahora mismo no discrepan en nada: las dos diferencias que
encontró —la fecha de fin de Stargardt y el ámbito del proyecto COVID-19— se
resolvieron a favor del Portal.

Un proyecto que aparezca en el Portal y no esté en `content.json` sale en la
web por sí solo, con lo que el Portal sepa de él, y el log del cron lo nombra
para que se le añadan después el importe total y los IP.

Sobre los importes: los que vienen del CVN son el total del proyecto y los que
solo conoce el Portal son la parte de la UVa. La web lo dice al lado de la
cifra («aportación UVa»), porque mezclar ambos sin avisar engañaría.

## Editar el contenido

Todo lo que no es bibliometría está en **`data/content.json`**. Cada entrada
tiene un bloque `es` y un bloque `en`; si añades uno, añade los dos.

- **`wos`** — citas e índice h de Web of Science, con `as_of`. Actualízalo
  cuando regeneres tu CVN.
- **`ui`** — etiquetas de la interfaz (menú, botones, encabezados).
- **`epigraph`** — la cita de apertura, en el bloque que antes llevaba la frase
  sobre las escalas de tiempo. Las líneas y el autor. No lleva bloque `es`/`en`
  porque una cita no se traduce: sale igual en las dos versiones. Se escribe
  una línea por renglón porque el salto es deliberado; en móvil fluyen como un
  párrafo, que es lo único que cabe. En el PDF no abre el documento, lo cierra:
  un currículum que empieza con una cita despista.
- **`lines`** — las líneas de investigación. Las etiquetas van en `signals`, y
  solo donde cambian de idioma se añade `signals_en`: «EEG» es «EEG» en los dos,
  «Teoría de grafos» no.
- **`projects`** — proyectos. `role` acepta `"ip"`, `"co-ip"` o `"researcher"`;
  solo los dos primeros muestran etiqueta. Aquí van también los proyectos de
  CIBER-BBN, GRS y cualquier otro que el Portal de la Ciencia de la UVa no
  recoja.
- **`teaching`** — asignaturas.
- **`theses`** — tesis en dirección. No incluyas números de expediente.
- **`tfgs`** — Trabajos de Fin de Grado y de Máster dirigidos, sacados de los
  dos certificados de la Secretaría General que hay en `fuentes/`. Llevan el
  nombre del estudiante, que es público: los trabajos se depositan en UVaDOC y
  su autoría consta ahí.

  **Sin calificaciones, a propósito.** Los certificados las traen y se
  descartan al parsear. Un «sobresaliente» junto a un nombre es rendimiento
  académico de un tercero, y la universidad no lo publica; tenerlo en un
  certificado no lo hace publicable en una web personal.

  Tampoco se distingue entre director y tutor: según él son lo mismo, y la web
  no inventa una jerarquía que la universidad no hace. Los tribunales en los
  que ha participado quedan fuera porque no son dirección.
- **`atenea`** — el bloque destacado del programa ATENEA, con sus contadores.
- **`service`**, **`ip`** — servicio científico y propiedad intelectual.
- **`awards_extra`** — premios que no están en el repositorio del grupo, como
  los de innovación docente.
- **`teaching_guides`** y el bloque `guia` de cada asignatura — el título de
  cada asignatura enlaza a su guía docente en la UVa. El enlace no se guarda
  entero: en la asignatura van `plan` y `codigo`, que no cambian de un año a
  otro, y el curso va una sola vez en `teaching_guides.curso`. Para pasar a
  2027-2028 basta cambiar ese número. Las asignaturas sin bloque `guia` salen
  sin enlace, que es mejor que un enlace roto. Los códigos salen del
  autoinforme de calidad docente (`fuentes/AnexoIII_Autoinforme_CalidadDocente.docx`),
  que los lista uno a uno; el servidor `apps.stic.uva.es` no contesta desde
  fuera de la UVa, así que no se pueden comprobar abriéndolos. Los planes son
  478 (Grado en Medicina), 512 (Grado en Ingeniería de Tecnologías Específicas
  de Telecomunicación), 637 (Grado en Ingeniería Biomédica), 723 (Máster en
  Ingeniería Biomédica) y 725 (Máster en Investigación Biomédica y Terapias
  Avanzadas).
### La cabecera de la página

- **Datos estructurados** (`application/ld+json` en `index.html`) — quién es,
  dónde trabaja y qué perfiles son suyos, para los buscadores. Se escribe en el
  HTML, no desde el JSON, para que llegue sin ejecutar nada. No lleva cifras:
  cambian cada semana.
- **`?lang=en`** — el idioma viaja en la dirección y manda sobre lo guardado y
  sobre el navegador, así que un enlace en inglés se abre en inglés. Al cambiar
  de idioma la barra se reescribe sin recargar. Las etiquetas `hreflang` de la
  cabecera le dicen al buscador que son la misma página en dos idiomas.
- **`assets/img/og-tarjeta.png`** — la tarjeta que se ve al compartir el
  enlace (1200×630). El retrato que lleva dentro, `retrato-tarjeta.png`, sale
  de `scripts/recorta_og.py`, que encuadra el original sobre la cara; hacer
  ese encuadre con porcentajes de CSS dejaba la coronilla fuera del círculo.
  La tarjeta se regenera desde `scripts/og-card.html`:
  `chrome --headless --window-size=1200,630 --virtual-time-budget=16000
  --screenshot=assets/img/og-tarjeta.png scripts/og-card.html`.
  Si la cambias, **cámbiale también el nombre**: WhatsApp, LinkedIn y
  compañía guardan la previsualización en caché y, con el mismo nombre,
  siguen enseñando la vieja durante días.

- **`contact_card`** — los datos de la tarjeta de contacto: correo, dirección
  postal, organismo, ORCID y la dirección de la web. De ahí sale
  `tarjeta.vcf`, que escribe `python3 scripts/vcf.py`: **vuelve a lanzarlo si
  cambia el cargo o el departamento**. Está en la raíz y con nombre corto
  porque su dirección es lo que lleva dentro el QR, y cada carácter de más lo
  hace más denso.
- **El QR** (`assets/img/qr.svg`, de `pip install segno && python3
  scripts/qr.py`) lleva **la dirección de `tarjeta.vcf`**: se escanea, el
  teléfono abre la ficha y pregunta si la guarda. Son 33 módulos y 128 px,
  comprobado decodificando el QR renderizado —a 104 px ya no sale—. Se probó
  antes a meter la tarjeta entera dentro del QR, que funcionaría sin
  conexión, pero son 57 módulos, hacen falta 240 px y aun así hubo teléfonos
  que no ofrecieron guardar el contacto. `scripts/qr.py vcf` y `scripts/qr.py
  web` vuelven a esas dos variantes, si alguna vez hace falta. Va dibujado en
  `currentColor`, pero sobre fondo claro en los dos temas, porque un QR
  invertido no lo lee todo el mundo.
- **`teaching_figures`** — las cuatro cifras que abren Docencia (asignaturas,
  titulaciones, centros y horas impartidas). Salen del autoinforme de calidad
  docente y se escriben a mano: no hay de dónde rasparlas. Conviene repasarlas
  al cerrar cada curso.
- **`teaching_projects`** — las convocatorias de innovación docente del
  programa ATENEA (PID y Mentor-UVa), bajo su ficha. El papel es el mismo en
  todas y vive en `ui/pid.role`, no repetido en cada entrada.
- **Prácticas externas** — son entradas de `tfgs` con `kind: "prac"`, que es
  lo que las agrupa en su propio bloque detrás de los TFG. El título es la
  entidad de acogida y su unidad. Los datos salen de las memorias, que son
  documentos internos: de ellas solo se publican entidad, estudiante y curso,
  nunca el DNI, la dirección o el teléfono que también traen.
- **`degree_logos`** — el logo del centro o la titulacion que va en la cabecera
  de cada grupo de asignaturas, con el codigo de plan como clave. Los PNG de
  `assets/img/logos/` son siluetas: el color lo pone el CSS con `mask-image`,
  que es lo unico que se lee igual en tema claro y oscuro. `proporcion` es
  ancho/alto —una mascara no la deduce— y `escala` corrige el tamano aparente,
  porque a la misma altura un sello cuadrado pesa mucho menos que un rotulo
  apaisado. Los originales en color estan en `fuentes/logos/`.
- **`simulab`** y el campo del mismo nombre en cada asignatura — los
  simuladores web que Javier escribe para sus clases, en JGomPil/simulab. Ojo:
  el repositorio se llamaba `docencia` y, al renombrarlo, GitHub Pages dejó de
  servir la dirección antigua; los documentos anteriores a noviembre de 2026
  —el autoinforme entre ellos— enlazan a `jgompil.github.io/docencia/`, que da
  404.
- **`tfg_repo`** y el campo `uvadoc` de cada TFG/TFM — el titulo de cada
  trabajo defendido enlaza a su ficha en UVaDOC. Se guarda solo el handle
  (`10324/NNNNN`), que es la parte estable: la URL se arma con el patron. Los
  que no lo llevan salen sin enlace, porque o no estan depositados o aun no se
  han defendido. Hoy faltan dos: el TFM de 2024/25 sobre fenotipos de apnea y
  el TFG de 2018/19 sobre conectividad en migraña, que no aparecen en el
  repositorio.
- **`awards_en`** — los premios se raspan de gib.uva.es y llegan en español,
  y el raspado se repite cada lunes, así que su traducción no puede vivir en
  `profile.json`: está aquí. Cada entrada lleva un `match`, un fragmento que
  solo aparezca en ese premio, y el `text` inglés. Si un premio nuevo no
  encuentra pareja, la versión inglesa enseña el texto español, que es mejor
  que un hueco; para traducirlo, añade su entrada.
- **`awards_confirmed_by_cv`** — red de seguridad. La página de premios del GIB
  lista los de todo el grupo y no tiene filtro por autor, así que el script
  selecciona por nombre. Las entradas que dicen «Javier Gómez Pilar» se aceptan
  solas; las que solo dicen «Javier Gómez» quedan fuera salvo que incluyas aquí
  un fragmento de su texto. Es deliberado: evita atribuirse el premio de otra
  persona.

Tras editar, comprueba que el JSON sigue siendo válido:

```sh
python3 -c "import json; json.load(open('data/content.json', encoding='utf-8'))"
```

---

## Exportar la web en PDF

El botón **PDF** de la barra superior abre un menú con **dos documentos**, que
salen de los mismos datos y se descargan como PDF de verdad —páginas,
numeración, texto seleccionable y enlaces vivos— en el idioma que esté activo:

- **Currículum abreviado**, dos páginas, para adjuntar a una convocatoria. No
  es un resumen escrito aparte: es una selección de lo mismo. Ocho artículos
  (primero los de primer decil, después los de primer cuartil, dentro de cada
  grupo del más reciente al más antiguo), seis proyectos (primero los que
  dirige, luego los más recientes), la docencia y la supervisión en dos
  renglones de cifras, y los cuatro premios más recientes. Las reglas están en
  `cvSeleccion()` y en `cvContenido()`; cambiar cuántos entran es cambiar
  `CV_PUBS` y los `slice`.
- **Dosier académico**, veintitantas páginas, con todo el contenido de la web y
  cada sección empezando en página nueva.

Lo hace `assets/js/pdf.js` con [pdfmake](https://pdfmake.github.io/), en el
navegador. En el navegador y no en un servidor porque no hay servidor: esto es
GitHub Pages. La librería pesa dos megas, así que se descarga de cdnjs la
primera vez que se pulsa el botón y no al cargar la página; mientras tanto el
botón dice «Generando…».

El documento se arma con los mismos datos que la web —`content.json` y
`profile.json`—, así que **no hay nada que mantener aparte**: cuando el lunes
entren publicaciones nuevas, entran también en el PDF.

Va así:

- **Cabecera**: el retrato, el nombre, el cargo, la afiliación, la línea de
  identificadores (ORCID, Scopus, WoS, Scholar, Portal de la Ciencia, CVN,
  todos enlazados), las cuatro cifras en sus cajas y el índice, que también
  lleva enlaces a cada sección.
- **01 Investigación**, **02 Publicaciones** (resumen bibliométrico y las 148
  referencias agrupadas por tipo, numeradas 1, 2, 3…, con el nombre entero en
  negrita, el DOI enlazado y las marcas Q1/D1), **03 Proyectos** (una ficha por
  proyecto, en naranja los que siguen en curso y en azul los cerrados, con
  enlace a su ficha del Portal), **04 Docencia**, **05 Reconocimiento** y
  **06 Contacto**, que cierra con la cita.
- Las secciones van seguidas, no una por página: lo que se baja de página es
  una cabecera que se quedaría sola al pie.
- Pie con el número de página en todas menos en la primera.

Para tocar el diseño, todo está en ese fichero: los colores arriba del todo y
los tamaños en `styles`, al final de `documento()`. pdfmake no entiende HTML ni
CSS; cada bloque es un objeto. Tres cosas que ya costaron un rato:

- Un filete vertical junto a un bloque no se dibuja con una línea, porque una
  línea mide lo que le digas y las fichas no miden todas lo mismo. Se hace con
  una celda estrecha con fondo, dentro de una tabla de una fila: esa sí crece
  con el bloque.
- Una celda vacía al final de una tabla con fondo deja una muesca blanca. Si no
  hay cuenta que poner a la derecha, la barra se arma con dos columnas.
- El retrato se recorta en redondo sobre un lienzo y se exporta a data URI, que
  es lo único que pdfmake admite. De paso no hay que guardar una segunda copia
  de la foto en el repositorio.

Para verlo sin ir pulsando el botón, hay una página de prueba que compone el
documento, lo rasteriza con pdf.js y escupe cada página en base64; está en el
cuaderno de trabajo, no en el repo. Lo más rápido es levantar el sitio en local
y pulsar el botón.

Y lo que **no** entra en el PDF: el correo electrónico, que no está en ninguna
parte del sitio, y las calificaciones de los trabajos dirigidos.

Quien pulse Ctrl+P sobre la página en lugar de usar el botón no se lleva un
desastre: hay unas pocas reglas `@media print` al final de `style.css` que
quitan la barra, los filtros y el fondo. Pero el documento bueno es el del
botón.

---

## Ver la web en local

```sh
python3 -m http.server 8787
```

y abre <http://localhost:8787>. Hace falta un servidor: la página carga los
datos con `fetch()`, y abrir `index.html` con doble clic lo bloquea por CORS.

---

## Regenerar los datos a mano

```sh
python3 scripts/update_data.py
```

Solo usa la biblioteca estándar. Si tu Python da un error de certificados
(`CERTIFICATE_VERIFY_FAILED`), instala `certifi` y el script lo detecta solo:

```sh
pip3 install certifi
```

El script **se niega a escribir** si parsea cero artículos o si el número no
cuadra con el que declara la página del GIB. Así, si el grupo cambia su HTML, la
web se queda con los últimos datos buenos en lugar de vaciarse.

Y antes de escribir compara lo recién raspado con lo que ya estaba publicado.
Si alguna cifra se desploma —artículos JCR, publicaciones, países, premios,
proyectos, coautores, citas o índice h— no escribe nada y termina en rojo, de
modo que la ejecución de los lunes falla a la vista en lugar de publicar una
versión empobrecida de la web. El margen es un 15%: por debajo de eso, lo
normal es que una fuente haya cambiado o haya respondido a medias. Si el
recorte es deliberado —quitar una fuente, por ejemplo— se repite con la red
quitada:

```sh
JGP_SIN_RED=1 python3 scripts/update_data.py
```

Cuando una fuente no contesta, lo publicado se hereda en lugar de perderse. El
Portal de la Ciencia se cae con un 503 de vez en cuando: en esa vuelta los
proyectos se quedan como estaban y lo demás se refresca igual. Las cifras de
Web of Science se heredan igual cuando esta vuelta no las trae, que es lo que pasa al ejecutarlo en tu ordenador sin la clave: así
una prueba a mano no las borra sin querer. Si la clave está puesta y aun así la
consulta no devuelve citas, eso sí se considera una avería y la ejecución
falla.

---

## Publicar en GitHub Pages

El repositorio es `JGomPil/Javier-Gomez-Pilar` y la web se sirve en
<https://jgompil.github.io/Javier-Gomez-Pilar/>. Al ser una *project page* vive
en un subdirectorio, así que todas las rutas del HTML son relativas. Si alguna
vez escribes una ruta que empiece por `/`, romperá.

Para publicar un cambio basta con:

```sh
cd ~/PersonalWeb
git add -A
git commit -m "Describe el cambio"
git push
```

GitHub Pages reconstruye en menos de un minuto.

### Si algún día quieres dominio propio

Con `javiergomezpilar.com` tienes dos caminos. El sencillo es renombrar el
repositorio a `jgompil.github.io`, que lo convierte en *user page* y lo sirve en
la raíz; entonces hay que quitar `/Javier-Gomez-Pilar` del `canonical` y de las
etiquetas `og:`. El otro es dejarlo donde está, añadir un fichero `CNAME` en la
raíz con el dominio dentro y apuntar el DNS a GitHub Pages.

---

## Contacto

La direccion de correo no aparece en ninguna parte de la web, a proposito. La
seccion de contacto enlaza a la ficha del **Portal de la Ciencia de la UVa**,
donde la universidad ya publica los datos de contacto institucionales. Asi no
hay formulario que mantener, ni servicio de terceros, ni direccion que
cosechen los robots.

Si algun dia quieres un formulario, hace falta un servicio que reenvie el
mensaje: GitHub Pages solo sirve ficheros estaticos y no ejecuta PHP ni nada
por el estilo. Un `.php` subido aqui se entregaria como texto, con su
contenido a la vista.

---

## Hacia una herramienta de acreditaciones

El objetivo a medio plazo no es solo la web: es que `data/` y `fuentes/` sean un
almacén de méritos del que salgan también las solicitudes de acreditación de la
ANECA y CVs recortados por convocatoria. La estructura actual ya apunta ahí:

- Cada publicación lleva año, revista, cuartil, primer decil, DOI y la lista de
  autores. Son exactamente los campos que piden los formularios de sexenios y
  acreditación, incluido el cuartil, que es el dato que más trabajo da reunir
  a mano.
- Proyectos, tesis, docencia, premios, servicio y propiedad intelectual están
  separados por tipo de mérito, igual que los apartados de un CVN.
- Todo es JSON, así que un script puede filtrar por ventana temporal (los
  últimos seis años para un sexenio), por rol (solo donde eres IP) o por línea
  de investigación, y volcarlo al formato que pida cada convocatoria.

Lo que falta para llegar ahí: pasar a datos los documentos que vayas dejando en
`fuentes/` (TFG y TFM dirigidos, certificados, encuestas docentes) y escribir
los exportadores. No está hecho todavía.

## Qué no se sube

Toda la carpeta **`fuentes/`** está excluida: es donde viven el CVN, los TFG y
TFM dirigidos, los certificados y las solicitudes. Ver `fuentes/LEEME.md`.

Además, `.gitignore` excluye `*.pdf`, `*.docx` y `*.xlsx` en todo el
repositorio, como segunda red por si un documento acaba fuera de `fuentes/`
por error. El CVN contiene DNI y fecha de nacimiento, así que esto no es
celo excesivo.

Si alguna vez ves un PDF o un Word en `git status`, para y revísalo.
