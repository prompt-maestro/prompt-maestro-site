// @ts-check
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('la previa lleva noindex y la cinta, y nunca el CNAME del dominio', async () => {
  const { archivos, problemas } = await armarSitio({ raiz: RAIZ, destino: 'previa' });
  assert.deepEqual(problemas, []);
  assert.equal(archivos.has('CNAME'), false, 'un CNAME en la previa le quitaria el dominio a la pagina en vivo');
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
  const fuentes = [...archivos.keys()].filter((ruta) => ruta.endsWith('.woff2'));
  assert.ok(fuentes.length > 0);
  for (const ruta of fuentes) assert.match(ruta, /^r\/[0-9a-f]{10}\/fuentes\//, 'los recursos llevan su propia huella');
});

test('toda pagina lleva la politica de contenido y el idioma', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  for (const pagina of ['index.html', '404.html']) {
    const html = leer(archivos, pagina);
    assert.match(html, /<html lang="es-MX">/);
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self';[^"]*form-action 'none'"/);
    assert.doesNotMatch(html, /\sstyle="/, 'la politica de contenido bloquea los estilos en linea');
    // Un bloque de datos (application/json, o application/ld+json para los buscadores) no se ejecuta: es lo unico
    // que puede ir sin src.
    assert.doesNotMatch(
      html,
      /<script(?![^>]*\s(?:src=|type="application\/(?:ld\+)?json"))/,
      'la politica de contenido bloquea los scripts en linea',
    );
    assert.equal(html.match(/<h1\b/g)?.length, 1, 'un solo h1 por pagina');
  }
});

test('la demostracion lleva un boton por ejemplo, con el primero puesto, y los datos de todos', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const inicio = leer(archivos, 'index.html');
  /** @type {{ clave: string, nombre: string, lugar: string }[]} */
  const giros = JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', 'giros.json'), 'utf8'));
  assert.ok(giros.length >= 3);
  const botones = [
    ...inicio.matchAll(/<button class="demo__ejemplo"[^>]* data-demo-ejemplo="([^"]+)" aria-pressed="(\w+)">([^<]+)</g),
  ].map(([, clave, puesto, nombre]) => [clave, puesto, nombre]);
  assert.deepEqual(
    botones,
    giros.map((giro, indice) => [giro.clave, String(indice === 0), giro.nombre]),
  );
  assert.match(inicio, /<div class="demo__ejemplos" role="group" aria-labelledby="demo-ejemplos">/);
  // Lo que la pagina trae escrito es el primer ejemplo, en reposo. Que es un ejemplo lo dice el nombre de la
  // demostracion, para quien no la ve; los demas ejemplos viajan en los datos, cada uno con su guion.
  assert.ok(inicio.includes(` role="group" aria-label="Demostración con ${giros[0]?.lugar} de ejemplo.">`));
  assert.match(inicio, / data-demo data-ejemplo="unas" data-paso="reposo" data-momento="0" data-telefono="cliente" /);
  const datos = JSON.parse(/<script type="application\/json" data-demo-datos>(.*?)<\/script>/s.exec(inicio)?.[1] ?? '');
  assert.deepEqual(
    datos.ejemplos.map((/** @type {{ giro: { clave: string } }} */ ejemplo) => ejemplo.giro.clave),
    giros.map((giro) => giro.clave),
  );
  for (const ejemplo of datos.ejemplos) {
    assert.ok(ejemplo.guion.horas.includes(ejemplo.guion.horaSugerida), ejemplo.giro.clave);
  }
  assert.equal(datos.momentos.length, 6);
  // Una rayita por momento, con su nombre para quien no la ve; el letrero del primero ya viene escrito y se anuncia.
  const rayitas = [
    ...inicio.matchAll(/<button class="guia__tramo"[^>]* data-demo-tramo="(\d)"[^>]* aria-label="([^"]+)"/g),
  ].map(([, numero, nombre]) => [numero, nombre]);
  assert.deepEqual(
    rayitas,
    datos.momentos.map((/** @type {{ rotulo: string }} */ momento, /** @type {number} */ indice) => [
      String(indice + 1),
      `0${indice + 1} ${momento.rotulo}`,
    ]),
  );
  assert.match(
    inicio,
    /<div class="guia__letrero" data-demo-letrero aria-live="polite" aria-atomic="true">\s*<p class="guia__rotulo">01 · Contesta<\/p>\s*<p class="guia__texto">Escucha la nota de voz y contesta por escrito\.<\/p>/,
  );
  // Y la conversacion escrita, para quien no tiene JavaScript: empieza con la nota de voz y no ofrece otra salida.
  assert.match(inicio, /<p><b>Ana \(nota de voz\):<\/b> Hola, ¿cuánto cuesta el gelish\?<\/p>/);
  assert.doesNotMatch(inicio, /PERSONA|prefieres hablar/);
});

test('la armada avisa que no se puede publicar justo mientras los precios sean de prueba', async () => {
  const { avisos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const planes = JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', 'planes.json'), 'utf8'));
  assert.equal(
    avisos.some((aviso) => /PRECIOS DE PRUEBA/.test(aviso)),
    planes.dePrueba,
  );
});
