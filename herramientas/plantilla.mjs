// @ts-check
// Motor de plantillas minimo y sin dependencias. La pagina se arma una sola vez, en la laptop o en GitHub Actions: lo
// publicado es HTML ya escrito, sin este codigo.
//
//   {{ruta.del.dato}}              valor escapado para HTML
//   {{{ruta.del.dato}}}            valor tal cual (solo para HTML que arma el propio armador, nunca para un texto)
//   {{> parcial}}                  incluye plantillas/parciales/parcial.html
//   {{#cada lista}} ... {{/cada}}  repite; dentro se leen los campos del elemento, {{este}}, {{@indice}}, {{@numero}},
//                                  {{@primero}} y {{@ultimo}}
//   {{#si ruta}} ... {{/si}}       solo si el dato es verdadero (una lista o un texto vacios cuentan como falso)
//   {{#no ruta}} ... {{/no}}       lo contrario
//
// Es estricto a proposito: un dato o un parcial que no existe DETIENE la armada. Una pagina de venta no puede salir
// con un precio en blanco.

/** @typedef {{ tipo: 'texto', valor: string }} NodoTexto */
/** @typedef {{ tipo: 'valor', ruta: string, crudo: boolean }} NodoValor */
/** @typedef {{ tipo: 'parcial', nombre: string }} NodoParcial */
/** @typedef {{ tipo: 'bloque', clase: 'cada' | 'si' | 'no', ruta: string, hijos: Nodo[] }} NodoBloque */
/** @typedef {NodoTexto | NodoValor | NodoParcial | NodoBloque} Nodo */

const MARCA = /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([#/>]?)\s*([^{}]*?)\s*\}\}/g;
const CLASES = /** @type {const} */ (['cada', 'si', 'no']);
const HONDO_MAXIMO = 20;
const NO_ESTA = Symbol('no esta');

/** @type {Record<string, string>} */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * @param {unknown} valor
 * @returns {string}
 */
export function escaparHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * @param {string} texto
 * @returns {Nodo[]}
 */
function analizar(texto) {
  /** @type {Nodo[]} */
  const raiz = [];
  /** @type {{ bloque: NodoBloque | null, hijos: Nodo[] }[]} */
  const pila = [{ bloque: null, hijos: raiz }];
  const arriba = () => /** @type {{ bloque: NodoBloque | null, hijos: Nodo[] }} */ (pila[pila.length - 1]);
  let cursor = 0;
  for (const m of texto.matchAll(MARCA)) {
    if (m.index > cursor) arriba().hijos.push({ tipo: 'texto', valor: texto.slice(cursor, m.index) });
    cursor = m.index + m[0].length;
    const [, crudo, signo, cuerpo = ''] = m;
    if (crudo !== undefined) {
      arriba().hijos.push({ tipo: 'valor', ruta: crudo, crudo: true });
    } else if (signo === '>') {
      arriba().hijos.push({ tipo: 'parcial', nombre: cuerpo });
    } else if (signo === '#') {
      const [clase = '', ruta = ''] = cuerpo.split(/\s+/);
      const conocida = CLASES.find((c) => c === clase);
      if (!conocida || !ruta) throw new Error(`Plantilla: no entiendo el bloque "{{#${cuerpo}}}"`);
      /** @type {NodoBloque} */
      const bloque = { tipo: 'bloque', clase: conocida, ruta, hijos: [] };
      arriba().hijos.push(bloque);
      pila.push({ bloque, hijos: bloque.hijos });
    } else if (signo === '/') {
      const abierto = arriba().bloque;
      if (!abierto || abierto.clase !== cuerpo) {
        throw new Error(`Plantilla: "{{/${cuerpo}}}" cierra un bloque que no esta abierto`);
      }
      pila.pop();
    } else {
      arriba().hijos.push({ tipo: 'valor', ruta: cuerpo, crudo: false });
    }
  }
  const abierto = arriba().bloque;
  if (abierto) throw new Error(`Plantilla: el bloque "{{#${abierto.clase} ${abierto.ruta}}}" quedo sin cerrar`);
  if (cursor < texto.length) raiz.push({ tipo: 'texto', valor: texto.slice(cursor) });
  return raiz;
}

/**
 * Busca la ruta del ambito mas cercano hacia afuera.
 * @param {string} ruta
 * @param {Record<string, unknown>[]} ambitos
 * @returns {unknown}
 */
function buscar(ruta, ambitos) {
  const [primero = '', ...resto] = ruta.split('.');
  for (let i = ambitos.length - 1; i >= 0; i--) {
    const ambito = /** @type {Record<string, unknown>} */ (ambitos[i]);
    if (!Object.hasOwn(ambito, primero)) continue;
    /** @type {unknown} */
    let valor = ambito[primero];
    for (const parte of resto) {
      if (valor === null || typeof valor !== 'object' || !Object.hasOwn(valor, parte)) return NO_ESTA;
      valor = /** @type {Record<string, unknown>} */ (valor)[parte];
    }
    return valor;
  }
  return NO_ESTA;
}

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
function esVerdadero(valor) {
  if (valor === NO_ESTA) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  return Boolean(valor);
}

/**
 * @param {Nodo[]} nodos
 * @param {Record<string, unknown>[]} ambitos
 * @param {Record<string, string>} parciales
 * @param {number} hondo
 * @returns {string}
 */
function pintarNodos(nodos, ambitos, parciales, hondo) {
  let salida = '';
  for (const nodo of nodos) {
    if (nodo.tipo === 'texto') {
      salida += nodo.valor;
    } else if (nodo.tipo === 'valor') {
      const valor = buscar(nodo.ruta, ambitos);
      if (valor === NO_ESTA || valor === null || valor === undefined) {
        throw new Error(`Plantilla: falta el dato "${nodo.ruta}"`);
      }
      if (typeof valor === 'object') throw new Error(`Plantilla: "${nodo.ruta}" no es un texto ni un numero`);
      salida += nodo.crudo ? String(valor) : escaparHtml(valor);
    } else if (nodo.tipo === 'parcial') {
      const parcial = parciales[nodo.nombre];
      if (parcial === undefined) throw new Error(`Plantilla: no existe el parcial "${nodo.nombre}"`);
      if (hondo >= HONDO_MAXIMO) throw new Error(`Plantilla: el parcial "${nodo.nombre}" se incluye demasiado hondo`);
      salida += pintarNodos(analizar(parcial), ambitos, parciales, hondo + 1);
    } else if (nodo.clase === 'cada') {
      const lista = buscar(nodo.ruta, ambitos);
      if (!Array.isArray(lista)) throw new Error(`Plantilla: "{{#cada ${nodo.ruta}}}" necesita una lista`);
      lista.forEach((elemento, indice) => {
        const campos = elemento !== null && typeof elemento === 'object' && !Array.isArray(elemento) ? elemento : {};
        const ambito = {
          ...campos,
          este: elemento,
          '@indice': indice,
          '@numero': indice + 1,
          '@primero': indice === 0,
          '@ultimo': indice === lista.length - 1,
        };
        salida += pintarNodos(nodo.hijos, [...ambitos, ambito], parciales, hondo);
      });
    } else if (esVerdadero(buscar(nodo.ruta, ambitos)) === (nodo.clase === 'si')) {
      salida += pintarNodos(nodo.hijos, ambitos, parciales, hondo);
    }
  }
  return salida;
}

/**
 * Pinta una plantilla con sus datos.
 * @param {string} plantilla
 * @param {Record<string, unknown>} datos
 * @param {Record<string, string>} [parciales]
 * @returns {string}
 */
export function pintar(plantilla, datos, parciales = {}) {
  return pintarNodos(analizar(plantilla), [datos], parciales, 0);
}
