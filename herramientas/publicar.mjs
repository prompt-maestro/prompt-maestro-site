// @ts-check
// Publica la pagina en prompt-maestro.com:  node herramientas/publicar.mjs [--si]
//
//   sin banderas   ENSAYO: arma, revisa todo y dice que cambiaria en main. No toca nada.
//   --si           PUBLICA. Solo con el si escrito del dueno para ESA publicacion.
//
// Publicar deja UN commit nuevo en la rama main (la que sirve GitHub Pages en el dominio): entra todo lo armado, se
// conservan las paginas legales vigentes y los recursos de la publicacion anterior (herramientas/publicacion.mjs), y
// se retira lo demas. Antes marca lo que habia con la etiqueta antes-del-rediseno (solo la primera vez) y al final
// pone la etiqueta pagina-vN. Nunca reescribe la historia de main: para regresar basta revertir ese commit.
//
// Se niega a publicar si: el correo de git no es el privado, hay cambios sin confirmar, no se esta en la rama fuente,
// la rama no esta subida, la armada trae problemas o avisos (precios de prueba, contacto sin probar), o algo de lo
// armado tiene forma de llave.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarSitio } from './armado.mjs';
import { correosExpuestos, esCorreoPrivado } from './correos.mjs';
import { planDePublicacion } from './publicacion.mjs';
import { secretosEn } from './secretos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRECCION = 'https://prompt-maestro.com/';
const RAMA_FUENTE = 'fuente';

const banderas = new Set(process.argv.slice(2));
for (const bandera of banderas) {
  if (bandera !== '--si') {
    console.error(`No conozco la bandera ${bandera}. Uso: node herramientas/publicar.mjs [--si]`);
    process.exit(1);
  }
}
const deVerdad = banderas.has('--si');

/**
 * @param {string[]} argumentos
 * @param {string} carpeta
 * @returns {string}
 */
function git(argumentos, carpeta) {
  return execFileSync('git', argumentos, { cwd: carpeta, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trimEnd();
}

/** @type {string[]} */
const bloqueos = [];

const correo = git(['config', 'user.email'], RAIZ);
if (!esCorreoPrivado(correo)) bloqueos.push('el correo de git de esta carpeta no es el privado de GitHub');
if (git(['status', '--porcelain'], RAIZ) !== '') bloqueos.push('hay cambios sin confirmar');
if (git(['rev-parse', '--abbrev-ref', 'HEAD'], RAIZ) !== RAMA_FUENTE)
  bloqueos.push(`no estas en la rama ${RAMA_FUENTE}`);

// Lo de GitHub tal como esta ahora: solo lee.
git(['fetch', '--quiet', 'origin', 'main', RAMA_FUENTE], RAIZ);
const origen = git(['rev-parse', 'HEAD'], RAIZ);
if (git(['rev-parse', `origin/${RAMA_FUENTE}`], RAIZ) !== origen) {
  bloqueos.push(`la rama ${RAMA_FUENTE} no esta subida: lo que se publica tiene que estar en GitHub`);
}

const { archivos, problemas, avisos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
for (const problema of problemas) bloqueos.push(`la armada falla: ${problema}`);
// Un aviso de la armada es justo "esto no se puede publicar en el dominio".
for (const aviso of avisos) bloqueos.push(aviso);
for (const [ruta, contenido] of archivos) {
  if (/\.(html|css|js|json|txt|xml|svg)$/.test(ruta)) {
    for (const tipo of secretosEn(contenido.toString('utf8'))) bloqueos.push(`${ruta} trae algo con forma de ${tipo}`);
  }
}

const mainDeHoy = git(['rev-parse', 'origin/main'], RAIZ);
const enMain = git(['ls-tree', '-r', '--name-only', '-z', 'origin/main'], RAIZ).split('\0').filter(Boolean);
const inicioDeMain = enMain.includes('index.html') ? git(['show', 'origin/main:index.html'], RAIZ) : null;
const plan = planDePublicacion({ enMain, inicioDeMain, armado: [...archivos.keys()] });
// Lo que los buscadores ya conocen no se retira sin su reemplazo: la armada tiene que traer los suyos.
for (const ruta of ['robots.txt', 'sitemap.xml']) {
  if (plan.retirar.includes(ruta))
    bloqueos.push(`la armada todavia no trae ${ruta} y main si: se perderia al publicar`);
}

console.log(`Publicacion desde ${RAMA_FUENTE} ${origen.slice(0, 7)} sobre main ${mainDeHoy.slice(0, 7)}:`);
console.log(`  entra lo armado: ${plan.escribir.length} archivos`);
console.log(`  se conserva de main (${plan.conservar.length}): ${plan.conservar.join(', ') || 'nada'}`);
console.log(`  se retira de main (${plan.retirar.length}): ${plan.retirar.join(', ') || 'nada'}`);

if (bloqueos.length > 0) {
  for (const bloqueo of bloqueos) console.error(`BLOQUEA: ${bloqueo}`);
  console.error(deVerdad ? 'No se publico nada.' : 'ENSAYO: asi como esta, no se podria publicar. No se toco nada.');
  process.exit(1);
}
if (!deVerdad) {
  console.log('ENSAYO: todo en orden. No se toco nada. Para publicar, con el si del dueno: --si');
  process.exit(0);
}

const remoto = git(['remote', 'get-url', 'origin'], RAIZ);
const etiquetas = git(['ls-remote', '--tags', '--refs', 'origin'], RAIZ)
  .split('\n')
  .map((linea) => linea.split('refs/tags/')[1] ?? '')
  .filter(Boolean);
const numero = Math.max(0, ...etiquetas.map((etiqueta) => Number(/^pagina-v(\d+)$/.exec(etiqueta)?.[1] ?? 0))) + 1;
const etiqueta = `pagina-v${numero}`;

const carpeta = await mkdtemp(path.join(tmpdir(), 'pagina-publicar-'));
try {
  git(['clone', '--quiet', '--branch', 'main', '--single-branch', remoto, carpeta], RAIZ);
  // Entre la lectura y la copia nadie debio mover main: si se movio, se vuelve a empezar con lo nuevo.
  if (git(['rev-parse', 'HEAD'], carpeta) !== mainDeHoy)
    throw new Error('main cambio mientras se preparaba; corre de nuevo');
  git(['config', 'user.email', correo], carpeta);
  git(['config', 'user.name', git(['config', 'user.name'], RAIZ)], carpeta);
  git(['config', 'core.autocrlf', 'false'], carpeta);
  if (!etiquetas.includes('antes-del-rediseno')) git(['tag', 'antes-del-rediseno', mainDeHoy], carpeta);
  for (const ruta of plan.retirar) await rm(path.join(carpeta, ruta), { force: true });
  for (const [ruta, contenido] of archivos) {
    const destino = path.join(carpeta, ruta);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido);
  }
  git(['add', '--all'], carpeta);
  git(['commit', '--quiet', '-m', `Publicacion ${etiqueta} desde ${RAMA_FUENTE} ${origen.slice(0, 7)}`], carpeta);
  const expuestos = correosExpuestos(git(['log', '-1', '--format=%ae%n%ce'], carpeta).split('\n'));
  if (expuestos.length > 0)
    throw new Error('el commit de la publicacion lleva un correo que no es el privado de GitHub');
  git(['tag', etiqueta], carpeta);
  // Sin forzar: si main se movio en GitHub, el push falla y no se pierde nada.
  git(['push', '--quiet', 'origin', 'main', etiqueta, 'antes-del-rediseno'], carpeta);
} finally {
  await rm(carpeta, { recursive: true, force: true });
}
console.log(`Publicado como ${etiqueta}. GitHub Pages tarda uno o dos minutos: ${DIRECCION}`);
console.log(`Para regresar a lo anterior: revertir ese commit en main (lo de antes era ${mainDeHoy.slice(0, 7)}).`);
