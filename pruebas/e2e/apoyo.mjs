// @ts-check
import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { soloLoQueSeVende } from '../../herramientas/oficios.mjs';

/**
 * Un archivo de fuente/datos, tal como esta: con lo de todos los oficios, a la venta o guardados.
 * @param {string} ruta
 * @returns {any}
 */
export const leerDatos = (ruta) =>
  JSON.parse(readFileSync(new URL(`../../fuente/datos/${ruta}`, import.meta.url), 'utf8'));

/**
 * Lo que la pagina ensena de los datos: solo los oficios a la venta (giros.json, "aLaVenta") y lo que es de ellos.
 * Las pruebas leen de aqui lo que esperan ver: el dia que se encienda un oficio, lo siguen solas.
 */
export const VENDIDO = soloLoQueSeVende({
  giros: leerDatos('giros.json'),
  corto: leerDatos('corto.json'),
  preguntas: leerDatos('preguntas.json'),
  agentes: leerDatos('agentes.json'),
  secciones: leerDatos('secciones.json'),
});
/** Las claves de los oficios a la venta, en su orden. */
export const A_LA_VENTA = [...VENDIDO.claves];
/** Si la pagina ensena un oficio de salud. */
export const CON_SALUD = VENDIDO.claves.has('dentista') || VENDIDO.claves.has('medico');

/**
 * Junta lo que no debe pasar mientras se usa la pagina: errores de consola, errores de JavaScript y peticiones rotas.
 * @param {import('@playwright/test').Page} pagina
 * @returns {string[]}
 */
export function vigilar(pagina) {
  /** @type {string[]} */
  const fallas = [];
  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error') fallas.push(`consola: ${mensaje.text()} (${mensaje.location().url})`);
  });
  pagina.on('pageerror', (error) => fallas.push(`javascript: ${error.message}`));
  pagina.on('requestfailed', (peticion) => {
    // Lo que el navegador cancela porque la visitante ya se fue a otra pagina no es una peticion rota.
    if (/abort|cancel/i.test(peticion.failure()?.errorText ?? '')) return;
    fallas.push(`peticion rota: ${peticion.url()}`);
  });
  pagina.on('response', (respuesta) => {
    if (respuesta.status() >= 400 && respuesta.request().resourceType() !== 'document') {
      fallas.push(`${respuesta.status()}: ${respuesta.url()}`);
    }
  });
  return fallas;
}

/**
 * Accesibilidad WCAG 2.2 AA con axe: ni una falta. Sin mas, revisa la pagina entera (asi lo hace la prueba de humo);
 * con selectores revisa solo esas partes, que es lo que cambia en la prueba que la llama. La pagina completa es larga
 * y revisarla entera en cada prueba hacia tronar el reloj en Firefox con la maquina cargada.
 * @param {import('@playwright/test').Page} pagina
 * @param {...string} partes  selectores CSS de lo que se revisa
 */
export async function sinFaltasDeAccesibilidad(pagina, ...partes) {
  // A media entrada un texto todavia es translucido y su contraste no es el de verdad: se mide ya asentado.
  // Las animaciones que nunca terminan (la pista que late) no cambian el color del texto y no se esperan. Con
  // selectores solo se esperan las de esas partes: una animacion larga, o en pausa, de otra seccion (el corto del
  // inicio) no cambia el contraste de lo que aqui se revisa, y esperarla agotaba el tiempo de la prueba.
  await pagina.evaluate((selectores) => {
    const animaciones =
      selectores.length === 0
        ? document.getAnimations()
        : selectores.flatMap((selector) =>
            [...document.querySelectorAll(selector)].flatMap((parte) => parte.getAnimations({ subtree: true })),
          );
    return Promise.all(
      animaciones
        .filter((animacion) => animacion.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((animacion) => animacion.finished.catch(() => undefined)),
    );
  }, partes);
  const axe = new AxeBuilder({ page: pagina }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
  ]);
  for (const parte of partes) axe.include(parte);
  const resultado = await axe.analyze();
  const faltas = resultado.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(faltas).toEqual([]);
}

/** La hora que marca el reloj de la pagina en las pruebas del corto: un dia cualquiera, siempre el mismo. */
const HORA_DE_PRUEBA = new Date('2026-03-02T10:00:00');

/**
 * Abre el inicio con el reloj de la pagina (el de Playwright) puesto y detenido desde antes de cargar: el corto se
 * queda en el instante cero de su primera toma y solo avanza cuando la prueba adelanta el reloj (page.clock.runFor,
 * o hastaElCuadro). Asi ninguna prueba depende de lo rapida que ande la maquina.
 * @param {import('@playwright/test').Page} pagina
 * @param {{ quieta?: boolean }} [opciones]  quieta: la visitante pidio menos movimiento (el corto no corre solo)
 * @returns {Promise<import('@playwright/test').Locator>}  la seccion del inicio, ya viva
 */
export async function abrirCortoDetenido(pagina, { quieta = false } = {}) {
  if (quieta) await pagina.emulateMedia({ reducedMotion: 'reduce' });
  await pagina.clock.install({ time: HORA_DE_PRUEBA });
  await pagina.clock.pauseAt(new Date(HORA_DE_PRUEBA.getTime() + 60_000));
  await pagina.goto('./');
  const corto = pagina.locator('[data-corto]');
  await expect(corto).toHaveAttribute('data-viva', '');
  return corto;
}

/**
 * Adelanta el reloj de la pagina, a pasos, hasta que el corto llega a un momento (o a su cartel).
 * @param {import('@playwright/test').Page} pagina
 * @param {import('@playwright/test').Locator} corto
 * @param {string} clave  el data-cuadro que se espera
 */
export async function hastaElCuadro(pagina, corto, clave) {
  // A pasos de un tercio de segundo: el momento mas corto del corto dura mas de un segundo, asi que ninguno se salta.
  for (let paso = 0; paso < 120; paso++) {
    if ((await corto.getAttribute('data-cuadro')) === clave) return;
    await pagina.clock.runFor(350);
  }
  throw new Error(`El corto no llego a "${clave}"`);
}
