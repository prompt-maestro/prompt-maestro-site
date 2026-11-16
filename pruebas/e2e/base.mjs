// @ts-check
// La base de todas las pruebas de punta a punta: las pruebas nunca salen a internet. Lo que la pagina pida fuera de
// la maquina (los envios de la medicion) se contesta aqui mismo, vacio: asi las pruebas no dependen de la red y no le
// mandan visitas falsas a nadie.
// El script de la medicion es un archivo de la pagina (fuente/js/terceros/), asi que no sale de la maquina; aun asi
// aqui se contesta vacio, para que window.umami siga siendo lo que cada prueba diga. Las pruebas que lo quieren de
// verdad (medicion-de-verdad.spec.mjs) lo dejan pasar con una ruta propia, que gana por ponerse despues.
import { test as base, expect } from '@playwright/test';

const LOCALES = new Set(['127.0.0.1', 'localhost']);
/** El codigo de terceros que sirve la propia pagina. */
export const DE_TERCEROS = /\/js\/terceros\/[^/]+\.js$/;

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
    await page.route(
      (direccion) => DE_TERCEROS.test(direccion.pathname),
      (ruta) => ruta.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
    );
    await use(page);
  },
});
