// @ts-check
// La medicion con el script de Umami de verdad (la copia que sirve la pagina), sin salir de la maquina:
//   1. como se ve en la laptop: la copia carga, pero fuera del dominio no manda nada;
//   2. con la direccion del dominio, simulada (lo que se pide a prompt-maestro.com se contesta con lo armado): la
//      politica de contenido la deja cargar y mandar, y a "Umami" (una ruta de esta prueba) le llegan la visita y los
//      eventos de la pagina, sin nada de lo que la persona traia en la direccion;
//   3. en el dominio, con la senal de "no rastrear" del navegador: no manda nada.
// Las demas pruebas usan un Umami de mentira (medicion.spec.mjs); estas son las unicas que corren la copia. Lo que
// no se puede probar aqui es el servidor de Umami de verdad: eso se mira en vivo, despues de publicar.
import { readFileSync } from 'node:fs';
import { vigilar } from './apoyo.mjs';
import { DE_TERCEROS, expect, test } from './base.mjs';

/** @type {{ sitio: string, envio: string }} */
const MEDICION = JSON.parse(readFileSync(new URL('../../fuente/datos/sitio.json', import.meta.url), 'utf8'))
  .medicion ?? { sitio: '', envio: '' };
const DOMINIO = 'https://prompt-maestro.com';
const ENVIO = MEDICION.envio ? new URL(MEDICION.envio).origin : '';
/** Lo que la copia manda de una visita, y nada mas. Un evento lleva ademas su nombre y sus datos. */
const DE_UNA_VISITA = ['hostname', 'language', 'referrer', 'screen', 'title', 'url', 'website'];
const DE_UN_EVENTO = [...DE_UNA_VISITA, 'data', 'name'].sort();

/** Lo que le llego al servidor de envio. @typedef {{ url: string, cabeceras: Record<string, string>, cuerpo: any }} Recibido */

// La etiqueta solo va en la armada del dominio (la previa nunca mide), y solo con la cuenta puesta en sitio.json.
test.skip(
  ({ baseURL }) => !MEDICION.sitio || new URL(String(baseURL)).pathname !== '/',
  'la medicion solo va en la armada del dominio',
);

// Al terminar se quitan las rutas: un pedido a medias (una foto que apenas venia) no debe tronar despues de la prueba.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

/**
 * Abre la tercera pregunta: para la pagina es un evento (pregunta_abre, con su posicion).
 * @param {import('@playwright/test').Page} page
 */
async function abrirUnaPregunta(page) {
  const pregunta = page.locator('details.pregunta').nth(2);
  await pregunta.locator('summary').click();
  await expect(pregunta).toHaveAttribute('open', '');
}

/**
 * Pone la pagina armada en la direccion del dominio y un Umami de mentira en su servidor de envio, los dos aqui mismo.
 * @param {import('@playwright/test').Page} page
 * @param {string | undefined} baseURL
 * @returns {Promise<{ recibidos: Recibido[], alEnvio: string[], aOtros: string[] }>}  lo que le llego a "Umami", lo
 *   que salio hacia su servidor (se anota en cuanto sale, antes de que nadie conteste) y lo que se pidio a cualquier
 *   otro servidor
 */
async function enElDominio(page, baseURL) {
  const local = new URL(String(baseURL)).origin;
  const permisos = {
    'access-control-allow-origin': DOMINIO,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-umami-website-id, x-umami-hostname, x-umami-cache',
  };
  /** @type {Recibido[]} */
  const recibidos = [];
  /** @type {string[]} */
  const alEnvio = [];
  /** @type {string[]} */
  const aOtros = [];
  page.on('request', (pedido) => {
    const { origin, protocol } = new URL(pedido.url());
    if (origin === ENVIO) alEnvio.push(`${pedido.method()} ${pedido.url()}`);
    else if (protocol.startsWith('http') && origin !== DOMINIO) aOtros.push(pedido.url());
  });
  // La pagina, tal cual se armo, contestada con la direccion del dominio.
  await page.route(`${DOMINIO}/**`, async (ruta) => {
    const { pathname } = new URL(ruta.request().url());
    await ruta.fulfill({ response: await page.request.get(`${local}${pathname}`) });
  });
  // Umami, de mentira: anota lo que le llega y contesta como el de verdad.
  await page.route(`${ENVIO}/**`, async (ruta) => {
    const pedido = ruta.request();
    if (pedido.method() === 'OPTIONS') {
      await ruta.fulfill({ status: 204, headers: permisos });
      return;
    }
    recibidos.push({ url: pedido.url(), cabeceras: pedido.headers(), cuerpo: pedido.postDataJSON() });
    await ruta.fulfill({ status: 200, contentType: 'application/json', headers: permisos, body: '{"cache":"prueba"}' });
  });
  return { recibidos, alEnvio, aOtros };
}

test('en la laptop la copia de verdad carga y no manda nada: fuera del dominio no se ensucian los numeros', async ({
  page,
}) => {
  // Lo que saldria de la maquina por culpa de la medicion: cualquier cosa al servidor de envio, o cualquier envio de
  // datos a otro lado. (Un antivirus puede pedir su propio script en las paginas locales: eso no es de la pagina.)
  /** @type {string[]} */
  const haciaFuera = [];
  page.on('request', (pedido) => {
    const { hostname, origin, protocol } = new URL(pedido.url());
    if (!protocol.startsWith('http') || hostname === '127.0.0.1') return;
    if (origin === ENVIO || pedido.method() !== 'GET') haciaFuera.push(`${pedido.method()} ${pedido.url()}`);
  });
  // Aqui si corre la copia de verdad.
  await page.route(
    (direccion) => DE_TERCEROS.test(direccion.pathname),
    (ruta) => ruta.continue(),
  );
  const fallas = vigilar(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  // La etiqueta es la de la cuenta y baja de la carpeta de codigo de la pagina.
  const etiqueta = page.locator('script[data-website-id]');
  await expect(etiqueta).toHaveAttribute('data-website-id', MEDICION.sitio);
  await expect(etiqueta).toHaveAttribute('data-host-url', ENVIO);
  await expect(etiqueta).toHaveAttribute('src', /^\/a\/[0-9a-f]{10}\/js\/terceros\/[a-z0-9.-]+\.js$/);
  // La politica de contenido dejo correr la copia: ahi esta su rastreador.
  await expect.poll(() => page.evaluate(() => typeof (/** @type {any} */ (window).umami?.track))).toBe('function');
  // La pagina le entrega un evento y, ademas, se le pide uno a mano: fuera de su dominio no manda ninguno.
  await abrirUnaPregunta(page);
  await page.evaluate(() => /** @type {any} */ (window).umami.track('prueba'));
  await page.evaluate(() => 1);
  expect(haciaFuera).toEqual([]);
  expect(fallas).toEqual([]);
});

test('en el dominio (simulado) la copia carga con la politica cerrada y manda la visita y los eventos, sin lo que venia en la direccion', async ({
  page,
  baseURL,
}) => {
  const { recibidos, aOtros } = await enElDominio(page, baseURL);
  const fallas = vigilar(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Llega con parametros y con un ancla en la direccion (los de un anuncio, o algo personal que alguien pego): no
  // deben viajar.
  await page.goto(`${DOMINIO}/?utm_source=anuncio&nombre=zutana#correo=fulana`);
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');

  // 1. La visita: una, al servidor de la cuenta, con el sitio de la cuenta y la direccion limpia.
  const visitas = () => recibidos.filter(({ cuerpo }) => cuerpo?.payload?.name === undefined);
  await expect.poll(() => visitas().length, { timeout: 15_000 }).toBe(1);
  const visita = /** @type {Recibido} */ (visitas()[0]);
  expect(visita.url).toBe(`${ENVIO}/api/send`);
  expect(visita.cuerpo.type).toBe('event');
  expect(Object.keys(visita.cuerpo.payload).sort()).toEqual(DE_UNA_VISITA);
  expect(visita.cuerpo.payload).toMatchObject({
    website: MEDICION.sitio,
    hostname: 'prompt-maestro.com',
    url: `${DOMINIO}/`,
    referrer: '',
  });
  expect(visita.cabeceras['x-umami-website-id']).toBe(MEDICION.sitio);

  // 2. Un evento de la pagina llega con su nombre y sus datos, y nada mas.
  await abrirUnaPregunta(page);
  const preguntas = () => recibidos.filter(({ cuerpo }) => cuerpo?.payload?.name === 'pregunta_abre');
  await expect.poll(() => preguntas().length, { timeout: 15_000 }).toBe(1);
  const evento = /** @type {Recibido} */ (preguntas()[0]).cuerpo.payload;
  expect(Object.keys(evento).sort()).toEqual(DE_UN_EVENTO);
  expect(evento).toMatchObject({ website: MEDICION.sitio, url: `${DOMINIO}/`, name: 'pregunta_abre', data: { id: 3 } });

  // Nada de lo que venia en la direccion viajo, y la visita se conto una sola vez.
  expect(JSON.stringify(recibidos)).not.toMatch(/zutana|fulana|utm_source|anuncio|correo/);
  expect(visitas()).toHaveLength(1);
  // La pagina no hablo con ningun otro servidor, y la politica de contenido no tuvo de que quejarse.
  expect(aOtros).toEqual([]);
  expect(fallas).toEqual([]);
});

test('con la senal de no rastrear del navegador, ni en el dominio se manda nada', async ({ page, baseURL }) => {
  const { recibidos, alEnvio, aOtros } = await enElDominio(page, baseURL);
  // La senal, como la da un navegador que la trae encendida.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1', configurable: true });
  });
  const fallas = vigilar(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${DOMINIO}/`);
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect.poll(() => page.evaluate(() => typeof (/** @type {any} */ (window).umami?.track))).toBe('function');
  // La pagina ya cargo completa (ahi se mandaria la visita) y se le entrega un evento: no sale ninguno de los dos.
  await page.waitForLoadState('load');
  await abrirUnaPregunta(page);
  await page.evaluate(() => /** @type {any} */ (window).umami.track('prueba'));
  await page.evaluate(() => 1);
  // Ni salio nada hacia el servidor de envio ni le llego nada.
  expect(alEnvio).toEqual([]);
  expect(recibidos).toEqual([]);
  expect(aOtros).toEqual([]);
  expect(fallas).toEqual([]);
});
