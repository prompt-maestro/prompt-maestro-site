// @ts-check
// Las secciones nuevas en movimiento y en cada tamano: lo que falta por ver espera apagado y se enciende una sola vez
// al llegar; con movimiento reducido, sin JavaScript o si su archivo no llega, todo esta encendido y quieto; y nada se
// sale de la pantalla ni brinca, del celular mas chico a la computadora.
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

/** Las secciones que cambiaron. */
const SECCIONES = ['como-funciona', 'para-quien', 'en-una-frase', 'planes', 'preguntas'];
/** Las tres que traen piezas que se encienden: seis estaciones, tres retratos y el antes y el despues. */
const CON_ENCENDIDO = ['#como-funciona', '#para-quien', '#en-una-frase'];
// Y una mas: el boton con luz de "Citas garantizadas", que da sus dos vueltas al llegar a el.
const PIEZAS = 1 + 6 + 3 + 2;
/** Los tamanos en que se revisa que nada se salga: tres celulares o tabletas de pie y tres computadoras. */
const TAMANOS = /** @type {const} */ ([
  [360, 740],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
]);

/**
 * Avisa en la propia pagina cuando pagina.js termino de montar sus piezas (la del encendido entre ellas).
 * @param {import('@playwright/test').Page} page
 */
async function avisarAlMontar(page) {
  await page.addInitScript(() => {
    document.addEventListener('pagina:montada', () => {
      /** @type {any} */ (window).__montada = true;
    });
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function yaMonto(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__montada === true);
}

/**
 * Lleva una pieza a media pantalla, como queda al llegar a ella leyendo. (Asomada al fondo de la pantalla todavia no
 * se enciende: le falta entrar bien a la vista.)
 * @param {import('@playwright/test').Locator} pieza
 */
async function llegarA(pieza) {
  await pieza.evaluate((el) => el.scrollIntoView({ block: 'center' }));
}

/**
 * Espera a que termine todo lo que se esta moviendo (lo que no termina nunca no se espera). Se vuelve a mirar hasta
 * que no quede nada corriendo: al terminar una animacion el navegador puede arrancar una transicion de remate (en
 * WebKit, la foto pasa de 1.000001 a 1), y esa tambien tiene que acabar antes de mirar como quedo todo.
 * @param {import('@playwright/test').Page} page
 */
async function quieta(page) {
  await page.evaluate(async () => {
    const corriendo = () =>
      document
        .getAnimations()
        .filter(
          (animacion) =>
            animacion.playState === 'running' &&
            animacion.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
        );
    for (let faltan = corriendo(); faltan.length > 0; faltan = corriendo()) {
      await Promise.all(faltan.map((animacion) => animacion.finished.catch(() => undefined)));
    }
  });
}

/**
 * Como se ve cada pieza en este momento: lo que cambia entre apagada y encendida.
 * @param {import('@playwright/test').Page} page
 */
function aspecto(page) {
  return page.evaluate(() => {
    const estilo = (/** @type {string} */ que, /** @type {string | undefined} */ pseudo = undefined) => {
      const pieza = document.querySelector(que);
      if (!pieza) throw new Error(`no encontre ${que}`);
      return getComputedStyle(pieza, pseudo);
    };
    const estacion = '#como-funciona .ruta__estacion:first-child';
    return {
      estados: [...document.querySelectorAll('[data-enciende]')].map((pieza) => pieza.getAttribute('data-enciende')),
      escena: estilo(`${estacion} .ruta__escena > *`).opacity,
      rotulo: estilo(`${estacion} .ruta__rotulo`).color,
      numero: estilo(`${estacion} .ruta__numero`).color,
      linea: estilo(`${estacion} .ruta__punto`, '::before').transform,
      foto: estilo('#para-quien .oficio__foto').filter,
      acercada: estilo('#para-quien .oficio__foto').scale,
      tarjeta: estilo('#en-una-frase .frase__lado--despues').translate,
      luz: estilo('#en-una-frase .frase__lado--despues', '::before').opacity,
      sello: estilo('#en-una-frase .frase__lado--despues .sello').opacity,
    };
  });
}

/** Todo encendido: lo que se ve sin JavaScript, con movimiento reducido y cuando la visitante ya paso por ahi. */
const ENCENDIDO = {
  escena: '1',
  rotulo: 'rgb(245, 244, 240)',
  numero: 'rgb(132, 151, 255)',
  linea: 'none',
  foto: 'none',
  acercada: 'none',
  tarjeta: 'none',
  luz: '1',
  sello: '1',
};

test('con movimiento, lo que falta por ver espera apagado y se enciende al llegar, una sola vez', async ({ page }) => {
  // Recorre la pagina entera, pieza por pieza, esperando cada encendido: se le da su tiempo.
  test.slow();
  const fallas = vigilar(page);
  await avisarAlMontar(page);
  await page.goto('./');
  await yaMonto(page);
  // Todas las piezas empiezan debajo de la pantalla: esperan apagadas.
  const apagada = await aspecto(page);
  expect(apagada.estados).toEqual(Array(PIEZAS).fill('espera'));
  expect(apagada).toMatchObject({
    escena: '0',
    // Apagados, los rotulos van en gris: se siguen leyendo, con su contraste.
    rotulo: 'rgb(151, 158, 196)',
    numero: 'rgb(151, 158, 196)',
    tarjeta: '0px 18px',
    luz: '0',
    sello: '0',
  });
  expect(apagada.linea).not.toBe('none');
  expect(apagada.foto).not.toBe('none');
  expect(Number(apagada.acercada)).toBeGreaterThan(1);
  // Apagadas tampoco hay una sola falta de accesibilidad: lo que es texto nunca se esconde ni pierde contraste.
  await sinFaltasDeAccesibilidad(page, ...CON_ENCENDIDO);

  // Al llegar a la ruta se enciende lo que entra a la vista: acostada, las seis estaciones, una tras otra.
  const estaciones = page.locator('#como-funciona .ruta__estacion');
  await llegarA(estaciones.first());
  await expect(estaciones.first()).toHaveAttribute('data-enciende', 'ya');
  const turnos = await estaciones.evaluateAll((lista) =>
    lista
      .filter((estacion) => estacion.getAttribute('data-enciende') === 'ya')
      .map((estacion) => /** @type {HTMLElement} */ (estacion).style.getPropertyValue('--orden')),
  );
  // Las que entraron juntas llevan turnos seguidos, desde cero: asi la luz las recorre en orden.
  expect(turnos).toEqual(turnos.map((_, lugar) => String(lugar)));
  if (await page.evaluate(() => matchMedia('(min-width: 900px)').matches)) expect(turnos).toHaveLength(6);
  await quieta(page);
  expect(await aspecto(page)).toMatchObject({ escena: '1', rotulo: ENCENDIDO.rotulo, numero: ENCENDIDO.numero });
  expect((await aspecto(page)).linea).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

  // Se recorre lo demas, pieza por pieza: cada una se enciende al llegar a ella.
  for (const pieza of await page.locator('[data-enciende]').all()) {
    await llegarA(pieza);
    await expect(pieza).toHaveAttribute('data-enciende', 'ya');
  }
  await quieta(page);
  const encendida = await aspecto(page);
  expect(encendida.estados).toEqual(Array(PIEZAS).fill('ya'));
  expect(encendida).toMatchObject({
    ...ENCENDIDO,
    linea: expect.stringMatching(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/),
  });
  await sinFaltasDeAccesibilidad(page, ...CON_ENCENDIDO);

  // Y no se repite: al irse y regresar nada se apaga ni se vuelve a mover.
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('#inicio')).toBeInViewport();
  await llegarA(estaciones.first());
  await llegarA(page.locator('#en-una-frase .frase__lado--despues'));
  expect((await aspecto(page)).estados).toEqual(Array(PIEZAS).fill('ya'));
  const moviendose = await page.evaluate(
    (donde) => donde.flatMap((id) => document.querySelector(id)?.getAnimations({ subtree: true }) ?? []).length,
    CON_ENCENDIDO,
  );
  expect(moviendose).toBe(0);
  expect(fallas).toEqual([]);
});

test('quien llega directo a una seccion la encuentra encendida: no se le apaga para volver a prenderla', async ({
  page,
}) => {
  await avisarAlMontar(page);
  await page.goto('./#como-funciona');
  await yaMonto(page);
  const estaciones = page.locator('#como-funciona .ruta__estacion');
  // La primera estacion ya estaba a la vista cuando llego el codigo: se queda como estaba, encendida y quieta.
  await expect(estaciones.first()).toBeInViewport();
  await expect(estaciones.first()).toHaveAttribute('data-enciende', '');
  expect(await aspecto(page)).toMatchObject({ escena: '1', rotulo: ENCENDIDO.rotulo, linea: 'none' });
  expect(
    await page.evaluate(() => document.querySelector('#como-funciona')?.getAnimations({ subtree: true }).length),
  ).toBe(0);
  // Lo que sigue mas abajo, que todavia no ve, si espera su turno.
  await expect(page.locator('#en-una-frase .frase__lado').last()).toHaveAttribute('data-enciende', 'espera');
});

test('en una pantalla muy bajita (mucho zoom) nada se queda apagado: a la pieza alta le basta con asomar', async ({
  page,
}) => {
  // Como una laptop con zoom de 400 % o mas: la quinta parte de una tarjeta ya no cabe en lo que se ve.
  await page.setViewportSize({ width: 320, height: 120 });
  await avisarAlMontar(page);
  await page.goto('./');
  await yaMonto(page);
  expect((await aspecto(page)).estados).toEqual(Array(PIEZAS).fill('espera'));
  for (const pieza of await page.locator('[data-enciende]').all()) {
    await llegarA(pieza);
    await expect(pieza).toHaveAttribute('data-enciende', 'ya');
  }
  expect((await aspecto(page)).estados).toEqual(Array(PIEZAS).fill('ya'));
});

test('al imprimir o guardar en PDF todo sale encendido, aunque no se haya recorrido la pagina', async ({ page }) => {
  await avisarAlMontar(page);
  await page.goto('./');
  await yaMonto(page);
  // En pantalla, lo que falta por ver espera apagado.
  const enPantalla = await aspecto(page);
  expect(enPantalla.estados).toEqual(Array(PIEZAS).fill('espera'));
  expect(enPantalla).toMatchObject({ escena: '0', luz: '0', sello: '0' });
  // En papel no hay a donde llegar: las mismas piezas, sin tocarlas, se ven encendidas.
  await page.emulateMedia({ media: 'print' });
  const enPapel = await aspecto(page);
  expect(enPapel.estados).toEqual(Array(PIEZAS).fill('espera'));
  expect(enPapel).toMatchObject({
    ...ENCENDIDO,
    linea: expect.stringMatching(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/),
  });
});

test('el boton con luz: dos vueltas al llegar y se detiene antes de cinco segundos; despues, solo su halo', async ({
  page,
}) => {
  await avisarAlMontar(page);
  await page.goto('./');
  await yaMonto(page);
  const boton = page.locator('#citas .boton--luz');
  await expect(boton).toHaveText('Empieza ahora');
  await expect(boton).toHaveAttribute('data-enciende', 'espera');
  /** Las vueltas de la luz: cual corre, cuantas veces y cuanto dura todo. */
  const vueltas = () =>
    boton.evaluate((el) =>
      el.getAnimations({ subtree: true }).map((animacion) => {
        const tiempos = animacion.effect?.getComputedTiming();
        return {
          nombre: /** @type {CSSAnimation} */ (animacion).animationName,
          veces: tiempos?.iterations,
          total: Number(tiempos?.activeDuration),
        };
      }),
    );
  // Antes de llegar no se mueve nada: el halo esta, la luz no.
  expect(await vueltas()).toEqual([]);
  expect(await boton.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await llegarA(boton);
  await expect(boton).toHaveAttribute('data-enciende', 'ya');
  // Dos vueltas y ya: todo lo que se mueve solo dura menos de cinco segundos (WCAG 2.2.2).
  const alLlegar = await vueltas();
  expect(alLlegar).toEqual([{ nombre: 'boton-vuelta', veces: 2, total: 4800 }]);
  expect(alLlegar[0]?.total).toBeLessThan(5000);
  // Se espera solo a la luz del boton: en computadora el corto del inicio sigue corriendo por su cuenta.
  await boton.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((animacion) => animacion.finished.catch(() => undefined))),
  );
  expect(await vueltas()).toEqual([]);
  expect(await boton.evaluate((el) => getComputedStyle(el, '::before').opacity)).toBe('0');
  // Con menos movimiento la luz no corre nunca; el halo se queda.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await yaMonto(page);
  await llegarA(boton);
  expect(await vueltas()).toEqual([]);
  expect(await boton.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
});

test('con movimiento reducido nada espera apagado ni se mueve: todo esta encendido y quieto', async ({ page }) => {
  await avisarAlMontar(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await yaMonto(page);
  const antes = await aspecto(page);
  expect(antes.estados).toEqual(Array(PIEZAS).fill(''));
  expect(antes).toMatchObject(ENCENDIDO);
  for (const pieza of await page.locator('[data-enciende]').all()) {
    await llegarA(pieza);
    await expect(pieza).toHaveAttribute('data-enciende', '');
  }
  expect(await aspecto(page)).toEqual(antes);
  // Ni una animacion ni una transicion pendiente en esas secciones, tampoco al desplegar las preguntas.
  await page.locator('#preguntas summary.preguntas__ver').click();
  await expect(page.locator('#preguntas details.preguntas__mas')).toHaveAttribute('open', '');
  const moviendose = await page.evaluate(
    (donde) => donde.flatMap((id) => document.querySelector(`#${id}`)?.getAnimations({ subtree: true }) ?? []).length,
    SECCIONES,
  );
  expect(moviendose).toBe(0);
  // Y el cursor tampoco acerca la foto.
  await page.locator('#para-quien .oficio__tarjeta').first().hover();
  await expect(page.locator('#para-quien .oficio__foto').first()).toHaveCSS('scale', 'none');
});

test('en computadora, al pasar el cursor, la foto del oficio se acerca apenas', async ({ page }) => {
  await avisarAlMontar(page);
  await page.goto('./');
  await yaMonto(page);
  test.skip(!(await page.evaluate(() => matchMedia('(hover: hover)').matches)), 'en un celular no hay cursor');
  const tarjeta = page.locator('#para-quien .oficio__tarjeta').first();
  const foto = tarjeta.locator('.oficio__foto');
  await llegarA(tarjeta);
  await expect(tarjeta).toHaveAttribute('data-enciende', 'ya');
  await quieta(page);
  await expect(foto).toHaveCSS('scale', 'none');
  await tarjeta.hover();
  await expect(foto).toHaveCSS('scale', '1.035');
  // Se acerca dentro de su marco: la tarjeta no crece ni la foto se sale.
  const marco = await tarjeta.locator('.oficio__marco').boundingBox();
  const lista = await page.locator('#para-quien .oficio__lista').boundingBox();
  expect((marco?.x ?? 0) + (marco?.width ?? 0)).toBeLessThanOrEqual((lista?.x ?? 0) + (lista?.width ?? 0));
  await page.mouse.move(0, 0);
  await expect(foto).toHaveCSS('scale', 'none');
});

test('si no llega el archivo del encendido, las secciones se quedan encendidas y lo demas sigue vivo', async ({
  page,
}) => {
  await avisarAlMontar(page);
  await page.route('**/js/encendido.js', (ruta) => ruta.abort());
  await page.goto('./');
  await yaMonto(page);
  const aspectoSinPieza = await aspecto(page);
  expect(aspectoSinPieza.estados).toEqual(Array(PIEZAS).fill(''));
  expect(aspectoSinPieza).toMatchObject(ENCENDIDO);
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('[data-calculadora]')).toHaveAttribute('data-viva', '');
  await expect(page.locator('html')).toHaveClass(/con-js/);
});

test('recorrer las secciones no mueve nada de su lugar', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'solo Chromium avisa cuando algo brinca');
  test.slow();
  // Lo que brinque dentro de las secciones queda anotado, con lo que se movio.
  await page.addInitScript((secciones) => {
    /** @type {any} */ (window).__brincos = [];
    new PerformanceObserver((lista) => {
      for (const brinco of /** @type {any[]} */ (lista.getEntries())) {
        if (brinco.hadRecentInput) continue;
        const movidos = brinco.sources
          .map((/** @type {any} */ fuente) => fuente.node)
          .filter(
            (/** @type {Node | null} */ nodo) =>
              nodo instanceof Element && secciones.some((id) => nodo.closest(`#${id}`)),
          )
          .map((/** @type {Element} */ nodo) => `${nodo.tagName.toLowerCase()}.${nodo.className}`);
        if (movidos.length > 0) /** @type {any} */ (window).__brincos.push({ cuanto: brinco.value, movidos });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }, SECCIONES);
  await avisarAlMontar(page);
  await page.goto('./');
  await yaMonto(page);
  // Bajando como quien lee: pieza por pieza, con su encendido completo, y luego los planes y las preguntas.
  for (const pieza of await page.locator('[data-enciende]').all()) {
    await llegarA(pieza);
    await expect(pieza).toHaveAttribute('data-enciende', 'ya');
  }
  for (const foto of await page.locator('#para-quien img').all()) await expect(foto).toHaveJSProperty('complete', true);
  await quieta(page);
  await page.locator('#planes .planes__notas').scrollIntoViewIfNeeded();
  await page.locator('#preguntas').scrollIntoViewIfNeeded();
  await page.locator('.pie').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => /** @type {any} */ (window).__brincos)).toEqual([]);
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('las secciones se leen completas, encendidas y quietas, y las preguntas se despliegan', async ({ page }) => {
    await page.goto('./');
    // Sin codigo no hay quien apague ni encienda nada: todo se ve como al final.
    await expect(page.locator('[data-enciende]')).toHaveCount(PIEZAS);
    await expect(page.locator('[data-enciende=""]')).toHaveCount(PIEZAS);
    const estacion = page.locator('#como-funciona .ruta__estacion').first();
    await estacion.scrollIntoViewIfNeeded();
    await expect(estacion.locator('.ruta__escena > *')).toHaveCSS('opacity', '1');
    await expect(estacion.locator('.ruta__rotulo')).toHaveCSS('color', ENCENDIDO.rotulo);
    await expect(page.locator('#como-funciona .ruta__estacion')).toHaveCount(6);
    await expect(page.locator('#como-funciona .ruta__escena').last()).toContainText('Sí');
    const foto = page.locator('#para-quien .oficio__foto').first();
    await foto.scrollIntoViewIfNeeded();
    await expect(foto).toHaveCSS('filter', 'none');
    await expect(foto).toHaveCSS('scale', 'none');
    // La foto no depende del codigo: su direccion ya viene escrita en la pagina.
    await expect(foto).toHaveAttribute('src', /\/retratos\/unas-retrato-480\.webp$/);
    await expect(foto).toHaveAttribute('srcset', /unas-retrato-960\.webp 960w$/);
    const despues = page.locator('#en-una-frase .frase__lado--despues');
    await despues.scrollIntoViewIfNeeded();
    await expect(despues).toHaveCSS('translate', 'none');
    await expect(despues.locator('.sello')).toHaveCSS('opacity', '1');
    await expect(despues.getByRole('heading', { level: 3 })).toHaveText(
      'Te siguen escribiendo, y tu agente contesta por ti.',
    );
    await expect(page.locator('#planes .planes__nota').last()).toContainText('La fija Mercado Pago, no nosotros.');
    // "Ver mas preguntas" es de HTML puro: funciona igual.
    const mas = page.locator('#preguntas details.preguntas__mas');
    const guardada = page.locator('#preguntas details.pregunta').last();
    await expect(guardada.locator('summary')).toBeHidden();
    await mas.locator('summary.preguntas__ver').click();
    await expect(mas).toHaveAttribute('open', '');
    await expect(mas.locator('summary.preguntas__ver')).toHaveText('Ver menos preguntas', { useInnerText: true });
    await guardada.locator('summary').click();
    await expect(guardada).toHaveAttribute('open', '');
    await expect(guardada.locator('p')).toHaveText('Escríbenos y te avisamos cuando llegue.');
  });
});

for (const [ancho, alto] of TAMANOS) {
  test(`a ${ancho} de ancho nada de las secciones se sale de la pantalla ni se encima`, async ({ page }) => {
    // Mide cada pieza de cinco secciones: con la maquina cargada se le da su tiempo.
    test.slow();
    await page.setViewportSize({ width: ancho, height: alto });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await page.locator('#preguntas summary.preguntas__ver').click();
    for (const id of SECCIONES) {
      const seccion = page.locator(`#${id}`);
      await seccion.scrollIntoViewIfNeeded();
      const fuera = await seccion.evaluate((raiz) => {
        const tope = document.documentElement.clientWidth;
        /** @type {string[]} */
        const salidos = [];
        for (const pieza of raiz.querySelectorAll('*')) {
          const { left, right, width, height } = pieza.getBoundingClientRect();
          if (width === 0 || height === 0) continue;
          if (left < -0.5 || right > tope + 0.5)
            salidos.push(`${pieza.tagName.toLowerCase()}.${pieza.getAttribute('class')}`);
        }
        return { salidos, desborde: document.documentElement.scrollWidth - tope };
      });
      expect(fuera, id).toEqual({ salidos: [], desborde: 0 });
    }

    // La ruta: cada escena cabe en su marco (o en su renglon), con todo y el sello de la cita.
    const escenas = await page.locator('#como-funciona .ruta__escena').evaluateAll((lista) =>
      lista.map((escena) => {
        const marco = escena.getBoundingClientRect();
        return [...escena.querySelectorAll(':scope > *, .sello')].every((pieza) => {
          const caja = pieza.getBoundingClientRect();
          return (
            caja.left >= marco.left - 1 &&
            caja.right <= marco.right + 1 &&
            caja.top >= marco.top - 1 &&
            caja.bottom <= marco.bottom + 1
          );
        });
      }),
    );
    expect(escenas).toEqual(Array(6).fill(true));
    // Y ningun rotulo se encima con el de la estacion vecina.
    const rotulos = await page
      .locator('#como-funciona .ruta__rotulo')
      .evaluateAll((lista) => lista.map((rotulo) => rotulo.getBoundingClientRect().toJSON()));
    for (const [lugar, rotulo] of rotulos.entries()) {
      const anterior = rotulos[lugar - 1];
      if (!anterior) continue;
      const separados = rotulo.left >= anterior.right || rotulo.top >= anterior.bottom;
      expect(separados, `el rotulo ${lugar + 1} se encima con el ${lugar}`).toBe(true);
    }

    // El antes y el despues: ni la marca de duda ni el sello tapan el texto de su cita.
    const citas = await page.locator('#en-una-frase .minicita').evaluateAll((lista) =>
      lista.map((cita) => {
        const texto = /** @type {Element} */ (cita.querySelector('.minicita__texto')).getBoundingClientRect();
        const marca = /** @type {Element} */ (cita.querySelector('.frase__duda, .sello')).getBoundingClientRect();
        return marca.left - texto.right;
      }),
    );
    expect(citas).toHaveLength(2);
    for (const hueco of citas) expect(hueco).toBeGreaterThanOrEqual(-2);

    // Los retratos: lado a lado donde caben los tres y, si no, uno debajo de otro; nunca dos y uno.
    const tarjetas = await page
      .locator('#para-quien .oficio__tarjeta')
      .evaluateAll((lista) => lista.map((tarjeta) => tarjeta.getBoundingClientRect().toJSON()));
    const renglones = new Set(tarjetas.map(({ top }) => Math.round(top))).size;
    expect(renglones).toBe(ancho >= 680 ? 1 : 3);
    for (const { width } of tarjetas) expect(width).toBeGreaterThan(150);
  });
}
