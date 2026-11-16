// @ts-check
import { expect, test } from '@playwright/test';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';

const ALTA = 'https://alta.prompt-maestro.com/';
const TOMAS = ['ruido', 'duda', 'marca', 'texto', 'voz', 'foto', 'pago', 'cartel'];

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ sinMovimiento?: boolean }} [opciones]
 */
async function abrir(page, { sinMovimiento = true } = {}) {
  if (sinMovimiento) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const pelicula = page.locator('[data-pelicula]');
  await expect(pelicula).toHaveAttribute('data-viva', '');
  return pelicula;
}

/**
 * Lleva el recorrido a una toma, como lo haria el dedo al bajar.
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

/** @param {import('@playwright/test').Page} page */
const tresALaVez = (page) => page.evaluate(() => matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches);

test('abre en el ruido: la promesa, el oficio de unas y sus mensajes sin contestar', async ({ page }) => {
  const fallas = vigilar(page);
  const pelicula = await abrir(page);
  await expect(pelicula).toHaveAttribute('data-toma', 'ruido');
  await expect(pelicula).toHaveAttribute('data-oficio', 'unas');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  await expect(pelicula.locator('.rotulo[data-activo] .rotulo__texto')).toContainText(
    'Nuestro agente se encarga de tu agenda por WhatsApp',
  );
  const avisos = pelicula.locator('.panel[data-panel="unas"] .aviso');
  await expect(avisos.last()).toBeVisible();
  await expect(avisos.last()).toContainText('Hola, ¿tienes lugar el sábado?');
  await sinFaltasDeAccesibilidad(page, '.barra', '#inicio');
  expect(fallas).toEqual([]);
});

test('al bajar pasan las ocho tomas, en orden, y cada una ensena solo su rotulo', async ({ page }) => {
  const pelicula = await abrir(page);
  for (const toma of TOMAS) {
    await irA(page, pelicula, toma);
    await expect(pelicula.locator('.rotulo[data-activo]')).toHaveCount(1);
    await expect(pelicula.locator(`.rotulo[data-rotulo="${toma}"]`)).toHaveAttribute('data-activo', '');
  }
});

test('cada ventaja la protagoniza su oficio y se ve su charla', async ({ page }) => {
  const pelicula = await abrir(page);
  const casos = [
    { toma: 'texto', oficio: 'unas', dice: '¡Hola, Ana! Sí, el sábado tengo 11:00 am o 4:30 pm.' },
    { toma: 'voz', oficio: 'dentista', dice: 'Buenas tardes, señor Medina. Hoy tengo lugar a las 5:30 pm.' },
    { toma: 'foto', oficio: 'unas', dice: 'Ya vi tu diseño: francesas con decorado.' },
    { toma: 'pago', oficio: 'medico', dice: 'el anticipo es de $300' },
  ];
  for (const { toma, oficio, dice } of casos) {
    await irA(page, pelicula, toma);
    await expect(pelicula).toHaveAttribute('data-oficio', oficio);
    const charla = pelicula.locator(`.panel[data-panel="${oficio}"] .charla[data-charla="${toma}"]`);
    await expect(charla).toBeVisible();
    await expect(charla).toContainText(dice);
    await expect(pelicula.locator('.charla:visible')).toHaveCount(1);
  }
});

test('la cita solo aparece agendada con el pago aprobado y su sello', async ({ page }) => {
  const pelicula = await abrir(page);
  await irA(page, pelicula, 'pago');
  const charla = pelicula.locator('.charla[data-charla="pago"]');
  await expect(charla.locator('.charla__pago')).toContainText('Pago aprobado');
  await expect(charla.locator('.charla__cita')).toContainText('Jueves 10:00 am · Elvira');
  await expect(charla.getByRole('img', { name: 'Garantizada: anticipo pagado' })).toBeVisible();
  await sinFaltasDeAccesibilidad(page, '.barra', '#inicio');
});

test('en la duda se ve el lugar vacio y las citas que nadie sabe si llegaran', async ({ page }) => {
  const pelicula = await abrir(page);
  await irA(page, pelicula, 'duda');
  await expect(pelicula.getByRole('heading', { name: '¿Y si no llega?' })).toBeVisible();
  const citas = pelicula.locator('.panel[data-panel="unas"] .cita');
  await expect(citas.first()).toBeVisible();
  await expect(citas.first()).toContainText('No llegó');
  await expect(citas.nth(1)).toContainText('¿Llegará?');
  // La foto de la espera la pone el codigo en cuanto hace falta.
  await expect(pelicula.locator('.panel[data-panel="unas"] .panel__espera')).not.toHaveCSS('background-image', 'none');
});

test('el cartel cierra con el boton al alta y el contador en cero', async ({ page }) => {
  const pelicula = await abrir(page);
  await irA(page, pelicula, 'cartel');
  const empieza = pelicula.getByRole('link', { name: 'Empieza ahora' });
  await expect(empieza).toBeVisible();
  await expect(empieza).toHaveAttribute('href', ALTA);
  await expect(empieza).not.toHaveAttribute('target', /.*/);
  await expect(pelicula.locator('[data-cuenta]')).toHaveText('0');
  await sinFaltasDeAccesibilidad(page, '.barra', '#inicio');
});

test('en celular se elige el oficio; en pantallas anchas se ven los tres a la vez', async ({ page }) => {
  const pelicula = await abrir(page);
  const paneles = pelicula.locator('.panel');
  if (await tresALaVez(page)) {
    for (const oficio of ['unas', 'dentista', 'medico'])
      await expect(pelicula.locator(`.panel[data-panel="${oficio}"]`)).toBeVisible();
    await expect(pelicula.locator('.oficios')).toBeHidden();
    return;
  }
  await expect(paneles.filter({ visible: true })).toHaveCount(1);
  const dentista = pelicula.getByRole('button', { name: 'Dentista' });
  await expect(pelicula.getByRole('button', { name: 'Uñas' })).toHaveAttribute('aria-pressed', 'true');
  await dentista.click();
  await expect(pelicula).toHaveAttribute('data-oficio', 'dentista');
  await expect(dentista).toHaveAttribute('aria-pressed', 'true');
  await expect(pelicula.locator('.panel[data-panel="dentista"]')).toBeVisible();
  await expect(pelicula.locator('.panel[data-panel="dentista"] .aviso').last()).toContainText('Sr. Medina');
  // La duda conserva el oficio que la visitante eligio.
  await irA(page, pelicula, 'duda');
  await expect(pelicula).toHaveAttribute('data-oficio', 'dentista');
});

test('en celular los oficios rotan solos mientras nadie elige', async ({ page }) => {
  const pelicula = await abrir(page, { sinMovimiento: false });
  test.skip(await tresALaVez(page), 'con los tres a la vista no hay nada que rotar');
  await expect(pelicula).toHaveAttribute('data-oficio', 'unas');
  await expect(pelicula).toHaveAttribute('data-oficio', 'dentista', { timeout: 8000 });
});

test('con movimiento reducido no rotan ni se pide el video, y la pelicula sigue completa', async ({ page }) => {
  /** @type {string[]} */
  const videos = [];
  page.on('request', (peticion) => {
    if (peticion.url().endsWith('.mp4')) videos.push(peticion.url());
  });
  const pelicula = await abrir(page);
  await page.waitForTimeout(5200);
  await expect(pelicula).toHaveAttribute('data-oficio', 'unas');
  await irA(page, pelicula, 'cartel');
  await expect(pelicula.getByRole('link', { name: 'Empieza ahora' })).toBeVisible();
  expect(videos).toEqual([]);
});

test('con movimiento, la toma viva llega despues de lo que se ve y corre sin sonido', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'el WebKit de pruebas en Windows no trae el codec del video');
  const pelicula = await abrir(page, { sinMovimiento: false });
  const video = pelicula.locator('.panel[data-panel="unas"] video');
  await expect(video).toHaveAttribute('src', /unas-trabajo\.mp4$/, { timeout: 10_000 });
  await expect(video).toHaveJSProperty('muted', true);
  await expect(pelicula.locator('.panel[data-panel="unas"]')).toHaveAttribute('data-viva', '', { timeout: 15_000 });
});

test('la pausa detiene el cambio de oficio y lo que se mueve, y el mismo boton lo reanuda', async ({ page }) => {
  const pelicula = await abrir(page, { sinMovimiento: false });
  const pausa = pelicula.getByRole('button', { name: 'Pausar el movimiento' });
  await expect(pausa).toHaveAttribute('aria-pressed', 'false');
  await pausa.click();
  await expect(pausa).toHaveAttribute('aria-pressed', 'true');
  await expect(pelicula).toHaveAttribute('data-pausada', '');
  await page.waitForTimeout(5400);
  await expect(pelicula).toHaveAttribute('data-oficio', 'unas');
  const corriendo = await pelicula.locator('.cursor').evaluate((cursor) => getComputedStyle(cursor).animationPlayState);
  expect(corriendo).toBe('paused');
  await pausa.click();
  await expect(pausa).toHaveAttribute('aria-pressed', 'false');
  await expect(pelicula).not.toHaveAttribute('data-pausada', /.*/);
});

test('al pasar el comercial, el video descansa', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'el WebKit de pruebas en Windows no trae el codec del video');
  const pelicula = await abrir(page, { sinMovimiento: false });
  const video = pelicula.locator('.panel[data-panel="unas"] video');
  await expect(pelicula.locator('.panel[data-panel="unas"]')).toHaveAttribute('data-viva', '', { timeout: 15_000 });
  await expect(video).toHaveJSProperty('paused', false);
  await page.evaluate(() => document.querySelector('#agente')?.scrollIntoView({ block: 'start' }));
  await expect(video).toHaveJSProperty('paused', true);
});

test('con el teclado, lo primero dentro del comercial son sus controles, no el boton del cartel', async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName === 'webkit' || info.project.name !== 'celular', 'se prueba donde los oficios se eligen');
  const pelicula = await abrir(page);
  const controles = await pelicula.evaluate((raiz) =>
    [...raiz.querySelectorAll('button, a[href]')].map(
      (uno) => uno.getAttribute('data-elegir') ?? uno.getAttribute('aria-label') ?? uno.textContent?.trim(),
    ),
  );
  expect(controles.slice(0, 4)).toEqual(['unas', 'dentista', 'medico', 'Pausar el movimiento']);
  await pelicula.getByRole('button', { name: 'Dentista' }).focus();
  await expect(pelicula).toHaveAttribute('data-toma', 'ruido');
});

test('la barra va transparente sobre el comercial y toma su fondo al pasarlo', async ({ page }) => {
  await abrir(page);
  const barra = page.locator('[data-barra]');
  await expect(barra).not.toHaveAttribute('data-fondo', /.*/);
  await page.evaluate(() => document.querySelector('#citas')?.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect(barra).toHaveAttribute('data-fondo', '');
});

test('el teclado llega al boton del cartel y el recorrido lo acompana', async ({ page, browserName }, info) => {
  test.skip(
    browserName === 'webkit' || info.project.name === 'celular' || info.project.name === 'previa',
    'el tabulador es de teclado fisico',
  );
  const pelicula = await abrir(page);
  const empieza = pelicula.getByRole('link', { name: 'Empieza ahora' });
  await empieza.focus();
  await expect(pelicula).toHaveAttribute('data-toma', 'cartel');
  await expect(empieza).toBeInViewport();
});

test('si el codigo del comercial no llega, queda como texto corrido y la pagina sigue', async ({ page }) => {
  await page.route('**/js/pelicula-vista.js', (ruta) => ruta.abort());
  await page.goto('./');
  await expect(page.locator('html')).not.toHaveClass(/con-pelicula/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
  await expect(page.getByRole('heading', { name: 'Agenda solo con pago previo.' })).toBeVisible();
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('el comercial se lee completo: la promesa, el problema, las cuatro ventajas y el boton', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
    for (const titulo of [
      '¿Y si no llega?',
      'Prompt Maestro',
      'Contesta en menos de un minuto.',
      'Entiende notas de voz.',
      'Ve las fotos.',
      'Agenda solo con pago previo.',
      'Tú, a lo tuyo.',
    ]) {
      await expect(page.getByRole('heading', { name: titulo, exact: true })).toBeVisible();
    }
    await expect(page.locator('.pelicula').getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
    await expect(page.locator('.pelicula__pasos')).toBeHidden();
    await expect(page.locator('.oficios')).toBeHidden();
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desborde).toBeLessThanOrEqual(0);
  });
});
