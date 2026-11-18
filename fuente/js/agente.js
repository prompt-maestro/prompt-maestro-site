// @ts-check
// "Tu agente": el menu de beneficios y sus mini videos. Aqui vive lo que se decide sin tocar la pantalla (cual
// beneficio esta abierto, si su mini video corre y que dice su boton) y se prueba sin navegador. Pintar es de
// agente-vista.js, y el movimiento de cada escena, de los estilos: animaciones con el retraso que dicen los datos.

/** @typedef {'espera' | 'sigue' | 'fin'} Fase */
/**
 * @typedef {object} Estado
 * @property {number} abierto  el beneficio abierto, desde cero: siempre hay uno
 * @property {Fase} fase  espera: su mini video aun no empieza (el primero, hasta que la seccion llega a la vista);
 *   sigue: ya empezo y no ha terminado; fin: se quedo en su ultimo cuadro
 * @property {boolean} pausado  la visitante lo detuvo con el boton
 * @property {boolean} aLaVista  el mini video abierto se ve en la pantalla
 * @property {boolean} quieto  la visitante pidio menos movimiento: nada corre, cada escena es su ultimo cuadro
 * @property {number} vuelta  las veces que ha empezado un mini video: cuando cambia, la vista lo arranca desde cero
 */
/**
 * @typedef {{ tipo: 'elige', cual: number } | { tipo: 'boton' } | { tipo: 'termina' }
 *   | { tipo: 'vista', aLaVista: boolean } | { tipo: 'quieto', quieto: boolean }} Evento
 */
/** @typedef {'pausar' | 'reproducir' | 'verDeNuevo'} Boton */

/**
 * Como llega la seccion: el primer beneficio abierto y su mini video esperando a que la visitante lo vea.
 * @param {{ abierto?: number, quieto?: boolean }} [como]
 * @returns {Estado}
 */
export function estadoInicial({ abierto = 0, quieto = false } = {}) {
  return { abierto, fase: quieto ? 'fin' : 'espera', pausado: false, aLaVista: false, quieto, vuelta: 0 };
}

/**
 * El mini video abierto empieza desde cero. Con menos movimiento no hay nada que correr: se pinta su ultimo cuadro.
 * @param {Estado} estado
 * @returns {Estado}
 */
function empezar(estado) {
  if (estado.quieto) return { ...estado, fase: 'fin', pausado: false };
  return { ...estado, fase: 'sigue', pausado: false, vuelta: estado.vuelta + 1 };
}

/**
 * El estado que sigue. Si el evento no cambia nada devuelve el mismo objeto: asi la vista sabe que no hay que pintar.
 * @param {Estado} estado
 * @param {Evento} evento
 * @param {number} [cuantos]  los beneficios que hay
 * @returns {Estado}
 */
export function avanzar(estado, evento, cuantos = Number.POSITIVE_INFINITY) {
  switch (evento.tipo) {
    case 'elige':
      // Elegir el que ya esta abierto lo vuelve a correr: nunca se queda el menu sin un beneficio abierto.
      if (!Number.isInteger(evento.cual) || evento.cual < 0 || evento.cual >= cuantos) return estado;
      return empezar({ ...estado, abierto: evento.cual });
    case 'boton':
      if (estado.quieto) return estado;
      return estado.fase === 'sigue' ? { ...estado, pausado: !estado.pausado } : empezar(estado);
    case 'termina':
      return estado.fase === 'sigue' ? { ...estado, fase: 'fin', pausado: false } : estado;
    case 'vista': {
      if (evento.aLaVista === estado.aLaVista) return estado;
      const visto = { ...estado, aLaVista: evento.aLaVista };
      // El primero corre solo, una vez, cuando la seccion llega a la vista.
      return evento.aLaVista && estado.fase === 'espera' ? empezar(visto) : visto;
    }
    case 'quieto':
      if (evento.quieto === estado.quieto) return estado;
      return evento.quieto ? { ...estado, quieto: true, fase: 'fin', pausado: false } : { ...estado, quieto: false };
    default:
      return estado;
  }
}

/**
 * Si el mini video abierto esta corriendo en este instante: ya empezo, nadie lo pauso y se ve.
 * @param {Estado} estado
 * @returns {boolean}
 */
export function anda(estado) {
  return estado.fase === 'sigue' && !estado.pausado && estado.aLaVista;
}

/**
 * Lo que hace el boton de la barra del mini video.
 * @param {Estado} estado
 * @returns {Boton}
 */
export function botonDe(estado) {
  if (estado.fase === 'fin') return 'verDeNuevo';
  return estado.pausado ? 'reproducir' : 'pausar';
}

/**
 * Lo que dura un mini video, como lo dice un reproductor: "0:07".
 * @param {number} segundos
 * @returns {string}
 */
export function reloj(segundos) {
  const enteros = Math.max(0, Math.round(segundos));
  return `${Math.floor(enteros / 60)}:${String(enteros % 60).padStart(2, '0')}`;
}

/**
 * Cuanto hay que bajar la pagina para que quepa lo que se acaba de abrir, sin que su renglon se esconda por arriba.
 * @param {{ arriba: number, abajo: number, techo: number, piso: number }} medidas  donde empieza y termina lo
 *   abierto, y la parte de la pantalla que se ve (bajo la barra de arriba y sobre la de abajo)
 * @returns {number}
 */
export function cuantoBajar({ arriba, abajo, techo, piso }) {
  return Math.max(0, Math.min(abajo - piso, arriba - techo));
}

/**
 * Lo alto que hay que apartarle al menu en computadora para que nada brinque al cambiar de beneficio: sus renglones
 * y la oracion mas larga, este abierta o no.
 * @param {number[]} renglones  lo alto de cada renglon, sin su oracion
 * @param {number[]} oraciones  lo alto de cada oracion
 * @returns {number}
 */
export function altoDelMenu(renglones, oraciones) {
  return renglones.reduce((suma, alto) => suma + alto, 0) + Math.max(0, ...oraciones);
}
