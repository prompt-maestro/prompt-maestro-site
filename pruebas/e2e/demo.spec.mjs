// @ts-check
// La demostracion de "Tu dinero": un celular con el aspecto de WhatsApp que cuenta sola una cita en seis momentos.
// Lo que depende del tiempo (que corra sola, la pausa, lo que dura) se prueba con el reloj de la pagina en la mano:
// puesto y detenido desde antes de cargar, solo avanza cuando la prueba lo adelanta. Lo demas se prueba pidiendo
// menos movimiento, que es como la historia avanza a toques: una parada por cada toque, pintada de un jalon.
import { readFileSync } from 'node:fs';
import { duracionDe, historiaDe } from '../../fuente/js/demo.js';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */
/** @typedef {import('../../fuente/js/demo.js').Ejemplo} Ejemplo */

const ALTA = 'https://alta.prompt-maestro.com/';
// El azul de la marca tiene dos tonos: el del boton que cierra (relleno) y la luz de lo ya pagado (el sello).
const AZUL_DEL_BOTON = 'rgb(63, 92, 245)';
const LUZ_DE_LO_PAGADO = 'rgb(132, 151, 255)';
/** Desde este ancho se ven las tres tarjetas de lo que le llega a la profesional; antes, solo la del momento. */
const TRES_TARJETAS = '(min-width: 1240px)';

// La historia sale de los mismos datos que la pagina: el dia que cambie un texto o un tiempo, estas pruebas siguen valiendo.
const leer = (/** @type {string} */ ruta) =>
  JSON.parse(readFileSync(new URL(`../../fuente/datos/${ruta}`, import.meta.url), 'utf8'));
const demoDatos = leer('demo.json');
/** @type {Ejemplo[]} */
const EJEMPLOS = leer('giros.json').map((/** @type {Ejemplo['giro']} */ giro) => ({
  ...demoDatos,
  giro,
  guion: leer(`guiones/${giro.clave}.json`),
}));
const UNAS = /** @type {Ejemplo} */ (EJEMPLOS[0]);
const HISTORIA = historiaDe(UNAS);
/** Lo que tarda la historia en llegar a su toma numero "van" desde que empieza. */
const hastaLaToma = (/** @type {number} */ van) => duracionDe(HISTORIA.slice(0, van - 1));
/** La espera, ya a la vista, antes de empezar sola. */
const ESPERA_PARA_EMPEZAR = 1000;

/** Las nueve paradas de la historia con menos movimiento: el paso y lo que dice el letrero en cada una. */
const PARADAS = /** @type {const} */ ([
  ['precio', '01 · Contesta', 'Escucha la nota de voz y contesta por escrito.'],
  ['horarios', '02 · Ofrece horarios', 'Solo los horarios libres de tu Google Calendar.'],
  ['apartado', '03 · Cobra el anticipo', 'Lugar apartado unos minutos, mientras paga.'],
  ['pagado', '03 · Cobra el anticipo', '$150 de anticipo, directo en tu Mercado Pago.'],
  ['pagado', '04 · Agenda', 'La cita entra sola a tu calendario, ya garantizada.'],
  ['recordatorios', '05 · Recuerda', 'Los recordatorios salen solos. Tú no haces nada.'],
  ['asistencia', '06 · Pregunta si asistió', 'Tu única tarea: tocar sí o no.'],
  ['finSi', '06 · Pregunta si asistió', 'Cita completada.'],
  ['cierre', '06 · Pregunta si asistió', 'Así llega una cita garantizada.'],
]);

/**
 * Abre la pagina pidiendo menos movimiento: la historia no corre sola y avanza a toques.
 * @param {Page} page
 */
async function abrir(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const demo = page.locator('[data-demo]');
  await expect(demo).toHaveAttribute('data-viva', '');
  return demo;
}

/**
 * Abre la pagina con el reloj puesto y detenido: la historia solo avanza cuando la prueba adelanta el reloj.
 * @param {Page} page
 */
async function abrirDetenida(page) {
  const hora = new Date('2026-03-02T10:00:00');
  await page.clock.install({ time: hora });
  await page.clock.pauseAt(new Date(hora.getTime() + 60_000));
  await page.goto('./');
  const demo = page.locator('[data-demo]');
  await expect(demo).toHaveAttribute('data-viva', '');
  return demo;
}

/**
 * Deja el celular de la demostracion a media pantalla.
 * @param {Locator} demo
 */
async function alCentro(demo) {
  await demo.locator('[data-demo-tel]').evaluate((tel) => tel.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

/**
 * Con el reloj detenido: deja el celular a la vista y espera a que la historia pueda correr.
 * @param {Locator} demo
 */
async function aLaVista(demo) {
  await alCentro(demo);
  await expect(demo).toHaveAttribute('data-corre', '');
}

/**
 * Con el reloj detenido: lo adelanta, a pasos chicos, hasta que la historia llega a un paso.
 * @param {Page} page
 * @param {Locator} demo
 * @param {string} paso
 */
async function hastaElPaso(page, demo, paso) {
  for (let vuelta = 0; vuelta < 400; vuelta++) {
    if ((await demo.getAttribute('data-paso')) === paso) return;
    await page.clock.runFor(150);
  }
  throw new Error(`La historia no llego a "${paso}"`);
}

/**
 * Con el reloj detenido: lo adelanta hasta que algo de la demostracion aparece.
 * @param {Page} page
 * @param {Locator} que
 */
async function hastaQueAparece(page, que) {
  for (let vuelta = 0; vuelta < 400; vuelta++) {
    if ((await que.count()) > 0) return;
    await page.clock.runFor(150);
  }
  throw new Error('Lo que se esperaba no aparecio');
}

/** @param {Locator} demo */
const botonDePausa = (demo) => demo.locator('[data-demo-pausa]');
/** @param {Locator} demo  @param {string} nombre */
const rayita = (demo, nombre) => demo.getByRole('button', { name: nombre, exact: true });
/** @param {Locator} demo  @param {'cita' | 'pago' | 'asistencia'} cual */
const tarjeta = (demo, cual) => demo.locator(`[data-demo-tarjeta="${cual}"]`);
/** @param {Locator} demo */
const chatDe = (demo) => demo.locator('[data-demo-hilo]');

/**
 * Con menos movimiento: toca el boton las veces que haga falta para llegar a una parada (contadas desde el reposo).
 * @param {Locator} demo
 * @param {number} cuantas
 */
async function avanzarParadas(demo, cuantas) {
  for (let parada = 0; parada < cuantas; parada++) await botonDePausa(demo).click();
}

/**
 * Elige un ejemplo en el selector.
 * @param {Locator} demo
 * @param {string} nombre
 * @param {string} clave
 */
async function elegir(demo, nombre, clave) {
  await demo
    .getByRole('group', { name: 'Mira el ejemplo de tu oficio' })
    .getByRole('button', { name: nombre, exact: true })
    .click();
  await expect(demo).toHaveAttribute('data-ejemplo', clave);
}

/**
 * El letrero del momento: su rotulo y su texto.
 * @param {Locator} demo
 * @param {string} rotulo
 * @param {string} texto
 */
async function letreroDice(demo, rotulo, texto) {
  await expect(demo.locator('.guia__rotulo')).toHaveText(rotulo);
  await expect(demo.locator('.guia__texto')).toHaveText(texto);
}

/**
 * Como van las seis rayitas.
 * @param {Locator} demo
 * @param {string} estados  una letra por rayita: h (hecha), v (la que va) o f (pendiente)
 */
async function rayitasVan(demo, estados) {
  const nombres = { h: 'hecho', v: 'va', f: 'falta' };
  const esperados = [...estados].map((letra) => nombres[/** @type {keyof typeof nombres} */ (letra)]);
  await expect
    .poll(() =>
      demo
        .locator('[data-demo-tramo]')
        .evaluateAll((tramos) => tramos.map((tramo) => tramo.getAttribute('data-estado'))),
    )
    .toEqual(esperados);
}

test('en reposo: el celular del negocio en linea, el letrero del primer momento y la cita libre; nada corre', async ({
  page,
}) => {
  const fallas = vigilar(page);
  const demo = await abrir(page);
  await alCentro(demo);
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo).toHaveAttribute('data-telefono', 'cliente');
  // Que es un ejemplo lo dice su nombre, para quien no la ve.
  await expect(page.getByRole('group', { name: 'Demostración con un salón de uñas de ejemplo.' })).toBeVisible();
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Studio Bella');
  await expect(demo.locator('[data-demo-detalle]')).toHaveText('en línea');
  await expect(demo.locator('[data-demo-iniciales]')).toHaveText('SB');
  await expect(demo.locator('[data-demo-reloj]')).toHaveText('10:12');
  await expect(demo.locator('[data-demo-borrador]')).toHaveText('Mensaje');
  await expect(chatDe(demo).locator('> *')).toHaveCount(0);
  await letreroDice(demo, '01 · Contesta', 'Escucha la nota de voz y contesta por escrito.');
  await rayitasVan(demo, 'ffffff');
  await expect(demo.getByRole('group', { name: 'Momentos de la cita' }).getByRole('button')).toHaveCount(6);
  await expect(page.locator('.llega__rotulo')).toHaveText('Mientras tanto, a ti te llega');
  const cita = tarjeta(demo, 'cita');
  await expect(cita).toBeVisible();
  await expect(cita).toContainText('Tu Google Calendar');
  await expect(cita.locator('.llega__dia')).toHaveText('JUE 19');
  await expect(cita.locator('[data-demo-cita-titulo]')).toHaveText('5:00 pm · Libre');
  await expect(cita.locator('[data-demo-cita-detalle]')).toHaveText('Tu agente solo ofrece lo que tienes libre');
  await expect(demo.locator('.sello')).toHaveCount(0);
  // De la seccion ya no estan ni la leyenda, ni los enlaces de antes, ni el recuadro de la agenda.
  await expect(page.locator('#citas')).not.toContainText(/Tócala|Ver todo solo|Reiniciar|Lo que ves tú/);
  // La seccion se llama como el producto y dice, destacado, lo que hace garantizada a la cita.
  await expect(page.locator('#citas .sobre')).toHaveText('Citas garantizadas');
  await expect(page.locator('#citas .clave__titulo')).toHaveText([
    'Primero el pago, después la cita',
    'Directo a tu cuenta',
  ]);
  await expect(page.locator('#citas .clave__texto')).toHaveText([
    'Tu agente comprueba el anticipo con Mercado Pago y solo entonces agenda.',
    'El dinero cae en tu Mercado Pago, sin pasar por nosotros. Rápido para tu clientela y con tu agenda a la segura.',
  ]);
  await expect(page.locator('#citas .clave--principal')).toHaveCount(1);
  // La transferencia va aparte y dice quien revisa y quien aprueba: ella.
  await expect(page.locator('#citas .transferencia__titulo')).toHaveText(
    '¿Prefieren transferencia? También se puede, si tú lo activas.',
  );
  await expect(page.locator('#citas .transferencia__texto')).toHaveText(
    'Tu agente te avisa cuando llega el comprobante. Tú revisas en tu banco que el depósito llegó y, solo cuando tú lo apruebas, la cita se confirma y se agenda.',
  );
  // Pidio menos movimiento: no arranca sola, y el boton dice lo que hace.
  await expect(botonDePausa(demo)).toHaveAccessibleName('Reproducir');
  await page.waitForTimeout(2500);
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo).not.toHaveAttribute('data-corre', /.*/);
  await sinFaltasDeAccesibilidad(page, '#citas');
  expect(fallas).toEqual([]);
});

test('no arranca hasta estar a la vista; ya a la vista espera cerca de un segundo y empieza con la nota de voz', async ({
  page,
}) => {
  const fallas = vigilar(page);
  const demo = await abrirDetenida(page);
  // Arriba de la pagina la demostracion no se ve: por mas que pase el tiempo, no empieza.
  await page.clock.runFor(20_000);
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo).not.toHaveAttribute('data-corre', /.*/);
  await expect(botonDePausa(demo)).toHaveAccessibleName('Pausar');
  await aLaVista(demo);
  await page.clock.runFor(ESPERA_PARA_EMPEZAR - 100);
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await page.clock.runFor(200);
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect(demo).toHaveAttribute('data-momento', '1');
  await expect(chatDe(demo).locator('.wa__aviso')).toHaveText('Hoy');
  await rayitasVan(demo, 'vfffff');
  // La nota de voz: se ve como una nota, y a quien no la ve se le dice que es y que dice.
  await page.clock.runFor(hastaLaToma(2));
  const nota = chatDe(demo).locator('.wa__m--voz');
  await expect(nota).toBeVisible();
  await expect(nota.locator('.solo-lector')).toHaveText('Nota de voz de Ana: «Hola, ¿cuánto cuesta el gelish?»');
  await expect(nota.locator('.wa__voz')).toHaveAttribute('aria-hidden', 'true');
  await expect(nota.locator('.wa__voz')).toContainText('0:06');
  await expect(nota.locator('.wa__voz')).toContainText('10:12 a. m.');
  await expect(nota.locator('.wa__voz-foto')).toHaveText('A');
  // Lo que dijo solo va en ese renglon para quien no la ve: a la vista es una nota de voz, no un texto.
  await expect(nota.locator('.wa__voz')).not.toContainText('cuánto cuesta');
  // El agente redacta (la cabecera lo dice) y contesta por escrito.
  await page.clock.runFor(hastaLaToma(3) - hastaLaToma(2));
  await expect(demo.locator('[data-demo-detalle]')).toHaveText('escribiendo…');
  await page.clock.runFor(hastaLaToma(4) - hastaLaToma(3));
  await expect(demo.locator('[data-demo-detalle]')).toHaveText('en línea');
  await expect(chatDe(demo).locator('.wa__m--entra')).toHaveText(
    /^Marifer: ¡Hola! Soy Marifer, la asistente virtual de Studio Bella\. El gelish semipermanente cuesta \$350/,
  );
  await expect(chatDe(demo)).not.toContainText('PERSONA');
  expect(fallas).toEqual([]);
});

test('con el reloj de verdad tambien arranca sola al quedar a la vista', async ({ page }) => {
  await page.goto('./');
  const demo = page.locator('[data-demo]');
  await expect(demo).toHaveAttribute('data-viva', '');
  await alCentro(demo);
  await expect(demo).toHaveAttribute('data-paso', 'precio', { timeout: 15_000 });
  await expect(chatDe(demo).locator('.wa__m--voz')).toBeVisible({ timeout: 15_000 });
});

test('corre sola hasta el final, sin tocar nada, en lo que dura la historia', async ({ page }) => {
  const fallas = vigilar(page);
  const total = duracionDe(HISTORIA);
  expect(total).toBeGreaterThanOrEqual(35_000);
  expect(total).toBeLessThanOrEqual(45_000);
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  // Poco antes de lo que dura, todavia no cierra: va en el registro de la asistencia, con el si que tomo sola.
  await page.clock.runFor(ESPERA_PARA_EMPEZAR + total - 1000);
  await expect(demo).toHaveAttribute('data-paso', 'finSi');
  await letreroDice(demo, '06 · Pregunta si asistió', 'Cita completada.');
  await page.clock.runFor(1100);
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await letreroDice(demo, '06 · Pregunta si asistió', 'Así llega una cita garantizada.');
  await rayitasVan(demo, 'hhhhhh');
  await expect(botonDePausa(demo)).toHaveAccessibleName('Ver otra vez');
  await expect(botonDePausa(demo)).toHaveAttribute('data-estado', 'fin');
  // El celular quedo siendo el de la profesional, con su respuesta y el registro.
  await expect(demo).toHaveAttribute('data-telefono', 'profesional');
  await expect(chatDe(demo).locator('> *')).toHaveText([
    'Ahora eres tú. Al terminar la cita, tu agente te escribe.',
    /^Marifer: ¡Hola! ¿Asistió Ana a su cita de Gelish semipermanente hoy a las 5:00 pm\?/,
    /^Bella: Sí/,
    /^Marifer: Listo, registré que Ana sí asistió a su cita de Gelish semipermanente hoy a las 5:00 pm\./,
  ]);
  await expect(tarjeta(demo, 'asistencia')).toHaveAttribute('data-estado', 'asistio');
  await expect(tarjeta(demo, 'asistencia').locator('.llega__fue')).toHaveText('Asistió');
  // Ya terminada, no vuelve a empezar sola.
  await page.clock.runFor(60_000);
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  expect(fallas).toEqual([]);
});

test('al cobrar se ve, en este orden: el link, el pago aprobado, el dinero, la cita en su calendario y el sello', async ({
  page,
}) => {
  test.slow(); // varios momentos de la historia, con el reloj en la mano
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await hastaElPaso(page, demo, 'apartado');
  // Un observador anota cuando aparece cada cosa, para comprobar el orden.
  await page.evaluate(() => {
    const raiz = /** @type {HTMLElement} */ (document.querySelector('[data-demo]'));
    /** @type {string[]} */
    const orden = [];
    const mirar = () => {
      const anota = (/** @type {string} */ que) => !orden.includes(que) && orden.push(que);
      const dice = (/** @type {string} */ donde) => raiz.querySelector(donde)?.textContent ?? '';
      if (raiz.querySelector('.wa__liga')) anota('link');
      if (raiz.querySelector('.wa[data-hoja]')) anota('aprobado');
      if (dice('.guia__texto').includes('Mercado Pago')) anota('dinero');
      if (dice('[data-demo-cita-titulo]').includes('Ana')) anota('cita');
      if (raiz.querySelector('[data-demo-tarjeta="cita"] .sello')) anota('sello');
      if (dice('[data-demo-hilo]').includes('quedó confirmada')) anota('confirmacion');
      // Solo se escribe si cambio: escribir siempre volveria a despertar al observador sin fin.
      const visto = orden.join(' ');
      if (raiz.dataset.orden !== visto) raiz.dataset.orden = visto;
    };
    new MutationObserver(mirar).observe(raiz, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
  // Apartada no es confirmada: el lugar se guarda mientras paga.
  await hastaQueAparece(page, chatDe(demo).locator('.wa__liga'));
  const apartado = chatDe(demo).locator('.wa__m--entra').last();
  await expect(apartado).toContainText('¡Listo! Te aparté el lugar para el jueves a las 5:00 pm.');
  await expect(apartado.locator('.wa__liga')).toHaveText(
    /Anticipo Gelish semipermanente\s*\$150\s*mercadopago\.com\.mx/,
  );
  await expect(chatDe(demo)).not.toContainText('quedó confirmada');
  await letreroDice(demo, '03 · Cobra el anticipo', 'Lugar apartado unos minutos, mientras paga.');
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('5:00 pm · Apartado');
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-detalle]')).toHaveText('Unos minutos, mientras paga');
  await expect(tarjeta(demo, 'cita')).toHaveAttribute('data-turno', '');
  await expect(demo.locator('.wa__hoja')).toBeHidden();
  // El pago se aprueba: sube la hoja, y lo que le llega a ella es su dinero.
  await hastaElPaso(page, demo, 'pagado');
  const hoja = demo.locator('.wa__hoja');
  await expect(hoja).toBeVisible();
  await expect(hoja).toHaveText(/Pago aprobado\s*\$150\s*Anticipo Gelish semipermanente · Studio Bella/);
  await letreroDice(demo, '03 · Cobra el anticipo', '$150 de anticipo, directo en tu Mercado Pago.');
  await expect(tarjeta(demo, 'pago')).toHaveAttribute('data-turno', '');
  await expect(tarjeta(demo, 'pago')).toBeVisible();
  await expect(tarjeta(demo, 'pago')).toHaveText(/Tu Mercado Pago\s*Recibiste \$150\s*Anticipo de Ana · Gelish/);
  await expect(tarjeta(demo, 'pago')).not.toHaveAttribute('aria-hidden', /.*/);
  await expect(demo.locator('.sello')).toHaveCount(0);
  // Se queda unos dos segundos y baja; entonces la cita entra al calendario, con su sello, y el agente la confirma.
  await page.clock.runFor(1900);
  await expect(demo.locator('.wa')).toHaveAttribute('data-hoja', '');
  await page.clock.runFor(700);
  await expect(demo.locator('.wa')).not.toHaveAttribute('data-hoja', /.*/);
  await expect(hoja).toBeHidden();
  await expect(demo).toHaveAttribute('data-momento', '4');
  await letreroDice(demo, '04 · Agenda', 'La cita entra sola a tu calendario, ya garantizada.');
  await expect(tarjeta(demo, 'cita')).toHaveAttribute('data-turno', '');
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('5:00 pm · Ana');
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-detalle]')).toHaveText('Gelish semipermanente');
  await expect(demo.getByRole('img', { name: 'Garantizada: anticipo pagado' })).toBeVisible();
  await hastaQueAparece(page, chatDe(demo).getByText('quedó confirmada'));
  await expect(chatDe(demo).locator('.wa__m--entra').last()).toContainText(
    '¡Listo, Ana! Recibimos tu anticipo de $150 y tu cita de Gelish semipermanente quedó confirmada para el jueves a las 5:00 pm.',
  );
  await expect(demo).toHaveAttribute('data-orden', 'link aprobado dinero cita sello confirmacion');
});

test('la pausa detiene la historia donde va, y continuar la sigue desde ahi', async ({ page }) => {
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await hastaElPaso(page, demo, 'precio');
  await page.clock.runFor(hastaLaToma(2));
  const pausa = botonDePausa(demo);
  await expect(pausa).toHaveAccessibleName('Pausar');
  await expect(pausa).toHaveAttribute('data-estado', 'corre');
  await pausa.click();
  await expect(pausa).toHaveAccessibleName('Continuar');
  await expect(pausa).toHaveAttribute('data-estado', 'pausa');
  await expect(demo).not.toHaveAttribute('data-corre', /.*/);
  const antes = await chatDe(demo).locator('> *').count();
  await page.clock.runFor(60_000);
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect(chatDe(demo).locator('> *')).toHaveCount(antes);
  await letreroDice(demo, '01 · Contesta', 'Escucha la nota de voz y contesta por escrito.');
  // Al continuar sigue donde iba: lo que faltaba del primer momento, y despues el segundo.
  await pausa.click();
  await expect(pausa).toHaveAccessibleName('Pausar');
  await expect(demo).toHaveAttribute('data-corre', '');
  await hastaElPaso(page, demo, 'horarios');
  await expect(chatDe(demo).locator('.wa__m--entra')).toHaveCount(1);
  await letreroDice(demo, '02 · Ofrece horarios', 'Solo los horarios libres de tu Google Calendar.');
});

test('pausada antes de empezar no arranca sola; al continuar empieza', async ({ page }) => {
  const demo = await abrirDetenida(page);
  await botonDePausa(demo).click();
  await expect(botonDePausa(demo)).toHaveAccessibleName('Continuar');
  await alCentro(demo);
  await page.clock.runFor(30_000);
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await botonDePausa(demo).click();
  await expect(demo).toHaveAttribute('data-corre', '');
  await hastaElPaso(page, demo, 'precio');
});

test('si la visitante se va con el scroll la historia se detiene, y al regresar sigue donde iba', async ({ page }) => {
  test.slow(); // varios momentos de la historia, con el reloj en la mano
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await hastaElPaso(page, demo, 'horarios');
  // Se va hasta arriba: el celular ya no se ve.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(demo).not.toHaveAttribute('data-corre', /.*/);
  const antes = await chatDe(demo).locator('> *').count();
  await page.clock.runFor(60_000);
  await expect(demo).toHaveAttribute('data-paso', 'horarios');
  await expect(chatDe(demo).locator('> *')).toHaveCount(antes);
  // El boton no cambio: ella no la pauso.
  await expect(botonDePausa(demo)).toHaveAccessibleName('Pausar');
  await aLaVista(demo);
  await hastaElPaso(page, demo, 'apartado');
  // Si ella la pauso, regresar a verla no la echa a andar.
  await botonDePausa(demo).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await alCentro(demo);
  await page.clock.runFor(30_000);
  await expect(demo).toHaveAttribute('data-paso', 'apartado');
  await expect(botonDePausa(demo)).toHaveAccessibleName('Continuar');
});

test('una rayita brinca al principio de su momento, con lo anterior ya escrito, y de ahi la historia sigue', async ({
  page,
}) => {
  test.slow(); // la historia casi entera, con el reloj en la mano
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await hastaElPaso(page, demo, 'precio');
  await rayita(demo, '04 Agenda').click();
  await expect(demo).toHaveAttribute('data-momento', '4');
  await expect(demo).toHaveAttribute('data-paso', 'pagado');
  await rayitasVan(demo, 'hhhvff');
  await expect(rayita(demo, '04 Agenda')).toHaveAttribute('aria-current', 'step');
  await expect(demo.locator('[aria-current]')).toHaveCount(1);
  await letreroDice(demo, '04 · Agenda', 'La cita entra sola a tu calendario, ya garantizada.');
  // Lo de los tres primeros momentos ya esta escrito: la nota de voz, el precio, los horarios y el apartado con su link.
  const chat = chatDe(demo);
  await expect(chat.locator('.wa__m--voz')).toHaveCount(1);
  await expect(chat.locator('.wa__m')).toHaveCount(6);
  await expect(chat).toContainText(
    'Te puedo ofrecer el jueves a las 10:00 am, 12:30 pm, 4:00 pm o 5:00 pm. ¿Cuál te acomoda?',
  );
  await expect(chat).toContainText('Ana: A las 5:00 pm, por favor.');
  await expect(chat.locator('.wa__liga')).toHaveCount(1);
  await expect(chat).not.toContainText('quedó confirmada');
  await expect(demo.locator('.wa__hoja')).toBeHidden();
  // Y lo que le llega a ella va al dia: el dinero ya llego y la cita ya tiene su sello.
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('5:00 pm · Ana');
  await expect(tarjeta(demo, 'cita').locator('.sello')).toHaveCount(1);
  await expect(tarjeta(demo, 'pago')).not.toHaveAttribute('data-apagada', /.*/);
  // De ahi sigue sola.
  await hastaQueAparece(page, chat.getByText('quedó confirmada'));
  await hastaElPaso(page, demo, 'recordatorios');
  // Brincar hacia atras regresa todo a como estaba entonces.
  await rayita(demo, '02 Ofrece horarios').click();
  await expect(demo).toHaveAttribute('data-momento', '2');
  await rayitasVan(demo, 'hvffff');
  await expect(chat.locator('.wa__m')).toHaveCount(2);
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('5:00 pm · Libre');
  await expect(demo.locator('.sello')).toHaveCount(0);
  await expect(tarjeta(demo, 'pago')).toHaveAttribute('data-apagada', '');
  // Y brincar con la historia pausada la echa a andar desde ahi.
  await botonDePausa(demo).click();
  await expect(botonDePausa(demo)).toHaveAccessibleName('Continuar');
  await rayita(demo, '05 Recuerda').click();
  await expect(botonDePausa(demo)).toHaveAccessibleName('Pausar');
  await expect(demo).toHaveAttribute('data-paso', 'recordatorios');
  await expect(chat.locator('.wa__aviso').last()).toHaveText('Un día antes');
  await hastaElPaso(page, demo, 'asistencia');
});

test('los recordatorios salen solos, cada uno a su hora, y el de un dia antes trae su boton', async ({ page }) => {
  const demo = await abrir(page);
  await rayita(demo, '05 Recuerda').click();
  await expect(demo).toHaveAttribute('data-paso', 'recordatorios');
  const chat = chatDe(demo);
  await expect(chat.locator('.wa__aviso')).toHaveText(['Hoy', 'Un día antes', 'Una hora antes']);
  const [diaAntes, horaAntes] = await chat
    .locator('.wa__m--entra')
    .all()
    .then((todos) => todos.slice(-2));
  if (!diaAntes || !horaAntes) throw new Error('faltan los recordatorios');
  await expect(diaAntes).toContainText(
    '¡Hola Ana! Te recordamos tu cita de Gelish semipermanente mañana jueves a las 5:00 pm. Te esperamos en Av. del Esmalte 234, colonia Bella Vista. Si necesitas mover tu cita, toca el botón de abajo y te ayudamos.',
  );
  await expect(diaAntes.locator('.wa__hora')).toHaveText('5:00 p. m.');
  await expect(diaAntes.locator('.wa__boton')).toHaveText('Cambiar cita');
  // Ese boton es una muestra: en la conversacion no hay nada que tocar.
  await expect(chat.getByRole('button')).toHaveCount(0);
  await expect(horaAntes).toContainText('Ya casi es tu cita de Gelish semipermanente, hoy a las 5:00 pm.');
  await expect(horaAntes.locator('.wa__hora')).toHaveText('4:00 p. m.');
  // La barra del celular ensena la hora del ultimo mensaje.
  await expect(demo.locator('[data-demo-reloj]')).toHaveText('4:00');
  await letreroDice(demo, '05 · Recuerda', 'Los recordatorios salen solos. Tú no haces nada.');
  // Lo que manda la clienta lleva sus palomitas; lo del agente, no.
  await expect(chat.locator('.wa__m--sale .wa__tics')).toHaveCount(3);
  await expect(chat.locator('.wa__m--entra .wa__tics')).toHaveCount(0);
  await expect(chat.locator('.wa__m--sale .wa__hora')).toHaveText(['10:12 a. m.', '10:13 a. m.', '10:13 a. m.']);
});

test('lo que manda la clienta se escribe primero en la caja de Mensaje y luego sale como globo', async ({ page }) => {
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await hastaElPaso(page, demo, 'horarios');
  const borrador = demo.locator('[data-demo-borrador]');
  const pie = demo.locator('[data-demo-pie]');
  // La caja y su microfono son de adorno: no se le leen a nadie ni se tocan.
  await expect(pie).toHaveAttribute('aria-hidden', 'true');
  await expect(borrador).toHaveText('Sí, ¿tienes lugar el jueves?');
  await expect(pie).toHaveAttribute('data-teclea', '');
  await expect(chatDe(demo)).not.toContainText('¿tienes lugar el jueves?');
  await page.clock.runFor(1000);
  await expect(borrador).toHaveText('Mensaje');
  await expect(pie).not.toHaveAttribute('data-teclea', /.*/);
  await expect(chatDe(demo).locator('.wa__m--sale').last()).toHaveText(
    /^Ana: Sí, ¿tienes lugar el jueves\?10:13 a\. m\.$/,
  );
});

test('en el sexto momento el celular es el de la profesional: su agente le pregunta y ella toca si o no', async ({
  page,
}) => {
  const demo = await abrir(page);
  await rayita(demo, '06 Pregunta si asistió').click();
  await expect(demo).toHaveAttribute('data-paso', 'asistencia');
  await expect(demo).toHaveAttribute('data-telefono', 'profesional');
  await expect(demo.locator('[data-demo-iniciales]')).toHaveText('PM');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Tu agente');
  await expect(demo.locator('[data-demo-detalle]')).toHaveText('Studio Bella');
  await expect(demo.locator('[data-demo-reloj]')).toHaveText('6:05');
  const chat = chatDe(demo);
  // La conversacion empieza limpia: de la platica con Ana ya no queda nada.
  await expect(chat.locator('> *')).toHaveCount(3);
  await expect(chat.locator('.wa__aviso--tu')).toHaveText('Ahora eres tú. Al terminar la cita, tu agente te escribe.');
  await expect(chat.locator('.wa__m--entra')).toHaveText(
    /^Marifer: ¡Hola! ¿Asistió Ana a su cita de Gelish semipermanente hoy a las 5:00 pm\? Toca un botón y lo dejo registrado\.6:05 p\. m\.$/,
  );
  await expect(chat).not.toContainText('quedó confirmada');
  await expect(chat.getByRole('button')).toHaveText(['Sí', 'No']);
  await letreroDice(demo, '06 · Pregunta si asistió', 'Tu única tarea: tocar sí o no.');
  await rayitasVan(demo, 'hhhhhv');
  const asistencia = tarjeta(demo, 'asistencia');
  await expect(asistencia).toHaveAttribute('data-turno', '');
  await expect(asistencia).toBeVisible();
  await expect(asistencia).toContainText('Tu WhatsApp personal');
  await expect(asistencia.locator('[data-demo-asistencia-titulo]')).toHaveText('¿Asistió Ana?');
  await expect(asistencia.locator('.llega__sino')).toHaveText(/Sí\s*No/);
  // Las respuestas de la tarjeta son un reflejo: lo que se toca esta en el celular.
  await expect(asistencia.getByRole('button')).toHaveCount(0);
  // La cita sigue garantizada, con su sello.
  await expect(tarjeta(demo, 'cita').locator('.sello')).toHaveCount(1);
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('si asistio: queda registrado, la cita se completa y la historia cierra invitando a verla otra vez', async ({
  page,
}) => {
  const demo = await abrir(page);
  await rayita(demo, '06 Pregunta si asistió').click();
  await chatDe(demo).getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finSi');
  const chat = chatDe(demo);
  await expect(chat.getByRole('button')).toHaveCount(0);
  await expect(chat.locator('.wa__m--sale')).toHaveText(/^Bella: Sí6:05 p\. m\.$/);
  await expect(chat.locator('.wa__m--entra').last()).toContainText(
    'Listo, registré que Ana sí asistió a su cita de Gelish semipermanente hoy a las 5:00 pm. Le mandé las gracias y la invité a agendar su siguiente cita.',
  );
  await letreroDice(demo, '06 · Pregunta si asistió', 'Cita completada.');
  await rayitasVan(demo, 'hhhhhh');
  const asistencia = tarjeta(demo, 'asistencia');
  await expect(asistencia).toHaveAttribute('data-estado', 'asistio');
  await expect(asistencia.locator('.llega__fue')).toHaveText('Asistió');
  await expect(asistencia.locator('.llega__fue')).toBeVisible();
  await expect(asistencia.locator('.llega__sino')).toBeHidden();
  await sinFaltasDeAccesibilidad(page, '#citas');
  // La historia cierra, y el boton de la pausa se vuelve "Ver otra vez".
  await botonDePausa(demo).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await letreroDice(demo, '06 · Pregunta si asistió', 'Así llega una cita garantizada.');
  await expect(botonDePausa(demo)).toHaveAccessibleName('Ver otra vez');
  // El cuadro final de antes ya no va: dentro de la demostracion no hay otro boton de empezar.
  await expect(demo.getByRole('link')).toHaveCount(0);
  await expect(page.locator('.garantia__acciones').getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute(
    'href',
    ALTA,
  );
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('si no asistio: el anticipo se queda con ella segun su politica', async ({ page }) => {
  const demo = await abrir(page);
  await rayita(demo, '06 Pregunta si asistió').click();
  await chatDe(demo).getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  const chat = chatDe(demo);
  await expect(chat.locator('.wa__m--sale')).toHaveText(/^Bella: No6:05 p\. m\.$/);
  await expect(chat.locator('.wa__m--entra').last()).toContainText(
    'Listo, registré que Ana no asistió a su cita de Gelish semipermanente hoy a las 5:00 pm. Su anticipo de $150 queda retenido y le ofrecí reagendar.',
  );
  await letreroDice(demo, '06 · Pregunta si asistió', 'El anticipo se queda contigo, según tu política.');
  const asistencia = tarjeta(demo, 'asistencia');
  await expect(asistencia).toHaveAttribute('data-estado', 'falto');
  await expect(asistencia.locator('.llega__fue')).toHaveText('No asistió');
  // Con menos movimiento el final no pasa de largo: espera a que ella avance.
  await page.waitForTimeout(1500);
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await sinFaltasDeAccesibilidad(page, '#citas');
  await botonDePausa(demo).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await letreroDice(demo, '06 · Pregunta si asistió', 'Así llega una cita garantizada.');
  await expect(asistencia.locator('.llega__fue')).toHaveText('No asistió');
});

test('la pregunta espera unos cinco segundos: si nadie toca toma el si, y si ella toca no, es no', async ({ page }) => {
  test.slow(); // dos veces el final de la historia, con el reloj en la mano
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await rayita(demo, '06 Pregunta si asistió').click();
  const respuestas = chatDe(demo).locator('.wa__respuestas');
  await hastaQueAparece(page, respuestas);
  // A los cuatro segundos y medio sigue esperando; pasado el quinto, toma el si.
  await page.clock.runFor(4500);
  await expect(demo).toHaveAttribute('data-paso', 'asistencia');
  await expect(respuestas).toHaveCount(1);
  await page.clock.runFor(700);
  await expect(demo).toHaveAttribute('data-paso', 'finSi');
  await expect(chatDe(demo).locator('.wa__m--sale')).toHaveText(/^Bella: Sí/);
  // Y sola llega al cierre.
  await hastaElPaso(page, demo, 'cierre');
  // Desde el cierre, la rayita vuelve a hacer la pregunta: ahora ella toca que no, antes de que venza.
  await rayita(demo, '06 Pregunta si asistió').click();
  await hastaQueAparece(page, respuestas);
  await page.clock.runFor(2000);
  await chatDe(demo).getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await page.clock.runFor(20_000);
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(tarjeta(demo, 'asistencia').locator('.llega__fue')).toHaveText('No asistió');
  await expect(chatDe(demo).locator('.wa__m--sale')).toHaveText(/^Bella: No/);
});

test('Ver otra vez vuelve a contar la historia desde el principio, limpia', async ({ page }) => {
  test.slow(); // el final de la historia y su principio, con el reloj en la mano
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await rayita(demo, '06 Pregunta si asistió').click();
  await hastaElPaso(page, demo, 'cierre');
  await botonDePausa(demo).click();
  // Regresa al reposo: el celular del negocio, la conversacion vacia, la cita libre y sin sello.
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo).toHaveAttribute('data-telefono', 'cliente');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Studio Bella');
  await expect(demo.locator('[data-demo-reloj]')).toHaveText('10:12');
  await expect(chatDe(demo).locator('> *')).toHaveCount(0);
  await expect(demo.locator('.sello')).toHaveCount(0);
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('5:00 pm · Libre');
  await expect(tarjeta(demo, 'cita')).toHaveAttribute('data-turno', '');
  await expect(tarjeta(demo, 'asistencia')).toHaveAttribute('data-estado', 'espera');
  await rayitasVan(demo, 'ffffff');
  await letreroDice(demo, '01 · Contesta', 'Escucha la nota de voz y contesta por escrito.');
  await expect(botonDePausa(demo)).toHaveAccessibleName('Pausar');
  // Y vuelve a correr sola.
  await hastaElPaso(page, demo, 'precio');
  await hastaElPaso(page, demo, 'horarios');
});

test('con menos movimiento no corre sola: avanza de parada en parada, completa, hasta el cierre', async ({ page }) => {
  const fallas = vigilar(page);
  const demo = await abrir(page);
  await alCentro(demo);
  const pausa = botonDePausa(demo);
  for (const [paso, rotulo, texto] of PARADAS) {
    await expect(pausa).toHaveAccessibleName('Reproducir');
    await expect(pausa).toHaveAttribute('data-estado', 'pausa');
    await pausa.click();
    await expect(demo).toHaveAttribute('data-paso', paso);
    await letreroDice(demo, rotulo, texto);
    // Cada parada espera a la visitante: nada avanza solo.
    if (paso === 'horarios' || paso === 'asistencia') {
      await page.waitForTimeout(1200);
      await expect(demo).toHaveAttribute('data-paso', paso);
    }
    // El pago aprobado se queda a la vista, quieto, hasta que ella avanza.
    await expect(demo.locator('.wa__hoja')).toBeVisible({ visible: paso === 'pagado' && rotulo.startsWith('03') });
  }
  await expect(pausa).toHaveAccessibleName('Ver otra vez');
  await rayitasVan(demo, 'hhhhhh');
  // La historia llego completa: la parada de la asistencia tomo el si.
  await expect(tarjeta(demo, 'asistencia').locator('.llega__fue')).toHaveText('Asistió');
  // Ver otra vez pinta de una vez el primer momento, y una rayita pinta el suyo completo.
  await pausa.click();
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect(chatDe(demo).locator('.wa__m')).toHaveCount(2);
  await rayita(demo, '03 Cobra el anticipo').click();
  await expect(demo).toHaveAttribute('data-paso', 'apartado');
  await expect(chatDe(demo).locator('.wa__liga')).toHaveCount(1);
  await expect(chatDe(demo).locator('.wa__m')).toHaveCount(6);
  await expect(pausa).toHaveAccessibleName('Reproducir');
  expect(fallas).toEqual([]);
});

test('con menos movimiento no hay animaciones ni transiciones, y la historia sigue completa', async ({ page }) => {
  const demo = await abrir(page);
  await alCentro(demo);
  // Hasta el pago aprobado, con la hoja arriba.
  await avanzarParadas(demo, 4);
  await expect(demo.locator('.wa__hoja')).toBeVisible();
  // Y hasta la cita garantizada, con su sello.
  await avanzarParadas(demo, 1);
  await expect(tarjeta(demo, 'cita').locator('.sello')).toBeVisible();
  const movimiento = await page.evaluate(() => {
    const piezas = document.querySelectorAll(
      '.demo, .demo__ejemplo, .tel, .wa, .wa__m, .wa__aviso, .wa__hoja, .wa__velo, .wa__onda-oida, .wa__borrador bdi, .guia__texto, .guia__rotulo, .guia__raya, .guia__lleno, .guia__pausa, .llega__tarjeta, .llega__tarjeta .sello',
    );
    const estilos = [...piezas].map((pieza) => getComputedStyle(pieza));
    return {
      piezas: piezas.length,
      animaciones: [...new Set(estilos.map((estilo) => estilo.animationName))],
      transiciones: [...new Set(estilos.map((estilo) => estilo.transitionDuration))],
      // Tampoco las que se echan a andar desde el codigo (la conversacion que sube, la rayita que se llena).
      corriendo: document.querySelector('[data-demo]')?.getAnimations({ subtree: true }).length,
    };
  });
  expect(movimiento.piezas).toBeGreaterThan(20);
  expect(movimiento).toMatchObject({ animaciones: ['none'], transiciones: ['0s'], corriendo: 0 });
  // La rayita del momento que va se ve llena: no hay nada llenandose.
  await rayitasVan(demo, 'hhhvff');
});

test('elegir Dentista cambia el celular, la ficha del dia y las tarjetas, y la historia corre de nuevo con el', async ({
  page,
}) => {
  const fallas = vigilar(page);
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await hastaElPaso(page, demo, 'horarios');
  const selector = demo.getByRole('group', { name: 'Mira el ejemplo de tu oficio' });
  await expect(selector.getByRole('button')).toHaveText(['Uñas', 'Dentista', 'Médico']);
  await expect(selector.getByRole('button', { name: 'Uñas' })).toHaveAttribute('aria-pressed', 'true');
  await elegir(demo, 'Dentista', 'dentista');
  await expect(selector.getByRole('button', { name: 'Dentista' })).toHaveAttribute('aria-pressed', 'true');
  await expect(selector.locator('[aria-pressed="true"]')).toHaveCount(1);
  // La historia vuelve al principio con ese oficio.
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(page.getByRole('group', { name: 'Demostración con un consultorio dental de ejemplo.' })).toBeVisible();
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Dental Sonría');
  await expect(demo.locator('[data-demo-iniciales]')).toHaveText('DS');
  await expect(demo.locator('[data-demo-detalle]')).toHaveText('en línea');
  await expect(chatDe(demo).locator('> *')).toHaveCount(0);
  await expect(tarjeta(demo, 'cita').locator('.llega__dia')).toHaveText('MIÉ 18');
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('4:00 pm · Libre');
  await rayitasVan(demo, 'ffffff');
  await expect(botonDePausa(demo)).toHaveAccessibleName('Pausar');
  // Y vuelve a correr sola, con su nota de voz.
  await hastaQueAparece(page, chatDe(demo).locator('.wa__m--voz'));
  await expect(chatDe(demo).locator('.wa__m--voz .solo-lector')).toHaveText(
    'Nota de voz de Carla: «Hola, ¿cuánto cuesta la limpieza dental?»',
  );
  await expect(chatDe(demo).locator('.wa__voz-foto')).toHaveText('C');
  // Elegir el que ya esta puesto no mueve nada.
  const van = await chatDe(demo).locator('> *').count();
  await selector.getByRole('button', { name: 'Dentista' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect(chatDe(demo).locator('> *')).toHaveCount(van);
  expect(fallas).toEqual([]);
});

test('la historia de Dentista llega al pago de $200 y a su pregunta de asistencia, sin decirle clienta a nadie', async ({
  page,
}) => {
  const demo = await abrir(page);
  await elegir(demo, 'Dentista', 'dentista');
  // Pidio menos movimiento: cambiar de ejemplo la deja en reposo, lista para reproducir.
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(botonDePausa(demo)).toHaveAccessibleName('Reproducir');
  const chat = chatDe(demo);
  await avanzarParadas(demo, 3);
  await expect(chat).toContainText('Sofi: ¡Hola! Soy Sofi, la asistente virtual de Dental Sonría.');
  await expect(chat).toContainText('La limpieza dental cuesta $650');
  await expect(chat).toContainText(
    'Te puedo ofrecer el miércoles a las 9:00 am, 11:30 am, 4:00 pm o 6:00 pm. ¿Cuál te acomoda?',
  );
  await expect(chat).toContainText('Carla: A las 4:00 pm, por favor.');
  await expect(chat).toContainText('te aparté el lugar para el miércoles a las 4:00 pm');
  await expect(chat.locator('.wa__liga')).toHaveText(/Anticipo Limpieza dental\s*\$200\s*mercadopago\.com\.mx/);
  await expect(chat).not.toContainText(/PERSONA|prefieres hablar/);
  await avanzarParadas(demo, 1);
  await expect(demo.locator('.wa__hoja')).toHaveText(
    /Pago aprobado\s*\$200\s*Anticipo Limpieza dental · Dental Sonría/,
  );
  await letreroDice(demo, '03 · Cobra el anticipo', '$200 de anticipo, directo en tu Mercado Pago.');
  await expect(tarjeta(demo, 'pago')).toHaveText(/Recibiste \$200\s*Anticipo de Carla · Limpieza/);
  await avanzarParadas(demo, 1);
  await expect(chat).toContainText(
    '¡Listo, Carla! Recibimos tu anticipo de $200 y tu cita de Limpieza dental quedó confirmada para el miércoles a las 4:00 pm. Te esperamos en Av. de la Sonrisa 100, colonia Providencia.',
  );
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('4:00 pm · Carla');
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-detalle]')).toHaveText('Limpieza dental');
  await expect(tarjeta(demo, 'cita').locator('.sello')).toBeVisible();
  await avanzarParadas(demo, 1);
  await expect(chat).toContainText(
    '¡Hola Carla! Te recordamos tu cita de Limpieza dental mañana miércoles a las 4:00 pm.',
  );
  await expect(chat.locator('.wa__m--entra .wa__hora').last()).toHaveText('3:00 p. m.');
  await avanzarParadas(demo, 1);
  // El celular del doctor: le escribe su agente.
  await expect(demo).toHaveAttribute('data-telefono', 'profesional');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Tu agente');
  await expect(demo.locator('[data-demo-detalle]')).toHaveText('Dental Sonría');
  await expect(chat).toContainText(
    'Sofi: ¡Hola! ¿Asistió Carla a su cita de Limpieza dental hoy a las 4:00 pm? Toca un botón y lo dejo registrado.',
  );
  await expect(chat.locator('.wa__m--entra .wa__hora')).toHaveText('5:05 p. m.');
  await expect(tarjeta(demo, 'asistencia').locator('[data-demo-asistencia-titulo]')).toHaveText('¿Asistió Carla?');
  await chat.getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await expect(chat).toContainText('Dr. Robles: No');
  await expect(chat).toContainText('Su anticipo de $200 queda retenido y le ofrecí reagendar.');
  // En salud a nadie se le dice clienta: ni en la conversacion, ni en el letrero, ni en las tarjetas.
  for (const pieza of [chat, demo.locator('.guia'), demo.locator('.llega')]) {
    await expect(pieza).not.toContainText(/clienta/i);
  }
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('la historia de Médico platica en la tarde, con su consultorio y su ficha del lunes', async ({ page }) => {
  const demo = await abrir(page);
  await elegir(demo, 'Médico', 'medico');
  await expect(page.getByRole('group', { name: 'Demostración con un consultorio médico de ejemplo.' })).toBeVisible();
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Consultorio Médico Aurora');
  await expect(demo.locator('[data-demo-iniciales]')).toHaveText('CM');
  await expect(tarjeta(demo, 'cita').locator('.llega__dia')).toHaveText('LUN 23');
  await expect(demo.locator('[data-demo-reloj]')).toHaveText('12:42');
  await avanzarParadas(demo, 1);
  const chat = chatDe(demo);
  await expect(chat.locator('.wa__m--voz .solo-lector')).toHaveText(
    'Nota de voz de Paty: «Buenas tardes, ¿cuánto cuesta la consulta?»',
  );
  await expect(chat).toContainText(
    'Elena: Buenas tardes. Soy Elena, la asistente virtual del Consultorio Médico Aurora.',
  );
  await expect(chat.locator('.wa__m--entra .wa__hora')).toHaveText('12:42 p. m.');
  await rayita(demo, '04 Agenda').click();
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-titulo]')).toHaveText('4:30 pm · Paty');
  await expect(tarjeta(demo, 'cita').locator('[data-demo-cita-detalle]')).toHaveText('Consulta de primera vez');
  await expect(tarjeta(demo, 'pago')).toHaveText(/Recibiste \$300\s*Anticipo de Paty · Consulta/);
  await expect(chat).toContainText('quedó confirmada para el lunes a las 4:30 pm');
  for (const pieza of [chat, demo.locator('.guia'), demo.locator('.llega')]) {
    await expect(pieza).not.toContainText(/clienta/i);
    await expect(pieza).not.toContainText('PERSONA');
  }
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('todo se maneja con el teclado, y el foco nunca se pierde', async ({ page }) => {
  test.slow(); // la historia completa, tecla por tecla
  const demo = await abrir(page);
  const selector = demo.getByRole('group', { name: 'Mira el ejemplo de tu oficio' });
  const pausa = botonDePausa(demo);
  // El orden: los tres ejemplos, las seis rayitas y la pausa.
  await selector.getByRole('button', { name: 'Uñas' }).focus();
  await page.keyboard.press('Tab');
  await expect(selector.getByRole('button', { name: 'Dentista' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(selector.getByRole('button', { name: 'Médico' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rayita(demo, '01 Contesta')).toBeFocused();
  await expect(rayita(demo, '01 Contesta')).toHaveCSS('outline-style', 'solid');
  // Una rayita se activa con Enter y conserva el foco.
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect(rayita(demo, '01 Contesta')).toBeFocused();
  for (const nombre of ['02 Ofrece horarios', '03 Cobra el anticipo', '04 Agenda', '05 Recuerda']) {
    await page.keyboard.press('Tab');
    await expect(rayita(demo, nombre)).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(rayita(demo, '06 Pregunta si asistió')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(pausa).toBeFocused();
  await expect(pausa).toHaveCSS('outline-style', 'solid');
  // La pausa se activa con Enter y con la barra de espacio, y conserva el foco.
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'horarios');
  await page.keyboard.press('Space');
  await expect(demo).toHaveAttribute('data-paso', 'apartado');
  await expect(pausa).toBeFocused();
  for (const paso of ['pagado', 'pagado', 'recordatorios', 'asistencia']) {
    await page.keyboard.press('Enter');
    await expect(demo).toHaveAttribute('data-paso', paso);
  }
  await expect(demo).toHaveAttribute('data-momento', '6');
  // Las respuestas quedan antes de las rayitas: se llega a ellas regresando.
  for (let regreso = 0; regreso < 7; regreso++) await page.keyboard.press('Shift+Tab');
  const no = chatDe(demo).getByRole('button', { name: 'No', exact: true });
  await expect(no).toBeFocused();
  await expect(no).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Shift+Tab');
  await expect(chatDe(demo).getByRole('button', { name: 'Sí', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  // Los botones de la respuesta ya no estan: el foco paso al de la pausa, no se perdio.
  await expect(pausa).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(pausa).toHaveAccessibleName('Ver otra vez');
  await expect(pausa).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect(pausa).toBeFocused();
  // Elegir un ejemplo con el teclado deja el foco en su boton.
  await selector.getByRole('button', { name: 'Médico' }).focus();
  await page.keyboard.press('Space');
  await expect(demo).toHaveAttribute('data-ejemplo', 'medico');
  await expect(selector.getByRole('button', { name: 'Médico' })).toBeFocused();
  await expect(selector.getByRole('button', { name: 'Médico' })).toHaveAttribute('aria-pressed', 'true');
  await expect(selector.getByRole('button', { name: 'Uñas' })).toHaveAttribute('aria-pressed', 'false');
});

test('con el teclado en las respuestas, la historia no contesta por ella', async ({ page }) => {
  const demo = await abrirDetenida(page);
  await aLaVista(demo);
  await rayita(demo, '06 Pregunta si asistió').click();
  const respuestas = chatDe(demo).locator('.wa__respuestas');
  await hastaQueAparece(page, respuestas);
  const si = chatDe(demo).getByRole('button', { name: 'Sí', exact: true });
  await si.focus();
  await page.clock.runFor(60_000);
  await expect(demo).toHaveAttribute('data-paso', 'asistencia');
  await expect(si).toBeFocused();
  // En cuanto suelta las respuestas, la historia retoma y toma el si.
  await botonDePausa(demo).focus();
  await hastaElPaso(page, demo, 'finSi');
});

test('todo lo que se toca mide por lo menos 44 px', async ({ page }) => {
  const demo = await abrir(page);
  await rayita(demo, '06 Pregunta si asistió').click();
  await expect(chatDe(demo).getByRole('button')).toHaveCount(2);
  const botones = await demo.getByRole('button').all();
  // Tres ejemplos, dos respuestas, seis rayitas y la pausa.
  expect(botones).toHaveLength(12);
  for (const boton of botones) {
    const caja = await boton.boundingBox();
    const nombre = (await boton.getAttribute('aria-label')) ?? (await boton.textContent());
    expect(caja?.width, `${nombre}: ancho`).toBeGreaterThanOrEqual(44);
    expect(caja?.height, `${nombre}: alto`).toBeGreaterThanOrEqual(44);
  }
  // Las rayitas se ven delgadas, pero su zona de toque no.
  const raya = await demo.locator('.guia__raya').first().boundingBox();
  expect(raya?.height).toBeLessThanOrEqual(4);
});

test('el letrero se anuncia una vez por cambio, con su rotulo, y la conversacion no es una region viva', async ({
  page,
}) => {
  const demo = await abrir(page);
  const letrero = demo.locator('[data-demo-letrero]');
  await expect(letrero).toHaveAttribute('aria-live', 'polite');
  await expect(letrero).toHaveAttribute('aria-atomic', 'true');
  // Es la unica region viva de la demostracion: los mensajes se pueden leer, pero no se anuncian uno por uno.
  await expect(demo.locator('[aria-live]')).toHaveCount(1);
  await expect(demo.getByRole('log')).toHaveCount(0);
  await expect(demo.getByRole('status')).toHaveCount(0);
  await page.evaluate(() => {
    const region = /** @type {HTMLElement} */ (document.querySelector('[data-demo-letrero]'));
    /** @type {string[]} */
    const anuncios = [];
    new MutationObserver(() => {
      anuncios.push([...region.children].map((renglon) => renglon.textContent).join(' | '));
      region.dataset.anuncios = JSON.stringify(anuncios);
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
  await avanzarParadas(demo, PARADAS.length);
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  // El letrero del primer momento ya venia escrito: se anuncian los ocho cambios que siguen, cada uno una vez.
  const anuncios = JSON.parse((await letrero.getAttribute('data-anuncios')) ?? '[]');
  expect(anuncios).toEqual(PARADAS.slice(1).map(([, rotulo, texto]) => `${rotulo} | ${texto}`));
  // La conversacion se lee completa: cada globo dice de quien es.
  await rayita(demo, '05 Recuerda').click();
  await expect(chatDe(demo).locator('.wa__m .solo-lector')).toHaveText([
    'Nota de voz de Ana: «Hola, ¿cuánto cuesta el gelish?»',
    'Marifer: ',
    'Ana: ',
    'Marifer: ',
    'Ana: ',
    'Marifer: ',
    'Marifer: ',
    'Marifer: ',
    'Marifer: ',
  ]);
});

test('las tarjetas: en celular se ve solo la del momento; en pantalla ancha las tres, apagadas las que no han pasado', async ({
  page,
}) => {
  test.slow(); // recorre todas las paradas y al final pasa el revisor de accesibilidad (en Firefox, con carga, tarda)
  const demo = await abrir(page);
  await alCentro(demo);
  const tres = await page.evaluate((ancha) => matchMedia(ancha).matches, TRES_TARJETAS);
  /** @type {['cita' | 'pago' | 'asistencia', boolean, boolean][][]} cada tarjeta: cual, si es la del momento y si ya paso */
  const porParada = [
    [
      ['cita', true, true],
      ['pago', false, false],
      ['asistencia', false, false],
    ],
    [
      ['cita', true, true],
      ['pago', false, false],
      ['asistencia', false, false],
    ],
    [
      ['cita', true, true],
      ['pago', false, false],
      ['asistencia', false, false],
    ],
    [
      ['cita', false, true],
      ['pago', true, true],
      ['asistencia', false, false],
    ],
    [
      ['cita', true, true],
      ['pago', false, true],
      ['asistencia', false, false],
    ],
    [
      ['cita', true, true],
      ['pago', false, true],
      ['asistencia', false, false],
    ],
    [
      ['cita', false, true],
      ['pago', false, true],
      ['asistencia', true, true],
    ],
  ];
  for (const [parada, estados] of porParada.entries()) {
    await botonDePausa(demo).click();
    // Con las tarjetas apagadas a la vista, tampoco hay faltas: lo que aun no pasa no es contenido.
    if (parada === 0) await sinFaltasDeAccesibilidad(page, '#citas');
    for (const [cual, delMomento, yaPaso] of estados) {
      const una = tarjeta(demo, cual);
      if (delMomento) await expect(una).toHaveAttribute('data-turno', '');
      else await expect(una).not.toHaveAttribute('data-turno', /.*/);
      // Lo que todavia no pasa no se le lee a nadie.
      if (yaPaso) await expect(una).not.toHaveAttribute('aria-hidden', /.*/);
      else await expect(una).toHaveAttribute('aria-hidden', 'true');
      await expect(una).toBeVisible({ visible: tres || delMomento });
      if (tres) await expect(una).toHaveCSS('opacity', yaPaso ? '1' : '0.34');
    }
  }
  await expect(page.locator('.llega__tarjeta').filter({ visible: true })).toHaveCount(tres ? 3 : 1);
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('el aspecto es el de WhatsApp de dia, con la letra del sistema, y el azul de la marca se guarda para el sello', async ({
  page,
}) => {
  const demo = await abrir(page);
  await rayita(demo, '04 Agenda').click();
  const pantalla = demo.locator('.wa');
  await expect(pantalla).toHaveCSS('background-color', 'rgb(239, 233, 224)');
  await expect(pantalla).toHaveCSS('color', 'rgb(17, 27, 33)');
  await expect(demo.locator('.wa__cabeza')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(chatDe(demo).locator('.wa__m--entra').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(chatDe(demo).locator('.wa__m--sale').first()).toHaveCSS('background-color', 'rgb(217, 253, 211)');
  await expect(chatDe(demo).locator('.wa__tics').first()).toHaveCSS('color', 'rgb(52, 167, 224)');
  await expect(demo.locator('.wa__mic')).toHaveCSS('background-color', 'rgb(29, 170, 97)');
  // Dentro del celular, la letra del sistema; fuera, la de la pagina. No se descarga ninguna fuente nueva.
  const letra = (/** @type {string} */ selector) =>
    page
      .locator(selector)
      .first()
      .evaluate((pieza) => getComputedStyle(pieza).fontFamily);
  expect(await letra('.wa__m')).toMatch(/^system-ui/);
  expect(await letra('.wa__m')).not.toMatch(/Outfit/);
  expect(await letra('.guia__texto')).toMatch(/Outfit/);
  expect(await letra('.llega__tarjeta')).toMatch(/Outfit/);
  const pedidos = await page.evaluate(() => performance.getEntriesByType('resource').map((recurso) => recurso.name));
  const fuentes = pedidos.filter((nombre) => /\.(woff2?|ttf|otf)(\?|$)/.test(nombre));
  expect(fuentes.filter((nombre) => !nombre.endsWith('/fuentes/outfit.woff2'))).toEqual([]);
  // El sello lleva la luz de lo ya pagado; el boton de la seccion no es azul.
  await expect(tarjeta(demo, 'cita').locator('.sello')).toHaveCSS('color', LUZ_DE_LO_PAGADO);
  await expect(page.locator('.garantia__acciones .boton')).not.toHaveCSS('background-color', AZUL_DEL_BOTON);
  // Sin logotipos ni nombres de marcas ajenas dentro del celular: solo el aspecto.
  await expect(demo.locator('.tel img, .tel image')).toHaveCount(0);
  await expect(demo.locator('.tel')).not.toContainText(/WhatsApp|Google/);
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('lo nuevo de la conversacion queda a la vista y lo viejo se va por arriba, sin nada que desplazar', async ({
  page,
}) => {
  const demo = await abrir(page);
  const chat = demo.locator('.wa__chat');
  // Con la conversacion llena: ya no cabe en el celular.
  await rayita(demo, '05 Recuerda').click();
  expect(await chat.evaluate((caja) => (caja.firstElementChild?.clientHeight ?? 0) > caja.clientHeight + 40)).toBe(
    true,
  );
  // No hay nada que desplazar dentro del celular: lo que no cabe no se alcanza ni con el dedo ni con la rueda.
  await expect(chat).toHaveCSS('overflow-y', 'hidden');
  await expect(demo.locator('.wa')).toHaveCSS('overflow-y', 'hidden');
  expect(await chat.evaluate((caja) => caja.scrollHeight - caja.clientHeight)).toBeLessThanOrEqual(0);
  // Lo ultimo se ve entero dentro de la conversacion, en cada parada de la historia.
  await botonDePausa(demo).click();
  for (const momento of ['01 Contesta', '03 Cobra el anticipo', '04 Agenda', '05 Recuerda', '06 Pregunta si asistió']) {
    await rayita(demo, momento).click();
    const ultimo = await chatDe(demo).locator('> *').last().boundingBox();
    const caja = await chat.boundingBox();
    if (!caja || !ultimo) throw new Error('no encontre la conversacion');
    expect(ultimo.y + ultimo.height, momento).toBeLessThanOrEqual(caja.y + caja.height + 0.5);
    expect(ultimo.y, momento).toBeGreaterThanOrEqual(caja.y);
  }
});

test('la conversacion no atrapa el desplazamiento de la pagina', async ({ page, browserName }, info) => {
  test.skip(browserName === 'webkit' && info.project.name !== 'escritorio', 'el telefono de WebKit no tiene rueda');
  const demo = await abrir(page);
  // Con la conversacion llena: lo viejo ya se fue por arriba.
  await rayita(demo, '05 Recuerda').click();
  const chat = demo.locator('.wa__chat');
  await chat.scrollIntoViewIfNeeded();
  const centro = await chat.boundingBox();
  if (!centro) throw new Error('no encontre la conversacion');
  await page.mouse.move(centro.x + centro.width / 2, centro.y + centro.height / 2);
  for (const tramo of [220, -160]) {
    const antes = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, tramo);
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(antes);
    expect(await chat.evaluate((pieza) => pieza.scrollTop)).toBe(0);
  }
});

test.describe('en cada ancho', () => {
  /** @type {[number, number][]} */
  const TAMANOS = [
    [360, 640],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1440, 900],
  ];
  for (const [ancho, alto] of TAMANOS) {
    test(`a ${ancho} de ancho nada se desborda, nada brinca y la cita cabe en su renglon`, async ({ page }) => {
      test.slow(); // los tres ejemplos, parada por parada, midiendo en cada una
      await page.setViewportSize({ width: ancho, height: alto });
      const demo = await abrir(page);
      /**
       * Toca algo de la demostracion y mide lo que deja, todo en un solo viaje a la pagina (aqui no se prueba el
       * toque, que tiene sus pruebas: se mide la pagina, y son muchas medidas). Devuelve por donde va la historia, si
       * algo se desborda a lo ancho, donde quedan las piezas que no deben moverse (medidas desde el principio de la
       * seccion, mas lo que mide la seccion entera: si algo cambiara de alto, lo de abajo brincaria) y, de la tarjeta
       * de la cita, sus dos renglones y su sello.
       * @param {string} [tocar]  el selector de lo que se toca antes de medir
       */
      const medir = (tocar) =>
        page.evaluate((selector) => {
          const pieza = (/** @type {string} */ cual) => /** @type {HTMLElement} */ (document.querySelector(cual));
          if (selector) pieza(selector).click();
          const raiz = pieza('[data-demo]');
          const seccion = pieza('#citas').getBoundingClientRect();
          const fijas = ['.tel', '.guia', '.guia__fila', '.llega', '.llega__tarjetas', '.garantia__cierre'];
          const lugares = fijas.map(
            (cual) => Math.round((pieza(cual).getBoundingClientRect().top - seccion.top) * 10) / 10,
          );
          const sello = raiz.querySelector('[data-demo-tarjeta="cita"] .sello')?.getBoundingClientRect();
          const renglones = ['[data-demo-cita-titulo]', '[data-demo-cita-detalle]'].map((cual) => {
            const renglon = pieza(cual);
            const letras = document.createRange();
            letras.selectNodeContents(renglon);
            return {
              alto: renglon.getBoundingClientRect().height,
              deUno: Number.parseFloat(getComputedStyle(renglon).lineHeight),
              derecha: letras.getBoundingClientRect().right,
              arriba: letras.getBoundingClientRect().top,
            };
          });
          return {
            ejemplo: raiz.dataset.ejemplo,
            paso: raiz.dataset.paso,
            momento: raiz.dataset.momento,
            desborde: document.documentElement.scrollWidth - innerWidth,
            lugares: [...lugares, Math.round(seccion.height * 10) / 10],
            sello: sello && sello.width > 0 ? { izquierda: sello.left, abajo: sello.bottom } : null,
            renglones,
          };
        }, tocar);
      /**
       * Cuanto se movio lo que mas se movio. Medio pixel es lo que un navegador puede redondear distinto de una
       * medida a otra; un renglon de mas son por lo menos quince.
       * @param {number[]} ahora
       * @param {number[]} antes
       */
      const seMovio = (ahora, antes) => Math.max(...ahora.map((lugar, cual) => Math.abs(lugar - (antes[cual] ?? 0))));
      const alPrincipio = await medir();
      expect(alPrincipio.paso).toBe('reposo');
      expect(alPrincipio.desborde).toBeLessThanOrEqual(0);
      for (const clave of ['unas', 'dentista', 'medico']) {
        if (clave !== 'unas') expect((await medir(`[data-demo-ejemplo="${clave}"]`)).ejemplo).toBe(clave);
        for (const [paso] of PARADAS) {
          const medida = await medir('[data-demo-pausa]');
          expect(medida.paso, clave).toMatch(paso === 'finSi' ? /^fin/ : new RegExp(`^${paso}$`));
          expect(seMovio(medida.lugares, alPrincipio.lugares), `${clave}, ${paso}: algo se movio`).toBeLessThanOrEqual(
            0.5,
          );
          expect(medida.desborde, `${clave}, ${paso}: se desborda`).toBeLessThanOrEqual(0);
          if (medida.momento !== '4') continue;
          // Con el sello puesto, la hora y el servicio de la cita siguen en un renglon cada uno.
          const [titulo, detalle] = medida.renglones;
          if (!medida.sello || !titulo || !detalle) throw new Error(`${clave}: falta el sello o la cita`);
          expect(titulo.alto, `${clave}: la hora de la cita se parte en dos`).toBeLessThan(titulo.deUno * 1.5);
          expect(detalle.alto, `${clave}: el servicio de la cita se parte en dos`).toBeLessThan(detalle.deUno * 1.5);
          // Y el sello no tapa el texto: va a un lado o, en las tarjetas angostas, arriba, en la esquina.
          const aUnLado = Math.max(titulo.derecha, detalle.derecha) <= medida.sello.izquierda + 4;
          const encima = medida.sello.abajo <= titulo.arriba + 8;
          expect(aUnLado || encima, `${clave}: el sello tapa la cita`).toBe(true);
        }
      }
      // El celular cabe entero a lo ancho, y lo de la profesional va donde toca en ese ancho.
      const celular = await demo.locator('.tel').boundingBox();
      expect(celular?.x).toBeGreaterThanOrEqual(0);
      expect((celular?.x ?? 0) + (celular?.width ?? 0)).toBeLessThanOrEqual(ancho);
      await expect(page.locator('.llega__tarjeta').filter({ visible: true })).toHaveCount(ancho >= 1240 ? 3 : 1);
      const texto = await page.locator('.garantia__promesa').boundingBox();
      const tarjetas = await page.locator('.llega').boundingBox();
      if (!texto || !celular || !tarjetas) throw new Error('falta una pieza de la seccion');
      if (ancho >= 1240) {
        // Tres columnas: el texto, el celular y las tarjetas.
        expect(texto.x + texto.width).toBeLessThanOrEqual(celular.x);
        expect(celular.x + celular.width).toBeLessThanOrEqual(tarjetas.x);
      } else if (ancho >= 768) {
        // Dos columnas: el texto a la izquierda; el celular, con sus tarjetas debajo, a la derecha.
        expect(texto.x + texto.width).toBeLessThanOrEqual(celular.x);
        expect(tarjetas.y).toBeGreaterThan(celular.y + celular.height);
      } else {
        // Una columna: el texto, el celular y, debajo, la tarjeta del momento.
        expect(texto.y + texto.height).toBeLessThanOrEqual(celular.y);
        expect(tarjetas.y).toBeGreaterThan(celular.y + celular.height);
      }
    });
  }
});

test('todo boton Empieza ahora lleva al alta en la misma pestana', async ({ page }) => {
  await abrir(page);
  const enlaces = page.getByRole('link', { name: 'Empieza ahora' });
  expect(await enlaces.count()).toBeGreaterThanOrEqual(2);
  for (const enlace of await enlaces.all()) {
    await expect(enlace).toHaveAttribute('href', ALTA);
    await expect(enlace).not.toHaveAttribute('target', /.*/);
    await expect(enlace).toHaveAttribute('data-lugar', /.+/);
  }
});

test('si el codigo de la demostracion no llega, queda la conversacion escrita', async ({ page }) => {
  await page.route('**/js/demo-vista.js', (ruta) => ruta.abort());
  await page.goto('./');
  const escrita = page.locator('.transcripcion');
  await expect(escrita).toBeVisible();
  await expect(escrita).toContainText('Así se ve una conversación:');
  await expect(escrita).toContainText('quedó confirmada');
  // Y nada de lo que solo sirve con la historia viva: ni ejemplos, ni rayitas, ni pausa, ni tarjetas vacias.
  for (const pieza of ['.demo__ejemplos', '.guia', '.llega', '.wa__pie', '.wa__hoja']) {
    await expect(page.locator(pieza)).toBeHidden();
  }
  await expect(page.locator('[data-demo]').getByRole('button')).toHaveCount(0);
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('estan la promesa, los botones y la conversacion de ejemplo como texto', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
    await expect(page.getByRole('link', { name: 'Empieza ahora' }).first()).toHaveAttribute('href', ALTA);
    await expect(page.getByRole('group', { name: 'Demostración con un salón de uñas de ejemplo.' })).toBeVisible();
    const escrita = page.locator('.transcripcion');
    await expect(escrita).toBeVisible();
    await expect(escrita).toContainText('Ana (nota de voz): Hola, ¿cuánto cuesta el gelish?');
    await expect(escrita).toContainText('Marifer: ¡Hola! Soy Marifer, la asistente virtual de Studio Bella');
    await expect(escrita).toContainText('Ana: A las 5:00 pm, por favor.');
    await expect(escrita).toContainText('Pago aprobado');
    await expect(escrita).toContainText('Recibimos tu anticipo de $150');
    await expect(escrita).toContainText('Ahora eres tú. Al terminar la cita, tu agente te escribe.');
    await expect(escrita).toContainText('Marifer, a Bella: ¡Hola! ¿Asistió Ana a su cita');
    await expect(escrita).toContainText('Bella: Sí');
    await expect(escrita).not.toContainText(/PERSONA|prefieres hablar/);
    // Sin JavaScript no hay nada que elegir ni que tocar: ni ejemplos, ni rayitas, ni pausa, ni tarjetas vacias.
    for (const pieza of ['.demo__ejemplos', '.guia', '.llega', '.wa__pie', '.wa__hoja']) {
      await expect(page.locator(pieza)).toBeHidden();
    }
    await expect(page.locator('[data-demo]').getByRole('button')).toHaveCount(0);
    // La conversacion escrita se lee con contraste sobre el fondo claro del celular.
    await expect(escrita).toHaveCSS('color', 'rgb(17, 27, 33)');
    await expect(page.locator('.wa')).toHaveCSS('background-color', 'rgb(239, 233, 224)');
    // El cierre de la seccion sigue en su lugar.
    await expect(
      page.locator('.garantia__acciones').getByRole('link', { name: 'Prefiero que me acompañen' }),
    ).toBeVisible();
  });
});
