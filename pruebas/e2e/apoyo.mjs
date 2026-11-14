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
  pagina.on('requestfailed', (peticion) => fallas.push(`peticion rota: ${peticion.url()}`));
  pagina.on('response', (respuesta) => {
    if (respuesta.status() >= 400 && respuesta.request().resourceType() !== 'document') {
      fallas.push(`${respuesta.status()}: ${respuesta.url()}`);
    }
  });
  return fallas;
}

/**
 * Accesibilidad WCAG 2.2 AA con axe: ni una falta.
 * @param {import('@playwright/test').Page} pagina
 */
export async function sinFaltasDeAccesibilidad(pagina) {
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
  const resultado = await new AxeBuilder({ page: pagina })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const faltas = resultado.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(faltas).toEqual([]);
}
