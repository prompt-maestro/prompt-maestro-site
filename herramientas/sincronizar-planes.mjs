// @ts-check
// Copia los planes del alta a la pagina:  node herramientas/sincronizar-planes.mjs <ruta a web/planes.json del motor>
// Los precios nunca se editan a mano aqui: se cambian en el motor y se vuelven a copiar.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planesPublicos } from './planes.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'fuente', 'datos', 'planes.json');

const origen = process.argv[2];
if (!origen) {
  console.error('Falta la ruta: node herramientas/sincronizar-planes.mjs <ruta a web/planes.json>');
  process.exit(1);
}

const planes = planesPublicos(JSON.parse(await readFile(origen, 'utf8')));
await writeFile(DESTINO, `${JSON.stringify(planes, null, 2)}\n`, 'utf8');
console.log(`Planes copiados: ${planes.planes.map((p) => `${p.nombre} ${p.mensual}`).join(', ')} (${planes.moneda}).`);
if (planes.dePrueba)
  console.log('OJO: son PRECIOS DE PRUEBA. La previa lo avisa y la pagina no se puede publicar asi.');
