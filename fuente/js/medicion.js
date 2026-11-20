// @ts-check
// La medicion, sin tocar la pagina: que eventos existen, que propiedades lleva cada uno y que valores se aceptan.
// Cada evento se arma con datos sueltos y se valida contra un vocabulario cerrado: un dato que no esta en la lista
// tira el evento entero, porque es mejor no medir que mandar algo inesperado. Ninguna propiedad lleva lo que la
// persona escribio, ni el texto de un error, ni una direccion completa. (A cada visita y a cada evento, el script de
// Umami le agrega por su cuenta la direccion de la pagina, sin parametros ni ancla, de donde viene la visita, el
// idioma, el tamano de pantalla y el titulo.) Los escuchas los pone medicion-vista.js.

/** Un evento ya armado: su nombre fijo y, si lleva, sus propiedades. @typedef {{ nombre: string, propiedades?: Record<string, string | number> }} Medida */
/** Lo que el script de Umami deja en window.umami. @typedef {{ track: (nombre: string, propiedades?: Record<string, string | number>) => unknown }} Rastreador */

/** Los ejemplos de la demostracion. Sumar un oficio a datos/giros.json pide sumarlo aqui: una prueba lo recuerda. */
export const GIROS = /** @type {const} */ (['unas', 'dentista', 'medico']);
/** Los pasos de la historia que se miden. El reposo, los dos finales y el cuadro final no son pasos: tienen su evento o ninguno. */
export const PASOS = /** @type {const} */ (['precio', 'horarios', 'apartado', 'pagado', 'recordatorios', 'asistencia']);
/** Como arranco la demostracion: la persona la toco, o arranco sola. */
export const MODOS = /** @type {const} */ (['toque', 'sola']);
/**
 * Los data-lugar de la pagina: donde esta el enlace que se toco. "pelicula" es el inicio (el cartel del corto): conserva
 * el nombre con el que ya se venia midiendo, para que la cuenta de antes y la de ahora sean la misma serie.
 */
export const LUGARES = /** @type {const} */ ([
  'barra',
  'barra-movil',
  'pelicula',
  'citas',
  'demo',
  'agente',
  'para-quien',
  'planes',
  'cierre',
  'pie',
]);
/** A donde llevan los botones de empezar. Es el mismo valor de datos/sitio.json: una prueba lo cuida. */
export const ALTA = 'https://alta.prompt-maestro.com/';

/** El nombre de un plan, ya en minusculas: palabras de letras y numeros, sin signos. */
const NOMBRE_DE_PLAN = /^[\p{Ll}\d]+(?: [\p{Ll}\d]+)*$/u;
const LARGO_DE_PLAN = 24;
/** El nombre de un archivo: letras, numeros, guiones y puntos, con su extension. */
const NOMBRE_DE_ARCHIVO = /^[\w-]+(?:\.[\w-]+)+$/;
const LARGO_DE_ARCHIVO = 60;

/**
 * El valor, solo si esta en la lista.
 * @template {string} T
 * @param {readonly T[]} lista
 * @param {unknown} valor
 * @returns {T | null}
 */
function deLaLista(lista, valor) {
  return lista.find((uno) => uno === valor) ?? null;
}

/**
 * @param {unknown} valor
 * @returns {valor is number}  si es un entero de 1 en adelante
 */
function esPosicion(valor) {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 1;
}

/**
 * La demostracion salio del reposo.
 * @param {{ giro?: unknown, modo?: unknown } | null | undefined} datos
 * @returns {Medida | null}
 */
export function demoInicio(datos) {
  const giro = deLaLista(GIROS, datos?.giro);
  const modo = deLaLista(MODOS, datos?.modo);
  return giro && modo ? { nombre: 'demo_inicio', propiedades: { giro, modo } } : null;
}

/**
 * La historia llego a un paso.
 * @param {{ giro?: unknown, paso?: unknown } | null | undefined} datos
 * @returns {Medida | null}
 */
export function demoPaso(datos) {
  const giro = deLaLista(GIROS, datos?.giro);
  const paso = deLaLista(PASOS, datos?.paso);
  return giro && paso ? { nombre: 'demo_paso', propiedades: { giro, paso } } : null;
}

/**
 * La historia llego a uno de sus dos finales. "asistio" llega como verdadero o falso y sale como "si" o "no".
 * @param {{ giro?: unknown, asistio?: unknown } | null | undefined} datos
 * @returns {Medida | null}
 */
export function demoFin(datos) {
  const giro = deLaLista(GIROS, datos?.giro);
  if (!giro || typeof datos?.asistio !== 'boolean') return null;
  return { nombre: 'demo_fin', propiedades: { giro, asistio: datos.asistio ? 'si' : 'no' } };
}

/**
 * La persona puso otro ejemplo en la demostracion.
 * @param {{ giro?: unknown } | null | undefined} datos
 * @returns {Medida | null}
 */
export function ejemploCambio(datos) {
  const giro = deLaLista(GIROS, datos?.giro);
  return giro ? { nombre: 'ejemplo_cambio', propiedades: { giro } } : null;
}

/**
 * Un clic en un enlace. Solo cuentan dos: el que lleva al alta (clic_empieza) y el de correo (clic_acompanar), y solo
 * si el enlace dice en que lugar de la pagina esta. "plan" es el nombre de la tarjeta de plan que lo contiene, si esta
 * dentro de una; del correo no sale nada: ni la direccion ni el asunto.
 * @param {{ href?: unknown, lugar?: unknown, plan?: unknown } | null | undefined} datos
 * @returns {Medida | null}
 */
export function clicEnEnlace(datos) {
  const lugar = deLaLista(LUGARES, datos?.lugar);
  const href = datos?.href;
  if (!lugar || typeof href !== 'string') return null;
  if (href === ALTA) {
    const plan = datos?.plan;
    if (plan === undefined || plan === null) return { nombre: 'clic_empieza', propiedades: { lugar } };
    const nombre = typeof plan === 'string' ? plan.trim().toLowerCase() : '';
    if (nombre.length > LARGO_DE_PLAN || !NOMBRE_DE_PLAN.test(nombre)) return null;
    return { nombre: 'clic_empieza', propiedades: { lugar, plan: nombre } };
  }
  if (href.startsWith('mailto:')) return { nombre: 'clic_acompanar', propiedades: { lugar } };
  return null;
}

/**
 * Se abrio una pregunta. "id" es su posicion en la lista, empezando en 1.
 * @param {{ id?: unknown } | null | undefined} datos
 * @returns {Medida | null}
 */
export function preguntaAbre(datos) {
  const id = datos?.id;
  return esPosicion(id) ? { nombre: 'pregunta_abre', propiedades: { id } } : null;
}

/**
 * De la direccion de un archivo, solo su nombre: sin sitio, sin carpetas y sin parametros.
 * @param {unknown} url  una direccion completa, como la que trae un error de JavaScript
 * @returns {string | null}  "demo-vista.js", o null si de ahi no sale un nombre de archivo
 */
export function archivoDe(url) {
  if (typeof url !== 'string') return null;
  let direccion;
  try {
    direccion = new URL(url);
  } catch {
    return null;
  }
  if (direccion.protocol !== 'https:' && direccion.protocol !== 'http:') return null;
  const nombre = direccion.pathname.slice(direccion.pathname.lastIndexOf('/') + 1);
  return nombre.length <= LARGO_DE_ARCHIVO && NOMBRE_DE_ARCHIVO.test(nombre) ? nombre : null;
}

/**
 * Un error de JavaScript: en que archivo y en que linea. Nunca el mensaje, que puede traer cualquier cosa.
 * @param {{ archivo?: unknown, linea?: unknown } | null | undefined} datos  la direccion del archivo y la linea, como las da el navegador
 * @returns {Medida | null}
 */
export function errorJs(datos) {
  const archivo = archivoDe(datos?.archivo);
  const linea = datos?.linea;
  return archivo && esPosicion(linea) ? { nombre: 'error_js', propiedades: { archivo, linea } } : null;
}

/**
 * Un tope por visita para lo que podria repetirse sin fin (un error dentro de un ciclo): cada clave pasa una sola
 * vez y, en total, pasan hasta "tope" claves distintas.
 * @param {number} tope
 * @returns {(clave: string) => boolean}  dice si esa clave pasa
 */
export function conTope(tope) {
  /** @type {Set<string>} */
  const vistas = new Set();
  return (clave) => {
    if (vistas.has(clave) || vistas.size >= tope) return false;
    vistas.add(clave);
    return true;
  };
}

/**
 * Manda un evento ya armado, si hay a quien. Sin rastreador (su script no esta o lo bloquearon) o sin evento (no paso
 * la validacion) no hace nada. Nunca lanza un error, ni de inmediato ni despues: medir no puede tumbar la pagina.
 * Sin colas ni reintentos: lo que no se pudo mandar, se pierde.
 * @param {unknown} rastreador  lo que haya en window.umami
 * @param {Medida | null} medida
 * @returns {boolean}  si se le entrego al rastreador
 */
export function mandar(rastreador, medida) {
  if (!medida) return false;
  try {
    const umami = /** @type {Partial<Rastreador> | null | undefined} */ (rastreador);
    if (typeof umami?.track !== 'function') return false;
    const respuesta = medida.propiedades ? umami.track(medida.nombre, medida.propiedades) : umami.track(medida.nombre);
    // El rastreador contesta con una promesa: si se rompe (sin red), tampoco hace ruido.
    Promise.resolve(respuesta).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
