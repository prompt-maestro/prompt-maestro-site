// @ts-check
// La medicion de visitas (Umami, sin cookies) se enciende con cuatro datos de sitio.json:
//   medicion.sitio   el identificador del sitio que da la cuenta
//   medicion.script  el script de Umami, que es un archivo de ESTA pagina: una copia revisada en fuente/js/terceros/
//   medicion.huella  el SHA-256 de esa copia: si el archivo cambia sin que alguien lo vuelva a revisar, no se arma
//   medicion.envio   el servidor https a donde ese script manda los eventos (se usa solo su origen)
// El script se sirve desde la propia pagina y no desde el servidor de Umami: asi script-src se queda en 'self' y
// nadie de fuera puede cambiar el codigo que corre junto al boton que lleva a pagar. A Umami le llega, con cada visita
// y con cada evento de fuente/js/medicion.js, la direccion de la pagina (sin parametros ni ancla), de donde viene la
// visita, el idioma, el tamano de pantalla y el titulo; ademas de la IP y el navegador, que viajan en toda peticion.
// Mientras falten los cuatro, la pagina no lleva la etiqueta ni abre su politica de contenido a nadie. Con los cuatro,
// la etiqueta va SOLO en el dominio (la previa y la laptop no ensucian los numeros), la politica de contenido se abre
// justo a ese servidor de envio y a ninguno mas, y la etiqueta le dice al script que mande ahi mismo (data-host-url):
// asi el permiso y el destino salen del mismo dato y no pueden quedar disparejos.
// Es pura: herramientas/armado.mjs la usa al armar.
import { createHash } from 'node:crypto';

const IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Un nombre de servidor de verdad: letras, numeros y guiones, con su dominio. Sin comodines ni otros signos. */
const SERVIDOR = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
/** Donde vive el codigo que no escribimos nosotros, y como se llama: un archivo .js directo en esa carpeta. */
const DE_TERCEROS = /^js\/terceros\/[a-z0-9][a-z0-9.-]*\.js$/;
const HUELLA = /^[0-9a-f]{64}$/;
/** Los cuatro datos de la cuenta. Cualquier otro nombre es un dato mal escrito. */
const DATOS = ['sitio', 'script', 'huella', 'envio'];

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
    // Un nombre escrito con letras de otro alfabeto se ve igual y es otro servidor: llega aqui como "xn--".
    !direccion.hostname.split('.').some((parte) => parte.startsWith('xn--')) &&
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
 *   etiqueta script: de donde baja (de esta pagina), que sitio es, a donde manda y en que dominios cuenta
 * @property {string} cspEnvio   lo que se agrega a connect-src de la politica de contenido ('' si no hay medicion).
 *   A script-src no se le agrega nada, nunca: el script es de la casa.
 * @property {string[]} problemas
 */

/**
 * @param {unknown} configuracion  sitio.medicion
 * @param {object} donde
 * @param {'publica' | 'previa'} donde.destino
 * @param {string} donde.dominio
 * @param {string} donde.activos  la carpeta, con su huella, donde se sirve el codigo de la pagina
 * @param {ReadonlyMap<string, Buffer>} donde.propios  el codigo de la pagina: cada archivo por su ruta en esa carpeta
 * @returns {Medicion}
 */
export function medicionDe(configuracion, { destino, dominio, activos, propios }) {
  /** @type {Medicion} */
  const apagada = { etiqueta: null, cspEnvio: '', problemas: [] };
  // Sin cuenta todavia (no esta, o sus cuatro datos estan vacios): nada que poner y nada que reclamar. Cualquier otra
  // cosa que no sea la cuenta completa es un problema: una medicion mal escrita no se apaga callada.
  if (configuracion === undefined || configuracion === null) return apagada;
  if (typeof configuracion !== 'object' || Array.isArray(configuracion)) {
    return { ...apagada, problemas: ['sitio.json: medicion debe traer sitio, script, huella y envio'] };
  }
  const deMas = Object.keys(configuracion).filter((nombre) => !DATOS.includes(nombre));
  if (deMas.length > 0) {
    return {
      ...apagada,
      problemas: [`sitio.json: medicion trae un dato que no es de la cuenta (${deMas.join(', ')})`],
    };
  }
  const { sitio, script, huella, envio } = /** @type {Record<string, unknown>} */ (configuracion);
  if ([sitio, script, huella, envio].every((dato) => dato === undefined || dato === '')) return apagada;
  const deEnvio = direccionSegura(envio);
  const copia = typeof script === 'string' && DE_TERCEROS.test(script) ? propios.get(script) : undefined;
  /** @type {string[]} */
  const problemas = [];
  if (typeof sitio !== 'string' || !IDENTIFICADOR.test(sitio)) {
    problemas.push('sitio.json: medicion.sitio no tiene forma de identificador de Umami');
  }
  if (!copia) {
    problemas.push(
      'sitio.json: medicion.script debe ser un archivo de fuente/js/terceros/ (el script se sirve desde la pagina, nunca desde otro servidor)',
    );
  } else if (typeof huella !== 'string' || !HUELLA.test(huella)) {
    problemas.push('sitio.json: medicion.huella debe ser el SHA-256 del script revisado');
  } else if (createHash('sha256').update(copia).digest('hex') !== huella) {
    problemas.push(
      `fuente/${script}: no es la copia que se reviso (su SHA-256 no coincide con medicion.huella de sitio.json)`,
    );
  }
  if (!deEnvio) problemas.push('sitio.json: medicion.envio debe ser un servidor https, sin parametros');
  if (problemas.length > 0 || !deEnvio) return { ...apagada, problemas };
  // En la previa no se mide: ni etiqueta ni permisos.
  if (destino !== 'publica') return apagada;
  return {
    etiqueta: {
      script: `${activos}${script}`,
      sitio: String(sitio),
      envio: deEnvio.origin,
      // El script solo cuenta en estas direcciones, con y sin www: en cualquier otra (una copia, la laptop) no mide.
      dominios: `${dominio},www.${dominio}`,
    },
    cspEnvio: ` ${deEnvio.origin}`,
    problemas: [],
  };
}
