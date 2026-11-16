// @ts-check
// Este repo y el de la previa son publicos: ningun commit lleva un correo personal. Solo se aceptan los correos
// privados de GitHub (terminan en @users.noreply.github.com) y el que pone GitHub cuando confirma desde su pagina.

/**
 * @param {string} correo
 * @returns {boolean}
 */
export function esCorreoPrivado(correo) {
  return /^[^@\s]+@users\.noreply\.github\.com$/.test(correo) || correo === 'noreply@github.com';
}

/**
 * Las identidades de un commit o de una etiqueta anotada (quien lo escribio, quien lo confirmo, quien etiqueto),
 * leidas de su cabecera tal cual las guarda git. Asi tambien se ve la identidad automatica de una laptop sin
 * configurar ("usuario@LAPTOP-ABC"), que no tiene forma de correo y se le escapa a una busqueda de correos.
 * @param {string} crudo  la salida de git cat-file -p
 * @returns {string[]}
 */
export function identidadesDe(crudo) {
  const cabecera = crudo.split('\n\n', 1)[0] ?? '';
  return [...cabecera.matchAll(/^(?:author|committer|tagger) .*<([^>]*)>/gm)].map(([, correo]) => correo ?? '');
}

/**
 * Los correos que no deberian estar en un repo publico.
 * @param {string[]} correos
 * @returns {string[]}
 */
export function correosExpuestos(correos) {
  return [...new Set(correos.map((c) => c.trim()).filter((c) => c !== '' && !esCorreoPrivado(c)))];
}
