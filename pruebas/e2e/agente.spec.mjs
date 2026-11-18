// @ts-check
// "Tu agente": el menu de nueve beneficios y sus mini videos. El primero llega abierto y corre solo una vez al
// llegar a la vista; elegir otro cierra el anterior y corre el suyo; la barra pausa, reanuda y lo repite. En celular
// es un acordeon y en computadora, un menu con su escenario. Con movimiento reducido nada corre; sin JavaScript, o si
// su pieza no llega, se lee como lista.
import { readFileSync } from 'node:fs';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

/** @type {{ hace: { titulo: string, texto: string, dura: number, alta?: boolean, pasos: any[] }[] }} */
const { hace: HACE } = JSON.parse(readFileSync(new URL('../../fuente/datos/agentes.json', import.meta.url), 'utf8'));
const TITULOS = HACE.map(({ titulo }) => titulo);
const ORACIONES = HACE.map(({ texto }) => texto);
/** Los beneficios que hay. */
const CUANTOS = HACE.length;
/**
 * El lugar de un beneficio en el menu, del 1 en adelante, por su titulo: las pruebas no dependen del orden.
 * @param {string} titulo
 */
const numeroDe = (titulo) => TITULOS.indexOf(titulo) + 1;
const AGENDA = numeroDe('Maneja tu agenda solo');
const PAGO = numeroDe('Asegura el pago antes de agendar');
const VOZ = numeroDe('Entiende notas de voz');
const FOTO = numeroDe('Lee la foto de referencia');
const RECADOS = numeroDe('Te pasa los recados');
const EXAMEN = numeroDe('Pasa un examen antes de atender');
/** Lo alto de un mini video en el acordeon: el de la base de conocimiento, que trae una ficha grande, es mas alto. */
const ALTO_EN_ACORDEON = HACE.map(({ alta }) => (alta ? 452 : 340));
/** Los tamanos en que se revisa que nada se salga ni brinque: tres celulares o tabletas de pie y tres computadoras. */
const TAMANOS = /** @type {const} */ ([
  [360, 740],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
]);

/**
 * Abre la pagina y espera a que el menu quede vivo.
 * @param {import('@playwright/test').Page} page
 * @param {{ quieta?: boolean }} [opciones]  quieta: la visitante pidio menos movimiento
 */
async function abrir(page, { quieta = false } = {}) {
  if (quieta) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const menu = page.locator('[data-agente]');
  await expect(menu).toHaveAttribute('data-viva', '');
  return menu;
}

/**
 * @param {import('@playwright/test').Locator} menu
 * @param {number} numero  del 1 al 8
 */
const beneficio = (menu, numero) => menu.locator('.beneficio').nth(numero - 1);
/**
 * @param {import('@playwright/test').Locator} menu
 * @param {number} numero
 */
const boton = (menu, numero) => beneficio(menu, numero).locator('button.beneficio__boton');
/** @param {import('@playwright/test').Locator} menu */
const video = (menu) => menu.locator('.mv').filter({ visible: true });
/** @param {import('@playwright/test').Page} page */
const esComputadora = (page) => page.evaluate(() => matchMedia('(min-width: 900px)').matches);

/**
 * Que dos juegos de medidas son el mismo: cada cosa sigue donde estaba y mide lo mismo. Se perdona un punto, que es
 * lo que redondea el navegador cuando una orilla cae a media raya.
 * @param {Record<string, unknown>} ahora
 * @param {Record<string, unknown>} antes
 * @param {string} [nota]
 */
function mismasMedidas(ahora, antes, nota = '') {
  expect(Object.keys(ahora), nota).toEqual(Object.keys(antes));
  for (const [clave, valor] of Object.entries(antes)) {
    const eran = /** @type {number[]} */ ([valor].flat(3));
    const son = /** @type {number[]} */ ([ahora[clave]].flat(3));
    expect(son.length, `${nota}: ${clave}`).toBe(eran.length);
    for (const [lugar, medida] of eran.entries()) {
      expect(Math.abs((son[lugar] ?? Number.NaN) - medida), `${nota}: ${clave}`).toBeLessThanOrEqual(1);
    }
  }
}

/**
 * Lleva una pieza a media pantalla, como queda al llegar a ella leyendo.
 * @param {import('@playwright/test').Locator} pieza
 */
async function llegarA(pieza) {
  await pieza.evaluate((el) => el.scrollIntoView({ block: 'center' }));
}

/**
 * Espera a que la pagina deje de recorrerse sola.
 * @param {import('@playwright/test').Page} page
 */
async function quietaLaPagina(page) {
  let antes = Number.NaN;
  await expect
    .poll(async () => {
      const ahora = await page.evaluate(() => scrollY);
      const igual = ahora === antes;
      antes = ahora;
      return igual;
    })
    .toBe(true);
}

/**
 * Espera a que termine lo que se desliza en el menu (la oracion que se abre y la que se guarda, en computadora).
 * @param {import('@playwright/test').Page} page
 */
async function asentado(page) {
  await page.evaluate(async () => {
    const deslizando = () =>
      (document.querySelector('.beneficios')?.getAnimations({ subtree: true }) ?? []).filter(
        (animacion) => animacion instanceof CSSTransition && animacion.playState === 'running',
      );
    for (let faltan = deslizando(); faltan.length > 0; faltan = deslizando()) {
      await Promise.all(faltan.map((animacion) => animacion.finished.catch(() => undefined)));
    }
  });
}

/**
 * Lleva de un jalon al final el mini video que esta corriendo: lo mismo que esperar a que termine, sin esperar.
 * @param {import('@playwright/test').Locator} menu
 */
async function alFinal(menu) {
  await menu.evaluate((raiz) => {
    for (const animacion of raiz.getAnimations({ subtree: true })) {
      if (animacion instanceof CSSAnimation) animacion.finish();
    }
  });
}

/**
 * Como va el mini video abierto: lo que la pagina dice de el y lo que de verdad se mueve.
 * @param {import('@playwright/test').Locator} menu
 */
function marcha(menu) {
  return menu.evaluate((raiz) => {
    const abierto = raiz.querySelector('.beneficio[data-abierto]');
    const animaciones = (abierto?.querySelector('.mv')?.getAnimations({ subtree: true }) ?? []).filter(
      (animacion) => animacion instanceof CSSAnimation,
    );
    const avance = /** @type {Element} */ (abierto?.querySelector('.mv__avance'));
    const linea = /** @type {Element} */ (avance.parentElement);
    return {
      anda: raiz.hasAttribute('data-anda'),
      fase: abierto?.getAttribute('data-fase') ?? 'fin',
      corriendo: animaciones.filter((animacion) => animacion.playState === 'running').length,
      detenidas: animaciones.filter((animacion) => animacion.playState === 'paused').length,
      // Por donde va la linea de avance, de 0 a 1: lo que se ve en la pantalla, no lo que dice el reloj. Sin barra
      // a la vista (con movimiento reducido), -1.
      va:
        linea.getBoundingClientRect().width > 0
          ? Math.round((1000 * avance.getBoundingClientRect().width) / linea.getBoundingClientRect().width) / 1000
          : -1,
    };
  });
}

/**
 * Que tan a la vista esta cada paso de la escena abierta (de 0 a 1), en su orden. El que ya se fue no cuenta.
 * @param {import('@playwright/test').Locator} menu
 */
function pasosALaVista(menu) {
  return menu.evaluate((raiz) =>
    [...raiz.querySelectorAll('.beneficio[data-abierto] .mv__paso')].map((paso) => {
      const estilo = getComputedStyle(paso);
      return estilo.display === 'none' ? 0 : Number(estilo.opacity);
    }),
  );
}

test('el menu llega con sus nueve beneficios, cada uno un boton de verdad, y solo el primero abierto', async ({
  page,
}) => {
  const fallas = vigilar(page);
  const menu = await abrir(page);
  const seccion = page.locator('#agente');
  await expect(seccion.getByRole('heading', { level: 2 })).toHaveText('Atiende como tú lo harías. A cualquier hora.');
  // Una lista ordenada de nueve renglones: cada uno es un titulo que es, entero, un boton. El primero, el que llega
  // abierto, es el de la base de conocimiento.
  expect([CUANTOS, TITULOS[0]]).toEqual([9, 'Hecho solo para tu negocio']);
  const renglones = menu.locator('ol.beneficios > li');
  await expect(renglones).toHaveCount(CUANTOS);
  await expect(menu.locator('h3 > button.beneficio__boton')).toHaveText(TITULOS);
  for (const [lugar, titulo] of TITULOS.entries()) {
    const suBoton = seccion.getByRole('button', { name: titulo, exact: true });
    await expect(suBoton).toHaveAttribute('aria-expanded', String(lugar === 0));
    // Dice que controla, y eso existe: su panel, con su oracion.
    const panel = page.locator(`#${await suBoton.getAttribute('aria-controls')}`);
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('.beneficio__texto')).toHaveText(ORACIONES[lugar] ?? '');
    // Se toca con el dedo: el renglon entero, de 44 px de alto por lo menos.
    const caja = await suBoton.boundingBox();
    const renglon = await renglones.nth(lugar).boundingBox();
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(Math.abs((caja?.width ?? 0) - (renglon?.width ?? 0))).toBeLessThanOrEqual(1);
  }
  // Solo el abierto ensena su oracion y lleva el circulo encendido, con el azul de la marca.
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText([ORACIONES[0] ?? '']);
  const circulos = await menu
    .locator('.beneficio__play')
    .evaluateAll((lista) => lista.map((circulo) => getComputedStyle(circulo).backgroundColor));
  expect(circulos).toEqual(['rgb(63, 92, 245)', ...Array(CUANTOS - 1).fill('rgba(0, 0, 0, 0)')]);
  await expect(boton(menu, 1)).toHaveCSS('color', 'rgb(245, 244, 240)');
  await expect(boton(menu, 2)).toHaveCSS('color', 'rgb(196, 201, 228)');
  // Un solo mini video a la vista, con una sola barra; su escena es de adorno y su boton, no.
  await expect(video(menu)).toHaveCount(1);
  await expect(menu.locator('.mv__barra')).toHaveCount(1);
  await expect(video(menu).locator('.mv__escena')).toHaveAttribute('aria-hidden', 'true');
  await expect(video(menu).getByRole('button')).toHaveCount(1);
  // Las escenas de los que llegan cerrados viajan guardadas: la pagina solo carga con la del abierto.
  await expect(menu.locator('.mv__escena')).toHaveCount(1);
  await expect(menu.locator('.mv')).toHaveCount(CUANTOS);
  await sinFaltasDeAccesibilidad(page, '#agente');
  expect(fallas).toEqual([]);
});

test('al llegar a la vista el primero corre solo, una sola vez, y se queda en su ultimo cuadro', async ({ page }) => {
  // Aqui se espera el mini video entero, a su paso: se le da su tiempo.
  test.slow();
  const fallas = vigilar(page);
  const menu = await abrir(page);
  // Mientras nadie lo ve, espera: ya trae su escena, vacia, y nada se mueve ni queda detenido a medias.
  expect(await marcha(menu)).toEqual({ anda: false, fase: 'espera', corriendo: 0, detenidas: 0, va: 0 });
  expect(new Set(await pasosALaVista(menu))).toEqual(new Set([0]));
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  const barra = video(menu).getByRole('button');
  await expect(barra).toHaveAccessibleName('Pausar');
  await expect(video(menu).locator('[data-mv-dura]')).toHaveText('0:08');
  await expect.poll(async () => (await marcha(menu)).corriendo).toBeGreaterThan(0);
  // Corre hasta el final sin que nadie lo toque, y ahi se queda: su ultimo cuadro, con todo puesto.
  await expect(beneficio(menu, 1)).not.toHaveAttribute('data-fase', /.*/, { timeout: 20_000 });
  await expect(barra).toHaveAccessibleName('Ver de nuevo');
  expect(await marcha(menu)).toEqual({ anda: false, fase: 'fin', corriendo: 0, detenidas: 0, va: 1 });
  expect(await pasosALaVista(menu)).toEqual([1, 1, 1, 1]);
  await expect(video(menu)).toContainText('Lo sabe porque es la política de tu negocio');
  // Ya terminado, ni una falta: el contraste de cada pieza de la escena y el nombre del boton.
  await sinFaltasDeAccesibilidad(page, '#agente');
  // Solo una vez: irse y regresar no lo vuelve a correr.
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('#inicio')).toBeInViewport();
  await llegarA(video(menu));
  await expect(video(menu)).toBeInViewport();
  await page.waitForTimeout(400);
  expect(await marcha(menu)).toEqual({ anda: false, fase: 'fin', corriendo: 0, detenidas: 0, va: 1 });
  expect(fallas).toEqual([]);
});

test('elegir otro beneficio cierra el anterior y corre el suyo; elegir el abierto lo corre de nuevo', async ({
  page,
}) => {
  const menu = await abrir(page);
  await llegarA(boton(menu, PAGO));
  await boton(menu, PAGO).click();
  await expect(boton(menu, PAGO)).toHaveAttribute('aria-expanded', 'true');
  await expect(boton(menu, 1)).toHaveAttribute('aria-expanded', 'false');
  await expect(menu.locator('button[aria-expanded="true"]')).toHaveCount(1);
  // Se ve su oracion y se guarda la del anterior.
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText([ORACIONES[PAGO - 1] ?? '']);
  await expect(beneficio(menu, 1).locator('.beneficio__texto')).toBeHidden();
  // Un solo mini video a la vista: el suyo, con la unica barra, que dice lo que el dura.
  await expect(video(menu)).toHaveCount(1);
  await expect(beneficio(menu, PAGO).locator('.mv')).toBeVisible();
  await expect(beneficio(menu, 1).locator('.mv')).toBeHidden();
  await expect(menu.locator('.mv__barra')).toHaveCount(1);
  await expect(beneficio(menu, PAGO).locator('.mv__barra [data-mv-dura]')).toHaveText('0:08');
  await expect(beneficio(menu, PAGO).locator('.mv__barra').getByRole('button')).toHaveAccessibleName('Pausar');
  // Su escena, que viajaba guardada, se saco al abrirlo: ya hay dos en la pagina, y cada pieza de la suya sabe a que
  // hora le toca entrar.
  await expect(menu.locator('.mv__escena')).toHaveCount(2);
  const tiempos = await beneficio(menu, PAGO)
    .locator('.mv__paso')
    .evaluateAll((pasos) => pasos.map((paso) => /** @type {HTMLElement} */ (paso).style.getPropertyValue('--mv-en')));
  expect(tiempos).toEqual((HACE[PAGO - 1]?.pasos ?? []).map((paso) => `${paso.en}s`));
  // Y corre: solo el, desde el principio.
  await quietaLaPagina(page);
  await expect(menu).toHaveAttribute('data-anda', '');
  await expect(beneficio(menu, 1)).not.toHaveAttribute('data-fase', /.*/);
  expect(await marcha(menu)).toMatchObject({ anda: true, fase: 'sigue', detenidas: 0 });
  expect((await marcha(menu)).corriendo).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.querySelectorAll('.beneficio[data-fase]').length)).toBe(1);

  // Ya terminado, tocar su renglon lo corre otra vez: sigue abierto y vuelve a empezar.
  await alFinal(menu);
  await expect(beneficio(menu, PAGO)).not.toHaveAttribute('data-fase', /.*/);
  expect(new Set(await pasosALaVista(menu))).toEqual(new Set([0, 1]));
  await boton(menu, PAGO).click();
  await expect(boton(menu, PAGO)).toHaveAttribute('aria-expanded', 'true');
  await expect(beneficio(menu, PAGO)).toHaveAttribute('data-fase', 'sigue');
  const deNuevo = await marcha(menu);
  expect(deNuevo.fase).toBe('sigue');
  // La linea de avance volvio a empezar: va por menos de la mitad.
  expect(deNuevo.va).toBeLessThan(0.5);

  // Y otro mas, a media funcion del anterior: el de antes se cierra sin terminar y ya no corre.
  await llegarA(boton(menu, RECADOS));
  await boton(menu, RECADOS).click();
  await expect(boton(menu, RECADOS)).toHaveAttribute('aria-expanded', 'true');
  await expect(beneficio(menu, PAGO)).not.toHaveAttribute('data-fase', /.*/);
  await expect(beneficio(menu, RECADOS)).toHaveAttribute('data-fase', 'sigue');
  await expect(beneficio(menu, RECADOS).locator('.mv__barra [data-mv-dura]')).toHaveText('0:07');
  await expect(video(menu)).toHaveCount(1);
});

test('la barra del mini video pausa, reanuda donde iba y, al terminar, lo repite', async ({ page }) => {
  const menu = await abrir(page);
  await llegarA(boton(menu, AGENDA));
  await boton(menu, AGENDA).click();
  await quietaLaPagina(page);
  const barra = video(menu).getByRole('button');
  await expect(barra).toHaveAccessibleName('Pausar');
  await expect(menu).toHaveAttribute('data-anda', '');
  // El boton se toca con el dedo: 44 por 44.
  const caja = await barra.boundingBox();
  expect(caja?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Pausar lo detiene todo: la linea de avance y cada pieza de la escena.
  await barra.click();
  await expect(barra).toHaveAccessibleName('Reproducir');
  await expect(menu).not.toHaveAttribute('data-anda', /.*/);
  // Se le da un instante a que el navegador asiente donde se detuvo.
  await page.waitForTimeout(300);
  const enPausa = await marcha(menu);
  expect(enPausa).toMatchObject({ anda: false, fase: 'sigue', corriendo: 0 });
  expect(enPausa.detenidas).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect((await marcha(menu)).va).toBeCloseTo(enPausa.va, 2);
  // El dibujo del boton es el de lo que hace: de sus tres, se ve uno.
  const dibujos = () =>
    barra
      .locator('svg')
      .evaluateAll((lista) =>
        lista.filter((dibujo) => getComputedStyle(dibujo).visibility === 'visible').map((dibujo) => dibujo.dataset.de),
      );
  expect(await dibujos()).toEqual(['reproducir']);

  // En pausa la escena se puede adelantar a mano: cada pieza aparece a su tiempo, en su orden, y dos se van.
  const escenaEn = (/** @type {number} */ ms) =>
    menu.evaluate((raiz, tiempo) => {
      for (const animacion of raiz.getAnimations({ subtree: true })) {
        if (animacion instanceof CSSAnimation) animacion.currentTime = tiempo;
      }
      return [...raiz.querySelectorAll('.beneficio[data-abierto] .mv__paso')].map(
        (paso) => Math.round(Number(getComputedStyle(paso).opacity) * 10) / 10,
      );
    }, ms);
  const pasos = HACE[AGENDA - 1]?.pasos ?? [];
  expect(pasos.map((paso) => paso.en)).toEqual([0.3, 1.2, 2.8, 4.7, 6.4]);
  expect(await escenaEn(100)).toEqual([0, 0, 0, 0, 0]);
  expect(await escenaEn(1000)).toEqual([1, 0, 0, 0, 0]);
  expect(await escenaEn(2500)).toEqual([1, 1, 0, 0, 0]);
  expect(await escenaEn(4000)).toEqual([1, 1, 1, 0, 0]);
  // El agente ofrecio, ella eligio, y sus dos globos se van: queda el pago.
  expect(await escenaEn(5400)).toEqual([1, 0, 0, 1, 0]);
  // Antes de agendarse el horario dice que esta libre; despues, de quien es, y cae el sello.
  const horario = () =>
    menu.evaluate((raiz) => {
      const renglon = /** @type {Element} */ (raiz.querySelector('.beneficio[data-abierto] [data-nueva]'));
      const se = (/** @type {string} */ que) =>
        Number(getComputedStyle(/** @type {Element} */ (renglon.querySelector(que))).opacity) > 0.5;
      return { antes: se('.mv__antes'), luego: se('.mv__luego'), sello: se('.sello') };
    });
  expect(await horario()).toEqual({ antes: true, luego: false, sello: false });
  expect(await escenaEn(7600)).toEqual([1, 0, 0, 1, 1]);
  expect(await horario()).toEqual({ antes: false, luego: true, sello: true });

  // Reanudar sigue donde iba: no regresa al principio.
  await escenaEn(3000);
  await barra.click();
  await expect(barra).toHaveAccessibleName('Pausar');
  await expect(menu).toHaveAttribute('data-anda', '');
  expect(await dibujos()).toEqual(['pausar']);
  await expect.poll(async () => (await marcha(menu)).va).toBeGreaterThan(3000 / 8000);
  expect((await marcha(menu)).detenidas).toBe(0);

  // Al terminar se queda en el ultimo cuadro y el boton ofrece verlo de nuevo.
  await alFinal(menu);
  await expect(barra).toHaveAccessibleName('Ver de nuevo');
  expect(await dibujos()).toEqual(['verDeNuevo']);
  expect(await marcha(menu)).toMatchObject({ anda: false, fase: 'fin', corriendo: 0, detenidas: 0 });
  expect(await pasosALaVista(menu)).toEqual([1, 0, 0, 1, 1]);
  await expect(video(menu).locator('.sello')).toBeVisible();
  await barra.click();
  await expect(barra).toHaveAccessibleName('Pausar');
  await expect(beneficio(menu, AGENDA)).toHaveAttribute('data-fase', 'sigue');
  const repetido = await marcha(menu);
  expect(repetido.anda).toBe(true);
  expect(repetido.va).toBeLessThan(0.5);
});

test('el mini video solo corre mientras se ve: si la visitante se va, espera donde iba', async ({ page }) => {
  const menu = await abrir(page);
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  await expect.poll(async () => (await marcha(menu)).va).toBeGreaterThan(0.04);
  // Se va al principio de la pagina: se detiene sin que nadie lo pause (su boton sigue diciendo "Pausar").
  await page.evaluate(() => scrollTo(0, 0));
  await expect(menu).not.toHaveAttribute('data-anda', /.*/);
  // Se le da un instante a que el navegador asiente donde se detuvo.
  await page.waitForTimeout(300);
  const lejos = await marcha(menu);
  expect(lejos).toMatchObject({ anda: false, fase: 'sigue', corriendo: 0 });
  expect(lejos.detenidas).toBeGreaterThan(0);
  await expect(menu.locator('[data-mv-pausa]')).toHaveAttribute('aria-label', 'Pausar');
  await page.waitForTimeout(400);
  expect((await marcha(menu)).va).toBeCloseTo(lejos.va, 2);
  // Al regresar sigue donde iba.
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  await expect.poll(async () => (await marcha(menu)).va).toBeGreaterThan(lejos.va);
  expect((await marcha(menu)).detenidas).toBe(0);
});

test('en celular es un acordeon: lo elegido se abre ahi mismo y el renglon tocado no se mueve del dedo', async ({
  page,
}) => {
  // Con menos movimiento la pagina no baja sola a ensenar lo abierto: asi se mide solo que nada brinque.
  const menu = await abrir(page, { quieta: true });
  test.skip(await esComputadora(page), 'en computadora el menu lleva su escenario a un lado');
  /** @param {number} numero */
  const tope = (numero) => boton(menu, numero).evaluate((el) => el.getBoundingClientRect().top);
  // Con el primero abierto, se toca el quinto: el panel del primero, que queda arriba, se cierra de golpe.
  await llegarA(boton(menu, 5));
  const antes = await tope(5);
  await boton(menu, 5).click();
  await expect(boton(menu, 5)).toHaveAttribute('aria-expanded', 'true');
  expect(Math.abs((await tope(5)) - antes)).toBeLessThanOrEqual(1);
  await expect(boton(menu, 5)).toBeInViewport({ ratio: 1 });
  // Su oracion y su mini video quedan debajo de su renglon, dentro de el, antes del renglon siguiente.
  const cajas = await beneficio(menu, 5).evaluate((li) => {
    const caja = (/** @type {string} */ que) => /** @type {Element} */ (li.querySelector(que)).getBoundingClientRect();
    const siguiente = /** @type {Element} */ (li.nextElementSibling).getBoundingClientRect();
    return {
      boton: caja('button').bottom,
      oracion: [caja('.beneficio__texto').top, caja('.beneficio__texto').bottom],
      video: [caja('.mv').top, caja('.mv').bottom, caja('.mv').height],
      siguiente: siguiente.top,
    };
  });
  expect(cajas.oracion[0]).toBeGreaterThanOrEqual(cajas.boton - 1);
  expect(cajas.video[0]).toBeGreaterThanOrEqual((cajas.oracion[1] ?? 0) - 1);
  expect(cajas.siguiente).toBeGreaterThanOrEqual((cajas.video[1] ?? 0) - 1);
  expect(cajas.video[2]).toBeGreaterThan(280);
  // El anterior ya no ocupa lugar.
  await expect(beneficio(menu, 1).locator('.beneficio__panel')).toBeHidden();
  // Y al reves, uno de arriba con el de abajo abierto: tampoco se mueve.
  await llegarA(boton(menu, 2));
  const arriba = await tope(2);
  await boton(menu, 2).click();
  await expect(boton(menu, 2)).toHaveAttribute('aria-expanded', 'true');
  expect(Math.abs((await tope(2)) - arriba)).toBeLessThanOrEqual(1);
});

test('en celular, si lo que se abre no cabe, la pagina baja con suavidad a ensenarlo sin esconder su renglon', async ({
  page,
}) => {
  const menu = await abrir(page);
  test.skip(await esComputadora(page), 'en computadora el escenario ya esta a la vista');
  // El ultimo renglon, pegado al fondo de la pantalla: lo suyo se abriria debajo, donde no se ve.
  await boton(menu, CUANTOS).evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await quietaLaPagina(page);
  await boton(menu, CUANTOS).evaluate((el) => /** @type {HTMLElement} */ (el).click());
  await expect(boton(menu, CUANTOS)).toHaveAttribute('aria-expanded', 'true');
  await quietaLaPagina(page);
  // Su mini video quedo a la vista y corre; su renglon sigue en la pantalla, debajo de la barra de arriba.
  await expect(beneficio(menu, CUANTOS).locator('.mv')).toBeInViewport({ ratio: 0.9 });
  await expect(boton(menu, CUANTOS)).toBeInViewport({ ratio: 1 });
  const { renglon, barra } = await page.evaluate(() => ({
    renglon: /** @type {Element} */ (document.querySelector('.beneficio[data-abierto] button')).getBoundingClientRect()
      .top,
    barra: /** @type {Element} */ (document.querySelector('[data-barra]')).getBoundingClientRect().bottom,
  }));
  expect(renglon).toBeGreaterThanOrEqual(barra - 1);
  await expect(menu).toHaveAttribute('data-anda', '');
});

test('en computadora el menu va a la izquierda y un solo escenario a la derecha, que no se mueve ni cambia de alto', async ({
  page,
}) => {
  const menu = await abrir(page);
  test.skip(!(await esComputadora(page)), 'en celular el menu es un acordeon');
  await llegarA(menu);
  /** Donde esta cada cosa en la pagina (no en la pantalla). */
  const medidas = () =>
    page.evaluate(() => {
      const caja = (/** @type {string} */ que) => {
        const { left, top, width, height } = /** @type {Element} */ (
          document.querySelector(que)
        ).getBoundingClientRect();
        return [left + scrollX, top + scrollY, width, height].map((medida) => Math.round(medida));
      };
      return {
        escenario: caja('.beneficio[data-abierto] .mv'),
        lista: caja('.beneficios'),
        debajo: caja('.agentes__confianza'),
        primero: caja('.beneficio:first-child button'),
        seccion: caja('#agente')[3],
      };
    });
  await asentado(page);
  const inicial = await medidas();
  // El escenario, a la derecha del menu y de 500 de alto.
  expect(inicial.escenario[0]).toBeGreaterThan((inicial.lista[0] ?? 0) + (inicial.lista[2] ?? 0));
  expect(inicial.escenario[3]).toBe(500);
  expect(inicial.escenario[2]).toBeGreaterThan(360);
  // Y a la altura del menu: empieza un poco debajo de su primer renglon y termina antes que el.
  const [, topeDelEscenario = 0, , altoDelEscenario = 0] = inicial.escenario;
  const [, topeDelMenu = 0, , altoDelMenu = 0] = inicial.lista;
  expect(topeDelEscenario - topeDelMenu).toBeGreaterThanOrEqual(0);
  expect(topeDelEscenario - topeDelMenu).toBeLessThanOrEqual(80);
  expect(topeDelEscenario + altoDelEscenario).toBeLessThanOrEqual(topeDelMenu + altoDelMenu);
  for (let numero = 2; numero <= CUANTOS; numero++) {
    await boton(menu, numero).click();
    await expect(boton(menu, numero)).toHaveAttribute('aria-expanded', 'true');
    await asentado(page);
    // El escenario es el mismo, en el mismo lugar; el menu mide lo mismo y lo de abajo no brinco.
    mismasMedidas(await medidas(), inicial, TITULOS[numero - 1]);
    await expect(video(menu)).toHaveCount(1);
    await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText([ORACIONES[numero - 1] ?? '']);
  }
  // Su oracion va debajo de su renglon, a la izquierda; su mini video, en el escenario.
  const ultimo = await beneficio(menu, CUANTOS).evaluate((li) => {
    const caja = (/** @type {string} */ que) => /** @type {Element} */ (li.querySelector(que)).getBoundingClientRect();
    return {
      oracion: caja('.beneficio__texto').top - caja('button').bottom,
      aUnLado: caja('.mv').left - caja('.beneficio__texto').right,
    };
  });
  expect(ultimo.oracion).toBeGreaterThanOrEqual(-1);
  expect(ultimo.oracion).toBeLessThan(4);
  expect(ultimo.aUnLado).toBeGreaterThan(20);
});

test('todo el menu se maneja con el teclado, se ve donde esta el foco y nunca se pierde', async ({ page }) => {
  const menu = await abrir(page);
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  // Con el tabulador: el primer renglon, el boton de su mini video y el renglon siguiente.
  await boton(menu, 1).focus();
  await page.keyboard.press('Tab');
  const barra = video(menu).getByRole('button');
  await expect(barra).toBeFocused();
  await expect(barra).toHaveCSS('outline-style', 'solid');
  // La barra, con Espacio y con Enter: pausa y reanuda, y el foco se queda en ella.
  await page.keyboard.press('Space');
  await expect(barra).toHaveAccessibleName('Reproducir');
  await expect(barra).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(barra).toHaveAccessibleName('Pausar');
  await expect(barra).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(boton(menu, 2)).toBeFocused();
  await expect(boton(menu, 2)).toHaveCSS('outline-style', 'solid');
  // Abrir con Enter: el foco se queda en el renglon que se abrio, aunque el anterior se cierre y todo cambie de lugar.
  await page.keyboard.press('Enter');
  await expect(boton(menu, 2)).toHaveAttribute('aria-expanded', 'true');
  await expect(boton(menu, 1)).toHaveAttribute('aria-expanded', 'false');
  await expect(boton(menu, 2)).toBeFocused();
  await expect(boton(menu, 2)).toBeInViewport();
  // La barra se mudo a su mini video: es lo que sigue con el tabulador, y de ahi, el tercer renglon.
  await page.keyboard.press('Tab');
  await expect(beneficio(menu, 2).locator('[data-mv-pausa]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(boton(menu, 3)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(boton(menu, 3)).toHaveAttribute('aria-expanded', 'true');
  await expect(boton(menu, 3)).toBeFocused();
  // Hacia atras: el segundo renglon, ya cerrado, sin su barra en medio.
  await page.keyboard.press('Shift+Tab');
  await expect(boton(menu, 2)).toBeFocused();
  // Al terminar el mini video con el foco en su barra, el foco sigue ahi y el boton ya dice otra cosa.
  await beneficio(menu, 3).locator('[data-mv-pausa]').focus();
  await alFinal(menu);
  await expect(beneficio(menu, 3).locator('[data-mv-pausa]')).toHaveAccessibleName('Ver de nuevo');
  await expect(beneficio(menu, 3).locator('[data-mv-pausa]')).toBeFocused();
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test('los nueve beneficios: cada uno abre su oracion y su escena, con lo que dicen los datos', async ({ page }) => {
  // Con menos movimiento cada escena se pinta completa de una vez: se revisa su ultimo cuadro.
  const menu = await abrir(page, { quieta: true });
  /** Lo que cada escena ensena al final, y lo que ya se fue. */
  const ESCENAS = [
    {
      // La base de conocimiento del negocio de ejemplo y una respuesta que solo ese negocio daria.
      queda: [
        'Base de conocimiento',
        'Studio Bella · solo de este negocio',
        'Servicios y precios',
        'Gelish $350 · Acrílicas $480',
        'Horarios',
        'Martes a sábado, 10 am a 7 pm',
        'Políticas',
        'Anticipo $150 · Retoque sin costo 3 días',
        '¿Y si se me levanta el gelish?',
        'Si se levanta en los primeros 3 días, el retoque no tiene costo. Mándame una foto y te agendo.',
        'Lo sabe porque es la política de tu negocio',
      ],
      seFue: [],
    },
    {
      queda: ['Jueves · 11:48 p. m.', 'Hola, ¿tienes lugar el sábado?', 'Contestó en menos de un minuto'],
      seFue: [],
    },
    {
      queda: [
        'Tu Google Calendar · Sábado',
        '11:00 am · Libre',
        '1:00 pm · Ocupado',
        '4:30 pm ·',
        'Pago aprobado · $150',
      ],
      seFue: ['Te puedo ofrecer el sábado a las 11:00 am o 4:30 pm. ¿Cuál te acomoda?', 'A las 4:30 pm, por favor.'],
    },
    {
      queda: [
        'Anticipo Consulta',
        '$300',
        'mercadopago.com.mx',
        'Pago aprobado · $300',
        '10:00 am · Elvira',
        'Consulta',
      ],
      seFue: ['Sí, aparte el jueves a las 10, por favor.'],
    },
    {
      queda: [
        '0:09',
        'Escuchó: «Doctor, se me cayó una amalgama. ¿Me podría atender hoy?»',
        'Buenas tardes, señor Medina.',
      ],
      seFue: [],
    },
    {
      queda: ['¿Cuánto por este diseño?', 'Vio la foto: francesas con decorado', 'Queda en $420. ¿Te aparto lugar?'],
      seFue: [],
    },
    { queda: ['De tú', 'De usted', 'Buenas tardes, ¿me podría dar una cita?', '¿Se lo aparto?'], seFue: [] },
    {
      queda: [
        '¿Me haces un descuento si voy con mi hermana?',
        'Eso lo decide Bella. Ya le dejé tu recado.',
        'Tu WhatsApp personal',
        'Ana te dejó un recado en el WhatsApp de Studio Bella y espera que le escribas.',
      ],
      seFue: [],
    },
    { queda: ['Examen 1', 'Examen 2', 'Examen 3', 'Cero errores graves', 'Listo para atender'], seFue: [] },
  ];
  for (const [lugar, { queda, seFue }] of ESCENAS.entries()) {
    const numero = lugar + 1;
    await llegarA(boton(menu, numero));
    if (numero > 1) await boton(menu, numero).click();
    await expect(boton(menu, numero)).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText([ORACIONES[lugar] ?? '']);
    const escena = video(menu).locator('.mv__escena');
    await expect(escena).toHaveCount(1);
    await expect(escena).toHaveAttribute('aria-hidden', 'true');
    for (const texto of queda) await expect(escena.getByText(texto, { exact: false }).first()).toBeVisible();
    for (const texto of seFue) await expect(escena.getByText(texto, { exact: true })).toBeHidden();
    // Cada pieza del ultimo cuadro se ve entera.
    expect(new Set(await pasosALaVista(menu)), TITULOS[lugar]).toEqual(new Set(seFue.length > 0 ? [0, 1] : [1]));
  }
  // Dentro de las escenas la letra es la del sistema y los colores, los del WhatsApp de dia; la insignia, la de la pagina.
  await boton(menu, 1).click();
  const escena = video(menu);
  expect(await escena.locator('.wa__m--sale').evaluate((globo) => getComputedStyle(globo).fontFamily)).toMatch(
    /^system-ui/,
  );
  await expect(escena.locator('.wa__m--sale')).toHaveCSS('background-color', 'rgb(217, 253, 211)');
  await expect(escena.locator('.wa__m--entra')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(escena).toHaveCSS('background-color', 'rgb(239, 233, 224)');
  expect(await escena.locator('.mv__hizo').evaluate((insignia) => getComputedStyle(insignia).fontFamily)).toMatch(
    /Outfit/,
  );
  // El horario agendado dice de quien es y lleva el sello; la cita del anticipo, tambien.
  await boton(menu, AGENDA).click();
  await expect(video(menu).locator('[data-nueva]')).toContainText('4:30 pm ·');
  await expect(video(menu).locator('[data-nueva] .mv__luego')).toHaveText('Ana');
  await expect(video(menu).locator('[data-nueva] .mv__luego')).toBeVisible();
  await expect(video(menu).locator('[data-nueva] .mv__antes')).toHaveCSS('opacity', '0');
  await expect(video(menu).locator('[data-nueva] .sello')).toBeVisible();
  await boton(menu, PAGO).click();
  await expect(video(menu).locator('.minicita .sello')).toBeVisible();
  // La foto de referencia llega cuando hace falta, y es la que ya estaba en la pagina.
  await boton(menu, FOTO).click();
  const foto = video(menu).locator('img');
  await expect(foto).toHaveAttribute('src', /\/comercial\/referencia-unas\.webp$/);
  await expect(foto).toHaveAttribute('alt', '');
  await expect.poll(() => foto.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBe(336);
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test('con movimiento reducido nada corre solo ni hay transiciones: cada beneficio es su ultimo cuadro, sin barra', async ({
  page,
}) => {
  const fallas = vigilar(page);
  const menu = await abrir(page, { quieta: true });
  /** Nada se mueve ni esta por moverse en toda la seccion. */
  const quieto = async () => {
    expect(await page.evaluate(() => document.querySelector('#agente')?.getAnimations({ subtree: true }).length)).toBe(
      0,
    );
    expect(await marcha(menu)).toEqual({ anda: false, fase: 'fin', corriendo: 0, detenidas: 0, va: -1 });
  };
  // El primero ya esta completo antes de que nadie llegue, y llegar no lo echa a andar.
  await quieto();
  expect(await pasosALaVista(menu)).toEqual([1, 1, 1, 1]);
  await llegarA(video(menu));
  await expect(video(menu)).toBeInViewport();
  await page.waitForTimeout(300);
  await quieto();
  // Sin barra de avance: no hay nada que pausar ni que repetir, y no queda un boton muerto.
  await expect(menu.locator('.mv__barra')).toBeHidden();
  await expect(video(menu).getByRole('button')).toHaveCount(0);
  // Al elegir otro se pinta de golpe su ultimo cuadro.
  for (const numero of [VOZ, EXAMEN, AGENDA]) {
    await llegarA(boton(menu, numero));
    await boton(menu, numero).click();
    await expect(boton(menu, numero)).toHaveAttribute('aria-expanded', 'true');
    await quieto();
    expect(new Set(await pasosALaVista(menu))).toEqual(new Set(numero === AGENDA ? [0, 1] : [1]));
    await expect(video(menu)).toHaveCount(1);
    await expect(menu.locator('.mv__barra')).toBeHidden();
  }
  // El examen, ya pasado: sus tres barras llenas y sus tres palomitas.
  await boton(menu, EXAMEN).click();
  const llenas = await video(menu)
    .locator('.mv__raya')
    .evaluateAll((rayas) =>
      rayas.map((raya) =>
        Math.round(
          (100 * /** @type {Element} */ (raya.firstElementChild).getBoundingClientRect().width) /
            raya.getBoundingClientRect().width,
        ),
      ),
    );
  expect(llenas).toEqual([100, 100, 100]);
  await expect(video(menu).locator('.mv__bien').filter({ visible: true })).toHaveCount(3);
  await sinFaltasDeAccesibilidad(page, '#agente');
  expect(fallas).toEqual([]);
});

test('el menu llega con su aspecto de menu: cuando su pieza lo despierta, nada cambia de lugar', async ({ page }) => {
  // La pieza del menu llega tarde, como con una red lenta: mientras, la pagina ya esta a la vista.
  /** @type {(valor?: unknown) => void} */
  let soltar = () => undefined;
  const espera = new Promise((listo) => {
    soltar = listo;
  });
  await page.route('**/js/agente-vista.js', async (ruta) => {
    await espera;
    await ruta.continue();
  });
  await page.goto('./');
  const menu = page.locator('[data-agente]');
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await llegarA(menu);
  const aspecto = () =>
    menu.evaluate((raiz) => ({
      renglones: [...raiz.querySelectorAll('.beneficio__boton')].map((renglon) => {
        const { left, top, width, height } = renglon.getBoundingClientRect();
        return [left, top + scrollY, width, height].map((medida) => Math.round(medida));
      }),
      oraciones: [...raiz.querySelectorAll('.beneficio__texto')].filter(
        (oracion) => getComputedStyle(oracion).visibility === 'visible' && oracion.getBoundingClientRect().height > 0,
      ).length,
      video: [...raiz.querySelectorAll('.mv')]
        .filter((uno) => uno.getBoundingClientRect().height > 0)
        .map((uno) => {
          const { left, top, width, height } = uno.getBoundingClientRect();
          return [left, top + scrollY, width, height].map((medida) => Math.round(medida));
        }),
      circulo: getComputedStyle(/** @type {Element} */ (raiz.querySelector('.beneficio__play'))).backgroundColor,
    }));
  // Todavia no vive: no hay botones. Pero ya se ve como menu, con el primero abierto y su escenario puesto.
  await expect(menu).not.toHaveAttribute('data-viva', /.*/);
  await expect(menu.locator('button')).toHaveCount(0);
  const dormido = await aspecto();
  expect(dormido.renglones).toHaveLength(CUANTOS);
  expect(dormido.oraciones).toBe(1);
  expect(dormido.video).toHaveLength(1);
  expect(dormido.circulo).toBe('rgb(63, 92, 245)');
  // Llega la pieza: los renglones se vuelven botones y todo sigue exactamente donde estaba.
  soltar();
  await expect(menu).toHaveAttribute('data-viva', '');
  await expect(menu.locator('button.beneficio__boton')).toHaveCount(CUANTOS);
  const despierto = await aspecto();
  expect([despierto.oraciones, despierto.video.length, despierto.circulo]).toEqual([1, 1, dormido.circulo]);
  mismasMedidas(
    { renglones: despierto.renglones, video: despierto.video },
    { renglones: dormido.renglones, video: dormido.video },
  );
});

test('si la pieza del menu no llega, la seccion se lee como lista y lo demas sigue vivo', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('pagina:montada', () => {
      /** @type {any} */ (window).__montada = true;
    });
  });
  await page.route('**/js/agente-vista.js', (ruta) => ruta.abort());
  await page.goto('./');
  await page.waitForFunction(() => /** @type {any} */ (window).__montada === true);
  const menu = page.locator('[data-agente]');
  await expect(menu).toHaveAttribute('data-lista', '');
  await expect(menu).not.toHaveAttribute('data-viva', /.*/);
  await llegarA(menu);
  // Los nueve beneficios con su titulo y su oracion a la vista; ni botones muertos ni escenarios vacios.
  await expect(menu.getByRole('heading', { level: 3 })).toHaveText(TITULOS);
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText(ORACIONES);
  await expect(menu.getByRole('button')).toHaveCount(0);
  await expect(menu.locator('.mv').filter({ visible: true })).toHaveCount(0);
  await expect(menu.locator('.beneficio__play').filter({ visible: true })).toHaveCount(0);
  // Lo demas de la pagina no se entera.
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-calculadora]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('html')).toHaveClass(/con-js/);
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test('en una pantalla muy bajita (mucho zoom) el primer mini video tambien arranca: le basta con asomar', async ({
  page,
}) => {
  // Como una laptop con zoom de 400 % o mas: la quinta parte del mini video ya no cabe en media pantalla.
  await page.setViewportSize({ width: 320, height: 120 });
  const menu = await abrir(page);
  expect(await marcha(menu)).toMatchObject({ anda: false, fase: 'espera' });
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  await expect.poll(async () => (await marcha(menu)).corriendo).toBeGreaterThan(0);
});

test('al imprimir o guardar en PDF la seccion sale completa: los nueve beneficios con su oracion, nada vacio', async ({
  page,
}) => {
  const menu = await abrir(page);
  // En pantalla solo se lee la oracion del abierto.
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText(ORACIONES);
  await expect(menu.locator('.beneficio__boton').filter({ visible: true })).toHaveText(TITULOS);
  // En papel no hay nada que reproducir: ni escenarios ni circulos.
  await expect(menu.locator('.mv').filter({ visible: true })).toHaveCount(0);
  await expect(menu.locator('.beneficio__play').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('#agente .agentes__cuidamos li').filter({ visible: true })).toHaveCount(3);
  await expect(page.locator('#agente .agentes__no li').filter({ visible: true })).toHaveCount(6);
});

test('debajo: tu numero, tu dinero y tus reglas en tres tarjetas con icono, y lo que tu agente no hace', async ({
  page,
}) => {
  await abrir(page, { quieta: true });
  const seccion = page.locator('#agente');
  await seccion.locator('.agentes__confianza').scrollIntoViewIfNeeded();
  await expect(seccion.getByRole('heading', { name: 'Tu número, tu dinero, tus reglas.' })).toBeVisible();
  const tarjetas = seccion.locator('.agentes__cuidamos > li');
  await expect(tarjetas.getByRole('heading', { level: 4 })).toHaveText([
    'Tu número sigue en tu celular',
    'Tu dinero no pasa por nosotros',
    'Tus reglas',
  ]);
  await expect(tarjetas.locator('p')).toHaveText([
    'Puedes entrar a cualquier conversación cuando quieras; tu agente se hace a un lado.',
    'Cada anticipo cae directo en tu Mercado Pago. No cobramos comisión por cita.',
    'Tú pones los precios, los horarios, el anticipo y lo que no haces.',
  ]);
  // Cada icono es de adorno, mide lo mismo y de verdad se dibuja: su figura existe en la pagina.
  const iconos = await tarjetas.locator('svg').evaluateAll((lista) =>
    lista.map((icono) => {
      const figura = /** @type {Element} */ (icono.querySelector('use'));
      const { width, height } = icono.getBoundingClientRect();
      return {
        adorno: icono.getAttribute('aria-hidden'),
        cual: figura.getAttribute('href'),
        existe: document.querySelector(figura.getAttribute('href') ?? 'nada') instanceof SVGSymbolElement,
        lado: [Math.round(width), Math.round(height)],
      };
    }),
  );
  expect(iconos).toEqual(
    ['#i-celular', '#i-moneda', '#i-perillas'].map((cual) => ({ adorno: 'true', cual, existe: true, lado: [46, 46] })),
  );
  // En fila donde caben las tres; si no, una debajo de otra.
  const cajas = await tarjetas.evaluateAll((lista) => lista.map((tarjeta) => tarjeta.getBoundingClientRect().toJSON()));
  const filas = new Set(cajas.map(({ top }) => Math.round(top))).size;
  expect(filas).toBe((await esComputadora(page)) ? 1 : 3);

  // Lo que no hace: seis renglones, cada uno con su tacha en rojo suave. Ya no ofrece pasarle a la clienta.
  const limites = seccion.locator('.agentes__limites');
  await limites.scrollIntoViewIfNeeded();
  await expect(limites.getByRole('heading', { level: 3 })).toHaveText('Lo que tu agente no hace');
  await expect(limites.getByRole('listitem')).toHaveText([
    'No confirma una cita sin su anticipo, salvo que tú lo decidas.',
    'No inventa precios: los toma de tu catálogo.',
    'No se hace pasar por una persona: avisa que es un asistente virtual.',
    'No cobra el resto del servicio. Solo el anticipo que garantiza la cita.',
    'No diagnostica ni recomienda medicamentos. Una urgencia te llega a ti.',
    'No te trae clientela nueva: atiende de maravilla a quien ya te escribe.',
  ]);
  await expect(limites).not.toContainText('te la pasa');
  await expect(limites).not.toContainText('si tu clienta lo pide');
  const tachas = limites.locator('svg.agentes__tacha');
  await expect(tachas).toHaveCount(6);
  await expect(tachas.first()).toHaveCSS('color', 'rgb(255, 143, 128)');
  await expect(tachas.first()).toHaveAttribute('aria-hidden', 'true');
  const columnas = new Set(
    await limites
      .getByRole('listitem')
      .evaluateAll((lista) => lista.map((renglon) => Math.round(renglon.getBoundingClientRect().left))),
  ).size;
  expect(columnas).toBe((await esComputadora(page)) ? 3 : 1);
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('los nueve beneficios se leen como lista, cada uno con su titulo y su oracion, sin botones ni escenarios', async ({
    page,
  }) => {
    await page.goto('./');
    const menu = page.locator('[data-agente]');
    await menu.scrollIntoViewIfNeeded();
    await expect(menu.locator('ol.beneficios > li')).toHaveCount(CUANTOS);
    await expect(menu.getByRole('heading', { level: 3 })).toHaveText(TITULOS);
    await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText(ORACIONES);
    // Cada oracion va debajo de su titulo.
    const pares = await menu.locator('.beneficio').evaluateAll((lista) =>
      lista.map((li) => {
        const titulo = /** @type {Element} */ (li.querySelector('h3')).getBoundingClientRect();
        const oracion = /** @type {Element} */ (li.querySelector('.beneficio__texto')).getBoundingClientRect();
        return oracion.top >= titulo.bottom - 1 && oracion.height > 10;
      }),
    );
    expect(pares).toEqual(Array(CUANTOS).fill(true));
    // Ni un boton (tampoco uno muerto), ni un circulo de reproducir, ni un escenario vacio.
    await expect(page.locator('#agente button')).toHaveCount(0);
    await expect(menu.locator('.beneficio__play').filter({ visible: true })).toHaveCount(0);
    await expect(menu.locator('.mv').filter({ visible: true })).toHaveCount(0);
    await expect(menu.locator('.mv__barra')).toHaveCount(0);
    // Y lo de abajo, igual que siempre.
    await expect(page.locator('#agente .agentes__cuidamos li')).toHaveCount(3);
    await expect(page.locator('#agente .agentes__no li')).toHaveCount(6);
    await expect(page.locator('#agente .agentes__no')).toContainText(
      'No se hace pasar por una persona: avisa que es un asistente virtual.',
    );
  });
});

for (const [ancho, alto] of TAMANOS) {
  test(`a ${ancho} de ancho nada de "Tu agente" se sale de la pantalla, cada escena cabe en su mini video y nada brinca`, async ({
    page,
  }) => {
    // Abre los nueve beneficios y mide cada pieza: con la maquina cargada se le da su tiempo.
    test.slow();
    await page.setViewportSize({ width: ancho, height: alto });
    const menu = await abrir(page, { quieta: true });
    const seccion = page.locator('#agente');
    const computadora = ancho >= 900;
    /**
     * Donde quedo, en la pagina, lo que no tiene por que moverse al cambiar de beneficio. En computadora, ademas, el
     * escenario y lo que sigue debajo del menu.
     */
    const fijos = () =>
      page.evaluate((conEscenario) => {
        const tope = (/** @type {string} */ que) =>
          Math.round(/** @type {Element} */ (document.querySelector(que)).getBoundingClientRect().top + scrollY);
        const quietos = { menu: tope('.beneficios'), primero: tope('.beneficio:first-child .beneficio__boton') };
        if (!conEscenario) return quietos;
        return { ...quietos, escenario: tope('.beneficio[data-abierto] .mv'), debajo: tope('.agentes__confianza') };
      }, computadora);
    // Se mide ya en la seccion: al dejar el inicio, la barra de arriba gana su raya y todo baja un punto.
    await llegarA(boton(menu, 1));
    const alPrincipio = await fijos();
    for (let numero = 1; numero <= CUANTOS; numero++) {
      const suBoton = boton(menu, numero);
      await llegarA(suBoton);
      const antes = await suBoton.evaluate((el) => el.getBoundingClientRect().top);
      if (numero > 1) await suBoton.click();
      await expect(suBoton).toHaveAttribute('aria-expanded', 'true');
      // En el acordeon el renglon tocado no se mueve de donde esta el dedo. Junto al escenario lo que no se mueve
      // es el escenario y lo de abajo: el renglon solo sube lo que media la oracion que se guardo arriba de el.
      const brinco = (await suBoton.evaluate((el) => el.getBoundingClientRect().top)) - antes;
      if (!computadora) expect(Math.abs(brinco), `${TITULOS[numero - 1]}: brinco`).toBeLessThanOrEqual(1);
      mismasMedidas(await fijos(), alPrincipio, TITULOS[numero - 1]);
      const fuera = await seccion.evaluate((raiz) => {
        const tope = document.documentElement.clientWidth;
        /** @type {string[]} */
        const salidos = [];
        for (const pieza of raiz.querySelectorAll('*')) {
          // Lo que vive dentro de un mini video lo recorta su pantalla: se revisa aparte, contra ella.
          if (pieza.closest('.mv__escena')) continue;
          const { left, right, width, height } = pieza.getBoundingClientRect();
          if (width === 0 || height === 0) continue;
          if (left < -0.5 || right > tope + 0.5)
            salidos.push(`${pieza.tagName.toLowerCase()}.${pieza.getAttribute('class')}`);
        }
        return { salidos, desborde: document.documentElement.scrollWidth - tope };
      });
      expect(fuera, TITULOS[numero - 1]).toEqual({ salidos: [], desborde: 0 });
      // La escena cabe en su pantalla: cada pieza del ultimo cuadro, entera, sin tocar las orillas ni quedar bajo
      // el lugar de la barra.
      const escena = await video(menu).evaluate((pantalla) => {
        const marco = pantalla.getBoundingClientRect();
        const piezas = [...pantalla.querySelectorAll('.mv__cabe > *, .sello')].filter(
          (pieza) => pieza.getBoundingClientRect().height > 0,
        );
        return {
          alto: Math.round(marco.height),
          piezas: piezas.length,
          salidas: piezas
            .filter((pieza) => {
              const caja = pieza.getBoundingClientRect();
              return (
                caja.left < marco.left + 4 ||
                caja.right > marco.right - 4 ||
                caja.top < marco.top + 4 ||
                caja.bottom > marco.bottom - 44
              );
            })
            .map((pieza) => `${pieza.tagName.toLowerCase()}.${pieza.getAttribute('class')}`),
        };
      });
      expect(escena.piezas, TITULOS[numero - 1]).toBeGreaterThanOrEqual(3);
      expect(escena.salidas, TITULOS[numero - 1]).toEqual([]);
      // El escenario no cambia de alto. En el acordeon todos los mini videos miden lo mismo, menos el de la base de
      // conocimiento: su ficha necesita una pantalla mas alta.
      expect(escena.alto, TITULOS[numero - 1]).toBe(computadora ? 500 : ALTO_EN_ACORDEON[numero - 1]);
    }
    // El sello no tapa el texto de la cita ni el del horario agendado.
    for (const [numero, texto] of /** @type {const} */ ([
      [PAGO, '.minicita__texto'],
      [AGENDA, '[data-nueva] .mv__luego'],
    ])) {
      await llegarA(boton(menu, numero));
      await boton(menu, numero).click();
      const hueco = await video(menu).evaluate(
        (pantalla, que) =>
          /** @type {Element} */ (pantalla.querySelector('.sello')).getBoundingClientRect().left -
          /** @type {Element} */ (pantalla.querySelector(que)).getBoundingClientRect().right,
        texto,
      );
      expect(hueco, texto).toBeGreaterThanOrEqual(-2);
    }
    // Ningun titulo del menu se encima con su vecino.
    const titulos = await menu
      .locator('.beneficio__boton')
      .evaluateAll((lista) => lista.map((renglon) => renglon.getBoundingClientRect().toJSON()));
    for (const [lugar, titulo] of titulos.entries()) {
      const anterior = titulos[lugar - 1];
      if (anterior) expect(titulo.top).toBeGreaterThanOrEqual(anterior.bottom);
    }
  });
}
