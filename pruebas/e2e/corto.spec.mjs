// @ts-check
// El inicio: el cartel y, solo en pantallas anchas, el corto. En celular y en tableta de pie (los perfiles celular,
// previa e iphone) se comprueba que el corto NO corre y que el cartel esta completo, con "Tu y tu agente" y un oficio
// al azar; el corto (un oficio por visita, a pantalla completa) se prueba en escritorio y en firefox. El tiempo de la
// pagina lo lleva el reloj de Playwright: las pruebas lo detienen y lo adelantan, sin esperar el medio minuto de verdad.
import { readFileSync } from 'node:fs';
import { abrirCortoDetenido, hastaElCuadro, sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

const ALTA = 'https://alta.prompt-maestro.com/';
/**
 * Un oficio, con lo que el cartel ensena de el.
 * @typedef {object} Oficio
 * @property {string} clave
 * @property {string} nombre
 * @property {{ persona: string, manos: string, celular: string }} mira
 * @property {{ base: number, tope: number }} cuenta
 * @property {{ quien: string }[]} llegan
 * @property {{ quien: string, texto: string, responde: string, fuente: string, pago: string, hizo: string, agenda: string, foto: boolean }} trato
 * @property {object} cartel
 * @property {string} cartel.cuando
 * @property {string} cartel.quien
 * @property {{ foto: string, alt: string }} cartel.tu
 * @property {{ negocio: string, iniciales: string, quien: string, entra: string, responde: string, anticipo: string }} cartel.charla
 */
// El guion y los textos salen del mismo archivo que la pagina: si cambian, estas pruebas siguen valiendo.
/**
 * @type {{
 *   guion: { clave: string, dura: number, letrero: string }[],
 *   cartel: Record<string, string> & { herramientas: string[] },
 *   marca: { nombre: string, frase: string },
 *   todos: { baja: string[] },
 *   pagoAprobado: string,
 *   canal: string,
 *   oficios: Oficio[],
 * }}
 */
const CORTO = JSON.parse(readFileSync(new URL('../../fuente/datos/corto.json', import.meta.url), 'utf8'));
const MOMENTOS = CORTO.guion.map((momento) => momento.clave);
/** Los dos renglones chicos del cierre, como se leen seguidos. */
const BAJA = CORTO.todos.baja.join(' ');
const CARTEL = 'cartel';
/** Los perfiles con pantalla ancha: los unicos donde corre el corto. */
const ANCHOS = ['escritorio', 'firefox'];
/** La misma pregunta que hacen los estilos para pintar el corto y sus controles. */
const ANCHA = '(min-width: 900px) and (min-aspect-ratio: 1/1)';

/** @param {import('@playwright/test').TestInfo} info */
const esAncho = (info) => ANCHOS.includes(info.project.name);

/**
 * Hace que a la visitante le toque un oficio: el azar de la pagina contesta siempre lo mismo. Va antes de abrirla.
 * @param {import('@playwright/test').Page} page
 * @param {number} lugar  el lugar del oficio en la lista de los datos
 */
async function queLeToque(page, lugar) {
  await page.addInitScript(
    (valor) => {
      Math.random = () => valor;
    },
    (lugar + 0.5) / CORTO.oficios.length,
  );
}

/**
 * La caja de un elemento en la pantalla, como la ve el navegador (con todo y su giro).
 * @param {import('@playwright/test').Locator} elemento
 */
async function caja(elemento) {
  const { x, y, width, height } = (await elemento.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  return { izquierda: x, arriba: y, derecha: x + width, abajo: y + height };
}

/**
 * Lo que de verdad queda encima en el centro de un elemento: "corto" si lo tapan las capas del corto, "cartel" si
 * se ve el cartel.
 * @param {import('@playwright/test').Locator} elemento
 */
function encimaDe(elemento) {
  return elemento.evaluate((el) => {
    const caja = el.getBoundingClientRect();
    const arriba = document.elementFromPoint(caja.left + caja.width / 2, caja.top + caja.height / 2);
    if (arriba?.closest('[data-corto-cine]')) return 'corto';
    return arriba?.closest('[data-cartel]') ? 'cartel' : 'otra cosa';
  });
}

/** @param {import('@playwright/test').Page} page */
const desborde = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * Anota los videos que la pagina pide a la red.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function videosPedidos(page) {
  /** @type {string[]} */
  const videos = [];
  page.on('request', (peticion) => {
    if (peticion.url().endsWith('.mp4')) videos.push(peticion.url());
  });
  return videos;
}

/**
 * Anota lo que la pagina pide a la red y se llama como dice el patron: solo el nombre del archivo.
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} patron
 * @returns {string[]}
 */
function pedidos(page, patron) {
  /** @type {string[]} */
  const nombres = [];
  page.on('request', (peticion) => {
    const nombre = new URL(peticion.url()).pathname.split('/').pop() ?? '';
    if (patron.test(nombre)) nombres.push(nombre);
  });
  return nombres;
}

/**
 * Espera a que lo que entra con una animacion termine de entrar (las que nunca terminan no se esperan): asi su caja
 * ya es la de verdad.
 * @param {import('@playwright/test').Locator} elemento
 */
async function asentado(elemento) {
  await expect
    .poll(
      () =>
        elemento.evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .filter((una) => una.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
            .every((una) => una.playState === 'finished'),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

/**
 * Donde cae en la pantalla algo de la foto de una escena, ya con su camara y su acercamiento: un punto ("64 44") o
 * una zona ("52 81 31 14"), en por ciento de la foto, como viajan en los datos. De un punto sale una caja sin medida.
 * @param {import('@playwright/test').Locator} escena
 * @param {string} donde
 */
function enPantalla(escena, donde) {
  return escena.evaluate((el, texto) => {
    const foto = el.querySelector('.foto__vivo')?.getBoundingClientRect();
    if (!foto) throw new Error('la escena no trae su foto');
    const [x = 0, y = 0, ancho = 0, alto = 0] = texto.split(' ').map((uno) => Number(uno) / 100);
    return {
      izquierda: foto.left + x * foto.width,
      arriba: foto.top + y * foto.height,
      derecha: foto.left + (x + ancho) * foto.width,
      abajo: foto.top + (y + alto) * foto.height,
    };
  }, donde);
}

/**
 * Espera a que la camara de una escena termine de moverse: su foto se corre con una transicion.
 * @param {import('@playwright/test').Locator} escena
 */
async function camaraQuieta(escena) {
  await expect
    .poll(
      () =>
        escena.locator('.foto').evaluate((foto) => {
          // Leer su lugar obliga al navegador a ponerse al dia: si la camara tiene que moverse, aqui ya empezo.
          void getComputedStyle(foto).transform;
          return foto.getAnimations().every((una) => una.playState === 'finished');
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

/**
 * El aire entre dos cajas: lo que las separa a lo ancho o a lo alto (lo que sea mas). Negativo si se enciman.
 * @param {{ izquierda: number, arriba: number, derecha: number, abajo: number }} una
 * @param {{ izquierda: number, arriba: number, derecha: number, abajo: number }} otra
 */
const aire = (una, otra) =>
  Math.max(
    otra.izquierda - una.derecha,
    una.izquierda - otra.derecha,
    otra.arriba - una.abajo,
    una.arriba - otra.abajo,
  );

/**
 * Los oficios cuya foto de escena la pagina pidio por adelantado (cada uno, un <link rel="preload"> en su <head>).
 * @param {import('@playwright/test').Page} page
 */
const adelantadas = (page) =>
  page.evaluate(() =>
    [...document.head.querySelectorAll('link[rel="preload"][as="image"]')].map(
      (adelanto) => /([a-z]+)-escena-/.exec(adelanto.getAttribute('imagesrcset') ?? '')?.[1] ?? '',
    ),
  );

// ---------------------------------------------------------------------------------------------------------------
// El cartel: en todos los tamanos.
// ---------------------------------------------------------------------------------------------------------------

test('el cartel trae el titulo, la frase, el boton al alta, el enlace a la demostracion y la cita con su sello', async ({
  page,
}, info) => {
  const fallas = vigilar(page);
  await queLeToque(page, 0);
  // Con menos movimiento el cartel se ve de entrada en cualquier pantalla.
  const corto = await abrirCortoDetenido(page, { quieta: true });
  await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
  // La etiqueta de arranque.js dice sus fotos con el mismo dato que las escenas ("data-escena"), y no es una: al
  // guardar las escenas de los demas oficios, a ella nadie la toca.
  const etiqueta = page.locator('script[data-oficios]');
  await expect(etiqueta).toHaveAttribute('data-escena', /-escena-/);
  await expect(etiqueta).not.toHaveAttribute('hidden', /.*/);
  const titulo = corto.getByRole('heading', { level: 1 });
  await expect(titulo).toHaveText('Despreocúpate');
  await expect(titulo).toBeInViewport({ ratio: 1 });
  expect(await encimaDe(titulo)).toBe('cartel');
  const frase = corto.locator('.cartel__frase');
  await expect(frase).toHaveText(CORTO.cartel.frase ?? '');
  await expect(frase).toBeInViewport({ ratio: 1 });
  await expect(corto.locator('.cartel .sobre')).toHaveText(
    'Uñas, dentistas, médicos y pronto más oficios y profesiones',
  );
  const empieza = corto.getByRole('link', { name: 'Empieza ahora' });
  await expect(empieza).toBeInViewport({ ratio: 1 });
  await expect(empieza).toHaveAttribute('href', ALTA);
  await expect(empieza).not.toHaveAttribute('target', /.*/);
  // La cita del primer oficio, ya garantizada: una sola a la vista.
  const cita = corto.locator('.cita').filter({ visible: true });
  await expect(cita).toHaveCount(1);
  await expect(cita).toContainText('Sábado · 11:00 am');
  await expect(cita).toContainText('Ana · Gelish');
  await expect(cita.getByRole('img', { name: 'Garantizada: anticipo pagado' })).toBeVisible();
  // Y su imagen: en pantallas anchas, la agente que ilustra al agente virtual; en las demas, "Tu y tu agente".
  if (esAncho(info)) {
    const foto = corto.locator('.agente__foto');
    await expect(foto).toHaveAttribute('alt', /agente virtual/);
    await expect(foto).toHaveJSProperty('complete', true);
    await expect(cita).toBeInViewport({ ratio: 0.9 });
    await expect(corto.locator('.duo')).toBeHidden();
  } else {
    await expect(corto.getByRole('figure', { name: CORTO.cartel.ejemplo ?? '' })).toBeVisible();
    await expect(corto.locator('.agente')).toBeHidden();
  }
  // El cartel ocupa justo una pantalla (tambien en la previa, que lleva su cinta arriba) y nada se sale a lo ancho.
  const { abajo, alto } = await corto.evaluate((el) => ({
    abajo: el.getBoundingClientRect().bottom,
    alto: window.innerHeight,
  }));
  expect(Math.abs(abajo - alto)).toBeLessThanOrEqual(1);
  expect(await desborde(page)).toBeLessThanOrEqual(0);
  // axe usa sus propios relojes: con el de la pagina detenido no terminaria nunca.
  await page.clock.resume();
  await sinFaltasDeAccesibilidad(page, '.barra', '#inicio');
  // "Míralo en acción" baja a la demostracion.
  await corto.getByRole('link', { name: 'Míralo en acción' }).click();
  await expect(page).toHaveURL(/#citas$/);
  await expect(page.locator('#citas').getByRole('heading', { level: 2 })).toBeInViewport();
  expect(fallas).toEqual([]);
});

test('en pantallas anchas el cartel ensena a la agente, sin marco, con su rotulo de agente virtual y la historia de una cita; y de "Tu y tu agente" no pide nada', async ({
  page,
}, info) => {
  test.skip(!esAncho(info), 'en celular el cartel ensena "Tu y tu agente"');
  const corto = await abrirCortoDetenido(page, { quieta: true });
  const foto = corto.locator('.agente__foto');
  await expect(foto).toBeVisible();
  await expect(foto).toHaveJSProperty('complete', true);
  // Una sola foto, del ancho que le toca a esta pantalla (se ve tan alta como el cartel).
  expect(await foto.evaluate((img) => (img instanceof HTMLImageElement ? img.currentSrc : ''))).toMatch(
    /\/cartel\/agente-(900|1400|2000)\.(avif|webp)$/,
  );
  // Es una persona que ilustra a un agente que no lo es: a su lado se lee "Tu agente virtual", completo.
  const rotulo = corto.locator('.agente__rotulo span');
  await expect(rotulo).toHaveText(CORTO.cartel.agenteVirtual ?? '');
  await expect(rotulo).toHaveText(/virtual/i);
  await expect(rotulo).toBeInViewport({ ratio: 1 });
  await expect(corto.locator('.agente__rotulo b')).toHaveText(CORTO.cartel.agenteHace ?? '');
  // Su cara (la mitad derecha de su retrato, arriba) queda libre: ni el titulo, ni la frase, ni los botones, ni sus
  // propios datos la tocan. Y sus datos tampoco se enciman con el texto del cartel.
  const retrato = await caja(foto);
  const lado = retrato.derecha - retrato.izquierda;
  const cara = {
    izquierda: retrato.izquierda + lado * 0.5,
    arriba: retrato.arriba + lado * 0.08,
    derecha: retrato.izquierda + lado * 0.82,
    abajo: retrato.arriba + lado * 0.45,
  };
  /**
   * @param {{ izquierda: number, arriba: number, derecha: number, abajo: number }} una
   * @param {{ izquierda: number, arriba: number, derecha: number, abajo: number }} otra
   */
  const seTocan = (una, otra) =>
    una.izquierda < otra.derecha && otra.izquierda < una.derecha && una.arriba < otra.abajo && otra.arriba < una.abajo;
  const datos = await caja(corto.locator('.agente__datos'));
  expect(seTocan(datos, cara), 'sus datos tapan su cara').toBe(false);
  for (const pieza of [
    corto.getByRole('heading', { level: 1 }),
    corto.locator('.cartel__frase'),
    corto.getByRole('link', { name: 'Empieza ahora' }),
    corto.getByRole('link', { name: 'Míralo en acción' }),
  ]) {
    const suya = await caja(pieza);
    expect(seTocan(suya, cara), 'el texto del cartel tapa su cara').toBe(false);
    expect(seTocan(suya, datos), 'sus datos se enciman con el texto del cartel').toBe(false);
  }
  // Y queda debajo de la barra: su cabeza no se mete bajo los enlaces de arriba.
  expect(cara.arriba).toBeGreaterThanOrEqual((await caja(page.locator('[data-barra]'))).abajo - 4);
  // Junto a ella, la historia de una cita en cuatro pasos, de arriba abajo: le escriben, contesta, cobra el anticipo
  // y agenda. Cada paso se lee completo y ninguno toca su cara.
  const [primero] = CORTO.oficios;
  const pasos = corto.locator('.historia > li');
  await expect(pasos).toHaveCount(4);
  await expect(pasos.nth(0)).toContainText(primero?.cartel.charla.quien ?? '');
  await expect(pasos.nth(0)).toContainText(primero?.cartel.charla.entra ?? '');
  await expect(pasos.nth(1)).toContainText(primero?.cartel.charla.responde ?? '');
  await expect(pasos.nth(2)).toHaveText(`${CORTO.pagoAprobado} ${primero?.trato.pago}`);
  await expect(pasos.nth(3)).toContainText(primero?.cartel.cuando ?? '');
  await expect(pasos.nth(3).getByRole('img', { name: 'Garantizada: anticipo pagado' })).toBeVisible();
  let antes = 0;
  for (const paso of await pasos.all()) {
    await expect(paso).toBeInViewport({ ratio: 1 });
    const suya = await caja(paso);
    expect(suya.arriba, 'los pasos van de arriba abajo').toBeGreaterThanOrEqual(antes);
    expect(seTocan(suya, cara), 'un paso de la historia tapa su cara').toBe(false);
    antes = suya.abajo;
  }
  // Bajo los botones, con que trabaja: tres nombres en texto, sin logotipos, a la vista y sin encimarse con nada.
  const confia = corto.locator('.confia');
  await expect(confia).toBeInViewport({ ratio: 1 });
  await expect(confia.locator('span')).toHaveText(CORTO.cartel.herramientas);
  expect(await confia.locator('img, svg').count()).toBe(0);
  const suLinea = await caja(confia);
  expect(suLinea.arriba).toBeGreaterThanOrEqual((await caja(corto.locator('.cartel__acciones'))).abajo);
  expect(seTocan(suLinea, datos), 'la linea de confianza se encima con la historia').toBe(false);
  expect(seTocan(suLinea, await caja(corto.locator('[data-corto-ver]'))), 'se encima con "Ver el video"').toBe(false);
  // Ahi "Tu y tu agente" no existe: no se pinta y sus fotos no viajan.
  await expect(corto.locator('.duo')).toBeHidden();
  await page.waitForLoadState('load');
  const retratos = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((recurso) => recurso.name)
      .filter((nombre) => /-tu-\d+\.(avif|webp)$/.test(nombre)),
  );
  expect(retratos).toEqual([]);
  expect(await desborde(page)).toBeLessThanOrEqual(0);
});

test('donde no cabe la historia entre el texto y la agente queda solo su rotulo, sin tocar su cara ni el texto', async ({
  page,
}, info) => {
  test.skip(!esAncho(info), 'en celular el cartel ensena "Tu y tu agente"');
  // Ancha (ahi corre el corto), pero casi cuadrada: no hay hueco para la columna de la historia.
  await page.setViewportSize({ width: 1000, height: 720 });
  const corto = await abrirCortoDetenido(page, { quieta: true });
  await expect(corto.locator('.agente__foto')).toBeVisible();
  const rotulo = corto.locator('.agente__rotulo span');
  await expect(rotulo).toHaveText(CORTO.cartel.agenteVirtual ?? '');
  await expect(rotulo).toBeInViewport({ ratio: 1 });
  await expect(corto.locator('.historia > li').first()).toBeHidden();
  await expect(corto.locator('.agente__datos .cita')).toBeHidden();
  // La linea de con que trabaja solo va donde el cartel tiene sus tres columnas: aqui se guarda.
  await expect(corto.locator('.confia')).toBeHidden();
  const suCaja = await caja(rotulo);
  for (const pieza of [
    corto.getByRole('heading', { level: 1 }),
    corto.locator('.cartel__frase'),
    corto.locator('.cartel__acciones'),
  ]) {
    const suya = await caja(pieza);
    const seTocan =
      suya.izquierda < suCaja.derecha &&
      suCaja.izquierda < suya.derecha &&
      suya.arriba < suCaja.abajo &&
      suCaja.arriba < suya.abajo;
    expect(seTocan, 'el rotulo de la agente se encima con el texto del cartel').toBe(false);
  }
  expect(await desborde(page)).toBeLessThanOrEqual(0);
});

// ---------------------------------------------------------------------------------------------------------------
// "Tu y tu agente": el cartel en celular y en tableta de pie, con un oficio al azar en cada visita.
// ---------------------------------------------------------------------------------------------------------------

for (const [lugar, oficio] of CORTO.oficios.entries()) {
  test(`en celular, cuando al azar le toca ${oficio.nombre}, sale completo: su foto, su negocio, la respuesta del agente, el pago y la cita`, async ({
    page,
  }, info) => {
    test.skip(esAncho(info), 'en pantallas anchas el cartel ensena las tres fotos de "su tiempo"');
    const fallas = vigilar(page);
    await queLeToque(page, lugar);
    const corto = await abrirCortoDetenido(page);
    const pagina = page.locator('html');
    await expect(pagina).toHaveAttribute('data-oficio', oficio.clave);
    // Una sola escena a la vista (y una sola para los lectores de pantalla): la suya.
    const aLaVista = corto.locator('.duo__escena').filter({ visible: true });
    await expect(aLaVista).toHaveCount(1);
    const escena = corto.getByRole('figure', { name: CORTO.cartel.ejemplo ?? '' });
    await expect(escena).toHaveAttribute('data-duo', oficio.clave);
    // Su foto: llego, es la suya y dice lo que se ve.
    const foto = escena.getByRole('img', { name: oficio.cartel.tu.alt });
    await expect(foto).toBeVisible();
    await expect(foto).toHaveJSProperty('complete', true);
    const pedida = await foto.evaluate((img) => {
      const { currentSrc, naturalWidth } = /** @type {HTMLImageElement} */ (img);
      return { currentSrc, naturalWidth };
    });
    expect(pedida.currentSrc).toContain(`${oficio.cartel.tu.foto}-`);
    expect(pedida.naturalWidth).toBeGreaterThan(1);
    // Los dos rotulos, completos y a la vista.
    const deElla = escena.locator('.duo__tu .duo__rotulo');
    await expect(deElla).toHaveText(`${CORTO.cartel.tu} ${CORTO.cartel.enLoTuyo}`);
    await expect(deElla).toBeInViewport({ ratio: 1 });
    const delAgente = escena.locator('.duo__agente');
    await expect(delAgente).toHaveText(`${CORTO.cartel.tuAgente} ${CORTO.cartel.agenteHace}`);
    await expect(delAgente).toBeInViewport({ ratio: 1 });
    // El celular: de quien es, lo que le escriben, lo que contesta el agente, el pago y la cita con su sello.
    const { charla } = oficio.cartel;
    const celular = escena.locator('.cel');
    await expect(celular.locator('.cel__negocio')).toHaveText(`${charla.negocio} ${CORTO.cartel.whatsapp}`);
    await expect(celular.locator('.cel__inicial')).toHaveText(charla.iniciales);
    await expect(celular.locator('.globo').first()).toHaveText(`${CORTO.cartel.teEscriben} ${charla.entra}`);
    const respuesta = celular.locator('.globo--agente');
    await expect(respuesta).toHaveText(`${CORTO.cartel.contesta} ${charla.responde}`);
    await expect(respuesta).toBeInViewport({ ratio: 1 });
    const pago = celular.locator('.pago');
    await expect(pago).toHaveText(`${CORTO.pagoAprobado} ${charla.anticipo}`);
    await expect(pago).toBeInViewport({ ratio: 1 });
    const cita = celular.locator('.cita');
    await expect(cita).toContainText(oficio.cartel.cuando);
    await expect(cita).toContainText(oficio.cartel.quien);
    await expect(cita.getByRole('img', { name: 'Garantizada: anticipo pagado' })).toBeVisible();
    // Y la cita se ve entera en la primera pantalla, con su sello: es la prueba de lo que vende la pagina. (Va
    // girada: su caja se compara con la pantalla, que es mas exacto que la cuenta del navegador.)
    const alto = page.viewportSize()?.height ?? 0;
    for (const pieza of [cita, cita.locator('.sello')]) {
      const suCaja = await caja(pieza);
      expect(suCaja.arriba).toBeGreaterThanOrEqual(0);
      expect(suCaja.abajo, 'la cita o su sello se cortan').toBeLessThanOrEqual(alto - 4);
    }
    // Ya no van: ni botones para cambiar de oficio, ni el contador en ceros, ni la agente de las pantallas anchas. Y
    // nada de la imagen es una parada del teclado.
    await expect(corto.locator('button').filter({ visible: true })).toHaveCount(0);
    await expect(corto.getByText('sin contestar').filter({ visible: true })).toHaveCount(0);
    await expect(corto.locator('.agente')).toBeHidden();
    expect(await corto.locator('.duo').locator('a, button, input, video, [tabindex]').count()).toBe(0);
    // Es uno por visita: pasa el tiempo y no cambia solo.
    await page.clock.runFor(20_000);
    await expect(pagina).toHaveAttribute('data-oficio', oficio.clave);
    await expect(aLaVista).toHaveAttribute('data-duo', oficio.clave);
    expect(await desborde(page)).toBeLessThanOrEqual(0);
    await page.clock.resume();
    await sinFaltasDeAccesibilidad(page, '#inicio');
    expect(fallas).toEqual([]);
  });
}

test('en celular el oficio ya esta elegido antes del primer pintado: nunca se pinta uno para cambiarlo por otro', async ({
  page,
}, info) => {
  test.skip(esAncho(info), 'en pantallas anchas el cartel ensena las tres fotos de "su tiempo"');
  // Le toca el ultimo: si la pagina pintara primero la escena que trae escrita (la primera), aqui se veria.
  const ultimo = CORTO.oficios.length - 1;
  const elegido = CORTO.oficios[ultimo]?.clave ?? '';
  await queLeToque(page, ultimo);
  // Justo antes de cada cuadro que el navegador pinta se anota que oficio dice <html> y que escenas estan a la vista.
  await page.addInitScript(() => {
    /** @type {{ oficio: string | undefined, aLaVista: string[] }[]} */
    const cuadros = [];
    Reflect.set(window, 'cuadrosDelInicio', cuadros);
    const anotar = () => {
      cuadros.push({
        oficio: document.documentElement.dataset.oficio,
        aLaVista: [...document.querySelectorAll('[data-duo]')]
          .filter((escena) => escena.getClientRects().length > 0)
          .map((escena) => escena.getAttribute('data-duo') ?? ''),
      });
      if (cuadros.length < 400) requestAnimationFrame(anotar);
    };
    requestAnimationFrame(anotar);
  });
  // Sin el reloj de Playwright: aqui importan los cuadros de verdad del navegador.
  await page.goto('./');
  const corto = page.locator('[data-corto]');
  await expect(corto).toHaveAttribute('data-viva', '');
  await page.waitForLoadState('load');
  await expect(corto.locator('.duo__escena').filter({ visible: true })).toHaveAttribute('data-duo', elegido);
  /** @type {{ oficio: string | undefined, aLaVista: string[] }[]} */
  const cuadros = await page.evaluate(() => Reflect.get(window, 'cuadrosDelInicio'));
  expect(cuadros.length).toBeGreaterThan(0);
  for (const cuadro of cuadros) {
    // Desde el primer cuadro <html> ya dice el oficio, y a la vista no hay nada (la escena todavia no llega) o
    // esta la elegida: nunca otra.
    expect(cuadro.oficio).toBe(elegido);
    expect([[], [elegido]]).toContainEqual(cuadro.aLaVista);
  }
  expect(cuadros.at(-1)?.aLaVista).toEqual([elegido]);
  // Las demas no se pintan: tampoco las leen los lectores de pantalla.
  for (const otro of CORTO.oficios.slice(0, ultimo)) {
    await expect(corto.locator(`.duo__escena[data-duo="${otro.clave}"]`)).toHaveCSS('display', 'none');
  }
  await expect(corto.getByRole('figure')).toHaveCount(1);
});

test('en celular las piezas de la pagina se piden cuando el cartel ya esta pintado, y aun asi todo queda vivo', async ({
  page,
}, info) => {
  test.skip(esAncho(info), 'en pantallas anchas las piezas llegan de entrada: una de ellas mueve el corto');
  const fallas = vigilar(page);
  // Sin el reloj de Playwright: aqui importan los tiempos de verdad del navegador.
  await page.goto('./');
  const corto = page.locator('[data-corto]');
  await expect(corto).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-calculadora]')).toHaveAttribute('data-viva', '');
  const tiempos = await page.evaluate(() => ({
    pintado: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
    retrato: performance.getEntriesByType('element')[0]?.startTime ?? 0,
    piezas: performance
      .getEntriesByType('resource')
      .filter((recurso) => /\/js\/[^/]+\.js$/.test(recurso.name) && !/\/(arranque|pagina)\.js$/.test(recurso.name))
      .map((recurso) => recurso.startTime),
    adelantadas: [...document.querySelectorAll('link[rel="modulepreload"]')].filter(
      (enlace) => matchMedia(enlace.getAttribute('media') ?? 'all').matches,
    ).length,
  }));
  // Ninguna pieza se adelanta aqui, y todas se pidieron despues de lo que se ve: del primer pintado y, donde el
  // navegador avisa de el, del retrato del cartel.
  expect(tiempos.adelantadas).toBe(0);
  expect(tiempos.piezas.length).toBeGreaterThanOrEqual(8);
  for (const pedida of tiempos.piezas) {
    if (tiempos.pintado > 0) expect(pedida).toBeGreaterThanOrEqual(tiempos.pintado);
    if (tiempos.retrato > 0) expect(pedida).toBeGreaterThanOrEqual(tiempos.retrato);
  }
  expect(fallas).toEqual([]);
});

test.describe('"Tu y tu agente" en cada tamano', () => {
  // Del celular mas chico a la tableta de pie, con el oficio que mas alto ocupa (el de nombre mas largo) en los mas
  // bajitos. Se prueba con los dos motores de celular: Chrome y Safari.
  const TAMANOS = /** @type {[number, number, string][]} */ ([
    [320, 568, 'medico'],
    [360, 640, 'medico'],
    // El iPhone mas comun con las barras de Safari a la vista.
    [390, 664, 'medico'],
    [390, 844, 'unas'],
    [412, 915, 'dentista'],
    [430, 932, 'medico'],
    [768, 1024, 'dentista'],
  ]);

  for (const [ancho, alto, clave] of TAMANOS) {
    test(`a ${ancho} por ${alto} se ve completo y en su lugar: nada se sale, se corta mal ni se encima`, async ({
      page,
    }, info) => {
      test.skip(!['celular', 'iphone'].includes(info.project.name), 'la previa lleva una cinta arriba que quita alto');
      await queLeToque(
        page,
        CORTO.oficios.findIndex((oficio) => oficio.clave === clave),
      );
      await page.setViewportSize({ width: ancho, height: alto });
      const corto = await abrirCortoDetenido(page);
      const escena = corto.locator('.duo__escena').filter({ visible: true });
      await expect(escena).toHaveAttribute('data-duo', clave);
      await expect(escena.locator('.duo__foto')).toHaveJSProperty('complete', true);
      await page.evaluate(() => document.fonts.ready);
      // El renglon chico va en dos renglones y se parte donde se lee bien: arriba los tres oficios y abajo lo que
      // viene, entero. Nunca deja una "y" colgada ni una palabra sola.
      const renglones = await corto.locator('.cartel .sobre').evaluate((sobre) => {
        const texto = sobre.firstChild;
        if (!(texto instanceof Text)) return [];
        /** @type {Map<number, string[]>} */
        const porAltura = new Map();
        for (const palabra of texto.data.matchAll(/\S+/g)) {
          const rango = document.createRange();
          rango.setStart(texto, palabra.index);
          rango.setEnd(texto, palabra.index + palabra[0].length);
          const altura = Math.round(rango.getBoundingClientRect().top);
          porAltura.set(altura, [...(porAltura.get(altura) ?? []), palabra[0]]);
        }
        return [...porAltura.values()].map((palabras) => palabras.join(' '));
      });
      expect(renglones).toEqual(['Uñas, dentistas, médicos', 'y pronto más oficios y profesiones']);
      // El cartel mide justo la pantalla y nada se sale a lo ancho.
      expect(await desborde(page)).toBeLessThanOrEqual(0);
      expect(Math.abs((await caja(corto)).abajo - alto)).toBeLessThanOrEqual(1);
      // El titulo, la frase y los dos botones, completos y a la vista.
      const empieza = corto.getByRole('link', { name: 'Empieza ahora' });
      for (const pieza of [
        corto.getByRole('heading', { level: 1 }),
        corto.locator('.cartel__frase'),
        empieza,
        corto.getByRole('link', { name: 'Míralo en acción' }),
      ]) {
        await expect(pieza).toBeInViewport({ ratio: 1 });
      }
      // Los dos rotulos se leen completos, y la respuesta del agente y el pago se alcanzan a ver, con aire abajo.
      // (Van girados: su caja se compara con la pantalla, que es mas exacto que la cuenta del navegador.)
      const delAgente = escena.locator('.duo__agente');
      for (const pieza of [
        escena.locator('.duo__tu .duo__rotulo'),
        delAgente,
        escena.locator('.globo--agente'),
        escena.locator('.pago'),
      ]) {
        await expect(pieza).toBeVisible();
        const suCaja = await caja(pieza);
        expect(suCaja.arriba).toBeGreaterThanOrEqual(0);
        expect(suCaja.izquierda).toBeGreaterThanOrEqual(0);
        expect(suCaja.derecha).toBeLessThanOrEqual(ancho);
        expect(suCaja.abajo).toBeLessThanOrEqual(alto - 4);
      }
      // Cada cosa en su lugar: la imagen debajo de los botones, el celular encimado sobre la tarjeta y saliendose
      // por abajo, y lo que hace el agente debajo de la tarjeta y a un lado del celular, sin tocarlos.
      const boton = await caja(empieza);
      const tarjeta = await caja(escena.locator('.duo__tu'));
      const celular = await caja(escena.locator('.cel__marco'));
      const rotulo = await caja(delAgente);
      expect(tarjeta.arriba).toBeGreaterThanOrEqual(boton.abajo + 6);
      expect(celular.arriba).toBeGreaterThanOrEqual(boton.abajo + 6);
      expect(celular.derecha).toBeGreaterThan(tarjeta.izquierda + 8);
      expect((await caja(escena.locator('.cel__pantalla'))).abajo).toBeGreaterThan(alto);
      expect(rotulo.arriba).toBeGreaterThanOrEqual(tarjeta.abajo);
      expect(rotulo.izquierda).toBeGreaterThanOrEqual(celular.derecha);
      expect(rotulo.derecha).toBeLessThanOrEqual(ancho - 16);
      // La cita cabe en su hoja: el texto no se mete debajo del sello.
      const hoja = escena.locator('.cita');
      const sello = await caja(hoja.locator('.sello'));
      for (const renglon of [hoja.locator('small'), hoja.locator('span')]) {
        expect((await caja(renglon)).derecha).toBeLessThanOrEqual(sello.izquierda + 4);
      }
      // Y en un celular de 640 de alto o mas la cita se ve entera, con su sello y con aire abajo: el celular
      // dibujado sube lo que haga falta. (En el mas bajito y en la tableta de pie se asoma, como antes.)
      if (ancho < 600 && alto >= 640) {
        expect((await caja(hoja)).abajo, 'la cita se corta').toBeLessThanOrEqual(alto - 4);
        expect(sello.abajo, 'el sello se corta').toBeLessThanOrEqual(alto - 4);
      }
    });
  }
});

test('en celular y en tableta de pie el corto no existe: solo el cartel, sin controles y sin pedir un solo video', async ({
  page,
}, info) => {
  test.skip(esAncho(info), 'en pantallas anchas el corto si corre');
  const videos = videosPedidos(page);
  // Con movimiento: aun asi, aqui no corre.
  const corto = await abrirCortoDetenido(page);
  await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
  const titulo = corto.getByRole('heading', { level: 1 });
  await expect(titulo).toBeInViewport({ ratio: 1 });
  expect(await encimaDe(titulo)).toBe('cartel');
  // Ni las capas del corto, ni sus controles, ni el boton para verlo: el inicio no trae un solo boton.
  await expect(corto.locator('[data-corto-cine]')).toBeHidden();
  await expect(corto.locator('[data-corto-control]')).toBeHidden();
  await expect(corto.locator('[data-corto-ver]')).toBeHidden();
  await expect(corto.locator('button').filter({ visible: true })).toHaveCount(0);
  // Pasa de sobra lo que dura el corto: nada se mueve y ningun video se pidio ni tiene de donde pedirse.
  await page.waitForLoadState('load');
  await page.clock.runFor(20_000);
  await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
  expect(videos).toEqual([]);
  for (const video of await corto.locator('video').all()) await expect(video).not.toHaveAttribute('src', /.*/);
  // Tampoco viajan las fotos del corto ni la de la agente de las pantallas anchas: aqui no se pintan.
  const fotos = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((recurso) => recurso.name)
      .filter((nombre) => /(-(escena|trabajo)-\d+|\/agente-\d+)\.(avif|webp)$/.test(nombre)),
  );
  expect(fotos).toEqual([]);
});

test('la barra va transparente sobre el inicio y toma su fondo en cuanto la pagina baja', async ({ page }) => {
  await abrirCortoDetenido(page, { quieta: true });
  const barra = page.locator('[data-barra]');
  await expect(barra).not.toHaveAttribute('data-fondo', /.*/);
  await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight / 3)));
  await expect(barra).toHaveAttribute('data-fondo', '');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(barra).not.toHaveAttribute('data-fondo', /.*/);
});

test('en un celular bajito el inicio mide mas que la pantalla, y aun asi la barra arranca transparente', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'celular', 'basta con un celular');
  await page.setViewportSize({ width: 375, height: 548 });
  const corto = await abrirCortoDetenido(page);
  // No cabe: el cartel crece hacia abajo para que el celular dibujado llegue hasta su pago.
  expect((await caja(corto)).abajo).toBeGreaterThan(548);
  const barra = page.locator('[data-barra]');
  await expect(barra).not.toHaveAttribute('data-fondo', /.*/);
  await page.evaluate(() => window.scrollBy(0, 200));
  await expect(barra).toHaveAttribute('data-fondo', '');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(barra).not.toHaveAttribute('data-fondo', /.*/);
  expect(await desborde(page)).toBeLessThanOrEqual(0);
});

test('si el codigo del corto no llega, queda el cartel y la pagina sigue', async ({ page }) => {
  await page.route('**/js/corto-vista.js', (ruta) => ruta.abort());
  await page.goto('./');
  await expect(page.locator('html')).not.toHaveClass(/con-corto/);
  const corto = page.locator('[data-corto]');
  const titulo = corto.getByRole('heading', { level: 1 });
  await expect(titulo).toHaveText('Despreocúpate');
  expect(await encimaDe(titulo)).toBe('cartel');
  await expect(corto.getByRole('link', { name: 'Empieza ahora' })).toBeVisible();
  await expect(corto.locator('[data-corto-cine]')).toBeHidden();
  // Del corto no queda ni un boton, y el cartel no trae ninguno propio.
  await expect(corto.locator('[data-corto-control]')).toBeHidden();
  await expect(corto.locator('[data-corto-ver]')).toBeHidden();
  await expect(corto.locator('button').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('se ve el cartel completo, con su imagen y su cita, y ningun boton que no sirva', async ({ page }, info) => {
    await page.goto('./');
    const corto = page.locator('[data-corto]');
    await expect(corto.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
    await expect(corto.getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 });
    await expect(corto.locator('.cartel__frase')).toBeVisible();
    await expect(corto.locator('.cartel__frase')).toHaveText(CORTO.cartel.frase ?? '');
    await expect(corto.getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
    await expect(corto.getByRole('link', { name: 'Míralo en acción' })).toHaveAttribute('href', '#citas');
    const [primero] = CORTO.oficios;
    if (esAncho(info)) {
      await expect(corto.locator('.agente__foto')).toBeVisible();
    } else if (primero) {
      // Sin nadie que elija, "Tu y tu agente" ensena el primer oficio, completo; los demas no se pintan.
      const escena = corto.locator('.duo__escena').filter({ visible: true });
      await expect(escena).toHaveCount(1);
      await expect(escena).toHaveAttribute('data-duo', primero.clave);
      const foto = escena.locator('.duo__foto');
      await expect(foto).toBeVisible();
      await expect(foto).toHaveAttribute('alt', primero.cartel.tu.alt);
      await expect(foto).toHaveJSProperty('complete', true);
      expect(await foto.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(1);
      const { charla } = primero.cartel;
      await expect(escena.locator('.cel__negocio')).toContainText(charla.negocio);
      await expect(escena.locator('.globo--agente')).toContainText(charla.responde);
      await expect(escena.locator('.pago')).toHaveText(`${CORTO.pagoAprobado} ${charla.anticipo}`);
      await expect(escena.locator('.duo__agente')).toContainText(CORTO.cartel.agenteHace ?? '');
    }
    await expect(corto.locator('.cita').filter({ visible: true }).first()).toContainText('Ana · Gelish');
    // Ni el corto ni sus controles ni ningun otro boton: sin JavaScript no harian nada.
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    await expect(corto.locator('button').filter({ visible: true })).toHaveCount(0);
    await expect(corto.locator('video').filter({ visible: true })).toHaveCount(0);
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// El corto: solo en pantallas anchas.
// ---------------------------------------------------------------------------------------------------------------

test.describe('el corto, en pantallas anchas', () => {
  // Con el corto corriendo el navegador de pruebas (que dibuja sin tarjeta de video) va despacio: se le da su tiempo.
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(({ page: _ }, info) => {
    test.skip(!esAncho(info), 'el corto solo corre en pantallas anchas');
  });

  test('al abrir corre solo: pasa por sus momentos en orden, cada uno con su letrero, y termina en el cartel', async ({
    page,
  }) => {
    const fallas = vigilar(page);
    const corto = await abrirCortoDetenido(page);
    const titulo = corto.getByRole('heading', { level: 1 });
    // Mientras corre, sus capas tapan el cartel, que ya esta debajo.
    await expect(titulo).toHaveText('Despreocúpate');
    expect(await encimaDe(titulo)).toBe('corto');
    /** @type {(string | null)[]} */
    const vistos = [];
    for (const [lugar, momento] of CORTO.guion.entries()) {
      await hastaElCuadro(page, corto, momento.clave);
      vistos.push(await corto.getAttribute('data-cuadro'));
      const letrero = corto.locator('.letrero[data-activo]');
      // El del cierre, que es el ultimo, lleva debajo su renglon chico.
      const dice = lugar === CORTO.guion.length - 1 ? `${momento.letrero}${BAJA}` : momento.letrero;
      if (momento.letrero) await expect(letrero).toHaveText(dice);
      else await expect(letrero).toHaveCount(0);
      expect(await desborde(page)).toBeLessThanOrEqual(0);
    }
    expect(vistos).toEqual(MOMENTOS);
    await hastaElCuadro(page, corto, CARTEL);
    // Las capas del corto se funden y queda el cartel, ya sin controles.
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    await expect(corto.getByRole('button', { name: 'Saltar' })).toBeHidden();
    await expect(corto.getByRole('button', { name: 'Pausar el video' })).toBeHidden();
    await expect(corto.getByRole('button', { name: 'Ver de nuevo' })).toBeVisible();
    expect(await encimaDe(titulo)).toBe('cartel');
    expect(fallas).toEqual([]);
  });

  for (const [lugar, oficio] of CORTO.oficios.entries()) {
    test(`cuando al azar le toca ${oficio.nombre}, el corto cuenta solo ese oficio, a pantalla completa, y pide una sola foto y un solo video`, async ({
      page,
    }) => {
      // El corto entero, con sus fotos y su video: se le da su tiempo.
      test.slow();
      const fallas = vigilar(page);
      const fotos = pedidos(page, /-escena-\d+\.(avif|webp)$/);
      const videos = videosPedidos(page);
      await queLeToque(page, lugar);
      const corto = await abrirCortoDetenido(page);
      await expect(page.locator('html')).toHaveAttribute('data-oficio', oficio.clave);
      await expect(corto.locator('[data-corto-cine]')).toHaveAttribute('data-oficio', oficio.clave);
      // Una sola escena a la vista, la suya, y llena la pantalla: nada de franjas.
      const aLaVista = corto.locator('[data-escena]').filter({ visible: true });
      await expect(aLaVista).toHaveCount(1);
      await expect(aLaVista).toHaveAttribute('data-escena', oficio.clave);
      const medida = page.viewportSize() ?? { width: 0, height: 0 };
      const suCaja = await caja(aLaVista);
      expect(suCaja.izquierda).toBeLessThanOrEqual(0);
      expect(suCaja.arriba).toBeLessThanOrEqual(0);
      expect(suCaja.derecha).toBeGreaterThanOrEqual(medida.width);
      expect(suCaja.abajo).toBeGreaterThanOrEqual(medida.height);
      // Las de los demas oficios no se pintan.
      for (const otro of CORTO.oficios.filter((uno) => uno.clave !== oficio.clave)) {
        for (const escena of await corto.locator(`[data-escena="${otro.clave}"]`).all()) {
          await expect(escena).toHaveCSS('display', 'none');
        }
      }
      // Su foto llego, es la suya y cubre la pantalla.
      const foto = aLaVista.locator('.foto__toma').first();
      await expect(foto).toHaveJSProperty('complete', true);
      const pedida = await foto.evaluate((img) => {
        const { currentSrc, naturalWidth } = /** @type {HTMLImageElement} */ (img);
        return { currentSrc, naturalWidth };
      });
      expect(pedida.currentSrc).toContain(`/${oficio.clave}-escena-`);
      expect(pedida.naturalWidth).toBeGreaterThan(1);
      // Su video se pide un momento despues de cargar la pagina, y es el unico que llega a tener de donde pedirse.
      await page.waitForLoadState('load');
      await page.clock.runFor(600);
      const video = corto.locator('video[src]');
      await expect(video).toHaveCount(1);
      await expect(video).toHaveAttribute('src', new RegExp(`/${oficio.clave}-escena\\.mp4$`));
      // El aviso que llega es el de ese oficio, y sale encima del celular de la mesa: a la derecha del letrero.
      await hastaElCuadro(page, corto, 'vibra');
      const [llega] = oficio.llegan;
      const aviso = corto.locator('.escena__sobre--llega').filter({ visible: true }).locator('.aviso');
      await expect(aviso).toHaveCount(1);
      await expect(aviso).toContainText(llega?.quien ?? '');
      await asentado(aviso);
      const letrero = corto.locator('.letrero[data-activo]');
      await asentado(letrero);
      const suAviso = await caja(aviso);
      expect(suAviso.izquierda).toBeGreaterThanOrEqual((await caja(letrero)).derecha);
      expect(suAviso.derecha).toBeLessThanOrEqual(medida.width);
      expect(suAviso.arriba).toBeGreaterThanOrEqual((await caja(page.locator('.barra'))).abajo);
      // Y lo que hizo el agente es la conversacion de ese oficio, la unica a la vista.
      await hastaElCuadro(page, corto, 'agente');
      const trato = corto.locator('.trato').filter({ visible: true });
      await expect(trato).toHaveCount(1);
      await expect(trato.locator('.dice--agente')).toHaveText(oficio.trato.responde);
      await hastaElCuadro(page, corto, CARTEL);
      // En todo el corto se pidio una sola foto de escena, la suya, y un solo video, el suyo.
      expect([...new Set(fotos)]).toHaveLength(1);
      expect(fotos[0]).toContain(`${oficio.clave}-escena-`);
      expect([...new Set(videos)]).toHaveLength(1);
      expect(videos[0]).toContain(`/${oficio.clave}-escena.mp4`);
      expect(fallas).toEqual([]);
    });
  }

  test('ocupa justo una pantalla, con sus controles a la mano, y nada se sale a lo ancho', async ({ page }) => {
    const corto = await abrirCortoDetenido(page);
    const { abajo, alto } = await corto.evaluate((el) => ({
      abajo: el.getBoundingClientRect().bottom,
      alto: window.innerHeight,
    }));
    expect(Math.abs(abajo - alto)).toBeLessThanOrEqual(1);
    const saltar = corto.getByRole('button', { name: 'Saltar' });
    const pausa = corto.getByRole('button', { name: 'Pausar el video' });
    await expect(saltar).toBeInViewport({ ratio: 1 });
    await expect(pausa).toBeInViewport({ ratio: 1 });
    // Los dos botones miden lo que pide un dedo.
    for (const boton of [saltar, pausa]) {
      const caja = await boton.boundingBox();
      expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(caja?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect(await desborde(page)).toBeLessThanOrEqual(0);
    // axe usa sus propios relojes: con el de la pagina detenido no terminaria nunca.
    await page.clock.resume();
    await sinFaltasDeAccesibilidad(page, '.barra', '#inicio');
  });

  test('la raya de avance camina con el corto y la pantalla del celular se llena hasta su tope', async ({ page }) => {
    // Le toca uñas: en su celular se ve la foto que mando una clienta.
    await queLeToque(page, 0);
    const [oficio] = CORTO.oficios;
    const corto = await abrirCortoDetenido(page);
    const avance = () =>
      corto
        .locator('[data-corto-avance]')
        .evaluate((linea) => Number(/scaleX\(([\d.]+)\)/.exec(linea.style.transform)?.[1] ?? -1));
    await page.clock.runFor(200);
    const alPrincipio = await avance();
    expect(alPrincipio).toBeGreaterThan(0);
    await hastaElCuadro(page, corto, 'avalancha');
    expect(await avance()).toBeGreaterThan(alPrincipio);
    // UN celular, el del oficio que toco, con su contador, que sube hasta el tope de ese oficio.
    const celular = corto.locator('.pantalla').filter({ visible: true });
    await expect(celular).toHaveCount(1);
    const cuenta = celular.locator('[data-corto-cuenta]');
    expect(Number(await cuenta.textContent())).toBeLessThan(oficio?.cuenta.tope ?? 0);
    await expect(celular.locator('.aviso__mira')).toBeVisible();
    // Cabe entero entre la barra y los controles, al centro de la pantalla (ventana por ventana lo cuida la prueba
    // que sigue).
    await asentado(celular);
    const suCaja = await caja(celular);
    const medida = page.viewportSize() ?? { width: 0, height: 0 };
    expect(suCaja.arriba).toBeGreaterThanOrEqual((await caja(page.locator('.barra'))).abajo);
    expect(suCaja.abajo).toBeLessThanOrEqual((await caja(corto.locator('.control__linea'))).arriba);
    expect(Math.abs((suCaja.izquierda + suCaja.derecha) / 2 - medida.width / 2)).toBeLessThanOrEqual(2);
    await hastaElCuadro(page, corto, 'barrido');
    await expect(cuenta).toHaveText(String(oficio?.cuenta.tope));
    // Cada oficio trae su cuenta, y ninguna se repite: quien vea otro oficio vera otro numero.
    const topes = await corto
      .locator('[data-corto-cuenta]')
      .evaluateAll((cuentas) => cuentas.map((una) => una.getAttribute('data-tope')));
    expect(topes).toEqual(CORTO.oficios.map((uno) => String(uno.cuenta.tope)));
    expect(new Set(topes).size).toBe(CORTO.oficios.length);
  });

  // De la laptop del dueño a la ventana mas chica donde corre el corto, con un oficio distinto en cada una.
  const AL_CENTRO = /** @type {[number, number, string][]} */ ([
    [1536, 695, 'unas'],
    [1280, 720, 'dentista'],
    [1024, 704, 'medico'],
    [900, 480, 'unas'],
  ]);

  for (const [ancho, alto, clave] of AL_CENTRO) {
    test(`a ${ancho} por ${alto}, el celular de los mensajes sale al centro de la pantalla, grande, y cabe con aire entre la barra y los controles`, async ({
      page,
    }) => {
      // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
      test.slow();
      await queLeToque(
        page,
        CORTO.oficios.findIndex((uno) => uno.clave === clave),
      );
      await page.setViewportSize({ width: ancho, height: alto });
      const corto = await abrirCortoDetenido(page);
      await hastaElCuadro(page, corto, 'avalancha');
      const celular = corto.locator('.pantalla').filter({ visible: true });
      await expect(celular).toHaveCount(1);
      await expect(celular.locator('xpath=ancestor::*[@data-escena]')).toHaveAttribute('data-escena', clave);
      await asentado(celular);
      const suCaja = await caja(celular);
      const barra = await caja(page.locator('.barra'));
      const control = await caja(corto.locator('.control__linea'));
      // Al centro, a lo ancho. (Mientras se llena zumba a ratos, apenas: se le perdonan dos puntos.)
      expect(Math.abs((suCaja.izquierda + suCaja.derecha) / 2 - ancho / 2)).toBeLessThanOrEqual(2);
      // Entre la barra y la raya de los controles, con aire arriba y abajo, y el mismo de los dos lados.
      const aireArriba = suCaja.arriba - barra.abajo;
      const aireAbajo = control.arriba - suCaja.abajo;
      expect(aireArriba).toBeGreaterThanOrEqual(8);
      expect(aireAbajo).toBeGreaterThanOrEqual(8);
      expect(Math.abs(aireArriba - aireAbajo)).toBeLessThanOrEqual(4);
      // Grande: se lleva casi todo el alto que le queda. En una laptop, cerca de ocho decimas de la pantalla.
      const mide = suCaja.abajo - suCaja.arriba;
      expect(mide / alto).toBeGreaterThanOrEqual(alto >= 600 ? 0.77 : 0.7);
      expect(mide / alto).toBeLessThanOrEqual(0.82);
      // Es un celular (el doble de alto que de ancho) y sus avisos caben todos dentro de su pantalla.
      expect(Math.abs((suCaja.derecha - suCaja.izquierda) * 2 - mide)).toBeLessThanOrEqual(2);
      const avisos = await celular.locator('.aviso').all();
      expect(avisos.length).toBeGreaterThanOrEqual(4);
      for (const aviso of avisos) {
        const suyo = await caja(aviso);
        expect(suyo.izquierda).toBeGreaterThanOrEqual(suCaja.izquierda);
        expect(suyo.derecha).toBeLessThanOrEqual(suCaja.derecha);
        expect(suyo.abajo).toBeLessThanOrEqual(suCaja.abajo - 8);
      }
      // Lo de atras se va de foco por su cuenta: el velo del celular ya no desenfoca el fondo.
      const escena = corto.locator('[data-escenas="fria"] [data-escena]').filter({ visible: true });
      await expect(escena.locator('.foto')).toHaveCSS('filter', /^blur\(/);
      const velo = await escena
        .locator('.telefono')
        .evaluate((el) => getComputedStyle(el, '::before').getPropertyValue('backdrop-filter'));
      expect(velo).toBe('none');
      expect(await desborde(page)).toBeLessThanOrEqual(0);
    });
  }

  test('al barrido lo mueve el navegador, no el codigo cuadro por cuadro: con el reloj de la pagina detenido la raya cruza sola, destapa lo de antes sin moverlo y, al llegar la marca, lo de antes ya no esta', async ({
    page,
  }) => {
    // La cruzada corre en tiempo real: se le da su tiempo.
    test.slow();
    await queLeToque(page, 0);
    const corto = await abrirCortoDetenido(page);
    // Antes del barrido se anota donde quedo el celular de los mensajes: de ahi no se tiene que mover.
    await hastaElCuadro(page, corto, 'avalancha');
    const celular = corto.locator('.pantalla').filter({ visible: true });
    await asentado(celular);
    const suLugar = await caja(celular);
    await hastaElCuadro(page, corto, 'barrido');
    // Desde aqui el reloj de la pagina esta detenido: su codigo no corre ni un cuadro. Lo que se mueva lo mueve el
    // navegador, con las animaciones de los estilos.
    const antes = corto.locator('.corto__antes');
    const dentro = corto.locator('.corto__antes-dentro');
    const carro = corto.locator('.corto__carro');
    // Ninguna de las tres capas lleva un estilo escrito por el codigo, y cada una trae su animacion: la caja de lo de
    // antes y la raya, la misma; el contenido de la caja, la contraria. Solo animan transform (la raya, ademas, su luz).
    /** @param {import('@playwright/test').Locator} capa */
    const animaciones = (capa) =>
      capa.evaluate((el) =>
        el
          .getAnimations()
          .map((una) => {
            const cuadros = una.effect instanceof KeyframeEffect ? una.effect.getKeyframes() : [];
            const anima = [...new Set(cuadros.flatMap((cuadro) => Object.keys(cuadro)))].filter(
              (dato) => !['offset', 'computedOffset', 'easing', 'composite'].includes(dato),
            );
            const nombre = una instanceof CSSAnimation ? una.animationName : 'otra';
            return `${nombre}: ${anima.join(' ')} (${cuadros[0]?.easing}, ${una.effect?.getComputedTiming().duration} ms)`;
          })
          .sort(),
      );
    const cruza = Math.round(0.8 * (CORTO.guion.find((momento) => momento.clave === 'barrido')?.dura ?? 0));
    expect(cruza).toBeGreaterThanOrEqual(2200);
    expect(cruza).toBeLessThanOrEqual(2600);
    const suave = `cubic-bezier(0.65, 0, 0.35, 1), ${cruza} ms`;
    for (const capa of [antes, dentro, carro]) await expect(capa).not.toHaveAttribute('style', /.*/);
    expect(await animaciones(antes)).toEqual([`barre: transform (${suave})`]);
    expect(await animaciones(dentro)).toEqual([`destapa: transform (${suave})`]);
    expect(await animaciones(carro)).toEqual([`barre: transform (${suave})`, `brilla: opacity (linear, ${cruza} ms)`]);
    /**
     * Por donde va el barrido: lo que se ha corrido la caja de lo de antes, su contenido y la raya, y la luz de la raya.
     */
    const va = () =>
      corto.evaluate((seccion) => {
        /** @param {string} selector */
        const capa = (selector) => {
          const el = seccion.querySelector(selector);
          if (!el) throw new Error(`falta ${selector}`);
          return getComputedStyle(el);
        };
        /** @param {string} selector */
        const corrida = (selector) => new DOMMatrixReadOnly(capa(selector).transform).m41;
        return {
          caja: corrida('.corto__antes'),
          contenido: corrida('.corto__antes-dentro'),
          raya: corrida('.corto__carro'),
          luz: Number(capa('.corto__carro').opacity),
          ancho: innerWidth,
        };
      });
    // Dentro de lo que se mueve no hay nada pesado: ningun desenfoque de fondo a la vista (el aviso que llego ya se
    // guardo), y la foto de antes esta quieta.
    await expect(antes.locator('.escena__sobre--llega').filter({ visible: true })).toHaveCount(0, { timeout: 15_000 });
    const pesado = await antes.evaluate((caja) => {
      /** @type {string[]} */
      const hallados = [];
      for (const el of caja.querySelectorAll('*')) {
        if (!el.checkVisibility({ visibilityProperty: true })) continue;
        for (const parte of ['', '::before', '::after']) {
          const estilo = getComputedStyle(el, parte || null);
          if (parte && estilo.content === 'none') continue;
          const fondo =
            estilo.getPropertyValue('backdrop-filter') || estilo.getPropertyValue('-webkit-backdrop-filter');
          if (fondo && fondo !== 'none') hallados.push(`${el.className}${parte}: ${fondo}`);
        }
      }
      return hallados;
    });
    expect(pesado).toEqual([]);
    const fotoDeAntes = antes.locator('[data-escena]:not([hidden]) .foto__vivo');
    expect(await fotoDeAntes.evaluate((foto) => foto.getAnimations().some((una) => una.playState === 'running'))).toBe(
      false,
    );
    // La raya termina de cruzar sola, sin que el corto haya avanzado un milisegundo: lo de antes quedo destapado entero
    // (su caja ya salio de la pantalla, con la raya) y la luz de la raya se apago. El contenido de la caja recorrio
    // justo lo mismo al reves: en la pantalla, el celular de antes no se movio de su lugar, ni se arrastro, ni se
    // inclino. (Como va a media cruzada, y con la pausa, lo cuida la prueba de uso.)
    await expect
      .poll(() => antes.evaluate((el) => el.getAnimations().every((una) => una.playState === 'finished')), {
        timeout: 20_000,
      })
      .toBe(true);
    const alSalir = await va();
    expect(alSalir.caja).toBeGreaterThanOrEqual(alSalir.ancho);
    expect(Math.abs(alSalir.raya - alSalir.caja)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(alSalir.contenido + alSalir.caja)).toBeLessThanOrEqual(0.5);
    expect(alSalir.luz).toBe(0);
    const alFinal = await caja(celular);
    for (const lado of /** @type {const} */ (['izquierda', 'arriba', 'derecha', 'abajo'])) {
      // Dos puntos de holgura: al anotar su lugar, en la avalancha, el celular zumbaba a ratos.
      expect(Math.abs(alFinal[lado] - suLugar[lado])).toBeLessThanOrEqual(2);
    }
    await expect(corto).toHaveAttribute('data-cuadro', 'barrido');
    // Al llegar la marca, lo de antes y la raya ya no estan, y no les queda ninguna animacion.
    await hastaElCuadro(page, corto, 'marca');
    await expect(antes).toBeHidden();
    await expect(carro).toBeHidden();
    for (const capa of [antes, dentro, carro]) {
      expect(await capa.evaluate((el) => el.getAnimations().length)).toBe(0);
      await expect(capa).not.toHaveAttribute('style', /.*/);
    }
  });

  test('"Saltar" a media cruzada y "Ver de nuevo" dejan el barrido limpio: la raya vuelve a cruzar entera, desde su principio', async ({
    page,
  }) => {
    // Dos cruzadas en tiempo real: se le da su tiempo.
    test.slow();
    const corto = await abrirCortoDetenido(page);
    const antes = corto.locator('.corto__antes');
    /** Lo que lleva la cruzada, en milisegundos, y si ya termino. Sin animacion (fuera del barrido), null. */
    const cruzada = () =>
      antes.evaluate((el) => {
        const [una] = el.getAnimations();
        return una ? { lleva: Number(una.currentTime), estado: una.playState } : null;
      });
    await hastaElCuadro(page, corto, 'barrido');
    await expect.poll(async () => (await cruzada())?.lleva ?? 0, { timeout: 15_000 }).toBeGreaterThan(300);
    await corto.getByRole('button', { name: 'Saltar' }).click();
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    // Al verlo de nuevo arranca en su primera toma: del barrido anterior no queda nada puesto.
    await corto.getByRole('button', { name: 'Ver de nuevo' }).click();
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    expect(await cruzada()).toBeNull();
    await expect(antes).not.toHaveAttribute('style', /.*/);
    await expect(antes).toHaveCSS('transform', 'none');
    // Y cuando vuelve a tocar, la raya cruza otra vez desde su principio: el navegador avisa cuando arranca su
    // animacion (asi la prueba no depende de lo rapido que vaya la maquina).
    await antes.evaluate((el) => {
      el.addEventListener('animationstart', (aviso) => {
        const suya = aviso instanceof AnimationEvent && aviso.animationName === 'barre';
        if (aviso.target === el && suya) el.setAttribute('data-cruza-otra-vez', '');
      });
    });
    await hastaElCuadro(page, corto, 'barrido');
    await expect(antes).toHaveAttribute('data-cruza-otra-vez', '', { timeout: 15_000 });
    await expect.poll(async () => (await cruzada())?.estado, { timeout: 20_000 }).toBe('finished');
  });

  test('la marca entra dentro de su halo: el logotipo, el nombre y la frase caben enteros en el disco', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    await hastaElCuadro(page, corto, 'marca');
    const frase = corto.locator('.corto__frase');
    await expect(frase).toHaveText(CORTO.marca.frase);
    // Entran uno tras otro: se espera a que la frase, que es la ultima, este puesta.
    await expect(frase).toHaveCSS('opacity', '1', { timeout: 15_000 });
    await expect(corto.locator('.halo__disco')).toHaveCSS('opacity', '1', { timeout: 15_000 });
    // Cada esquina de lo que va dentro cae dentro del circulo.
    const fuera = await corto.evaluate((seccion) => {
      const disco = seccion.querySelector('.halo__disco')?.getBoundingClientRect();
      if (!disco) return ['sin disco'];
      const centro = { x: disco.left + disco.width / 2, y: disco.top + disco.height / 2 };
      const radio = disco.width / 2;
      /** @type {string[]} */
      const salen = [];
      for (const selector of ['.corto__logo .marca__pm', '.corto__nombre', '.corto__frase']) {
        const caja = seccion.querySelector(selector)?.getBoundingClientRect();
        if (!caja) {
          salen.push(`falta ${selector}`);
          continue;
        }
        for (const x of [caja.left, caja.right]) {
          for (const y of [caja.top, caja.bottom]) {
            if (Math.hypot(x - centro.x, y - centro.y) > radio) salen.push(selector);
          }
        }
      }
      return salen;
    });
    expect(fuera).toEqual([]);
    // Y el disco cabe en la pantalla, sin tapar los controles.
    const disco = await caja(corto.locator('.halo__disco'));
    const control = await caja(corto.locator('.control__linea'));
    expect(disco.arriba).toBeGreaterThanOrEqual(0);
    expect(disco.abajo).toBeLessThanOrEqual(control.arriba);
    expect(await desborde(page)).toBeLessThanOrEqual(0);
  });

  // De la laptop del dueño a la ventana mas chica donde corre el corto, con un oficio distinto en cada una (el de la
  // foto, que es la conversacion mas alta, tambien en la mas bajita).
  const VENTANAS = /** @type {[number, number, string][]} */ ([
    [1536, 695, 'medico'],
    [1280, 720, 'unas'],
    [1000, 640, 'dentista'],
    [900, 480, 'unas'],
  ]);

  for (const [ancho, alto, clave] of VENTANAS) {
    test(`a ${ancho} por ${alto}, lo que hizo el agente entra paso a paso (el mensaje, lo que contesto, el pago, el papel y su sello) y cabe sin tapar a quien trabaja`, async ({
      page,
    }) => {
      // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
      test.slow();
      const lugar = CORTO.oficios.findIndex((uno) => uno.clave === clave);
      const oficio = CORTO.oficios[lugar];
      if (!oficio) throw new Error(`no hay oficio "${clave}"`);
      await queLeToque(page, lugar);
      await page.setViewportSize({ width: ancho, height: alto });
      const corto = await abrirCortoDetenido(page);
      // Debajo de la marca la camara ya mira a quien trabaja: se anota donde lo deja, para compararlo despues.
      await hastaElCuadro(page, corto, 'marca');
      const calida = corto.locator('[data-escenas="calida"] [data-escena]').filter({ visible: true });
      const enLaMarca = (await enPantalla(calida, oficio.mira.persona)).izquierda;
      await hastaElCuadro(page, corto, 'agente');
      // Una sola conversacion a la vista: la de ese oficio.
      const trato = corto.locator('.trato').filter({ visible: true });
      await expect(trato).toHaveCount(1);
      const mensaje = trato.locator('.dice').first();
      const respuesta = trato.locator('.dice--agente');
      const pago = trato.locator('.pago');
      const papel = trato.locator('.hizo');
      const sello = trato.locator('.sello');
      // Sus cinco piezas entran una tras otra, en su orden: cada una espera mas que la anterior (lo dicen los estilos,
      // asi la prueba no depende de lo rapido que vaya la maquina).
      const esperas = await trato.evaluate((el) =>
        ['.dice', '.dice--agente', '.pago', '.hizo', '.sello'].map((pieza) => {
          const una = el.querySelector(pieza);
          return una ? Number.parseFloat(getComputedStyle(una).animationDelay) : -1;
        }),
      );
      for (const [cual, espera] of esperas.entries()) {
        expect(espera).toBeGreaterThan(cual > 0 ? (esperas[cual - 1] ?? 0) : 0);
      }
      for (const pieza of [mensaje, respuesta, pago, papel, sello]) {
        await expect(pieza).toHaveCSS('opacity', '1', { timeout: 20_000 });
      }
      // Y al final esta completa, con lo de ese oficio.
      await expect(mensaje).toContainText(oficio.trato.quien);
      await expect(respuesta).toHaveText(oficio.trato.responde);
      await expect(pago).toHaveText(`${CORTO.pagoAprobado} ${oficio.trato.pago}`);
      await expect(papel).toContainText(`${CORTO.cartel.tuAgente}${oficio.trato.hizo}${oficio.trato.agenda}`);
      await expect(sello).toHaveAttribute('aria-label', 'Cita garantizada: anticipo pagado');
      await expect(trato.locator('.dice__foto')).toHaveCount(oficio.trato.foto ? 1 : 0);
      await asentado(trato);
      // Donde pasa la conversacion: la palabra "WhatsApp", sola (ni un logotipo ni un icono), arriba del mensaje que
      // entro. Es un rotulo chico y discreto, con la misma letra que lo demas; en una ventana bajita se guarda.
      const canal = trato.locator('.trato__canal');
      await expect(canal).toHaveText(CORTO.canal);
      expect(CORTO.canal).toBe('WhatsApp');
      expect(await canal.evaluate((el) => el.childElementCount)).toBe(0);
      expect(await trato.evaluate((el) => el.firstElementChild?.className)).toBe('trato__canal');
      if (ancho >= 1280 && alto >= 600) {
        await expect(canal).toBeVisible();
        await expect(canal).toHaveCSS('opacity', '1');
        const suCanal = await caja(canal);
        const suMensaje = await caja(mensaje);
        expect(suCanal.arriba).toBeGreaterThanOrEqual((await caja(page.locator('.barra'))).abajo);
        expect(suCanal.abajo).toBeLessThanOrEqual(suMensaje.arriba + 6);
        expect(suCanal.izquierda).toBeGreaterThanOrEqual(suMensaje.izquierda);
        expect(suCanal.derecha).toBeLessThanOrEqual(suMensaje.derecha);
        const letras = await trato.evaluate((el) => {
          /** @param {string} selector */
          const letra = (selector) => {
            const uno = el.querySelector(selector);
            return uno ? getComputedStyle(uno) : null;
          };
          const [rotulo, texto] = [letra('.trato__canal'), letra('.dice__texto')];
          return {
            misma: rotulo?.fontFamily === texto?.fontFamily,
            chico: Number.parseFloat(rotulo?.fontSize ?? '99') < Number.parseFloat(texto?.fontSize ?? '0'),
            legible: Number.parseFloat(rotulo?.fontSize ?? '0') >= 12,
            mayusculas: rotulo?.textTransform,
            fondo: rotulo?.backgroundImage,
          };
        });
        expect(letras).toEqual({ misma: true, chico: true, legible: true, mayusculas: 'none', fondo: 'none' });
      }
      if (alto < 600) await expect(canal).toBeHidden();
      // Van de arriba abajo, sin encimarse, y ninguna se sale de la pantalla ni se mete debajo de la barra o de
      // los controles.
      const barra = await caja(page.locator('.barra'));
      const control = await caja(corto.locator('.control__linea'));
      let antes = barra.abajo;
      for (const pieza of [mensaje, respuesta, pago, papel]) {
        const suCaja = await caja(pieza);
        expect(suCaja.arriba).toBeGreaterThanOrEqual(antes);
        expect(suCaja.izquierda).toBeGreaterThanOrEqual(0);
        expect(suCaja.derecha).toBeLessThanOrEqual(ancho);
        expect(suCaja.abajo).toBeLessThanOrEqual(control.arriba);
        antes = suCaja.abajo;
      }
      // El sello cae sobre el papel sin tapar la frase ni el renglon de la agenda, que tienen ancho para leerse.
      const suSello = await caja(sello);
      expect(suSello.derecha).toBeLessThanOrEqual(ancho);
      expect(suSello.abajo).toBeLessThanOrEqual(control.arriba);
      for (const renglon of [papel.locator('.hizo__frase'), papel.locator('.hizo__agenda')]) {
        const suCaja = await caja(renglon);
        expect(suCaja.derecha - suCaja.izquierda).toBeGreaterThanOrEqual(150);
        expect(suSello.izquierda >= suCaja.derecha - 8 || suSello.arriba >= suCaja.abajo - 8).toBe(true);
      }
      // La conversacion va a la izquierda de quien trabaja: no le tapa la cara.
      await camaraQuieta(calida);
      const persona = await corto
        .locator('[data-escenas="calida"] [data-escena]')
        .filter({ visible: true })
        .evaluate((escena) => {
          const foto = escena.querySelector('.foto__vivo')?.getBoundingClientRect();
          const mira = Number(getComputedStyle(escena).getPropertyValue('--fx'));
          return foto && mira > 0 ? foto.left + mira * foto.width : -1;
        });
      expect(persona).toBeGreaterThan(0);
      expect((await caja(trato)).derecha).toBeLessThan(persona);
      // En una ventana de 16:9 o mas ancha la camara se queda donde estaba debajo de la marca. En una menos ancha la
      // foto se recorta a lo ancho, y la camara se corrio para dejarlo mas a la derecha, lejos de la conversacion.
      if (ancho * 9 >= alto * 16) expect(Math.abs(persona - enLaMarca)).toBeLessThanOrEqual(1);
      else expect(persona).toBeGreaterThan(enLaMarca + 20);
      // De donde salio la respuesta: en una ventana comoda se lee, pegado debajo de ella; en una bajita se guarda.
      const fuente = trato.locator('.trato__fuente');
      await expect(fuente).toHaveText(oficio.trato.fuente);
      if (ancho >= 1280 && alto >= 600) {
        await expect(fuente).toBeVisible();
        await expect(fuente).toHaveCSS('opacity', '1');
        const suCaja = await caja(fuente);
        expect(suCaja.arriba).toBeGreaterThanOrEqual((await caja(respuesta)).abajo - 6);
        expect(suCaja.abajo).toBeLessThanOrEqual((await caja(pago)).arriba + 2);
        expect(suCaja.derecha - suCaja.izquierda).toBeGreaterThanOrEqual(100);
      }
      if (alto < 600) await expect(fuente).toBeHidden();
      expect(await desborde(page)).toBeLessThanOrEqual(0);
    });

    test(`a ${ancho} por ${alto}, el cierre ensena todos los oficios en pantalla dividida, cada uno solo con su nombre, y su letrero con sus dos renglones chicos`, async ({
      page,
    }) => {
      // El corto casi entero, con sus fotos: se le da su tiempo.
      test.slow();
      const fotos = pedidos(page, /-trabajo-\d+\.(avif|webp)$/);
      await page.setViewportSize({ width: ancho, height: alto });
      const corto = await abrirCortoDetenido(page);
      // Sus fotos no se piden de entrada: llegan con tiempo, antes de que se vean.
      await page.waitForLoadState('load');
      await page.clock.runFor(1000);
      expect(fotos).toEqual([]);
      await hastaElCuadro(page, corto, 'agente');
      await expect.poll(() => new Set(fotos).size, { timeout: 15_000 }).toBe(CORTO.oficios.length);
      await hastaElCuadro(page, corto, 'todos');
      const capa = corto.locator('.todos');
      await expect(capa).toHaveCSS('opacity', '1', { timeout: 15_000 });
      const franjas = capa.locator('.franja');
      await expect(franjas).toHaveCount(CORTO.oficios.length);
      const barra = await caja(page.locator('.barra'));
      const control = await caja(corto.locator('.control__linea'));
      const letrero = corto.locator('.letrero[data-activo]');
      const cierre = CORTO.guion.at(-1);
      await expect(letrero).toHaveText(`${cierre?.letrero}${BAJA}`);
      // Debajo, sus dos renglones chicos, que entran uno tras otro: una oracion en cada uno, con lo que el dueño pidio
      // decir (a la medida, en WhatsApp, y que vienen mas oficios y profesiones).
      const renglones = letrero.locator('.letrero__baja span');
      await expect(renglones).toHaveText(CORTO.todos.baja);
      expect(CORTO.todos.baja).toHaveLength(2);
      for (const renglon of await renglones.all()) await expect(renglon).toHaveCSS('opacity', '1', { timeout: 15_000 });
      await asentado(letrero);
      const suLetrero = await caja(letrero);
      let orilla = 0;
      for (const [lugar, oficio] of CORTO.oficios.entries()) {
        const franja = franjas.nth(lugar);
        await expect(franja).toHaveAttribute('data-franja', oficio.clave);
        // Lado a lado, de arriba abajo de la pantalla, y entre todas la llenan.
        const suCaja = await caja(franja);
        expect(Math.abs(suCaja.izquierda - orilla)).toBeLessThanOrEqual(4);
        expect(suCaja.arriba).toBeLessThanOrEqual(0);
        expect(suCaja.abajo).toBeGreaterThanOrEqual(alto);
        orilla = suCaja.derecha;
        const foto = franja.locator('.foto__toma');
        await expect(foto).toHaveJSProperty('complete', true);
        expect(await foto.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(1);
        // Su nombre, y nada mas (ya no dice de que negocio es su agente): dentro de su franja, encima de los
        // controles y debajo del letrero, en un renglon.
        const nombre = franja.locator('.franja__nombre');
        await expect(nombre).toHaveText(oficio.nombre);
        await expect(nombre).toHaveCSS('opacity', '1', { timeout: 15_000 });
        await asentado(nombre);
        const suNombre = await caja(nombre);
        expect(suNombre.izquierda).toBeGreaterThanOrEqual(suCaja.izquierda);
        expect(suNombre.derecha).toBeLessThanOrEqual(suCaja.derecha);
        expect(suNombre.abajo).toBeLessThanOrEqual(control.arriba);
        expect(suNombre.arriba).toBeGreaterThanOrEqual(suLetrero.abajo + 8);
        expect(suNombre.abajo - suNombre.arriba).toBeLessThanOrEqual(26);
        await expect(franja).not.toContainText(oficio.cartel.charla.negocio);
      }
      await expect(capa.getByText(/agente de/i)).toHaveCount(0);
      expect(Math.abs(orilla - ancho)).toBeLessThanOrEqual(4);
      // El letrero, con sus renglones chicos debajo, cabe entre la barra y los nombres.
      expect(suLetrero.arriba).toBeGreaterThanOrEqual(barra.abajo);
      expect(suLetrero.izquierda).toBeGreaterThanOrEqual(0);
      expect(suLetrero.derecha).toBeLessThanOrEqual(ancho);
      // Cada oracion va en su renglon, entera (no se parte), una debajo de la otra, y ninguna se sale a lo ancho.
      let debajoDe = suLetrero.arriba + 20;
      for (const renglon of await renglones.all()) {
        const suyo = await caja(renglon);
        expect(suyo.arriba).toBeGreaterThan(debajoDe);
        expect(suyo.izquierda).toBeGreaterThanOrEqual(suLetrero.izquierda);
        expect(suyo.derecha).toBeLessThanOrEqual(ancho);
        const letra = await renglon.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
        expect(suyo.abajo - suyo.arriba).toBeLessThanOrEqual(letra * 1.6);
        debajoDe = suyo.abajo - 1;
      }
      expect(await desborde(page)).toBeLessThanOrEqual(0);
    });
  }

  // En una ventana menos ancha que 16:9 la foto se recorta a lo ancho: un iPad acostado y una ventana comun de
  // computadora, con cada oficio.
  const RECORTADAS = /** @type {[number, number][]} */ ([
    [1024, 704],
    [1280, 900],
  ]);

  for (const [lugar, oficio] of CORTO.oficios.entries()) {
    test(`en una ventana menos ancha que 16:9, la camara deja a quien trabaja a la derecha y la conversacion del agente de ${oficio.nombre} no le tapa las manos ni la cara`, async ({
      page,
    }) => {
      // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
      test.slow();
      await queLeToque(page, lugar);
      const [primera = [1024, 704]] = RECORTADAS;
      await page.setViewportSize({ width: primera[0], height: primera[1] });
      const corto = await abrirCortoDetenido(page);
      await hastaElCuadro(page, corto, 'agente');
      const escena = corto.locator('[data-escenas="calida"] [data-escena]').filter({ visible: true });
      await expect(escena).toHaveAttribute('data-escena', oficio.clave);
      // Las piezas de la conversacion: donde pasa, el mensaje, lo que contesto (y de donde lo saco), el pago, el papel y
      // su sello.
      const trato = escena.locator('.trato');
      const piezas = trato
        .locator('.trato__canal, .dice, .trato__fuente, .pago, .hizo, .sello')
        .filter({ visible: true });
      for (const pieza of await piezas.all()) await expect(pieza).toHaveCSS('opacity', '1', { timeout: 20_000 });
      for (const [ancho, alto] of RECORTADAS) {
        const dice = `a ${ancho} por ${alto}`;
        await page.setViewportSize({ width: ancho, height: alto });
        await camaraQuieta(escena);
        await asentado(trato);
        // La camara lo dejo a la derecha: su punto cae por ahi del 70 % de lo ancho.
        const persona = (await enPantalla(escena, oficio.mira.persona)).izquierda;
        expect(persona / ancho, dice).toBeGreaterThan(0.68);
        expect(persona / ancho, dice).toBeLessThan(0.72);
        // Y la conversacion entera queda a su izquierda, sobre el fondo: ninguna pieza llega a sus manos ni a su cara.
        const manos = (await enPantalla(escena, oficio.mira.manos)).izquierda;
        expect(await piezas.count(), dice).toBeGreaterThanOrEqual(5);
        for (const pieza of await piezas.all()) {
          expect((await caja(pieza)).derecha + 16, dice).toBeLessThan(Math.min(manos, persona));
        }
        expect(await desborde(page), dice).toBeLessThanOrEqual(0);
      }
    });
  }

  // De una ventana cuadrada a una mas ancha que la pagina, pasando por la laptop del dueño y la pantalla mas comun.
  const AL_VIBRAR = /** @type {[number, number][]} */ ([
    [900, 900],
    [1024, 768],
    [1536, 695],
    [1920, 1080],
    [2560, 1440],
  ]);

  for (const [lugar, oficio] of CORTO.oficios.entries()) {
    test(`mientras vibra el celular de ${oficio.nombre}, el letrero no se encima con el ni con el aviso que llega, de una ventana cuadrada a una muy ancha`, async ({
      page,
    }) => {
      // Con el corto corriendo el navegador de pruebas va despacio, y aqui la ventana llega a ser muy grande.
      test.slow();
      await queLeToque(page, lugar);
      const [primera = [900, 900]] = AL_VIBRAR;
      await page.setViewportSize({ width: primera[0], height: primera[1] });
      const corto = await abrirCortoDetenido(page);
      await hastaElCuadro(page, corto, 'vibra');
      const escena = corto.locator('[data-escenas="fria"] [data-escena]').filter({ visible: true });
      await expect(escena).toHaveAttribute('data-escena', oficio.clave);
      const letrero = corto.locator('.letrero[data-activo]');
      await expect(letrero).toHaveText(CORTO.guion.find((momento) => momento.clave === 'vibra')?.letrero ?? '');
      const aviso = escena.locator('.escena__sobre--llega .aviso');
      await expect(aviso).toHaveCSS('opacity', '1', { timeout: 20_000 });
      for (const [ancho, alto] of AL_VIBRAR) {
        const dice = `a ${ancho} por ${alto}`;
        await page.setViewportSize({ width: ancho, height: alto });
        await camaraQuieta(escena);
        await asentado(letrero);
        await asentado(aviso);
        const suLetrero = await caja(letrero);
        // El celular de la mesa, donde quedo en la pantalla con la camara ya acercada.
        const celular = await enPantalla(escena, oficio.mira.celular);
        expect(celular.derecha - celular.izquierda, dice).toBeGreaterThan(ancho / 4);
        // Entre el letrero y el celular queda aire, y entre el letrero y el aviso tambien.
        expect(aire(suLetrero, celular), dice).toBeGreaterThanOrEqual(16);
        expect(aire(suLetrero, await caja(aviso)), dice).toBeGreaterThanOrEqual(16);
        // Y el letrero cabe entero: debajo de la barra, encima de los controles y sin salirse a lo ancho.
        expect(suLetrero.arriba, dice).toBeGreaterThanOrEqual((await caja(page.locator('.barra'))).abajo);
        expect(suLetrero.abajo, dice).toBeLessThanOrEqual((await caja(corto.locator('.control__linea'))).arriba);
        expect(suLetrero.izquierda, dice).toBeGreaterThanOrEqual(0);
        expect(suLetrero.derecha, dice).toBeLessThanOrEqual(ancho);
        expect(await desborde(page), dice).toBeLessThanOrEqual(0);
      }
    });
  }

  test('si la pieza del corto tarda en llegar, a poco se ve el cartel; cuando llega, el corto corre desde su primer momento', async ({
    page,
  }) => {
    // Sin el reloj de Playwright: aqui importan los tiempos de verdad del navegador. La pieza se detiene hasta que la
    // prueba ya vio el cartel (y no un tiempo fijo): asi no depende de lo rapido que vaya la maquina.
    let soltar = () => {};
    /** @type {Promise<void>} */
    const detenida = new Promise((listo) => {
      soltar = listo;
    });
    await page.route('**/js/corto-vista.js', async (ruta) => {
      await detenida;
      await ruta.continue();
    });
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    const corto = page.locator('[data-corto]');
    const cine = corto.locator('[data-corto-cine]');
    const titulo = corto.getByRole('heading', { level: 1 });
    // Sin la pieza, las capas del corto no pintan nada: a los 700 ms se guardan solas (lo dicen los estilos)...
    const guarda = await cine.evaluate((el) => {
      const { animationName, animationDelay, animationFillMode } = getComputedStyle(el);
      return { animationName, animationDelay, animationFillMode };
    });
    expect(guarda).toEqual({ animationName: 'guarda', animationDelay: '0.7s', animationFillMode: 'forwards' });
    // ...y se ve el cartel, que ya viene escrito y ya se puede tocar.
    await expect(cine).toBeHidden();
    await expect(corto).not.toHaveAttribute('data-viva', /.*/);
    await expect(titulo).toBeInViewport({ ratio: 1 });
    expect(await encimaDe(titulo)).toBe('cartel');
    await corto.getByRole('link', { name: 'Empieza ahora' }).click({ trial: true });
    // Llega la pieza: el corto arranca como siempre, encima del cartel y desde su primer momento.
    soltar();
    await expect(corto).toHaveAttribute('data-viva', '');
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    await expect(cine).toBeVisible();
    expect(await encimaDe(titulo)).toBe('corto');
    await expect(corto.locator('.letrero[data-activo]')).toHaveText(CORTO.guion[0]?.letrero ?? '');
    await expect(corto.getByRole('button', { name: 'Saltar' })).toBeVisible();
    // Y de ahi camina solo.
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[1] ?? '', { timeout: 15_000 });
  });

  for (const [nombre, conexion, conVideo] of /** @type {[string, object, boolean][]} */ ([
    ['con ahorro de datos', { saveData: true }, false],
    ['con una conexion lenta', { effectiveType: '3g' }, true],
  ])) {
    test(`${nombre} el corto no corre solo ni pide nada suyo: queda el cartel, y "Ver el video" lo corre porque ella lo pidio`, async ({
      page,
    }) => {
      const fotos = pedidos(page, /-(escena|trabajo)-\d+\.(avif|webp)$/);
      const videos = videosPedidos(page);
      await page.addInitScript((valor) => {
        Object.defineProperty(navigator, 'connection', { configurable: true, get: () => valor });
      }, conexion);
      const corto = await abrirCortoDetenido(page);
      await expect(page.locator('html')).toHaveAttribute('data-ahorro', '');
      await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
      await expect(corto.locator('[data-corto-cine]')).toBeHidden();
      const titulo = corto.getByRole('heading', { level: 1 });
      await expect(titulo).toBeInViewport({ ratio: 1 });
      expect(await encimaDe(titulo)).toBe('cartel');
      // Pasa el tiempo y nada corre solo, ni se pide una foto ni un video del corto.
      await page.waitForLoadState('load');
      await page.clock.runFor(20_000);
      await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
      expect(fotos).toEqual([]);
      expect(videos).toEqual([]);
      // Como no lo ha visto, el boton le ofrece verlo; al pedirlo corre, con su foto.
      await corto.getByRole('button', { name: 'Ver el video' }).click();
      await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
      await expect(corto.locator('[data-corto-cine]')).toBeVisible();
      const foto = corto.locator('[data-escena]').filter({ visible: true }).locator('.foto__toma').first();
      await expect
        .poll(() => foto.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth), { timeout: 15_000 })
        .toBeGreaterThan(1);
      // El video llega solo si no pidio ahorrar datos: con ahorro, el corto corre con su foto.
      await page.clock.runFor(1000);
      if (conVideo) {
        await expect.poll(() => new Set(videos).size, { timeout: 15_000 }).toBe(1);
      } else {
        await page.clock.runFor(3000);
        expect(videos).toEqual([]);
      }
    });
  }

  test('si la pestaña se abre escondida, el corto espera a que la miren y entonces corre desde el principio', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    });
    const corto = await abrirCortoDetenido(page);
    // Pasa de sobra lo que dura el corto entero: nadie lo ha visto, asi que no ha corrido.
    await page.clock.runFor(60_000);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    await expect(corto).toHaveAttribute('data-pausada', '');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(corto).not.toHaveAttribute('data-pausada', /.*/);
    // Apenas va empezando: sigue en su primera toma, con su letrero, y de ahi camina.
    await page.clock.runFor(1000);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    await expect(corto.locator('.letrero[data-activo]')).toHaveText(CORTO.guion[0]?.letrero ?? '');
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
  });

  test('si la ventana se queda muy bajita a media pelicula, el corto termina: queda el cartel, sin controles ni boton', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
    const tamano = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.setViewportSize({ width: tamano.width, height: 440 });
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(corto.locator('[data-corto-control]')).toBeHidden();
    await expect(corto.locator('[data-corto-ver]')).toBeHidden();
    // Al volver a caber no arranca solo: queda el cartel, con su boton para verlo.
    await page.setViewportSize(tamano);
    await page.clock.runFor(2000);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(corto.getByRole('button', { name: 'Ver de nuevo' })).toBeVisible();
  });

  test('un celular que se acuesta despues de cargar sigue sin corto: ni su boton, ni sus controles, ni un solo video', async ({
    page,
  }) => {
    const videos = videosPedidos(page);
    await page.setViewportSize({ width: 430, height: 932 });
    const corto = await abrirCortoDetenido(page);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    // Acostado es ancho, pero muy bajito: ahi el corto no existe.
    await page.setViewportSize({ width: 932, height: 430 });
    await expect(corto.locator('[data-corto-ver]')).toBeHidden();
    await expect(corto.locator('[data-corto-control]')).toBeHidden();
    await page.clock.runFor(5000);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    expect(videos).toEqual([]);
  });

  test('al verlo de nuevo, el primer letrero vuelve a entrar aunque el corto se haya cortado en la primera toma', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    const letrero = corto.locator('.letrero[data-activo]');
    /** Como va la entrada del letrero (su animacion, no sus fundidos): corriendo, o ya terminada. */
    const entrada = () =>
      letrero.evaluate((el) =>
        el
          .getAnimations()
          .filter((una) => una instanceof CSSAnimation)
          .map((una) => una.playState)
          .join(' '),
      );
    await expect.poll(entrada, { timeout: 10_000 }).toBe('finished');
    await corto.getByRole('button', { name: 'Saltar' }).click();
    // Desde aqui se anota si la entrada del letrero vuelve a empezar: el navegador avisa cada vez que arranca una
    // animacion suya (no la de su cursor). Asi la prueba no depende de lo rapido que vaya la maquina.
    await letrero.evaluate((el) => {
      el.addEventListener('animationstart', (aviso) => {
        if (aviso.target === el) el.setAttribute('data-entro-otra-vez', '');
      });
    });
    await corto.getByRole('button', { name: 'Ver de nuevo' }).click();
    await expect(letrero).toHaveText(CORTO.guion[0]?.letrero ?? '');
    await expect(letrero).toHaveAttribute('data-entro-otra-vez', '', { timeout: 10_000 });
  });

  test('"Saltar" lleva directo al cartel, y el foco pasa a "Ver de nuevo"', async ({ page }) => {
    const corto = await abrirCortoDetenido(page);
    const saltar = corto.getByRole('button', { name: 'Saltar' });
    // Con el teclado: el foco esta en el boton cuando se activa (un toque no siempre deja el foco en un boton).
    await saltar.focus();
    await page.keyboard.press('Enter');
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(saltar).toBeHidden();
    const verDeNuevo = corto.getByRole('button', { name: 'Ver de nuevo' });
    await expect(verDeNuevo).toBeFocused();
    await expect(verDeNuevo).toBeInViewport({ ratio: 1 });
    // Ese foco lo puso el codigo y nadie se acerco al boton: la foto del oficio que sigue no se adelanta. La unica
    // adelantada es la del oficio de la visita, que pidio arranque.js.
    const actual = (await page.locator('html').getAttribute('data-oficio')) ?? '';
    const lugar = CORTO.oficios.findIndex((oficio) => oficio.clave === actual);
    const sigue = CORTO.oficios[(lugar + 1) % CORTO.oficios.length]?.clave ?? '';
    expect(lugar).toBeGreaterThanOrEqual(0);
    expect(await adelantadas(page)).toEqual([actual]);
    // Y el cartel ya se puede tocar, sin esperar a que el corto termine de fundirse.
    const empieza = corto.getByRole('link', { name: 'Empieza ahora' });
    await expect(empieza).toBeVisible();
    await empieza.click({ trial: true });
    // El foco que llega por el teclado si cuenta como acercarse: sale del boton, regresa, y la foto del que sigue se
    // va pidiendo.
    await page.keyboard.press('Shift+Tab');
    await expect(verDeNuevo).not.toBeFocused();
    expect(await adelantadas(page)).toEqual([actual]);
    await page.keyboard.press('Tab');
    await expect(verDeNuevo).toBeFocused();
    expect(await adelantadas(page)).toEqual([actual, sigue]);
    // Con el reloj andando, el cartel se queda: el corto no vuelve solo.
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
  });

  test('la pausa detiene el reloj y lo que se mueve, y el mismo boton lo reanuda', async ({ page }) => {
    const corto = await abrirCortoDetenido(page);
    const pausa = corto.getByRole('button', { name: 'Pausar el video' });
    await expect(pausa).toHaveAttribute('aria-pressed', 'false');
    await pausa.click();
    await expect(pausa).toHaveAttribute('aria-pressed', 'true');
    await expect(corto).toHaveAttribute('data-pausada', '');
    // Pasa de sobra lo que dura el corto entero y sigue en la primera toma.
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    const marcha = await corto
      .locator('[data-escenas="fria"] [data-escena]:not([hidden]) .foto__vivo')
      .evaluate((foto) => getComputedStyle(foto).animationPlayState);
    expect(marcha).toBe('paused');
    await pausa.click();
    await expect(pausa).toHaveAttribute('aria-pressed', 'false');
    await expect(corto).not.toHaveAttribute('data-pausada', /.*/);
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
  });

  test('la raya de avance se agarra: un clic lleva el corto a ese instante, hacia adelante o hacia atras, y sigue desde ahi', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    const riel = corto.getByRole('slider', { name: 'Avance del video' });
    const total = CORTO.guion.reduce((suma, momento) => suma + momento.dura, 0);
    const enSegundos = Math.round(total / 1000);
    await expect(riel).toHaveAttribute('aria-valuemax', String(enSegundos));
    await expect(riel).toHaveAttribute('aria-valuenow', '0');
    const { x, y, width, height } = (await riel.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    // Lo que se toca da para el cursor o el dedo, aunque la raya que se ve sea fina.
    expect(height).toBeGreaterThanOrEqual(24);
    // A la mitad del penultimo momento (lo que hizo el agente).
    const penultimo = CORTO.guion.length - 2;
    const antes = CORTO.guion.slice(0, penultimo).reduce((suma, momento) => suma + momento.dura, 0);
    const lleva = (CORTO.guion[penultimo]?.dura ?? 0) / 2;
    await page.mouse.click(x + (width * (antes + lleva)) / total, y + height / 2);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[penultimo] ?? '');
    const segundos = Math.round((antes + lleva) / 1000);
    await expect(riel).toHaveAttribute('aria-valuenow', String(segundos));
    await expect(riel).toHaveAttribute('aria-valuetext', `${segundos} de ${enSegundos} segundos`);
    // Sus animaciones no empiezan de cero: van adelantadas a lo que ese momento ya lleva.
    const adelantadas = await corto.locator('[data-corto-cine]').evaluate((cine) =>
      cine
        .getAnimations({ subtree: true })
        .filter((animacion) => !(animacion instanceof CSSTransition))
        .map((animacion) => Number(animacion.currentTime)),
    );
    expect(adelantadas.length).toBeGreaterThan(0);
    for (const va of adelantadas) expect(va).toBeGreaterThanOrEqual(lleva - 20);
    // Y lo que va de un momento a otro (la camara) ya llego: nada se queda a medio camino.
    expect(
      await corto
        .locator('[data-corto-cine]')
        .evaluate(
          (cine) =>
            cine.getAnimations({ subtree: true }).filter((animacion) => animacion instanceof CSSTransition).length,
        ),
    ).toBe(0);
    // No estaba en pausa: el reloj sigue y el corto avanza desde ahi.
    await expect(corto).not.toHaveAttribute('data-pausada', /.*/);
    await hastaElCuadro(page, corto, MOMENTOS.at(-1) ?? '');
    // Hacia atras: de vuelta a la primera toma, con la raya en ceros.
    await page.mouse.click(x + 1, y + height / 2);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    await expect(riel).toHaveAttribute('aria-valuenow', '0');
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
  });

  test('mientras traen agarrada la raya el corto espera y la sigue; al soltarla corre otra vez, salvo que estuviera en pausa', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    const riel = corto.getByRole('slider', { name: 'Avance del video' });
    const pausa = corto.getByRole('button', { name: 'Pausar el video' });
    const total = CORTO.guion.reduce((suma, momento) => suma + momento.dura, 0);
    const { x, y, width, height } = (await riel.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    /** @param {number} lugar  @returns {number} donde queda en la raya la mitad de ese momento del guion */
    const enMedioDe = (lugar) => {
      const antes = CORTO.guion.slice(0, lugar).reduce((suma, momento) => suma + momento.dura, 0);
      return x + (width * (antes + (CORTO.guion[lugar]?.dura ?? 0) / 2)) / total;
    };
    await page.mouse.move(enMedioDe(1), y + height / 2);
    await page.mouse.down();
    await expect(riel).toHaveAttribute('data-agarrada', '');
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[1] ?? '');
    await expect(corto).toHaveAttribute('data-pausada', '');
    // Agarrada, el tiempo no la mueve; y no es la pausa de la visitante: su boton sigue diciendo que corre.
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[1] ?? '');
    await expect(pausa).toHaveAttribute('aria-pressed', 'false');
    // Arrastrada, el corto la sigue (a lo mas una vez por cuadro).
    await page.mouse.move(enMedioDe(4), y + height / 2, { steps: 4 });
    await page.clock.runFor(50);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[4] ?? '');
    await page.mouse.up();
    await expect(riel).not.toHaveAttribute('data-agarrada', /.*/);
    await expect(corto).not.toHaveAttribute('data-pausada', /.*/);
    await hastaElCuadro(page, corto, MOMENTOS[5] ?? '');
    // En pausa, moverla no la reanuda: se queda en el instante nuevo.
    await pausa.click();
    await page.mouse.click(enMedioDe(3), y + height / 2);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[3] ?? '');
    await expect(corto).toHaveAttribute('data-pausada', '');
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[3] ?? '');
    await expect(pausa).toHaveAttribute('aria-pressed', 'true');
  });

  test('con el teclado la raya va y viene: las flechas de dos en dos segundos, Inicio y Fin a sus extremos', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    const riel = corto.getByRole('slider', { name: 'Avance del video' });
    await riel.focus();
    await page.keyboard.press('ArrowRight');
    await expect(riel).toHaveAttribute('aria-valuenow', '2');
    await page.keyboard.press('ArrowRight');
    await expect(riel).toHaveAttribute('aria-valuenow', '4');
    await page.keyboard.press('ArrowLeft');
    await expect(riel).toHaveAttribute('aria-valuenow', '2');
    await page.keyboard.press('End');
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS.at(-1) ?? '');
    await page.keyboard.press('Home');
    await expect(riel).toHaveAttribute('aria-valuenow', '0');
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    // El foco sigue en la raya y el corto sigue puesto: llevarlo con el teclado no lo da por terminado.
    await expect(riel).toBeFocused();
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
  });

  test('con la pestaña escondida el reloj tampoco avanza', async ({ page }) => {
    const corto = await abrirCortoDetenido(page);
    /** @param {boolean} escondida */
    const esconder = (escondida) =>
      page.evaluate((valor) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => valor });
        document.dispatchEvent(new Event('visibilitychange'));
      }, escondida);
    await esconder(true);
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    // La pausa de la pestaña no es la de la visitante: su boton sigue diciendo que corre.
    await expect(corto.getByRole('button', { name: 'Pausar el video' })).toHaveAttribute('aria-pressed', 'false');
    await esconder(false);
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
  });

  test('"Ver de nuevo" vuelve a correr el corto desde el principio, con el oficio que sigue y el foco en la pausa', async ({
    page,
  }) => {
    const fotos = pedidos(page, /-escena-\d+\.(avif|webp)$/);
    // Le toca el de en medio: asi se ve que sigue el ultimo y despues da la vuelta al primero.
    const empieza = 1;
    await queLeToque(page, empieza);
    const corto = await abrirCortoDetenido(page);
    const cine = corto.locator('[data-corto-cine]');
    const aLaVista = corto.locator('[data-escena]').filter({ visible: true });
    await expect(aLaVista).toHaveAttribute('data-escena', CORTO.oficios[empieza]?.clave ?? '');
    await hastaElCuadro(page, corto, MOMENTOS[2] ?? '');
    const saltar = corto.getByRole('button', { name: 'Saltar' });
    const verDeNuevo = corto.getByRole('button', { name: 'Ver de nuevo' });
    // De entrada la unica foto adelantada es la del oficio de la visita: la pidio arranque.js.
    const vistos = [CORTO.oficios[empieza]?.clave ?? ''];
    expect(await adelantadas(page)).toEqual(vistos);
    // Quien lo repite ve otra profesion cada vez; despues de verlas todas, vuelve la primera.
    for (let vez = 1; vez <= CORTO.oficios.length; vez++) {
      const toca = CORTO.oficios[(empieza + vez) % CORTO.oficios.length]?.clave ?? '';
      // "Saltar", con un clic y con el foco en el (un clic no siempre lo deja ahi). Va en una orilla del boton: asi
      // el puntero no queda donde enseguida aparece "Ver de nuevo", que ocupa casi el mismo lugar.
      await saltar.focus();
      await saltar.click({ position: { x: 6, y: 6 } });
      await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
      // El codigo le paso el foco a "Ver de nuevo", y ese foco no adelanta nada: nadie se ha acercado al boton.
      await expect(verDeNuevo).toBeFocused();
      expect(await adelantadas(page)).toEqual(vistos);
      const pedidas = fotos.filter((foto) => foto.startsWith(`${toca}-escena-`)).length;
      expect(pedidas > 0).toBe(vistos.includes(toca));
      // En cuanto el puntero se acerca al boton, la foto del que sigue se va pidiendo: al correr, ya viene en camino.
      // La del que ya corrio no se pide otra vez: al dar la vuelta no hay un segundo adelanto de la misma foto.
      await verDeNuevo.hover();
      if (!vistos.includes(toca)) vistos.push(toca);
      expect(await adelantadas(page)).toEqual(vistos);
      await expect.poll(() => fotos.some((foto) => foto.startsWith(`${toca}-escena-`))).toBe(true);
      if (pedidas > 0) expect(fotos.filter((foto) => foto.startsWith(`${toca}-escena-`))).toHaveLength(pedidas);
      await verDeNuevo.click();
      await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
      await expect(cine).toBeVisible();
      await expect(cine).toHaveAttribute('data-oficio', toca);
      await expect(aLaVista).toHaveCount(1);
      await expect(aLaVista).toHaveAttribute('data-escena', toca);
      await expect(verDeNuevo).toBeHidden();
      await expect(corto.getByRole('button', { name: 'Pausar el video' })).toBeFocused();
      await expect(corto.getByRole('button', { name: 'Saltar' })).toBeVisible();
      await expect(corto.locator('.letrero[data-activo]')).toHaveText(CORTO.guion[0]?.letrero ?? '');
    }
    // El oficio de la visita no cambia: es el que ensena el cartel en celular.
    await expect(page.locator('html')).toHaveAttribute('data-oficio', CORTO.oficios[empieza]?.clave ?? '');
    // Y vuelve a recorrer su guion desde la primera toma.
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
  });

  test('con movimiento reducido no corre solo: se ve el cartel, y "Ver el video" lo corre porque ella lo pidio', async ({
    page,
  }) => {
    const videos = videosPedidos(page);
    const corto = await abrirCortoDetenido(page, { quieta: true });
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    const titulo = corto.getByRole('heading', { level: 1 });
    await expect(titulo).toBeInViewport({ ratio: 1 });
    expect(await encimaDe(titulo)).toBe('cartel');
    await expect(corto.getByRole('button', { name: 'Saltar' })).toBeHidden();
    // Pasa el tiempo y nada se mueve solo, ni se piden los videos.
    await page.waitForLoadState('load');
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    expect(videos).toEqual([]);
    const ver = corto.getByRole('button', { name: 'Ver el video' });
    await expect(ver).toBeInViewport({ ratio: 1 });
    await ver.click();
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    await expect(corto.locator('[data-corto-cine]')).toBeVisible();
    expect(await encimaDe(titulo)).toBe('corto');
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
    await corto.getByRole('button', { name: 'Saltar' }).click();
    // Ya corrio una vez: ahora el boton ofrece verlo de nuevo.
    await expect(corto.getByRole('button', { name: 'Ver de nuevo' })).toBeVisible();
  });

  test('bajar la pagina a media pelicula la termina: al volver se ve el cartel', async ({ page }) => {
    const corto = await abrirCortoDetenido(page);
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
    await page.locator('#agente').evaluate((seccion) => seccion.scrollIntoView({ block: 'start' }));
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await page.evaluate(() => window.scrollTo(0, 0));
    const titulo = corto.getByRole('heading', { level: 1 });
    await expect(titulo).toBeInViewport({ ratio: 1 });
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    await expect(corto.getByRole('button', { name: 'Ver de nuevo' })).toBeVisible();
    // El corto no vuelve solo.
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
  });

  test('si la ventana se angosta a media pelicula, el corto termina; al ensancharla no arranca solo', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    await hastaElCuadro(page, corto, MOMENTOS[1] ?? '');
    const medida = page.viewportSize() ?? { width: 1280, height: 720 };
    // De pie, como una tableta: ahi el corto no existe.
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    await expect(corto.locator('[data-corto-control]')).toBeHidden();
    await expect(corto.locator('[data-corto-ver]')).toBeHidden();
    await expect(corto.locator('.duo__escena').filter({ visible: true })).toHaveCount(1);
    // Otra vez ancha: el cartel se queda, con su boton para verlo.
    await page.setViewportSize(medida);
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    await expect(corto.getByRole('button', { name: 'Ver de nuevo' })).toBeVisible();
  });

  test('quien abre la pagina en una ventana angosta y luego la ensancha ve el cartel, con su boton para ver el video', async ({
    page,
  }) => {
    const videos = videosPedidos(page);
    const medida = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.setViewportSize({ width: 700, height: 900 });
    const corto = await abrirCortoDetenido(page);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await page.setViewportSize(medida);
    expect(await page.evaluate((consulta) => matchMedia(consulta).matches, ANCHA)).toBe(true);
    await page.waitForLoadState('load');
    await page.clock.runFor(20_000);
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    expect(videos).toEqual([]);
    // Como no lo ha visto, el boton le ofrece verlo (no "verlo de nuevo"); y al pedirlo, corre.
    const ver = corto.getByRole('button', { name: 'Ver el video' });
    await expect(ver).toBeVisible();
    await ver.click();
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    await expect(corto.locator('[data-corto-cine]')).toBeVisible();
  });

  test('con el teclado, lo primero del inicio son los controles del corto; si el foco llega al cartel, el corto se quita', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    const paradas = await corto.evaluate((raiz) =>
      [...raiz.querySelectorAll('button, a[href], video, [tabindex]')]
        .filter((uno) => uno.getAttribute('tabindex') !== '-1')
        .map((uno) => uno.getAttribute('aria-label') ?? uno.textContent?.trim()),
    );
    expect(paradas.slice(0, 4)).toEqual(['Avance del video', 'Saltar video', 'Pausar el video', 'Empieza ahora']);
    // Las capas del corto no traen ninguna parada.
    expect(await corto.locator('[data-corto-cine]').locator('a, button, [tabindex="0"]').count()).toBe(0);
    const enlace = corto.getByRole('link', { name: 'Míralo en acción' });
    await enlace.focus();
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(enlace).toBeFocused();
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    expect(await encimaDe(enlace)).toBe('cartel');
  });

  test('los videos no son parada del teclado ni traen sonido, y solo se pide uno, despues del primer pintado', async ({
    page,
  }) => {
    const pedidosDeVideo = videosPedidos(page);
    const toca = CORTO.oficios.length - 1;
    await queLeToque(page, toca);
    // Sin el reloj de Playwright: aqui importan los tiempos de verdad del navegador.
    await page.goto('./');
    const corto = page.locator('[data-corto]');
    await expect(corto).toHaveAttribute('data-viva', '');
    const videos = corto.locator('video');
    await expect(videos).toHaveCount(CORTO.oficios.length);
    for (const video of await videos.all()) {
      await expect(video).toHaveAttribute('tabindex', '-1');
      await expect(video).toHaveJSProperty('muted', true);
      await expect(video).toHaveJSProperty('controls', false);
      await expect(video).toHaveJSProperty('loop', false);
      expect(await video.evaluate((el) => Boolean(el.closest('[aria-hidden="true"]')))).toBe(true);
    }
    // Solo el del oficio que toco llega a pedirse, y despues de lo que se ve: cuando el navegador ya pinto.
    const suyo = corto.locator('video[src]');
    await expect(suyo).toHaveCount(1, { timeout: 15_000 });
    await expect(suyo).toHaveAttribute('src', new RegExp(`/${CORTO.oficios[toca]?.clave}-escena\\.mp4$`));
    const tiempos = () =>
      page.evaluate(() => ({
        pintado: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
        pedidos: performance
          .getEntriesByType('resource')
          .filter((recurso) => recurso.name.endsWith('.mp4'))
          .map((recurso) => recurso.startTime),
      }));
    await expect.poll(async () => (await tiempos()).pedidos.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const { pintado, pedidos: cuando } = await tiempos();
    expect(pintado).toBeGreaterThan(0);
    for (const pedido of cuando) expect(pedido).toBeGreaterThan(pintado);
    expect([...new Set(pedidosDeVideo)]).toHaveLength(1);
  });

  test('el video solo corre mientras el corto corre: descansa en la pausa y al saltarlo, y se muda a la luz calida a media pasada', async ({
    page,
  }) => {
    test.slow();
    const corto = await abrirCortoDetenido(page);
    const video = corto.locator('video[src]');
    // El video se pide un momento despues de cargar la pagina: el reloj se adelanta hasta ahi.
    await page.waitForLoadState('load');
    await page.clock.runFor(600);
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute('src', /-escena\.mp4$/);
    // Entra con su fundido en cuanto empieza a correr, sobre la escena de luz fria.
    await expect(corto.locator('[data-escenas="fria"] [data-escena][data-con-video]')).toHaveCount(1, {
      timeout: 15_000,
    });
    const pausa = corto.getByRole('button', { name: 'Pausar el video' });
    await pausa.click();
    await expect(video).toHaveJSProperty('paused', true);
    await pausa.click();
    // Al reanudar sigue su pasada (o ya la termino, si la maquina va lenta).
    const sigue = () =>
      video.evaluate((el) => {
        const { paused, ended } = /** @type {HTMLVideoElement} */ (el);
        return !paused || ended;
      });
    await expect.poll(sigue).toBe(true);
    // Desde el barrido el mismo video corre en la escena de luz calida. No entra desde su principio sino a media
    // pasada: asi termina (y vuelve a empezar) mientras la marca lo tapa, no durante la conversacion del agente.
    await hastaElCuadro(page, corto, 'barrido');
    await expect(corto.locator('[data-escenas="calida"] video[src]')).toHaveCount(1);
    await expect(corto.locator('[data-escenas="fria"] video[src]')).toHaveCount(0);
    await expect(corto.locator('[data-escenas="calida"] [data-escena][data-con-video]')).toHaveCount(1, {
      timeout: 15_000,
    });
    const { va, dura } = await video.evaluate((el) => {
      const { currentTime, duration } = /** @type {HTMLVideoElement} */ (el);
      return { va: currentTime, dura: duration };
    });
    const falta = CORTO.guion
      .slice(MOMENTOS.indexOf('barrido'), MOMENTOS.indexOf('agente'))
      .reduce((suma, momento) => suma + momento.dura, 0);
    expect(dura * 1000).toBeGreaterThan(falta);
    expect(va).toBeGreaterThan(1);
    await corto.getByRole('button', { name: 'Saltar' }).click();
    await expect(video).toHaveJSProperty('paused', true);
    // Y al verlo de nuevo corre el del oficio que sigue, otra vez sobre su escena fria; el anterior descansa.
    const anterior = await video.getAttribute('src');
    await corto.getByRole('button', { name: 'Ver de nuevo' }).click();
    const nuevo = corto.locator('[data-escenas="fria"] [data-escena]:not([hidden]) video[src]');
    await expect(nuevo).toHaveCount(1, { timeout: 15_000 });
    expect(await nuevo.getAttribute('src')).not.toBe(anterior);
    await expect(corto.locator('[data-escenas="calida"] video[src]')).toHaveJSProperty('paused', true);
  });
});
