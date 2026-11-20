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
  más anchas que altas), el corto: una película de unos 30 segundos que corre sola al abrir y, al terminar, deja
  a la vista el cartel, que siempre estuvo debajo. En celular y en tableta de pie el corto no existe: se ve el cartel,
  quieto, y no se pide ni un video. El cartel también es lo que se ve sin JavaScript y con movimiento reducido. El
  guion del corto (sus momentos y lo que dura cada uno) y los textos viven en `fuente/datos/corto.json`; qué momento
  toca lo decide `fuente/js/corto.js` y la página la mueve `fuente/js/corto-vista.js`.
- El corto cuenta UN oficio por visita, a pantalla completa: quien trabaja (con luz fría), su celular que vibra, un
  celular grande, al centro de la pantalla, que se llena de avisos, la raya de luz que lo barre, la marca en su
  halo, lo que hizo su agente (una sola conversación, con su rótulo «WhatsApp»: el mensaje, lo que contestó y de
  dónde lo sacó, el pago aprobado y el papel con su sello) y, para cerrar, todos los oficios en pantalla dividida,
  cada uno con su nombre, bajo el letrero del cierre y sus dos renglones (`todos.baja`: una oración en cada uno). El
  oficio es el mismo que eligió el azar para el cartel; «Ver de nuevo» corre el que sigue en la lista. La página
  trae escrita una escena por oficio y solo se pinta la que toca: de las demás no se pide ni la foto.
- A la raya de luz del barrido la mueve el navegador, no el código: es una animación de puro `transform`
  (`barre` y `destapa`, en `fuente/estilos/corto.css`) que arranca y frena suave y entra y sale fundiéndose. La caja
  de lo de antes cruza la pantalla con la raya y su contenido recorre lo mismo al revés, así que lo de antes no se
  mueve: solo se va destapando. Cuánto tarda en cruzar lo dice `fuente/js/corto.js` (`CRUZA_EN`, una parte de su
  momento) y `corto-vista.js` se lo pasa a los estilos en `--cruza`; con la pausa se detiene como todo lo demás
  (`--marcha`). Dentro de lo que se mueve no va nada pesado: lo de atrás del celular grande se desenfoca con un
  `filter` de la foto (no con un desenfoque de fondo) y en el barrido la escena fría se queda quieta.
- La raya de avance del corto se agarra: con un clic, arrastrándola o con las flechas (de dos en dos segundos; Inicio
  y Fin a sus extremos) el corto va y viene. Es un control con su nombre (`role="slider"`, `.control__riel`, de 28 de
  alto; la raya que se ve, `.control__linea`, sigue midiendo 2). Para saltar, `corto-vista.js` quita el momento y lo
  vuelve a poner, adelanta sus animaciones a lo que ya lleva (`currentTime`) y da por terminado lo que va de un
  momento a otro; mientras la traen agarrada el corto espera, y al soltarla sigue, salvo que estuviera en pausa. Una
  animación nueva del corto tiene que empezar con su momento (no después, desde el código): si no, al saltar no cae
  en su lugar.
- La página dice «WhatsApp» con la palabra, escrita así y con la letra del texto que la rodea. Nunca con un
  logotipo ni con un icono que se le parezca: las reglas de marca de Meta solo dejan usar el oficial, sin cambios.
  El rótulo de la conversación del corto es un dato (`canal`), común a todos los oficios.
- El renglón chico del cartel (`cartel.sobre`) lleva dos espacios duros, escritos a la vista como `\u00a0`: tienen
  juntas «y pronto más», así donde no cabe en un renglón se parte después de los tres oficios y nunca deja una «y»
  colgada.
- El corto se acomoda a la ventana, solo con estilos. En una menos ancha que 16:9 la foto de la escena se recorta a
  lo ancho: cuando llega lo que hizo su agente, la cámara se corre despacio y deja a quien trabaja a la derecha, así
  la conversación cae sobre el fondo y no sobre sus manos. En una casi cuadrada (3 por 2 o menos) el celular acercado
  ocupa casi todo lo ancho, y el letrero de ese momento sube, debajo de la barra. Y si la pieza que mueve el corto
  tarda en llegar, sus capas se guardan solas a los 700 ms y se ve el cartel; cuando llega, el corto arranca encima.
- En pantallas anchas lo más grande es la foto de esa escena: `arranque.js` la adelanta (solo la del oficio elegido)
  y el video, uno solo, se pide cuando la página ya se pintó. Con ahorro de datos o con una conexión lenta el corto
  no corre solo ni se pide nada suyo: queda el cartel con su botón «Ver el video».
- El cartel no depende del corto, y su imagen cambia con la pantalla. Donde corre el corto (900 o más de ancho, más
  ancha que alta y con 480 o más de alto) es la agente: un retrato sin marco a la derecha, tan alto como el cartel,
  que se funde con el fondo (`cartel.agenteFoto`, la misma para todos los oficios; en `originales/cartel/agente.png`).
  Es una persona que ilustra a un agente que no lo es: por eso lleva a un lado el rótulo «Tu agente virtual»
  (`cartel.agenteVirtual`) y su texto alternativo también lo dice. Donde hay lugar (1200 o más de ancho, 560 o más de
  alto y no muy cuadrada) el cartel va en tres columnas: el texto, la historia de una cita y, libre, el lugar de su
  cara. La historia (`.historia`) cuenta en cuatro pasos unidos por una raya lo que hace el agente, con la
  conversación de ejemplo del primer oficio y las mismas piezas del corto: le escriben, contesta, cobra el anticipo
  y agenda (`fuente/plantillas/parciales/cartel-flota.html` es la cita). Donde no cabe quedan su rótulo y la cita y,
  en ventanas menos anchas o casi cuadradas, solo su rótulo. Bajo los botones, `.confia` dice con qué trabaja
  (`cartel.herramientas`): solo los nombres en texto, nunca un logotipo. Nada de esto lleva JavaScript. En las demás
  pantallas más anchas que altas el cartel va solo con su texto. En celular y en tableta de pie es «Tú y tu
  agente»: la foto de quien trabaja (`cartel.tu`) y un celular dibujado con HTML y CSS donde su agente contesta,
  cobra el anticipo y agenda (`cartel.charla`, más la cita del oficio). Todo se dibuja con una sola unidad, el ancho
  de la imagen entre 350, así que es la misma composición en un celular angosto y en una tableta. A lo alto se
  acomoda sola: el celular dibujado sube (su aire de arriba es lo primero que cede) para que la cita se vea entera,
  con su sello, en la primera pantalla; en los celulares más bajitos (menos de 640 de alto) se asoma, y lo que
  nunca se pierde es la respuesta del agente y el pago.
- En celular se ve UN oficio, al azar en cada visita. La página trae escrita una escena por oficio y solo la primera
  a la vista (es la que se ve sin JavaScript); `fuente/js/arranque.js`, que corre en el `<head>` antes del primer
  pintado, elige uno, lo deja escrito en `<html data-oficio>` y guarda o enseña cada escena en cuanto el navegador la
  lee: nunca se pinta una para cambiarla por otra. Los oficios que hay se los dice su propia etiqueta
  (`data-oficios`), que sale de los datos.
- `arranque.js` NO escucha `DOMContentLoaded` ni `load`, y así debe seguir. En la tarea en que llegan esos avisos el
  navegador puede acomodar la página entera por primera vez (lo más pesado de la carga); Lighthouse le cuelga esa
  tarea completa al primer archivo de JavaScript que tenga algo corriendo ahí y la cuenta como si hubiera esperado a
  que ese archivo bajara, ya después del primer pintado: el «tiempo bloqueado» de `npm run velocidad` fallaba la
  mitad de las veces. Por eso deja de vigilar las escenas cuando su aviso llega con la página ya leída
  (`document.readyState`), y si `pagina.js` no llega se entera por la falla del archivo (`error`), no al terminar de
  cargar. Lo que sí cuesta en esa tarea es el primer acomodo de toda la página: cada sección que crece lo alarga.
- `npm run velocidad` se corre con la laptop conectada a la corriente: con batería el procesador va más lento y el
  tiempo bloqueado no pasa aunque la página no haya cambiado.
- En celular lo primero es que el cartel se vea: las piezas de JavaScript (la demostración, la calculadora, la
  medición) se traen cuando el navegador ya pintó la página (`fuente/js/pagina.js`), y por eso sus `modulepreload`
  solo valen en pantallas anchas, donde el inicio es el corto y lo mueve una pieza. Si se cambia esa regla, medir con
  `npm run velocidad`: con una foto como lo más grande de la pantalla, todo lo que llega antes de pintarla cuenta
  para el LCP.
- Las fotos y los videos del corto y de su cartel se convierten con `herramientas/optimizar.mjs` (necesita ffmpeg en
  la laptop). Los originales, pesados, viven en `originales/` (fuera del repo); aquí solo entra lo ya optimizado, sin
  audio.
- Sumar un oficio no toca el diseño ni el código: sus originales en `originales/comercial/` (`<oficio>-escena.png`,
  su escena acostada, de 16 por 9; si tiene toma viva, `<oficio>-escena-viva.mp4`, ese mismo cuadro en movimiento; y
  `<oficio>-trabajo.png`, de pie), su entrada en
  `fuente/datos/corto.json` (su cuenta de mensajes sin contestar, sus avisos, lo que hizo el agente en `trato`: el
  mensaje, lo que contestó, de dónde lo sacó, el pago, la frase con el anticipo que cobró y la cita en la agenda; a
  dónde mira la cámara en `mira` y, para el cartel, sus fotos, el recorte de su retrato y su conversación) y correr
  `node herramientas/optimizar.mjs <oficio>`, que toma los oficios de ese mismo archivo y vuelve a sacar todo lo de
  ese oficio. El retrato del cartel de celular se recorta de la foto de pie (`cartel.tu.recorte`: desde dónde y
  cuánto de lo ancho, en por ciento; mide tres por cuatro). De esa lista salen también los oficios entre los que
  elige el azar.
- `mira` se mide en por ciento de la foto. En la escena acostada: `persona` es el punto al que mira la cámara
  (ancho y alto); `celular`, el celular de la mesa (desde dónde empieza y cuánto mide: x, y, ancho y alto): a él baja
  la cámara, de él salen el aviso y el celular de la avalancha; y `viva`, la zona donde va la toma viva (x, y, ancho
  y alto): el video se recorta a esa zona, que es donde algo se mueve, y la página lo funde con la foto en sus
  orillas, así que debe terminar arriba del celular. `manos` es el punto de sus manos, la que queda más cerca de la
  conversación de su agente: la página no lo usa, lo usan las pruebas para cuidar que esa conversación nunca las
  tape. `dePie` es el punto al que mira la cámara en la foto de pie, la de la pantalla dividida del cierre. Si se
  cambia una foto, estos puntos se vuelven a medir mirándola.
- Las tarjetas de «Para quién» salen de `fuente/datos/giros.json` (`tarjeta`: el nombre, su renglón y el texto que
  describe la foto), una por oficio. Su retrato es `originales/retratos/<oficio>-retrato.png` (cuatro de ancho por
  cinco de alto); `node herramientas/optimizar.mjs retratos` lo publica entero, sin recorte, en tres anchos y dos
  formatos, cada archivo de 60 KB o menos (una prueba lo cuida). Sumar un oficio ahí tampoco toca el diseño.
- La demostración de «Tu dinero» es un celular con el aspecto de WhatsApp de día que cuenta sola, como un video, una
  cita en seis momentos; debajo va el letrero del momento y, después, lo que mientras tanto le llega a la profesional
  (su calendario, su Mercado Pago y la pregunta de asistencia). Los momentos, sus letreros y los rótulos viven en
  `fuente/datos/demo.json`. La historia, toma por toma y con lo que dura cada una, la arma `fuente/js/demo.js` sin
  tocar la pantalla (se prueba sin navegador); `fuente/js/demo-vista.js` la pinta y lleva el reloj: corre mientras el
  celular está a la vista, se pausa con su botón, cada rayita brinca a su momento y, con movimiento reducido, no corre
  sola: avanza a toques. Dentro del celular la letra es la del sistema: no se descarga ninguna fuente nueva.
- Sumar un oficio a la demostración casi no toca el código: su entrada en `fuente/datos/giros.json`, su guion en
  `fuente/datos/guiones/<oficio>.json` y su clave en la lista `GIROS` de `fuente/js/medicion.js` (la medición solo
  acepta valores de una lista cerrada; una prueba avisa si falta). La armada se detiene si a un ejemplo le falta un texto.
  En el guion, `"voz"` dice cuál mensaje de quien pide la cita llega como nota de voz (`"pregunta"`, al inicio, o
  `"pideDia"`, a media conversación); sin ella todo va por escrito. A una nota de voz el agente contesta con otra
  nota de voz (debajo de cada una se lee lo que dice, porque en la página no se oye) y el link de pago va siempre
  por escrito. Hoy: uñas a media conversación, médico al inicio y dentista por escrito, para que no empiecen igual.
- Los textos de las secciones viven en `fuente/datos/secciones.json` y `preguntas.json`. Ninguno promete algo que el
  producto no hace: se revisan contra la tabla de la verdad del PRD antes de cambiarse.
- «En una frase» conserva la frase que define el producto y sus tres palabras (de ahí leen los buscadores y los
  asistentes con IA) y, en medio, un antes y un después (`secciones.enUnaFrase.lados`).
- «Tu agente» reúne lo que antes eran dos secciones («Cómo funciona» y «Tu agente»; el dueño pidió fusionarlas el
  19-nov-2026). Son dos capítulos con el mismo menú (`fuente/datos/agentes.json`, `capitulos`): «Lo que hace», con
  sus beneficios (hoy, nueve; el primero cuenta una cita de principio a fin), y «Cómo empiezas», con los pasos para
  contratarlo (hoy, cuatro, numerados: `numerado`) y el botón de empezar. Un selector de dos posiciones enseña un
  capítulo y guarda el otro (son pestañas de verdad: flechas de lado, Inicio y Fin). El enlace «Cómo funciona» de la
  barra lleva aquí. Decisiones del dueño (19-nov-2026) que cuidan las pruebas: la sección no habla de exámenes; el
  agente saluda y le habla de usted a la clienta en todos los ejemplos (también en la demostración); no se promete
  «menos de un minuto» (a veces espera a que ella termine de escribir); y una nota de voz se contesta con otra.
- Cada escena de chat dice de quién es el celular que se ve, con la pieza `quien` (`de`: `clienta` o `tu`, su `texto`
  y, en la cita completa, el `momento`): oscuro lo que ve la clienta o paciente, en el azul de la marca lo que le
  llega a la profesional. Lo de una y lo de otra nunca salen en el mismo cuadro: lo anterior se va (`hasta`) antes
  de que llegue el rótulo siguiente.
- Cada renglón del menú abre su mini video: una escena de unos segundos hecha con las piezas del WhatsApp de día, no
  un archivo de video. En celular el menú es un acordeón; desde 900 de ancho el título, el selector y el menú van a
  la izquierda y un solo escenario a la derecha, que sube junto al título y se queda pegado bajo la barra mientras
  se recorre el menú (`.mv__riel`). De los datos sale todo: el título, la oración, lo que dura el mini video (`dura`,
  de 6 a 8 segundos; hasta 30 el que lleva `"largo": true`: hoy, el de la cita completa y el de los cambios) y sus pasos. Cada
  paso dice cuándo aparece (`en`, en segundos), si después se va (`hasta`) y trae UNA pieza de las que sabe dibujar
  `fuente/plantillas/parciales/mini-video.html` (un globo, la nota de voz, la base de conocimiento, la agenda, el
  pago, la cita, los botones de respuesta, las cuentas conectadas, una insignia...). Sumar o quitar un renglón es
  tocar esos datos, no el código; la armada se detiene (`herramientas/beneficios.mjs`) si a uno le falta algo o si su
  mini video no dura lo que debe. El movimiento es de
  los estilos (`fuente/estilos/agentes.css`: lo que ahí está escrito es el último cuadro, y las animaciones llevan el
  retraso de los datos). `fuente/js/agente.js` decide sin tocar la pantalla cuál está abierto y si corre (se prueba
  sin navegador) y `fuente/js/agente-vista.js` abre, cierra, pausa y repite: el primero corre solo una vez al llegar
  a la vista, solo corre uno y solo mientras se ve (el del capítulo guardado espera). La línea de avance se agarra
  (un toque salta, arrastrar recorre y las flechas van de segundo en segundo): como todas las piezas de una escena
  corren con el mismo reloj, adelantar o regresar es mover ese reloj. La escena del renglón que llega
  abierto en cada capítulo viene en la página; las demás viajan guardadas en un `<template>` y se sacan al abrirlas:
  así la página no carga con lo que nadie ha visto. La página llega con el menú ya armado; sin JavaScript, si su
  pieza no arranca o al imprimir se leen los dos capítulos como lista, cada uno con su nombre, y con movimiento
  reducido cada renglón es su último cuadro.
- En `preguntas.json`, `principal` marca las cinco preguntas que se ven de entrada; las demás van dentro de un
  `<details>` («Ver más preguntas»), sin JavaScript. Los datos estructurados y `llms.txt` llevan todas.
- Los retratos de «Para quién», el antes y después y la luz del botón de «Citas garantizadas» se encienden al entrar
  a la vista, una sola vez. La página llega con todo encendido: `fuente/js/encendido.js` apaga lo que todavía no se ve
  (`data-enciende="espera"`) y lo enciende al llegar (`"ya"`); cómo se ve cada estado lo dicen los estilos. Sin ese
  archivo, sin JavaScript o con movimiento reducido, todo se queda encendido y quieto.
- La hoja de estilos se publica achicada: `herramientas/achicar.mjs` le quita los comentarios y los espacios que
  sobran a la hoja unida (`pagina.css`), sin reordenar ni reescribir nada. Los comentarios se quedan en
  `fuente/estilos/`.
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
