// @ts-check
// Arma el sitio en memoria: une plantillas y datos y devuelve cada archivo con su contenido. No escribe nada en disco
// (eso lo hace armar.mjs), asi se puede probar y comparar sin tocar la carpeta de salida.
//
// El resultado es siempre el mismo para la misma fuente: no lleva fechas ni nada que cambie de una armada a otra.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { revisarEnlacesInternos, revisarGuiones } from './comprobaciones.mjs';
import { planesPublicos } from './planes.mjs';
import { pintar } from './plantilla.mjs';

/** @typedef {'publica' | 'previa'} Destino */

/** Donde se sirve cada armada. La previa vive en una carpeta de github.io, por eso todo enlace interno lleva la base. */
export const DESTINOS = /** @type {const} */ ({
  publica: { base: '/', origen: 'https://prompt-maestro.com', carpeta: 'dist' },
  previa: { base: '/pagina-previa/', origen: 'https://prompt-maestro.github.io', carpeta: 'dist-previa' },
});

const DOMINIO = 'prompt-maestro.com';

/**
 * Todos los archivos de una carpeta, con ruta relativa y diagonal normal, en orden fijo.
 * @param {string} carpeta
 * @returns {Promise<string[]>}
 */
async function listar(carpeta) {
  /** @type {import('node:fs').Dirent[]} */
  let entradas;
  try {
    entradas = await readdir(carpeta, { withFileTypes: true, recursive: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return [];
    throw error;
  }
  return entradas
    .filter((e) => e.isFile())
    .map((e) => path.relative(carpeta, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort();
}

/**
 * Los datos de fuente/datos: cada archivo .json queda con su nombre, y los de una subcarpeta, dentro de un objeto con
 * el nombre de la subcarpeta (datos/guiones/unas.json es guiones.unas).
 * @param {string} carpeta
 * @returns {Promise<Record<string, unknown>>}
 */
async function leerDatos(carpeta) {
  /** @type {Record<string, unknown>} */
  const datos = {};
  for (const ruta of await listar(carpeta)) {
    if (!ruta.endsWith('.json')) continue;
    const valor = JSON.parse(await readFile(path.join(carpeta, ruta), 'utf8'));
    const partes = ruta.slice(0, -'.json'.length).split('/');
    const nombre = /** @type {string} */ (partes.pop());
    /** @type {Record<string, unknown>} */
    let nivel = datos;
    for (const parte of partes) {
      nivel[parte] ??= {};
      nivel = /** @type {Record<string, unknown>} */ (nivel[parte]);
    }
    nivel[nombre] = valor;
  }
  return datos;
}

/**
 * @param {object} opciones
 * @param {string} opciones.raiz  la carpeta del repo (la que contiene fuente/)
 * @param {Destino} opciones.destino
 * @returns {Promise<{ archivos: Map<string, Buffer>, problemas: string[], avisos: string[] }>}
 */
export async function armarSitio({ raiz, destino }) {
  const fuente = path.join(raiz, 'fuente');
  const { base, origen } = DESTINOS[destino];
  /** @type {Map<string, Buffer>} */
  const archivos = new Map();
  /** @type {string[]} */
  const problemas = [];
  /** @type {string[]} */
  const avisos = [];

  // 1. Lo que se copia tal cual. Estilos, scripts y recursos van dentro de una carpeta con la huella de su contenido:
  //    si algo cambia, cambia la direccion, y ningun telefono se queda con una hoja de estilos vieja.
  const huella = createHash('sha256');
  /** @type {[string, Buffer][]} */
  const activos = [];
  for (const carpeta of ['estilos', 'js', 'recursos']) {
    for (const ruta of await listar(path.join(fuente, carpeta))) {
      const contenido = await readFile(path.join(fuente, carpeta, ruta));
      huella.update(`${carpeta}/${ruta}\0`).update(contenido);
      activos.push([`${carpeta}/${ruta}`, contenido]);
    }
  }
  const carpetaActivos = `a/${huella.digest('hex').slice(0, 10)}/`;
  for (const [ruta, contenido] of activos) archivos.set(carpetaActivos + ruta, contenido);
  for (const ruta of await listar(path.join(fuente, 'raiz'))) {
    archivos.set(ruta, await readFile(path.join(fuente, 'raiz', ruta)));
  }

  // 2. Los datos.
  const datos = await leerDatos(path.join(fuente, 'datos'));
  const planes = planesPublicos(datos.planes);
  const preciosDePrueba = planes.dePrueba;
  if (preciosDePrueba)
    avisos.push('Los planes traen PRECIOS DE PRUEBA: esta armada no se puede publicar en el dominio.');
  const contexto = {
    ...datos,
    planes,
    armado: { previa: destino === 'previa', base, origen, activos: base + carpetaActivos, preciosDePrueba },
  };

  // 3. Las paginas.
  const carpetaPlantillas = path.join(fuente, 'plantillas');
  /** @type {Record<string, string>} */
  const parciales = {};
  /** @type {string[]} */
  const paginas = [];
  for (const ruta of await listar(carpetaPlantillas)) {
    if (!ruta.endsWith('.html')) continue;
    if (ruta.startsWith('parciales/')) {
      parciales[ruta.slice('parciales/'.length, -'.html'.length)] = await readFile(
        path.join(carpetaPlantillas, ruta),
        'utf8',
      );
    } else {
      paginas.push(ruta);
    }
  }
  for (const ruta of paginas) {
    const plantilla = await readFile(path.join(carpetaPlantillas, ruta), 'utf8');
    archivos.set(ruta, Buffer.from(pintar(plantilla, contexto, parciales), 'utf8'));
  }

  // 4. Lo que GitHub Pages necesita. CNAME solo va al dominio; la previa le dice que no a los buscadores.
  archivos.set('.nojekyll', Buffer.from('', 'utf8'));
  if (destino === 'publica') archivos.set('CNAME', Buffer.from(`${DOMINIO}\n`, 'utf8'));
  if (destino === 'previa') archivos.set('robots.txt', Buffer.from('User-agent: *\nDisallow: /\n', 'utf8'));

  // 5. Comprobaciones sobre lo armado.
  for (const ruta of paginas) {
    const html = /** @type {Buffer} */ (archivos.get(ruta)).toString('utf8');
    problemas.push(...revisarGuiones(ruta, html));
    problemas.push(...revisarEnlacesInternos(ruta, html, base, (r) => archivos.has(r)));
    if (destino === 'previa' && !/<meta name="robots" content="noindex, nofollow">/.test(html)) {
      problemas.push(`${ruta}: la previa debe llevar noindex`);
    }
  }

  return { archivos, problemas, avisos };
}
