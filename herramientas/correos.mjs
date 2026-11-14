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
 * Los correos que no deberian estar en un repo publico.
 * @param {string[]} correos
 * @returns {string[]}
 */
export function correosExpuestos(correos) {
  return [...new Set(correos.map((c) => c.trim()).filter((c) => c !== '' && !esCorreoPrivado(c)))];
}
