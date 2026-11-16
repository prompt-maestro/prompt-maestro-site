// @ts-check
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armarSitio } from '../../herramientas/armado.mjs';
import { medicionDe } from '../../herramientas/medicion.mjs';
import { pintar } from '../../herramientas/plantilla.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOMINIO = { destino: /** @type {const} */ ('publica'), dominio: 'prompt-maestro.com' };
const CUENTA = {
  sitio: '0f8fad5b-d9cb-469f-a165-70867728950e',
  script: 'https://medicion.ejemplo.mx/script.js',
  envio: 'https://envio.ejemplo.mx/api',
};

test('sin cuenta de medicion la pagina no lleva script ni abre su politica de contenido', () => {
  for (const vacia of [undefined, null, {}, { sitio: '', script: '', envio: '' }]) {
    assert.deepEqual(medicionDe(vacia, DOMINIO), { etiqueta: null, cspScript: '', cspEnvio: '', problemas: [] });
  }
});

test('con la cuenta completa, la etiqueta va en el dominio y la politica se abre solo a esos dos servidores', () => {
  assert.deepEqual(medicionDe(CUENTA, DOMINIO), {
    etiqueta: {
      script: 'https://medicion.ejemplo.mx/script.js',
      sitio: CUENTA.sitio,
      // A donde manda el script es el mismo servidor al que se le abrio la politica: no pueden quedar disparejos.
      envio: 'https://envio.ejemplo.mx',
      dominios: 'prompt-maestro.com,www.prompt-maestro.com',
    },
    cspScript: ' https://medicion.ejemplo.mx',
    cspEnvio: ' https://envio.ejemplo.mx',
    problemas: [],
  });
});

test('en la previa nunca se mide, aunque la cuenta este completa', () => {
  assert.deepEqual(medicionDe(CUENTA, { destino: 'previa', dominio: 'prompt-maestro.com' }), {
    etiqueta: null,
    cspScript: '',
    cspEnvio: '',
    problemas: [],
  });
});

test('una cuenta a medias o con direcciones raras detiene la armada en vez de abrir la politica a ciegas', () => {
  const casos = [
    { ...CUENTA, sitio: 'no-es-un-identificador' },
    { ...CUENTA, script: 'http://medicion.ejemplo.mx/script.js' },
    { ...CUENTA, script: 'https://medicion.ejemplo.mx/script.js?x=1' },
    { ...CUENTA, script: 'https://medicion.ejemplo.mx/' },
    { ...CUENTA, envio: 'https://usuario@envio.ejemplo.mx/api' },
    { ...CUENTA, envio: '' },
    { sitio: CUENTA.sitio },
    // Un comodin abriria la politica a cualquier servidor.
    { ...CUENTA, envio: 'https://*' },
    { ...CUENTA, script: 'https://*/script.js' },
    { ...CUENTA, script: 'https://*.ejemplo.mx/script.js' },
    // Un punto y coma meteria una directiva nueva en la politica y dejaria la pagina sin scripts.
    { ...CUENTA, envio: 'https://a.com;script-src-elem/' },
    // Una clave quedaria publicada en la pagina.
    { ...CUENTA, script: 'https://:clave@medicion.ejemplo.mx/script.js' },
    // Ni puertos, ni direcciones sin dominio, ni numeros de maquina.
    { ...CUENTA, envio: 'https://envio.ejemplo.mx:8443/api' },
    { ...CUENTA, envio: 'https://localhost/api' },
    { ...CUENTA, envio: 'https://10.0.0.1/api' },
  ];
  for (const caso of casos) {
    const medicion = medicionDe(caso, DOMINIO);
    assert.ok(medicion.problemas.length > 0, JSON.stringify(caso));
    assert.equal(medicion.etiqueta, null, JSON.stringify(caso));
    assert.equal(medicion.cspScript, '');
    assert.equal(medicion.cspEnvio, '');
  }
});

test('con cuenta, la etiqueta que se pinta lleva lo justo y la politica se abre solo a sus dos servidores', async () => {
  const medicion = medicionDe(CUENTA, DOMINIO);
  const armado = { medicion: medicion.etiqueta, cspScript: medicion.cspScript, cspEnvio: medicion.cspEnvio };
  const inicio = await readFile(path.join(RAIZ, 'fuente', 'plantillas', 'index.html'), 'utf8');
  const cabeza = await readFile(path.join(RAIZ, 'fuente', 'plantillas', 'parciales', 'cabeza.html'), 'utf8');
  // De cada plantilla, solo el renglon que importa: la etiqueta vive en el inicio y la politica en la cabeza.
  const renglonEtiqueta = /\{\{#si armado\.medicion\}\}[\s\S]*?\{\{\/si\}\}/.exec(inicio)?.[0] ?? '';
  const renglonPolitica = /<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(cabeza)?.[0] ?? '';
  const etiqueta = pintar(renglonEtiqueta, { armado }, {});
  const politica = pintar(renglonPolitica, { armado }, {});
  assert.equal(
    etiqueta.trim(),
    '<script async src="https://medicion.ejemplo.mx/script.js" data-website-id="0f8fad5b-d9cb-469f-a165-70867728950e" data-host-url="https://envio.ejemplo.mx" data-domains="prompt-maestro.com,www.prompt-maestro.com" data-do-not-track="true" data-exclude-search="true"></script>',
  );
  // Lo que Umami puede mandar de mas (el texto de un error, medidas de rendimiento) se queda apagado.
  assert.doesNotMatch(renglonEtiqueta, /data-errors|data-performance/);
  assert.match(politica, /script-src 'self' https:\/\/medicion\.ejemplo\.mx; /);
  assert.match(politica, /connect-src 'self' https:\/\/envio\.ejemplo\.mx; /);
  // Apagada, la misma plantilla no pinta etiqueta y la politica queda cerrada.
  const apagado = { medicion: false, cspScript: '', cspEnvio: '' };
  assert.equal(pintar(renglonEtiqueta, { armado: apagado }, {}).trim(), '');
  assert.match(pintar(renglonPolitica, { armado: apagado }, {}), /script-src 'self'; .*connect-src 'self'; /);
  // La 404 comparte la cabeza y no mide: ahi viajaria una ruta escrita por la persona.
  assert.doesNotMatch(cabeza, /data-website-id/);
});

test('lo armado hoy coincide con sitio.json: si no hay cuenta, ni un script ajeno ni un permiso de mas', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const politica = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  const ajenos = [...html.matchAll(/<script[^>]*\ssrc="(https?:[^"]+)"/g)].map(([, src]) => src);
  const medida = /data-website-id="([^"]+)"/.exec(html)?.[1];
  if (medida) {
    // Con cuenta: un solo script ajeno, el de la medicion, y la politica abierta justo a el.
    assert.equal(ajenos.length, 1);
    assert.ok(politica.includes(new URL(ajenos[0] ?? '').origin));
  } else {
    assert.deepEqual(ajenos, []);
    assert.match(politica, /script-src 'self';/);
    assert.match(politica, /connect-src 'self';/);
  }
  // Ni la 404 ni la previa miden nunca.
  assert.doesNotMatch(archivos.get('404.html')?.toString('utf8') ?? '', /data-website-id/);
  const previa = (await armarSitio({ raiz: RAIZ, destino: 'previa' })).archivos.get('index.html')?.toString('utf8');
  assert.doesNotMatch(previa ?? '', /data-website-id/);
});
