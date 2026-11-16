// @ts-check
// Que cambia en la rama main (la pagina en vivo) al publicar. Es pura: recibe lo que hoy hay en main y lo que salio de
// la armada, y contesta que se escribe, que se conserva y que se retira. La usa herramientas/publicar.mjs.

/**
 * Lo que hoy vive en main y la pagina nueva no arma. Son las paginas legales de marzo: se quedan tal cual hasta que
 * la actividad de las legales nuevas las reemplace (decision del dueno).
 */
export const SE_CONSERVAN = ['terminos.html', 'privacidad.html', 'reembolso.html', 'legal.css'];

/** Sin esto GitHub Pages no sirve el dominio o la pagina queda sin entrada: la armada tiene que traerlo siempre. */
export const INDISPENSABLES = ['index.html', '404.html', 'CNAME', '.nojekyll'];

/**
 * Las carpetas con huella (a/<huella>/ y r/<huella>/) que un HTML usa. Sirve para saber cuales necesita todavia quien
 * tiene abierta, o guardada en su navegador, la pagina de la publicacion anterior.
 * @param {string} html
 * @returns {string[]}  por ejemplo ["a/98828ce54f", "r/c3f45bd49c"]
 */
export function carpetasConHuella(html) {
  const halladas = new Set();
  for (const [, carpeta] of html.matchAll(/["'(=\s]\/?((?:a|r)\/[0-9a-f]{10})\//g)) {
    if (carpeta) halladas.add(carpeta);
  }
  return [...halladas].sort();
}

/**
 * @typedef {Object} Plan
 * @property {string[]} escribir   todo lo armado: entra tal cual
 * @property {string[]} conservar  lo de main que se queda (legales y los recursos de la publicacion anterior)
 * @property {string[]} retirar    lo de main que se va
 */

/**
 * @param {{ enMain: string[], inicioDeMain: string | null, armado: string[] }} entrada
 *   enMain: las rutas que hoy tiene main; inicioDeMain: su index.html de hoy (null si no hay); armado: las rutas nuevas
 * @returns {Plan}
 */
export function planDePublicacion({ enMain, inicioDeMain, armado }) {
  const nuevo = new Set(armado);
  for (const ruta of INDISPENSABLES) {
    if (!nuevo.has(ruta)) throw new Error(`Publicar: a la armada le falta ${ruta}`);
  }
  for (const ruta of SE_CONSERVAN) {
    if (nuevo.has(ruta)) throw new Error(`Publicar: la armada trae ${ruta}, que es de las legales que se conservan`);
  }
  // La publicacion anterior sigue viva un rato en los navegadores: sus carpetas con huella se quedan una vuelta mas.
  const anteriores = inicioDeMain ? carpetasConHuella(inicioDeMain) : [];
  const esDeLaAnterior = (/** @type {string} */ ruta) => anteriores.some((carpeta) => ruta.startsWith(`${carpeta}/`));

  /** @type {string[]} */
  const conservar = [];
  /** @type {string[]} */
  const retirar = [];
  for (const ruta of [...new Set(enMain)].sort()) {
    if (nuevo.has(ruta)) continue;
    if (SE_CONSERVAN.includes(ruta) || esDeLaAnterior(ruta)) conservar.push(ruta);
    else retirar.push(ruta);
  }
  for (const ruta of SE_CONSERVAN) {
    if (!conservar.includes(ruta)) throw new Error(`Publicar: main ya no trae ${ruta} y la pagina nueva la enlaza`);
  }
  return { escribir: [...nuevo].sort(), conservar, retirar };
}

/**
 * A donde manda la pagina a la gente: cada direccion de fuera (https y correo) que aparece en un enlace, una vez.
 * Se imprime antes de publicar para leerla con los ojos: ahi esta el boton que lleva a pagar.
 * @param {string} html
 * @returns {string[]}
 */
export function enlacesHaciaFuera(html) {
  const enlaces = new Set();
  for (const [, destino] of html.matchAll(/<a\b[^>]*\shref="((?:https?:|mailto:)[^"]*)"/g)) {
    if (destino) enlaces.add(destino.replaceAll('&amp;', '&'));
  }
  return [...enlaces].sort();
}

/**
 * De la direccion del remoto, "duena/repo" en GitHub (o null si no es de GitHub).
 * @param {string} remoto  "https://github.com/duena/repo.git" o "git@github.com:duena/repo.git"
 * @returns {string | null}
 */
export function repoDeGitHub(remoto) {
  return (
    /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remoto.trim())?.[1] ?? null
  );
}

/**
 * Lo que GitHub dice de las revisiones automaticas de un commit: solo vale si hay al menos una, todas terminaron y
 * todas salieron bien. Sin revisiones no hay verde: un commit que nadie reviso no se publica.
 * @param {unknown} corridas  el arreglo check_runs de la API de GitHub
 * @returns {{ enVerde: boolean, porque: string }}
 */
export function revisionEnVerde(corridas) {
  if (!Array.isArray(corridas) || corridas.length === 0) return { enVerde: false, porque: 'no hay ninguna revision' };
  for (const corrida of corridas) {
    const { name, status, conclusion } = /** @type {Record<string, unknown>} */ (corrida ?? {});
    if (status !== 'completed') return { enVerde: false, porque: `"${name}" todavia no termina` };
    if (conclusion !== 'success') return { enVerde: false, porque: `"${name}" termino en ${conclusion}` };
  }
  return { enVerde: true, porque: '' };
}
