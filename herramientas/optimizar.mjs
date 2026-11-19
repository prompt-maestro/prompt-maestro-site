// @ts-check
// Convierte los originales (pesados, fuera del repo, en originales/) en lo que la pagina publica: fotos en AVIF y
// WebP a varios anchos y video H.264 sin audio. Lo que sale va a fuente/recursos/ y SI
// se confirma, para que armar la pagina no necesite ffmpeg. Uso: node herramientas/optimizar.mjs [nombre]
// Los oficios salen de fuente/datos/corto.json: sumar uno ahi (con sus originales) basta para que se convierta. Los
// retratos de "Para quien" salen de fuente/datos/giros.json, que es de donde la pagina lee esas tarjetas.
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zona } from '../fuente/js/corto.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join(raiz, 'originales');
const DESTINO = path.join(raiz, 'fuente', 'recursos');

/**
 * @typedef {object} Trabajo
 * @property {string} de        el original, dentro de originales/
 * @property {string} a         el archivo que sale, dentro de fuente/recursos/
 * @property {string[]} como    los argumentos de ffmpeg entre la entrada y la salida
 */

/** @typedef {{ avif: number, webp: number }} Calidad  AVIF: crf (menos es mejor); WebP: calidad (mas es mejor) */

/** Las tomas de trabajo: oscuras y con el fondo fuera de foco, se dejan comprimir mucho. */
const TOMA = { avif: 31, webp: 76 };
/**
 * Las escenas del corto: cada oficio en horizontal, a pantalla completa. Es lo mas grande de la pantalla ancha, asi
 * que se cuidan mas que una toma: lo mas fino que deja cada foto de 1600 en AVIF en 90 KB o menos (una prueba lo
 * cuida). La grande, para pantallas de mas de 1600 puntos, aguanta un poco mas de compresion.
 */
const ESCENA = { avif: 10, webp: 80 };
const ESCENA_GRANDE = { avif: 16, webp: 76 };
/**
 * La agente del cartel en pantallas anchas: un retrato sobre fondo oscuro, tan alto como la pantalla. El fondo se
 * comprime casi sin peso; lo que se cuida es su cara.
 */
const AGENTE = { avif: 24, webp: 78 };
/** Sus anchos: una laptop, una pantalla grande y una densa. */
const ANCHOS_DE_LA_AGENTE = [900, 1400, 2000];
/** El retrato del cartel en celular: chico y lo mas grande de esa pantalla, asi que se cuida mas que una toma. */
const RETRATO = { avif: 30, webp: 74 };
/** Los anchos del retrato: el del celular y el de la tableta de pie. Mide tres de ancho por cuatro de alto. */
const ANCHOS_DEL_RETRATO = [540, 840];
/** Los retratos de "Para quien": nitidos y con luz de dia. Es lo mas fino que deja cada archivo en 60 KB o menos. */
const OFICIO = { avif: 22, webp: 80 };
/** Sus anchos: la computadora, la de pantalla densa y el celular (ahi la foto ocupa casi todo lo ancho). */
const ANCHOS_DEL_OFICIO = [480, 720, 960];
/**
 * La toma viva: cuanto se comprime. Con esto cada una pesa 480 KB o menos (una prueba lo cuida): en cada visita se
 * pide una sola.
 */
const VIVA = 29;
/**
 * El color de la toma viva: el del original (BT.709, de 16 a 235), que no lo trae escrito. Se le dice a ffmpeg antes
 * de tocarla (si no, lo adivina, la convierte y sale mas oscura que la foto) y se deja escrito en lo que sale, para
 * que el navegador la pinte con el mismo color que la foto de abajo.
 */
const COLOR = 'colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv';
/** Un poco de filo, solo en la luz: el video original es mas suave que la foto, y encima de ella se notaria. */
const FILO = 'unsharp=5:5:0.8:5:5:0';

/**
 * Una imagen, ya con su filtro de tamano, en AVIF y en WebP (para los telefonos que todavia no leen AVIF).
 * @param {string} de
 * @param {string} a       el nombre que sale, sin extension
 * @param {string} filtro  el filtro de video de ffmpeg (recorte y escala)
 * @param {Calidad} calidad
 * @returns {Trabajo[]}
 */
function imagen(de, a, filtro, calidad) {
  return [
    {
      de,
      a: `${a}.avif`,
      como: [
        '-vf',
        filtro,
        '-c:v',
        'libaom-av1',
        '-still-picture',
        '1',
        '-crf',
        String(calidad.avif),
        '-b:v',
        '0',
        '-cpu-used',
        '3',
        '-pix_fmt',
        'yuv420p',
      ],
    },
    {
      de,
      a: `${a}.webp`,
      como: ['-vf', filtro, '-c:v', 'libwebp', '-q:v', String(calidad.webp), '-compression_level', '6'],
    },
  ];
}

/**
 * Una foto entera a un ancho.
 * @param {string} de
 * @param {string} nombre
 * @param {number} ancho
 * @param {Calidad} calidad
 * @returns {Trabajo[]}
 */
function foto(de, nombre, ancho, calidad) {
  return imagen(de, `${nombre}-${ancho}`, `scale=${ancho}:-2:flags=lanczos`, calidad);
}

/**
 * El retrato del cartel en celular ("Tú, en lo tuyo"): un recorte de la foto de trabajo, de tres por cuatro, con la
 * cara y las manos de quien trabaja y sin el celular de la mesa. El recorte lo dice el dato de cada oficio, en por
 * ciento de la foto: desde donde empieza (x, y) y cuanto de lo ancho toma. Sale un poco mas clara que la toma del
 * corto, que va oscura a proposito: aqui la foto se ve de dia.
 * @param {string} de
 * @param {string} nombre
 * @param {number} ancho
 * @param {{ x: number, y: number, ancho: number }} recorte
 * @returns {Trabajo[]}
 */
function retrato(de, nombre, ancho, recorte) {
  const parte = `iw*${(recorte.ancho / 100).toFixed(4)}`;
  const corte = `crop=2*trunc(${parte}/2):2*trunc(${parte}*2/3):iw*${(recorte.x / 100).toFixed(4)}:ih*${(recorte.y / 100).toFixed(4)}`;
  const luz = "lutrgb=r='clip(val*1.1,0,255)':g='clip(val*1.1,0,255)':b='clip(val*1.1,0,255)',hue=s=1.05";
  return imagen(de, `${nombre}-${ancho}`, `${corte},scale=${ancho}:${(ancho * 4) / 3}:flags=lanczos,${luz}`, RETRATO);
}

/**
 * La toma viva de un oficio: el mismo cuadro de su escena, en movimiento, y solo la zona donde algo se mueve (quien
 * trabaja). La zona la dice el dato de cada oficio, en por ciento de la foto: desde donde empieza y cuanto mide. La
 * pagina la pone encima de la foto, en ese mismo lugar, y la funde con ella en sus orillas: la mesa y el celular son
 * siempre los de la foto, nitidos y quietos, asi al celular no le aparece nada en la pantalla. Va a su tamano, sin
 * achicar: en una pantalla ancha cada punto del video es un punto de la pantalla. H.264, sin audio (el candado de
 * siempre: -an, y solo la pista de video), con su color declarado y listo para empezar sin esperar. No hace falta
 * que el final empate con el principio: al terminar su pasada se funde con la foto.
 * @param {object} toma
 * @param {string} toma.de
 * @param {string} toma.a
 * @param {string} toma.zona  "x y ancho alto", en por ciento de la foto
 * @returns {Trabajo}
 */
function viva({ de, a, zona: escrita }) {
  const parte = zona(escrita);
  if (!parte) throw new Error(`${a}: la zona de la toma viva ("${escrita}") no se entiende o se sale de la foto`);
  const par = (/** @type {string} */ de, /** @type {number} */ cuanto) => `2*trunc(${de}*${cuanto.toFixed(4)}/2)`;
  const recorte = `crop=${par('iw', parte.ancho)}:${par('ih', parte.alto)}:${par('iw', parte.x)}:${par('ih', parte.y)}`;
  return {
    de,
    a,
    como: [
      '-an',
      '-sn',
      '-dn',
      '-map',
      '0:v:0',
      '-map_metadata',
      '-1',
      '-vf',
      `setparams=${COLOR},${recorte},${FILO},setsar=1`,
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'veryslow',
      '-crf',
      String(VIVA),
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
      '-movflags',
      '+faststart',
    ],
  };
}

/**
 * @typedef {object} Oficio
 * @property {string} clave
 * @property {boolean} video
 * @property {{ viva: string }} mira
 * @property {{ tu: { recorte: { x: number, y: number, ancho: number } } }} cartel
 */
/** @type {{ oficios: Oficio[] }} */
const corto = JSON.parse(await readFile(path.join(raiz, 'fuente', 'datos', 'corto.json'), 'utf8'));
/** @type {{ clave: string }[]} */
const giros = JSON.parse(await readFile(path.join(raiz, 'fuente', 'datos', 'giros.json'), 'utf8'));

/** @type {Trabajo[]} */
const TRABAJOS = [
  ...corto.oficios.flatMap(({ clave, video, mira, cartel }) => [
    // El corto: la escena de cada oficio, en horizontal y a dos anchos, con su celular en la mesa; y su toma viva.
    ...foto(`comercial/${clave}-escena.png`, `comercial/${clave}-escena`, 1600, ESCENA),
    ...foto(`comercial/${clave}-escena.png`, `comercial/${clave}-escena`, 2560, ESCENA_GRANDE),
    ...(video
      ? [viva({ de: `comercial/${clave}-escena-viva.mp4`, a: `comercial/${clave}-escena.mp4`, zona: mira.viva })]
      : []),
    // El final del corto, con los oficios lado a lado: cada uno de pie, trabajando.
    ...foto(`comercial/${clave}-trabajo.png`, `comercial/${clave}-trabajo`, 720, TOMA),
    ...foto(`comercial/${clave}-trabajo.png`, `comercial/${clave}-trabajo`, 1080, TOMA),
    // El cartel en celular: su retrato trabajando, sacado de su foto de pie.
    ...ANCHOS_DEL_RETRATO.flatMap((ancho) =>
      retrato(`comercial/${clave}-trabajo.png`, `cartel/${clave}-tu`, ancho, cartel.tu.recorte),
    ),
  ]),
  // El cartel en pantallas anchas: la agente que ilustra al agente virtual, la misma para todos los oficios.
  ...ANCHOS_DE_LA_AGENTE.flatMap((ancho) => foto('cartel/agente.png', 'cartel/agente', ancho, AGENTE)),
  // "Para quien": el retrato de cada oficio, entero (cuatro de ancho por cinco de alto) y sin recorte.
  ...giros.flatMap(({ clave }) =>
    ANCHOS_DEL_OFICIO.flatMap((ancho) =>
      foto(`retratos/${clave}-retrato.png`, `retratos/${clave}-retrato`, ancho, OFICIO),
    ),
  ),
  // La foto de referencia que una clienta manda por WhatsApp.
  {
    de: 'comercial/referencia-unas.png',
    a: 'comercial/referencia-unas.webp',
    como: ['-vf', 'scale=336:-2:flags=lanczos', '-c:v', 'libwebp', '-q:v', '78'],
  },
];

/**
 * @param {string[]} argumentos
 * @returns {Promise<void>}
 */
function ffmpeg(argumentos) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argumentos], { stdio: 'inherit' });
    proceso.on('error', (error) =>
      rechazar(new Error(`No se pudo correr ffmpeg (¿esta instalado?): ${error.message}`)),
    );
    proceso.on('close', (codigo) =>
      codigo === 0 ? resolver() : rechazar(new Error(`ffmpeg termino con codigo ${codigo}`)),
    );
  });
}

const filtro = process.argv[2];
let total = 0;
for (const trabajo of TRABAJOS) {
  if (filtro && !trabajo.a.includes(filtro)) continue;
  const salida = path.join(DESTINO, trabajo.a);
  await mkdir(path.dirname(salida), { recursive: true });
  await ffmpeg(['-i', path.join(ORIGEN, trabajo.de), ...trabajo.como, salida]);
  const { size } = await stat(salida);
  total += size;
  console.log(`${trabajo.a}: ${Math.round(size / 1024)} KB`);
}
console.log(`Total: ${Math.round(total / 1024)} KB`);
