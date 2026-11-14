// @ts-check
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armarSitio } from '../../herramientas/armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * @param {Map<string, Buffer>} archivos
 * @param {string} ruta
 * @returns {string}
 */
function leer(archivos, ruta) {
  const contenido = archivos.get(ruta);
  assert.ok(contenido, `falta ${ruta} en lo armado`);
  return contenido.toString('utf8');
}

test('la armada publica no trae problemas y lleva lo que GitHub Pages necesita', async () => {
  const { archivos, problemas } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  assert.deepEqual(problemas, []);
  assert.equal(leer(archivos, 'CNAME'), 'prompt-maestro.com\n', 'sin CNAME se pierde el dominio');
  assert.ok(archivos.has('.nojekyll'));
  assert.ok(archivos.has('index.html'));
  assert.ok(archivos.has('404.html'));
});

test('la armada publica no lleva noindex en el inicio ni la cinta de previa', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const inicio = leer(archivos, 'index.html');
  assert.doesNotMatch(inicio, /noindex/);
  assert.doesNotMatch(inicio, /cinta-previa/);
  assert.match(inicio, /<link rel="canonical" href="https:\/\/prompt-maestro\.com\/">/);
});

test('la previa lleva noindex, la cinta y robots cerrado, y nunca el CNAME del dominio', async () => {
  const { archivos, problemas } = await armarSitio({ raiz: RAIZ, destino: 'previa' });
  assert.deepEqual(problemas, []);
  assert.equal(archivos.has('CNAME'), false, 'un CNAME en la previa le quitaria el dominio a la pagina en vivo');
  assert.equal(leer(archivos, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  for (const pagina of ['index.html', '404.html']) {
    const html = leer(archivos, pagina);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /class="cinta-previa"/);
  }
});

test('en la previa todo enlace interno vive dentro de /pagina-previa/', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'previa' });
  const html = leer(archivos, 'index.html');
  const internos = [...html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1] ?? '');
  assert.ok(internos.length > 0);
  for (const destino of internos) assert.ok(destino.startsWith('/pagina-previa/'), destino);
});

test('la 404 publica no se indexa y regresa al inicio', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = leer(archivos, '404.html');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<a class="boton" href="\/">Ir al inicio<\/a>/);
});

test('armar dos veces da exactamente lo mismo', async () => {
  const una = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const otra = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  assert.deepEqual([...una.archivos.keys()], [...otra.archivos.keys()]);
  for (const [ruta, contenido] of una.archivos)
    assert.ok(contenido.equals(/** @type {Buffer} */ (otra.archivos.get(ruta))), ruta);
});

test('los estilos van en una carpeta con la huella de su contenido', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const estilos = [...archivos.keys()].filter((ruta) => ruta.endsWith('.css'));
  assert.ok(estilos.length > 0);
  for (const ruta of estilos) assert.match(ruta, /^a\/[0-9a-f]{10}\/estilos\//);
});

test('toda pagina lleva la politica de contenido y el idioma', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  for (const pagina of ['index.html', '404.html']) {
    const html = leer(archivos, pagina);
    assert.match(html, /<html lang="es-MX">/);
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self';[^"]*form-action 'none'"/);
    assert.doesNotMatch(html, /\sstyle="/, 'la politica de contenido bloquea los estilos en linea');
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)/, 'la politica de contenido bloquea los scripts en linea');
    assert.equal(html.match(/<h1\b/g)?.length, 1, 'un solo h1 por pagina');
  }
});

test('mientras los precios sean de prueba, la armada lo avisa', async () => {
  const { avisos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  assert.ok(avisos.some((aviso) => /PRECIOS DE PRUEBA/.test(aviso)));
});
