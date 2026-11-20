// @ts-check
// Las secciones de despues de la demostracion, leidas de la pagina ya armada: los pasos de "Como funciona", los retratos
// de "Para quien", la letra chica de los planes, las preguntas y la hoja de estilos que viaja achicada. Todo sale de
// los datos: aqui se comprueba que la pagina dice lo que dicen ellos, y que ellos dicen lo que aprobo el dueno.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { achicarCss } from '../../herramientas/achicar.mjs';
import { armarSitio } from '../../herramientas/armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUENTE = path.join(RAIZ, 'fuente');
const leer = async (/** @type {string} */ ruta) => JSON.parse(await readFile(path.join(FUENTE, 'datos', ruta), 'utf8'));

/** Lo mas que pesa cada foto publicada de "Para quien". */
const TOPE_DE_RETRATO = 60 * 1024;
/** Los anchos en que se publica cada retrato. */
const ANCHOS = [480, 720, 960];

/** @type {Map<string, Buffer>} */
let archivos;
let html = '';
/** @type {any} */
let secciones;
/** @type {any[]} */
let giros;
/** @type {any[]} */
let preguntas;

/**
 * Una seccion de la pagina, entera.
 * @param {string} id
 * @returns {string}
 */
function seccion(id) {
  const bloque = new RegExp(`<section class="[^"]*" id="${id}"[\\s\\S]*?</section>`).exec(html)?.[0];
  assert.ok(bloque, `la pagina no trae la seccion #${id}`);
  return bloque;
}

/**
 * El ancho y el alto de una foto WebP con perdida (VP8), leidos de su cabecera.
 * @param {Buffer} foto
 * @returns {[number, number]}
 */
function medidasDeWebp(foto) {
  assert.equal(foto.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(foto.subarray(8, 16).toString('latin1'), 'WEBPVP8 ');
  return [foto.readUInt16LE(26) & 0x3fff, foto.readUInt16LE(28) & 0x3fff];
}

before(async () => {
  ({ archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' }));
  html = archivos.get('index.html')?.toString('utf8') ?? '';
  secciones = await leer('secciones.json');
  giros = await leer('giros.json');
  preguntas = await leer('preguntas.json');
});

test('la seccion "Como funciona" ya no existe: sus nueve pasos se cuentan en el primer mini video de "Tu agente"', () => {
  // La decidio el dueno (19-nov-2026): las dos secciones decian lo mismo y se quedo la de "Tu agente".
  assert.ok(!html.includes('id="como-funciona"'));
  for (const viejo of [
    'class="pasos"',
    'acto__',
    'paso__',
    'ruta__',
    'mini__',
    'i-papel-',
    'i-responder',
    'i-campana',
    'i-toque',
  ]) {
    assert.ok(!html.includes(viejo), viejo);
  }
  assert.equal('pasos' in secciones, false);
  // El enlace de la barra conserva su nombre y ahora lleva a "Tu agente".
  assert.ok(html.includes('<a class="barra__enlace" href="#agente" data-lugar="barra">Cómo funciona</a>'));
  // Todo icono que la pagina pide esta dibujado en ella, una sola vez, y ninguno se queda dibujado sin que lo pidan.
  const pedidos = new Set([...html.matchAll(/<use href="#(i-[\w-]+)"/g)].map(([, id]) => id));
  for (const id of pedidos) assert.equal(html.split(`<symbol id="${id}"`).length - 1, 1, id);
  const dibujados = [...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(([, id]) => id);
  for (const id of dibujados) assert.ok(pedidos.has(id ?? ''), `${id} esta dibujado y nadie lo pide`);
});

test('para quien: una tarjeta por oficio, con el nombre aprobado, su renglon de siempre y un texto que describe la foto', async () => {
  assert.deepEqual(
    giros.map((giro) => giro.tarjeta.nombre),
    ['Uñas', 'Dentistas', 'Médicos generales y especialistas'],
  );
  // El renglon de cada tarjeta es el aprobado. Vive aqui, en giros.json: esta seccion ya no lee corto.json.
  assert.deepEqual(
    giros.map((giro) => giro.tarjeta.texto),
    [
      'Más tiempo para tus clientas: tu agente cotiza tus diseños con tu catálogo y agenda solo con el anticipo pagado.',
      'Más orden en tu agenda: limpiezas y valoraciones con anticipo pagado, sin que sueltes el instrumental.',
      'Más tranquilidad en tu consulta: agenda con respeto y discreción, y lo clínico siempre queda en tus manos.',
    ],
  );
  for (const giro of giros) {
    assert.ok(
      giro.tarjeta.alt.length > 15 && !/^foto|^imagen/i.test(giro.tarjeta.alt),
      `${giro.clave}: el alt describe la foto`,
    );
  }
  const bloque = seccion('para-quien');
  assert.ok(bloque.includes('>Hoy, para uñas, dentistas y médicos. <em>Pronto, más oficios y profesiones.</em></h2>'));
  const tarjetas = [...bloque.matchAll(/<li class="oficio__tarjeta" data-enciende>([\s\S]*?)<\/li>/g)].map(
    ([, dentro]) => dentro ?? '',
  );
  assert.equal(tarjetas.length, giros.length);
  for (const [lugar, giro] of giros.entries()) {
    const tarjeta = tarjetas[lugar] ?? '';
    const foto = /<img class="oficio__foto"[^>]*>/.exec(tarjeta)?.[0] ?? '';
    // La foto va completa, en su marco, y el texto debajo y en limpio: primero el marco, luego el nombre y el renglon.
    assert.match(
      tarjeta,
      /^\s*<div class="oficio__marco">\s*<picture>[\s\S]*<\/picture>\s*<\/div>\s*<div class="oficio__texto">/,
    );
    assert.ok(
      tarjeta.includes(`<div class="oficio__texto"><h3>${giro.tarjeta.nombre}</h3><p>${giro.tarjeta.texto}</p></div>`),
      giro.clave,
    );
    assert.ok(foto.includes(` alt="${giro.tarjeta.alt}" `), giro.clave);
    assert.ok(foto.includes(' width="960" height="1192" loading="lazy" decoding="async"'), giro.clave);
    assert.match(tarjeta, /<source type="image\/avif" srcset="[^"]+" sizes="[^"]+">/);
    // Son las fotos nuevas, no las del corto.
    assert.ok(!tarjeta.includes('comercial/'), giro.clave);
    for (const ancho of ANCHOS) {
      for (const tipo of ['avif', 'webp'])
        assert.ok(tarjeta.includes(`retratos/${giro.clave}-retrato-${ancho}.${tipo} ${ancho}w`));
    }
  }
  // La puerta a mas oficios es un renglon que es, entero, el enlace de siempre.
  const { sitio } = { sitio: await leer('sitio.json') };
  assert.ok(
    bloque.includes(
      `<a class="oficio__otro" href="${sitio.contactoOficio}" data-lugar="para-quien"><span><b>¿No está tu negocio?</b> Escríbenos y lo platicamos.</span>`,
    ),
  );
});

test('los retratos publicados: tres anchos en dos formatos por oficio, cada uno de 60 KB o menos y sin recorte', async () => {
  const carpeta = path.join(FUENTE, 'recursos', 'retratos');
  const enDisco = (await readdir(carpeta)).sort();
  const esperados = giros
    .flatMap((giro) =>
      ANCHOS.flatMap((ancho) => ['avif', 'webp'].map((tipo) => `${giro.clave}-retrato-${ancho}.${tipo}`)),
    )
    .sort();
  assert.deepEqual(enDisco, esperados);
  for (const nombre of enDisco) {
    const foto = await readFile(path.join(carpeta, nombre));
    assert.ok(foto.length <= TOPE_DE_RETRATO, `${nombre} pesa ${Math.round(foto.length / 1024)} KB`);
    const ancho = Number(/-(\d+)\.\w+$/.exec(nombre)?.[1]);
    if (nombre.endsWith('.avif')) {
      assert.equal(foto.subarray(4, 12).toString('latin1'), 'ftypavif', nombre);
    } else {
      // La foto entera, cuatro de ancho por cinco de alto (1856 x 2304 la original): lo que la pagina declara.
      const [anchoReal, alto] = medidasDeWebp(foto);
      assert.equal(anchoReal, ancho, nombre);
      assert.ok(Math.abs(alto - (ancho * 1192) / 960) <= 2, `${nombre}: mide ${anchoReal} x ${alto}`);
    }
  }
  // Y cada una viaja en lo armado, en su carpeta con huella.
  const armadas = [...archivos.keys()].filter((ruta) => /^r\/[0-9a-f]{10}\/retratos\//.test(ruta));
  assert.equal(armadas.length, esperados.length);
});

test('la tarjeta de cada oficio no viaja en los datos de la demostracion: a ella no le hace falta', () => {
  const datos = JSON.parse(/<script type="application\/json" data-demo-datos>(.*?)<\/script>/s.exec(html)?.[1] ?? '{}');
  assert.equal(datos.ejemplos.length, giros.length);
  for (const { giro } of datos.ejemplos) {
    assert.equal('tarjeta' in giro, false, giro.clave);
    assert.ok(giro.nombre && giro.negocio);
  }
});

test('planes: bajo la nota de la instalacion, en letra chica, la comision que cobra Mercado Pago', () => {
  const bloque = seccion('planes');
  assert.equal(
    secciones.planes.notaMercadoPago,
    'Mercado Pago cobra su comisión por cada anticipo que recibes. La fija Mercado Pago, no nosotros.',
  );
  const notas = /<div class="planes__notas">([\s\S]*?)<\/div>/.exec(bloque)?.[1] ?? '';
  const renglones = [...notas.matchAll(/<p class="planes__nota">([^<]+)<\/p>/g)].map(([, texto]) => texto);
  assert.equal(renglones.length, 2);
  // La nota de la instalacion: hoy se paga la instalacion y el primer mes, que cuenta desde que el agente queda activo
  // (cambio de estrategia del dueno, 20-nov-2026). Sigue con su "No cobramos comision por cita."
  assert.match(
    renglones[0] ?? '',
    /^Instalación única de \$[\d,]+\. Hoy pagas la instalación y tu primer mes; ese mes empieza a contar el día que tu agente queda activo\. Pago con tarjeta\. No cobramos comisión por cita\.$/,
  );
  assert.equal(renglones[1], secciones.planes.notaMercadoPago);
  // Sin porcentajes: la comision la fija Mercado Pago.
  assert.doesNotMatch(notas, /%|por ciento/);
});

test('preguntas: los datos marcan las cinco principales, en el orden aprobado, y las otras ocho conservan el suyo', () => {
  assert.equal(preguntas.length, 13);
  assert.deepEqual(
    preguntas.filter((duda) => duda.principal === true).map((duda) => duda.pregunta),
    [
      '¿El dinero pasa por ustedes?',
      '¿Qué pasa si no llega?',
      '¿Y si no quieren pagar anticipo?',
      '¿Tengo que cambiar de número?',
      '¿Y si no sabe algo?',
    ],
  );
  // Van primero: asi la pagina, los datos estructurados y llms.txt las llevan en el mismo orden.
  assert.ok(preguntas.slice(0, 5).every((duda) => duda.principal === true));
  assert.deepEqual(
    preguntas.slice(5).map((duda) => duda.pregunta),
    [
      '¿Mi clientela tiene que instalar algo?',
      '¿Puedo contestar yo?',
      'Soy dentista o médico. ¿Va a opinar de salud?',
      '¿Reemplaza mi agenda o mi expediente?',
      '¿Me trae clientela nueva?',
      '¿Cómo sé que no se va a equivocar con mis precios?',
      '¿Qué pasa con los datos de mis pacientes o clientas?',
      '¿Mi profesión u oficio no está?',
    ],
  );
  assert.ok(preguntas.slice(5).every((duda) => !('principal' in duda)));
});

test('preguntas: cinco a la vista y las demas dentro de "Ver mas preguntas", sin JavaScript y todas cerradas', () => {
  const bloque = seccion('preguntas');
  const [aLaVista = '', resto = ''] = bloque.split('<details class="preguntas__mas">');
  const dudas = (/** @type {string} */ trozo) =>
    [
      ...trozo.matchAll(/<details class="pregunta"><summary><h3>([^<]+)<\/h3><\/summary><p>([^<]+)<\/p><\/details>/g),
    ].map(([, pregunta, respuesta]) => ({ pregunta, respuesta }));
  const sinMarca = preguntas.map(({ pregunta, respuesta }) => ({ pregunta, respuesta }));
  assert.deepEqual(dudas(aLaVista), sinMarca.slice(0, 5));
  assert.deepEqual(dudas(resto), sinMarca.slice(5));
  // El boton es el resumen de un <details>: dice una cosa cerrado y otra abierto, y lo demas va dentro de el.
  assert.match(
    resto,
    /^\s*<summary class="boton boton--chico boton--contorno preguntas__ver"><span class="preguntas__ver-mas">Ver más preguntas<\/span><span class="preguntas__ver-menos">Ver menos preguntas<\/span><\/summary>\s*<div class="preguntas__resto">/,
  );
  assert.equal(bloque.split('<details class="preguntas__mas">').length, 2);
  // Nada llega abierto, y no hay un solo boton que dependa de JavaScript.
  assert.doesNotMatch(bloque, /<details[^>]*\sopen|<button/);
  // Las trece siguen en lo que leen los buscadores y los modelos de lenguaje.
  const llms = archivos.get('llms.txt')?.toString('utf8') ?? '';
  assert.deepEqual(
    [...llms.matchAll(/^### (.+)$/gm)].map(([, pregunta]) => pregunta),
    preguntas.map(({ pregunta }) => pregunta),
  );
});

test('la hoja de estilos viaja achicada: sin comentarios, y dice lo mismo que las hojas de fuente', async () => {
  const ruta = [...archivos.keys()].find((una) => una.endsWith('/estilos/pagina.css')) ?? '';
  const publicada = archivos.get(ruta)?.toString('utf8') ?? '';
  /** @type {string[]} */
  const orden = JSON.parse(await readFile(path.join(FUENTE, 'estilos', 'orden.json'), 'utf8'));
  let unida = '';
  for (const nombre of orden) unida += await readFile(path.join(FUENTE, 'estilos', nombre), 'utf8');
  const recursos = /href="(\/r\/[0-9a-f]{10}\/)fuentes\/outfit\.woff2"/.exec(html)?.[1] ?? '';
  assert.ok(recursos, 'no encontre la carpeta de los recursos');
  // Es la hoja unida, con las rutas de sus recursos ya puestas, y achicada: ni mas ni menos.
  assert.equal(publicada, achicarCss(unida.replaceAll('../recursos/', recursos)));
  assert.ok(!publicada.includes('/*') && !publicada.includes('\n'));
  assert.ok(unida.includes('/*'), 'los comentarios se quedan en los archivos de fuente');
  assert.ok(publicada.length < unida.length * 0.85, `la hoja publicada mide ${publicada.length} de ${unida.length}`);
  // Las dos paginas piden esa misma hoja.
  for (const pagina of ['index.html', '404.html']) {
    assert.ok(archivos.get(pagina)?.toString('utf8').includes(`<link rel="stylesheet" href="/${ruta}">`), pagina);
  }
});

test('ninguna hoja pisa una animacion de otra: cada @keyframes de la pagina lleva un nombre unico', async () => {
  // Las hojas se unen en una sola: si dos animaciones se llaman igual, la de la hoja de abajo reemplaza, sin avisar,
  // a la de arriba (asi le habria cambiado su entrada a los renglones del inicio una animacion de las secciones).
  /** @type {string[]} */
  const orden = JSON.parse(await readFile(path.join(FUENTE, 'estilos', 'orden.json'), 'utf8'));
  /** @type {Map<string, string>} */
  const vistas = new Map();
  for (const hoja of orden) {
    const css = await readFile(path.join(FUENTE, 'estilos', hoja), 'utf8');
    for (const [, nombre = ''] of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
      assert.equal(
        vistas.get(nombre),
        undefined,
        `la animacion "${nombre}" esta en ${vistas.get(nombre)} y en ${hoja}`,
      );
      vistas.set(nombre, hoja);
    }
  }
  assert.ok(vistas.size > 10, 'la prueba esta leyendo las animaciones de la pagina');
  // Y toda animacion que se usa en las secciones existe.
  const secciones = await readFile(path.join(FUENTE, 'estilos', 'secciones.css'), 'utf8');
  const usadas = [...secciones.matchAll(/\banimation:\s*([\w-]+)/g)].map(([, nombre]) => nombre ?? '');
  // (Eran cuatro: la del sello del antes y despues se fue con la seccion "En una frase".)
  assert.deepEqual(usadas, ['resto-entra', 'oficio-enciende', 'oficio-brillo']);
  for (const nombre of usadas) assert.ok(vistas.has(nombre), `no existe la animacion "${nombre}"`);
});

test('el trato de la profesional de ejemplo concuerda con su foto y con su guion: "la Dra." o "el Dr."', async () => {
  // Decision de Jose (18-nov-2026): "Dra." si es mujer y "Dr." si es hombre. En las fotos de la pagina la medica es
  // una doctora y el dentista es un hombre.
  const de = (/** @type {string} */ clave) => giros.find((/** @type {any} */ giro) => giro.clave === clave);
  assert.equal(de('medico').profesional, 'Dra. Villalobos');
  assert.match(de('medico').tarjeta.alt, /^Doctora /);
  assert.equal(de('dentista').profesional, 'Dr. Robles');
  // El guion que la nombra con articulo lo lleva en el mismo genero.
  for (const giro of giros) {
    const guion = JSON.stringify(await leer(`guiones/${giro.clave}.json`));
    const femenino = !/^Dr\. /.test(giro.profesional);
    // "el" atrapa tambien "del"; "al" va aparte. En femenino se dice "la", "de la" y "a la".
    const ajenos = femenino ? ['el {profesional}', 'al {profesional}'] : ['la {profesional}'];
    for (const ajeno of ajenos) assert.ok(!guion.includes(ajeno), `${giro.clave}: "${ajeno}" no concuerda`);
  }
});

test('planes: lo que hace falta para empezar va en cuatro fichas con su icono, y la cedula aparte', () => {
  // El dueno (20-nov-2026): "que la seccion 'Qué necesitas para empezar' sea mas visual y que de la impresion que es
  // super facil". Eligio las cuatro fichas del boceto.
  const { planes } = secciones;
  assert.equal(planes.requisitosTitulo, 'Qué necesitas para empezar');
  assert.equal(planes.requisitosBajada, 'Cuatro cosas sencillas. Casi todas ya las tienes.');
  assert.deepEqual(
    planes.requisitos.map((/** @type {any} */ uno) => [uno.icono, uno.titulo, uno.texto]),
    [
      [
        'celular',
        'Un número exclusivo para tu negocio',
        'Con WhatsApp Business. Puede ser un chip aparte en tu mismo celular.',
      ],
      ['calendario', 'Tu cuenta de Google', 'Para tu calendario.'],
      ['cuenta', 'Tu cuenta de Mercado Pago', 'Para recibir tus anticipos.'],
      ['libreta', 'Tu lista de precios', 'Con una foto basta.'],
    ],
  );
  assert.equal(planes.requisitosNota, 'Si eres dentista o médico, una más: tu cédula profesional.');
  // La pagina las ensena tal cual: cada ficha con su icono de adorno, su titulo y su renglon.
  const bloque = seccion('planes');
  const fichas = [
    ...bloque.matchAll(
      /<li class="requisito"><span class="requisito__icono" aria-hidden="true"><svg class="requisito__trazo" focusable="false"><use href="#i-(\w+)"\/><\/svg><\/span><h4>([^<]+)<\/h4><p>([^<]+)<\/p><\/li>/g,
    ),
  ].map(([, icono, titulo, texto]) => ({ icono, titulo, texto }));
  assert.deepEqual(fichas, planes.requisitos);
  assert.ok(bloque.includes(`<p>${planes.requisitosBajada}</p>`));
  assert.ok(
    bloque.includes(
      `<p class="planes__cedula"><svg class="planes__cedula-icono" aria-hidden="true" focusable="false"><use href="#i-cedula"/></svg>${planes.requisitosNota}</p>`,
    ),
  );
  // Cada icono que piden esta dibujado en la pagina, una sola vez.
  for (const id of ['i-celular', 'i-calendario', 'i-cuenta', 'i-libreta', 'i-cedula']) {
    assert.equal(html.split(`<symbol id="${id}"`).length - 1, 1, id);
  }
  // Ninguna ficha promete un tiempo de alta ni dice que algo es gratis.
  assert.doesNotMatch(JSON.stringify([planes.requisitos, planes.requisitosBajada]), /minutos|hoy mismo|gratis/i);
  // Y llms.txt las cuenta con para que es cada una, y la cedula al final.
  const llms = archivos.get('llms.txt')?.toString('utf8') ?? '';
  const lista = /## Qué se necesita para empezar\n\n([\s\S]*?)\n\n## /.exec(llms)?.[1]?.split('\n');
  assert.deepEqual(lista, [
    ...planes.requisitos.map((/** @type {any} */ uno) => `- ${uno.titulo}. ${uno.texto}`),
    `- ${planes.requisitosNota}`,
  ]);
});
