// @ts-check
// El corto de la primera pantalla, sin tocar la pagina: dado el guion (sus momentos, con lo que dura cada uno) y lo
// que lleva corriendo, que momento toca y cuanto lleva de avance. Todo son funciones puras; quien mueve la pagina es
// corto-vista.js.

/**
 * Un momento del corto.
 * @typedef {object} Momento
 * @property {string} clave  presion, vibra, avalancha, barrido, marca o agente
 * @property {number} dura   lo que dura, en milisegundos
 */

/**
 * Lo que se ve en un instante del corto.
 * @typedef {object} Instante
 * @property {string} clave    el momento que toca, o CARTEL si el corto ya termino
 * @property {number} indice   su lugar en el guion (el largo del guion, si ya termino)
 * @property {number} parte    de 0 a 1, cuanto lleva ese momento
 * @property {number} avance   de 0 a 1, cuanto lleva el corto entero
 * @property {boolean} fin     si el corto ya termino
 */

/**
 * El reloj del corto: lo que ya corrio y, si esta andando, desde cuando. No se cambia: cada funcion devuelve otro.
 * @typedef {object} Reloj
 * @property {number} corrido        milisegundos corridos hasta la ultima vez que se detuvo
 * @property {number | null} desde   la hora en que volvio a andar, o null si esta detenido
 */

/** Lo que queda cuando el corto termina. */
export const CARTEL = 'cartel';

/** En que parte del momento de la avalancha el contador ya llego a su tope: lo demas lo deja leerse. */
const LLENA_EN = 0.8;
/** Desde que punto de su recorrido la raya del barrido ya se ve en la pantalla (arranca fuera, a la izquierda). */
const ENTRA_EN = 0.18;

/**
 * El guion, como viaja escrito en la pagina: "presion:2600 vibra:2800". Lo que no se entiende, o no dura nada, se
 * salta: un guion roto deja menos momentos, nunca un corto que no termina.
 * @param {string | undefined | null} texto
 * @returns {Momento[]}
 */
export function leerGuion(texto) {
  /** @type {Momento[]} */
  const guion = [];
  for (const pedazo of (texto ?? '').split(/\s+/)) {
    const [clave = '', milisegundos = ''] = pedazo.split(':');
    const dura = Number(milisegundos);
    if (/^[a-z]+$/.test(clave) && clave !== CARTEL && Number.isFinite(dura) && dura > 0) guion.push({ clave, dura });
  }
  return guion;
}

/**
 * @param {Momento[]} guion
 * @returns {number} lo que dura el corto entero, en milisegundos
 */
export function duracion(guion) {
  return guion.reduce((total, momento) => total + momento.dura, 0);
}

/**
 * El momento que toca cuando el corto lleva "corridos" milisegundos.
 * @param {Momento[]} guion
 * @param {number} corridos
 * @returns {Instante}
 */
export function momentoEn(guion, corridos) {
  const total = duracion(guion);
  const ahora = Math.max(0, corridos);
  let empieza = 0;
  for (const [indice, momento] of guion.entries()) {
    if (ahora < empieza + momento.dura) {
      return {
        clave: momento.clave,
        indice,
        parte: (ahora - empieza) / momento.dura,
        avance: ahora / total,
        fin: false,
      };
    }
    empieza += momento.dura;
  }
  return { clave: CARTEL, indice: guion.length, parte: 1, avance: 1, fin: true };
}

/** @returns {Reloj} un reloj en ceros y detenido */
export function nuevoReloj() {
  return { corrido: 0, desde: null };
}

/**
 * Echa a andar el reloj. Si ya andaba, se queda igual.
 * @param {Reloj} reloj
 * @param {number} ahora  la hora del navegador, en milisegundos
 * @returns {Reloj}
 */
export function andar(reloj, ahora) {
  return reloj.desde === null ? { corrido: reloj.corrido, desde: ahora } : reloj;
}

/**
 * Detiene el reloj y guarda lo que corrio. Detenido no avanza: ni en pausa ni con la pestana escondida.
 * @param {Reloj} reloj
 * @param {number} ahora
 * @returns {Reloj}
 */
export function parar(reloj, ahora) {
  return reloj.desde === null ? reloj : { corrido: corridos(reloj, ahora), desde: null };
}

/**
 * @param {Reloj} reloj
 * @param {number} ahora
 * @returns {number} los milisegundos que el corto lleva corriendo de verdad
 */
export function corridos(reloj, ahora) {
  return reloj.corrido + (reloj.desde === null ? 0 : Math.max(0, ahora - reloj.desde));
}

/**
 * Los mensajes sin contestar que marca la pantalla del celular mientras se llena: suben parejo desde la base y se
 * quedan en el tope un poco antes de que el momento termine.
 * @param {number} parte  de 0 a 1, cuanto lleva el momento de la avalancha
 * @param {{ base: number, tope: number }} limites
 * @returns {number}
 */
export function sinContestar(parte, { base, tope }) {
  const llena = Math.min(1, Math.max(0, parte) / LLENA_EN);
  return Math.round(base + (tope - base) * llena);
}

/**
 * Por donde va la raya de luz del barrido: arranca suave, cruza casi parejo y frena suave. De 0 (todavia no entra) a
 * 1 (ya salio). Va fuera de la pantalla en las dos puntas, asi que casi todo el momento se le ve cruzar.
 * @param {number} parte  de 0 a 1, cuanto lleva el momento del barrido
 * @returns {number}
 */
export function barrido(parte) {
  const t = Math.min(1, Math.max(0, parte));
  return 0.5 * t + 0.25 * (1 - Math.cos(Math.PI * t));
}

/**
 * Cuanto se lleva la raya de luz lo que va barriendo: nada mientras todavia no entra a la pantalla y, desde ahi,
 * parejo hasta 1. Asi lo viejo se hace a un lado detras de la raya, nunca delante de ella.
 * @param {number} va  de 0 a 1, por donde va la raya (lo que devuelve barrido)
 * @returns {number}
 */
export function arrastre(va) {
  return Math.min(1, Math.max(0, va - ENTRA_EN) / (1 - ENTRA_EN));
}

/**
 * Un punto de una foto, como viaja escrito en la pagina ("46 78": por ciento de lo ancho y de lo alto), ya en
 * fracciones de 0 a 1. Si no se entiende, null: los estilos traen un punto de respaldo.
 * @param {string | undefined | null} texto
 * @returns {{ x: number, y: number } | null}
 */
export function punto(texto) {
  const [x, y, sobra] = (texto ?? '').trim().split(/\s+/).map(Number);
  if (sobra !== undefined || x === undefined || y === undefined) return null;
  if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) return null;
  return { x: x / 100, y: y / 100 };
}
