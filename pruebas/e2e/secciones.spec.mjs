// @ts-check
import { readFileSync } from 'node:fs';
import { pesos } from '../../fuente/js/redaccion.js';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';
import { expect, test } from './base.mjs';

const ALTA = 'https://alta.prompt-maestro.com/';
// Los precios salen del mismo archivo que la pagina: el dia que cambien, estas pruebas siguen valiendo.
/** @type {{ planes: { nombre: string, mensual: number, anual: number, instalacion: number, destacado: boolean }[] }} */
const { planes: PLANES } = JSON.parse(readFileSync(new URL('../../fuente/datos/planes.json', import.meta.url), 'utf8'));
const BARATO = PLANES.reduce((menor, plan) => (plan.mensual < menor.mensual ? plan : menor));
const [PRIMERO] = PLANES;

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} ancla
 */
async function abrirEn(page, ancla) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const seccion = page.locator(`#${ancla}`);
  await seccion.scrollIntoViewIfNeeded();
  return seccion;
}

/**
 * La calculadora, ya viva, con sus dos casillas y su salida.
 * @param {import('@playwright/test').Page} page
 */
async function abrirCalculadora(page) {
  const planes = await abrirEn(page, 'planes');
  const calculadora = planes.locator('[data-calculadora]');
  await expect(calculadora).toHaveAttribute('data-viva', '');
  return {
    calculadora,
    salida: calculadora.locator('[data-calculadora-salida]'),
    citas: calculadora.getByLabel('¿Cuántas citas te plantan al mes?'),
    precio: calculadora.getByLabel('¿Cuánto cobras por cita?'),
  };
}

test('la pagina trae todas sus secciones, cada una con su titulo, y un solo h1', async ({ page }) => {
  const fallas = vigilar(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  for (const ancla of ['inicio', 'citas', 'agente', 'para-quien', 'planes', 'preguntas', 'empieza']) {
    await expect(page.locator(`#${ancla}`)).toHaveCount(1);
    await expect(page.locator(`#${ancla}`).getByRole('heading').first()).toBeAttached();
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(fallas).toEqual([]);
});

test('la calculadora abre con las casillas vacias y un ejemplo ya hecho, dicho que es un ejemplo', async ({ page }) => {
  const { calculadora, salida, citas, precio } = await abrirCalculadora(page);
  // El ejemplo va de sugerencia: quien escribe "10" obtiene 10, no "610".
  await expect(citas).toHaveValue('');
  await expect(precio).toHaveValue('');
  await expect(citas).toHaveAttribute('placeholder', '6');
  await expect(precio).toHaveAttribute('placeholder', '400');
  await expect(calculadora).toHaveAttribute('data-estado', 'ejemplo');
  await expect(salida).toContainText('Un ejemplo: te plantan 6 citas de $400 al mes.');
  await expect(salida).toContainText('Hoy se te van cerca de $2,400 al mes.');
  await expect(salida).toContainText(`El plan ${BARATO.nombre} cuesta ${pesos(BARATO.mensual)} al mes`);
  // Lo que cambie de aqui en adelante se anuncia a quien no lo ve.
  await expect(salida).toHaveAttribute('role', 'status');
});

test('al escribir sus numeros la calculadora rehace la cuenta y ya no habla del ejemplo', async ({ page }) => {
  const { calculadora, salida, citas, precio } = await abrirCalculadora(page);
  await citas.fill('10');
  await precio.fill('1,200');
  await expect(calculadora).toHaveAttribute('data-estado', 'lista');
  await expect(salida).toContainText('Hoy se te van cerca de $12,000 al mes.');
  await expect(salida).not.toContainText('Un ejemplo');
  if (BARATO.mensual <= 1200) await expect(salida).toContainText('con 1 cita que sí llegue, ya se pagó.');
  // Con centavos, y con coma: son 350 pesos con 50 centavos (no treinta y cinco mil), y dos citas son $701 exactos.
  await citas.fill('2');
  await precio.fill('350,50');
  await expect(salida).toContainText('Hoy se te van cerca de $701 al mes.');
});

test('si pierde menos de lo que cuesta el plan, la calculadora no le dice que ya se pago', async ({ page }) => {
  test.skip(BARATO.mensual <= 100, 'con un plan de 100 pesos o menos este caso no existe');
  const { salida, citas, precio } = await abrirCalculadora(page);
  await citas.fill('1');
  await precio.fill('100');
  await expect(salida).toContainText('Hoy se te van cerca de $100 al mes.');
  await expect(salida).toContainText(`El plan ${BARATO.nombre} cuesta ${pesos(BARATO.mensual)} al mes.`);
  await expect(salida).not.toContainText('ya se pagó');
});

test('la calculadora avisa con amabilidad si el numero no sirve y espera si falta uno', async ({ page }) => {
  const { calculadora, salida, citas, precio } = await abrirCalculadora(page);
  await citas.fill('900');
  await expect(salida).toHaveText('Escribe un número entre 1 y 500.');
  await expect(citas).toHaveAttribute('aria-invalid', 'true');
  // Al borrarla vuelve el ejemplo, sin marca de error.
  await citas.fill('');
  await expect(calculadora).toHaveAttribute('data-estado', 'ejemplo');
  await expect(citas).not.toHaveAttribute('aria-invalid', /.*/);
  // Con una sola casilla escrita todavia no hay cuenta.
  await citas.fill('4');
  await expect(salida).toHaveText('Pon tus números y haz la cuenta.');
  await precio.fill('abc');
  await expect(salida).toHaveText('Escribe lo que cobras por cita, en pesos.');
  await expect(precio).toHaveAttribute('aria-invalid', 'true');
});

test('los planes ensenan sus precios, uno solo va recomendado y todos llevan al alta', async ({ page }) => {
  const planes = await abrirEn(page, 'planes');
  const tarjetas = planes.locator('.plan');
  await expect(tarjetas).toHaveCount(PLANES.length);
  await expect(planes.locator('.plan--destacado')).toHaveCount(1);
  for (const [i, plan] of PLANES.entries()) {
    await expect(tarjetas.nth(i)).toContainText(`${pesos(plan.mensual)} al mes`);
    await expect(tarjetas.nth(i)).toContainText(`o ${pesos(plan.anual)} al año`);
    if (plan.destacado) await expect(tarjetas.nth(i)).toContainText('Recomendado');
  }
  for (const boton of await tarjetas.getByRole('link').all()) await expect(boton).toHaveAttribute('href', ALTA);
  await expect(planes).toContainText(`Instalación única de ${pesos(PRIMERO?.instalacion ?? 0)}.`);
  await expect(planes.getByRole('heading', { name: 'Qué necesitas para empezar' })).toBeVisible();
  await sinFaltasDeAccesibilidad(page, '#planes');
});

test('en pantalla ancha los botones de los tres planes quedan a la misma altura', async ({ page }) => {
  const planes = await abrirEn(page, 'planes');
  const juntas = await page.evaluate(() => matchMedia('(min-width: 900px)').matches);
  test.skip(!juntas, 'en celular las tarjetas van una debajo de otra');
  const fondos = await planes
    .locator('.plan .boton')
    .evaluateAll((botones) => botones.map((boton) => Math.round(boton.getBoundingClientRect().bottom)));
  expect(new Set(fondos).size).toBe(1);
});

test('la letra chica de los planes dice, sin porcentajes, que Mercado Pago cobra su comision por cada anticipo', async ({
  page,
}) => {
  const planes = await abrirEn(page, 'planes');
  const notas = planes.locator('.planes__nota');
  await expect(notas).toHaveCount(2);
  // La nota de la instalacion no cambia, y debajo va el renglon nuevo.
  await expect(notas.first()).toContainText('No cobramos comisión por cita.');
  await expect(notas.last()).toHaveText(
    'Mercado Pago cobra su comisión por cada anticipo que recibes. La fija Mercado Pago, no nosotros.',
  );
  await expect(notas.last()).toBeVisible();
  await expect(planes).not.toContainText('%');
  const [arriba, abajo] = await notas.evaluateAll((renglones) =>
    renglones.map((renglon) => ({
      letra: Number.parseFloat(getComputedStyle(renglon).fontSize),
      fondo: renglon.getBoundingClientRect().bottom,
      tope: renglon.getBoundingClientRect().top,
    })),
  );
  if (!arriba || !abajo) throw new Error('no encontre las dos notas');
  // Es letra chica: mas chica que el texto de la pagina y nunca mas grande que la nota de arriba, pegada a ella.
  expect(abajo.letra).toBeLessThanOrEqual(arriba.letra);
  expect(abajo.letra).toBeLessThan(15);
  expect(abajo.tope - arriba.fondo).toBeLessThan(16);
  // El contraste de la letra chica lo revisa, con toda la seccion, la prueba de los planes.
});

test('preguntas: cinco a la vista, en su orden, y las otras ocho detras de "Ver más preguntas"', async ({ page }) => {
  const preguntas = await abrirEn(page, 'preguntas');
  const todas = preguntas.locator('details.pregunta');
  await expect(todas).toHaveCount(13);
  const aLaVista = [
    '¿El dinero pasa por ustedes?',
    '¿Qué pasa si no llega?',
    '¿Y si no quieren pagar anticipo?',
    '¿Tengo que cambiar de número?',
    '¿Y si no sabe algo?',
  ];
  await expect(preguntas.getByRole('heading', { level: 3 }).filter({ visible: true })).toHaveText(aLaVista);
  // Las demas existen (las abre la busqueda del navegador) pero no se ven.
  const guardada = preguntas.getByRole('heading', { name: '¿Puedo contestar yo?' });
  await expect(guardada).toBeHidden();
  const mas = preguntas.locator('details.preguntas__mas');
  const boton = mas.locator('summary.preguntas__ver');
  await expect(mas).not.toHaveAttribute('open', /.*/);
  await expect(boton).toHaveText('Ver más preguntas', { useInnerText: true });
  // De los dos textos del boton solo se ve (y solo se le lee a quien no ve) el que toca.
  await expect(boton.locator('.preguntas__ver-mas')).toBeVisible();
  await expect(boton.locator('.preguntas__ver-menos')).toBeHidden();
  // Se toca con el dedo: 44 px de alto, por lo menos.
  /**
   * Donde esta una pieza en la pagina (no en la pantalla: al tocar el boton el navegador puede recorrer la pagina
   * para que la barra de abajo no lo tape) y cuanto mide de alto. De ancho, el boton cambia con su texto.
   * @param {import('@playwright/test').Locator} pieza
   */
  const lugarDe = (pieza) =>
    pieza.evaluate((el) => {
      const caja = el.getBoundingClientRect();
      return { x: Math.round(caja.x + scrollX), y: Math.round(caja.y + scrollY), alto: Math.round(caja.height) };
    });
  const lugarDelBoton = () => lugarDe(boton);
  /**
   * Que una pieza sigue donde estaba, con la misma altura. Se le perdona un punto: lo que redondea el navegador.
   * @param {{ x: number, y: number, alto: number }} ahora
   * @param {{ x: number, y: number, alto: number }} estaba
   */
  const sigueEnSuLugar = (ahora, estaba) => {
    expect(Math.abs(ahora.x - estaba.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(ahora.y - estaba.y)).toBeLessThanOrEqual(1);
    expect(ahora.alto).toBe(estaba.alto);
  };
  const antes = await lugarDelBoton();
  expect(antes.alto).toBeGreaterThanOrEqual(44);
  const quinta = await lugarDe(todas.nth(4));
  await boton.click();
  await expect(mas).toHaveAttribute('open', '');
  await expect(boton).toHaveText('Ver menos preguntas', { useInnerText: true });
  await expect(boton.locator('.preguntas__ver-mas')).toBeHidden();
  await expect(boton.locator('.preguntas__ver-menos')).toBeVisible();
  await expect(preguntas.getByRole('heading', { level: 3 }).filter({ visible: true })).toHaveCount(13);
  await expect(guardada).toBeVisible();
  // Nada brinca: el boton y las cinco de arriba se quedan donde estaban; lo que se abre, se abre debajo.
  sigueEnSuLugar(await lugarDelBoton(), antes);
  sigueEnSuLugar(await lugarDe(todas.nth(4)), quinta);
  expect((await lugarDe(todas.nth(5))).y).toBeGreaterThanOrEqual(antes.y + antes.alto);
  // Con las trece a la vista: ni una falta de accesibilidad.
  await sinFaltasDeAccesibilidad(page, '#preguntas');
  // Y se vuelven a guardar.
  await boton.click();
  await expect(mas).not.toHaveAttribute('open', /.*/);
  await expect(boton).toHaveText('Ver más preguntas', { useInnerText: true });
  await expect(guardada).toBeHidden();
  sigueEnSuLugar(await lugarDelBoton(), antes);
});

test('cada pregunta se abre y se cierra, y la respuesta se lee: las de la vista y las de adentro', async ({ page }) => {
  const preguntas = await abrirEn(page, 'preguntas');
  const primera = preguntas.locator('details.pregunta').first();
  await expect(primera).not.toHaveAttribute('open', /.*/);
  await primera.locator('summary').click();
  await expect(primera).toHaveAttribute('open', '');
  await expect(primera).toContainText('No. Cada anticipo llega directo a tu cuenta de Mercado Pago.');
  await primera.locator('summary').click();
  await expect(primera).not.toHaveAttribute('open', /.*/);
  // Una de las que estaban guardadas, ya desplegadas.
  await preguntas.locator('summary.preguntas__ver').click();
  const adentro = preguntas.locator('details.pregunta').filter({ hasText: '¿Mi clientela tiene que instalar algo?' });
  await expect(adentro.locator('p')).toBeHidden();
  await adentro.locator('summary').click();
  await expect(adentro).toHaveAttribute('open', '');
  await expect(adentro.locator('p')).toHaveText('No. Todo pasa en el WhatsApp de siempre.');
  await expect(adentro.locator('p')).toBeVisible();
  await adentro.locator('summary').click();
  await expect(adentro).not.toHaveAttribute('open', /.*/);
  // Con una pregunta abierta y otra vez cerrada: la lista entera.
  await sinFaltasDeAccesibilidad(page, '#preguntas');
});

test('"Ver más preguntas" se maneja con el teclado y ensena su foco', async ({ page }) => {
  const preguntas = await abrirEn(page, 'preguntas');
  const mas = preguntas.locator('details.preguntas__mas');
  const boton = mas.locator('summary.preguntas__ver');
  // Llega con el tabulador, justo despues de la quinta pregunta.
  await preguntas.locator('details.pregunta').nth(4).locator('summary').focus();
  await page.keyboard.press('Tab');
  await expect(boton).toBeFocused();
  await expect(boton).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(mas).toHaveAttribute('open', '');
  // El foco se queda en el boton, que ahora dice lo que hace; lo que sigue con el tabulador es la sexta pregunta.
  await expect(boton).toBeFocused();
  await expect(boton).toHaveText('Ver menos preguntas', { useInnerText: true });
  await page.keyboard.press('Tab');
  await expect(preguntas.locator('details.pregunta').nth(5).locator('summary')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await expect(mas).not.toHaveAttribute('open', /.*/);
  await expect(boton).toBeFocused();
});

test('para quien: tres retratos enmarcados, con la foto completa y nitida y, debajo, su nombre y su renglon', async ({
  page,
}) => {
  const seccion = await abrirEn(page, 'para-quien');
  const tarjetas = seccion.locator('.oficio__tarjeta');
  await expect(tarjetas).toHaveCount(3);
  await expect(seccion.getByRole('heading', { level: 3 })).toHaveText([
    'Uñas',
    'Dentistas',
    'Médicos generales y especialistas',
  ]);
  const ALTS = [
    'Manicurista pintando las uñas de una clienta',
    'Dentista atendiendo a un paciente',
    'Doctora auscultando a un paciente',
  ];
  for (const [lugar, tarjeta] of (await tarjetas.all()).entries()) {
    const foto = tarjeta.locator('img.oficio__foto');
    // Cada foto llega cuando esta cerca: se le espera en su lugar.
    await foto.scrollIntoViewIfNeeded();
    await expect(foto).toHaveAttribute('alt', ALTS[lugar] ?? '');
    await expect(foto).toHaveAttribute('loading', 'lazy');
    await expect(foto).toHaveAttribute('width', '960');
    await expect(foto).toHaveAttribute('height', '1192');
    await expect(foto).toHaveJSProperty('complete', true);
    await expect
      .poll(() => foto.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth))
      .toBeGreaterThan(0);
    await expect(foto).toHaveAccessibleName(ALTS[lugar] ?? '');
    const medidas = await tarjeta.evaluate((li) => {
      const img = /** @type {HTMLImageElement} */ (li.querySelector('img'));
      const marco = /** @type {Element} */ (li.querySelector('.oficio__marco'));
      const texto = /** @type {Element} */ (li.querySelector('.oficio__texto'));
      const caja = img.getBoundingClientRect();
      return {
        pedida: img.currentSrc,
        // Lo que mide en la pagina contra lo que mide el archivo: si coinciden, la foto no va recortada.
        proporcion: caja.width / caja.height,
        natural: img.naturalWidth / img.naturalHeight,
        nitida: img.naturalWidth / caja.width,
        llenaElMarco: Math.abs(caja.width - marco.getBoundingClientRect().width) <= 1,
        esquinas: Number.parseFloat(getComputedStyle(marco).borderTopLeftRadius),
        recorta: getComputedStyle(marco).overflow,
        filtro: getComputedStyle(img).filter,
        textoDebajo: texto.getBoundingClientRect().top - marco.getBoundingClientRect().bottom,
        textoEncima: getComputedStyle(texto).position,
        velo: getComputedStyle(texto).backgroundImage,
      };
    });
    // Es una de las fotos nuevas, en el formato moderno, y con puntos de sobra para verse nitida en esa pantalla.
    expect(medidas.pedida).toMatch(/\/retratos\/(unas|dentista|medico)-retrato-(480|720|960)\.(avif|webp)$/);
    expect(medidas.nitida).toBeGreaterThanOrEqual(1);
    expect(Math.abs(medidas.proporcion - medidas.natural)).toBeLessThan(0.01);
    expect(medidas.llenaElMarco).toBe(true);
    // El marco: esquinas redondas que recortan la foto; sin degradado ni sombra encima, y a todo color.
    expect(medidas.esquinas).toBeGreaterThanOrEqual(12);
    expect(medidas.recorta).toBe('hidden');
    expect(medidas.filtro).toBe('none');
    // El nombre y el renglon van debajo de la foto, en limpio: ni encima de ella ni sobre un velo.
    expect(medidas.textoDebajo).toBeGreaterThanOrEqual(-0.5);
    expect(medidas.textoEncima).toBe('static');
    expect(medidas.velo).toBe('none');
  }
  // Cada renglon dice lo que gana el negocio (el dueno, 20-nov-2026: "con un angulo de crear valor").
  await expect(tarjetas.locator('.oficio__texto p')).toHaveText([
    'Más tiempo para tus clientas: tu agente cotiza tus diseños con tu catálogo y agenda solo con el anticipo pagado.',
    'Más orden en tu agenda: limpiezas y valoraciones con anticipo pagado, sin que sueltes el instrumental.',
    'Más tranquilidad en tu consulta: agenda con respeto y discreción, y lo clínico siempre queda en tus manos.',
  ]);
  await expect(seccion.getByRole('heading', { level: 2 })).toHaveText(
    'Hoy, para uñas, dentistas y médicos. Pronto, más oficios y profesiones.',
  );
  // Pedir un oficio nuevo lleva su propio asunto (no el de "quiero que me acompanen"), y el renglon entero es el enlace.
  const otro = seccion.getByRole('link', { name: '¿No está tu negocio? Escríbenos y lo platicamos.' });
  await expect(otro).toHaveAttribute('href', /^mailto:.*subject=.*oficio/);
  await expect(otro.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  const renglon = await otro.boundingBox();
  const lista = await seccion.locator('.oficio__lista').boundingBox();
  if (!renglon || !lista) throw new Error('no encontre el renglon de los demas oficios');
  expect(renglon.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(renglon.width - lista.width)).toBeLessThanOrEqual(1);
  expect(renglon.y).toBeGreaterThan(lista.y + lista.height);
  await sinFaltasDeAccesibilidad(page, '#para-quien');
});

test('la seccion "En una frase" ya no esta: despues de "Para quien" siguen los planes', async ({ page }) => {
  // El dueno (20-nov-2026): "eliminamos toda la seccion 'En una frase', toda esa info ya la tenemos disponible en
  // otras secciones".
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('#en-una-frase, .frase, [class^="frase__"]')).toHaveCount(0);
  const orden = await page.locator('section[id]').evaluateAll((lista) => lista.map((seccion) => seccion.id));
  expect(orden).toEqual(['inicio', 'citas', 'agente', 'para-quien', 'planes', 'preguntas', 'empieza']);
  // Una va pegada a la otra, sin nada en medio ni un hueco de mas. Las dos se miden en el mismo instante: las fotos
  // de arriba pueden estar llegando todavia.
  await expect(page.locator('#para-quien + #planes')).toHaveCount(1);
  const hueco = await page.evaluate(() => {
    const oficio = /** @type {Element} */ (document.querySelector('#para-quien')).getBoundingClientRect();
    const planes = /** @type {Element} */ (document.querySelector('#planes')).getBoundingClientRect();
    return planes.top - oficio.bottom;
  });
  expect(Math.abs(hueco)).toBeLessThanOrEqual(1);
});

test('el cierre y el pie: el boton al alta, los enlaces legales y la nota de las marcas', async ({ page }) => {
  const cierre = await abrirEn(page, 'empieza');
  await expect(cierre.getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
  await expect(cierre).toContainText('Hoy pagas la instalación y tu primer mes.');
  const pie = page.locator('.pie');
  await pie.scrollIntoViewIfNeeded();
  await expect(pie.getByRole('link', { name: 'Términos' })).toHaveAttribute(
    'href',
    'https://prompt-maestro.com/terminos',
  );
  await expect(pie.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute(
    'href',
    'https://prompt-maestro.com/privacidad',
  );
  await expect(pie.getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', /^mailto:[^?]+$/);
  await expect(pie).toContainText('Prompt Maestro es un servicio independiente y no está afiliado a ellas.');
  await sinFaltasDeAccesibilidad(page, '#empieza', '.pie');
});

test('en celular el boton principal baja a la mano y nunca hay dos a la vez ni estorba donde no debe', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const abajo = page.locator('[data-barra-movil]');
  const arriba = page.getByRole('banner').getByRole('link', { name: 'Empieza ahora' });
  const esCelular = await page.evaluate(() => matchMedia('(max-width: 899px)').matches);
  if (!esCelular) {
    await page.locator('#planes').scrollIntoViewIfNeeded();
    await expect(abajo).toBeHidden();
    await expect(arriba).toBeVisible();
    return;
  }
  // Sobre el inicio manda el boton de arriba.
  await expect(abajo).toBeHidden();
  await expect(arriba).toBeVisible();
  // En las secciones de lectura baja a la mano, y el de arriba se guarda: uno solo.
  await page.locator('#planes').scrollIntoViewIfNeeded();
  await expect(abajo).toBeVisible();
  await expect(abajo.getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
  await expect(arriba).toBeHidden();
  // Sobre la demostracion lo que se toca es la conversacion: la barra de abajo se quita.
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await expect(abajo).toBeHidden();
  await expect(arriba).toBeVisible();
  // Y en el cierre y el pie, que ya traen su boton. Las preguntas ahora son pocas de entrada y el cierre asoma
  // debajo de ellas: se mira su titulo, donde el cierre todavia no se ve.
  await page.locator('#titulo-preguntas').scrollIntoViewIfNeeded();
  await expect(page.locator('#empieza')).not.toBeInViewport();
  await expect(abajo).toBeVisible();
  await expect(arriba).toBeHidden();
  // Bajo las cinco preguntas ya asoma el cierre: con la ultima a la vista y el cierre debajo, la barra de abajo se
  // guarda y vuelve el boton de arriba. Uno solo, siempre.
  await page.locator('#preguntas .preguntas__ver').evaluate((boton) => boton.scrollIntoView({ block: 'start' }));
  await expect(page.locator('#empieza')).toBeInViewport();
  await expect(abajo).toBeHidden();
  await expect(arriba).toBeVisible();
  await page.locator('#empieza').scrollIntoViewIfNeeded();
  await expect(abajo).toBeHidden();
  await expect(arriba).toBeVisible();
  await page.locator('.pie').scrollIntoViewIfNeeded();
  await expect(abajo).toBeHidden();
  await expect(arriba).toBeVisible();
});

test('en celular, lo que recibe el foco no se queda escondido detras de la barra de abajo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const esCelular = await page.evaluate(() => matchMedia('(max-width: 899px)').matches);
  test.skip(!esCelular, 'la barra de abajo solo existe en celular');
  await page.locator('#para-quien').scrollIntoViewIfNeeded();
  const abajo = page.locator('[data-barra-movil]');
  await expect(abajo).toBeVisible();
  const enlace = page
    .locator('#para-quien')
    .getByRole('link', { name: '¿No está tu negocio? Escríbenos y lo platicamos.' });
  // Se manda al fondo de la pantalla, como lo deja el navegador al llegar con el teclado.
  await enlace.evaluate((el) => {
    el.scrollIntoView({ block: 'end' });
    /** @type {HTMLElement} */ (el).focus({ preventScroll: true });
  });
  const tope = (await abajo.boundingBox())?.y ?? 0;
  const caja = await enlace.boundingBox();
  expect((caja?.y ?? 0) + (caja?.height ?? 0)).toBeLessThanOrEqual(tope);
});

test('las tres anclas de la barra llevan a su seccion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const barra = page.getByRole('banner');
  const visibles = await barra.getByRole('navigation').getByRole('link').filter({ visible: true }).count();
  test.skip(visibles < 4, 'en celular la barra solo trae el boton');
  for (const [nombre, ancla] of [
    // "Como funciona" conserva su nombre en la barra y lleva a "Tu agente", que ahora cuenta las dos cosas.
    ['Cómo funciona', 'agente'],
    ['Planes', 'planes'],
    ['Preguntas', 'preguntas'],
  ]) {
    await barra.getByRole('link', { name: nombre }).click();
    await expect(page).toHaveURL(new RegExp(`#${ancla}$`));
    await expect(page.locator(`#${ancla}`).getByRole('heading', { level: 2 })).toBeInViewport();
  }
});

test('al bajar del inicio la barra toma su fondo y su raya sin cambiar de alto: la pagina no se mueve ni un pixel', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    document.addEventListener('pagina:montada', () => {
      /** @type {any} */ (window).__montada = true;
    });
  });
  await page.goto('./');
  const barra = page.locator('[data-barra]');
  const medidas = () =>
    page.evaluate(() => {
      const caja = (/** @type {string} */ que) =>
        /** @type {Element} */ (document.querySelector(que)).getBoundingClientRect();
      return {
        barra: caja('[data-barra]').height,
        citas: caja('#citas').top + scrollY,
        agente: caja('#agente').top + scrollY,
      };
    });
  await expect(page.locator('html')).toHaveClass(/con-js/);
  await page.evaluate(() => document.fonts.ready);
  // Se mide con la pagina ya montada: en la previa, el cartel del inicio le descuenta al despertar la cinta que lleva
  // arriba (cartel-vista.js) y el inicio se achica lo que mide la cinta. Eso no es de la barra: se espera a que pase.
  await page.waitForFunction(() => /** @type {any} */ (window).__montada === true);
  // Arriba, sobre el inicio, la barra va transparente y sin raya.
  await expect(barra).not.toHaveAttribute('data-fondo', /.*/);
  await expect(barra).toHaveCSS('box-shadow', 'none');
  const arriba = await medidas();
  // Al bajar toma su fondo y su raya. La barra va pegada arriba: si creciera, empujaria todo lo que sigue.
  await page.locator('#citas').evaluate((seccion) => seccion.scrollIntoView({ block: 'start' }));
  await expect(barra).toHaveAttribute('data-fondo', '');
  await expect(barra).not.toHaveCSS('box-shadow', 'none');
  const abajo = await medidas();
  for (const [cual, medida] of Object.entries(arriba)) {
    expect(abajo[/** @type {keyof typeof arriba} */ (cual)], cual).toBeCloseTo(medida, 1);
  }
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('la calculadora no se ensena, pero planes, preguntas y cierre se leen completos', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('[data-calculadora]')).toBeHidden();
    await expect(page.locator('.plan')).toHaveCount(PLANES.length);
    await expect(page.locator('.plan').first()).toContainText(pesos(PRIMERO?.mensual ?? 0));
    const pregunta = page.locator('#preguntas details').first();
    await pregunta.locator('summary').click();
    await expect(pregunta).toHaveAttribute('open', '');
    await expect(page.locator('[data-barra-movil]')).toBeHidden();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Empieza ahora' })).toBeVisible();
    await expect(page.locator('#empieza').getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
  });
});
