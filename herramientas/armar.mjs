// @ts-check
// Arma el sitio:  node herramientas/armar.mjs [--previa] [--comprobar]
//
//   sin banderas   escribe dist/, tal como se serviria en prompt-maestro.com
//   --previa       escribe dist-previa/: con noindex, la cinta de PREVIA y la carpeta /pagina-previa/
//   --comprobar    no escribe: arma en memoria y falla si la carpeta en disco no es identica
//
// Sale con 1 si alguna comprobacion falla (un guion largo en un texto, un enlace interno roto) o, con --comprobar, si
// lo que hay en disco no es lo que sale de la fuente.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarSitio, DESTINOS } from './armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const banderas = new Set(process.argv.slice(2));
for (const bandera of banderas) {
  if (bandera !== '--previa' && bandera !== '--comprobar') {
    console.error(`No conozco la bandera ${bandera}. Uso: node herramientas/armar.mjs [--previa] [--comprobar]`);
    process.exit(1);
  }
}
const destino = banderas.has('--previa') ? 'previa' : 'publica';
const salida = path.join(RAIZ, DESTINOS[destino].carpeta);

const { archivos, problemas, avisos } = await armarSitio({ raiz: RAIZ, destino });
for (const aviso of avisos) console.log(`AVISO: ${aviso}`);
if (problemas.length > 0) {
  for (const problema of problemas) console.error(`FALLA: ${problema}`);
  process.exit(1);
}

if (banderas.has('--comprobar')) {
  /** @type {string[]} */
  const diferencias = [];
  /** @type {string[]} */
  let enDisco = [];
  try {
    const entradas = await readdir(salida, { withFileTypes: true, recursive: true });
    enDisco = entradas
      .filter((e) => e.isFile())
      .map((e) => path.relative(salida, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
  } catch {
    diferencias.push(`no existe ${DESTINOS[destino].carpeta}/`);
  }
  for (const ruta of enDisco) if (!archivos.has(ruta)) diferencias.push(`sobra ${ruta}`);
  for (const [ruta, contenido] of archivos) {
    if (!enDisco.includes(ruta)) diferencias.push(`falta ${ruta}`);
    else if (!contenido.equals(await readFile(path.join(salida, ruta)))) diferencias.push(`cambio ${ruta}`);
  }
  if (diferencias.length > 0) {
    for (const diferencia of diferencias) console.error(`FALLA: ${diferencia}`);
    console.error(`${DESTINOS[destino].carpeta}/ no coincide con la fuente. Vuelve a armar.`);
    process.exit(1);
  }
  console.log(`${DESTINOS[destino].carpeta}/ coincide con la fuente (${archivos.size} archivos).`);
} else {
  await rm(salida, { recursive: true, force: true });
  for (const [ruta, contenido] of archivos) {
    const destinoArchivo = path.join(salida, ruta);
    await mkdir(path.dirname(destinoArchivo), { recursive: true });
    await writeFile(destinoArchivo, contenido);
  }
  console.log(`Armado en ${DESTINOS[destino].carpeta}/ (${archivos.size} archivos).`);
}
