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
/** Las fotos de "su tiempo" del cartel: con luz de dia y mucho detalle, piden un poco mas de compresion. */
const VIDA = { avif: 35, webp: 58 };
/** Que parte del ancho de la foto entra en una tarjeta del cartel. */
const PARTE_DE_TARJETA = 0.72;
/** El retrato del cartel en celular: chico y lo mas grande de esa pantalla, asi que se cuida mas que una toma. */
const RETRATO = { avif: 30, webp: 74 };
/** Los anchos del retrato: el del celular y el de la tableta de pie. Mide tres de ancho por cuatro de alto. */
const ANCHOS_DEL_RETRATO = [540, 840];
/** Los retratos de "Para quien": nitidos y con luz de dia. Es lo mas fino que deja cada archivo en 60 KB o menos. */
const OFICIO = { avif: 22, webp: 80 };
/** Sus anchos: la computadora, la de pantalla densa y el celular (ahi la foto ocupa casi todo lo ancho). */
const ANCHOS_DEL_OFICIO = [480, 720, 960];
/**
 * Hasta que altura del cuadro (de 0 a 1) llega la toma viva. Se recorta antes de achicar, en renglones pares: de los
 * 1928 del original quedan 1318, el 68.36 %. Ese porcentaje es el alto del video en fuente/estilos/corto.css.
 */
const CORTE = 0.684;

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
 * La misma foto recortada para una tarjeta alta y angosta (las del cartel en pantallas anchas): todo el alto y, de lo
 * ancho, la parte que dice "encuadre" (de 0, pegada a la izquierda, a 100, pegada a la derecha). Asi la persona queda
 * dentro de la tarjeta sin que la pagina tenga que acomodarla.
 * @param {string} de
 * @param {string} nombre
 * @param {number} ancho
 * @param {number} encuadre
 * @param {Calidad} calidad
 * @returns {Trabajo[]}
 */
function tarjeta(de, nombre, ancho, encuadre, calidad) {
  const recorte = `crop=iw*${PARTE_DE_TARJETA}:ih:(iw-ow)*${(encuadre / 100).toFixed(2)}:0`;
  return imagen(de, `${nombre}-tarjeta-${ancho}`, `${recorte},scale=${ancho}:-2:flags=lanczos`, calidad);
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
 * La toma viva de un oficio: el mismo cuadro de su foto de trabajo, en movimiento, chico (el fondo va fuera de foco y
 * aguanta poca resolucion) y solo de arriba hasta CORTE. De ahi para abajo (la mesa y el celular en primer plano) la
 * pagina deja ver la foto, nitida y quieta: asi al celular no le aparece nada en la pantalla. H.264, sin audio (el
 * candado de siempre: -an, y solo la pista de video) y listo para empezar sin esperar. Corre una vez por aparicion: no
 * hace falta que el final empate con el principio.
 * @param {object} toma
 * @param {string} toma.de
 * @param {string} toma.a
 * @param {number} toma.ancho
 * @param {number} toma.crf
 * @returns {Trabajo}
 */
function viva({ de, a, ancho, crf }) {
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
      `crop=iw:2*trunc(ih*${CORTE}/2):0:0,scale=${ancho}:-2:flags=lanczos,setsar=1`,
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'veryslow',
      '-crf',
      String(crf),
      '-movflags',
      '+faststart',
    ],
  };
}

/**
 * @typedef {object} Oficio
 * @property {string} clave
 * @property {boolean} video
 * @property {{ encuadre: number, tu: { recorte: { x: number, y: number, ancho: number } } }} cartel
 */
/** @type {{ oficios: Oficio[] }} */
const corto = JSON.parse(await readFile(path.join(raiz, 'fuente', 'datos', 'corto.json'), 'utf8'));
/** @type {{ clave: string }[]} */
const giros = JSON.parse(await readFile(path.join(raiz, 'fuente', 'datos', 'giros.json'), 'utf8'));

/** @type {Trabajo[]} */
const TRABAJOS = [
  ...corto.oficios.flatMap(({ clave, video, cartel }) => [
    // El corto: cada oficio trabajando, con el celular encendido en primer plano.
    ...foto(`comercial/${clave}-trabajo.png`, `comercial/${clave}-trabajo`, 720, TOMA),
    ...foto(`comercial/${clave}-trabajo.png`, `comercial/${clave}-trabajo`, 1080, TOMA),
    ...(video
      ? [
          viva({
            de: `comercial/${clave}-trabajo-viva.mp4`,
            a: `comercial/${clave}-trabajo.mp4`,
            ancho: 640,
            crf: 29,
          }),
        ]
      : []),
    // El cartel en pantallas anchas: la misma persona, ya en su tiempo, recortada para su tarjeta.
    ...tarjeta(`cartel/${clave}-vida.png`, `cartel/${clave}-vida`, 600, cartel.encuadre, VIDA),
    // El cartel en celular: su retrato trabajando, sacado de la misma foto del corto.
    ...ANCHOS_DEL_RETRATO.flatMap((ancho) =>
      retrato(`comercial/${clave}-trabajo.png`, `cartel/${clave}-tu`, ancho, cartel.tu.recorte),
    ),
  ]),
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
