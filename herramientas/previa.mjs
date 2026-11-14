// @ts-check
// Sube la previa:  node herramientas/previa.mjs
// Arma el sitio para la previa (noindex, cinta de PREVIA, carpeta /pagina-previa/) y lo deja como UN solo commit en la
// rama main del repo prompt-maestro/pagina-previa, que GitHub Pages sirve en https://prompt-maestro.github.io/pagina-previa/
// Cada subida reemplaza a la anterior: ese repo es solo un escaparate para revisar, su historia no importa.
// Nunca toca prompt-maestro.com: eso es herramientas/publicar.mjs, con el si del dueno.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarSitio } from './armado.mjs';
import { correosExpuestos, esCorreoPrivado } from './correos.mjs';
import { secretosEn } from './secretos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_PREVIA = 'https://github.com/prompt-maestro/pagina-previa.git';
const DIRECCION = 'https://prompt-maestro.github.io/pagina-previa/';

/**
 * @param {string[]} argumentos
 * @param {string} carpeta
 * @returns {string}
 */
function git(argumentos, carpeta) {
  return execFileSync('git', argumentos, { cwd: carpeta, encoding: 'utf8' }).trim();
}

const correo = git(['config', 'user.email'], RAIZ);
if (!esCorreoPrivado(correo)) {
  console.error('BLOQUEA: el correo de git de esta carpeta no es el privado de GitHub. Configuralo antes de subir.');
  process.exit(1);
}

const { archivos, problemas, avisos } = await armarSitio({ raiz: RAIZ, destino: 'previa' });
for (const aviso of avisos) console.log(`AVISO: ${aviso}`);
for (const [ruta, contenido] of archivos) {
  if (/\.(html|css|js|json|txt|xml|svg)$/.test(ruta)) {
    for (const tipo of secretosEn(contenido.toString('utf8'))) problemas.push(`${ruta} trae algo con forma de ${tipo}`);
  }
}
if (problemas.length > 0) {
  for (const problema of problemas) console.error(`FALLA: ${problema}`);
  process.exit(1);
}

const origen = git(['rev-parse', '--short', 'HEAD'], RAIZ);
const sinConfirmar = git(['status', '--porcelain'], RAIZ) !== '';
const carpeta = await mkdtemp(path.join(tmpdir(), 'pagina-previa-'));
try {
  for (const [ruta, contenido] of archivos) {
    const destino = path.join(carpeta, ruta);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido);
  }
  git(['init', '--quiet', '--initial-branch=main'], carpeta);
  git(['config', 'user.email', correo], carpeta);
  git(['config', 'user.name', git(['config', 'user.name'], RAIZ)], carpeta);
  git(['config', 'core.autocrlf', 'false'], carpeta);
  git(['add', '--all'], carpeta);
  git(
    ['commit', '--quiet', '-m', `Previa desde fuente ${origen}${sinConfirmar ? ' (con cambios sin confirmar)' : ''}`],
    carpeta,
  );
  const expuestos = correosExpuestos(git(['log', '--format=%ae%n%ce'], carpeta).split('\n'));
  if (expuestos.length > 0) throw new Error('el commit de la previa lleva un correo que no es el privado de GitHub');
  git(['push', '--quiet', '--force', REPO_PREVIA, 'main'], carpeta);
} finally {
  await rm(carpeta, { recursive: true, force: true });
}
console.log(`Previa subida (${archivos.size} archivos, desde fuente ${origen}). En uno o dos minutos: ${DIRECCION}`);
