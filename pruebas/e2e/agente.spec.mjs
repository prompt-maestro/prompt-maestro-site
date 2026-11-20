// @ts-check
// "Tu agente": dos capitulos con el mismo menu. "Lo que hace", con nueve beneficios y sus mini videos (el primero
// cuenta una cita de principio a fin), y "Como empiezas", con cuatro pasos numerados. El primer renglon llega abierto
// y corre solo una vez al llegar a la vista; elegir otro cierra el anterior y corre el suyo; la barra pausa, reanuda y
// lo repite. En celular es un acordeon y en computadora, un menu con su escenario, que sube junto al titulo y se
// queda a la vista. Con movimiento reducido nada corre; sin JavaScript, o si su pieza no llega, se lee como lista.
import { readFileSync } from 'node:fs';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

/** @typedef {{ titulo: string, texto: string, dura: number, alta?: boolean, largo?: boolean, pasos: any[] }} Video */
/** @type {{ capitulos: { clave: string, nombre: string, cuenta?: string, sigue?: string, arranca?: string, videos: Video[] }[] }} */
const { capitulos: CAPITULOS } = JSON.parse(
  readFileSync(new URL('../../fuente/datos/agentes.json', import.meta.url), 'utf8'),
);
/** Los beneficios: los renglones de "Lo que hace", el capitulo que llega a la vista. */
const HACE = CAPITULOS.find(({ clave }) => clave === 'hace')?.videos ?? [];
/** Los pasos para contratarlo: los renglones de "Como empiezas". */
const EMPIEZA = CAPITULOS.find(({ clave }) => clave === 'empieza')?.videos ?? [];
const TITULOS = HACE.map(({ titulo }) => titulo);
const ORACIONES = HACE.map(({ texto }) => texto);
/** Los beneficios que hay. */
const CUANTOS = HACE.length;
/** Los titulos de los pasos como los trae la pagina: el numero de cada uno va escrito pegado, en su circulo. */
const TITULOS_DE_PASOS = EMPIEZA.map(({ titulo }, lugar) => `${lugar + 1}${titulo}`);
/** Como se llama cada capitulo, en su orden. */
const NOMBRES = CAPITULOS.map(({ nombre }) => nombre);
/** A donde lleva el boton de empezar. */
const ALTA = 'https://alta.prompt-maestro.com/';
/**
 * El lugar de un beneficio en el menu, del 1 en adelante, por su titulo: las pruebas no dependen del orden.
 * @param {string} titulo
 */
const numeroDe = (titulo) => TITULOS.indexOf(titulo) + 1;
const AGENDA = numeroDe('Maneja tu agenda por ti');
const PAGO = numeroDe('Asegura el pago antes de agendar');
const VOZ = numeroDe('Entiende notas de voz y contesta con voz');
const FOTO = numeroDe('Ve las imágenes de referencia que le mandan');
const RECADOS = numeroDe('Solo te contacta cuando se requiere tu intervención');
const BASE = numeroDe('Hecho a la medida de tu negocio');
const CAMBIOS = numeroDe('Cambias tus precios y horarios con un mensaje');
/** Lo alto de un mini video en el acordeon: el que trae una ficha grande o varios globos a la vez es mas alto. */
const ALTO_EN_ACORDEON = HACE.map(({ alta }) => (alta ? 452 : 340));
/** Lo que queda a la vista al terminar el mini video de la cita completa: solo las piezas de su ultimo momento. */
const ULTIMO_CUADRO_DE_LA_CITA = (HACE[0]?.pasos ?? []).map((paso) => (paso.hasta === undefined ? 1 : 0));
/** Los tamanos en que se revisa que nada se salga ni brinque: tres celulares o tabletas de pie y tres computadoras. */
const TAMANOS = /** @type {const} */ ([
  [360, 740],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
]);

/** El menu del capitulo que llega a la vista: "Lo que hace". */
const MENU = '#capitulo-hace';
/** El del otro capitulo, "Como empiezas", que llega guardado. */
const MENU_DE_PASOS = '#capitulo-empieza';

/**
 * Abre la pagina y espera a que la seccion quede viva: sus dos menus y el selector de capitulos.
 * @param {import('@playwright/test').Page} page
 * @param {{ quieta?: boolean }} [opciones]  quieta: la visitante pidio menos movimiento
 * @returns {Promise<import('@playwright/test').Locator>}  el menu de "Lo que hace"
 */
async function abrir(page, { quieta = false } = {}) {
  if (quieta) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const menu = page.locator(MENU);
  await expect(menu).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-capitulos]')).toHaveAttribute('data-viva', '');
  return menu;
}

/**
 * Lo alto del escenario en computadora: 600, o lo que quepa bajo la barra de la pagina en una pantalla bajita.
 * @param {import('@playwright/test').Page} page
 */
const altoDelEscenario = (page) => page.evaluate(() => Math.min(600, Math.max(440, innerHeight - 136)));

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
 * Lo que se sale de la pantalla por los lados dentro de una seccion, y cuanto se desborda la pagina a lo ancho.
 * @param {import('@playwright/test').Locator} seccion
 */
function salidosDe(seccion) {
  return seccion.evaluate((raiz) => {
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
}

/**
 * Si la escena cabe en su pantalla: lo alto del mini video, cuantas piezas trae su ultimo cuadro y cuales no se ven
 * enteras (tocan las orillas o quedan bajo el lugar de la barra).
 * @param {import('@playwright/test').Locator} pantallaDelVideo
 */
function escenaMedida(pantallaDelVideo) {
  return pantallaDelVideo.evaluate((pantalla) => {
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
  // Mide los nueve renglones y al final pasa el revisor de accesibilidad: con cinco navegadores a la vez, tarda.
  test.slow();
  const fallas = vigilar(page);
  const menu = await abrir(page);
  const seccion = page.locator('#agente');
  await expect(seccion.getByRole('heading', { level: 2 })).toHaveText('Atiende como tú lo harías. A cualquier hora.');
  // Una lista ordenada de nueve renglones: cada uno es un titulo que es, entero, un boton. El primero, el que llega
  // abierto, es el que cuenta una cita de principio a fin; el de la base de conocimiento va enseguida.
  expect([CUANTOS, TITULOS[0], TITULOS[1]]).toEqual([
    9,
    'Gestiona tus citas de principio a fin',
    'Hecho a la medida de tu negocio',
  ]);
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
  // Es el largo: la cita completa, en 28 segundos.
  await expect(video(menu).locator('[data-mv-dura]')).toHaveText('0:28');
  await expect.poll(async () => (await marcha(menu)).corriendo).toBeGreaterThan(0);
  // Empieza por el principio: el primer momento de la cita, con lo que escribe la clienta.
  // Y dice de quien es el celular que se ve.
  await expect(video(menu).getByText('Antes de la cita')).toBeVisible();
  await expect(video(menu).locator('.mv__de').first()).toHaveText('Lo ve tu clienta');
  await expect(
    video(menu).getByText('Hola, buenos días. ¿Cuánto cuesta el gelish? ¿Hay lugar el jueves?'),
  ).toBeVisible();
  // Corre hasta el final sin que nadie lo toque, y ahi se queda: su ultimo cuadro, el de despues de la cita. Lo de
  // los momentos anteriores ya se fue.
  await expect(beneficio(menu, 1)).not.toHaveAttribute('data-fase', /.*/, { timeout: 45_000 });
  await expect(barra).toHaveAccessibleName('Ver de nuevo');
  expect(await marcha(menu)).toEqual({ anda: false, fase: 'fin', corriendo: 0, detenidas: 0, va: 1 });
  expect(await pasosALaVista(menu)).toEqual(ULTIMO_CUADRO_DE_LA_CITA);
  await expect(video(menu)).toContainText('Cita garantizada, de principio a fin');
  await expect(video(menu).getByText('Antes de la cita')).toBeHidden();
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
  // Y corre: solo el, desde el principio. Se comprueba enseguida, antes que lo demas: el mini video dura 8 segundos y
  // con la maquina cargada podia terminar antes de que la prueba llegara a mirarlo.
  await expect(beneficio(menu, PAGO)).toHaveAttribute('data-fase', 'sigue');
  await expect(beneficio(menu, 1)).not.toHaveAttribute('data-fase', /.*/);
  await expect(menu.locator('.beneficio[data-fase]')).toHaveCount(1);
  await expect(menu).toHaveAttribute('data-anda', '');
  await expect.poll(async () => (await marcha(menu)).corriendo).toBeGreaterThan(0);
  await expect(beneficio(menu, PAGO).locator('.mv__barra').getByRole('button')).toHaveAccessibleName('Pausar');
  // Se pausa: lo que sigue se mira con el mini video detenido, sin que el reloj lo termine a media prueba.
  await beneficio(menu, PAGO).locator('.mv__barra').getByRole('button').click();
  await expect(menu).not.toHaveAttribute('data-anda', /.*/);
  expect(await marcha(menu)).toMatchObject({ anda: false, fase: 'sigue', corriendo: 0 });
  expect((await marcha(menu)).detenidas).toBeGreaterThan(0);
  // Se ve su oracion y se guarda la del anterior.
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText([ORACIONES[PAGO - 1] ?? '']);
  await expect(beneficio(menu, 1).locator('.beneficio__texto')).toBeHidden();
  // Un solo mini video a la vista: el suyo, con la unica barra, que dice lo que el dura.
  await expect(video(menu)).toHaveCount(1);
  await expect(beneficio(menu, PAGO).locator('.mv')).toBeVisible();
  await expect(beneficio(menu, 1).locator('.mv')).toBeHidden();
  await expect(menu.locator('.mv__barra')).toHaveCount(1);
  await expect(beneficio(menu, PAGO).locator('.mv__barra [data-mv-dura]')).toHaveText('0:08');
  // Su escena, que viajaba guardada, se saco al abrirlo: ya hay dos en la pagina, y cada pieza de la suya sabe a que
  // hora le toca entrar.
  await expect(menu.locator('.mv__escena')).toHaveCount(2);
  const tiempos = await beneficio(menu, PAGO)
    .locator('.mv__paso')
    .evaluateAll((pasos) => pasos.map((paso) => /** @type {HTMLElement} */ (paso).style.getPropertyValue('--mv-en')));
  expect(tiempos).toEqual((HACE[PAGO - 1]?.pasos ?? []).map((paso) => `${paso.en}s`));
  await quietaLaPagina(page);

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
  await expect(beneficio(menu, RECADOS).locator('.mv__barra [data-mv-dura]')).toHaveText('0:08');
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

  // En pausa la escena se puede adelantar a mano: cada pieza aparece a su tiempo, en su orden, y tres se van.
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
  expect(pasos.map((paso) => paso.en)).toEqual([0.2, 0.6, 2.2, 4.4, 4.7, 6.5]);
  expect(await escenaEn(100)).toEqual([0, 0, 0, 0, 0, 0]);
  // Primero lo que ve la clienta: su rotulo, la oferta del agente y lo que ella elige.
  expect(await escenaEn(1500)).toEqual([1, 1, 0, 0, 0, 0]);
  expect(await escenaEn(3200)).toEqual([1, 1, 1, 0, 0, 0]);
  // Lo de ella se va entero, y llega lo que ve la profesional: su rotulo y su calendario.
  expect(await escenaEn(5500)).toEqual([0, 0, 0, 1, 1, 0]);
  // Antes de agendarse el horario dice que esta libre; despues, de quien es, y cae el sello.
  const horario = () =>
    menu.evaluate((raiz) => {
      const renglon = /** @type {Element} */ (raiz.querySelector('.beneficio[data-abierto] [data-nueva]'));
      const se = (/** @type {string} */ que) =>
        Number(getComputedStyle(/** @type {Element} */ (renglon.querySelector(que))).opacity) > 0.5;
      return { antes: se('.mv__antes'), luego: se('.mv__luego'), sello: se('.sello') };
    });
  expect(await horario()).toEqual({ antes: true, luego: false, sello: false });
  expect(await escenaEn(7600)).toEqual([0, 0, 0, 1, 1, 1]);
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
  expect(await pasosALaVista(menu)).toEqual([0, 0, 0, 1, 1, 1]);
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

test('en computadora el menu va a la izquierda y un solo escenario a la derecha, que sube junto al titulo y no cambia de alto', async ({
  page,
}) => {
  // Abre los diez beneficios y, en cada uno, espera a que la pagina se asiente y mide: se le da su tiempo.
  test.slow();
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
      // El escenario se queda pegado bajo la barra de la pagina: de el se mide donde empieza a lo ancho y lo que
      // mide, no su lugar a lo alto de la pagina, que cambia al recorrerla.
      const [aLaIzquierda, , ancho, alto] = caja('.beneficio[data-abierto] .mv');
      return {
        escenario: [aLaIzquierda, ancho, alto],
        lista: caja('.beneficios'),
        debajo: caja('.agentes__confianza'),
        primero: caja('.beneficio:first-child button'),
        titulo: caja('.agentes__titulo'),
        seccion: caja('#agente')[3],
      };
    });
  await asentado(page);
  const inicial = await medidas();
  // El escenario, a la derecha del menu y del alto que le toca a esta pantalla.
  expect(inicial.escenario[0]).toBeGreaterThan((inicial.lista[0] ?? 0) + (inicial.lista[2] ?? 0));
  expect(inicial.escenario[2]).toBe(await altoDelEscenario(page));
  expect(inicial.escenario[1]).toBeGreaterThan(360);
  // El titulo, el selector de capitulos y el menu comparten la columna de la izquierda: ninguno se mete al escenario.
  for (const pieza of ['.agentes__titulo', '.capitulos', '.beneficios']) {
    const derecha = await page
      .locator(`#agente ${pieza}`)
      .first()
      .evaluate((el) => el.getBoundingClientRect().right);
    expect(derecha, pieza).toBeLessThan(inicial.escenario[0] ?? 0);
  }
  // Con la seccion recien llegada (su principio un poco debajo de la barra de la pagina), el escenario empieza donde
  // empieza ella, a la altura del titulo: sube junto a el, no espera al menu.
  await page
    .locator('#agente .agentes__principal')
    .evaluate((el) => scrollTo({ top: el.getBoundingClientRect().top + scrollY - 120, behavior: 'instant' }));
  const alLlegar = await page.evaluate(() => {
    const tope = (/** @type {string} */ que) =>
      /** @type {Element} */ (document.querySelector(que)).getBoundingClientRect().top;
    return { escenario: tope('.beneficio[data-abierto] .mv'), principal: tope('.agentes__principal') };
  });
  expect(Math.abs(alLlegar.escenario - alLlegar.principal)).toBeLessThanOrEqual(1);
  await llegarA(menu);
  for (let numero = 2; numero <= CUANTOS; numero++) {
    await boton(menu, numero).click();
    await expect(boton(menu, numero)).toHaveAttribute('aria-expanded', 'true');
    await asentado(page);
    await quietaLaPagina(page);
    // El escenario es el mismo y mide lo mismo; el menu mide lo mismo y lo de abajo no brinco.
    mismasMedidas(await medidas(), inicial, TITULOS[numero - 1]);
    // Y se ve entero, pegado bajo la barra de la pagina: tambien con los ultimos renglones, donde ya iba de salida.
    await expect(video(menu), TITULOS[numero - 1]).toBeInViewport({ ratio: 1 });
    expect((await video(menu).boundingBox())?.y ?? 0, TITULOS[numero - 1]).toBeGreaterThanOrEqual(64);
    await expect(boton(menu, numero), TITULOS[numero - 1]).toBeInViewport();
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
  // Con el tabulador: el primer renglon, el boton de su mini video, su linea de avance y el renglon siguiente.
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
  // Sigue la linea de avance: se ve donde esta el foco y dice que es.
  await page.keyboard.press('Tab');
  const linea = video(menu).getByRole('slider');
  await expect(linea).toBeFocused();
  await expect(linea).toHaveCSS('outline-style', 'solid');
  await expect(linea).toHaveAccessibleName('Avance del video');
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
  await expect(beneficio(menu, 2).getByRole('slider')).toBeFocused();
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
  /** Lo que cada escena ensena al final, lo que ya se fue y de quien es el celular que queda a la vista. */
  const ESCENAS = [
    {
      // La cita completa: queda su ultimo momento. Lo de antes de la cita, el pago y la pregunta de si llego, ya se fue.
      queda: [
        'Después de la cita',
        '¡Gracias por venir, Ana! Cuando guste, le agendo su siguiente cita.',
        'Cita garantizada, de principio a fin',
      ],
      seFue: [
        'Antes de la cita',
        'Hola, buenos días. ¿Cuánto cuesta el gelish? ¿Hay lugar el jueves?',
        'Pago aprobado · $150',
        '¿Asistió Ana a su cita de Gelish hoy a las 5:00 pm?',
      ],
      quien: 'Lo ve tu clienta',
    },
    {
      // Una respuesta que solo ese negocio daria, amable y de usted, y que el agente da solo. Su base de conocimiento
      // (lo que define la profesional) salio primero y ya se fue: en el celular de la clienta solo queda su conversacion.
      queda: [
        'Disculpe, ¿y si llego unos minutos tarde?',
        'No se preocupe, Ana. Tiene 15 minutos de tolerancia. Para no perder su lugar, le recomiendo llegar 5 minutos antes.',
        'Lo sabe porque es la política de tu negocio',
      ],
      seFue: [
        'Lo defines tú',
        'Base de conocimiento',
        'Studio Bella · solo de este negocio',
        'Anticipo $150 · Tolerancia de 15 minutos',
      ],
      quien: 'Lo ve tu clienta',
    },
    {
      // A cualquier hora: ella escribe en tres mensajes y el agente contesta una sola vez.
      queda: [
        'Jueves · 11:48 p. m.',
        'Buenas noches',
        'Me gustaría saber el precio del gelish',
        '¿Le gustaría agendar su cita?',
        'Esperó a que terminara de escribir y contestó todo junto',
      ],
      seFue: [],
      quien: 'Lo ve tu clienta',
    },
    {
      // La agenda: lo que vio ella ya se fue; queda el calendario de la profesional, con la cita puesta.
      queda: [
        'Tu Google Calendar · Sábado',
        '11:00 am · Libre',
        '1:00 pm · Ocupado',
        '4:30 pm ·',
        'Recordatorios: un día y una hora antes',
      ],
      seFue: [
        'Con mucho gusto. Para el sábado le puedo ofrecer 11:00 am o 4:30 pm. ¿Cuál le acomoda?',
        'A las 4:30 pm, por favor.',
      ],
      quien: 'Lo ves tú',
    },
    {
      queda: ['Pago aprobado · $300', '10:00 am · Elvira'],
      seFue: ['Sí, aparte el jueves a las 10, por favor.', 'Anticipo Consulta'],
      quien: 'Lo ves tú',
    },
    {
      // La nota de voz de ella y la del agente, cada una con lo que dijo.
      queda: [
        '0:07',
        'Escuchó: «Hola, ¿tendrá lugar mañana para un gelish?»',
        '0:09',
        'Mañana tengo lugar a las cinco en punto. ¿Se lo aparto?',
      ],
      seFue: [],
      quien: 'Lo ve tu clienta',
    },
    {
      queda: [
        '¿Cuánto por este diseño?',
        'Vio la foto: francesas con decorado',
        'quedan en $420. ¿Le aparto un lugar?',
      ],
      seFue: [],
      quien: 'Lo ve tu clienta',
    },
    {
      // Cuando hace falta la profesional: lo de la clienta ya se fue y queda el recado, en su WhatsApp personal.
      queda: [
        'Tu WhatsApp personal',
        'Ana te dejó un recado en el WhatsApp de Studio Bella: se le levantó el gelish que se hizo ayer y mandó una foto.',
        'Solo te busca cuando hace falta',
      ],
      seFue: [
        'Disculpe, se me levantó el gelish que me hice ayer.',
        'Lamento lo que pasó, Ana. Eso lo revisa Bella. Mándeme una foto, por favor, y con gusto le dejo su recado.',
      ],
      quien: 'Lo ves tú',
    },
    {
      // Los cambios, un ejemplo de cada uno: el del precio ya se fue y queda el del horario. Ella lo pide, el agente
      // dice que va a cambiar y pregunta; ella ya toco que si.
      queda: [
        'Cambio de horario',
        'El sábado solo atiendo hasta las 3 pm',
        'Bloqueo este sábado de 3:00 a 7:00 pm: en ese horario no agendo citas. ¿Lo aplico?',
        'Nada cambia sin tu sí',
      ],
      seFue: [
        'Cambio de precio',
        'Sube el gelish a $380',
        'Cambio el precio del gelish de $350 a $380. ¿Lo aplico?',
        'Precio actualizado',
      ],
      quien: 'Lo ves tú',
    },
  ];
  expect(ESCENAS).toHaveLength(CUANTOS);
  for (const [lugar, { queda, seFue, quien }] of ESCENAS.entries()) {
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
    // Y dice de quien es el celular que queda a la vista: uno solo.
    await expect(escena.locator('.mv__quien').filter({ visible: true }).locator('.mv__de')).toHaveText([quien]);
    // Cada pieza del ultimo cuadro se ve entera.
    expect(new Set(await pasosALaVista(menu)), TITULOS[lugar]).toEqual(new Set(seFue.length > 0 ? [0, 1] : [1]));
  }
  // Dentro de las escenas la letra es la del sistema y los colores, los del WhatsApp de dia; la insignia, la de la pagina.
  await boton(menu, BASE).click();
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
  expect(await pasosALaVista(menu)).toEqual(ULTIMO_CUADRO_DE_LA_CITA);
  await llegarA(video(menu));
  await expect(video(menu)).toBeInViewport();
  await page.waitForTimeout(300);
  await quieto();
  // Sin barra de avance: no hay nada que pausar ni que repetir, y no queda un boton muerto.
  await expect(menu.locator('.mv__barra')).toBeHidden();
  await expect(video(menu).getByRole('button')).toHaveCount(0);
  // Al elegir otro se pinta de golpe su ultimo cuadro.
  for (const numero of [VOZ, CAMBIOS, AGENDA]) {
    await llegarA(boton(menu, numero));
    await boton(menu, numero).click();
    await expect(boton(menu, numero)).toHaveAttribute('aria-expanded', 'true');
    await quieto();
    expect(new Set(await pasosALaVista(menu))).toEqual(new Set(numero === VOZ ? [1] : [0, 1]));
    await expect(video(menu)).toHaveCount(1);
    await expect(menu.locator('.mv__barra')).toBeHidden();
  }
  // Los cambios, ya contestados: de los dos botones de respuesta que quedan a la vista (los del horario; los del
  // precio ya se fueron), el que ella toco va en el azul de la marca.
  await boton(menu, CAMBIOS).click();
  const respuestas = video(menu).locator('.mv__botones').filter({ visible: true }).locator('span');
  await expect(respuestas).toHaveText(['Sí, aplícalo', 'No']);
  await expect(respuestas.first()).toHaveCSS('background-color', 'rgb(63, 92, 245)');
  await expect(respuestas.last()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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
  const menu = page.locator(MENU);
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
  const menu = page.locator(MENU);
  await expect(menu).toHaveAttribute('data-lista', '');
  await expect(menu).not.toHaveAttribute('data-viva', /.*/);
  await llegarA(menu);
  // Los diez beneficios con su titulo y su oracion a la vista; ni botones muertos ni escenarios vacios.
  await expect(menu.getByRole('heading', { level: 3 })).toHaveText([NOMBRES[0] ?? '', ...TITULOS]);
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText(ORACIONES);
  await expect(menu.getByRole('button')).toHaveCount(0);
  // Y el otro capitulo, que llegaba guardado, tambien se lee: sin selector, cada uno dice su nombre arriba de su lista.
  const pasos = page.locator(MENU_DE_PASOS);
  await expect(pasos).toHaveAttribute('data-lista', '');
  await expect(pasos.getByRole('heading', { level: 3 })).toHaveText([NOMBRES[1] ?? '', ...TITULOS_DE_PASOS]);
  await expect(pasos.locator('.beneficio__texto').filter({ visible: true })).toHaveText(
    EMPIEZA.map(({ texto }) => texto),
  );
  await expect(page.locator('#agente .capitulos')).toBeHidden();
  await expect(page.locator('#agente .agentes__capitulo').filter({ visible: true })).toHaveText(NOMBRES);
  await expect(page.locator('#agente .agentes__sigue')).toBeHidden();
  await expect(page.locator('#agente button')).toHaveCount(0);
  // El boton de empezar si se queda: es un enlace, y lleva al alta.
  await expect(pasos.getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
  await expect(menu.locator('.mv').filter({ visible: true })).toHaveCount(0);
  await expect(menu.locator('.beneficio__play').filter({ visible: true })).toHaveCount(0);
  // Lo demas de la pagina no se entera.
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-calculadora]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('html')).toHaveClass(/con-js/);
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test('si a un solo renglon le falta una pieza, la seccion ENTERA se lee como lista: ningun menu queda vivo a medias', async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.addEventListener('pagina:montada', () => {
      /** @type {any} */ (window).__montada = true;
    });
  });
  // La pieza del menu llega tarde; mientras, a un paso del capitulo guardado se le pierde su mini video.
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
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await page
    .locator(`${MENU_DE_PASOS} .beneficio`)
    .nth(2)
    .locator('[data-mv]')
    .evaluate((video) => video.removeAttribute('data-mv'));
  soltar();
  await page.waitForFunction(() => /** @type {any} */ (window).__montada === true);
  // Ni el menu que estaba completo desperto: los dos capitulos quedan como lista, sin un solo boton que no haga nada.
  const menu = page.locator(MENU);
  const pasos = page.locator(MENU_DE_PASOS);
  for (const uno of [menu, pasos]) {
    await expect(uno).toHaveAttribute('data-lista', '');
    await expect(uno).not.toHaveAttribute('data-viva', /.*/);
    await expect(uno).toBeVisible();
  }
  await expect(page.locator('#agente button')).toHaveCount(0);
  await expect(page.locator('#agente [role="tab"], #agente [role="tabpanel"], #agente [aria-expanded]')).toHaveCount(0);
  await expect(page.locator('#agente .capitulos')).toBeHidden();
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText(ORACIONES);
  await expect(pasos.locator('.beneficio__texto').filter({ visible: true })).toHaveText(
    EMPIEZA.map(({ texto }) => texto),
  );
  await expect(page.locator('#agente .mv').filter({ visible: true })).toHaveCount(0);
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test('si la pieza del menu llega cuando la seccion ya quedo como lista, asi se queda: nada brinca a media lectura', async ({
  page,
}) => {
  // La red va tan lenta que la pagina se canso de esperar la pieza (ocho segundos) y dejo la seccion como lista.
  /** @type {(valor?: unknown) => void} */
  let soltar = () => undefined;
  const espera = new Promise((listo) => {
    soltar = listo;
  });
  await page.route('**/js/agente-vista.js', async (ruta) => {
    await espera;
    await ruta.continue();
  });
  await page.clock.install();
  await page.goto('./');
  const menu = page.locator(MENU);
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await page.clock.fastForward(9000);
  await expect(menu).toHaveAttribute('data-lista', '');
  await llegarA(menu);
  const lugares = () =>
    page.evaluate(() =>
      ['.beneficios', '.agentes__confianza', '#para-quien'].map((que) =>
        Math.round(/** @type {Element} */ (document.querySelector(que)).getBoundingClientRect().top + scrollY),
      ),
    );
  // Ya como lista, con todo en su lugar (las oraciones terminaron de abrirse y la letra ya es la de la pagina).
  await page.evaluate(() => document.fonts.ready);
  await asentado(page);
  const antes = await lugares();
  // Por fin llega la pieza. Ya no despierta el menu: la visitante esta leyendo la lista y nada se mueve de lugar.
  const llego = page.waitForResponse('**/js/agente-vista.js');
  soltar();
  await llego;
  // Se le da un momento a la pieza para correr: lo que se comprueba es que, ya llegada, no hace nada.
  await page.waitForTimeout(500);
  await expect(menu).toHaveAttribute('data-lista', '');
  await expect(menu).not.toHaveAttribute('data-viva', /.*/);
  await expect(menu.getByRole('button')).toHaveCount(0);
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText(ORACIONES);
  await asentado(page);
  expect(await lugares()).toEqual(antes);
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

test('al imprimir o guardar en PDF la seccion sale completa: los dos capitulos, cada renglon con su oracion, nada vacio', async ({
  page,
}) => {
  const menu = await abrir(page);
  // En pantalla solo se lee la oracion del abierto.
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(menu.locator('.beneficio__texto').filter({ visible: true })).toHaveText(ORACIONES);
  await expect(menu.locator('.beneficio__boton').filter({ visible: true })).toHaveText(TITULOS);
  // El capitulo que en pantalla esta guardado tambien sale en papel, y cada uno dice su nombre: no hay selector.
  const pasos = page.locator(MENU_DE_PASOS);
  await expect(pasos.locator('.beneficio__boton').filter({ visible: true })).toHaveText(TITULOS_DE_PASOS);
  // Y cada paso conserva su numero a la vista, escrito antes de su titulo.
  await expect(pasos.locator('.beneficio__play').filter({ visible: true })).toHaveText(['1', '2', '3', '4']);
  await expect(pasos.locator('.beneficio__texto').filter({ visible: true })).toHaveText(
    EMPIEZA.map(({ texto }) => texto),
  );
  await expect(page.locator('#agente .capitulos')).toBeHidden();
  await expect(page.locator('#agente .agentes__capitulo').filter({ visible: true })).toHaveText(NOMBRES);
  await expect(page.locator('#agente .agentes__sigue')).toBeHidden();
  // En papel no hay nada que reproducir: ni escenarios ni circulos de reproducir.
  await expect(page.locator('#agente .mv').filter({ visible: true })).toHaveCount(0);
  await expect(menu.locator('.beneficio__play').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('#agente .agentes__cuidamos li').filter({ visible: true })).toHaveCount(3);
  await expect(page.locator('#agente .agentes__si li').filter({ visible: true })).toHaveCount(6);
  // En papel los fondos no se imprimen: el icono y la palomita dejan su joya y se pintan de azul, para no perderse.
  for (const adorno of ['.agentes__icono', '.agentes__palomita']) {
    const primero = page.locator(`#agente ${adorno}`).first();
    await expect(primero).toHaveCSS('color', 'rgb(63, 92, 245)');
    await expect(primero).toHaveCSS('background-image', 'none');
  }
});

test('debajo: tu numero, tu dinero y tus reglas en tres tarjetas con icono, y como cuida tu negocio', async ({
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
  await expect(tarjetas.locator('p:not(.agentes__letra)')).toHaveText([
    'Puedes entrar a cualquier conversación cuando quieras; tu agente se hace a un lado.',
    'Cada anticipo cae directo a tu cuenta de Mercado Pago. No cobramos comisión por cita.',
    'Tú pones los precios, los horarios, el anticipo y lo que no haces.',
  ]);
  // La del dinero lleva, en letra chica y bajo su raya, lo que cobra Mercado Pago por cada pago y de cuando es.
  const letra = tarjetas.locator('.agentes__letra');
  await expect(letra).toHaveCount(1);
  await expect(tarjetas.nth(1).locator('.agentes__letra')).toHaveText(
    'Mercado Pago cobra su comisión por cada pago: de 2.95% a 3.49% + $4, más impuestos y, si aplican, retenciones, según el plazo que elijas para disponer de tu dinero. Tarifa de Mercado Pago a noviembre de 2026.',
  );
  await expect(letra).toHaveCSS('font-size', '13px');
  await expect(letra).toHaveCSS('border-top-width', '1px');
  // Cada icono va en su joya azul: es de adorno, mide lo mismo y de verdad se dibuja (su figura existe en la pagina).
  const iconos = await tarjetas.locator('.agentes__icono').evaluateAll((lista) =>
    lista.map((joya) => {
      const dibujo = /** @type {Element} */ (joya.querySelector('svg'));
      const figura = /** @type {Element} */ (dibujo.querySelector('use'));
      const marco = joya.getBoundingClientRect();
      const trazo = dibujo.getBoundingClientRect();
      return {
        adorno: joya.getAttribute('aria-hidden'),
        cual: figura.getAttribute('href'),
        existe: document.querySelector(figura.getAttribute('href') ?? 'nada') instanceof SVGSymbolElement,
        lado: [Math.round(marco.width), Math.round(marco.height)],
        dibujo: [Math.round(trazo.width), Math.round(trazo.height)],
        color: getComputedStyle(joya).color,
      };
    }),
  );
  expect(iconos).toEqual(
    ['#i-celular', '#i-moneda', '#i-perillas'].map((cual) => ({
      adorno: 'true',
      cual,
      existe: true,
      lado: [54, 54],
      dibujo: [26, 26],
      color: 'rgb(255, 255, 255)',
    })),
  );
  // En fila donde caben las tres (y entonces miden lo mismo de alto); si no, una debajo de otra.
  const cajas = await tarjetas.evaluateAll((lista) => lista.map((tarjeta) => tarjeta.getBoundingClientRect().toJSON()));
  const filas = new Set(cajas.map(({ top }) => Math.round(top))).size;
  const computadora = await esComputadora(page);
  expect(filas).toBe(computadora ? 1 : 3);
  if (computadora) expect(new Set(cajas.map(({ height }) => Math.round(height))).size).toBe(1);

  // Como cuida el negocio: seis compromisos en positivo, cada uno con su palomita encendida. Ya sin taches.
  const cuida = seccion.locator('.agentes__cuida');
  await cuida.scrollIntoViewIfNeeded();
  await expect(cuida.getByRole('heading', { level: 3 })).toHaveText('Así cuida tu negocio');
  // Su titulo manda: es mas grande que los de las tarjetas de arriba.
  await expect(cuida.getByRole('heading', { level: 3 })).toHaveCSS('font-size', '24px');
  await expect(tarjetas.getByRole('heading', { level: 4 }).first()).toHaveCSS('font-size', '20px');
  await expect(cuida.locator('.agentes__cuida-cabeza p')).toHaveText(
    'Seis cosas que tu agente hace siempre, para que tú no tengas que vigilarlo.',
  );
  const renglones = cuida.getByRole('listitem');
  await expect(renglones.getByRole('heading', { level: 4 })).toHaveText([
    'Cada cita, con su anticipo',
    'Tus precios, tal cual',
    'Siempre con transparencia',
    'Cobra solo el anticipo',
    'Lo clínico es tuyo',
    'Cuida a quien ya te escribe',
  ]);
  await expect(renglones.locator('p')).toHaveText([
    'Confirma solo con el pago aprobado. Las excepciones las decides tú.',
    'Cotiza con tu catálogo y, si algo no está ahí, no lo inventa: te avisa.',
    'Desde el primer mensaje se presenta como asistente virtual.',
    'El resto del servicio lo cobras tú, como siempre.',
    'No diagnostica ni recomienda medicamentos: agenda y, si hay una urgencia, te llega a ti.',
    'No busca clientela nueva: hace que quien ya te escribe sí llegue a su cita, con su anticipo pagado.',
  ]);
  await expect(cuida).not.toContainText('te la pasa');
  await expect(cuida).not.toContainText('si tu clienta lo pide');
  await expect(seccion.locator('.agentes__tacha, .agentes__limites, .agentes__no')).toHaveCount(0);
  const palomitas = cuida.locator('.agentes__palomita');
  await expect(palomitas).toHaveCount(6);
  await expect(palomitas.first()).toHaveAttribute('aria-hidden', 'true');
  await expect(palomitas.first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(palomitas.first().locator('use')).toHaveAttribute('href', '#i-palomita');
  const sellos = await palomitas.evaluateAll((lista) =>
    lista.map((sello) => {
      const { width, height } = sello.getBoundingClientRect();
      const fila = /** @type {Element} */ (sello.closest('li'));
      const renglon = fila.getBoundingClientRect();
      const titulo = /** @type {Element} */ (fila.querySelector('h4')).getBoundingClientRect();
      // Redonda, del mismo lado, y a la izquierda de su titulo sin encimarse.
      return [Math.round(width), Math.round(height), titulo.left >= renglon.left + width + 8];
    }),
  );
  expect(sellos).toEqual(Array(6).fill([30, 30, true]));
  // En dos columnas donde caben, con su titulo a la izquierda; en celular, todo en una.
  const columnas = new Set(
    await renglones.evaluateAll((lista) => lista.map((renglon) => Math.round(renglon.getBoundingClientRect().left))),
  ).size;
  expect(columnas).toBe(computadora ? 2 : 1);
  if (computadora) {
    const [cabeza, lista] = await Promise.all(
      ['.agentes__cuida-cabeza', '.agentes__si'].map((que) =>
        cuida.locator(que).evaluate((parte) => parte.getBoundingClientRect().toJSON()),
      ),
    );
    expect(cabeza.right).toBeLessThanOrEqual(lista.left);
  }
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('los dos capitulos se leen como lista, cada renglon con su titulo y su oracion, sin botones ni escenarios', async ({
    page,
  }) => {
    await page.goto('./');
    const menu = page.locator(MENU);
    await menu.scrollIntoViewIfNeeded();
    await expect(menu.locator('ol.beneficios > li')).toHaveCount(CUANTOS);
    await expect(menu.getByRole('heading', { level: 3 })).toHaveText([NOMBRES[0] ?? '', ...TITULOS]);
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
    // El otro capitulo tambien se lee, debajo: sin selector, cada uno dice su nombre arriba de su lista.
    const pasos = page.locator(MENU_DE_PASOS);
    await expect(pasos.getByRole('heading', { level: 3 })).toHaveText([NOMBRES[1] ?? '', ...TITULOS_DE_PASOS]);
    await expect(pasos.locator('.beneficio__texto').filter({ visible: true })).toHaveText(
      EMPIEZA.map(({ texto }) => texto),
    );
    await expect(page.locator('#agente .capitulos')).toBeHidden();
    await expect(page.locator('#agente .agentes__capitulo').filter({ visible: true })).toHaveText(NOMBRES);
    await expect(page.locator('#agente .agentes__sigue')).toBeHidden();
    await expect(pasos.getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
    // Cada paso conserva su numero a la vista, escrito antes de su titulo.
    await expect(pasos.locator('.beneficio__play').filter({ visible: true })).toHaveText(['1', '2', '3', '4']);
    // Ni un boton (tampoco uno muerto), ni un circulo de reproducir, ni un escenario vacio.
    await expect(page.locator('#agente button')).toHaveCount(0);
    await expect(menu.locator('.beneficio__play').filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('#agente .mv').filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('#agente .mv__barra')).toHaveCount(0);
    // Y lo de abajo, igual que siempre.
    await expect(page.locator('#agente .agentes__cuidamos li')).toHaveCount(3);
    await expect(page.locator('#agente .agentes__si li')).toHaveCount(6);
    await expect(page.locator('#agente .agentes__si')).toContainText(
      'Desde el primer mensaje se presenta como asistente virtual.',
    );
    await expect(page.locator('#agente .agentes__letra')).toContainText('Tarifa de Mercado Pago a noviembre de 2026.');
  });
});

for (const [ancho, alto] of TAMANOS) {
  test(`a ${ancho} de ancho nada de "Tu agente" se sale de la pantalla, cada escena cabe en su mini video y nada brinca`, async ({
    page,
  }) => {
    // Abre los diez beneficios y mide cada pieza: con la maquina cargada se le da su tiempo.
    test.slow();
    await page.setViewportSize({ width: ancho, height: alto });
    const menu = await abrir(page, { quieta: true });
    const seccion = page.locator('#agente');
    const computadora = ancho >= 900;
    /**
     * Donde quedo, en la pagina, lo que no tiene por que moverse al cambiar de beneficio. En computadora, ademas, lo
     * que sigue debajo del menu y, del escenario, donde empieza a lo ancho (a lo alto se queda pegado bajo la barra
     * de la pagina, y su lugar en la pagina cambia al recorrerla).
     */
    const fijos = () =>
      page.evaluate((conEscenario) => {
        const tope = (/** @type {string} */ que) =>
          Math.round(/** @type {Element} */ (document.querySelector(que)).getBoundingClientRect().top + scrollY);
        const quietos = { menu: tope('.beneficios'), primero: tope('.beneficio:first-child .beneficio__boton') };
        if (!conEscenario) return quietos;
        const escenario = /** @type {Element} */ (document.querySelector('.beneficio[data-abierto] .mv'));
        return {
          ...quietos,
          escenario: Math.round(escenario.getBoundingClientRect().left + scrollX),
          debajo: tope('.agentes__confianza'),
        };
      }, computadora);
    const altoEnComputadora = await altoDelEscenario(page);
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
      // En computadora el escenario se ve entero despues de elegir, bajo la barra de la pagina: tambien con los
      // ultimos renglones del menu, donde ya iba de salida.
      if (computadora) {
        await quietaLaPagina(page);
        await expect(video(menu), TITULOS[numero - 1]).toBeInViewport({ ratio: 1 });
        expect((await video(menu).boundingBox())?.y ?? 0, TITULOS[numero - 1]).toBeGreaterThanOrEqual(64);
      }
      expect(await salidosDe(seccion), TITULOS[numero - 1]).toEqual({ salidos: [], desborde: 0 });
      const escena = await escenaMedida(video(menu));
      // La de la cita completa termina con su ultimo momento, que trae tres piezas; las demas, tres o mas.
      expect(escena.piezas, TITULOS[numero - 1]).toBeGreaterThanOrEqual(3);
      expect(escena.salidas, TITULOS[numero - 1]).toEqual([]);
      // El escenario no cambia de alto. En el acordeon todos los mini videos miden lo mismo, menos los que traen una
      // ficha grande o varios globos a la vez: necesitan una pantalla mas alta.
      expect(escena.alto, TITULOS[numero - 1]).toBe(computadora ? altoEnComputadora : ALTO_EN_ACORDEON[numero - 1]);
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

// ---------- Los capitulos: "Lo que hace" y "Como empiezas" ----------

/**
 * El selector de capitulos.
 * @param {import('@playwright/test').Page} page
 */
const selector = (page) => page.locator('#agente [data-capitulos]');
/**
 * Una de sus pestanas, por lo que dice.
 * @param {import('@playwright/test').Page} page
 * @param {string} nombre
 */
const pestana = (page, nombre) => selector(page).getByRole('tab', { name: nombre });

test('el selector de capitulos son dos pestanas de verdad: se ve un capitulo a la vez y el otro espera guardado', async ({
  page,
}) => {
  test.slow();
  const fallas = vigilar(page);
  const menu = await abrir(page);
  const pasos = page.locator(MENU_DE_PASOS);
  await llegarA(selector(page));
  await expect(selector(page)).toHaveRole('tablist');
  await expect(selector(page)).toHaveAccessibleName('Lo que hace tu agente y cómo empiezas');
  await expect(selector(page).getByRole('tab')).toHaveText(['Lo que hace', 'Cómo empiezas 4 pasos']);
  const hace = pestana(page, 'Lo que hace');
  const empieza = pestana(page, 'Cómo empiezas');
  // Llega elegida la primera, en el azul de la marca, con su capitulo a la vista.
  await expect(hace).toHaveAttribute('aria-selected', 'true');
  await expect(empieza).toHaveAttribute('aria-selected', 'false');
  await expect(hace).toHaveCSS('background-color', 'rgb(63, 92, 245)');
  await expect(empieza).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(menu).toBeVisible();
  await expect(pasos).toBeHidden();
  // Cada pestana dice que controla, y eso existe: su panel, que a su vez dice de quien es. Y se toca con el dedo.
  for (const [una, panel] of /** @type {const} */ ([
    [hace, menu],
    [empieza, pasos],
  ])) {
    await expect(panel).toHaveRole('tabpanel');
    expect(await una.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
    expect(await panel.getAttribute('aria-labelledby')).toBe(await una.getAttribute('id'));
    expect((await una.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // El nombre de cada capitulo, escrito arriba de su lista, solo hace falta sin selector: aqui no se ve.
  await expect(page.locator('#agente .agentes__capitulo').filter({ visible: true })).toHaveCount(0);

  // Elegir la otra guarda un menu y ensena el otro: sus cuatro pasos, numerados, con el primero abierto.
  await empieza.click();
  await expect(empieza).toHaveAttribute('aria-selected', 'true');
  await expect(hace).toHaveAttribute('aria-selected', 'false');
  await expect(empieza).toHaveCSS('background-color', 'rgb(63, 92, 245)');
  await expect(pasos).toBeVisible();
  await expect(menu).toBeHidden();
  await expect(pasos.locator('ol.beneficios > li')).toHaveCount(EMPIEZA.length);
  await expect(pasos.locator('h3 > button.beneficio__boton')).toHaveText(TITULOS_DE_PASOS);
  await expect(pasos.locator('.beneficio__play b')).toHaveText(['1', '2', '3', '4']);
  await expect(pasos.locator('.beneficio__play svg')).toHaveCount(0);
  for (const [lugar, { titulo, texto }] of EMPIEZA.entries()) {
    // El numero es de adorno (el orden lo dice la lista): el boton se llama como su paso.
    const suBoton = pasos.getByRole('button', { name: titulo, exact: true });
    await expect(suBoton).toHaveAttribute('aria-expanded', String(lugar === 0));
    await expect(page.locator(`#${await suBoton.getAttribute('aria-controls')} .beneficio__texto`)).toHaveText(texto);
  }
  await expect(pasos.locator('.beneficio__texto').filter({ visible: true })).toHaveText([EMPIEZA[0]?.texto ?? '']);
  // En toda la seccion sigue habiendo un solo mini video a la vista.
  await expect(page.locator('#agente .mv').filter({ visible: true })).toHaveCount(1);
  // El capitulo termina con el boton de empezar, que lleva al alta y dice desde donde lo tocaron, y lo que se paga hoy.
  const empezar = pasos.getByRole('link', { name: 'Empieza ahora' });
  await expect(empezar).toHaveAttribute('href', ALTA);
  await expect(empezar).toHaveAttribute('data-lugar', 'agente');
  await expect(pasos.locator('.agentes__arranca')).toContainText('Hoy pagas la instalación y tu primer mes.');
  await expect(pasos.locator('.agentes__sigue')).toHaveCount(0);
  await sinFaltasDeAccesibilidad(page, '#agente');

  // Y de regreso: el primero vuelve como se quedo.
  await hace.click();
  await expect(menu).toBeVisible();
  await expect(pasos).toBeHidden();
  await expect(boton(menu, 1)).toHaveAttribute('aria-expanded', 'true');
  expect(fallas).toEqual([]);
});

test('los capitulos se cambian con el teclado: las flechas pasan de una pestana a la otra y el foco va con ellas', async ({
  page,
}) => {
  const menu = await abrir(page);
  const pasos = page.locator(MENU_DE_PASOS);
  const hace = pestana(page, 'Lo que hace');
  const empieza = pestana(page, 'Cómo empiezas');
  await llegarA(selector(page));
  // Solo la pestana elegida esta en el camino del tabulador.
  await expect(hace).toHaveAttribute('tabindex', '0');
  await expect(empieza).toHaveAttribute('tabindex', '-1');
  await hace.focus();
  await page.keyboard.press('ArrowRight');
  await expect(empieza).toBeFocused();
  await expect(empieza).toHaveCSS('outline-style', 'solid');
  await expect(empieza).toHaveAttribute('aria-selected', 'true');
  await expect(empieza).toHaveAttribute('tabindex', '0');
  await expect(hace).toHaveAttribute('tabindex', '-1');
  await expect(pasos).toBeVisible();
  await expect(menu).toBeHidden();
  // Con el tabulador se entra a su capitulo: lo que sigue es su primer paso. Y hacia atras, de vuelta a la pestana.
  await page.keyboard.press('Tab');
  await expect(boton(pasos, 1)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(empieza).toBeFocused();
  // Las flechas de arriba y abajo no cambian de capitulo: las pestanas van en renglon.
  await page.keyboard.press('ArrowDown');
  await expect(empieza).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(empieza).toHaveAttribute('aria-selected', 'true');
  await empieza.focus();
  // Las flechas de lado dan la vuelta; Inicio y Fin van a las orillas.
  await page.keyboard.press('ArrowRight');
  await expect(hace).toBeFocused();
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(empieza).toBeFocused();
  await expect(pasos).toBeVisible();
  await page.keyboard.press('Home');
  await expect(hace).toBeFocused();
  await expect(hace).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(empieza).toBeFocused();
  await expect(empieza).toHaveAttribute('aria-selected', 'true');
  // Con Enter y con Espacio, como cualquier boton: la que ya esta elegida se queda elegida.
  await page.keyboard.press('Enter');
  await expect(empieza).toHaveAttribute('aria-selected', 'true');
  await expect(pasos).toBeVisible();
});

test('el mini video del capitulo guardado espera: el del primer paso arranca solo la primera vez que se ensena', async ({
  page,
}) => {
  const menu = await abrir(page);
  const pasos = page.locator(MENU_DE_PASOS);
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  // Mientras su capitulo esta guardado, el primer paso espera sin correr: no gasta nada.
  await expect(pasos).not.toHaveAttribute('data-anda', /.*/);
  await expect(beneficio(pasos, 1)).toHaveAttribute('data-fase', 'espera');
  await llegarA(selector(page));
  await pestana(page, 'Cómo empiezas').click();
  await llegarA(video(pasos));
  // Al ensenarse, corre solo. Y el del otro capitulo, que ya no se ve, se detiene donde iba.
  await expect(pasos).toHaveAttribute('data-anda', '');
  await expect(beneficio(pasos, 1)).toHaveAttribute('data-fase', 'sigue');
  await expect.poll(async () => (await marcha(pasos)).corriendo).toBeGreaterThan(0);
  await expect(video(pasos).locator('[data-mv-dura]')).toHaveText('0:07');
  await expect(video(pasos).getByRole('button')).toHaveAccessibleName('Pausar');
  await expect(menu).not.toHaveAttribute('data-anda', /.*/);
  await expect(beneficio(menu, 1)).toHaveAttribute('data-fase', 'sigue');
  // Ya terminado, ir y volver no lo corre otra vez: solo arranca solo la primera.
  await alFinal(pasos);
  await expect(beneficio(pasos, 1)).not.toHaveAttribute('data-fase', /.*/);
  await llegarA(selector(page));
  await pestana(page, 'Lo que hace').click();
  await expect(menu).toBeVisible();
  await pestana(page, 'Cómo empiezas').click();
  await llegarA(video(pasos));
  await expect(video(pasos).getByRole('button')).toHaveAccessibleName('Ver de nuevo');
  await page.waitForTimeout(300);
  await expect(pasos).not.toHaveAttribute('data-anda', /.*/);
});

test('al final de "Lo que hace", el paso al otro capitulo lo ensena y sube la pagina al principio de la seccion', async ({
  page,
}) => {
  // Con menos movimiento la pagina sube de golpe: se mide donde quedo sin esperar a que termine de deslizarse.
  const menu = await abrir(page, { quieta: true });
  const pasos = page.locator(MENU_DE_PASOS);
  const sigue = menu.getByRole('button', { name: 'Siguiente: cómo empiezas, en 4 pasos' });
  await llegarA(sigue);
  await expect(sigue).toBeVisible();
  expect((await sigue.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await sigue.click();
  await expect(pasos).toBeVisible();
  await expect(menu).toBeHidden();
  const empieza = pestana(page, 'Cómo empiezas');
  await expect(empieza).toHaveAttribute('aria-selected', 'true');
  // El foco no se pierde con el boton que se guardo: pasa a la pestana del capitulo que se abrio.
  await expect(empieza).toBeFocused();
  await quietaLaPagina(page);
  // La seccion quedo arriba, bajo la barra de la pagina: se ven su titulo, el selector y el primer paso.
  const arriba = await page.locator('#agente .agentes__principal').evaluate((el) => el.getBoundingClientRect().top);
  expect(arriba).toBeGreaterThanOrEqual(0);
  expect(arriba).toBeLessThanOrEqual(100);
  await expect(page.locator('#agente .agentes__titulo')).toBeInViewport({ ratio: 1 });
  await expect(selector(page)).toBeInViewport({ ratio: 1 });
  await expect(boton(pasos, 1)).toBeInViewport();
  // En computadora el escenario, que cuelga del titulo, queda entero a la vista.
  if (await esComputadora(page)) await expect(video(pasos)).toBeInViewport({ ratio: 1 });
});

test('los cuatro pasos de "Como empiezas": cada uno abre su oracion y su escena, con lo que dicen los datos', async ({
  page,
}) => {
  // Con menos movimiento cada escena se pinta completa de una vez: se revisa su ultimo cuadro.
  await abrir(page, { quieta: true });
  const pasos = page.locator(MENU_DE_PASOS);
  await llegarA(selector(page));
  await pestana(page, 'Cómo empiezas').click();
  await expect(pasos).toBeVisible();
  /** Lo que cada escena ensena al final. */
  const ESCENAS = [
    [
      'Tu plan',
      'Lo contratas en línea',
      'Hoy pagas',
      'La instalación y tu primer mes',
      'Tu primer mes',
      'Cuenta desde que tu agente queda activo',
      'Pago con tarjeta aprobado',
      'Sin comisión por cita',
    ],
    [
      'Tu negocio',
      'Studio Bella · lo llenas en línea',
      'Datos del negocio',
      'Av. del Esmalte 234, colonia Bella Vista',
      'Gelish $350 · Acrílicas $480',
      'Martes a sábado, 10 am a 7 pm',
      'Anticipo $150 · Tolerancia de 15 minutos',
      'Con esto se arma su base de conocimiento',
    ],
    ['Tus cuentas', 'WhatsApp de tu negocio', 'Google Calendar', 'Mercado Pago', 'Tu número personal no se toca'],
    // El aviso que le llego a ella ya se fue: queda la primera clienta, atendida.
    ['Hola, ¿tendrá lugar el sábado?', '¿Cuál le queda mejor?', 'Tu agente ya atiende'],
  ];
  expect(ESCENAS).toHaveLength(EMPIEZA.length);
  for (const [lugar, queda] of ESCENAS.entries()) {
    const numero = lugar + 1;
    await llegarA(boton(pasos, numero));
    if (numero > 1) await boton(pasos, numero).click();
    await expect(boton(pasos, numero)).toHaveAttribute('aria-expanded', 'true');
    await expect(pasos.locator('.beneficio__texto').filter({ visible: true })).toHaveText([
      EMPIEZA[lugar]?.texto ?? '',
    ]);
    const escena = video(pasos).locator('.mv__escena');
    await expect(escena).toHaveCount(1);
    await expect(escena).toHaveAttribute('aria-hidden', 'true');
    for (const texto of queda) await expect(escena.getByText(texto, { exact: false }).first()).toBeVisible();
    // Solo la ultima se lleva algo: el aviso que le llego a la profesional, antes de ensenar a la primera clienta.
    expect(new Set(await pasosALaVista(pasos)), EMPIEZA[lugar]?.titulo).toEqual(
      new Set(numero === EMPIEZA.length ? [0, 1] : [1]),
    );
  }
  // Las cuentas conectadas: tres renglones, cada uno con su palomita verde. El numero exclusivo se dice en la oracion.
  await boton(pasos, 3).click();
  const cuentas = video(pasos).locator('.mv__conecta li');
  await expect(cuentas.locator('span')).toHaveText(['WhatsApp de tu negocio', 'Google Calendar', 'Mercado Pago']);
  await expect(cuentas.locator('b')).toHaveText(['Conectado', 'Conectado', 'Conectado']);
  await expect(cuentas.locator('b i').first()).toHaveCSS('background-color', 'rgb(0, 166, 80)');
  await expect(pasos.locator('.beneficio__texto').filter({ visible: true })).toContainText(
    'un número exclusivo de tu negocio con WhatsApp Business',
  );
  await sinFaltasDeAccesibilidad(page, '#agente');
});

for (const [ancho, alto] of TAMANOS) {
  test(`a ${ancho} de ancho nada de "Como empiezas" se sale de la pantalla y cada escena cabe en su mini video`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: ancho, height: alto });
    await abrir(page, { quieta: true });
    const pasos = page.locator(MENU_DE_PASOS);
    const computadora = ancho >= 900;
    await llegarA(selector(page));
    await pestana(page, 'Cómo empiezas').click();
    await expect(pasos).toBeVisible();
    const altoEnComputadora = await altoDelEscenario(page);
    // El selector cabe en su renglon: las dos pestanas, una junto a la otra, dentro de la pantalla.
    const cajas = await selector(page)
      .getByRole('tab')
      .evaluateAll((lista) => lista.map((una) => una.getBoundingClientRect().toJSON()));
    expect(cajas).toHaveLength(2);
    expect(Math.abs((cajas[0]?.top ?? 0) - (cajas[1]?.top ?? 1))).toBeLessThanOrEqual(1);
    expect(cajas[0]?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(cajas[1]?.right ?? ancho + 1).toBeLessThanOrEqual(ancho);
    for (const [lugar, paso] of EMPIEZA.entries()) {
      const numero = lugar + 1;
      await llegarA(boton(pasos, numero));
      if (numero > 1) await boton(pasos, numero).click();
      await expect(boton(pasos, numero)).toHaveAttribute('aria-expanded', 'true');
      if (computadora) {
        await quietaLaPagina(page);
        await expect(video(pasos), paso.titulo).toBeInViewport({ ratio: 1 });
      }
      expect(await salidosDe(page.locator('#agente')), paso.titulo).toEqual({ salidos: [], desborde: 0 });
      const escena = await escenaMedida(video(pasos));
      expect(escena.piezas, paso.titulo).toBeGreaterThanOrEqual(2);
      expect(escena.salidas, paso.titulo).toEqual([]);
      expect(escena.alto, paso.titulo).toBe(computadora ? altoEnComputadora : paso.alta ? 452 : 340);
    }
    // El boton de empezar y lo que se paga hoy caben debajo de los pasos, sin encimarse con el ultimo.
    const cierre = await pasos.evaluate((raiz) => {
      const caja = (/** @type {string} */ que) =>
        /** @type {Element} */ (raiz.querySelector(que)).getBoundingClientRect().toJSON();
      return { lista: caja('.beneficios'), arranca: caja('.agentes__arranca'), boton: caja('.agentes__arranca a') };
    });
    expect(cierre.arranca.top).toBeGreaterThanOrEqual(cierre.lista.bottom);
    expect(cierre.boton.height).toBeGreaterThanOrEqual(44);
  });
}

// ---------- La linea de avance que se agarra, y quien ve cada conversacion ----------

test('la linea de avance se agarra: un toque salta, arrastrar recorre el mini video hacia adelante y hacia atras', async ({
  page,
}) => {
  test.slow();
  const menu = await abrir(page);
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  const cita = HACE[0];
  if (!cita) throw new Error('no hay primer beneficio');
  const linea = video(menu).getByRole('slider');
  const pausa = video(menu).getByRole('button');
  await expect(linea).toHaveAccessibleName('Avance del video');
  await expect(linea).toHaveAttribute('aria-valuemin', '0');
  await expect(linea).toHaveAttribute('aria-valuemax', String(cita.dura));
  // Se pausa para medir sin que el reloj se mueva.
  await pausa.click();
  await expect(pausa).toHaveAccessibleName('Reproducir');
  const caja = await linea.boundingBox();
  if (!caja) throw new Error('la linea de avance no se ve');
  // Es un renglon alto: se le atina con el dedo.
  expect(caja.height).toBeGreaterThanOrEqual(24);
  /** @param {number} parte  de 0 a 1, a lo ancho de la linea */
  const en = (parte) => /** @type {[number, number]} */ ([caja.x + caja.width * parte, caja.y + caja.height / 2]);
  /**
   * Lo que se ve de la escena en un instante: cada paso que ya entro y todavia no se va.
   * @param {number} segundos
   */
  const cuadroEn = (segundos) =>
    cita.pasos.map((paso) => (paso.en <= segundos && (paso.hasta === undefined || segundos < paso.hasta) ? 1 : 0));
  const cuadro = async () => (await pasosALaVista(menu)).map((cuanto) => Math.round(cuanto));

  // Un toque a tres cuartos: el mini video salta a ese instante, y sigue en pausa.
  await page.mouse.click(...en(0.75));
  await expect.poll(async () => Math.abs((await marcha(menu)).va - 0.75)).toBeLessThan(0.02);
  expect(await marcha(menu)).toMatchObject({ anda: false, fase: 'sigue' });
  await expect(linea).toHaveAttribute('aria-valuenow', String(Math.round(cita.dura * 0.75)));
  await expect(linea).toHaveAttribute('aria-valuetext', `${Math.round(cita.dura * 0.75)} de ${cita.dura} segundos`);
  // Se ve lo de ese instante y nada mas: lo de antes ya se fue y lo de despues no ha llegado.
  expect(await cuadro()).toEqual(cuadroEn(cita.dura * 0.75));
  expect(cuadroEn(cita.dura * 0.75).filter(Boolean).length).toBeGreaterThan(0);

  // Arrastrando hacia atras: vuelve lo del principio, tal como estaba.
  await page.mouse.move(...en(0.75));
  await page.mouse.down();
  await page.mouse.move(...en(0.5), { steps: 4 });
  await page.mouse.move(...en(0.3), { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await marcha(menu)).va - 0.3)).toBeLessThan(0.02);
  expect(await cuadro()).toEqual(cuadroEn(cita.dura * 0.3));
  expect(await marcha(menu)).toMatchObject({ anda: false, fase: 'sigue' });
  // Soltado el dedo, pasar el cursor por encima ya no mueve nada.
  await page.mouse.move(...en(0.9));
  await page.waitForTimeout(150);
  expect(Math.abs((await marcha(menu)).va - 0.3)).toBeLessThan(0.02);

  // Con el teclado: las flechas van de segundo en segundo; Inicio y Fin, a las orillas.
  await linea.focus();
  const antes = Number(await linea.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  await expect(linea).toHaveAttribute('aria-valuenow', String(antes + 1));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(linea).toHaveAttribute('aria-valuenow', String(antes - 1));
  await page.keyboard.press('Home');
  await expect(linea).toHaveAttribute('aria-valuenow', '0');
  await expect.poll(async () => (await marcha(menu)).va).toBeLessThan(0.02);
  // Fin, en pausa, lo deja en su ultimo cuadro sin quitarle la pausa: no termina solo, y todavia no dice el total.
  await page.keyboard.press('End');
  await expect.poll(async () => (await marcha(menu)).va).toBeGreaterThan(0.99);
  expect(await marcha(menu)).toMatchObject({ anda: false, fase: 'sigue' });
  await expect(pausa).toHaveAccessibleName('Reproducir');
  await expect(linea).toHaveAttribute('aria-valuenow', String(cita.dura - 1));
  await expect(linea).toBeFocused();
  expect(await cuadro()).toEqual(cuadroEn(cita.dura));
  // Con una tecla que es atajo del navegador la linea no se mueve.
  await page.keyboard.press('Control+ArrowLeft');
  expect((await marcha(menu)).va).toBeGreaterThan(0.99);
  // El clic derecho tampoco la mueve.
  await page.mouse.click(...en(0.2), { button: 'right' });
  await page.keyboard.press('Escape');
  expect((await marcha(menu)).va).toBeGreaterThan(0.99);
  // Al reproducirlo termina enseguida: el boton ofrece verlo de nuevo y la linea dice el total.
  await pausa.click();
  await expect(pausa).toHaveAccessibleName('Ver de nuevo');
  await expect(beneficio(menu, 1)).not.toHaveAttribute('data-fase', /.*/);
  await expect(linea).toHaveAttribute('aria-valuenow', String(cita.dura));
  await expect(linea).toHaveAttribute('aria-valuetext', `${cita.dura} de ${cita.dura} segundos`);
  // Ya terminado, Fin y la flecha de adelante no lo vuelven a empezar: no hay a donde ir.
  await linea.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(pausa).toHaveAccessibleName('Ver de nuevo');
  await expect(beneficio(menu, 1)).not.toHaveAttribute('data-fase', /.*/);
  // Y desde el final, regresar la linea lo echa a andar de nuevo, desde donde ella apunto.
  await page.keyboard.press('ArrowLeft');
  await expect(beneficio(menu, 1)).toHaveAttribute('data-fase', 'sigue');
  await expect(linea).toHaveAttribute('aria-valuenow', String(cita.dura - 1));
  await expect(pausa).toHaveAccessibleName('Pausar');
  await sinFaltasDeAccesibilidad(page, '#agente');
});

test('con el dedo: un toque en la linea de avance salta a ese instante', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'solo donde la pantalla se toca');
  const menu = await abrir(page);
  await llegarA(video(menu));
  await expect(menu).toHaveAttribute('data-anda', '');
  const linea = video(menu).getByRole('slider');
  const pausa = video(menu).getByRole('button');
  // La pagina se sigue recorriendo con el dedo aunque empiece sobre la linea: solo de lado es de ella.
  await expect(linea).toHaveCSS('touch-action', 'pan-y');
  await pausa.click();
  await expect(pausa).toHaveAccessibleName('Reproducir');
  const caja = await linea.boundingBox();
  if (!caja) throw new Error('la linea de avance no se ve');
  await page.touchscreen.tap(caja.x + caja.width * 0.5, caja.y + caja.height / 2);
  await expect.poll(async () => Math.abs((await marcha(menu)).va - 0.5)).toBeLessThan(0.02);
  // Sigue en pausa, en ese instante.
  expect(await marcha(menu)).toMatchObject({ anda: false, fase: 'sigue' });
  await expect(pausa).toHaveAccessibleName('Reproducir');
});

test('cada conversacion dice quien la ve: oscuro lo de la clienta, y en el azul de la marca lo que le llega a la profesional', async ({
  page,
}) => {
  // Con menos movimiento cada escena es su ultimo cuadro.
  const menu = await abrir(page, { quieta: true });
  /** El rotulo que se ve en la escena abierta. */
  const rotulo = () => video(menu).locator('.mv__quien').filter({ visible: true });
  await llegarA(video(menu));
  // La cita completa termina con lo que ve la clienta, y dice en que momento va.
  await expect(rotulo()).toHaveCount(1);
  await expect(rotulo().locator('.mv__de')).toHaveText('Lo ve tu clienta');
  await expect(rotulo().locator('.mv__de')).toHaveCSS('background-color', 'rgb(31, 44, 52)');
  await expect(rotulo().locator('span')).toHaveText('Después de la cita');
  // Lo que le llega a la profesional (aqui, sus cambios) va en azul, y dice cual de sus dos ejemplos queda a la vista.
  await llegarA(boton(menu, CAMBIOS));
  await boton(menu, CAMBIOS).click();
  await expect(rotulo()).toHaveCount(1);
  await expect(rotulo().locator('.mv__de')).toHaveText('Lo ves tú');
  await expect(rotulo().locator('.mv__de')).toHaveCSS('background-color', 'rgb(63, 92, 245)');
  await expect(rotulo().locator('span')).toHaveText('Cambio de horario');
  // Y el recado de la profesional, tambien en azul, sin momento que decir.
  await llegarA(boton(menu, RECADOS));
  await boton(menu, RECADOS).click();
  await expect(rotulo().locator('.mv__de')).toHaveText('Lo ves tú');
  await expect(rotulo().locator('span')).toHaveCount(0);
  // En salud dice "paciente", y al final de esa escena lo que queda es lo de la profesional: la cita ya pagada.
  await llegarA(boton(menu, PAGO));
  await boton(menu, PAGO).click();
  await expect(rotulo().locator('.mv__de')).toHaveText('Lo ves tú');
  await expect(video(menu).locator('.mv__quien').locator('.mv__de')).toHaveText(['Lo ve tu paciente', 'Lo ves tú']);
  // El rotulo va arriba de lo que nombra.
  const orden = await video(menu).evaluate((pantalla) => {
    const tope = (/** @type {string} */ que) =>
      /** @type {Element} */ (
        [...pantalla.querySelectorAll(que)].findLast((uno) => uno.getBoundingClientRect().height > 0)
      ).getBoundingClientRect().top;
    return tope('.mv__quien') < tope('.minicita');
  });
  expect(orden).toBe(true);
  // La nota de voz del agente entra en blanco, sin palomitas de enviado, debajo de la de la clienta.
  await llegarA(boton(menu, VOZ));
  await boton(menu, VOZ).click();
  const notas = video(menu).locator('.wa__m--voz');
  await expect(notas).toHaveCount(2);
  await expect(notas.first()).toHaveClass(/wa__m--sale/);
  await expect(notas.last()).toHaveClass(/wa__m--entra/);
  await expect(notas.last()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(notas.first().locator('.wa__tics')).toHaveCount(1);
  await expect(notas.last().locator('.wa__tics')).toHaveCount(0);
  await sinFaltasDeAccesibilidad(page, '#agente');
});
