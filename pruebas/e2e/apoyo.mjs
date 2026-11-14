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
  const resultado = await new AxeBuilder({ page: pagina })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const faltas = resultado.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(faltas).toEqual([]);
}
