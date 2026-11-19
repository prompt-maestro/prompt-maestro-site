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

test('en pausa lo que el agente ya hizo se queda a la vista, quieto, y lo que falta por entrar se espera: la pausa no borra ni adelanta nada', async ({
  page,
}, info) => {
  test.skip(!esAncho(info), 'el corto solo corre en pantallas anchas');
  // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
  test.slow();
  const corto = await abrirCortoDetenido(page);
  await hastaElCuadro(page, corto, 'agente');
  // La conversacion del oficio que toco: la unica a la vista. Sus renglones y, sobre el papel, el sello.
  const hecho = corto.locator('[data-escena]:not([hidden]) .escena__sobre--hecho');
  const renglones = hecho.locator('.trato > *');
  const sello = hecho.locator('.sello');
  expect(await renglones.count()).toBeGreaterThan(4);
  const pausa = corto.getByRole('button', { name: 'Pausar el video' });
  /**
   * Como va cada pieza de la conversacion (sus renglones y, al final, el sello): si ya termino de entrar, si lo que
   * le falta esta detenido, por donde va su entrada y cuanto se ve. Las entradas corren con el reloj de verdad del
   * navegador, no con el de la prueba: por eso aqui no se adivina cuando cae cada una, se le pregunta.
   */
  const piezas = () =>
    hecho.evaluate(async (el) => {
      const todas = [...el.querySelectorAll('.trato > *, .sello')];
      // Una pausa (o una reanudacion) no queda firme sino hasta el cuadro que sigue: se espera a que cada entrada
      // este al dia antes de preguntarle por donde va.
      const alDia = todas.flatMap((pieza) => pieza.getAnimations().map((una) => una.ready.catch(() => undefined)));
      await Promise.all(alDia);
      return todas.map((pieza) => {
        const entradas = pieza.getAnimations();
        return {
          entro: entradas.every((una) => una.playState === 'finished'),
          quieta: entradas.every((una) => ['finished', 'paused'].includes(una.playState)),
          va: entradas.map((una) => Number(una.currentTime)),
          seVe: getComputedStyle(pieza).opacity,
        };
      });
    });

  // Primera pausa, en cuanto empieza el momento: al sello, que es lo ultimo, le faltan casi cinco segundos para caer.
  await pausa.click();
  await expect(corto).toHaveAttribute('data-pausada', '');
  const alPausar = await piezas();
  expect(alPausar.at(-1)).toMatchObject({ entro: false, seVe: '0' });
  for (const pieza of alPausar) expect(pieza.quieta).toBe(true);
  // Pasa el tiempo y nada avanzo: lo que faltaba por entrar sigue esperando justo donde iba.
  await page.waitForTimeout(1500);
  expect(await piezas()).toEqual(alPausar);
  await expect(sello).toHaveCSS('opacity', '0');

  // Al reanudar entran todas, una tras otra: se espera a que termine la ultima, que es el sello. (Antes la prueba
  // pausaba en cuanto veia los renglones, y si la pausa caia antes que el sello, lo dejaba, con razon, sin caer.)
  await pausa.click();
  await expect(corto).not.toHaveAttribute('data-pausada', /.*/);
  await expect.poll(async () => (await piezas()).every((pieza) => pieza.entro), { timeout: 20_000 }).toBe(true);

  // Segunda pausa, con todo ya puesto: cada renglon y el sello siguen a la vista, completos. La pausa no los borra.
  await pausa.click();
  await expect(corto).toHaveAttribute('data-pausada', '');
  for (const renglon of await renglones.all()) {
    await expect(renglon).toBeVisible();
    await expect(renglon).toHaveCSS('opacity', '1');
  }
  await expect(sello).toBeVisible();
  await expect(sello).toHaveCSS('opacity', '1');
});

test('en pausa el contador de mensajes sin contestar tampoco avanza, y al reanudar sigue', async ({ page }, info) => {
  test.skip(!esAncho(info), 'el corto solo corre en pantallas anchas');
  // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
  test.slow();
  const corto = await abrirCortoDetenido(page);
  await hastaElCuadro(page, corto, 'avalancha');
  await page.clock.runFor(500);
  // La cuenta del celular que se ve: la del oficio que toco.
  const cuenta = corto.locator('.pantalla').filter({ visible: true }).locator('[data-corto-cuenta]');
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

test('en pausa la raya del barrido se queda donde iba, con lo de antes a medio destapar y sin moverse; al reanudar sigue cruzando', async ({
  page,
}, info) => {
  test.skip(!esAncho(info), 'el corto solo corre en pantallas anchas');
  // Con el corto corriendo el navegador de pruebas va despacio: se le da su tiempo.
  test.slow();
  const corto = await abrirCortoDetenido(page);
  // A la raya la mueve el navegador, en tiempo real: para alcanzarla a media cruzada con cualquier maquina, aqui
  // cruza mas despacio. (Lo que tarda se lo dice el codigo a los estilos en este mismo dato; lo que de verdad tarda
  // lo cuida la prueba del barrido.)
  await corto.locator('[data-corto-cine]').evaluate((cine) => cine.style.setProperty('--cruza', '14000ms'));
  await hastaElCuadro(page, corto, 'barrido');
  const pausa = corto.getByRole('button', { name: 'Pausar el video' });
  /**
   * Como van las tres capas del barrido (la caja de lo de antes, su contenido y la raya): si sus animaciones estan
   * detenidas, por donde va cada una y cuanto se ha corrido. Y donde esta en la pantalla el celular de lo de antes.
   */
  const barrido = () =>
    corto.evaluate(async (seccion) => {
      const capas = ['.corto__antes', '.corto__antes-dentro', '.corto__carro'].map((selector) => {
        const capa = seccion.querySelector(selector);
        if (!capa) throw new Error(`falta ${selector}`);
        return capa;
      });
      // Una pausa (o una reanudacion) no queda firme sino hasta el cuadro que sigue: se espera a que cada animacion
      // este al dia antes de preguntarle por donde va.
      await Promise.all(capas.flatMap((capa) => capa.getAnimations().map((una) => una.ready.catch(() => undefined))));
      const celular = [...seccion.querySelectorAll('.pantalla')]
        .find((una) => una.getClientRects().length > 0)
        ?.getBoundingClientRect();
      return {
        estados: capas.map((capa) =>
          capa
            .getAnimations()
            .map((una) => una.playState)
            .join(' '),
        ),
        va: capas.map((capa) => capa.getAnimations().map((una) => Number(una.currentTime))),
        corrida: capas.map((capa) => new DOMMatrixReadOnly(getComputedStyle(capa).transform).m41),
        celular: celular ? [celular.left, celular.top, celular.width, celular.height] : [],
        ancho: innerWidth,
      };
    });
  /**
   * La caja de lo de antes y la raya van juntas, y el contenido de la caja lleva lo mismo al reves: en la pantalla,
   * lo de antes no se mueve.
   * @param {Awaited<ReturnType<typeof barrido>>} cuadro
   */
  const sinMoverLoDeAntes = (cuadro) => {
    const [caja = 0, contenido = 0, raya = 0] = cuadro.corrida;
    expect(Math.abs(raya - caja)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(contenido + caja)).toBeLessThanOrEqual(0.5);
  };

  // La raya ya entro a la pantalla y va cruzando: lo de antes se va destapando.
  await expect.poll(async () => (await barrido()).corrida[0] ?? 0, { timeout: 20_000 }).toBeGreaterThan(30);
  const alEntrar = await barrido();
  expect(alEntrar.celular).toHaveLength(4);
  sinMoverLoDeAntes(alEntrar);

  // Pausa a media cruzada: las tres capas se detienen donde iban, con lo de antes a medio destapar.
  await pausa.click();
  await expect(corto).toHaveAttribute('data-pausada', '');
  const alPausar = await barrido();
  expect(alPausar.estados).toEqual(['paused', 'paused', 'paused paused']);
  sinMoverLoDeAntes(alPausar);
  expect(alPausar.corrida[0] ?? 0).toBeGreaterThanOrEqual(alEntrar.corrida[0] ?? 0);
  expect(alPausar.corrida[0] ?? 0).toBeLessThan(alPausar.ancho);
  // Pasa el tiempo y nada avanzo: ni la raya, ni la caja, ni su contenido.
  await page.waitForTimeout(1500);
  expect(await barrido()).toEqual(alPausar);
  await expect(corto).toHaveAttribute('data-cuadro', 'barrido');

  // Al reanudar, la raya sigue cruzando desde donde se quedo, y lo de antes sigue en su lugar: el celular que se
  // va destapando no se ha movido ni un punto desde que la raya entro.
  await pausa.click();
  await expect(corto).not.toHaveAttribute('data-pausada', /.*/);
  await expect
    .poll(async () => (await barrido()).corrida[0] ?? 0, { timeout: 20_000 })
    .toBeGreaterThan((alPausar.corrida[0] ?? 0) + 60);
  const despues = await barrido();
  sinMoverLoDeAntes(despues);
  for (const [cual, medida] of despues.celular.entries()) {
    expect(Math.abs(medida - (alEntrar.celular[cual] ?? 0))).toBeLessThanOrEqual(0.5);
  }
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
  expect(paradas).toEqual(['Empieza ahora', 'Míralo en acción']);
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

test('si no llega pagina.js, la pagina queda como sin JavaScript sin esperar a nada mas: el cartel, sin corto, y la calculadora guardada', async ({
  page,
}) => {
  await page.route('**/js/pagina.js', (ruta) => ruta.abort());
  await page.goto('./');
  const pagina = page.locator('html');
  // arranque.js se entera por la falla del archivo (no escucha "load") y le quita a cada pieza su marca.
  await expect(pagina).not.toHaveClass(/con-js/);
  await expect(pagina).not.toHaveClass(/con-corto/);
  await expect(pagina).not.toHaveClass(/con-cuenta/);
  const corto = page.locator('[data-corto]');
  await expect(corto.getByRole('heading', { level: 1 })).toHaveText('Despreocúpate');
  await expect(corto.getByRole('link', { name: 'Empieza ahora' })).toBeVisible();
  await expect(corto.locator('[data-corto-cine]')).toBeHidden();
  await expect(corto.locator('button').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('[data-calculadora]')).toBeHidden();
  await expect(page.locator('.plan')).toHaveCount(3);
  // El oficio que le toco a la visita si quedo elegido: eso lo hace arranque.js solo.
  await expect(pagina).toHaveAttribute('data-oficio', /^(unas|dentista|medico)$/);
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
