// @ts-check
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';

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
  // Las animaciones que nunca terminan (la pista que late) no cambian el color del texto y no se esperan.
  await pagina.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animacion) => animacion.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((animacion) => animacion.finished.catch(() => undefined)),
    ),
  );
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
