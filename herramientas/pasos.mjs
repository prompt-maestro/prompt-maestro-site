// @ts-check
// "Como funciona": los pasos de una cita, en actos (fuente/datos/secciones.json, pasos.actos). Aqui se numeran de
// corrido, del 01 al ultimo, y se revisa que cada paso diga quien lo hace con un papel que la pagina sabe dibujar y
// que su escena traiga solo piezas que la plantilla sabe pintar. Sumar o quitar un paso es tocar los datos.

/** Quien puede hacer un paso: su clientela, su agente o ella. Cada papel tiene su icono (#i-papel-...) y su color. */
export const PAPELES = /** @type {const} */ (['clientela', 'agente', 'tu']);

/** Las piezas que la plantilla sabe pintar dentro de una escena: un globo que sale o que entra, una nota, la ficha
 * de la cita y los botones de respuesta. */
export const PIEZAS_DE_ESCENA = /** @type {const} */ (['sale', 'entra', 'nota', 'cita', 'botones']);

/**
 * @typedef {{ quien: string, papel: string, rotulo: string, escena: Record<string, unknown>[] }} Paso
 * @typedef {Paso & { numero: string }} PasoNumerado
 * @typedef {{ nombre: string, pasos: PasoNumerado[] }} ActoNumerado
 */

/**
 * Numera los pasos de corrido a traves de los actos ("01", "02"...) y dice lo que esta mal en los datos.
 * @param {unknown} actos
 * @returns {{ actos: ActoNumerado[], problemas: string[] }}
 */
export function numerarPasos(actos) {
  /** @type {string[]} */
  const problemas = [];
  if (!Array.isArray(actos) || actos.length === 0) {
    return { actos: [], problemas: ['secciones.json: pasos.actos debe ser una lista con por lo menos un acto'] };
  }
  /** @type {Map<string, string>} */
  const nombreDe = new Map();
  let numero = 0;
  const numerados = actos.map((/** @type {any} */ acto, lugarDelActo) => {
    const cual = `secciones.json: pasos.actos[${lugarDelActo}]`;
    if (typeof acto?.nombre !== 'string' || acto.nombre.trim() === '') problemas.push(`${cual} no tiene nombre`);
    const pasos = Array.isArray(acto?.pasos) ? acto.pasos : [];
    if (pasos.length === 0) problemas.push(`${cual} no tiene pasos`);
    return {
      ...acto,
      pasos: pasos.map((/** @type {any} */ paso, /** @type {number} */ lugar) => {
        numero += 1;
        const de = `${cual}.pasos[${lugar}]`;
        if (!PAPELES.some((papel) => papel === paso?.papel)) {
          problemas.push(`${de}: el papel debe ser uno de ${PAPELES.join(', ')}`);
        }
        for (const clave of ['quien', 'rotulo']) {
          if (typeof paso?.[clave] !== 'string' || paso[clave].trim() === '') problemas.push(`${de} no tiene ${clave}`);
        }
        // Un mismo papel se llama igual en todos sus pasos.
        const ya = nombreDe.get(paso?.papel);
        if (ya === undefined) nombreDe.set(paso?.papel, paso?.quien);
        else if (ya !== paso?.quien) problemas.push(`${de}: el papel "${paso?.papel}" ya se llama "${ya}"`);
        const escena = Array.isArray(paso?.escena) ? paso.escena : [];
        if (escena.length === 0) problemas.push(`${de} no tiene escena`);
        for (const [lugarDePieza, pieza] of escena.entries()) {
          const claves = pieza !== null && typeof pieza === 'object' ? Object.keys(pieza) : [];
          if (claves.length !== 1 || !PIEZAS_DE_ESCENA.some((una) => una === claves[0])) {
            problemas.push(
              `${de}.escena[${lugarDePieza}] debe traer una sola pieza de las que hay (${PIEZAS_DE_ESCENA.join(', ')})`,
            );
          }
        }
        return { ...paso, numero: String(numero).padStart(2, '0') };
      }),
    };
  });
  return { actos: numerados, problemas };
}

/**
 * Los pasos en una sola lista, con quien hace cada uno: "Tu agente: Aparta el lugar y cobra el anticipo". Es lo que
 * leen los modelos de lenguaje en llms.txt.
 * @param {{ pasos: { quien: string, rotulo: string }[] }[]} actos
 * @returns {string[]}
 */
export function pasosConQuien(actos) {
  return actos.flatMap(({ pasos }) => pasos.map(({ quien, rotulo }) => `${quien}: ${rotulo}`));
}
