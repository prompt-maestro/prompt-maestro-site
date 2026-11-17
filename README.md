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
- La primera pantalla es el cartel (título, frase, botones y una imagen) y, solo en pantallas anchas (900 o más, y
  más anchas que altas), el corto: una película de unos 16 segundos que corre sola al abrir y, al terminar, deja a la
  vista el cartel, que siempre estuvo debajo. En celular y en tableta de pie el corto no existe: se ve el cartel,
  quieto, y no se pide ni un video. El cartel también es lo que se ve sin JavaScript y con movimiento reducido. El
  guion del corto (sus momentos y lo que dura cada uno) y los textos viven en `fuente/datos/corto.json`; qué momento
  toca lo decide `fuente/js/corto.js` y la página la mueve `fuente/js/corto-vista.js`.
- El cartel no depende del corto, y su imagen cambia con la pantalla. En pantallas más anchas que altas son las tres
  fotos de «su tiempo» como tarjetas (`cartel.tarjeta` de cada oficio, sin tamaño ni extensión), con la cita del
  primer oficio debajo (`fuente/plantillas/parciales/cartel-flota.html`). En celular y en tableta de pie es «Tú y tu
  agente»: la foto de quien trabaja (`cartel.tu`) y un celular dibujado con HTML y CSS donde su agente contesta,
  cobra el anticipo y agenda (`cartel.charla`, más la cita del oficio). Todo se dibuja con una sola unidad, el ancho
  de la imagen entre 350, así que es la misma composición en un celular angosto y en una tableta.
- En celular se ve UN oficio, al azar en cada visita. La página trae escrita una escena por oficio y solo la primera
  a la vista (es la que se ve sin JavaScript); `fuente/js/arranque.js`, que corre en el `<head>` antes del primer
  pintado, elige uno, lo deja escrito en `<html data-oficio>` y guarda o enseña cada escena en cuanto el navegador la
  lee: nunca se pinta una para cambiarla por otra. Los oficios que hay se los dice su propia etiqueta
  (`data-oficios`), que sale de los datos.
- En celular lo primero es que el cartel se vea: las piezas de JavaScript (la demostración, la calculadora, la
  medición) se traen cuando el navegador ya pintó la página (`fuente/js/pagina.js`), y por eso sus `modulepreload`
  solo valen en pantallas anchas, donde el inicio es el corto y lo mueve una pieza. Si se cambia esa regla, medir con
  `npm run velocidad`: con una foto como lo más grande de la pantalla, todo lo que llega antes de pintarla cuenta
  para el LCP.
- Las fotos y los videos del corto y de su cartel se convierten con `herramientas/optimizar.mjs` (necesita ffmpeg en
  la laptop). Los originales, pesados, viven en `originales/` (fuera del repo); aquí solo entra lo ya optimizado, sin
  audio.
- Sumar un oficio no toca el diseño ni el código: sus originales en `originales/comercial/` (`<oficio>-trabajo.png`
  y, si tiene toma viva, `<oficio>-trabajo-viva.mp4`) y en `originales/cartel/` (`<oficio>-vida.png`), su entrada en
  `fuente/datos/corto.json` (avisos, lo que hizo el agente, su cita, a dónde mira la cámara en cada foto y, para el
  cartel, sus fotos, el recorte de su retrato y su conversación) y correr `node herramientas/optimizar.mjs <oficio>`,
  que toma los oficios de ese mismo archivo. El retrato del cartel de celular se recorta de la foto de trabajo
  (`cartel.tu.recorte`: desde dónde y cuánto de lo ancho, en por ciento; mide tres por cuatro). La lista de oficios
  es una sola: de ahí salen también las tarjetas de «Para quién» y los oficios entre los que elige el azar.
- Sumar un oficio a la demostración casi no toca el código: su entrada en `fuente/datos/giros.json`, su guion en
  `fuente/datos/guiones/<oficio>.json` y su clave en la lista `GIROS` de `fuente/js/medicion.js` (la medición solo
  acepta valores de una lista cerrada; una prueba avisa si falta). La armada se detiene si a un ejemplo le falta un texto.
- Los textos de las secciones viven en `fuente/datos/secciones.json` y `preguntas.json`. Ninguno promete algo que el
  producto no hace: se revisan contra la tabla de la verdad del PRD antes de cambiarse.
- Lo que leen los buscadores sale de los mismos datos que la página (`herramientas/buscadores.mjs`): los datos
  estructurados van dentro del HTML y, solo en el dominio, se escriben `robots.txt`, `sitemap.xml` y `llms.txt`. El
  título y la descripción viven en `fuente/datos/sitio.json`; la armada se detiene si no caben en un resultado.
- La imagen que se ve al compartir el enlace (`fuente/raiz/compartir.jpg`) se compone con `herramientas/compartir.mjs`
  a partir del título y de una toma del corto. Se vuelve a correr a mano si cambia alguno de los dos.
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
