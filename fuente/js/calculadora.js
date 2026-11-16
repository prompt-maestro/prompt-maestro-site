// @ts-check
// La cuenta de los plantones, sin tocar la pagina: cuanto se le va al mes y con cuantas citas que si lleguen se paga
// el plan. La cuenta se hace en el telefono de la visitante: nada de lo que escribe sale de ahi.

/** Lo que se acepta en cada casilla. */
export const LIMITES = /** @type {const} */ ({ citas: [1, 500], precio: [1, 100000] });

/** Un entero, con o sin comas de miles bien puestas: "1200" o "1,200" (nunca "350,50"). */
const ENTERO = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;

/**
 * Quita lo que la gente escribe alrededor de un numero: espacios, el signo de pesos y el punto o la coma con que
 * se queda a medio teclear ("350." todavia no es un error: es "350" a punto de llevar centavos).
 * @param {string} texto
 * @returns {string}
 */
function limpiar(texto) {
  return texto.replace(/[\s$]/g, '').replace(/[.,]$/, '');
}

/**
 * Lee una cantidad de citas: un entero, con o sin comas de miles.
 * @param {string} texto
 * @returns {number | null} el entero, o null si la casilla esta vacia; NaN si no es un numero entero
 */
export function leerEntero(texto) {
  const limpio = limpiar(texto);
  if (limpio === '') return null;
  return ENTERO.test(limpio) ? Number(limpio.replaceAll(',', '')) : Number.NaN;
}

/**
 * Lee un precio en pesos, con sus centavos si los trae: con punto ("350.50") o con coma ("350,50"). "1,200" son
 * mil doscientos, no uno con veinte. La cuenta se hace con el precio exacto y se cierra al peso hasta el final.
 * @param {string} texto
 * @returns {number | null} el precio, o null si la casilla esta vacia; NaN si no es un precio
 */
export function leerDinero(texto) {
  const limpio = limpiar(texto);
  if (limpio === '') return null;
  const partes = /^(.+?)(?:[.,](\d{1,2}))?$/.exec(limpio);
  const enteros = partes?.[1] ?? '';
  if (!ENTERO.test(enteros)) return Number.NaN;
  return Number(`${enteros.replaceAll(',', '')}.${partes?.[2] ?? '0'}`);
}

/**
 * @param {number} valor
 * @param {readonly [number, number]} limite
 * @returns {boolean}
 */
function cabe(valor, limite) {
  return Number.isFinite(valor) && valor >= limite[0] && valor <= limite[1];
}

/**
 * La cuenta ya hecha. "sePaga" dice si con las citas que hoy le plantan alcanza para pagar el plan: si no alcanza, la
 * pagina no le dice que el plan "ya se pago".
 * @typedef {{ estado: 'vacia' }
 *   | { estado: 'fuera', casilla: 'citas' | 'precio' }
 *   | { estado: 'lista', perdido: number, citasParaPagar: number, sePaga: boolean }} Cuenta
 */

/**
 * @param {object} datos
 * @param {number | null} datos.citas        citas que le plantan al mes
 * @param {number | null} datos.precio       lo que cobra por cita, en pesos
 * @param {number} datos.mensualidad         la mensualidad del plan mas barato
 * @returns {Cuenta}
 */
export function hacerLaCuenta({ citas, precio, mensualidad }) {
  if (citas !== null && !(Number.isInteger(citas) && cabe(citas, LIMITES.citas)))
    return { estado: 'fuera', casilla: 'citas' };
  if (precio !== null && !cabe(precio, LIMITES.precio)) return { estado: 'fuera', casilla: 'precio' };
  // Sin una mensualidad de verdad no hay contra que comparar.
  if (citas === null || precio === null || !(mensualidad > 0)) return { estado: 'vacia' };
  const citasParaPagar = Math.ceil(mensualidad / precio);
  // Primero se multiplica y luego se cierra al peso: 4 citas de $350.50 son $1,402, no $1,404.
  return { estado: 'lista', perdido: Math.round(citas * precio), citasParaPagar, sePaga: citasParaPagar <= citas };
}

/**
 * El plan mas barato de una lista: contra ese se hace la cuenta.
 * @template {{ mensual: number }} P
 * @param {P[]} planes
 * @returns {P | undefined}
 */
export function planMasBarato(planes) {
  return planes.reduce(
    (/** @type {P | undefined} */ menor, plan) => (!menor || plan.mensual < menor.mensual ? plan : menor),
    undefined,
  );
}
