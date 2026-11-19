// @ts-check
// El corto de la primera pantalla, sin tocar la pagina: dado el guion (sus momentos, con lo que dura cada uno) y lo
// que lleva corriendo, que momento toca y cuanto lleva de avance. Todo son funciones puras; quien mueve la pagina es
// corto-vista.js.

/**
 * Un momento del corto.
 * @typedef {object} Momento
 * @property {string} clave  presion, vibra, avalancha, barrido, marca, agente o todos
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
/**
 * En que parte del momento del barrido la raya de luz ya termino de cruzar la pantalla: lo que queda del momento deja
 * ver lo que destapo, con su letrero, antes de que entre la marca. A la raya la mueve el navegador (una animacion de
 * los estilos); aqui solo se dice cuanto de su momento se lleva.
 */
export const CRUZA_EN = 0.8;

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
 * Pone el reloj en otro instante del corto (la visitante movio la raya de avance): si andaba, sigue andando desde
 * ahi; detenido, se queda detenido.
 * @param {Reloj} reloj
 * @param {number} hasta  milisegundos desde el principio del corto
 * @param {number} ahora
 * @returns {Reloj}
 */
export function ponerEn(reloj, hasta, ahora) {
  return { corrido: Math.max(0, hasta), desde: reloj.desde === null ? null : ahora };
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
 * Lo que tarda la raya de luz en cruzar la pantalla, en milisegundos: la parte de su momento que dice CRUZA_EN.
 * @param {number} dura  lo que dura el momento del barrido
 * @returns {number}
 */
export function cruza(dura) {
  return Math.round(Math.max(0, dura) * CRUZA_EN);
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

/**
 * Una zona de una foto, como viaja escrita en la pagina ("52 81 31 14": desde donde empieza, a lo ancho y a lo alto,
 * y cuanto mide de ancho y de alto, en por ciento de la foto), ya en fracciones de 0 a 1. Si no se entiende, o se
 * sale de la foto, null: los estilos traen una de respaldo.
 * @param {string | undefined | null} texto
 * @returns {{ x: number, y: number, ancho: number, alto: number } | null}
 */
export function zona(texto) {
  const [x, y, ancho, alto, sobra] = (texto ?? '').trim().split(/\s+/).map(Number);
  if (sobra !== undefined || x === undefined || y === undefined || ancho === undefined || alto === undefined) {
    return null;
  }
  if (!(x >= 0 && y >= 0 && ancho > 0 && alto > 0 && x + ancho <= 100 && y + alto <= 100)) return null;
  return { x: x / 100, y: y / 100, ancho: ancho / 100, alto: alto / 100 };
}

/**
 * El oficio que sigue en la lista, dando la vuelta al llegar al ultimo: quien ve el corto de nuevo ve otra profesion.
 * Si el de ahora no esta en la lista, toca el primero.
 * @param {string[]} oficios
 * @param {string} actual
 * @returns {string}
 */
export function siguienteOficio(oficios, actual) {
  return oficios[(oficios.indexOf(actual) + 1) % oficios.length] ?? actual;
}

/**
 * Cuando empieza un momento del guion, en milisegundos desde el principio del corto. Si el guion no lo trae, lo que
 * dura el corto entero.
 * @param {Momento[]} guion
 * @param {string} clave
 * @returns {number}
 */
export function empiezaEn(guion, clave) {
  let empieza = 0;
  for (const momento of guion) {
    if (momento.clave === clave) return empieza;
    empieza += momento.dura;
  }
  return empieza;
}

/**
 * Desde donde entra la toma viva (que dura menos que el corto) cuando falta "falta" para el momento en que ya no
 * debe notarse que vuelve a empezar: entra a media pasada, justo para terminar a esa hora. Asi su relevo (se funde
 * con su foto y arranca otra vez) cae donde algo lo tapa, y la pasada que sigue llega entera a lo que viene.
 * Todo en milisegundos; si la toma alcanza de sobra, o no se sabe cuanto dura, entra desde su principio.
 * @param {number} dura   lo que dura la toma viva
 * @param {number} falta  lo que falta para la hora en que su pasada debe terminar
 * @returns {number}
 */
export function entradaDeLaToma(dura, falta) {
  if (!(dura > 0) || !(falta > 0) || falta >= dura) return 0;
  return dura - falta;
}
