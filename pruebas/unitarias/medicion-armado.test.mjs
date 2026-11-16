// @ts-check
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armarSitio } from '../../herramientas/armado.mjs';
import { medicionDe } from '../../herramientas/medicion.mjs';
import { pintar } from '../../herramientas/plantilla.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @param {Buffer | string} contenido */
const sha256 = (contenido) => createHash('sha256').update(contenido).digest('hex');

// Una pagina de mentira: su codigo propio, con una copia del script de medicion en js/terceros/.
const COPIA = Buffer.from('/* el script de la medicion */\n', 'utf8');
const PROPIOS = new Map([
  ['js/pagina.js', Buffer.from('// la pagina\n', 'utf8')],
  ['js/terceros/medidor.js', COPIA],
  ['estilos/pagina.css', Buffer.from('a{}', 'utf8')],
]);
const DOMINIO = {
  destino: /** @type {const} */ ('publica'),
  dominio: 'prompt-maestro.com',
  activos: '/a/0123456789/',
  propios: PROPIOS,
};
const CUENTA = {
  sitio: '0f8fad5b-d9cb-469f-a165-70867728950e',
  script: 'js/terceros/medidor.js',
  huella: sha256(COPIA),
  envio: 'https://envio.ejemplo.mx/api',
};

test('sin cuenta de medicion la pagina no lleva script ni abre su politica de contenido', () => {
  for (const vacia of [undefined, null, {}, { sitio: '', script: '', huella: '', envio: '' }]) {
    assert.deepEqual(medicionDe(vacia, DOMINIO), { etiqueta: null, cspEnvio: '', problemas: [] });
  }
});

test('una medicion mal escrita no se apaga callada: detiene la armada', () => {
  for (const rara of [
    [],
    [CUENTA],
    'apagada',
    42,
    true,
    { sitio: 0, script: '', huella: '', envio: '' },
    { sitio: null },
    // Un dato con el nombre mal escrito: sin esto, la cuenta se quedaria apagada sin que nadie lo notara.
    { Sitio: CUENTA.sitio },
    { id: CUENTA.sitio, src: CUENTA.script },
    { sitio: '', script: '', huella: '', envio: '', huela: CUENTA.huella },
    { ...CUENTA, huela: CUENTA.huella },
  ]) {
    const medicion = medicionDe(rara, DOMINIO);
    assert.ok(medicion.problemas.length > 0, JSON.stringify(rara));
    assert.equal(medicion.etiqueta, null, JSON.stringify(rara));
    assert.equal(medicion.cspEnvio, '');
  }
});

test('con la cuenta completa, el script sale de la propia pagina y la politica se abre solo al servidor de envio', () => {
  assert.deepEqual(medicionDe(CUENTA, DOMINIO), {
    etiqueta: {
      // De la carpeta de codigo de la pagina, con su huella: nunca de otro servidor.
      script: '/a/0123456789/js/terceros/medidor.js',
      sitio: CUENTA.sitio,
      // A donde manda el script es el mismo servidor al que se le abrio la politica: no pueden quedar disparejos.
      envio: 'https://envio.ejemplo.mx',
      dominios: 'prompt-maestro.com,www.prompt-maestro.com',
    },
    cspEnvio: ' https://envio.ejemplo.mx',
    problemas: [],
  });
  // No existe un permiso para scripts de fuera: ni siquiera como dato vacio.
  assert.equal('cspScript' in medicionDe(CUENTA, DOMINIO), false);
});

test('en la previa nunca se mide, aunque la cuenta este completa', () => {
  assert.deepEqual(medicionDe(CUENTA, { ...DOMINIO, destino: 'previa', activos: '/pagina-previa/a/0123456789/' }), {
    etiqueta: null,
    cspEnvio: '',
    problemas: [],
  });
});

test('el script solo puede ser un archivo de la pagina, en js/terceros/: nunca la direccion de otro servidor', () => {
  for (const script of [
    'https://cloud.umami.is/script.js',
    'https://medicion.ejemplo.mx/script.js',
    '//medicion.ejemplo.mx/script.js',
    '/js/terceros/medidor.js',
    // Un archivo de la pagina que no es codigo de terceros, y los intentos de salirse de la carpeta.
    'js/pagina.js',
    'js/terceros/../pagina.js',
    'js/terceros/sub/medidor.js',
    'js/terceros/.medidor.js',
    // Uno que no existe.
    'js/terceros/otro.js',
    'js/terceros/medidor.js?x=1',
    '',
    42,
  ]) {
    const medicion = medicionDe({ ...CUENTA, script }, DOMINIO);
    assert.ok(
      medicion.problemas.some((problema) => problema.includes('medicion.script debe ser un archivo de')),
      String(script),
    );
    assert.equal(medicion.etiqueta, null, String(script));
    assert.equal(medicion.cspEnvio, '');
  }
});

test('si la copia del script cambia sin revisarse, o le falta su huella, la armada se detiene', () => {
  const otra = new Map(PROPIOS).set('js/terceros/medidor.js', Buffer.from('/* otra cosa */\n', 'utf8'));
  const cambiada = medicionDe(CUENTA, { ...DOMINIO, propios: otra });
  assert.ok(cambiada.problemas.some((problema) => problema.includes('no es la copia que se reviso')));
  assert.equal(cambiada.etiqueta, null);
  assert.equal(cambiada.cspEnvio, '');
  for (const huella of ['', 'abc', sha256(COPIA).toUpperCase(), `${sha256(COPIA)}0`, undefined]) {
    const medicion = medicionDe({ ...CUENTA, huella }, DOMINIO);
    assert.ok(
      medicion.problemas.some((problema) => problema.includes('medicion.huella')),
      String(huella),
    );
    assert.equal(medicion.etiqueta, null, String(huella));
  }
});

test('una cuenta a medias o con direcciones raras detiene la armada en vez de abrir la politica a ciegas', () => {
  const casos = [
    { ...CUENTA, sitio: 'no-es-un-identificador' },
    { ...CUENTA, envio: 'http://envio.ejemplo.mx/api' },
    { ...CUENTA, envio: 'https://envio.ejemplo.mx/api?x=1' },
    { ...CUENTA, envio: 'https://usuario@envio.ejemplo.mx/api' },
    { ...CUENTA, envio: '' },
    { sitio: CUENTA.sitio },
    { script: CUENTA.script },
    { huella: CUENTA.huella },
    // Un nombre que se ve igual pero lleva una letra de otro alfabeto (aqui, una "e" cirilica) es otro servidor.
    { ...CUENTA, envio: `https://envio.ej${String.fromCodePoint(0x435)}mplo.mx/api` },
    { ...CUENTA, envio: 'https://xn--envo-5qa.ejemplo.mx/api' },
    // Un comodin abriria la politica a cualquier servidor.
    { ...CUENTA, envio: 'https://*' },
    { ...CUENTA, envio: 'https://*.ejemplo.mx/api' },
    // Un punto y coma meteria una directiva nueva en la politica y dejaria la pagina sin scripts.
    { ...CUENTA, envio: 'https://a.com;script-src-elem/' },
    // Una clave quedaria publicada en la pagina.
    { ...CUENTA, envio: 'https://:clave@envio.ejemplo.mx/api' },
    // Ni puertos, ni direcciones sin dominio, ni numeros de maquina.
    { ...CUENTA, envio: 'https://envio.ejemplo.mx:8443/api' },
    { ...CUENTA, envio: 'https://localhost/api' },
    { ...CUENTA, envio: 'https://10.0.0.1/api' },
  ];
  for (const caso of casos) {
    const medicion = medicionDe(caso, DOMINIO);
    assert.ok(medicion.problemas.length > 0, JSON.stringify(caso));
    assert.equal(medicion.etiqueta, null, JSON.stringify(caso));
    assert.equal(medicion.cspEnvio, '');
  }
});

test('con cuenta, la etiqueta que se pinta lleva lo justo y la politica solo se abre para mandar', async () => {
  const medicion = medicionDe(CUENTA, DOMINIO);
  const armado = { medicion: medicion.etiqueta, cspEnvio: medicion.cspEnvio };
  const inicio = await readFile(path.join(RAIZ, 'fuente', 'plantillas', 'index.html'), 'utf8');
  const cabeza = await readFile(path.join(RAIZ, 'fuente', 'plantillas', 'parciales', 'cabeza.html'), 'utf8');
  // De cada plantilla, solo el renglon que importa: la etiqueta vive en el inicio y la politica en la cabeza.
  const renglonEtiqueta = /\{\{#si armado\.medicion\}\}[\s\S]*?\{\{\/si\}\}/.exec(inicio)?.[0] ?? '';
  const renglonPolitica = /<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(cabeza)?.[0] ?? '';
  const etiqueta = pintar(renglonEtiqueta, { armado }, {});
  const politica = pintar(renglonPolitica, { armado }, {});
  assert.equal(
    etiqueta.trim(),
    '<script async src="/a/0123456789/js/terceros/medidor.js" data-website-id="0f8fad5b-d9cb-469f-a165-70867728950e" data-host-url="https://envio.ejemplo.mx" data-domains="prompt-maestro.com,www.prompt-maestro.com" data-do-not-track="true" data-exclude-search="true" data-exclude-hash="true"></script>',
  );
  // Lo que Umami puede mandar de mas (el texto de un error, medidas de rendimiento) se queda apagado.
  assert.doesNotMatch(renglonEtiqueta, /data-errors|data-performance/);
  // Los scripts, solo de la casa: la plantilla no tiene por donde abrirle la puerta a otro servidor.
  assert.match(renglonPolitica, /script-src 'self'; /);
  assert.match(politica, /script-src 'self'; /);
  assert.match(politica, /connect-src 'self' https:\/\/envio\.ejemplo\.mx; /);
  // Apagada, la misma plantilla no pinta etiqueta y la politica queda cerrada.
  const apagado = { medicion: false, cspEnvio: '' };
  assert.equal(pintar(renglonEtiqueta, { armado: apagado }, {}).trim(), '');
  assert.match(pintar(renglonPolitica, { armado: apagado }, {}), /script-src 'self'; .*connect-src 'self'; /);
  // La 404 comparte la cabeza y no mide: ahi viajaria una ruta escrita por la persona.
  assert.doesNotMatch(cabeza, /data-website-id/);
});

test('lo armado hoy coincide con sitio.json: ni un script de fuera, y un solo permiso de mas si hay cuenta', async () => {
  const sitio = JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', 'sitio.json'), 'utf8'));
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const politica = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  // Con cuenta o sin ella, la pagina no carga ningun script de otro servidor.
  assert.deepEqual(
    [...html.matchAll(/<script[^>]*\ssrc="((?:https?:)?\/\/[^"]+)"/g)].map(([, src]) => src),
    [],
  );
  assert.match(politica, /script-src 'self';/);
  const etiqueta = /<script async src="([^"]+)" data-website-id="([^"]+)" data-host-url="([^"]+)"/.exec(html);
  if (sitio.medicion?.sitio) {
    // Con cuenta: una etiqueta, con el sitio de la cuenta, que baja de la carpeta de codigo de la pagina.
    assert.ok(etiqueta, 'falta la etiqueta de la medicion');
    const [, src = '', identificador, envio = ''] = etiqueta;
    assert.equal(identificador, sitio.medicion.sitio);
    assert.match(src, /^\/a\/[0-9a-f]{10}\/js\/terceros\/[a-z0-9.-]+\.js$/);
    assert.equal(html.match(/data-website-id=/g)?.length, 1);
    // Lo publicado es, byte por byte, la copia revisada.
    assert.equal(sha256(/** @type {Buffer} */ (archivos.get(src.slice(1)))), sitio.medicion.huella);
    // Y el unico servidor de fuera con el que la pagina puede hablar es al que manda el script.
    assert.equal(envio, new URL(sitio.medicion.envio).origin);
    assert.match(politica, new RegExp(`connect-src 'self' ${envio.replaceAll('.', '\\.')};`));
    assert.deepEqual(politica.match(/https?:\/\/[^\s;]+/g), [envio]);
  } else {
    assert.equal(etiqueta, null);
    assert.match(politica, /connect-src 'self';/);
    assert.equal(politica.match(/https?:\/\/[^\s;]+/g), null);
  }
  // Ni la 404 ni la previa miden nunca, y ninguna de las dos le abre la politica a nadie.
  const noEncontrada = archivos.get('404.html')?.toString('utf8') ?? '';
  assert.doesNotMatch(noEncontrada, /data-website-id/);
  assert.match(noEncontrada, /script-src 'self'; .*connect-src 'self'; /);
  const previa = (await armarSitio({ raiz: RAIZ, destino: 'previa' })).archivos.get('index.html')?.toString('utf8');
  assert.doesNotMatch(previa ?? '', /data-website-id/);
  assert.match(previa ?? '', /script-src 'self'; .*connect-src 'self'; /);
});

test('la copia del script de medicion solo conoce un servidor: el mismo al que la pagina le abre la politica', async () => {
  const sitio = JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', 'sitio.json'), 'utf8'));
  if (!sitio.medicion?.script) return;
  const copia = await readFile(path.join(RAIZ, 'fuente', sitio.medicion.script), 'utf8');
  // Si una version nueva del script hablara con otro servidor, o bajara mas codigo, se ve aqui antes de publicarse.
  const servidores = new Set([...copia.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map(([servidor]) => servidor));
  // "https://localhost" es solo la base con que el script lee una ruta: no es una direccion a la que mande nada.
  servidores.delete('https://localhost');
  assert.deepEqual([...servidores], [new URL(sitio.medicion.envio).origin]);
  // No baja mas codigo, no toca cookies y no guarda nada en el navegador. El codigo viene achicado, asi que se busca
  // la propiedad o la funcion por su nombre, que no se puede achicar.
  assert.doesNotMatch(
    copia,
    /createElement|importScripts|\bimport\(|\beval\(|Function\(|\.cookie\b|setItem|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|WebSocket|EventSource/,
  );
  // Habla por un solo camino (fetch), sin mandar las cookies del servidor de envio, y del navegador solo LEE una
  // marca: la que apaga la medicion.
  assert.equal(copia.match(/\bfetch\(/g)?.length, 2);
  // Sus dos envios dicen con que credenciales van: uno las apaga fijo y el otro toma un valor que, si la etiqueta
  // no dice otra cosa (y la nuestra no lo dice), tambien las apaga.
  assert.equal(copia.match(/credentials:/g)?.length, 2);
  assert.doesNotMatch(copia, /credentials:"(?!omit")/);
  assert.match(copia, /\("fetch-credentials"\)\|\|"omit"/);
  assert.deepEqual(copia.match(/localStorage|getItem\("[^"]*"\)/g), ['localStorage', 'getItem("umami.disabled")']);
  // Su licencia viaja junto a ella.
  const licencia = await readFile(path.join(RAIZ, 'fuente', sitio.medicion.script.replace(/\.js$/, '.txt')), 'utf8');
  assert.match(licencia, /MIT License/);
  assert.ok(licencia.includes(sitio.medicion.huella), 'la nota de la copia debe decir su huella');
});
