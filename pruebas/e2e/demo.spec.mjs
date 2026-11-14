// @ts-check
import { expect, test } from '@playwright/test';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';

const ALTA = 'https://alta.prompt-maestro.com/';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ sinMovimiento?: boolean }} [opciones]
 */
async function abrir(page, { sinMovimiento = true } = {}) {
  // Casi todas las pruebas piden menos movimiento: la historia es la misma y corre sin esperas.
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
  await tocar(demo, 'Ver qué pasa después', 'asistencia');
}

test('arranca al tocar Enviar y en cada decision espera con una pista a la vista', async ({ page }) => {
  const fallas = vigilar(page);
  const demo = await abrir(page, { sinMovimiento: false });
  const chat = demo.getByRole('log');
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

test('al pagar se ve, en este orden: el dinero en su cuenta, la cita en su calendario y el sello', async ({ page }) => {
  const demo = await abrir(page, { sinMovimiento: false });
  await hastaApartado(demo);
  await expect(demo.getByRole('log')).toContainText('Te aparté el lugar para el jueves a las 5:00 pm');
  await expect(demo.getByRole('log')).not.toContainText('quedó confirmada');
  // Un observador anota cuando aparece cada cosa, para comprobar el orden.
  await page.evaluate(() => {
    const raiz = /** @type {HTMLElement} */ (document.querySelector('[data-demo]'));
    /** @type {string[]} */
    const orden = [];
    const mirar = () => {
      const anota = (/** @type {string} */ que) => !orden.includes(que) && orden.push(que);
      if (raiz.querySelector('[data-demo-tu-resumen]')?.textContent?.includes('Mercado Pago')) anota('dinero');
      if (raiz.querySelector('.agenda__fila[data-estado="garantizada"]')) anota('cita');
      if (raiz.querySelector('.agenda__fila .sello')) anota('sello');
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
  await expect(demo.locator('.agenda__fila .sello')).toBeVisible();
  await expect(demo).toHaveAttribute('data-orden', 'dinero cita sello');
  await expect(demo.locator('.cobro')).toContainText('Pago aprobado');
  await expect(demo.getByRole('log')).toContainText(
    '¡Listo, Ana! Recibimos tu anticipo de $150 y tu cita de Gelish semipermanente quedó confirmada para el jueves a las 5:00 pm.',
  );
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('$150 de anticipo, directo en tu Mercado Pago.');
  await expect(demo.locator('.agenda__fila[data-estado="garantizada"]')).toContainText('Gelish · Ana');
  await expect(demo.getByRole('img', { name: 'Garantizada: anticipo pagado' })).toBeVisible();
  await sinFaltasDeAccesibilidad(page);
});

test('si asistio: gracias a la clienta, cita completada y la tarjeta de cierre con Empieza ahora', async ({ page }) => {
  const demo = await abrir(page);
  await hastaAsistencia(demo);
  await expect(demo.getByRole('log')).toContainText(
    'Te recordamos tu cita de Gelish semipermanente mañana jueves a las 5:00 pm',
  );
  await expect(demo.getByRole('log')).toContainText('Ya casi es tu cita de Gelish semipermanente, hoy a las 5:00 pm');
  await expect(demo.locator('.tu__mensaje')).toHaveText(
    '¡Hola! ¿Asistió Ana a su cita de Gelish semipermanente hoy a las 5:00 pm? Toca un botón y lo dejo registrado.',
  );
  await sinFaltasDeAccesibilidad(page);
  await demo.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(demo.locator('.tu__mensaje')).toContainText('registré que Ana sí asistió');
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Así, con cada cita.');
  await expect(demo.getByRole('log')).toContainText('¡Gracias por venir a tu cita de Gelish semipermanente, Ana!');
  await expect(demo.locator('.cierre')).toContainText('Así llega una cita garantizada.');
  const empieza = demo.getByRole('link', { name: 'Empieza ahora' });
  await expect(empieza).toHaveAttribute('href', ALTA);
  await expect(empieza).not.toHaveAttribute('target', /.*/);
  await expect(demo.getByRole('button', { name: 'Ver otra vez' })).toBeVisible();
  await sinFaltasDeAccesibilidad(page);
});

test('si no asistio: el anticipo se queda con ella, se ofrece reagendar y llega al cierre', async ({ page }) => {
  const demo = await abrir(page);
  await hastaAsistencia(demo);
  await demo.getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo.locator('.tu__mensaje')).toContainText('Su anticipo de $150 queda retenido y le ofrecí reagendar.');
  await expect(demo.getByRole('log')).toContainText('no pudiste llegar');
  await expect(demo.getByRole('log')).toContainText('te busco otro horario con gusto');
  await expect(demo.locator('.agenda__fila[data-estado="falto"]')).toContainText('No asistió · Ana');
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
  await expect(demo.locator('.burbuja, .cobro, .cierre, .agenda, .sello')).toHaveCount(0);
  await expect(demo.locator('[data-demo-tu-resumen]')).toHaveText('Tú, atendiendo. Tu asistente, contestando.');
  await tocar(demo, 'Enviar', 'precio');
  await demo.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect(demo.getByRole('button', { name: 'Enviar' })).toBeVisible();
});

test('Ver todo solo cuenta la historia completa sin tocar nada mas', async ({ page }) => {
  const demo = await abrir(page);
  await demo.getByRole('button', { name: 'Ver todo solo' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre', { timeout: 20_000 });
  await expect(demo.getByRole('log')).toContainText('quedó confirmada');
  await expect(demo.getByRole('log')).toContainText('¡Gracias por venir');
  await expect(demo.locator('.agenda__fila .sello')).toHaveCount(1);
});

test('se completa solo con el teclado y cada novedad se anuncia', async ({ page }) => {
  const demo = await abrir(page);
  await expect(demo.getByRole('log')).toHaveAttribute('aria-label', 'Conversación de ejemplo');
  await demo.getByRole('button', { name: 'Enviar' }).focus();
  const pasos = ['precio', 'horarios', 'apartado', 'pagado', 'recordatorios', 'asistencia'];
  for (const paso of pasos) {
    // Tras cada paso el foco queda en lo siguiente que se puede hacer: basta Enter.
    await expect(demo.locator('button:focus')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(demo).toHaveAttribute('data-paso', paso);
  }
  await expect(demo.locator('[data-demo-anuncio]')).toContainText('¿Asistió Ana a su cita');
  await expect(demo.getByRole('button', { name: 'Sí', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  await expect(demo.getByRole('link', { name: 'Empieza ahora' })).toBeFocused();
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

test('lo que ves tu se abre y se guarda con su pestana, y dice si esta abierto', async ({ page }, info) => {
  test.skip(info.project.name === 'escritorio', 'en pantallas anchas va siempre abierto, a un lado del telefono');
  const demo = await abrir(page);
  const pestana = demo.getByRole('button', { name: /Lo que ves tú/ });
  await tocar(demo, 'Enviar', 'precio');
  await tocar(demo, 'El jueves', 'horarios');
  await expect(pestana).toHaveAttribute('aria-expanded', 'false');
  await expect(demo.locator('.agenda')).toBeHidden();
  await pestana.click();
  await expect(pestana).toHaveAttribute('aria-expanded', 'true');
  await expect(demo.locator('.agenda__fila')).toHaveCount(4);
  await pestana.click();
  await expect(demo.locator('.agenda')).toBeHidden();
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Se acabaron los plantones.');
    await expect(page.getByRole('link', { name: 'Empieza ahora' }).first()).toHaveAttribute('href', ALTA);
    const escrita = page.locator('.transcripcion');
    await expect(escrita).toBeVisible();
    await expect(escrita).toContainText('Ana: Hola, ¿cuánto cuesta el gelish?');
    await expect(escrita).toContainText('Marifer: ¡Hola! Soy Marifer, la asistente virtual de Studio Bella');
    await expect(escrita).toContainText('Recibimos tu anticipo de $150');
    await expect(escrita).toContainText('¿Asistió Ana a su cita');
    await expect(escrita).toContainText('¡Gracias por venir');
    await expect(page.locator('.chat__pie')).toBeHidden();
    await expect(page.locator('.tu')).toBeHidden();
  });
});
