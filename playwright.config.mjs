// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Las pruebas de punta a punta corren contra lo armado, servido como en GitHub Pages: la pagina publica en la raiz
// (celular y escritorio) y la previa dentro de /pagina-previa/ (asi se prueba que ningun enlace se rompe en la carpeta).
export default defineConfig({
  testDir: 'pruebas/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4173/' } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173/' } },
    { name: 'previa', use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4174/pagina-previa/' } },
  ],
  webServer: [
    {
      command: 'node herramientas/servir.mjs --puerto 4173',
      url: 'http://127.0.0.1:4173/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node herramientas/servir.mjs --previa --puerto 4174',
      url: 'http://127.0.0.1:4174/pagina-previa/',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
