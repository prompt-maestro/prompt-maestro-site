# prompt-maestro.com (rama `fuente`)

Aquí vive la fuente de la página de Prompt Maestro: plantillas, datos, estilos, scripts, herramientas y pruebas.
Es un sitio estático sin framework: lo que se publica es HTML, CSS y JavaScript ya armados, sin dependencias.

| Rama o repo                    | Qué tiene                                         | Quién la mueve                                     |
| ------------------------------ | ------------------------------------------------- | -------------------------------------------------- |
| `fuente` (esta)                | El código. Nunca se sirve.                        | Cada cambio pasa por la revisión automática        |
| `main`                         | Lo publicado en prompt-maestro.com (GitHub Pages) | Solo `herramientas/publicar.mjs`, con autorización |
| `prompt-maestro/pagina-previa` | La previa para revisar, con `noindex`             | `herramientas/previa.mjs`                          |

## Para trabajar

Hace falta Node 24.

```bash
git config core.hooksPath .githooks   # lo hace npm ci; revisa cada push
npm ci                                # dependencias de desarrollo, con versión exacta
npm run armar                         # escribe dist/
npm run servir                        # http://127.0.0.1:4173/
npm run puerta                        # todo lo que revisa GitHub: formato, tipos, pruebas, armado y punta a punta
```

## Cómo está hecho

```
fuente/
  plantillas/   páginas y parciales
  datos/        lo que cambia sin tocar el diseño: planes, ejemplos, preguntas
  estilos/      tokens y hojas de estilo
  js/           módulos del navegador
  recursos/     tipografías, imágenes y video ya optimizados
  raiz/         lo que va tal cual en la raíz del sitio
herramientas/   armar, servir, previa, sincronizar planes y las revisiones
pruebas/        unitarias (node --test) y de punta a punta (Playwright con axe)
```

- `herramientas/armar.mjs` une plantillas y datos y escribe HTML estático. Es estricto: un dato que falta detiene la
  armada. `--previa` arma la versión de revisión y `--comprobar` falla si la carpeta en disco no coincide con la fuente.
- Los precios no se editan aquí: se copian con `herramientas/sincronizar-planes.mjs`.
- Las fotos y el video del comercial se convierten con `herramientas/optimizar.mjs` (necesita ffmpeg en la laptop). Los
  originales, pesados, viven en `originales/` (fuera del repo); aquí solo entra lo ya optimizado, sin audio.
- Sumar un oficio al comercial no toca el diseño: sus dos fotos en `originales/comercial/` (`<oficio>-trabajo.png` y
  `<oficio>-espera.png`), su nombre en la lista de `optimizar.mjs` y su entrada en `fuente/datos/pelicula.json`.
- Sumar un oficio a la demostración casi no toca el código: su entrada en `fuente/datos/giros.json`, su guion en
  `fuente/datos/guiones/<oficio>.json` y su clave en la lista `GIROS` de `fuente/js/medicion.js` (la medición solo
  acepta valores de una lista cerrada; una prueba avisa si falta). La armada se detiene si a un ejemplo le falta un texto.
- Los textos de las secciones viven en `fuente/datos/secciones.json` y `preguntas.json`. Ninguno promete algo que el
  producto no hace: se revisan contra la tabla de la verdad del PRD antes de cambiarse.
- Lo que leen los buscadores sale de los mismos datos que la página (`herramientas/buscadores.mjs`): los datos
  estructurados van dentro del HTML y, solo en el dominio, se escriben `robots.txt`, `sitemap.xml` y `llms.txt`. El
  título y la descripción viven en `fuente/datos/sitio.json`; la armada se detiene si no caben en un resultado.
- La imagen que se ve al compartir el enlace (`fuente/raiz/compartir.jpg`) se compone con `herramientas/compartir.mjs`
  a partir del título y de una toma del comercial. Se vuelve a correr a mano si cambia alguno de los dos.
- La medición (Umami, sin cookies) se enciende con los cuatro datos de `medicion` en `sitio.json`; vacío, está
  apagada. La etiqueta va solo en el dominio (la previa y la 404 nunca miden). El script de Umami no se carga de su
  servidor: es una copia revisada que sirve la propia página (`fuente/js/terceros/`, con su licencia al lado), así
  que `script-src` se queda en `'self'` y la política de contenido solo se abre para mandar los conteos a un
  servidor (`herramientas/medicion.mjs`). La armada se detiene si la copia no coincide con `medicion.huella`. Para
  cambiar de versión: bajar el script nuevo byte por byte (`curl -o`, sin redirigir la salida en PowerShell), leerlo
  completo, guardarlo con su fecha junto con su nota (que también dice su SHA-256), borrar la copia vieja y poner el
  nombre y el SHA-256 nuevos en `sitio.json`. Los eventos los manda `fuente/js/medicion-vista.js`, que no hace nada
  si no hay script. Lo que no se prueba aquí es el servidor de Umami de verdad: se mira en vivo después de publicar.
- `herramientas/publicar.mjs` sin banderas es un ENSAYO: dice qué entraría, qué se conserva y qué se retira de `main`, y
  no toca nada. Con `--si` (solo con la autorización escrita del dueño) deja un commit nuevo en `main` y su etiqueta
  `pagina-vN`, sin reescribir la historia. Se niega con precios de prueba, contacto o legales sin confirmar, cambios sin confirmar, la rama sin subir o la
  revisión automática de GitHub sin verde. `--regresar --si` deshace la última publicación con un commit nuevo.
- Este repo es público. Ningún commit lleva un correo personal y ningún archivo lleva llaves: el gancho de `pre-push`
  lo revisa y bloquea cualquier push a `main` desde esta carpeta. Vive como archivo en `.git/hooks` (lo instala
  `npm ci`), así que sigue ahí aunque se cambie de rama, y falla cerrado si la rama puesta no trae la herramienta. Lo
  que el gancho no puede cuidar (editar en github.com, `--no-verify`, un clon sin instalar) lo cuidan las reglas de
  GitHub sobre `main`: sin push forzado y sin borrado.
