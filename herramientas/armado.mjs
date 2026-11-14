// @ts-check
// Arma el sitio en memoria: une plantillas y datos y devuelve cada archivo con su contenido. No escribe nada en disco
// (eso lo hace armar.mjs), asi se puede probar y comparar sin tocar la carpeta de salida.
//
// El resultado es siempre el mismo para la misma fuente: no lleva fechas ni nada que cambie de una armada a otra.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { conversacionDeEjemplo, presentacionDe } from '../fuente/js/demo.js';
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
 * Los estilos. Los que nombra estilos/orden.json se unen, en ese orden, en una sola hoja (pagina.css): un solo viaje
 * para el telefono. Cualquier otra hoja se copia aparte, y las de estilos/previa/ solo viajan a la previa.
 * @param {string} carpeta
 * @param {Destino} destino
 * @returns {Promise<[string, Buffer][]>}
 */
async function leerEstilos(carpeta, destino) {
  /** @type {string[]} */
  const orden = JSON.parse(await readFile(path.join(carpeta, 'orden.json'), 'utf8'));
  /** @type {Buffer[]} */
  const unidas = [];
  for (const nombre of orden) unidas.push(await readFile(path.join(carpeta, nombre)));
  /** @type {[string, Buffer][]} */
  const salida = [['estilos/pagina.css', Buffer.concat(unidas)]];
  for (const ruta of await listar(carpeta)) {
    if (ruta === 'orden.json' || orden.includes(ruta)) continue;
    if (ruta.startsWith('previa/') && destino !== 'previa') continue;
    salida.push([`estilos/${ruta}`, await readFile(path.join(carpeta, ruta))]);
  }
  return salida;
}

/**
 * Los ejemplos de la demostracion: cada giro con su guion. Se detiene si a un giro le falta el guion o si alguna
 * frase deja un hueco sin llenar.
 * @param {Record<string, unknown>} datos
 * @param {string} alta  a donde lleva "Empieza ahora"
 */
function prepararDemo(datos, alta) {
  const giros = /** @type {import('../fuente/js/demo.js').Giro[]} */ (datos.giros);
  const guiones = /** @type {Record<string, import('../fuente/js/demo.js').Guion>} */ (datos.guiones);
  const { fijos, tu, rotulos } = /** @type {Omit<import('../fuente/js/demo.js').Ejemplo, 'giro' | 'guion'>} */ (
    datos.demo
  );
  const ejemplos = giros.map((giro) => {
    const guion = guiones[giro.clave];
    if (!guion) throw new Error(`Demostracion: al ejemplo "${giro.clave}" le falta su guion`);
    return { giro, guion };
  });
  const conversaciones = ejemplos.map((ejemplo) => conversacionDeEjemplo({ ...ejemplo, fijos, tu, rotulos }));
  const primero = ejemplos[0];
  if (!primero) throw new Error('Demostracion: no hay ningun ejemplo');
  return {
    // Los datos viajan dentro de la pagina como JSON (no es un script que se ejecute). El "<" se escribe por su
    // codigo para que ningun texto pueda cerrar la etiqueta.
    json: JSON.stringify({ ejemplos, fijos, tu, rotulos, alta }).replace(/</g, '\\u003c'),
    // Lo que la pagina trae ya escrito antes de que cargue el JavaScript: el primer ejemplo.
    ejemplo: { ...primero.giro, pregunta: primero.guion.pregunta, ...presentacionDe(primero.giro, rotulos) },
    conversacion: conversaciones[0] ?? [],
  };
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

  // 1. Estilos, scripts y recursos van dentro de una carpeta con la huella de su contenido: si algo cambia, cambia la
  //    direccion, y ningun telefono se queda con una hoja de estilos vieja.
  const activos = await leerEstilos(path.join(fuente, 'estilos'), destino);
  for (const carpeta of ['js', 'recursos']) {
    for (const ruta of await listar(path.join(fuente, carpeta))) {
      activos.push([`${carpeta}/${ruta}`, await readFile(path.join(fuente, carpeta, ruta))]);
    }
  }
  const huella = createHash('sha256');
  for (const [ruta, contenido] of activos) huella.update(`${ruta}\0`).update(contenido);
  const carpetaActivos = `a/${huella.digest('hex').slice(0, 10)}/`;
  for (const [ruta, contenido] of activos) archivos.set(carpetaActivos + ruta, contenido);
  for (const ruta of await listar(path.join(fuente, 'raiz'))) {
    archivos.set(ruta, await readFile(path.join(fuente, 'raiz', ruta)));
  }

  // 2. Los datos.
  const datos = await leerDatos(path.join(fuente, 'datos'));
  const planes = planesPublicos(datos.planes);
  const sitio = /** @type {Record<string, unknown>} */ (datos.sitio);
  const demo = prepararDemo(datos, String(sitio.alta));
  if (planes.dePrueba) {
    avisos.push('Los planes traen PRECIOS DE PRUEBA: esta armada no se puede publicar en el dominio.');
  }
  if (sitio.contactoProbado !== true) {
    avisos.push('El canal de contacto todavia no esta probado: esta armada no se puede publicar en el dominio.');
  }
  const contexto = {
    ...datos,
    planes,
    ejemplo: demo.ejemplo,
    conversacion: demo.conversacion,
    armado: {
      previa: destino === 'previa',
      base,
      origen,
      activos: base + carpetaActivos,
      preciosDePrueba: planes.dePrueba,
      datosDemo: demo.json,
    },
  };

  // 3. Las paginas. Las de plantillas/previa/ solo existen en la previa (material para revisar, no para el publico).
  const carpetaPlantillas = path.join(fuente, 'plantillas');
  /** @type {Record<string, string>} */
  const parciales = {};
  /** @type {[string, string][]} */
  const paginas = [];
  for (const ruta of await listar(carpetaPlantillas)) {
    if (!ruta.endsWith('.html')) continue;
    const plantilla = await readFile(path.join(carpetaPlantillas, ruta), 'utf8');
    if (ruta.startsWith('parciales/')) parciales[ruta.slice('parciales/'.length, -'.html'.length)] = plantilla;
    else if (!ruta.startsWith('previa/')) paginas.push([ruta, plantilla]);
    else if (destino === 'previa') paginas.push([ruta.slice('previa/'.length), plantilla]);
  }
  for (const [ruta, plantilla] of paginas) {
    archivos.set(ruta, Buffer.from(pintar(plantilla, contexto, parciales), 'utf8'));
  }

  // 4. Lo que GitHub Pages necesita. CNAME solo va al dominio; la previa le dice que no a los buscadores.
  archivos.set('.nojekyll', Buffer.from('', 'utf8'));
  if (destino === 'publica') archivos.set('CNAME', Buffer.from(`${DOMINIO}\n`, 'utf8'));
  if (destino === 'previa') archivos.set('robots.txt', Buffer.from('User-agent: *\nDisallow: /\n', 'utf8'));

  // 5. Comprobaciones sobre lo armado.
  for (const [ruta] of paginas) {
    const html = /** @type {Buffer} */ (archivos.get(ruta)).toString('utf8');
    problemas.push(...revisarGuiones(ruta, html));
    problemas.push(...revisarEnlacesInternos(ruta, html, base, (r) => archivos.has(r)));
    if (destino === 'previa' && !/<meta name="robots" content="noindex, nofollow">/.test(html)) {
      problemas.push(`${ruta}: la previa debe llevar noindex`);
    }
  }

  return { archivos, problemas, avisos };
}
