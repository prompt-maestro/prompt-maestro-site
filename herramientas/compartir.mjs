// @ts-check
// La imagen que se ve al compartir el enlace (WhatsApp, Facebook, Messages):  node herramientas/compartir.mjs
// La compone con lo que la pagina ya tiene: la toma de unas del corto, la tipografia, el logotipo y el titulo.
// Escribe fuente/raiz/compartir.jpg (1200 por 630, ligera: WhatsApp no ensena imagenes pesadas) y, de paso, el icono
// que el iPhone pone en la pantalla de inicio (fuente/raiz/apple-touch-icon.png, 180 por 180). Se corre a mano
// cuando cambia el titulo o la toma; necesita el navegador de las pruebas (npx playwright install chromium).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'fuente', 'raiz', 'compartir.jpg');
const ICONO = path.join(RAIZ, 'fuente', 'raiz', 'apple-touch-icon.png');
const ANCHO = 1200;
const ALTO = 630;

const leer = async (/** @type {string} */ ruta) => JSON.parse(await readFile(path.join(RAIZ, ruta), 'utf8'));
const direccion = (/** @type {string} */ ruta) => pathToFileURL(path.join(RAIZ, ruta)).href;

const corto = await leer('fuente/datos/corto.json');
const sitio = await leer('fuente/datos/sitio.json');
const marca = await readFile(path.join(RAIZ, 'fuente', 'plantillas', 'parciales', 'marca.html'), 'utf8');

// Los mismos colores que fuente/estilos/tokens.css.
const html = `<!doctype html>
<html lang="es-MX">
<meta charset="utf-8">
<style>
  @font-face { font-family: Outfit; src: url("${direccion('fuente/recursos/fuentes/outfit.woff2')}") format("woff2"); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; background: #070916; color: #f5f4f0; font-family: Outfit, sans-serif; }
  .toma { position: absolute; inset: 0 0 0 38%; background: url("${direccion('fuente/recursos/comercial/unas-trabajo-1080.webp')}") 50% 30% / cover; }
  .velo { position: absolute; inset: 0; background: linear-gradient(90deg, #070916 0%, #070916 36%, rgb(7 9 22 / 0.82) 52%, rgb(7 9 22 / 0.2) 78%, rgb(7 9 22 / 0.35) 100%); }
  main { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 64px 72px; }
  .marca { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 600; letter-spacing: -0.01em; }
  .marca svg { height: 44px; }
  .marca__cursor { fill: #5873ff; }
  .sobre { color: #8497ff; font-size: 20px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; }
  h1 { margin-top: 18px; font-size: 118px; font-weight: 500; line-height: 0.95; letter-spacing: -0.045em; }
  h1 i { display: inline-block; width: 52px; height: 13px; margin-left: 6px; background: #5873ff; }
  p.texto { max-width: 640px; margin-top: 26px; color: #c4c9e4; font-size: 34px; line-height: 1.25; letter-spacing: -0.01em; }
  .pie { color: #979ec4; font-size: 22px; font-weight: 500; letter-spacing: 0.04em; }
</style>
<div class="toma"></div>
<div class="velo"></div>
<main>
  <div class="marca">${marca}<span>${sitio.nombre}</span></div>
  <div>
    <p class="sobre">${sitio.producto}</p>
    <h1>${corto.cartel.titulo}<i></i></h1>
    <p class="texto">${sitio.compartirTexto}</p>
  </div>
  <p class="pie">prompt-maestro.com</p>
</main>
</html>`;

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 });
  // La composicion se abre desde un archivo dentro del repo para que pueda leer la toma y la tipografia.
  await pagina.goto(direccion('package.json'));
  await pagina.setContent(html, { waitUntil: 'load' });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.screenshot({ path: SALIDA, type: 'jpeg', quality: 84 });
  // El icono para iPhone: el logotipo sobre el fondo de noche, sin esquinas (el telefono las redondea).
  await pagina.setViewportSize({ width: 180, height: 180 });
  await pagina.setContent(
    `<!doctype html><style>*{margin:0}body{display:grid;place-items:center;width:180px;height:180px;background:#070916;color:#f5f4f0}
    svg{width:118px}.marca__cursor{fill:#5873ff}</style>${marca}`,
    { waitUntil: 'load' },
  );
  await pagina.screenshot({ path: ICONO, type: 'png' });
} finally {
  await navegador.close();
}
console.log(
  `Escritas ${path.relative(RAIZ, SALIDA)} (${ANCHO} por ${ALTO}) y ${path.relative(RAIZ, ICONO)} (180 por 180).`,
);
