// @ts-check
import { expect, test } from '@playwright/test';
import { sinFaltasDeAccesibilidad, vigilar } from './apoyo.mjs';

test('el inicio abre limpio: un titulo, estilos puestos, cero errores y accesible', async ({ page }) => {
  const fallas = vigilar(page);
  const respuesta = await page.goto('./');
  expect(respuesta?.status()).toBe(200);
  await expect(page).toHaveTitle(/Citas Garantizadas/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  // Si la hoja de estilos no llego (una ruta rota en la carpeta de la previa), el fondo seria blanco.
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 245, 239)');
  await sinFaltasDeAccesibilidad(page);
  expect(fallas).toEqual([]);
});

test('nada se sale de la pantalla a lo ancho', async ({ page }) => {
  await page.goto('./');
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desborde).toBeLessThanOrEqual(0);
});

test('tampoco en el telefono mas angosto: a 320 de ancho todo cabe', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./');
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desborde).toBeLessThanOrEqual(0);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Empieza ahora' })).toBeInViewport({ ratio: 1 });
});

test('una direccion que no existe contesta 404 con la pagina propia y regresa al inicio', async ({ page }) => {
  const fallas = vigilar(page);
  const respuesta = await page.goto('./no-existe');
  expect(respuesta?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('no llegó a su cita');
  await sinFaltasDeAccesibilidad(page);
  await page.getByRole('link', { name: 'Ir al inicio' }).click();
  await expect(page).toHaveTitle(/Citas Garantizadas: agenda/);
  expect(fallas.filter((falla) => !falla.includes('no-existe'))).toEqual([]);
});

test('la previa avisa que es previa y la pagina publica no', async ({ page }, info) => {
  await page.goto('./');
  const cinta = page.locator('.cinta-previa');
  const robots = page.locator('meta[name="robots"]');
  if (info.project.name === 'previa') {
    await expect(cinta).toBeVisible();
    await expect(robots).toHaveAttribute('content', 'noindex, nofollow');
  } else {
    await expect(cinta).toHaveCount(0);
    await expect(robots).toHaveCount(0);
  }
});
