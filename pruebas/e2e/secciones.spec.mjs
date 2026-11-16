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
  for (const ancla of [
    'inicio',
    'citas',
    'como-funciona',
    'agente',
    'para-quien',
    'en-una-frase',
    'planes',
    'preguntas',
    'empieza',
  ]) {
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

test('cada pregunta se abre y se cierra, y la respuesta se lee', async ({ page }) => {
  const preguntas = await abrirEn(page, 'preguntas');
  const primera = preguntas.locator('details').first();
  await expect(primera).not.toHaveAttribute('open', /.*/);
  await primera.locator('summary').click();
  await expect(primera).toHaveAttribute('open', '');
  await expect(primera).toContainText('No. Todo pasa en el WhatsApp de siempre.');
  await primera.locator('summary').click();
  await expect(primera).not.toHaveAttribute('open', /.*/);
  expect(await preguntas.locator('details').count()).toBeGreaterThanOrEqual(10);
  // Con una pregunta abierta y otra vez cerrada: la lista entera.
  await sinFaltasDeAccesibilidad(page, '#preguntas');
});

test('para quien ensena los tres oficios con su foto y deja la puerta abierta a mas', async ({ page }) => {
  const seccion = await abrirEn(page, 'para-quien');
  await expect(seccion.locator('.oficio__tarjeta')).toHaveCount(3);
  for (const nombre of ['Uñas', 'Dentista', 'Médico'])
    await expect(seccion.getByRole('heading', { name: nombre, exact: true })).toBeVisible();
  const foto = seccion.locator('.oficio__foto').first();
  await expect(foto).toHaveJSProperty('complete', true);
  expect(await foto.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0);
  // Pedir un oficio nuevo lleva su propio asunto: no el de "quiero que me acompanen".
  const otro = seccion.getByRole('link', { name: '¿El tuyo no está? Escríbenos y te avisamos.' });
  await expect(otro).toHaveAttribute('href', /^mailto:.*subject=.*oficio/);
});

test('en una frase: tres definiciones y la comparacion, que en celular se lee opcion por opcion', async ({ page }) => {
  const seccion = await abrirEn(page, 'en-una-frase');
  await expect(seccion.locator('dt')).toHaveCount(3);
  await expect(seccion.locator('dt').first()).toHaveText('Cita garantizada');
  // Es una tabla de verdad tambien para quien no la ve: sus encabezados, sus filas y la propia marcada.
  const tabla = seccion.getByRole('table', { name: 'En qué se distingue de otras opciones' });
  await expect(tabla.getByRole('rowheader')).toHaveCount(4);
  await expect(tabla.getByRole('rowheader', { name: 'Citas Garantizadas' })).toBeVisible();
  await expect(tabla.locator('.compara__propia')).toHaveCount(1);
  await expect(tabla.locator('.compara__propia')).toContainText('Entra a tu calendario solo con el anticipo pagado.');
  const ancha = await page.evaluate(() => matchMedia('(min-width: 720px)').matches);
  const rotulo = await tabla
    .getByRole('cell')
    .first()
    .evaluate((celda) => getComputedStyle(celda, '::before').content);
  if (ancha) {
    await expect(tabla.getByRole('columnheader')).toHaveCount(3);
    expect(rotulo).toBe('none');
  } else {
    // En celular no hay renglon de encabezados (ni a la vista ni para el lector de pantalla, que lo leeria doble):
    // cada respuesta lleva su rotulo encima.
    await expect(tabla.getByRole('columnheader')).toHaveCount(0);
    expect(rotulo).toContain('Dónde conversa tu clientela');
  }
  await sinFaltasDeAccesibilidad(page, '#en-una-frase');
});

test('el cierre y el pie: el boton al alta, los enlaces legales y la nota de las marcas', async ({ page }) => {
  const cierre = await abrirEn(page, 'empieza');
  await expect(cierre.getByRole('link', { name: 'Empieza ahora' })).toHaveAttribute('href', ALTA);
  await expect(cierre).toContainText('Hoy pagas solo la instalación.');
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
  // Sobre el comercial manda el boton de arriba.
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
  // Y en el cierre y el pie, que ya traen su boton.
  await page.locator('#preguntas').scrollIntoViewIfNeeded();
  await expect(abajo).toBeVisible();
  await page.locator('#empieza').scrollIntoViewIfNeeded();
  await expect(abajo).toBeHidden();
  await page.locator('.pie').scrollIntoViewIfNeeded();
  await expect(abajo).toBeHidden();
});

test('en celular, lo que recibe el foco no se queda escondido detras de la barra de abajo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const esCelular = await page.evaluate(() => matchMedia('(max-width: 899px)').matches);
  test.skip(!esCelular, 'la barra de abajo solo existe en celular');
  await page.locator('#para-quien').scrollIntoViewIfNeeded();
  const abajo = page.locator('[data-barra-movil]');
  await expect(abajo).toBeVisible();
  const enlace = page.locator('#para-quien').getByRole('link', { name: '¿El tuyo no está? Escríbenos y te avisamos.' });
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
    ['Cómo funciona', 'como-funciona'],
    ['Planes', 'planes'],
    ['Preguntas', 'preguntas'],
  ]) {
    await barra.getByRole('link', { name: nombre }).click();
    await expect(page).toHaveURL(new RegExp(`#${ancla}$`));
    await expect(page.locator(`#${ancla}`).getByRole('heading', { level: 2 })).toBeInViewport();
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
