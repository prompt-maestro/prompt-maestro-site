// @ts-check
// Los beneficios de "Tu agente" (fuente/datos/agentes.json) se comprueban al armar. Sumar o quitar uno es tocar los
// datos: aqui se revisa que la plantilla lo sepa dibujar y que su mini video dure lo que debe. Esto no viaja a la
// pagina: es de la armada.

/** Lo menos y lo mas que dura un mini video, en segundos. */
export const DURA = /** @type {const} */ ({ minimo: 6, maximo: 8 });
/** Lo que tarda una pieza en entrar o en irse, en segundos: lo mismo que dicen los estilos. */
const ENTRADA = 0.5;
/** Las piezas que la plantilla (parciales/mini-video.html) sabe dibujar. Cada paso de una escena trae una, y solo una. */
export const PIEZAS = /** @type {const} */ ([
  'pastilla',
  'etiqueta',
  'base',
  'sale',
  'voz',
  'entra',
  'agenda',
  'aprobado',
  'cita',
  'hizo',
  'recado',
  'examen',
]);

/**
 * Lo que esta mal en los beneficios de los datos. Vacia quiere decir que todo esta bien.
 * @param {unknown} hace
 * @returns {string[]}
 */
export function problemasDeBeneficios(hace) {
  if (!Array.isArray(hace) || hace.length === 0) return ['agentes.json: no hay ningun beneficio'];
  /** @type {string[]} */
  const problemas = [];
  for (const [lugar, beneficio] of hace.entries()) {
    const { titulo, texto, dura, pasos } = /** @type {Record<string, unknown>} */ (beneficio ?? {});
    const donde = `agentes.json, beneficio ${lugar + 1}`;
    const falla = (/** @type {string} */ que) => problemas.push(`${donde}: ${que}`);
    if (typeof titulo !== 'string' || !titulo.trim()) falla('le falta el titulo');
    if (typeof texto !== 'string' || !texto.trim()) falla('le falta la oracion');
    if (typeof dura !== 'number' || !Number.isInteger(dura) || dura < DURA.minimo || dura > DURA.maximo) {
      falla(`su mini video debe durar de ${DURA.minimo} a ${DURA.maximo} segundos enteros`);
      continue;
    }
    if (!Array.isArray(pasos) || pasos.length === 0) {
      falla('su escena no tiene pasos');
      continue;
    }
    let anterior = 0;
    for (const [numero, paso] of pasos.entries()) {
      const { en, hasta, ...resto } = /** @type {Record<string, unknown>} */ (paso ?? {});
      const cual = `el paso ${numero + 1}`;
      const piezas = Object.keys(resto);
      if (piezas.length !== 1 || !PIEZAS.some((pieza) => pieza === piezas[0])) {
        falla(`${cual} debe traer una sola pieza de las que hay (${PIEZAS.join(', ')})`);
      }
      if (typeof en !== 'number' || en < anterior || en + ENTRADA > dura) {
        falla(`${cual} debe aparecer despues del anterior y antes de que el video termine`);
        continue;
      }
      anterior = en;
      if (hasta !== undefined && (typeof hasta !== 'number' || hasta < en + ENTRADA || hasta + ENTRADA > dura)) {
        falla(`${cual} debe irse despues de entrar y antes de que el video termine`);
      }
      const cambia = /** @type {{ cambia?: unknown } | undefined} */ (resto.agenda)?.cambia;
      if (
        cambia !== undefined &&
        (typeof cambia !== 'number' || cambia < en + ENTRADA || cambia + 2 * ENTRADA > dura)
      ) {
        falla(`la agenda de ${cual} debe cambiar despues de entrar y antes de que el video termine`);
      }
    }
    // El ultimo cuadro es lo que se queda a la vista (y lo unico que se ve con menos movimiento): no puede quedar vacio.
    if (pasos.every((paso) => /** @type {{ hasta?: unknown } | null} */ (paso)?.hasta !== undefined)) {
      falla('su ultimo cuadro queda vacio: todas sus piezas se van');
    }
  }
  return problemas;
}
