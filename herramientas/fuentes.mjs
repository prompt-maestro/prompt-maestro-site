// @ts-check
// Las tipografias de la pagina se sirven desde la propia pagina (nunca desde otro sitio):  node herramientas/fuentes.mjs
// Copia a fuente/recursos/fuentes/ los archivos de letras latinas de los paquetes instalados con version exacta
// (Playfair Display y Outfit, licencia abierta SIL OFL 1.1) y su licencia. Se corre solo al subir de version un paquete;
// pruebas/unitarias/fuentes.test.mjs comprueba que lo confirmado en el repo es identico a lo que trae el paquete.
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Cada archivo de la pagina y de donde sale. */
export const FUENTES = /** @type {const} */ ([
  {
    destino: 'playfair-display.woff2',
    origen: '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2',
  },
  {
    destino: 'playfair-display-italica.woff2',
    origen: '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2',
  },
  { destino: 'outfit.woff2', origen: '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2' },
  { destino: 'LICENCIA-playfair-display.txt', origen: '@fontsource-variable/playfair-display/LICENSE' },
  { destino: 'LICENCIA-outfit.txt', origen: '@fontsource-variable/outfit/LICENSE' },
]);

export const CARPETA_FUENTES = path.join(RAIZ, 'fuente', 'recursos', 'fuentes');
export const CARPETA_PAQUETES = path.join(RAIZ, 'node_modules');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(CARPETA_FUENTES, { recursive: true });
  for (const { destino, origen } of FUENTES) {
    await copyFile(path.join(CARPETA_PAQUETES, origen), path.join(CARPETA_FUENTES, destino));
    console.log(`Copiado ${destino}`);
  }
}
