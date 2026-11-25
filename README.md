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
- **`epigraph`** — la cita de apertura: las líneas y el autor. No lleva bloque
  `es`/`en` porque una cita no se traduce: sale igual en las dos versiones y en
  el PDF. Las líneas son las que son, y se escriben una a una porque el salto
  es deliberado; si cambias el texto, procura que la más larga no pase de unos
  42 caracteres o se partirá en la columna del retrato.
- **`lines`** — las cuatro líneas de investigación.
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

El botón **PDF** de la barra superior saca un dosier con *todo* el contenido
del sitio, en el idioma que esté activo. Lo abre el diálogo de impresión del
navegador; ahí se elige «Guardar como PDF». Son unas 24 páginas.

**No se imprime la página.** La web se lee por pestañas y filtros —una cosa
cada vez—, y eso en papel no funciona porque nadie va a pulsar nada. Así que
`assets/js/pdf.js` construye un documento aparte con los mismos datos
(`content.json` y `profile.json`), lo mete en el DOM, imprime y lo retira. En
pantalla no se ve nunca.

El documento va así: portada con la cita, el nombre, la tesis de una frase y
las cuatro cifras; y luego las seis secciones, cada una empezando en página
nueva. Las publicaciones salen agrupadas por tipo y numeradas de la más
reciente a la más antigua, con el apellido en negrita, el DOI y las insignias
Q1/D1.

El diseño está en `assets/css/style.css`, al final, dentro de `@media print`.
Dos cosas que conviene saber antes de tocarlo:

- **Medidas en mm y pt**, no en rem: es papel, y A4 con márgenes de 17/16 mm.
- **Los titulares se reinician a mano.** El `h3` de la pantalla es monoespaciado,
  en versales y gris; si no se neutraliza, los títulos de los proyectos salen
  en mayúsculas. El reset se escribe `[id="pdf-doc"] h3` y no `#pdf-doc h3`
  para que pese lo mismo que una clase y las reglas concretas puedan ganarle.

Para ver cómo queda sin ir pulsando el botón, el PDF se puede generar desde la
terminal con el Chrome que ya tienes instalado:

```sh
# genera el documento con los datos reales y lo imprime a PDF
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --no-pdf-header-footer --print-to-pdf=/tmp/dosier.pdf \
  "file:///ruta/a/una/pagina/de/prueba.html"
```

Y lo que **no** entra en el PDF: el correo electrónico, que no está en ninguna
parte del sitio, y las calificaciones de los trabajos dirigidos.

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
