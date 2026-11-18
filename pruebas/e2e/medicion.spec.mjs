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
 * El boton de la pausa. Con menos movimiento es el que hace avanzar la historia: cada toque pinta la parada siguiente.
 * @param {import('@playwright/test').Locator} demo
 */
const botonDePausa = (demo) => demo.locator('[data-demo-pausa]');

/**
 * Con menos movimiento: lleva la historia, a toques, hasta que llega a un paso.
 * @param {import('@playwright/test').Locator} demo
 * @param {string} paso
 */
async function hastaElPaso(demo, paso) {
  for (let toque = 0; toque < 12 && (await demo.getAttribute('data-paso')) !== paso; toque++) {
    await botonDePausa(demo).click();
  }
  await expect(demo).toHaveAttribute('data-paso', paso);
}

/**
 * Abre la pagina sin pedir menos movimiento (la historia corre sola) y espera a que este viva.
 * @param {import('@playwright/test').Page} page
 */
async function abrirConMovimiento(page) {
  await page.goto('./');
  const demo = page.locator('[data-demo]');
  await expect(demo).toHaveAttribute('data-viva', '');
  return demo;
}

/**
 * @param {import('@playwright/test').Locator} demo
 * @param {string} nombre
 */
function botonDeEjemplo(demo, nombre) {
  return demo.getByRole('group', { name: 'Ejemplo' }).getByRole('button', { name: nombre, exact: true });
}

test('la demostracion avisa su inicio al toque, cada paso una vez y su final; verla otra vez es otra historia', async ({
  page,
}) => {
  test.slow(); // la historia completa, a toques, y de vuelta
  await conUmami(page);
  const demo = await abrir(page);
  // Pidio menos movimiento: la historia avanza a toques, y el primero es el inicio.
  await hastaElPaso(demo, 'asistencia');
  await demo.getByRole('button', { name: 'Sí', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finSi');
  await botonDePausa(demo).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  // "pagado" abarca dos paradas (el pago aprobado y la cita confirmada) y se avisa una sola vez.
  const pasos = PASOS.map((paso) => ({ giro: 'unas', paso }));
  await expect.poll(() => de(page, 'demo_paso')).toEqual(pasos);
  expect(await de(page, 'demo_inicio')).toEqual([{ giro: 'unas', modo: 'toque' }]);
  expect(await de(page, 'demo_fin')).toEqual([{ giro: 'unas', asistio: 'si' }]);
  // Regresar con una rayita a un momento ya visto no es otro paso ni otro inicio, y contestar distinto no es otro
  // final: la historia es la misma.
  await demo.getByRole('button', { name: '03 Cobra el anticipo', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'apartado');
  await hastaElPaso(demo, 'asistencia');
  await demo.getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await botonDePausa(demo).click();
  await expect(demo).toHaveAttribute('data-paso', 'cierre');
  expect(await de(page, 'demo_paso')).toEqual(pasos);
  expect(await de(page, 'demo_inicio')).toHaveLength(1);
  expect(await de(page, 'demo_fin')).toEqual([{ giro: 'unas', asistio: 'si' }]);
  // Verla otra vez si es otra historia: se mide igual que la primera.
  await expect(botonDePausa(demo)).toHaveAccessibleName('Ver otra vez');
  await botonDePausa(demo).click();
  await expect(demo).toHaveAttribute('data-paso', 'precio');
  await expect.poll(() => de(page, 'demo_paso')).toEqual([...pasos, { giro: 'unas', paso: 'precio' }]);
  expect(await de(page, 'demo_inicio')).toEqual([
    { giro: 'unas', modo: 'toque' },
    { giro: 'unas', modo: 'toque' },
  ]);
  expect(await de(page, 'demo_fin')).toHaveLength(1);
  expect(await de(page, 'ejemplo_cambio')).toEqual([]);
});

test('si nadie la toca y arranca sola al quedar a la vista, el inicio dice que fue sola', async ({ page }) => {
  test.slow(); // corre con el reloj de verdad; con la maquina cargada Firefox tarda mas en contarlo
  await conUmami(page);
  const demo = await abrirConMovimiento(page);
  // Arriba de la pagina no se ve: todavia no hay inicio.
  expect(await de(page, 'demo_inicio')).toEqual([]);
  await demo.locator('[data-demo-tel]').evaluate((tel) => tel.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(demo).toHaveAttribute('data-paso', 'precio', { timeout: 30_000 });
  await expect.poll(() => de(page, 'demo_inicio')).toEqual([{ giro: 'unas', modo: 'sola' }]);
  expect(await de(page, 'demo_paso')).toEqual([{ giro: 'unas', paso: 'precio' }]);
});

test('echarla a andar con una rayita es un inicio al toque, y se avisa el paso al que llega', async ({ page }) => {
  test.slow(); // corre con el reloj de verdad
  await conUmami(page);
  const demo = await abrirConMovimiento(page);
  await demo.getByRole('button', { name: '02 Ofrece horarios', exact: true }).click();
  await expect.poll(() => de(page, 'demo_inicio')).toEqual([{ giro: 'unas', modo: 'toque' }]);
  // El precio se lo brinco: no lo vio, no se avisa.
  expect(await de(page, 'demo_paso')).toEqual([{ giro: 'unas', paso: 'horarios' }]);
  // De ahi sigue sola, y cada paso al que llega se avisa: el siguiente es el apartado.
  await expect
    .poll(async () => (await de(page, 'demo_paso')).slice(0, 2), { timeout: 30_000 })
    .toEqual([
      { giro: 'unas', paso: 'horarios' },
      { giro: 'unas', paso: 'apartado' },
    ]);
  expect(await de(page, 'demo_inicio')).toHaveLength(1);
});

test('pausarla antes de que empiece y continuar tambien es un inicio al toque', async ({ page }) => {
  test.slow(); // corre con el reloj de verdad
  await conUmami(page);
  const demo = await abrirConMovimiento(page);
  await botonDePausa(demo).click();
  await expect(botonDePausa(demo)).toHaveAccessibleName('Continuar');
  // Pausada no empieza, por mas que este a la vista.
  await page.waitForTimeout(2500);
  expect(await de(page, 'demo_inicio')).toEqual([]);
  await botonDePausa(demo).click();
  await expect.poll(() => de(page, 'demo_inicio'), { timeout: 30_000 }).toEqual([{ giro: 'unas', modo: 'toque' }]);
});

test('cambiar de ejemplo avisa cual; su historia lleva ese giro y el No se mide como no', async ({ page }) => {
  test.slow(); // la historia completa, a toques
  await conUmami(page);
  const demo = await abrir(page);
  await botonDeEjemplo(demo, 'Dentista').click();
  await expect(demo).toHaveAttribute('data-ejemplo', 'dentista');
  // Tocar el que ya esta puesto no es un cambio.
  await botonDeEjemplo(demo, 'Dentista').click();
  await hastaElPaso(demo, 'asistencia');
  await demo.getByRole('button', { name: 'No', exact: true }).click();
  await expect(demo).toHaveAttribute('data-paso', 'finNo');
  await expect.poll(() => de(page, 'demo_fin')).toEqual([{ giro: 'dentista', asistio: 'no' }]);
  expect(await de(page, 'ejemplo_cambio')).toEqual([{ giro: 'dentista' }]);
  expect(await de(page, 'demo_inicio')).toEqual([{ giro: 'dentista', modo: 'toque' }]);
  expect(await de(page, 'demo_paso')).toEqual(PASOS.map((paso) => ({ giro: 'dentista', paso })));
  // Cambiar de ejemplo con la historia ya contada la regresa al principio: avisa el cambio y nada mas (pidio menos
  // movimiento: no vuelve a correr sola).
  await botonDeEjemplo(demo, 'Médico').click();
  await expect(demo).toHaveAttribute('data-ejemplo', 'medico');
  await expect(demo).toHaveAttribute('data-paso', 'reposo');
  await expect.poll(() => de(page, 'ejemplo_cambio')).toEqual([{ giro: 'dentista' }, { giro: 'medico' }]);
  expect(await de(page, 'demo_inicio')).toHaveLength(1);
  expect(await de(page, 'demo_paso')).toHaveLength(PASOS.length);
  expect(await de(page, 'demo_fin')).toHaveLength(1);
  // Su historia es otra, y se mide con su giro.
  await botonDePausa(demo).click();
  await expect
    .poll(() => de(page, 'demo_inicio'))
    .toEqual([
      { giro: 'dentista', modo: 'toque' },
      { giro: 'medico', modo: 'toque' },
    ]);
  await expect.poll(() => de(page, 'demo_paso')).toHaveLength(PASOS.length + 1);
  expect((await de(page, 'demo_paso')).at(-1)).toEqual({ giro: 'medico', paso: 'precio' });
  // Ningun evento de la demostracion lleva texto de la conversacion: solo el giro y un valor de su lista.
  const deLaDemo = (await anotados(page)).filter(([nombre]) => /^(demo_|ejemplo_)/.test(nombre));
  expect(deLaDemo.length).toBeGreaterThan(10);
  for (const [, propiedades] of deLaDemo) {
    for (const valor of Object.values(propiedades ?? {})) expect(String(valor)).toMatch(/^[a-z]+$/);
  }
});

test('con la historia corriendo, cambiar de ejemplo la echa a andar de nuevo: otro inicio, al toque', async ({
  page,
}) => {
  test.slow(); // corre con el reloj de verdad
  await conUmami(page);
  const demo = await abrirConMovimiento(page);
  await botonDeEjemplo(demo, 'Médico').click();
  await expect(demo).toHaveAttribute('data-ejemplo', 'medico');
  await expect(demo).toHaveAttribute('data-paso', 'precio', { timeout: 30_000 });
  const inicios = await de(page, 'demo_inicio');
  // Si alcanzo a empezar sola con el primer ejemplo, ese inicio fue suyo; el de Medico lo provoco la visitante.
  expect(inicios.at(-1)).toEqual({ giro: 'medico', modo: 'toque' });
  expect(inicios.filter((inicio) => inicio?.giro === 'medico')).toHaveLength(1);
  expect(await de(page, 'ejemplo_cambio')).toEqual([{ giro: 'medico' }]);
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
    await hastaElPaso(demo, 'horarios');
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
