// @ts-check
// Revision antes de cada push (la llama .githooks/pre-push). Bloquea el push si:
//   1. va a la rama main: esa rama es la pagina en vivo y solo la mueve herramientas/publicar.mjs, con el si de Jose;
//   2. algun commit lleva un correo que no es el privado de GitHub (el repo es publico);
//   3. algun archivo que se sube trae algo con forma de llave o token.
// Se activa una vez por copia del repo:  git config core.hooksPath .githooks
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { correosExpuestos } from './correos.mjs';
import { secretosEn } from './secretos.mjs';

const CERO = /^0+$/;

/**
 * @param {string[]} argumentos
 * @returns {string}
 */
function git(argumentos) {
  return execFileSync('git', argumentos, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** @type {string[]} */
const fallas = [];
const lineas = readFileSync(0, 'utf8').split('\n').filter(Boolean);

for (const linea of lineas) {
  const [, shaLocal = '', refRemota = '', shaRemoto = ''] = linea.split(' ');
  if (CERO.test(shaLocal)) continue; // borrar una rama remota no sube nada
  if (refRemota === 'refs/heads/main' && process.env.PUBLICAR_CON_SI !== '1') {
    fallas.push('main es la pagina en vivo: solo se publica con herramientas/publicar.mjs --si');
  }
  const rango = CERO.test(shaRemoto) ? [shaLocal, '--not', '--remotes'] : [`${shaRemoto}..${shaLocal}`];
  const commits = git(['rev-list', ...rango])
    .split('\n')
    .filter(Boolean);
  for (const commit of commits) {
    const correos = git(['show', '-s', '--format=%ae%n%ce', commit]).split('\n');
    for (const correo of correosExpuestos(correos)) {
      fallas.push(
        `el commit ${commit.slice(0, 7)} lleva un correo que no es el privado de GitHub (${correo.replace(/^[^@]*/, '***')})`,
      );
    }
    const archivos = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', '--diff-filter=AM', commit]);
    for (const archivo of archivos.split('\n').filter(Boolean)) {
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
