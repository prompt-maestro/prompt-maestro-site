// @ts-check
// Que oficios ensena la pagina. Cada oficio de fuente/datos/giros.json lleva su interruptor "aLaVenta": la pagina solo
// arma los que dicen true. Los demas (hoy, dentistas y medicos) se quedan guardados en la fuente con todo lo suyo (sus
// textos, su guion, sus fotos y sus videos), pero no se ensenan ni viajan al sitio. Encender uno es cambiar ese dato,
// sin tocar el diseno ni el codigo.
//
// Lo que es de un solo oficio fuera de giros.json lleva "solo": la lista de oficios con los que se ensena (una
// pregunta, un compromiso de "Asi cuidamos", la nota de la cedula). Sin "solo", es de todos. Una clave de "solo" que no
// esta en giros.json detiene la armada: una errata no puede esconder algo para siempre.
//
// Encender un segundo oficio pide, ademas del dato, revisar los textos que hoy nombran a uno solo (README, "Sumar o
// encender un oficio").

/**
 * @typedef {object} Oficio
 * @property {string} clave
 * @property {boolean} aLaVenta
 */

/**
 * Las claves de los oficios a la venta, en el orden de giros.json. Se detiene si a un oficio le falta el interruptor
 * o si ninguno esta a la venta: una pagina sin oficio no se arma.
 * @param {unknown} giros
 * @returns {Set<string>}
 */
export function clavesALaVenta(giros) {
  if (!Array.isArray(giros) || giros.length === 0) throw new Error('giros.json: no hay ningun oficio');
  /** @type {Set<string>} */
  const claves = new Set();
  for (const giro of /** @type {Oficio[]} */ (giros)) {
    if (typeof giro.aLaVenta !== 'boolean') {
      throw new Error(`giros.json: al oficio "${giro.clave}" le falta "aLaVenta" (true o false)`);
    }
    if (giro.aLaVenta) claves.add(giro.clave);
  }
  if (claves.size === 0) throw new Error('giros.json: ningun oficio esta a la venta');
  return claves;
}

/**
 * Si algo se ensena con los oficios a la venta: lo que no lleva "solo" es de todos; lo que lo lleva, solo si alguno de
 * sus oficios esta a la venta.
 * @param {{ solo?: string[] }} cosa
 * @param {Set<string>} claves
 */
export function seEnsena(cosa, claves) {
  return !cosa.solo || cosa.solo.some((clave) => claves.has(clave));
}

/**
 * El nombre de un recurso dice de que oficio es cuando empieza con su clave y un guion ("comercial/medico-escena.mp4",
 * "retratos/dentista-retrato-480.webp"). Lo que no empieza con la clave de ningun oficio es de todos.
 * @param {string} ruta  la ruta del recurso dentro de fuente/recursos, con diagonal normal
 * @param {string[]} guardados  las claves de los oficios que NO estan a la venta
 */
export function esDeUnGuardado(ruta, guardados) {
  const nombre = ruta.slice(ruta.lastIndexOf('/') + 1);
  return guardados.some((clave) => nombre.startsWith(`${clave}-`));
}

/**
 * Que cada clave de "solo" sea un oficio de giros.json.
 * @param {unknown} solo
 * @param {Set<string>} todos  las claves de giros.json
 * @param {string} donde  para el mensaje
 */
function revisarSolo(solo, todos, donde) {
  if (solo === undefined) return;
  if (!Array.isArray(solo) || solo.length === 0) throw new Error(`${donde}: "solo" debe ser una lista de oficios`);
  for (const clave of solo) {
    if (!todos.has(clave)) throw new Error(`${donde}: "solo" nombra "${clave}", que no es un oficio de giros.json`);
  }
}

/**
 * Los datos de la pagina con solo lo que se ensena: los oficios a la venta (en giros.json y en el corto), las
 * preguntas y los compromisos que son de ellos, y la nota de la cedula solo si alguno la pide. No cambia los datos que
 * recibe: devuelve otros.
 * @param {Record<string, any>} datos  los datos tal como se leen de fuente/datos
 * @returns {{ datos: Record<string, any>, claves: Set<string>, guardados: string[] }}
 */
export function soloLoQueSeVende(datos) {
  const claves = clavesALaVenta(datos.giros);
  const todos = new Set(/** @type {Oficio[]} */ (datos.giros).map((giro) => giro.clave));
  /** @type {{ clave: string }[]} */
  const escenas = datos.corto?.oficios ?? [];
  // Guardado es todo oficio que no esta a la venta, tambien el que solo tiene su escena en el corto (sus fotos y su
  // video ya pueden estar en fuente/recursos): nada suyo viaja.
  const guardados = [...new Set([...todos, ...escenas.map((oficio) => oficio.clave)])].filter(
    (clave) => !claves.has(clave),
  );
  for (const [lugar, pregunta] of (Array.isArray(datos.preguntas) ? datos.preguntas : []).entries()) {
    revisarSolo(pregunta.solo, todos, `preguntas.json (${lugar + 1})`);
  }
  for (const [lugar, uno] of (datos.agentes?.cuida?.lista ?? []).entries()) {
    revisarSolo(uno.solo, todos, `agentes.json, cuida (${lugar + 1})`);
  }
  revisarSolo(datos.secciones?.planes?.requisitosNotaSolo, todos, 'secciones.json, planes.requisitosNotaSolo');
  /** @param {{ solo?: string[] }[]} lista */
  const deEstos = (lista) => lista.filter((cosa) => seEnsena(cosa, claves));
  const salida = { ...datos };
  salida.giros = /** @type {Oficio[]} */ (datos.giros).filter((giro) => claves.has(giro.clave));
  if (datos.corto) {
    const oficios = escenas.filter((oficio) => claves.has(oficio.clave));
    for (const clave of claves) {
      if (!oficios.some((oficio) => oficio.clave === clave)) {
        throw new Error(`corto.json: al oficio "${clave}" (a la venta) le falta su escena`);
      }
    }
    salida.corto = { ...datos.corto, oficios };
  }
  if (Array.isArray(datos.preguntas)) salida.preguntas = deEstos(datos.preguntas);
  if (datos.agentes?.cuida) {
    salida.agentes = { ...datos.agentes, cuida: { ...datos.agentes.cuida, lista: deEstos(datos.agentes.cuida.lista) } };
  }
  const planes = datos.secciones?.planes;
  if (planes?.requisitosNota) {
    const nota = seEnsena({ solo: planes.requisitosNotaSolo }, claves) ? planes.requisitosNota : '';
    salida.secciones = { ...datos.secciones, planes: { ...planes, requisitosNota: nota } };
  }
  return { datos: salida, claves, guardados };
}
