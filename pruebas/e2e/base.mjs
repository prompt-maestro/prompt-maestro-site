// @ts-check
// La base de todas las pruebas de punta a punta: las pruebas nunca salen a internet. Lo que la pagina pida fuera de
// la maquina (el dia que la medicion este encendida, su script y sus envios) se contesta aqui mismo, vacio: asi las
// pruebas no dependen de la red, no le mandan visitas falsas a nadie y window.umami sigue siendo lo que la prueba diga.
import { test as base, expect } from '@playwright/test';

const LOCALES = new Set(['127.0.0.1', 'localhost']);

export { expect };

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(
      (direccion) => !LOCALES.has(direccion.hostname),
      (ruta) =>
        ruta.request().resourceType() === 'script'
          ? ruta.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
          : ruta.fulfill({ status: 204, body: '' }),
    );
    await use(page);
  },
});
