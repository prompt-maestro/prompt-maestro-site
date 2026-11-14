// @ts-check
// Los planes de la pagina son una copia de los del alta (web/planes.json del motor, que es privado). Aqui solo entra lo
// que la pagina ensena: nunca un identificador de un proveedor de pagos ni las notas internas del motor. De la nota
// solo se conserva un dato: si los precios son de prueba.

/**
 * @typedef {object} Plan
 * @property {string} clave
 * @property {string} nombre
 * @property {number} mensual
 * @property {number} anual
 * @property {number} instalacion
 * @property {boolean} destacado
 * @property {string[]} incluye
 */

/**
 * @typedef {object} Planes
 * @property {string} moneda
 * @property {boolean} dePrueba  mientras sea verdadero, la pagina no se puede publicar
 * @property {Plan[]} planes
 */

/**
 * @param {unknown} valor
 * @param {string} que
 * @returns {number}
 */
function enteroDePesos(valor, que) {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) {
    throw new Error(`Planes: ${que} debe ser un numero entero mayor que cero`);
  }
  return valor;
}

/**
 * @param {unknown} valor
 * @param {string} que
 * @returns {string}
 */
function texto(valor, que) {
  if (typeof valor !== 'string' || valor.trim() === '') throw new Error(`Planes: falta ${que}`);
  return valor;
}

/**
 * Deja solo los campos publicos, en orden fijo, y se detiene si algo no trae la forma esperada.
 * @param {unknown} origen
 * @returns {Planes}
 */
export function planesPublicos(origen) {
  if (origen === null || typeof origen !== 'object') throw new Error('Planes: el archivo no es un objeto');
  const o = /** @type {Record<string, unknown>} */ (origen);
  if (!Array.isArray(o.planes) || o.planes.length === 0) throw new Error('Planes: no hay ningun plan');
  const planes = o.planes.map((p, i) => {
    const plan = /** @type {Record<string, unknown>} */ (p ?? {});
    const nombre = texto(plan.nombre, `el nombre del plan ${i + 1}`);
    if (!Array.isArray(plan.incluye) || plan.incluye.length === 0)
      throw new Error(`Planes: ${nombre} no dice que incluye`);
    return {
      clave: texto(plan.clave, `la clave de ${nombre}`),
      nombre,
      mensual: enteroDePesos(plan.mensual, `la mensualidad de ${nombre}`),
      anual: enteroDePesos(plan.anual, `la anualidad de ${nombre}`),
      instalacion: enteroDePesos(plan.instalacion, `la instalacion de ${nombre}`),
      destacado: plan.destacado === true,
      incluye: plan.incluye.map((linea) => texto(linea, `una linea de lo que incluye ${nombre}`)),
    };
  });
  if (planes.filter((p) => p.destacado).length !== 1)
    throw new Error('Planes: debe haber exactamente un plan destacado');
  const moneda = texto(o.moneda, 'la moneda');
  const dePrueba = o.dePrueba === true || (typeof o.nota === 'string' && /prueba/i.test(o.nota));
  return { moneda, dePrueba, planes };
}
