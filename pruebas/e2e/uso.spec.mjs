// @ts-check
// Lo que encontro la prueba de uso real (fase 5) y ninguna prueba veia: cada falla quedo aqui para que no regrese.
// Las del comercial viejo (que avanzaba con el scroll) quedaron adaptadas al corto del inicio, que corre solo.
import { abrirCortoDetenido, hastaElCuadro, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

/** Los perfiles con pantalla ancha: los unicos donde corre el corto (y donde el cartel ensena las tres fotos). */
const ANCHOS = ['escritorio', 'firefox'];

/** @param {import('@playwright/test').TestInfo} info */
const esAncho = (info) => ANCHOS.includes(info.project.name);

/**
 * Abre la pagina con menos movimiento: el corto no corre solo y se ve su cartel.
 * @param {import('@playwright/test').Page} page
 */
async function abrirQuieta(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const corto = page.locator('[data-corto]');
  await expect(corto).toHaveAttribute('data-viva', '');
  return corto;
}

test('en pausa lo que el agente ya hizo se queda a la vista, quieto: la pausa no lo borra', async ({ page }, info) => {
  test.skip(!esAncho(info), 'el corto solo corre en pantallas anchas');
  // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
  test.slow();
  const corto = await abrirCortoDetenido(page);
  await hastaElCuadro(page, corto, 'agente');
  const renglones = corto.locator('.franja__sobre--hecho .trato > *');
  expect(await renglones.count()).toBeGreaterThan(2);
  // Entran uno tras otro, un oficio despues de otro: se espera a que esten todos.
  for (const renglon of await renglones.all()) await expect(renglon).toHaveCSS('opacity', '1', { timeout: 20_000 });
  await corto.getByRole('button', { name: 'Pausar el video' }).click();
  await expect(corto).toHaveAttribute('data-pausada', '');
  // Cada renglon sigue puesto y a la vista: en pausa nada se queda a medio entrar ni se borra.
  for (const renglon of await renglones.all()) {
    await expect(renglon).toBeVisible();
    await expect(renglon).toHaveCSS('opacity', '1');
  }
  for (const sello of await corto.locator('.franja__sobre--hecho .sello').all()) await expect(sello).toBeVisible();
});

test('en pausa el contador de mensajes sin contestar tampoco avanza, y al reanudar sigue', async ({ page }, info) => {
  test.skip(!esAncho(info), 'el corto solo corre en pantallas anchas');
  // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
  test.slow();
  const corto = await abrirCortoDetenido(page);
  await hastaElCuadro(page, corto, 'avalancha');
  await page.clock.runFor(500);
  const cuenta = corto.locator('[data-corto-cuenta]').first();
  const pausa = corto.getByRole('button', { name: 'Pausar el video' });
  await pausa.click();
  const enPausa = await cuenta.textContent();
  await page.clock.runFor(10_000);
  await expect(cuenta).toHaveText(enPausa ?? '');
  await expect(corto).toHaveAttribute('data-cuadro', 'avalancha');
  await pausa.click();
  await page.clock.runFor(900);
  expect(Number(await cuenta.textContent())).toBeGreaterThan(Number(enPausa));
});

test('con movimiento reducido nada del inicio se mueve solo: ni el corto ni una sola animacion', async ({ page }) => {
  const corto = await abrirQuieta(page);
  await expect(corto).toHaveAttribute('data-cuadro', 'cartel');
  await page.waitForTimeout(1200);
  await expect(corto).toHaveAttribute('data-cuadro', 'cartel');
  const animaciones = await corto.evaluate((el) =>
    el.getAnimations({ subtree: true }).map((animacion) => animacion.playState),
  );
  expect(animaciones).toEqual([]);
});

test('en celular, recorrer el cartel con el teclado no mueve la pagina, y de la imagen no hay nada que enfocar', async ({
  page,
}, info) => {
  test.skip(esAncho(info), 'en pantallas anchas el inicio trae los controles del corto');
  const corto = await abrirQuieta(page);
  // Lo mas que la pagina puede moverse es lo que haya arriba del inicio (en la previa, su cinta): nunca un brinco.
  const arriba = await corto.evaluate((el) => Math.ceil(el.getBoundingClientRect().top + scrollY));
  // Las paradas del inicio son sus dos enlaces y nada mas: "Tu y tu agente" se mira y se lee, no se toca.
  const paradas = await corto.evaluate((raiz) =>
    [...raiz.querySelectorAll('a[href], button, input, video, [tabindex]')]
      .filter((uno) => uno.getClientRects().length > 0 && uno.getAttribute('tabindex') !== '-1')
      .map((uno) => uno.textContent?.trim()),
  );
  expect(paradas).toEqual(['Empieza ahora', 'Vívelo tú']);
  for (const nombre of paradas) {
    await corto.getByRole('link', { name: nombre, exact: true }).focus();
    expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(arriba);
    await expect(corto).toHaveAttribute('data-cuadro', 'cartel');
  }
});

test('quien llega por un ancla y sube encuentra el cartel, no el corto a medias', async ({ page }, info) => {
  // Con movimiento: aun asi el corto no corre a espaldas de quien no lo tiene enfrente.
  await page.goto('./#planes');
  const corto = page.locator('[data-corto]');
  await expect(corto).toHaveAttribute('data-viva', '');
  await expect(corto).toHaveAttribute('data-cuadro', 'cartel');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(corto.getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 });
  await expect(corto.locator('[data-corto-cine]')).toBeHidden();
  // En pantallas anchas, como no lo vio, el boton le ofrece verlo (no "verlo de nuevo"); en las demas no hay corto.
  const ver = corto.locator('[data-corto-ver]');
  if (esAncho(info)) await expect(ver).toHaveText('Ver el video');
  await expect(ver).toBeVisible({ visible: esAncho(info) });
});

test('los videos del corto no son una parada del teclado', async ({ page }) => {
  const corto = await abrirQuieta(page);
  const videos = await corto.locator('video').all();
  expect(videos.length).toBeGreaterThan(0);
  for (const video of videos) {
    await expect(video).toHaveAttribute('tabindex', '-1');
    await expect(video).toHaveAttribute('aria-hidden', 'true');
  }
});

test('si no llega el archivo de una sola pieza, las demas arrancan igual', async ({ page }) => {
  // El archivo menos importante (la medicion) ya no puede tumbar el corto, la demostracion y la calculadora.
  await page.route('**/js/medicion-vista.js', (ruta) => ruta.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('[data-corto]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-calculadora]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('html')).toHaveClass(/con-js/);
  await expect(page.locator('html')).toHaveClass(/con-corto/);
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

  test('el inicio se queda en su cartel, que se lee completo y trae su boton', async ({ page }) => {
    const fallas = vigilar(page);
    await page.goto('./');
    await expect(page.locator('html')).not.toHaveClass(/con-corto/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
    // Aqui el corto no cabe: ni sus capas ni sus botones. Tampoco la imagen del cartel: queda el texto corrido.
    await expect(page.locator('[data-corto-cine]')).toBeHidden();
    await expect(page.locator('[data-corto-control]')).toBeHidden();
    await expect(page.locator('[data-corto-ver]')).toBeHidden();
    await expect(page.locator('[data-corto] button').filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('[data-corto] .duo')).toBeHidden();
    await expect(page.locator('[data-corto] .vidas')).toBeHidden();
    const empieza = page.locator('.corto').getByRole('link', { name: 'Empieza ahora' });
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

  test('la demostracion dice que es un ejemplo y no ensena nada que no se pueda tocar', async ({ page }) => {
    await page.goto('./');
    const demo = page.locator('[data-demo]');
    // Que es un ejemplo lo dice su nombre; a la vista no queda ninguna invitacion a tocarla.
    await expect(demo).toHaveAttribute('aria-label', 'Demostración con un salón de uñas de ejemplo.');
    await expect(page.locator('#citas')).not.toContainText(/Tócala|vívela/i);
    await expect(demo.getByRole('button')).toHaveCount(0);
    await expect(demo.locator('button').filter({ visible: true })).toHaveCount(0);
    // Y la conversacion escrita se lee entera, sin una caja con su propio scroll ni un celular que la recorte.
    for (const caja of ['.wa', '.wa__chat']) {
      const recortada = await page.locator(caja).evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(recortada, caja).toBeLessThanOrEqual(1);
    }
    const escrita = await page.locator('.transcripcion').boundingBox();
    const pantalla = await page.locator('.wa').boundingBox();
    if (!escrita || !pantalla) throw new Error('no encontre la conversacion escrita');
    expect(escrita.y + escrita.height).toBeLessThanOrEqual(pantalla.y + pantalla.height);
    expect(escrita.height).toBeGreaterThan(400);
  });
});
