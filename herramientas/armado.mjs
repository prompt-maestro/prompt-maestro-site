// @ts-check
// Arma el sitio en memoria: une plantillas y datos y devuelve cada archivo con su contenido. No escribe nada en disco
// (eso lo hace armar.mjs), asi se puede probar y comparar sin tocar la carpeta de salida.
//
// El resultado es siempre el mismo para la misma fuente: no lleva fechas ni nada que cambie de una armada a otra.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { conversacionDeEjemplo, fichaDe, historiaDe, presentacionDe, reposoDe } from '../fuente/js/demo.js';
import { pesos } from '../fuente/js/redaccion.js';
import { achicarCss } from './achicar.mjs';
import { problemasDeBeneficios } from './beneficios.mjs';
import { datosEstructurados, jsonParaScript, llmsTxt, robots, sitemap, TOPES } from './buscadores.mjs';
import { guionesEn, revisarEnlacesInternos, revisarGuiones } from './comprobaciones.mjs';
import { medicionDe } from './medicion.mjs';
import { planesParaPagina, planesPublicos } from './planes.mjs';
import { pintar } from './plantilla.mjs';

/** @typedef {'publica' | 'previa'} Destino */
/** @typedef {import('../fuente/js/demo.js').Ejemplo} Ejemplo */

/** Donde se sirve cada armada. La previa vive en una carpeta de github.io, por eso todo enlace interno lleva la base. */
export const DESTINOS = /** @type {const} */ ({
  publica: { base: '/', origen: 'https://prompt-maestro.com', carpeta: 'dist' },
  previa: { base: '/pagina-previa/', origen: 'https://prompt-maestro.github.io', carpeta: 'dist-previa' },
});

const DOMINIO = 'prompt-maestro.com';
/** La hoja en que se unen los estilos de la pagina. Es la unica que viaja achicada. */
const HOJA_UNIDA = 'estilos/pagina.css';
/**
 * A donde llevan los botones de empezar: ahi se paga. Es una constante del codigo y no solo un dato: si alguien
 * cambia sitio.json a otra direccion (un dominio parecido, http), la armada se detiene.
 */
export const ALTA = 'https://alta.prompt-maestro.com/';

/**
 * Lo unico que puede haber en cada carpeta de fuente/. Lo armado va a un sitio publico: un archivo de cualquier otro
 * tipo (una nota, un .env, un original pesado) detiene la armada en lugar de publicarse sin querer.
 * @type {Record<string, RegExp>}
 */
export const PERMITIDOS = {
  estilos: /\.(css|json)$/,
  // En js/terceros/ vive el codigo que no escribimos nosotros (el script de la medicion), con su licencia al lado.
  js: /\.js$|^terceros\/[^/]+\.txt$/,
  recursos: /\.(woff2|txt|avif|webp|png|jpg|svg|mp4|webm)$/,
  raiz: /\.(svg|png|jpg|ico|txt|xml|webmanifest)$/,
  plantillas: /\.html$/,
  datos: /\.json$/,
};

/**
 * Los archivos de una carpeta de fuente/, con ruta relativa y diagonal normal, en orden fijo. Lo que no es de un tipo
 * permitido, o empieza con punto, se anota como problema y no se lee.
 * @param {string} fuente
 * @param {keyof typeof PERMITIDOS} carpeta
 * @param {string[]} problemas
 * @returns {Promise<string[]>}
 */
async function listar(fuente, carpeta, problemas) {
  const raiz = path.join(fuente, carpeta);
  /** @type {import('node:fs').Dirent[]} */
  let entradas;
  try {
    entradas = await readdir(raiz, { withFileTypes: true, recursive: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return [];
    throw error;
  }
  const permitido = /** @type {RegExp} */ (PERMITIDOS[carpeta]);
  /** @type {string[]} */
  const rutas = [];
  for (const entrada of entradas) {
    if (!entrada.isFile()) continue;
    const ruta = path.relative(raiz, path.join(entrada.parentPath, entrada.name)).split(path.sep).join('/');
    if (ruta.split('/').some((parte) => parte.startsWith('.')) || !permitido.test(ruta)) {
      problemas.push(`fuente/${carpeta}/${ruta}: ese tipo de archivo no va en esta carpeta (lo armado es publico)`);
    } else {
      rutas.push(ruta);
    }
  }
  return rutas.sort();
}

/**
 * Los datos de fuente/datos: cada archivo .json queda con su nombre, y los de una subcarpeta, dentro de un objeto con
 * el nombre de la subcarpeta (datos/guiones/unas.json es guiones.unas).
 * @param {string} fuente
 * @param {string[]} problemas
 * @returns {Promise<Record<string, unknown>>}
 */
async function leerDatos(fuente, problemas) {
  /** @type {Record<string, unknown>} */
  const datos = {};
  for (const ruta of await listar(fuente, 'datos', problemas)) {
    const valor = JSON.parse(await readFile(path.join(fuente, 'datos', ruta), 'utf8'));
    const partes = ruta.slice(0, -'.json'.length).split('/');
    const nombre = /** @type {string} */ (partes.pop());
    /** @type {Record<string, unknown>} */
    let nivel = datos;
    for (const parte of partes) {
      nivel[parte] ??= {};
      nivel = /** @type {Record<string, unknown>} */ (nivel[parte]);
    }
    nivel[nombre] = valor;
  }
  return datos;
}

/**
 * Los estilos. Los que nombra estilos/orden.json se unen, en ese orden, en una sola hoja (pagina.css): un solo viaje
 * para el telefono. Cualquier otra hoja se copia aparte, y las de estilos/previa/ solo viajan a la previa. Aqui se
 * leen tal cual estan escritas; la hoja unida se achica despues, ya con las rutas de sus recursos.
 * @param {string} fuente
 * @param {Destino} destino
 * @param {string[]} problemas
 * @returns {Promise<[string, Buffer][]>}
 */
async function leerEstilos(fuente, destino, problemas) {
  const carpeta = path.join(fuente, 'estilos');
  /** @type {string[]} */
  const orden = JSON.parse(await readFile(path.join(carpeta, 'orden.json'), 'utf8'));
  /** @type {Buffer[]} */
  const unidas = [];
  for (const nombre of orden) unidas.push(await readFile(path.join(carpeta, nombre)));
  /** @type {[string, Buffer][]} */
  const salida = [[HOJA_UNIDA, Buffer.concat(unidas)]];
  for (const ruta of await listar(fuente, 'estilos', problemas)) {
    if (ruta === 'orden.json' || orden.includes(ruta)) continue;
    if (ruta.startsWith('previa/') && destino !== 'previa') continue;
    if (!ruta.endsWith('.css')) problemas.push(`fuente/estilos/${ruta}: en estilos solo van hojas .css y orden.json`);
    else salida.push([`estilos/${ruta}`, await readFile(path.join(carpeta, ruta))]);
  }
  return salida;
}

/**
 * @param {[string, Buffer][]} activos
 * @returns {string} diez letras que cambian si cambia cualquiera de esos archivos
 */
function huellaDe(activos) {
  const huella = createHash('sha256');
  for (const [ruta, contenido] of activos) huella.update(`${ruta}\0`).update(contenido);
  return huella.digest('hex').slice(0, 10);
}

/**
 * Todo lo que la demostracion puede llegar a decir con un ejemplo: su historia entera, toma por toma y con sus dos
 * finales (lo que se dice en la conversacion, el letrero, las tarjetas de lo que le llega a la profesional y la hora
 * de cada cosa), y lo que la pagina dice de el fuera del celular. Si algun texto deja un hueco sin llenar, truena
 * aqui, al armar, y no en el telefono de una visitante.
 * @param {Ejemplo} ejemplo
 * @returns {string[]}
 */
function textosDe(ejemplo) {
  const { giro, rotulos } = ejemplo;
  const textos = new Set(Object.values(rotulos).filter((texto) => !/[{}]/.test(texto)));
  textos.add(giro.nombre);
  for (const texto of Object.values(fichaDe(ejemplo))) textos.add(texto);
  for (const telefono of /** @type {const} */ (['cliente', 'profesional'])) {
    for (const texto of Object.values(presentacionDe(ejemplo, telefono))) textos.add(texto);
  }
  for (const asistio of [true, false]) {
    const tomas = historiaDe(ejemplo, asistio);
    if (tomas.at(-1)?.cuadro.paso !== 'cierre') {
      throw new Error(`Demostracion: el ejemplo "${giro.clave}" no llega al cierre`);
    }
    for (const toma of tomas) {
      // El agente redactando y el cierre no dicen nada: lo suyo va en el letrero.
      if (toma.tipo !== 'escribe' && toma.tipo !== 'cierre') textos.add(toma.texto);
      const { cuadro, liga } = toma;
      const dichos = [
        toma.hora,
        toma.lector,
        toma.detalle,
        toma.monto,
        toma.boton,
        liga?.titulo,
        liga?.monto,
        liga?.sitio,
      ];
      const vistos = [
        cuadro.rotulo,
        cuadro.letrero,
        cuadro.reloj,
        cuadro.cita.titulo,
        cuadro.cita.detalle,
        cuadro.pago.titulo,
        cuadro.pago.detalle,
        cuadro.asistencia.titulo,
      ];
      for (const texto of [...dichos, ...vistos]) if (texto !== undefined) textos.add(texto);
    }
  }
  return [...textos];
}

/**
 * Los ejemplos de la demostracion: cada giro con su guion, en el orden en que se eligen. Se detiene si a un giro le
 * falta el guion, si dos llevan la misma clave o si alguna frase de CUALQUIERA de ellos queda vacia o con un hueco sin
 * llenar, y anota como problema cualquier guion largo en lo que el JavaScript va a pintar.
 * @param {Record<string, unknown>} datos
 * @param {string[]} problemas
 */
function prepararDemo(datos, problemas) {
  // La tarjeta de "Para quien" de cada giro la pinta la plantilla: a la demostracion no le hace falta y no viaja en
  // sus datos.
  const giros = /** @type {(import('../fuente/js/demo.js').Giro & { tarjeta?: unknown })[]} */ (datos.giros).map(
    ({ tarjeta: _tarjeta, ...giro }) => giro,
  );
  const guiones = /** @type {Record<string, import('../fuente/js/demo.js').Guion>} */ (datos.guiones);
  const { fijos, momentos, finales, rotulos } = /** @type {Omit<Ejemplo, 'giro' | 'guion'>} */ (datos.demo);
  const ejemplos = giros.map((giro) => {
    const guion = guiones[giro.clave];
    if (!guion) throw new Error(`Demostracion: al ejemplo "${giro.clave}" le falta su guion`);
    return { giro, guion };
  });
  // El selector distingue los ejemplos por su clave.
  if (new Set(giros.map((giro) => giro.clave)).size !== giros.length) {
    throw new Error('Demostracion: dos ejemplos llevan la misma clave');
  }
  for (const ejemplo of ejemplos) {
    for (const texto of textosDe({ ...ejemplo, fijos, momentos, finales, rotulos })) {
      if (!texto) throw new Error(`Demostracion: al ejemplo "${ejemplo.giro.clave}" le falta un texto`);
      for (const hallazgo of guionesEn(texto)) problemas.push(`demostracion (${ejemplo.giro.clave}): ${hallazgo}`);
    }
  }
  const primero = ejemplos[0];
  if (!primero) throw new Error('Demostracion: no hay ningun ejemplo');
  const completo = { ...primero, fijos, momentos, finales, rotulos };
  const pago = historiaDe(completo).find((toma) => toma.tipo === 'hoja');
  return {
    // Los datos viajan dentro de la pagina como JSON (no es un script que se ejecute). El "<" se escribe por su
    // codigo para que ningun texto pueda cerrar la etiqueta.
    json: jsonParaScript({ ejemplos, fijos, momentos, finales, rotulos }),
    // Lo que la pagina trae ya escrito antes de que cargue el JavaScript: el primer ejemplo, en reposo.
    ejemplo: {
      clave: primero.giro.clave,
      ...presentacionDe(completo, 'cliente'),
      ...fichaDe(completo),
      reposo: reposoDe(completo),
      pago: { monto: pago?.monto ?? '', detalle: pago?.detalle ?? '' },
    },
    conversacion: conversacionDeEjemplo(completo),
  };
}

/**
 * @param {object} opciones
 * @param {string} opciones.raiz  la carpeta del repo (la que contiene fuente/)
 * @param {Destino} opciones.destino
 * @returns {Promise<{ archivos: Map<string, Buffer>, problemas: string[], avisos: string[] }>}
 */
export async function armarSitio({ raiz, destino }) {
  const fuente = path.join(raiz, 'fuente');
  const { base, origen } = DESTINOS[destino];
  /** @type {Map<string, Buffer>} */
  const archivos = new Map();
  /** @type {string[]} */
  const problemas = [];
  /** @type {string[]} */
  const avisos = [];

  // 1. Lo que no es HTML va en carpetas con la huella de su contenido: si algo cambia, cambia la direccion, y ningun
  //    telefono se queda con una hoja de estilos vieja. Son dos carpetas: los recursos (tipografias, imagenes, video),
  //    que pesan y casi nunca cambian, y el codigo (estilos y scripts). Corregir un estilo no vuelve a bajar un video.
  /** @type {[string, Buffer][]} */
  const recursos = [];
  for (const ruta of await listar(fuente, 'recursos', problemas)) {
    recursos.push([ruta, await readFile(path.join(fuente, 'recursos', ruta))]);
  }
  const carpetaRecursos = `${base}r/${huellaDe(recursos)}/`;
  /** @type {[string, Buffer][]} */
  const codigo = [];
  for (const [ruta, contenido] of await leerEstilos(fuente, destino, problemas)) {
    // Las hojas piden sus recursos con "../recursos/"; al armar, esa ruta se vuelve la carpeta con huella.
    const hoja = contenido.toString('utf8').replaceAll('../recursos/', carpetaRecursos);
    // La hoja unida viaja sin comentarios ni espacios de sobra: pesa menos y significa lo mismo.
    codigo.push([ruta, Buffer.from(ruta === HOJA_UNIDA ? achicarCss(hoja) : hoja, 'utf8')]);
  }
  for (const ruta of await listar(fuente, 'js', problemas)) {
    codigo.push([`js/${ruta}`, await readFile(path.join(fuente, 'js', ruta))]);
  }
  const carpetaCodigo = `${base}a/${huellaDe(codigo)}/`;
  for (const [ruta, contenido] of recursos) archivos.set(carpetaRecursos.slice(base.length) + ruta, contenido);
  for (const [ruta, contenido] of codigo) archivos.set(carpetaCodigo.slice(base.length) + ruta, contenido);
  for (const ruta of await listar(fuente, 'raiz', problemas)) {
    archivos.set(ruta, await readFile(path.join(fuente, 'raiz', ruta)));
  }

  // 2. Los datos.
  const datos = await leerDatos(fuente, problemas);
  const planes = planesPublicos(datos.planes);
  const sitio = /** @type {Record<string, unknown>} */ (datos.sitio);
  const demo = prepararDemo(datos, problemas);
  // Los capitulos de "Tu agente" y sus mini videos: que la plantilla sepa dibujar cada paso y que duren lo que deben.
  problemas.push(...problemasDeBeneficios(/** @type {any} */ (datos.agentes)?.capitulos));
  if (planes.dePrueba) {
    avisos.push('Los planes traen PRECIOS DE PRUEBA: esta armada no se puede publicar en el dominio.');
  }
  if (sitio.contactoProbado !== true) {
    avisos.push('El canal de contacto todavia no esta probado: esta armada no se puede publicar en el dominio.');
  }
  if (sitio.legalesConfirmadas !== true) {
    // Con la medicion puesta, el aviso de privacidad tiene que nombrarla: quien confirme las legales lo lee aqui.
    const conMedicion = Boolean(/** @type {any} */ (sitio.medicion)?.sitio);
    avisos.push(
      `Las paginas legales del dominio (terminos y privacidad) no estan confirmadas contra la pagina nueva${
        conMedicion ? ' (el aviso de privacidad debe nombrar la medicion de visitas con Umami)' : ''
      }: esta armada no se puede publicar en el dominio.`,
    );
  }
  // A donde manda la pagina a la gente: solo al alta de verdad, a las legales del dominio y al correo del dominio.
  if (sitio.alta !== ALTA) problemas.push(`sitio.json: alta debe ser ${ALTA}`);
  const pie = /** @type {Record<string, unknown>} */ (/** @type {any} */ (datos.secciones)?.pie ?? {});
  for (const clave of ['terminosUrl', 'privacidadUrl']) {
    if (!String(pie[clave] ?? '').startsWith(`https://${DOMINIO}/`)) {
      problemas.push(`secciones.json: pie.${clave} debe vivir en https://${DOMINIO}/`);
    }
  }
  for (const clave of ['contacto', 'contactoOficio', 'contactoGeneral']) {
    if (!new RegExp(`^mailto:[a-z0-9._-]+@${DOMINIO.replace('.', '\\.')}(?:\\?|$)`).test(String(sitio[clave] ?? ''))) {
      problemas.push(`sitio.json: ${clave} debe ser un correo de ${DOMINIO}`);
    }
  }
  // Lo que leen los buscadores sale de los mismos datos que la pagina.
  const paraBuscar = /** @type {any} */ ({
    origen,
    base,
    sitio,
    planes,
    preguntas: datos.preguntas,
  });
  for (const [clave, tope] of Object.entries(TOPES)) {
    const largo = String(sitio[clave] ?? '').length;
    if (largo === 0 || largo > tope) problemas.push(`sitio.json: ${clave} mide ${largo} letras (de 1 a ${tope})`);
  }
  // La medicion solo se enciende con la cuenta completa en sitio.json, y solo en el dominio. Su script es uno de los
  // archivos de codigo de la pagina: por eso se le pasan, para comprobar que existe y que es la copia revisada.
  const medicion = medicionDe(sitio.medicion, {
    destino,
    dominio: DOMINIO,
    activos: carpetaCodigo,
    propios: new Map(codigo),
  });
  problemas.push(...medicion.problemas);
  const contexto = {
    ...datos,
    planes: planesParaPagina(planes, pesos),
    ejemplo: demo.ejemplo,
    conversacion: demo.conversacion,
    armado: {
      previa: destino === 'previa',
      base,
      origen,
      activos: carpetaCodigo,
      recursos: carpetaRecursos,
      preciosDePrueba: planes.dePrueba,
      datosDemo: demo.json,
      medicion: medicion.etiqueta ?? false,
      cspEnvio: medicion.cspEnvio,
      datosEstructurados: jsonParaScript(datosEstructurados(paraBuscar)),
    },
  };

  // 3. Las paginas. Las de plantillas/previa/ solo existen en la previa (material para revisar, no para el publico).
  /** @type {Record<string, string>} */
  const parciales = {};
  /** @type {[string, string][]} */
  const paginas = [];
  for (const ruta of await listar(fuente, 'plantillas', problemas)) {
    const plantilla = await readFile(path.join(fuente, 'plantillas', ruta), 'utf8');
    if (ruta.startsWith('parciales/')) parciales[ruta.slice('parciales/'.length, -'.html'.length)] = plantilla;
    else if (!ruta.startsWith('previa/')) paginas.push([ruta, plantilla]);
    else if (destino === 'previa') paginas.push([ruta.slice('previa/'.length), plantilla]);
  }
  // Solo el inicio mide. Las demas paginas (la 404, donde viajaria una ruta escrita por la persona) no llevan la
  // etiqueta ni el permiso para mandar: su politica de contenido queda cerrada.
  const sinMedicion = { ...contexto, armado: { ...contexto.armado, medicion: false, cspEnvio: '' } };
  for (const [ruta, plantilla] of paginas) {
    const datosDeLaPagina = ruta === 'index.html' ? contexto : sinMedicion;
    archivos.set(ruta, Buffer.from(pintar(plantilla, datosDeLaPagina, parciales), 'utf8'));
  }

  // 4. Lo que GitHub Pages necesita. CNAME solo va al dominio. La previa no se indexa por el noindex de cada pagina
  //    (un robots.txt dentro de una carpeta no lo lee ningun buscador).
  archivos.set('.nojekyll', Buffer.from('', 'utf8'));
  if (destino === 'publica') {
    archivos.set('CNAME', Buffer.from(`${DOMINIO}\n`, 'utf8'));
    // Y lo que leen los buscadores en la raiz del dominio. En la previa no van: no se indexa.
    const secciones = /** @type {any} */ (datos.secciones);
    const agentes = /** @type {any} */ (datos.agentes);
    const textos = (/** @type {{ texto: string }[]} */ lista) => lista.map(({ texto }) => texto);
    /** Los renglones de un capitulo de "Tu agente". */
    const videosDe = (/** @type {string} */ clave) =>
      agentes.capitulos.find((/** @type {{ clave: string }} */ capitulo) => capitulo.clave === clave)?.videos ?? [];
    archivos.set('robots.txt', Buffer.from(robots({ origen }), 'utf8'));
    archivos.set('sitemap.xml', Buffer.from(sitemap({ origen }), 'utf8'));
    archivos.set(
      'llms.txt',
      Buffer.from(
        llmsTxt({
          ...paraBuscar,
          hace: videosDe('hace'),
          // Cada paso de como se empieza, con su explicacion: "Eliges tu plan: Lo contratas en linea...".
          pasos: videosDe('empieza').map(
            (/** @type {{ titulo: string, texto: string }} */ paso) => `${paso.titulo}: ${paso.texto}`,
          ),
          noHace: textos([...agentes.noHace, ...secciones.confianza.noHaceMas]),
          requisitos: textos(secciones.planes.requisitos),
          paraQuien: `${secciones.paraQuien.titulo} ${secciones.paraQuien.tituloFuerte}`,
          preciosDePrueba: planes.dePrueba,
          legales: { terminos: secciones.pie.terminosUrl, privacidad: secciones.pie.privacidadUrl },
        }),
        'utf8',
      ),
    );
  }

  // 5. Comprobaciones sobre lo armado.
  for (const [ruta] of paginas) {
    const html = /** @type {Buffer} */ (archivos.get(ruta)).toString('utf8');
    problemas.push(...revisarGuiones(ruta, html));
    problemas.push(...revisarEnlacesInternos(ruta, html, base, (r) => archivos.has(r)));
    if (destino === 'previa' && !/<meta name="robots" content="noindex, nofollow">/.test(html)) {
      problemas.push(`${ruta}: la previa debe llevar noindex`);
    }
  }

  return { archivos, problemas, avisos };
}
