// @ts-check
// El inicio: el cartel y, solo en pantallas anchas, el corto. En celular y en tableta de pie (los perfiles celular,
// previa e iphone) se comprueba que el corto NO corre y que el cartel esta completo, con "Tu y tu agente" y un oficio
// al azar; el corto se prueba en escritorio y en firefox. El tiempo de la pagina lo lleva el reloj de Playwright: las
// pruebas lo detienen y lo adelantan, sin esperar el medio minuto de verdad.
import { readFileSync } from 'node:fs';
import { abrirCortoDetenido, hastaElCuadro, sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

const ALTA = 'https://alta.prompt-maestro.com/';
/**
 * Un oficio, con lo que el cartel ensena de el.
 * @typedef {object} Oficio
 * @property {string} clave
 * @property {string} nombre
 * @property {{ base: number, tope: number }} cuenta
 * @property {{ quien: string, texto: string, responde: string, hizo: string, foto: boolean }} trato
 * @property {object} cartel
 * @property {string} cartel.cuando
 * @property {string} cartel.quien
 * @property {{ foto: string, alt: string }} cartel.tu
 * @property {{ negocio: string, iniciales: string, entra: string, responde: string, anticipo: string }} cartel.charla
 */
// El guion y los textos salen del mismo archivo que la pagina: si cambian, estas pruebas siguen valiendo.
/**
 * @type {{
 *   guion: { clave: string, dura: number, letrero: string }[],
 *   cartel: Record<string, string>,
 *   marca: { nombre: string, frase: string },
 *   pagoAprobado: string,
 *   oficios: Oficio[],
 * }}
 */
const CORTO = JSON.parse(readFileSync(new URL('../../fuente/datos/corto.json', import.meta.url), 'utf8'));
const MOMENTOS = CORTO.guion.map((momento) => momento.clave);
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
  const titulo = corto.getByRole('heading', { level: 1 });
  await expect(titulo).toHaveText('Despreocúpate');
  await expect(titulo).toBeInViewport({ ratio: 1 });
  expect(await encimaDe(titulo)).toBe('cartel');
  const frase = corto.locator('.cartel__frase');
  await expect(frase).toHaveText(CORTO.cartel.frase ?? '');
  await expect(frase).toBeInViewport({ ratio: 1 });
  await expect(corto.locator('.cartel .sobre')).toHaveText('Uñas, dentistas, médicos y pronto más oficios');
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
  // Y su imagen: en pantallas anchas, las fotos de "su tiempo"; en las demas, "Tu y tu agente".
  if (esAncho(info)) {
    const foto = corto.locator('.vida[data-activo] img');
    await expect(foto).toHaveAttribute('alt', /manicurista/);
    await expect(foto).toHaveJSProperty('complete', true);
    await expect(cita).toBeInViewport({ ratio: 0.9 });
    await expect(corto.locator('.duo')).toBeHidden();
  } else {
    await expect(corto.getByRole('figure', { name: CORTO.cartel.ejemplo ?? '' })).toBeVisible();
    await expect(corto.locator('.vidas')).toBeHidden();
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
  // "Vívelo tú" baja a la demostracion.
  await corto.getByRole('link', { name: 'Vívelo tú' }).click();
  await expect(page).toHaveURL(/#citas$/);
  await expect(page.locator('#citas').getByRole('heading', { level: 2 })).toBeInViewport();
  expect(fallas).toEqual([]);
});

test('en pantallas anchas el cartel ensena las tres fotos de "su tiempo", y de "Tu y tu agente" no pide nada', async ({
  page,
}, info) => {
  test.skip(!esAncho(info), 'en celular el cartel ensena "Tu y tu agente"');
  const corto = await abrirCortoDetenido(page, { quieta: true });
  for (const oficio of CORTO.oficios) {
    await expect(corto.locator(`.vida[data-vida="${oficio.clave}"] img`)).toBeInViewport({ ratio: 0.9 });
  }
  await expect(corto.locator('.vida__nombre').filter({ visible: true })).toHaveText(
    CORTO.oficios.map((oficio) => oficio.nombre),
  );
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
    // Ya no van: ni botones para cambiar de oficio, ni el contador en ceros, ni las fotos de "su tiempo". Y nada de
    // la imagen es una parada del teclado.
    await expect(corto.locator('button').filter({ visible: true })).toHaveCount(0);
    await expect(corto.getByText('sin contestar').filter({ visible: true })).toHaveCount(0);
    await expect(corto.locator('.vidas')).toBeHidden();
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
      // El cartel mide justo la pantalla y nada se sale a lo ancho.
      expect(await desborde(page)).toBeLessThanOrEqual(0);
      expect(Math.abs((await caja(corto)).abajo - alto)).toBeLessThanOrEqual(1);
      // El titulo, la frase y los dos botones, completos y a la vista.
      const empieza = corto.getByRole('link', { name: 'Empieza ahora' });
      for (const pieza of [
        corto.getByRole('heading', { level: 1 }),
        corto.locator('.cartel__frase'),
        empieza,
        corto.getByRole('link', { name: 'Vívelo tú' }),
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
  // Tampoco viajan las fotos del corto ni las de "su tiempo" de las pantallas anchas: aqui no se pintan.
  const fotos = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((recurso) => recurso.name)
      .filter((nombre) => /-(trabajo-\d+|vida-tarjeta-\d+)\.(avif|webp)$/.test(nombre)),
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
    await expect(corto.getByRole('link', { name: 'Vívelo tú' })).toHaveAttribute('href', '#citas');
    const [primero] = CORTO.oficios;
    if (esAncho(info)) {
      await expect(corto.locator('.vida').first().locator('img')).toBeVisible();
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

  test('al abrir corre solo: pasa por sus seis momentos en orden, cada uno con su letrero, y termina en el cartel', async ({
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
    for (const momento of CORTO.guion) {
      await hastaElCuadro(page, corto, momento.clave);
      vistos.push(await corto.getAttribute('data-cuadro'));
      const letrero = corto.locator('.letrero[data-activo]');
      if (momento.letrero) await expect(letrero).toHaveText(momento.letrero);
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

  test('la raya de avance camina con el corto y las pantallas de los celulares se llenan hasta su tope', async ({
    page,
  }) => {
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
    // Un celular por oficio, cada uno con su contador, que sube hasta el tope de ese oficio: ninguno marca lo
    // mismo que otro.
    const cuentas = corto.locator('[data-corto-cuenta]');
    await expect(cuentas).toHaveCount(CORTO.oficios.length);
    expect(Number(await cuentas.first().textContent())).toBeLessThan(CORTO.oficios[0]?.cuenta.tope ?? 0);
    // En el celular de uñas se ve la foto que mando una clienta.
    await expect(corto.locator('.pantalla').first().locator('.aviso__mira')).toBeVisible();
    await hastaElCuadro(page, corto, 'barrido');
    for (const [lugar, oficio] of CORTO.oficios.entries()) {
      await expect(cuentas.nth(lugar)).toHaveText(String(oficio.cuenta.tope));
    }
    expect(new Set(await cuentas.allTextContents()).size).toBe(CORTO.oficios.length);
    // En el barrido el codigo corre la caja de lo viejo; al pasar, la deja en su lugar.
    await page.clock.runFor(300);
    await expect(corto.locator('[data-corto-antes]')).toHaveAttribute('style', /translateX/);
    await hastaElCuadro(page, corto, 'marca');
    await expect(corto.locator('[data-corto-antes]')).not.toHaveAttribute('style', /translateX/);
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

  test('lo que hizo el agente se cuenta un oficio tras otro, y cada conversacion termina con su sello', async ({
    page,
  }) => {
    const corto = await abrirCortoDetenido(page);
    await hastaElCuadro(page, corto, 'agente');
    const tratos = corto.locator('[data-tri="calida"] .trato');
    await expect(tratos).toHaveCount(CORTO.oficios.length);
    // Primero el oficio de la izquierda: ya tiene su sello cuando el ultimo todavia no empieza.
    const vaEnOrden = () =>
      corto.evaluate((seccion) => {
        const todos = [...seccion.querySelectorAll('[data-tri="calida"] .trato')];
        const selloDelPrimero = todos[0]?.querySelector('.sello');
        const mensajeDelUltimo = todos.at(-1)?.firstElementChild;
        if (!selloDelPrimero || !mensajeDelUltimo) return false;
        return getComputedStyle(selloDelPrimero).opacity === '1' && getComputedStyle(mensajeDelUltimo).opacity === '0';
      });
    await expect.poll(vaEnOrden, { timeout: 15_000, intervals: [100] }).toBe(true);
    // Y al final estan las tres, completas: el mensaje, lo que contesto el agente, la frase de lo que hizo y su sello.
    for (const [lugar, oficio] of CORTO.oficios.entries()) {
      const trato = tratos.nth(lugar);
      const sello = trato.locator('.sello');
      await expect(sello).toHaveCSS('opacity', '1', { timeout: 20_000 });
      await expect(sello).toHaveAttribute('aria-label', 'Cita garantizada: anticipo pagado');
      await expect(trato.locator('.dice').first()).toContainText(oficio.trato.quien);
      await expect(trato.locator('.dice--agente')).toHaveText(oficio.trato.responde);
      await expect(trato.locator('.hizo')).toContainText(oficio.trato.hizo);
      await expect(trato.locator('.dice__foto')).toHaveCount(oficio.trato.foto ? 1 : 0);
      // Nada de la conversacion se sale de su franja ni se mete debajo de los controles.
      const franja = await caja(trato.locator('xpath=ancestor::*[@data-franja]'));
      const control = await caja(corto.locator('.control__linea'));
      for (const pieza of await trato.locator('.dice, .hizo').all()) {
        const suCaja = await caja(pieza);
        expect(suCaja.izquierda).toBeGreaterThanOrEqual(franja.izquierda);
        expect(suCaja.derecha).toBeLessThanOrEqual(franja.derecha);
        expect(suCaja.abajo).toBeLessThanOrEqual(control.arriba);
      }
    }
    expect(await desborde(page)).toBeLessThanOrEqual(0);
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
    // Y el cartel ya se puede tocar, sin esperar a que el corto termine de fundirse.
    const empieza = corto.getByRole('link', { name: 'Empieza ahora' });
    await expect(empieza).toBeVisible();
    await empieza.click({ trial: true });
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
      .locator('[data-tri="fria"] .foto__vivo')
      .first()
      .evaluate((foto) => getComputedStyle(foto).animationPlayState);
    expect(marcha).toBe('paused');
    await pausa.click();
    await expect(pausa).toHaveAttribute('aria-pressed', 'false');
    await expect(corto).not.toHaveAttribute('data-pausada', /.*/);
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

  test('"Ver de nuevo" vuelve a correr el corto desde el principio, con el foco en la pausa', async ({ page }) => {
    const corto = await abrirCortoDetenido(page);
    await hastaElCuadro(page, corto, MOMENTOS[2] ?? '');
    await corto.getByRole('button', { name: 'Saltar' }).click();
    const verDeNuevo = corto.getByRole('button', { name: 'Ver de nuevo' });
    await verDeNuevo.click();
    await expect(corto).toHaveAttribute('data-cuadro', MOMENTOS[0] ?? '');
    await expect(corto.locator('[data-corto-cine]')).toBeVisible();
    await expect(verDeNuevo).toBeHidden();
    await expect(corto.getByRole('button', { name: 'Pausar el video' })).toBeFocused();
    await expect(corto.getByRole('button', { name: 'Saltar' })).toBeVisible();
    // Y vuelve a recorrer su guion desde la primera toma.
    await expect(corto.locator('.letrero[data-activo]')).toHaveText(CORTO.guion[0]?.letrero ?? '');
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
    await page.evaluate(() => document.querySelector('#como-funciona')?.scrollIntoView({ block: 'start' }));
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
    expect(paradas.slice(0, 4)).toEqual(['Saltar', 'Pausar el video', 'Empieza ahora', 'Vívelo tú']);
    // Las capas del corto no traen ninguna parada.
    expect(await corto.locator('[data-corto-cine]').locator('a, button, [tabindex="0"]').count()).toBe(0);
    const enlace = corto.getByRole('link', { name: 'Vívelo tú' });
    await enlace.focus();
    await expect(corto).toHaveAttribute('data-cuadro', CARTEL);
    await expect(enlace).toBeFocused();
    await expect(corto.locator('[data-corto-cine]')).toBeHidden();
    expect(await encimaDe(enlace)).toBe('cartel');
  });

  test('los videos no son parada del teclado, no traen sonido y no se piden antes del primer pintado', async ({
    page,
  }) => {
    // Sin el reloj de Playwright: aqui importan los tiempos de verdad del navegador.
    await page.goto('./');
    const corto = page.locator('[data-corto]');
    await expect(corto).toHaveAttribute('data-viva', '');
    const videos = corto.locator('video');
    await expect(videos).toHaveCount(3);
    for (const video of await videos.all()) {
      await expect(video).toHaveAttribute('tabindex', '-1');
      await expect(video).toHaveJSProperty('muted', true);
      await expect(video).toHaveJSProperty('controls', false);
      await expect(video).toHaveJSProperty('loop', false);
      expect(await video.evaluate((el) => Boolean(el.closest('[aria-hidden="true"]')))).toBe(true);
    }
    // Llegan despues de lo que se ve: cuando el navegador ya pinto.
    await expect(videos.first()).toHaveAttribute('src', /-trabajo\.mp4$/, { timeout: 15_000 });
    const tiempos = () =>
      page.evaluate(() => ({
        pintado: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
        pedidos: performance
          .getEntriesByType('resource')
          .filter((recurso) => recurso.name.endsWith('.mp4'))
          .map((recurso) => recurso.startTime),
      }));
    await expect.poll(async () => (await tiempos()).pedidos.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const { pintado, pedidos } = await tiempos();
    expect(pintado).toBeGreaterThan(0);
    for (const pedido of pedidos) expect(pedido).toBeGreaterThan(pintado);
  });

  test('los videos solo corren mientras el corto corre: descansan en la pausa y al saltarlo', async ({ page }) => {
    const corto = await abrirCortoDetenido(page);
    const videos = corto.locator('video');
    // Los videos se piden un momento despues de cargar la pagina: el reloj se adelanta hasta ahi.
    await page.waitForLoadState('load');
    await page.clock.runFor(600);
    await expect(videos.first()).toHaveAttribute('src', /-trabajo\.mp4$/);
    // Cada uno entra con su fundido en cuanto empieza a correr, sobre la franja de luz fria.
    await expect(corto.locator('[data-tri="fria"] [data-franja][data-con-video]')).toHaveCount(3, { timeout: 15_000 });
    const pausa = corto.getByRole('button', { name: 'Pausar el video' });
    await pausa.click();
    for (const video of await videos.all()) await expect(video).toHaveJSProperty('paused', true);
    await pausa.click();
    // Al reanudar siguen su pasada (o ya la terminaron, si la maquina va lenta).
    const sigue = () =>
      videos.first().evaluate((video) => {
        const { paused, ended } = /** @type {HTMLVideoElement} */ (video);
        return !paused || ended;
      });
    await expect.poll(sigue).toBe(true);
    // Desde el barrido el mismo video corre en la franja de luz calida, otra vez desde su principio.
    await hastaElCuadro(page, corto, 'barrido');
    await expect(corto.locator('[data-tri="calida"] video')).toHaveCount(3);
    await expect(corto.locator('[data-tri="fria"] video')).toHaveCount(0);
    await expect(corto.locator('[data-tri="calida"] [data-franja][data-con-video]')).toHaveCount(3, {
      timeout: 15_000,
    });
    await corto.getByRole('button', { name: 'Saltar' }).click();
    for (const video of await videos.all()) await expect(video).toHaveJSProperty('paused', true);
    // Y al verlo de nuevo regresan a su franja fria.
    await corto.getByRole('button', { name: 'Ver de nuevo' }).click();
    await expect(corto.locator('[data-tri="fria"] video')).toHaveCount(3);
  });
});
