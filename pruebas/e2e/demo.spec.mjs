// @ts-check
import { expect, test } from '@playwright/test';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';

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
  await expect(demo).toHaveAttribute('data-paso', 'precio', { timeout: 8000 });
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
  await sinFaltasDeAccesibilidad(page);
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
  await expect(demo.locator('[data-demo-atiende]')).toHaveText('Tu asistente, en tu WhatsApp');
  const chat = demo.getByRole('log');
  await expect(chat).toContainText('Ahora eres tú. Al terminar la cita, tu asistente te escribe.');
  await expect(chat).toContainText(
    '¡Hola! ¿Asistió Ana a su cita de Gelish semipermanente hoy a las 5:00 pm? Toca un botón y lo dejo registrado.',
  );
  await expect(chat).not.toContainText('quedó confirmada');
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Tu única tarea: tocar sí o no.');
  await expect(demo.getByRole('button', { name: 'Sí', exact: true })).toBeVisible();
  await expect(demo.getByRole('button', { name: 'No', exact: true })).toBeVisible();
  // La cita sigue a la vista, con su sello.
  await expect(demo.locator('.agenda__fila[data-estado="garantizada"] .sello')).toBeVisible();
  await sinFaltasDeAccesibilidad(page);
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
  await sinFaltasDeAccesibilidad(page);
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
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Tú, atendiendo. Tu asistente, contestando.');
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
    ['precio', 'Tú, atendiendo. Tu asistente, contestando.'],
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
    await expect(escrita).toContainText('Ahora eres tú. Al terminar la cita, tu asistente te escribe.');
    await expect(escrita).toContainText('Marifer, a Bella: ¡Hola! ¿Asistió Ana a su cita');
    await expect(escrita).toContainText('Bella: Sí');
    await expect(page.locator('.chat__pie')).toBeHidden();
    await expect(page.locator('.tu')).toBeHidden();
  });
});
