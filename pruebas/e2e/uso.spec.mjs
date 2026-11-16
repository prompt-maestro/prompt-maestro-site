// @ts-check
// Lo que encontro la prueba de uso real (fase 5) y ninguna prueba veia: cada falla quedo aqui para que no regrese.
import { vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

const ANCHA = '(min-width: 900px) and (min-aspect-ratio: 1/1)';

/**
 * Abre la pagina CON movimiento (varias de estas fallas solo existian con las animaciones corriendo).
 * @param {import('@playwright/test').Page} page
 */
async function abrir(page) {
  await page.goto('./');
  const pelicula = page.locator('[data-pelicula]');
  await expect(pelicula).toHaveAttribute('data-viva', '');
  return pelicula;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} pelicula
 * @param {string} toma
 */
async function irA(page, pelicula, toma) {
  await page.evaluate(
    (clave) => document.querySelector(`[data-paso="${clave}"]`)?.scrollIntoView({ block: 'center' }),
    toma,
  );
  await expect(pelicula).toHaveAttribute('data-toma', toma);
}

test('en pausa las conversaciones del comercial se ven completas, quietas: la pausa no las borra', async ({ page }) => {
  const pelicula = await abrir(page);
  const pausa = pelicula.getByRole('button', { name: 'Pausar el movimiento' });
  await pausa.click();
  await expect(pelicula).toHaveAttribute('data-pausada', '');
  for (const toma of ['texto', 'voz', 'foto', 'pago']) {
    await irA(page, pelicula, toma);
    const renglones = pelicula.locator(`.panel[data-activo] .charla[data-charla="${toma}"] > *`);
    expect(await renglones.count()).toBeGreaterThan(1);
    // Cada renglon esta puesto y a la vista: en pausa nada se queda a medio entrar.
    for (const renglon of await renglones.all()) {
      await expect(renglon).toBeVisible();
      await expect(renglon).toHaveCSS('opacity', '1');
    }
  }
  // Y al regresar a la primera toma, sus avisos tambien.
  await irA(page, pelicula, 'ruido');
  const avisos = pelicula.locator('.panel[data-activo] .aviso');
  for (const aviso of await avisos.filter({ visible: true }).all()) {
    expect(Number(await aviso.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.7);
  }
});

test('en pausa el contador de mensajes sin contestar tampoco avanza, y al reanudar sigue', async ({ page }) => {
  const pelicula = await abrir(page);
  const esAncha = await page.evaluate((consulta) => matchMedia(consulta).matches, ANCHA);
  test.skip(esAncha, 'el contador solo se ve con un oficio a la vez');
  const cuenta = pelicula.locator('[data-cuenta]');
  const pausa = pelicula.getByRole('button', { name: 'Pausar el movimiento' });
  await expect.poll(async () => Number(await cuenta.textContent()), { timeout: 10_000 }).toBeGreaterThan(4);
  await pausa.click();
  const enPausa = await cuenta.textContent();
  await page.waitForTimeout(4000);
  await expect(cuenta).toHaveText(enPausa ?? '');
  await pausa.click();
  await expect
    .poll(async () => Number(await cuenta.textContent()), { timeout: 10_000 })
    .toBeGreaterThan(Number(enPausa));
});

test('con movimiento reducido el contador se queda en su numero: nada se mueve solo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pelicula = await abrir(page);
  const cuenta = pelicula.locator('[data-cuenta]');
  const alAbrir = await cuenta.textContent();
  await page.waitForTimeout(3500);
  await expect(cuenta).toHaveText(alAbrir ?? '');
});

test('en celular, enfocar los controles del comercial no mueve la pagina', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pelicula = await abrir(page);
  const esAncha = await page.evaluate((consulta) => matchMedia(consulta).matches, ANCHA);
  test.skip(esAncha, 'las pestanas de oficio solo existen con un oficio a la vez');
  // Lo mas que la pagina puede moverse es lo que haya arriba del comercial (en la previa, su cinta): nunca un brinco.
  const arriba = await pelicula.evaluate((el) => Math.ceil(el.getBoundingClientRect().top + scrollY));
  for (const nombre of ['Uñas', 'Dentista', 'Médico']) {
    await pelicula.getByRole('button', { name: nombre, exact: true }).focus();
    expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(arriba);
    await expect(pelicula).toHaveAttribute('data-toma', 'ruido');
  }
  await pelicula.getByRole('button', { name: 'Pausar el movimiento' }).focus();
  expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(arriba);
});

test('quien llega por un ancla y sube entra al comercial por su final, no por la primera toma', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#planes');
  const pelicula = page.locator('[data-pelicula]');
  await expect(pelicula).toHaveAttribute('data-viva', '');
  await expect(pelicula).toHaveAttribute('data-toma', 'cartel');
});

test('el video del comercial no es una parada del teclado', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pelicula = await abrir(page);
  const video = pelicula.locator('video').first();
  await expect(video).toHaveAttribute('tabindex', '-1');
  await expect(video).toHaveAttribute('aria-hidden', 'true');
});

test('si no llega el archivo de una sola pieza, las demas arrancan igual', async ({ page }) => {
  // El archivo menos importante (la medicion) ya no puede tumbar el comercial, la demostracion y la calculadora.
  await page.route('**/js/medicion-vista.js', (ruta) => ruta.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('[data-pelicula]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-calculadora]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('html')).toHaveClass(/con-js/);
  await expect(page.locator('html')).toHaveClass(/con-pelicula/);
  await expect(page.locator('html')).toHaveClass(/con-cuenta/);
});

test('si no llega la calculadora, se guarda sola y lo demas sigue vivo', async ({ page }) => {
  await page.route('**/js/calculadora-vista.js', (ruta) => ruta.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('html')).not.toHaveClass(/con-cuenta/);
  await expect(page.locator('[data-calculadora]')).toBeHidden();
  await expect(page.locator('.plan')).toHaveCount(3);
});

test('la calculadora no regana a medio teclear, y su aviso de error queda ligado a su casilla', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const calculadora = page.locator('[data-calculadora]');
  await expect(calculadora).toHaveAttribute('data-viva', '');
  await calculadora.scrollIntoViewIfNeeded();
  const citas = calculadora.getByLabel('¿Cuántas citas te plantan al mes?');
  const precio = calculadora.getByLabel('¿Cuánto cobras por cita?');
  const salida = calculadora.locator('[data-calculadora-salida]');
  await citas.fill('4');
  // "350." es alguien que va a escribir los centavos: todavia no es un error.
  await precio.fill('350.');
  await expect(calculadora).toHaveAttribute('data-estado', 'lista');
  await expect(precio).not.toHaveAttribute('aria-invalid', /.*/);
  // Con centavos, la cuenta se hace con el precio exacto: 4 de $350.50 son $1,402.
  await precio.fill('350.50');
  await expect(salida).toContainText('Hoy se te van cerca de $1,402 al mes.');
  await precio.fill('abc');
  await expect(precio).toHaveAttribute('aria-invalid', 'true');
  await expect(precio).toHaveAttribute('aria-describedby', 'calculadora-salida');
  await precio.fill('400');
  await expect(precio).not.toHaveAttribute('aria-describedby', /.*/);
});

test.describe('en una pantalla diminuta (zoom de 400 %, o un celular acostado)', () => {
  test.use({ viewport: { width: 320, height: 256 } });

  test('el comercial se queda como texto corrido, que se lee completo y trae su boton', async ({ page }) => {
    const fallas = vigilar(page);
    await page.goto('./');
    await expect(page.locator('html')).not.toHaveClass(/con-pelicula/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
    const empieza = page.locator('.pelicula').getByRole('link', { name: 'Empieza ahora' });
    await empieza.scrollIntoViewIfNeeded();
    await expect(empieza).toBeVisible();
    // Nada se sale a lo ancho: se lee bajando, sin mover la pagina de lado.
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(desborde).toBeLessThanOrEqual(1);
    expect(fallas).toEqual([]);
  });
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('la leyenda de la demostracion no invita a tocar lo que no se puede tocar', async ({ page }) => {
    await page.goto('./');
    const leyenda = page.locator('.demo__leyenda');
    await expect(leyenda).toHaveText('Demostración con un salón de uñas de ejemplo.');
    // Y la conversacion escrita se lee entera, sin una caja con su propio scroll.
    const telefono = page.locator('.telefono');
    const recortada = await telefono.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(recortada).toBeLessThanOrEqual(1);
  });
});
