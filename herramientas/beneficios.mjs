// @ts-check
// Los capitulos de "Tu agente" (fuente/datos/agentes.json) se comprueban al armar: "Lo que hace", con sus beneficios,
// y "Como empiezas", con sus pasos. Sumar o quitar un renglon es tocar los datos: aqui se revisa que la plantilla lo
// sepa dibujar y que su mini video dure lo que debe. Esto no viaja a la pagina: es de la armada.

/**
 * Lo menos y lo mas que dura un mini video, en segundos. "largo" es el tope del que cuenta una historia completa (la
 * cita de principio a fin): lo pide con "largo": true en sus datos.
 */
export const DURA = /** @type {const} */ ({ minimo: 6, maximo: 8, largo: 30 });
/** Lo que tarda una pieza en entrar o en irse, en segundos: lo mismo que dicen los estilos. */
const ENTRADA = 0.5;
/** Las piezas que la plantilla (parciales/mini-video.html) sabe dibujar. Cada paso de una escena trae una, y solo una. */
export const PIEZAS = /** @type {const} */ ([
  'pastilla',
  'quien',
  'base',
  'sale',
  'voz',
  'entra',
  'agenda',
  'aprobado',
  'cita',
  'hizo',
  'recado',
  'botones',
  'conecta',
]);
/** De quien es el celular que ensena una escena: el de la clienta (o paciente) o el de la profesional. */
export const QUIENES = /** @type {const} */ (['clienta', 'tu']);
/** Como se llama un capitulo por dentro: con su clave se arman los id de la pagina. */
const CLAVE = /^[a-z]+$/;

/**
 * Lo que esta mal en los renglones de un capitulo.
 * @param {unknown} videos
 * @param {string} capitulo  como se nombra el capitulo en los avisos
 * @returns {string[]}
 */
function problemasDeVideos(videos, capitulo) {
  if (!Array.isArray(videos) || videos.length === 0) return [`${capitulo}: no trae ningun renglon`];
  /** @type {string[]} */
  const problemas = [];
  for (const [lugar, beneficio] of videos.entries()) {
    const { titulo, texto, dura, largo, pasos } = /** @type {Record<string, unknown>} */ (beneficio ?? {});
    const donde = `${capitulo}, renglon ${lugar + 1}`;
    const falla = (/** @type {string} */ que) => problemas.push(`${donde}: ${que}`);
    if (typeof titulo !== 'string' || !titulo.trim()) falla('le falta el titulo');
    if (typeof texto !== 'string' || !texto.trim()) falla('le falta la oracion');
    if (largo !== undefined && largo !== true) falla('"largo" solo puede ser true');
    const tope = largo === true ? DURA.largo : DURA.maximo;
    if (typeof dura !== 'number' || !Number.isInteger(dura) || dura < DURA.minimo || dura > tope) {
      falla(`su mini video debe durar de ${DURA.minimo} a ${tope} segundos enteros`);
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
      // Quien ve lo que sigue: la clienta (o paciente) o la profesional, dicho con sus palabras.
      const quien = /** @type {{ de?: unknown, texto?: unknown, momento?: unknown } | undefined} */ (resto.quien);
      if (
        'quien' in resto &&
        (!QUIENES.some((uno) => uno === quien?.de) ||
          typeof quien?.texto !== 'string' ||
          !quien.texto.trim() ||
          (quien.momento !== undefined && (typeof quien.momento !== 'string' || !quien.momento.trim())))
      ) {
        falla(`el rotulo de ${cual} debe decir de quien es (${QUIENES.join(' o ')}) y traer su texto`);
      }
      // Los botones de respuesta: por lo menos uno, cada uno con su texto.
      const botones = resto.botones;
      if (
        'botones' in resto &&
        (!Array.isArray(botones) ||
          botones.length === 0 ||
          botones.some((boton) => typeof boton?.texto !== 'string' || !boton.texto.trim()))
      ) {
        falla(`los botones de ${cual} deben ser una lista, cada uno con su texto`);
      }
    }
    // El ultimo cuadro es lo que se queda a la vista (y lo unico que se ve con menos movimiento): no puede quedar vacio.
    if (pasos.every((paso) => /** @type {{ hasta?: unknown } | null} */ (paso)?.hasta !== undefined)) {
      falla('su ultimo cuadro queda vacio: todas sus piezas se van');
    }
  }
  return problemas;
}

/**
 * Lo que esta mal en los capitulos de los datos. Vacia quiere decir que todo esta bien.
 * @param {unknown} capitulos
 * @returns {string[]}
 */
export function problemasDeBeneficios(capitulos) {
  if (!Array.isArray(capitulos) || capitulos.length === 0) return ['agentes.json: no hay ningun capitulo'];
  /** @type {string[]} */
  const problemas = [];
  /** @type {Set<unknown>} */
  const claves = new Set();
  for (const [lugar, capitulo] of capitulos.entries()) {
    const { clave, nombre, videos } = /** @type {Record<string, unknown>} */ (capitulo ?? {});
    const donde = `agentes.json, capitulo ${lugar + 1}`;
    if (typeof clave !== 'string' || !CLAVE.test(clave)) {
      problemas.push(`${donde}: su clave debe ser una palabra en minusculas`);
    } else if (claves.has(clave)) {
      problemas.push(`${donde}: la clave "${clave}" ya la lleva otro capitulo`);
    }
    claves.add(clave);
    if (typeof nombre !== 'string' || !nombre.trim()) problemas.push(`${donde}: le falta el nombre`);
    problemas.push(...problemasDeVideos(videos, donde));
  }
  return problemas;
}
