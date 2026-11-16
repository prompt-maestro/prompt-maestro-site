// @ts-check
// La medicion de visitas (Umami: sin cookies y sin datos de nadie) se enciende con tres datos de sitio.json:
//   medicion.sitio   el identificador del sitio que da la cuenta
//   medicion.script  la direccion https del script de la cuenta
//   medicion.envio   el servidor https a donde ese script manda los eventos (se usa solo su origen)
// Mientras falte alguno, la pagina no lleva el script ni abre su politica de contenido a nadie. Con los tres, la
// etiqueta va SOLO en el dominio (la previa y la laptop no ensucian los numeros), la politica de contenido se abre
// justo a esos dos servidores y a ninguno mas, y la etiqueta le dice al script que mande a ese mismo servidor
// (data-host-url): asi el permiso y el destino salen del mismo dato y no pueden quedar disparejos.
// Es pura: herramientas/armado.mjs la usa al armar.

const IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Un nombre de servidor de verdad: letras, numeros y guiones, con su dominio. Sin comodines ni otros signos. */
const SERVIDOR = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * @param {unknown} texto
 * @returns {URL | null}  la direccion, solo si es https, a un servidor con nombre normal, sin puerto, usuario, clave,
 *   parametros ni ancla. Lo que no pase aqui nunca llega a la politica de contenido.
 */
function direccionSegura(texto) {
  if (typeof texto !== 'string' || !URL.canParse(texto)) return null;
  const direccion = new URL(texto);
  const limpia =
    direccion.protocol === 'https:' &&
    SERVIDOR.test(direccion.hostname) &&
    !direccion.port &&
    !direccion.username &&
    !direccion.password &&
    !direccion.search &&
    !direccion.hash;
  return limpia ? direccion : null;
}

/**
 * @typedef {Object} Medicion
 * @property {{ script: string, sitio: string, envio: string, dominios: string } | null} etiqueta  lo que lleva la
 *   etiqueta script: de donde baja, que sitio es, a donde manda y en que dominios cuenta
 * @property {string} cspScript  lo que se agrega a script-src de la politica de contenido ('' si no hay medicion)
 * @property {string} cspEnvio   lo que se agrega a connect-src
 * @property {string[]} problemas
 */

/**
 * @param {unknown} configuracion  sitio.medicion
 * @param {{ destino: 'publica' | 'previa', dominio: string }} donde
 * @returns {Medicion}
 */
export function medicionDe(configuracion, { destino, dominio }) {
  /** @type {Medicion} */
  const apagada = { etiqueta: null, cspScript: '', cspEnvio: '', problemas: [] };
  const { sitio, script, envio } = /** @type {Record<string, unknown>} */ (configuracion ?? {});
  // Sin cuenta todavia: nada que poner y nada que reclamar.
  if (!sitio && !script && !envio) return apagada;
  const deScript = direccionSegura(script);
  const deEnvio = direccionSegura(envio);
  /** @type {string[]} */
  const problemas = [];
  if (typeof sitio !== 'string' || !IDENTIFICADOR.test(sitio)) {
    problemas.push('sitio.json: medicion.sitio no tiene forma de identificador de Umami');
  }
  if (!deScript?.pathname.endsWith('.js')) {
    problemas.push('sitio.json: medicion.script debe ser la direccion https del script, sin parametros');
  }
  if (!deEnvio) problemas.push('sitio.json: medicion.envio debe ser un servidor https, sin parametros');
  if (problemas.length > 0 || !deScript || !deEnvio) return { ...apagada, problemas };
  // En la previa no se mide: ni etiqueta ni permisos.
  if (destino !== 'publica') return apagada;
  return {
    etiqueta: {
      script: deScript.href,
      sitio: String(sitio),
      envio: deEnvio.origin,
      // El script solo cuenta en estas direcciones, con y sin www: en cualquier otra (una copia, la laptop) no mide.
      dominios: `${dominio},www.${dominio}`,
    },
    cspScript: ` ${deScript.origin}`,
    cspEnvio: ` ${deEnvio.origin}`,
    problemas: [],
  };
}
