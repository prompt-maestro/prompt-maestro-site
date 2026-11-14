// @ts-check
// Revision antes de cada push (la llama .githooks/pre-push con el nombre del remoto). Bloquea el push si:
//   1. toca la rama main (subirle algo o borrarla): esa rama es la pagina en vivo y solo la mueve
//      herramientas/publicar.mjs, con el si del dueno;
//   2. algun commit o etiqueta lleva un correo personal, como autor, como quien confirma o dentro del mensaje (el repo
//      es publico);
//   3. algun archivo que se sube trae algo con forma de llave o token.
// Se activa al instalar las dependencias (npm ci) o a mano:  git config core.hooksPath .githooks
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { correosExpuestos } from './correos.mjs';
import { secretosEn } from './secretos.mjs';

const CERO = /^0+$/;
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Correos que pueden ir en el mensaje de un commit sin ser de una persona. */
const CORREOS_DE_HERRAMIENTAS = new Set(['noreply@anthropic.com']);

/**
 * @param {string[]} argumentos
 * @returns {string}
 */
function git(argumentos) {
  return execFileSync('git', argumentos, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/**
 * Los correos de un commit o de una etiqueta anotada: autor, quien confirma, quien etiqueta y los del mensaje.
 * @param {string} objeto
 * @returns {string[]}
 */
function correosDe(objeto) {
  const crudo = git(['cat-file', '-p', objeto]);
  return (crudo.match(CORREO) ?? []).filter((correo) => !CORREOS_DE_HERRAMIENTAS.has(correo));
}

const remoto = process.argv[2] ?? 'origin';
/** @type {string[]} */
const fallas = [];
const lineas = readFileSync(0, 'utf8').split('\n').filter(Boolean);

for (const linea of lineas) {
  const [, shaLocal = '', refRemota = '', shaRemoto = ''] = linea.split(' ');
  // La regla de main va primero: tambien cuenta borrarla.
  if (refRemota === 'refs/heads/main' && process.env.PUBLICAR_CON_SI !== '1') {
    fallas.push('main es la pagina en vivo: solo se publica con herramientas/publicar.mjs --si');
  }
  if (CERO.test(shaLocal)) continue; // borrar una rama remota no sube nada mas que revisar
  if (git(['cat-file', '-t', shaLocal]).trim() === 'tag') {
    for (const correo of correosExpuestos(correosDe(shaLocal))) {
      fallas.push(`la etiqueta ${refRemota} lleva un correo personal (${correo.replace(/^[^@]*/, '***')})`);
    }
  }
  const rango = CERO.test(shaRemoto) ? [shaLocal, '--not', `--remotes=${remoto}`] : [`${shaRemoto}..${shaLocal}`];
  const commits = git(['rev-list', ...rango])
    .split('\n')
    .filter(Boolean);
  for (const commit of commits) {
    for (const correo of correosExpuestos(correosDe(commit))) {
      fallas.push(`el commit ${commit.slice(0, 7)} lleva un correo personal (${correo.replace(/^[^@]*/, '***')})`);
    }
    // -m cuenta tambien lo que entra por una fusion; -z entrega los nombres tal cual, con acentos y espacios.
    const archivos = git([
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      '-m',
      '-z',
      '--root',
      '--diff-filter=AM',
      commit,
    ]);
    for (const archivo of new Set(archivos.split('\0').filter(Boolean))) {
      const tipos = secretosEn(git(['show', `${commit}:${archivo}`]));
      for (const tipo of tipos) fallas.push(`${archivo} (commit ${commit.slice(0, 7)}) trae algo con forma de ${tipo}`);
    }
  }
}

if (fallas.length > 0) {
  for (const falla of new Set(fallas)) console.error(`BLOQUEA: ${falla}`);
  process.exit(1);
}
console.log('Antes de subir: sin correos personales, sin llaves y sin tocar main.');
