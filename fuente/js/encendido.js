// @ts-check
// El encendido: lo que se enciende al entrar a la vista (las estaciones de "Como funciona", los retratos de "Para
// quien" y el antes y despues). La pagina llega con todo encendido y quieto, y asi se queda sin este archivo o con
// movimiento reducido. Aqui solo se apaga lo que la visitante todavia no tiene enfrente, para encenderlo cuando
// llegue, una sola vez. Como se ve apagado y como se enciende lo dicen los estilos (data-enciende="espera" y "ya",
// y --orden: el lugar de cada pieza entre las que se encienden juntas).

/** Cuanto de la pieza tiene que asomar, y que tan arriba del fondo de la pantalla, para encenderla. */
const ASOMA = { rootMargin: '0px 0px -12% 0px', threshold: 0.2 };

/**
 * Lo que falta por ver: las piezas que empiezan debajo de la pantalla. A la que ya esta a la vista, o quedo arriba, no
 * se le apaga la luz para volver a encenderla.
 * @template {{ arriba: number }} P
 * @param {P[]} piezas  cada una con lo que hay de la orilla de arriba de la pantalla a su orilla de arriba
 * @param {number} alto  lo alto de la pantalla
 * @returns {P[]}
 */
export function porEncender(piezas, alto) {
  return piezas.filter(({ arriba }) => arriba >= alto);
}

/**
 * El turno de cada pieza entre las que entran juntas a la vista: las de un mismo grupo (las estaciones de la ruta,
 * las tarjetas de oficio) se encienden una tras otra, en su orden, y cada grupo lleva su propia cuenta.
 * @param {unknown[]} grupos  el grupo de cada pieza que entra, en el orden de la pagina
 * @returns {number[]}  el turno de cada una, desde cero
 */
export function turnosDe(grupos) {
  /** @type {Map<unknown, number>} */
  const van = new Map();
  return grupos.map((grupo) => {
    const turno = van.get(grupo) ?? 0;
    van.set(grupo, turno + 1);
    return turno;
  });
}

/**
 * Apaga las piezas que faltan por ver y enciende cada una cuando entra a la vista. Con movimiento reducido, o en un
 * navegador que no sabe avisar cuando algo entra a la vista, no hace nada: todo se queda encendido.
 */
export function montarEncendido() {
  if (typeof IntersectionObserver !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const vigia = new IntersectionObserver((entradas) => {
    const llegan = entradas.filter((entrada) => entrada.isIntersecting).map((entrada) => entrada.target);
    // Las piezas hermanas que llegan juntas se encienden escalonadas.
    const turnos = turnosDe(llegan.map((pieza) => pieza.parentElement));
    for (const [lugar, pieza] of llegan.entries()) {
      vigia.unobserve(pieza);
      if (pieza instanceof HTMLElement) pieza.style.setProperty('--orden', String(turnos[lugar] ?? 0));
      pieza.setAttribute('data-enciende', 'ya');
    }
  }, ASOMA);
  const piezas = [...document.querySelectorAll('[data-enciende]')].map((pieza) => ({
    pieza,
    arriba: pieza.getBoundingClientRect().top,
  }));
  for (const { pieza } of porEncender(piezas, innerHeight)) {
    pieza.setAttribute('data-enciende', 'espera');
    vigia.observe(pieza);
  }
}
