// @ts-check
// Instala el gancho de pre-push como ARCHIVO en .git/hooks:  node herramientas/instalar-gancho.mjs
// Lo corre npm al instalar las dependencias (guion "prepare"). Antes el gancho se tomaba de la carpeta .githooks del
// arbol (core.hooksPath), y desaparecia justo al cambiar a la rama main, que no trae esa carpeta: un push a la pagina
// en vivo salia sin revision. Como archivo dentro de .git, el gancho esta siempre, sin importar que rama este puesta.
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string[]} argumentos
 * @returns {string | null}  la salida, o null si git no pudo (por ejemplo, la carpeta no es un repo)
 */
function git(argumentos) {
  try {
    return execFileSync('git', argumentos, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// Fuera de un repo (un paquete descomprimido) no hay nada que instalar.
const carpetaDeGit = git(['rev-parse', '--git-common-dir']);
if (carpetaDeGit === null) process.exit(0);

const ganchos = path.resolve(RAIZ, carpetaDeGit, 'hooks');
await mkdir(ganchos, { recursive: true });
const destino = path.join(ganchos, 'pre-push');
await copyFile(path.join(RAIZ, '.githooks', 'pre-push'), destino);
await chmod(destino, 0o755);
// Si quedo la configuracion vieja, git buscaria el gancho en el arbol y no en .git: se quita.
git(['config', '--unset', 'core.hooksPath']);
console.log('Gancho de pre-push instalado en .git/hooks (revisa cada push, en cualquier rama).');
