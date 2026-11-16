// @ts-check
// El comercial de la primera pantalla, sin tocar la pagina: que oficio se ve en cada toma, cual sigue cuando rotan
// solos y cuantos mensajes lleva sin contestar. Todo son funciones puras; quien mueve la pagina es pelicula-vista.js.

/**
 * @typedef {object} Toma
 * @property {string} clave   ruido, duda, marca, texto, voz, foto, pago o cartel
 * @property {string} oficio  el oficio que protagoniza la toma, o '' si le toca al que este elegido
 */

/** Cada cuanto llega otro mensaje sin contestar, en segundos. */
const RITMO = 1.6;

/**
 * El oficio que se ve en una toma: el suyo si lo trae fijo; si no, el que este elegido.
 * @param {Toma} toma
 * @param {string} elegido
 * @returns {string}
 */
export function oficioDe(toma, elegido) {
  return toma.oficio || elegido;
}

/**
 * La toma en la que los oficios rotan solos: la primera, la del ruido.
 * @param {Toma} toma
 * @returns {boolean}
 */
export function rota(toma) {
  return toma.clave === 'ruido';
}

/**
 * @param {string} actual
 * @param {string[]} claves  los oficios, en su orden
 * @returns {string} el que sigue, dando la vuelta al final
 */
export function siguienteOficio(actual, claves) {
  if (claves.length === 0) return actual;
  return claves[(claves.indexOf(actual) + 1) % claves.length] ?? actual;
}

/**
 * Lo que se ve de fondo en una toma: el lugar del cliente vacio en la de la duda; en las demas, el trabajo.
 * @param {string} clave
 * @returns {'trabajo' | 'espera'}
 */
export function mundoDe(clave) {
  return clave === 'duda' ? 'espera' : 'trabajo';
}

/**
 * Los mensajes sin contestar que marca el contador: suben mientras nadie contesta y se quedan en cero cuando ya
 * entro el agente.
 * @param {string} clave      la toma
 * @param {number} segundos   lo que lleva abierta la pagina
 * @param {{ base: number, tope: number }} [limites]
 * @returns {number}
 */
export function sinContestar(clave, segundos, limites = { base: 4, tope: 23 }) {
  if (clave !== 'ruido' && clave !== 'duda') return 0;
  const llegaron = Math.floor(Math.max(0, segundos) / RITMO);
  return Math.min(limites.tope, limites.base + llegaron);
}
