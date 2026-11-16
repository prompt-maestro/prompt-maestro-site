// @ts-check
import { readFileSync } from 'node:fs';
import { vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

const ALTA = 'https://alta.prompt-maestro.com/';
const PASOS = ['precio', 'horarios', 'apartado', 'pagado', 'recordatorios', 'asistencia'];
// Los nombres de los planes salen del mismo archivo que la pagina.
/** @type {{ planes: { nombre: string }[] }} */
const { planes: PLANES } = JSON.parse(readFileSync(new URL('../../fuente/datos/planes.json', import.meta.url), 'utf8'));

/** Lo que le llego a Umami: el nombre del evento y sus propiedades. @typedef {[string, Record<string, string | number> | undefined]} Anotado */

/**
 * Pone un Umami de mentira antes que el codigo de la pagina: anota en window.__eventos lo que le mandan. La pagina no
 * deja correr scripts en linea, por eso entra por aqui.
 * @param {import('@playwright/test').Page} page
 */
async function conUmami(page) {
  await page.addInitScript(() => {
    const ventana = /** @type {any} */ (window);
    ventana.__eventos = [];
    ventana.umami = { track: (/** @type {string} */ n, /** @type {unknown} */ d) => ventana.__eventos.push([n, d]) };
  });
}

/**
 * Los enlaces que sacan de la pagina (el alta, el correo) no se siguen: el clic pasa, pero la prueba se queda aqui.
 * @param {import('@playwright/test').Page} page
 */
async function sinSalir(page) {
  await page.addInitScript(() => {
    document.addEventListener('click', (evento) => {
      const enlace = evento.target instanceof Element ? evento.target.closest('a[href]') : null;
      if (/^(https:\/\/alta\.|mailto:)/.test(enlace?.getAttribute('href') ?? '')) evento.preventDefault();
    });
  });
}

/**
 * Abre la pagina con menos movimiento y espera a que este viva. La medicion se monta antes que la demostracion.
 * @param {import('@playwright/test').Page} page
 */
async function abrir(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const demo = page.locator('[data-demo]');
  await expect(demo).toHaveAttribute('data-viva', '');
  return demo;
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Anotado[]>}  todo lo que le ha llegado a Umami
 */
function anotados(page) {
  return page.evaluate(() => /** @type {any} */ (window).__eventos);
}

/**
 * Las propiedades de cada vez que llego ese evento, en su orden.
 * @param {import('@playwright/test').Page} page
 * @param {string} nombre
 */
async function de(page, nombre) {
  return (await anotados(page)).filter(([cual]) => cual === nombre).map(([, propiedades]) => propiedades);
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
 * Lleva la historia, a toques, desde el reposo hasta la pregunta de asistencia.
 * @param {import('@playwright/test').Locator} demo
 * @param {string} dia
 * @param {string} hora
 */
async function hastaAsistencia(demo, dia, hora) {
  await tocar(demo, 'Enviar', 'precio');
  await tocar(demo, dia, 'horarios');
  await tocar(demo, hora, 'apartado');
  await tocar(demo, 'Pagar anticipo (simulado)', 'pagado');
  await tocar(demo, 'Ver qué pasa después', 'recordatorios');
  await tocar(demo, 'Ir al final de la cita', 'asistencia');
}

/**
 * @param {import('@playwright/test').Locator} demo
 * @param {string} nombre
 */
function botonDeEjemplo(demo, nombre) {
  return demo.getByRole('group', { name: 'Ejemplo' }).getByRole('button', { name: nombre, exact: true });
}

test('la demostracion avisa su inicio al toque, cada paso una vez y su final; reiniciar no avisa nada', async ({
  page,
}) => {
  test.slow(); // la historia completa, a toques, y de vuelta
  await conUmami(page);
  const demo = await abrir(page);
  await hastaAsistencia(demo, 'El jueves', '5:00 pm');
  await demo.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre', { timeout: 15_000 });
  const pasos = PASOS.map((paso) => ({ giro: 'unas', paso }));
  await expect.poll(() => de(page, 'demo_paso')).toEqual(pasos);
  expect(await de(page, 'demo_inicio')).toEqual([{ giro: 'unas', modo: 'toque' }]);
  expect(await de(page, 'demo_fin')).toEqual([{ giro: 'unas', asistio: 'si' }]);
  // Volver al principio no es un paso ni un inicio. La segunda vuelta se mide igual que la primera.
  await demo.getByRole('button', { name: 'Ver otra vez' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await tocar(demo, 'Enviar', 'precio');
  await demo.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect.poll(() => de(page, 'demo_paso')).toEqual([...pasos, { giro: 'unas', paso: 'precio' }]);
  expect(await de(page, 'demo_inicio')).toEqual([
    { giro: 'unas', modo: 'toque' },
    { giro: 'unas', modo: 'toque' },
  ]);
  expect(await de(page, 'demo_fin')).toHaveLength(1);
  expect(await de(page, 'ejemplo_cambio')).toEqual([]);
});

test('si nadie la toca y arranca sola a los 4 segundos, el inicio dice que fue sola', async ({ page }) => {
  test.slow(); // son 4 segundos de reloj; con la maquina cargada Firefox tarda mas en contarlos
  await conUmami(page);
  const demo = await abrir(page);
  await demo.locator('.telefono').scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-paso', 'precio', { timeout: 30_000 });
  await expect.poll(() => de(page, 'demo_inicio')).toEqual([{ giro: 'unas', modo: 'sola' }]);
  expect(await de(page, 'demo_paso')).toEqual([{ giro: 'unas', paso: 'precio' }]);
});

test('pedir verla toda es un inicio al toque: la visitante fue quien la echo a andar', async ({ page }) => {
  await conUmami(page);
  const demo = await abrir(page);
  await demo.getByRole('button', { name: 'Ver todo solo' }).click();
  await expect.poll(() => de(page, 'demo_inicio')).toEqual([{ giro: 'unas', modo: 'toque' }]);
  // De ahi sigue sola, y cada paso al que llega se avisa: el primero es el precio y el segundo, los horarios.
  await expect
    .poll(async () => (await de(page, 'demo_paso')).slice(0, 2), { timeout: 15_000 })
    .toEqual([
      { giro: 'unas', paso: 'precio' },
      { giro: 'unas', paso: 'horarios' },
    ]);
  expect(await de(page, 'demo_inicio')).toHaveLength(1);
});

test('cambiar de ejemplo avisa cual; su historia lleva ese giro y el No se mide como no', async ({ page }) => {
  test.slow(); // la historia completa, a toques
  await conUmami(page);
  await sinSalir(page);
  const demo = await abrir(page);
  await botonDeEjemplo(demo, 'Dentista').click();
  await expect(demo).toHaveAttribute('data-ejemplo', 'dentista');
  // Tocar el que ya esta puesto no es un cambio.
  await botonDeEjemplo(demo, 'Dentista').click();
  await hastaAsistencia(demo, 'El miércoles', '4:00 pm');
  await demo.getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre', { timeout: 15_000 });
  await expect.poll(() => de(page, 'demo_fin')).toEqual([{ giro: 'dentista', asistio: 'no' }]);
  expect(await de(page, 'ejemplo_cambio')).toEqual([{ giro: 'dentista' }]);
  expect(await de(page, 'demo_inicio')).toEqual([{ giro: 'dentista', modo: 'toque' }]);
  expect(await de(page, 'demo_paso')).toEqual(PASOS.map((paso) => ({ giro: 'dentista', paso })));
  // El boton con que cierra la demostracion se pinta al final: su clic tambien se mide, con su lugar.
  await demo.getByRole('link', { name: 'Empieza ahora' }).click();
  await expect.poll(() => de(page, 'clic_empieza')).toEqual([{ lugar: 'demo' }]);
  // Cambiar de ejemplo con la historia ya contada la regresa al reposo: avisa el cambio y nada mas.
  await botonDeEjemplo(demo, 'Médico').click();
  await expect(demo).toHaveAttribute('data-ejemplo', 'medico');
  await expect.poll(() => de(page, 'ejemplo_cambio')).toEqual([{ giro: 'dentista' }, { giro: 'medico' }]);
  expect(await de(page, 'demo_inicio')).toHaveLength(1);
  expect(await de(page, 'demo_paso')).toHaveLength(PASOS.length);
  expect(await de(page, 'demo_fin')).toHaveLength(1);
});

test('cada enlace al alta avisa desde donde se toco y, en los planes, cual plan; los demas enlaces no cuentan', async ({
  page,
}) => {
  await conUmami(page);
  await sinSalir(page);
  await abrir(page);
  // Un clic de verdad en el boton de un plan y otro en el del cierre.
  const segundo = /** @type {{ nombre: string }} */ (PLANES[1]);
  await page.locator('.plan').nth(1).getByRole('link').click();
  await expect.poll(() => de(page, 'clic_empieza')).toEqual([{ lugar: 'planes', plan: segundo.nombre.toLowerCase() }]);
  await page.locator(`#empieza a[href="${ALTA}"]`).click();
  await expect.poll(() => de(page, 'clic_empieza')).toHaveLength(2);
  // Fuera de una tarjeta de plan el evento no lleva esa propiedad, ni vacia.
  expect((await de(page, 'clic_empieza'))[1]).toStrictEqual({ lugar: 'cierre' });
  // Y ahora todos, esten a la vista o no: cada uno avisa su lugar, y ninguno se queda sin medir.
  const enlaces = page.locator(`a[href="${ALTA}"]`);
  const esperados = await enlaces.evaluateAll((todos) =>
    todos.map((enlace) => {
      const lugar = enlace.getAttribute('data-lugar') ?? '';
      const plan = enlace.closest('[data-plan]')?.getAttribute('data-plan');
      return plan ? { lugar, plan: plan.toLowerCase() } : { lugar };
    }),
  );
  expect(esperados.length).toBeGreaterThanOrEqual(5);
  expect(esperados.flatMap(({ plan }) => plan ?? [])).toEqual(PLANES.map((plan) => plan.nombre.toLowerCase()));
  for (const enlace of await enlaces.all()) await enlace.dispatchEvent('click');
  await expect.poll(async () => (await de(page, 'clic_empieza')).slice(2)).toEqual(esperados);
  // Un enlace que solo baja a una seccion no es ni empieza ni acompanar, aunque diga su lugar.
  const interno = page.locator('a[data-lugar][href^="#"]').first();
  await expect(interno).toBeAttached();
  await interno.dispatchEvent('click');
  await page.locator('a.salto').dispatchEvent('click');
  expect(await de(page, 'clic_empieza')).toHaveLength(2 + esperados.length);
  expect(await de(page, 'clic_acompanar')).toEqual([]);
});

test('un enlace de correo es clic_acompanar con su lugar, sin la direccion ni el asunto', async ({ page }) => {
  await conUmami(page);
  await sinSalir(page);
  await abrir(page);
  await page.locator('#empieza a[href^="mailto:"]').click();
  await expect.poll(() => de(page, 'clic_acompanar')).toEqual([{ lugar: 'cierre' }]);
  const correos = page.locator('a[href^="mailto:"]');
  const esperados = await correos.evaluateAll((todos) =>
    todos.map((enlace) => ({ lugar: enlace.getAttribute('data-lugar') ?? '' })),
  );
  expect(esperados.length).toBeGreaterThanOrEqual(3);
  for (const correo of await correos.all()) await correo.dispatchEvent('click');
  await expect.poll(async () => (await de(page, 'clic_acompanar')).slice(1)).toEqual(esperados);
  expect(JSON.stringify(await anotados(page))).not.toMatch(/mailto|@|subject|hola/i);
  expect(await de(page, 'clic_empieza')).toEqual([]);
});

test('la calculadora avisa una sola vez que se uso, y nunca lo que la persona escribio', async ({ page }) => {
  await conUmami(page);
  await abrir(page);
  const calculadora = page.locator('[data-calculadora]');
  await expect(calculadora).toHaveAttribute('data-viva', '');
  expect(await de(page, 'calculadora_uso')).toEqual([]);
  const citas = calculadora.locator('[data-calculadora-citas]');
  const precio = calculadora.locator('[data-calculadora-precio]');
  await citas.fill('37');
  await expect.poll(() => de(page, 'calculadora_uso')).toHaveLength(1);
  // Sigue escribiendo, tecla por tecla, y corrige: ya no vuelve a avisar.
  await precio.pressSequentially('8642');
  await citas.fill('41');
  await expect(calculadora).toHaveAttribute('data-estado', 'lista');
  await expect(calculadora.locator('[data-calculadora-salida]')).toContainText('$354,322');
  // Una vez por visita, sin ninguna propiedad.
  expect(await de(page, 'calculadora_uso')).toEqual([undefined]);
  // Ni los numeros que escribio ni la cuenta que le salio van en ningun evento.
  expect(JSON.stringify(await anotados(page))).not.toMatch(/\d/);
});

test('abrir una pregunta avisa su posicion; cerrarla no avisa nada', async ({ page }) => {
  await conUmami(page);
  await abrir(page);
  const preguntas = page.locator('details.pregunta');
  const tercera = preguntas.nth(2);
  await tercera.locator('summary').click();
  await expect(tercera).toHaveAttribute('open', '');
  await expect.poll(() => de(page, 'pregunta_abre')).toEqual([{ id: 3 }]);
  await tercera.locator('summary').click();
  await expect(tercera).not.toHaveAttribute('open', /.*/);
  // El cierre de la tercera ya paso cuando llega el aviso de la primera: si contara, estaria en medio.
  await preguntas.first().locator('summary').click();
  await expect.poll(() => de(page, 'pregunta_abre')).toEqual([{ id: 3 }, { id: 1 }]);
  await tercera.locator('summary').click();
  await expect.poll(() => de(page, 'pregunta_abre')).toEqual([{ id: 3 }, { id: 1 }, { id: 3 }]);
  // Solo va el numero: nada del texto de la pregunta.
  expect(Object.keys((await de(page, 'pregunta_abre'))[0] ?? {})).toEqual(['id']);
});

test('un error de JavaScript avisa el archivo y la linea: nunca el mensaje ni la direccion completa', async ({
  page,
}) => {
  // Un archivo del mismo sitio que truena en su linea 3, y otro en la 1.
  await page.route(/\/truena(-otra)?\.js/, (ruta) =>
    ruta.fulfill({
      contentType: 'text/javascript',
      body: ruta.request().url().includes('truena-otra')
        ? 'throw new Error("otro mensaje privado");'
        : '// uno\n// dos\nthrow new Error("mensaje privado de zutana");\n',
    }),
  );
  await conUmami(page);
  await abrir(page);
  await page.addScriptTag({ url: './truena.js?correo=zutana@correo.com&paso=2#ancla' });
  await expect.poll(() => de(page, 'error_js')).toEqual([{ archivo: 'truena.js', linea: 3 }]);
  // El mismo error otra vez no se repite; uno distinto si cuenta.
  await page.addScriptTag({ url: './truena.js?otra=vez' });
  await page.addScriptTag({ url: './truena-otra.js' });
  await expect
    .poll(() => de(page, 'error_js'))
    .toEqual([
      { archivo: 'truena.js', linea: 3 },
      { archivo: 'truena-otra.js', linea: 1 },
    ]);
  const todo = JSON.stringify(await anotados(page));
  expect(todo).not.toMatch(/mensaje|privado|zutana|correo|http|127\.0\.0\.1|localhost|\?|#|\//i);
  // Un error que no dice de que archivo viene (codigo de otro sitio) no se mide.
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', filename: '', lineno: 0 }));
  });
  expect(await de(page, 'error_js')).toHaveLength(2);
});

/** Lo que puede pasar con Umami: que no este (su script no llego, lo bloquearon) o que este y falle. */
const SIN_MEDICION = /** @type {[string, (() => void) | null][]} */ ([
  ['sin Umami', null],
  [
    'con un Umami que truena',
    () => {
      const ventana = /** @type {any} */ (window);
      ventana.__intentos = 0;
      ventana.umami = {
        track() {
          ventana.__intentos += 1;
          throw new Error('umami roto');
        },
      };
    },
  ],
  [
    'con un Umami que falla despues',
    () => {
      const ventana = /** @type {any} */ (window);
      ventana.__intentos = 0;
      ventana.umami = {
        track() {
          ventana.__intentos += 1;
          return Promise.reject(new Error('sin red'));
        },
      };
    },
  ],
]);

for (const [caso, poner] of SIN_MEDICION) {
  test(`${caso}, nada truena y la pagina sigue viva`, async ({ page }) => {
    const fallas = vigilar(page);
    if (poner) await page.addInitScript(poner);
    await sinSalir(page);
    const demo = await abrir(page);
    // Todo lo que se mide, de corrido: la demostracion, el ejemplo, una pregunta, la calculadora, los enlaces y un error.
    await tocar(demo, 'Enviar', 'precio');
    await tocar(demo, 'El jueves', 'horarios');
    await botonDeEjemplo(demo, 'Dentista').click();
    await expect(demo).toHaveAttribute('data-ejemplo', 'dentista');
    await expect(demo.locator('[data-demo-nombre]')).toHaveText('Dental Sonría');
    const pregunta = page.locator('details.pregunta').first();
    await pregunta.locator('summary').click();
    await expect(pregunta).toHaveAttribute('open', '');
    const calculadora = page.locator('[data-calculadora]');
    await calculadora.locator('[data-calculadora-citas]').fill('6');
    await calculadora.locator('[data-calculadora-precio]').fill('400');
    await expect(calculadora.locator('[data-calculadora-salida]')).toContainText('$2,400');
    await page.locator(`#empieza a[href="${ALTA}"]`).click();
    await page.locator('#empieza a[href^="mailto:"]').click();
    // Un error de codigo, como lo avisa el navegador (hecho a mano: uno de verdad ensuciaria la consola de la prueba).
    await page.evaluate(() => {
      const filename = `${location.origin}/a/0123456789/js/pagina.js`;
      window.dispatchEvent(new ErrorEvent('error', { message: 'x', filename, lineno: 7 }));
    });
    if (poner) {
      // Hubo a quien mandarle y fallo cada vez: se intento con los nueve eventos de este recorrido (el inicio, dos
      // pasos, el ejemplo, la pregunta, la calculadora, los dos enlaces y el error) y ninguno hizo ruido.
      await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__intentos)).toBe(9);
    } else {
      // La medicion no inventa un Umami cuando no lo hay.
      expect(await page.evaluate(() => 'umami' in window)).toBe(false);
    }
    expect(fallas).toEqual([]);
  });
}
