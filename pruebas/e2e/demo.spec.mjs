// @ts-check

import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

const ALTA = 'https://alta.prompt-maestro.com/';
// El azul de la marca tiene dos tonos: el del boton que cierra (relleno) y la luz de lo ya pagado (texto y sello).
const AZUL_DEL_BOTON = 'rgb(63, 92, 245)';
const LUZ_DE_LO_PAGADO = 'rgb(132, 151, 255)';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ sinMovimiento?: boolean }} [opciones]
 */
async function abrir(page, { sinMovimiento = true } = {}) {
  // Casi todas las pruebas piden menos movimiento: la historia es la misma, sin animaciones entre burbujas.
  if (sinMovimiento) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const demo = page.locator('[data-demo]');
  await expect(demo).toHaveAttribute('data-viva', '');
  return demo;
}

/**
 * Toca un boton de la demostracion y espera a que el paso termine de pintarse.
 * @param {import('@playwright/test').Locator} demo
 * @param {string} nombre
 * @param {string} paso
 */
async function tocar(demo, nombre, paso) {
  await demo.getByRole('button', { name: nombre, exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', paso, { timeout: 15_000 });
}

/**
 * Elige un ejemplo en el selector y espera a que la historia quede en reposo con el.
 * @param {import('@playwright/test').Locator} demo
 * @param {string} nombre
 * @param {string} clave
 */
async function elegir(demo, nombre, clave) {
  await demo.getByRole('group', { name: 'Ejemplo' }).getByRole('button', { name: nombre, exact: true }).click();
  await expect(demo).toHaveAttribute('data-ejemplo', clave);
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
}

/** @param {import('@playwright/test').Locator} demo */
async function hastaApartado(demo) {
  await tocar(demo, 'Enviar', 'precio');
  await tocar(demo, 'El jueves', 'horarios');
  await tocar(demo, '5:00 pm', 'apartado');
}

/** @param {import('@playwright/test').Locator} demo */
async function hastaAsistencia(demo) {
  await hastaApartado(demo);
  await tocar(demo, 'Pagar anticipo (simulado)', 'pagado');
  await tocar(demo, 'Ver qué pasa después', 'recordatorios');
  await tocar(demo, 'Ir al final de la cita', 'asistencia');
}

test('arranca al tocar Enviar y en cada decision espera con una pista a la vista', async ({ page }) => {
  const fallas = vigilar(page);
  const demo = await abrir(page, { sinMovimiento: false });
  const chat = demo.getByRole('log');
  await expect(chat).toContainText('Eres Ana y le escribes a Studio Bella.');
  await expect(demo.getByRole('button', { name: 'Enviar' })).toHaveClass(/pista/);
  await tocar(demo, 'Enviar', 'precio');
  await expect(chat).toContainText('Hola, ¿cuánto cuesta el gelish?');
  await expect(chat).toContainText('Soy Marifer, la asistente virtual de Studio Bella');
  await expect(chat).toContainText('El gelish semipermanente cuesta $350');
  await expect(chat).toContainText('escribe PERSONA y le aviso');
  await expect(demo.getByRole('button', { name: 'El jueves' })).toHaveClass(/pista/);
  await expect(demo.getByRole('button', { name: 'El sábado' })).toBeVisible();
  await tocar(demo, 'El jueves', 'horarios');
  await expect(chat).toContainText(
    'Te puedo ofrecer el jueves a las 10:00 am, 12:30 pm, 4:00 pm o 5:00 pm. ¿Cuál te acomoda?',
  );
  await expect(demo.locator('.ficha')).toHaveCount(4);
  await expect(demo.locator('.ficha.pista')).toHaveCount(1);
  expect(fallas).toEqual([]);
});

test('si nadie la toca, arranca sola a los 4 segundos de estar a la vista y luego espera', async ({ page }) => {
  const demo = await abrir(page);
  await demo.locator('.telefono').scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  // Son 4 segundos de reloj; con la maquina cargada (cinco navegadores a la vez) Firefox tarda mas en contarlos.
  await expect(demo).toHaveAttribute('data-paso', 'precio', { timeout: 15_000 });
  // Ya arranco: ahora le toca a la visitante. No sigue sola.
  await page.waitForTimeout(2500);
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect(demo.getByRole('button', { name: 'El jueves' })).toBeVisible();
});

test('si elige el sabado, la agenda y los horarios son los del sabado', async ({ page }) => {
  const demo = await abrir(page);
  await tocar(demo, 'Enviar', 'precio');
  await tocar(demo, 'El sábado', 'horarios');
  await expect(demo.getByRole('log')).toContainText(
    'Te puedo ofrecer el sábado a las 10:00 am, 12:00 pm, 3:00 pm o 5:00 pm.',
  );
  await tocar(demo, '3:00 pm', 'apartado');
  await expect(demo.locator('[data-demo-dia]')).toHaveText('Sábado');
  await expect(demo.locator('.agenda__fila[data-estado="apartado"]')).toContainText('3:00 pm');
});

test('al pagar se ve, en este orden: el dinero en su cuenta, la cita en su calendario y el sello', async ({ page }) => {
  test.slow(); // corre a ritmo normal, con todas sus pausas
  const demo = await abrir(page, { sinMovimiento: false });
  await hastaApartado(demo);
  const chat = demo.getByRole('log');
  await expect(chat).toContainText('Te aparté el lugar para el jueves a las 5:00 pm');
  await expect(chat).not.toContainText('quedó confirmada');
  await expect(demo.locator('.agenda__fila[data-estado="apartado"]')).toContainText('Apartado, esperando el anticipo');
  // Un observador anota cuando aparece cada cosa, para comprobar el orden.
  await page.evaluate(() => {
    const raiz = /** @type {HTMLElement} */ (document.querySelector('[data-demo]'));
    /** @type {string[]} */
    const orden = [];
    const mirar = () => {
      const anota = (/** @type {string} */ que) => !orden.includes(que) && orden.push(que);
      if (raiz.querySelector('.cobro--aprobado')) anota('aprobado');
      if (raiz.querySelector('[data-demo-tu-resumen]')?.textContent?.includes('Mercado Pago')) anota('dinero');
      if (raiz.querySelector('.agenda__fila[data-estado="garantizada"]')) anota('cita');
      if (raiz.querySelector('.agenda__fila .sello')) anota('sello');
      if (raiz.querySelector('[data-demo-chat]')?.textContent?.includes('quedó confirmada')) anota('confirmacion');
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
  await tocar(demo, 'Pagar anticipo (simulado)', 'pagado');
  await expect(demo).toHaveAttribute('data-orden', 'aprobado dinero cita sello confirmacion');
  await expect(demo.locator('.cobro')).toContainText('Pago aprobado');
  await expect(chat).toContainText(
    '¡Listo, Ana! Recibimos tu anticipo de $150 y tu cita de Gelish semipermanente quedó confirmada para el jueves a las 5:00 pm.',
  );
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('$150 de anticipo, directo en tu Mercado Pago.');
  await expect(demo.locator('.agenda__fila[data-estado="garantizada"]')).toContainText('Gelish · Ana');
  await expect(demo.getByRole('img', { name: 'Garantizada: anticipo pagado' })).toBeVisible();
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('el azul se guarda para lo pagado: el sello, Pago aprobado y el boton del cierre', async ({ page }) => {
  const demo = await abrir(page);
  await expect(page.locator('.garantia__acciones .boton')).not.toHaveCSS('background-color', AZUL_DEL_BOTON);
  await hastaApartado(demo);
  await expect(demo.getByRole('button', { name: 'Pagar anticipo (simulado)' })).not.toHaveCSS(
    'background-color',
    AZUL_DEL_BOTON,
  );
  await tocar(demo, 'Pagar anticipo (simulado)', 'pagado');
  await expect(demo.locator('.cobro__estado')).toHaveCSS('color', LUZ_DE_LO_PAGADO);
  await expect(demo.locator('.agenda__fila .sello')).toHaveCSS('color', LUZ_DE_LO_PAGADO);
});

test('al terminar la cita cambia la escena: ahora es la profesional, y su asistente le pregunta', async ({ page }) => {
  const demo = await abrir(page);
  await hastaAsistencia(demo);
  await expect(demo).toHaveAttribute('data-telefono', 'profesional');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Marifer');
  await expect(demo.locator('[data-demo-atiende]')).toHaveText('Tu agente, en tu WhatsApp');
  const chat = demo.getByRole('log');
  await expect(chat).toContainText('Ahora eres tú. Al terminar la cita, tu agente te escribe.');
  await expect(chat).toContainText(
    '¡Hola! ¿Asistió Ana a su cita de Gelish semipermanente hoy a las 5:00 pm? Toca un botón y lo dejo registrado.',
  );
  await expect(chat).not.toContainText('quedó confirmada');
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Tu única tarea: tocar sí o no.');
  await expect(demo.getByRole('button', { name: 'Sí', exact: true })).toBeVisible();
  await expect(demo.getByRole('button', { name: 'No', exact: true })).toBeVisible();
  // La cita sigue a la vista, con su sello.
  await expect(demo.locator('.agenda__fila[data-estado="garantizada"] .sello')).toBeVisible();
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('si asistio: queda registrado y el cuadro final ensena el dia entero sellado, con Empieza ahora', async ({
  page,
}) => {
  const demo = await abrir(page);
  await hastaAsistencia(demo);
  await demo.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finSi');
  await expect(demo.getByRole('log')).toContainText(
    'Listo, registré que Ana sí asistió a su cita de Gelish semipermanente hoy a las 5:00 pm.',
  );
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Cita completada.');
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Así, con cada cita.');
  await expect(demo.locator('.agenda__fila')).toHaveCount(4);
  await expect(demo.locator('.agenda__fila .sello')).toHaveCount(4);
  await expect(demo.locator('.agenda__fila[data-estado="asistio"]')).toContainText('Asistió · Ana');
  await expect(demo.locator('.agenda__fila').first()).toBeVisible();
  const empieza = demo.getByRole('link', { name: 'Empieza ahora' });
  await expect(empieza).toBeVisible();
  await expect(empieza).toHaveAttribute('href', ALTA);
  await expect(empieza).not.toHaveAttribute('target', /.*/);
  await expect(empieza).toHaveCSS('background-color', AZUL_DEL_BOTON);
  await expect(demo.getByRole('button', { name: 'Ver otra vez' })).toBeVisible();
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('si no asistio: el anticipo se queda con ella segun su politica, y da tiempo de leerlo', async ({ page }) => {
  const demo = await abrir(page);
  await hastaAsistencia(demo);
  await demo.getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await expect(demo.getByRole('log')).toContainText('Su anticipo de $150 queda retenido y le ofrecí reagendar.');
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('El anticipo se queda contigo, según tu política.');
  await expect(demo.locator('.agenda__fila[data-estado="falto"]')).toContainText('No asistió · Ana');
  // Aun con menos movimiento, el final no pasa de largo: se queda a la vista antes del cuadro final.
  await page.waitForTimeout(1200);
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(demo.getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
});

test('Ver otra vez y Reiniciar regresan al principio, limpio', async ({ page }) => {
  const demo = await abrir(page);
  await hastaAsistencia(demo);
  await demo.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await demo.getByRole('button', { name: 'Ver otra vez' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo).toHaveAttribute('data-telefono', 'cliente');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Studio Bella');
  await expect(demo.locator('.burbuja, .cobro, .cierre, .sello')).toHaveCount(0);
  await expect(demo.locator('.agenda__fila[data-estado="libre"]')).toHaveCount(4);
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Tú, atendiendo. Tu agente, contestando.');
  await expect(demo.getByRole('log')).toContainText('Eres Ana y le escribes a Studio Bella.');
  await tocar(demo, 'Enviar', 'precio');
  await demo.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo.getByRole('button', { name: 'Enviar' })).toBeVisible();
});

test('Ver todo solo cuenta la historia completa sin tocar nada mas', async ({ page }) => {
  test.slow();
  const demo = await abrir(page);
  await demo.getByRole('button', { name: 'Ver todo solo' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre', { timeout: 40_000 });
  await expect(demo.locator('.agenda__fila .sello')).toHaveCount(4);
  await expect(demo.getByRole('link', { name: 'Empieza ahora' })).toBeVisible();
});

test('si la visitante toma el control a media historia, la historia ya no contesta por ella', async ({ page }) => {
  test.slow();
  const demo = await abrir(page, { sinMovimiento: false });
  await demo.getByRole('button', { name: 'Ver todo solo' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'recordatorios', { timeout: 40_000 });
  await demo.getByRole('button', { name: 'Ir al final de la cita' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'asistencia', { timeout: 15_000 });
  // Ella tomo el control: el Si o el No ya son suyos.
  await page.waitForTimeout(3500);
  await expect(demo).toHaveAttribute('data-paso', 'asistencia');
  await expect(demo.getByRole('button', { name: 'Sí', exact: true })).toBeVisible();
});

test('se completa solo con el teclado, el foco no se pierde y cada novedad se anuncia', async ({ page }) => {
  const demo = await abrir(page);
  const anuncio = demo.locator('[data-demo-anuncio]');
  await expect(demo.getByRole('log')).toHaveAttribute('aria-label', 'Conversación de ejemplo');
  await demo.getByRole('button', { name: 'Enviar' }).focus();
  /** @type {[string, string][]} */
  const pasos = [
    ['precio', 'Tú, atendiendo. Tu agente, contestando.'],
    ['horarios', 'Ofrece solo los horarios libres de tu Google Calendar.'],
    ['apartado', 'Lugar apartado unos minutos, mientras paga.'],
    ['pagado', '$150 de anticipo, directo en tu Mercado Pago.'],
    ['recordatorios', 'Los recordatorios salen solos. Tú no haces nada.'],
    ['asistencia', 'Tu única tarea: tocar sí o no.'],
  ];
  for (const [paso, dicho] of pasos) {
    // Tras cada paso el foco queda en lo siguiente que se puede hacer: basta Enter.
    await expect(demo.locator('[data-demo-pie] button:focus')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(demo).toHaveAttribute('data-paso', paso);
    await expect(anuncio).toHaveText(dicho);
  }
  await expect(demo.getByRole('button', { name: 'Sí', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(demo.getByRole('link', { name: 'Empieza ahora' })).toBeFocused();
  // Y al volver a empezar, el foco regresa al primer boton y se anuncia el papel.
  await demo.getByRole('button', { name: 'Ver otra vez' }).focus();
  await page.keyboard.press('Enter');
  await expect(demo.getByRole('button', { name: 'Enviar' })).toBeFocused();
  await expect(anuncio).toHaveText('Eres Ana y le escribes a Studio Bella.');
});

test('quien esta en Ver todo solo con el teclado conserva su lugar', async ({ page }) => {
  const demo = await abrir(page);
  const sola = demo.getByRole('button', { name: 'Ver todo solo' });
  await sola.focus();
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'horarios', { timeout: 15_000 });
  await expect(sola).toBeFocused();
});

test('elegir Dentista cambia la cabecera, la pregunta, la agenda y la leyenda, y lo anuncia', async ({ page }) => {
  const fallas = vigilar(page);
  const demo = await abrir(page);
  const selector = demo.getByRole('group', { name: 'Ejemplo' });
  await expect(selector.getByRole('button')).toHaveText(['Uñas', 'Dentista', 'Médico']);
  await expect(selector.getByRole('button', { name: 'Uñas' })).toHaveAttribute('aria-pressed', 'true');
  await expect(demo.locator('[data-demo-leyenda]')).toContainText('Demostración con un salón de uñas de ejemplo.');
  await elegir(demo, 'Dentista', 'dentista');
  await expect(selector.getByRole('button', { name: 'Dentista' })).toHaveAttribute('aria-pressed', 'true');
  await expect(selector.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Dental Sonría');
  await expect(demo.locator('[data-demo-atiende]')).toHaveText('Sofi, asistente virtual');
  await expect(demo.locator('[data-demo-iniciales]')).toHaveText('DS');
  await expect(demo.getByRole('log')).toContainText('Eres Carla y le escribes a Dental Sonría.');
  await expect(demo.locator('.chat__borrador')).toHaveText('Hola, ¿cuánto cuesta la limpieza dental?');
  await expect(demo.getByRole('button', { name: 'Enviar' })).toHaveClass(/pista/);
  await expect(demo.locator('[data-demo-dia]')).toHaveText('Miércoles');
  await expect(demo.locator('.agenda__hora')).toHaveText(['9:00 am', '11:30 am', '4:00 pm', '6:00 pm']);
  await expect(demo.locator('.agenda__fila[data-estado="libre"]')).toHaveCount(4);
  await expect(demo.locator('[data-demo-leyenda]')).toHaveText(
    'Demostración con un consultorio dental de ejemplo. Tócala y vívela como si fueras quien pide la cita.',
  );
  await expect(demo.locator('[data-demo-anuncio]')).toHaveText(
    'Ejemplo: Dentista. Eres Carla y le escribes a Dental Sonría.',
  );
  expect(fallas).toEqual([]);
  // La accesibilidad se mide con el selector y el telefono a la vista, debajo de la barra.
  await page.evaluate(() => document.querySelector('#demo')?.scrollIntoView({ block: 'start' }));
  await expect(selector).toBeInViewport({ ratio: 1 });
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('la historia completa de Dentista llega al pago de $200 y a la pregunta de asistencia', async ({ page }) => {
  const demo = await abrir(page);
  await elegir(demo, 'Dentista', 'dentista');
  const chat = demo.getByRole('log');
  await tocar(demo, 'Enviar', 'precio');
  await expect(chat).toContainText('Hola, ¿cuánto cuesta la limpieza dental?');
  await expect(chat).toContainText('Soy Sofi, la asistente virtual de Dental Sonría');
  await expect(chat).toContainText('La limpieza dental cuesta $650');
  await expect(chat).toContainText(
    'Si en algún momento prefieres hablar con una persona del consultorio, escribe PERSONA y le aviso.',
  );
  await tocar(demo, 'El miércoles', 'horarios');
  await expect(chat).toContainText(
    'Te puedo ofrecer el miércoles a las 9:00 am, 11:30 am, 4:00 pm o 6:00 pm. ¿Cuál te acomoda?',
  );
  await tocar(demo, '4:00 pm', 'apartado');
  await expect(chat).toContainText('te aparté el lugar para el miércoles a las 4:00 pm');
  await expect(demo.locator('.cobro__concepto')).toHaveText('Anticipo Limpieza dental');
  await expect(demo.locator('.cobro__monto')).toHaveText('$200');
  await tocar(demo, 'Pagar anticipo (simulado)', 'pagado');
  await expect(chat).toContainText(
    '¡Listo, Carla! Recibimos tu anticipo de $200 y tu cita de Limpieza dental quedó confirmada para el miércoles a las 4:00 pm. Te esperamos en Av. de la Sonrisa 100, colonia Providencia.',
  );
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('$200 de anticipo, directo en tu Mercado Pago.');
  await expect(demo.locator('.agenda__fila[data-estado="garantizada"]')).toContainText('Limpieza · Carla');
  await expect(demo.locator('.agenda__fila .sello')).toBeVisible();
  await tocar(demo, 'Ver qué pasa después', 'recordatorios');
  await expect(chat).toContainText(
    '¡Hola Carla! Te recordamos tu cita de Limpieza dental mañana miércoles a las 4:00 pm.',
  );
  await tocar(demo, 'Ir al final de la cita', 'asistencia');
  // El segundo acto: ahora es la doctora, y le escribe su asistente.
  await expect(demo).toHaveAttribute('data-telefono', 'profesional');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Sofi');
  await expect(chat).toContainText(
    '¡Hola! ¿Asistió Carla a su cita de Limpieza dental hoy a las 4:00 pm? Toca un botón y lo dejo registrado.',
  );
  await expect(chat).not.toContainText('clienta');
  await demo.getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await expect(chat).toContainText('Su anticipo de $200 queda retenido y le ofrecí reagendar.');
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(demo.locator('.agenda__fila .sello')).toHaveCount(4);
  await expect(demo.locator('.agenda__fila[data-estado="falto"]')).toContainText('No asistió · Carla');
  await expect(demo.locator('.agenda__filas')).toContainText('Valoración · Iván');
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('el selector de ejemplos se maneja con el teclado y marca cual esta puesto', async ({ page }) => {
  const demo = await abrir(page);
  const selector = demo.getByRole('group', { name: 'Ejemplo' });
  const unas = selector.getByRole('button', { name: 'Uñas' });
  const dentista = selector.getByRole('button', { name: 'Dentista' });
  const medico = selector.getByRole('button', { name: 'Médico' });
  // Son botones de verdad, del tamano de un dedo.
  for (const boton of await selector.getByRole('button').all()) {
    const caja = await boton.boundingBox();
    expect(caja?.width).toBeGreaterThanOrEqual(44);
    expect(caja?.height).toBeGreaterThanOrEqual(44);
  }
  await unas.focus();
  await page.keyboard.press('Tab');
  await expect(dentista).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dentista).toHaveAttribute('aria-pressed', 'true');
  await expect(unas).toHaveAttribute('aria-pressed', 'false');
  await expect(medico).toHaveAttribute('aria-pressed', 'false');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Dental Sonría');
  // El foco se queda en el boton que eligio: puede seguir al siguiente.
  await expect(dentista).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(medico).toBeFocused();
  await page.keyboard.press('Space');
  await expect(medico).toHaveAttribute('aria-pressed', 'true');
  await expect(dentista).toHaveAttribute('aria-pressed', 'false');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Consultorio Médico Aurora');
  await expect(demo.locator('.chat__borrador')).toHaveText('Buenas tardes, ¿cuánto cuesta la consulta?');
  await expect(demo.locator('[data-demo-anuncio]')).toHaveText(
    'Ejemplo: Médico. Eres Paty y le escribes al Consultorio Médico Aurora.',
  );
  await expect(medico).toBeFocused();
  // Y de regreso al primero, tambien con el teclado.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(unas).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(unas).toHaveAttribute('aria-pressed', 'true');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Studio Bella');
  await expect(demo.locator('.chat__borrador')).toHaveText('Hola, ¿cuánto cuesta el gelish?');
});

test('elegir otro ejemplo a media historia la regresa al reposo; si iba sola, se detiene', async ({ page }) => {
  test.slow();
  const demo = await abrir(page);
  await demo.getByRole('button', { name: 'Ver todo solo' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'horarios', { timeout: 15_000 });
  await elegir(demo, 'Médico', 'medico');
  await expect(demo).toHaveAttribute('data-telefono', 'cliente');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Consultorio Médico Aurora');
  await expect(demo.locator('[data-demo-atiende]')).toHaveText('Elena, asistente virtual');
  await expect(demo.locator('.burbuja, .cobro, .cierre, .sello')).toHaveCount(0);
  await expect(demo.locator('[data-demo-dia]')).toHaveText('Lunes');
  await expect(demo.locator('.agenda__fila[data-estado="libre"]')).toHaveCount(4);
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Tú, atendiendo. Tu agente, contestando.');
  // Ya no corre sola: espera a la visitante.
  await page.waitForTimeout(2500);
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo.locator('.burbuja')).toHaveCount(0);
  // Reiniciar conserva el ejemplo elegido, y la historia de Médico llega completa al cuadro final.
  await tocar(demo, 'Enviar', 'precio');
  await expect(demo.getByRole('log')).toContainText('Soy Elena, la asistente virtual del Consultorio Médico Aurora');
  await demo.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo).toHaveAttribute('data-ejemplo', 'medico');
  await expect(demo.locator('[data-demo-nombre]')).toHaveText('Consultorio Médico Aurora');
  await demo.getByRole('button', { name: 'Ver todo solo' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre', { timeout: 40_000 });
  await expect(demo.locator('.agenda__fila .sello')).toHaveCount(4);
  await expect(demo.locator('.agenda__fila[data-estado="asistio"]')).toContainText('Asistió · Paty');
  await expect(demo.locator('.agenda__filas')).toContainText('Consulta en línea · Marta');
  await expect(demo.getByRole('link', { name: 'Empieza ahora' })).toBeVisible();
  await sinFaltasDeAccesibilidad(page, '#citas');
});

test('con movimiento reducido no hay animaciones y la historia sigue completa', async ({ page }) => {
  const demo = await abrir(page);
  await hastaApartado(demo);
  await tocar(demo, 'Pagar anticipo (simulado)', 'pagado');
  const animaciones = await page.evaluate(() =>
    [...document.querySelectorAll('.burbuja, .cobro, .sello, .pista, .agenda__fila, .heroe__titulo, .demo')].map(
      (elemento) => getComputedStyle(elemento).animationName,
    ),
  );
  expect(animaciones.length).toBeGreaterThan(5);
  expect(new Set(animaciones)).toEqual(new Set(['none']));
  await expect(demo.locator('.agenda__fila .sello')).toBeVisible();
});

test('la conversacion no atrapa el desplazamiento de la pagina', async ({ page, browserName }, info) => {
  test.skip(browserName === 'webkit' && info.project.name !== 'escritorio', 'el telefono de WebKit no tiene rueda');
  const demo = await abrir(page);
  // La demostracion ya no es la primera pantalla: primero hay que llegar a ella.
  await demo.getByRole('log').scrollIntoViewIfNeeded();
  const caja = await demo.getByRole('log').boundingBox();
  if (!caja) throw new Error('no encontre la conversacion');
  await page.mouse.move(caja.x + caja.width / 2, caja.y + 40);
  const antes = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 220);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(antes);
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
  await expect(page.locator('.chat__pie')).toBeHidden();
  await expect(page.locator('.demo__ejemplos')).toBeHidden();
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('estan la promesa, los botones y la conversacion de ejemplo como texto', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
    await expect(page.getByRole('link', { name: 'Empieza ahora' }).first()).toHaveAttribute('href', ALTA);
    const escrita = page.locator('.transcripcion');
    await expect(escrita).toBeVisible();
    await expect(escrita).toContainText('Ana: Hola, ¿cuánto cuesta el gelish?');
    await expect(escrita).toContainText('Marifer: ¡Hola! Soy Marifer, la asistente virtual de Studio Bella');
    await expect(escrita).toContainText('Recibimos tu anticipo de $150');
    await expect(escrita).toContainText('Ahora eres tú. Al terminar la cita, tu agente te escribe.');
    await expect(escrita).toContainText('Marifer, a Bella: ¡Hola! ¿Asistió Ana a su cita');
    await expect(escrita).toContainText('Bella: Sí');
    await expect(page.locator('.chat__pie')).toBeHidden();
    await expect(page.locator('.tu')).toBeHidden();
    // Sin JavaScript no hay nada que elegir: queda el primer ejemplo, escrito.
    await expect(page.locator('.demo__ejemplos')).toBeHidden();
    await expect(page.locator('.demo__leyenda')).toContainText('Demostración con un salón de uñas de ejemplo.');
  });
});
