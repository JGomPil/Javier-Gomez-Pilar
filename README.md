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
| **Citas e índice h (Web of Science)** | `data/content.json` → `wos` | **A mano**, salvo que configures la API |
| Bio, líneas, proyectos, docencia, tesis, ATENEA, premios docentes | `data/content.json` | A mano, 1-2 veces al año |

### Citas e índice h de Web of Science

La web muestra las cifras de WoS, no las de OpenAlex, porque son las que usan
las comisiones de acreditación españolas. WoS no tiene API pública con citas,
así que por defecto salen del bloque `wos` de `data/content.json` y la web
enseña la fecha de consulta junto al número.

Para automatizarlas hace falta una clave de la **Web of Science Starter API**:

1. Regístrate en <https://developer.clarivate.com> con tu correo `@uva.es`. El
   tier gratuito abierto **no** devuelve citas; el que se concede a través del
   contrato de una institución suscrita sí, con 5.000 peticiones al día. La
   aprobación puede tardar un par de días, y suelen rechazar correos de Gmail.
2. En el repositorio: *Settings → Secrets and variables → Actions → New
   repository secret*, con nombre `WOS_API_KEY`.
3. Añade estas dos líneas al paso «Regenerate» de
   `.github/workflows/update-data.yml`:

   ```yaml
         env:
           WOS_API_KEY: ${{ secrets.WOS_API_KEY }}
   ```

A partir de ahí el script calcula citas e índice h desde WoS y el bloque manual
deja de usarse. Si la clave resulta ser del tier sin citas, el script lo detecta,
lo avisa y mantiene las cifras manuales en lugar de publicar un cero.

El índice h de Scopus (29) no se usa en la web; está en tu CVN si lo necesitas.

---

## Editar el contenido

Todo lo que no es bibliometría está en **`data/content.json`**. Cada entrada
tiene un bloque `es` y un bloque `en`; si añades uno, añade los dos.

- **`wos`** — citas e índice h de Web of Science, con `as_of`. Actualízalo
  cuando regeneres tu CVN.
- **`ui`** — etiquetas de la interfaz (menú, botones, encabezados).
- **`lines`** — las cuatro líneas de investigación.
- **`projects`** — proyectos. `role` acepta `"ip"`, `"co-ip"` o `"researcher"`;
  solo los dos primeros muestran etiqueta. Aquí van también los proyectos de
  CIBER-BBN, GRS y cualquier otro que el Portal de la Ciencia de la UVa no
  recoja.
- **`teaching`** — asignaturas.
- **`theses`** — tesis en dirección. No incluyas números de expediente.
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
