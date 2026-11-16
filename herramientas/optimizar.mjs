// @ts-check
// Convierte los originales (pesados, fuera del repo, en originales/) en lo que la pagina publica: fotos en AVIF y
// WebP a varios anchos y video H.264 sin audio. Lo que sale va a fuente/recursos/ y SI
// se confirma, para que armar la pagina no necesite ffmpeg. Uso: node herramientas/optimizar.mjs [nombre]
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join(raiz, 'originales');
const DESTINO = path.join(raiz, 'fuente', 'recursos');

/**
 * Una foto a un ancho, en AVIF y en WebP (para los telefonos que todavia no leen AVIF).
 * @param {string} de
 * @param {string} nombre
 * @param {number} ancho
 * @param {{ avif: number, webp: number }} calidad  AVIF: crf (menos es mejor); WebP: calidad (mas es mejor)
 * @returns {Trabajo[]}
 */
function foto(de, nombre, ancho, calidad) {
  const escala = `scale=${ancho}:-2:flags=lanczos`;
  return [
    {
      de,
      a: `${nombre}-${ancho}.avif`,
      como: [
        '-vf',
        escala,
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
      a: `${nombre}-${ancho}.webp`,
      como: ['-vf', escala, '-c:v', 'libwebp', '-q:v', String(calidad.webp), '-compression_level', '6'],
    },
  ];
}

/**
 * @typedef {object} Trabajo
 * @property {string} de        el original, dentro de originales/
 * @property {string} [con]     un segundo original (la foto quieta de un video), dentro de originales/
 * @property {string} a         el archivo que sale, dentro de fuente/recursos/
 * @property {string[]} como    los argumentos de ffmpeg entre las entradas y la salida
 */

/**
 * Un video que se repite sin que se note el empalme: el final se funde con el principio. La parte de abajo del cuadro
 * (el celular en primer plano) se toma de la foto quieta: asi el celular no se mueve ni le aparece nada en la pantalla,
 * y el movimiento queda solo al fondo. H.264, sin audio (el candado de siempre: -an) y listo para empezar sin esperar.
 * @param {object} toma
 * @param {string} toma.de        el video original
 * @param {string} toma.foto      la foto de la que salio el video
 * @param {string} toma.a
 * @param {number} toma.ancho
 * @param {number} toma.alto
 * @param {number} toma.crf
 * @param {number} toma.dura      lo que dura el original, en segundos
 * @param {number} toma.empalme   lo que dura la fundida del final con el principio
 * @param {[number, number]} toma.quieto  de que altura a que altura (de 0 a 1) entra la foto quieta
 * @returns {Trabajo}
 */
function ciclo({ de, foto: quieta, a, ancho, alto, crf, dura, empalme, quieto }) {
  const [desde, hasta] = quieto;
  const filtro = [
    `[0:v]scale=${ancho}:${alto}:flags=lanczos,setsar=1[vivo]`,
    `[1:v]scale=${ancho}:${alto}:flags=lanczos,setsar=1,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip((Y/H-${desde})/${(hasta - desde).toFixed(4)},0,1)'[quieta]`,
    '[vivo][quieta]overlay=shortest=1,split[a][b]',
    `[a]trim=0:${empalme},setpts=PTS-STARTPTS[principio]`,
    `[b]trim=${empalme}:${dura},setpts=PTS-STARTPTS[resto]`,
    `[resto][principio]xfade=transition=fade:duration=${empalme}:offset=${(dura - 2 * empalme).toFixed(3)}[v]`,
  ].join(';');
  return {
    de,
    con: quieta,
    a,
    como: [
      '-an',
      '-filter_complex',
      filtro,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'slow',
      '-crf',
      String(crf),
      '-movflags',
      '+faststart',
    ],
  };
}

const TOMA = { avif: 31, webp: 76 };
const OFICIOS = ['unas', 'dentista', 'medico'];

/** @type {Trabajo[]} */
const TRABAJOS = [
  // El comercial: cada oficio trabajando (con el celular encendido en primer plano) y esperando a quien no llego.
  ...OFICIOS.flatMap((oficio) => [
    ...foto(`comercial/${oficio}-trabajo.png`, `comercial/${oficio}-trabajo`, 720, TOMA),
    ...foto(`comercial/${oficio}-trabajo.png`, `comercial/${oficio}-trabajo`, 1080, TOMA),
    ...foto(`comercial/${oficio}-espera.png`, `comercial/${oficio}-espera`, 720, TOMA),
    // De la espera grande solo va el AVIF: la pagina la pide unicamente donde el navegador sabe escoger formato, y
    // el respaldo WebP de ese tamano no lo pedia nadie.
    ...foto(`comercial/${oficio}-espera.png`, `comercial/${oficio}-espera`, 1080, TOMA).filter((trabajo) =>
      trabajo.a.endsWith('.avif'),
    ),
  ]),
  // La foto de referencia que una clienta manda por WhatsApp (escena "Ve las fotos").
  {
    de: 'comercial/referencia-unas.png',
    a: 'comercial/referencia-unas.webp',
    como: ['-vf', 'scale=336:-2:flags=lanczos', '-c:v', 'libwebp', '-q:v', '78'],
  },
  // La toma viva: el mismo cuadro de trabajo, en movimiento y en ciclo.
  ciclo({
    de: 'comercial/unas-trabajo-viva.mp4',
    foto: 'comercial/unas-trabajo.png',
    a: 'comercial/unas-trabajo.mp4',
    ancho: 1076,
    alto: 1928,
    crf: 27,
    dura: 5.0,
    empalme: 0.8,
    quieto: [0.652, 0.684],
  }),
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
  const entradas = ['-i', path.join(ORIGEN, trabajo.de)];
  if (trabajo.con) entradas.push('-loop', '1', '-i', path.join(ORIGEN, trabajo.con));
  await ffmpeg([...entradas, ...trabajo.como, salida]);
  const { size } = await stat(salida);
  total += size;
  console.log(`${trabajo.a}: ${Math.round(size / 1024)} KB`);
}
console.log(`Total: ${Math.round(total / 1024)} KB`);
