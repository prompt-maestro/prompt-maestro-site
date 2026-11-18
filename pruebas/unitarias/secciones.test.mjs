// @ts-check
// Las secciones de despues de la demostracion, leidas de la pagina ya armada: la ruta de "Como funciona", los retratos
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

test('como funciona: seis estaciones en orden, con los rotulos aprobados, y cada una dice quien la hace', () => {
  const { lista } = secciones.pasos;
  assert.deepEqual(
    lista.map((/** @type {any} */ paso) => [paso.quien, paso.rotulo]),
    [
      ['Tu clientela', 'Te escriben por WhatsApp'],
      ['Tu agente', 'Contesta y ofrece tus horarios libres'],
      ['Tu agente', 'Aparta el lugar y cobra el anticipo'],
      ['Tu agente', 'La cita entra a tu calendario, garantizada'],
      ['Tu agente', 'Recuerda la cita, un día y una hora antes'],
      ['Tú', 'Tocas sí o no: ¿asistió?'],
    ],
  );
  const bloque = seccion('como-funciona');
  assert.ok(bloque.includes('>De «hola» a «asistió», <em>casi sin tocar el celular.</em></h2>'));
  // Es una lista ordenada. Cada estacion lleva su papel, quien la hace (para quien no la ve), su numero y su rotulo.
  assert.match(bloque, /<ol class="ruta__lista" role="list">/);
  const estaciones = [
    ...bloque.matchAll(
      /<li class="ruta__estacion" data-papel="(\w+)"( data-abre)? data-enciende>\s*<span class="ruta__punto" aria-hidden="true"><\/span>\s*<span class="ruta__quien( solo-lector)?">([^<]+)<\/span>\s*<span class="ruta__numero" aria-hidden="true">(\d\d)<\/span>\s*<p class="ruta__rotulo">([^<]+)<\/p>/g,
    ),
  ].map(([, papel, abre, escondido, quien, numero, rotulo]) => ({
    papel,
    abre: Boolean(abre),
    escondido: Boolean(escondido),
    quien,
    numero,
    rotulo,
  }));
  assert.deepEqual(
    estaciones,
    lista.map((/** @type {any} */ paso, /** @type {number} */ lugar) => ({
      papel: paso.papel,
      abre: paso.abre === true,
      // Solo la estacion que abre un tramo ensena quien lo hace; las demas lo dicen para el lector de pantalla.
      escondido: paso.abre !== true,
      quien: paso.quien,
      numero: `0${lugar + 1}`,
      rotulo: paso.rotulo,
    })),
  );
  assert.deepEqual(
    estaciones.map(({ papel }) => papel),
    ['clientela', 'agente', 'agente', 'agente', 'agente', 'tu'],
  );
  assert.deepEqual(
    estaciones.filter(({ abre }) => abre).map(({ numero }) => numero),
    ['01', '02', '06'],
  );
  // En pantallas anchas quien hace que va en una fila aparte, que el lector de pantalla no repite.
  const fila = /<p class="ruta__quienes" aria-hidden="true">(.*?)<\/p>/.exec(bloque)?.[1] ?? '';
  assert.deepEqual(
    [...fila.matchAll(/<span class="ruta__de" data-papel="(\w+)">([^<]+)<\/span>/g)].map(([, papel, quien]) => [
      papel,
      quien,
    ]),
    [
      ['clientela', 'Tu clientela'],
      ['agente', 'Tu agente'],
      ['tu', 'Tú'],
    ],
  );
  // Los seis renglones largos de antes ya no van.
  for (const viejo of [
    'Le escriben al WhatsApp de tu negocio.',
    'horarios reales de tu Google Calendar',
    'pasos__lista',
  ]) {
    assert.ok(!html.includes(viejo), viejo);
  }
});

test('como funciona: cada estacion trae su mini escena, de adorno, con los textos de los datos', () => {
  const bloque = seccion('como-funciona');
  const escenas = [...bloque.matchAll(/<div class="ruta__escena"( aria-hidden="true")?>([\s\S]*?)<\/div>\s*<\/li>/g)];
  assert.equal(escenas.length, 6);
  for (const [, adorno] of escenas) assert.ok(adorno, 'una escena no es de adorno');
  const texto = (/** @type {number} */ lugar) =>
    (escenas[lugar]?.[2] ?? '')
      .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  assert.equal(texto(0), 'Hola, ¿tienes lugar el jueves? 10:12 a. m.');
  assert.equal(texto(1), 'Te puedo ofrecer el jueves: 10:00 am 12:30 pm 5:00 pm');
  assert.equal(texto(2), '$ Anticipo Gelish $150');
  assert.equal(texto(3), 'JUE 19 5:00 pm Ana · Gelish');
  assert.equal(texto(4), 'Te recordamos tu cita Mañana, 5:00 pm');
  assert.equal(texto(5), 'Sí No');
  // La hora elegida es la ultima, y el "Si" es el que va tocado.
  assert.match(escenas[1]?.[2] ?? '', /<span>10:00 am<\/span><span>12:30 pm<\/span><span data-elegida>5:00 pm<\/span>/);
  assert.match(escenas[5]?.[2] ?? '', /<span data-toca>Sí<\/span><span>No<\/span>/);
  // La cita entra sellada: el sello de la marca, y solo en esa estacion.
  assert.equal(escenas.filter(([, , dentro]) => dentro?.includes('class="sello"')).length, 1);
  assert.match(escenas[3]?.[2] ?? '', /class="sello"/);
  // Ningun texto de las escenas vive en la plantilla: salen de secciones.json.
  const enDatos = JSON.stringify(secciones.pasos.lista);
  for (const dicho of [
    'Hola, ¿tienes lugar el jueves?',
    'Te puedo ofrecer el jueves:',
    'Anticipo Gelish',
    'Te recordamos tu cita',
    'Mañana, 5:00 pm',
  ]) {
    assert.ok(enDatos.includes(dicho), dicho);
  }
});

test('como funciona: lo que haces tu conserva sus tres renglones, cada uno con un icono que existe', () => {
  const bloque = seccion('como-funciona');
  assert.deepEqual(
    secciones.pasos.tu.map((/** @type {any} */ tarea) => tarea.texto),
    [
      'Tocar sí o no al final de cada cita.',
      'Contestar tú cuando tu agente te avise que no sabe algo.',
      'Pedirle cambios por WhatsApp: nada se aplica sin tu sí.',
    ],
  );
  assert.ok(bloque.includes('<h3 class="pasos__subtitulo">Lo que haces tú</h3>'));
  const renglones = [
    ...bloque.matchAll(
      /<li><svg class="pasos__icono" aria-hidden="true" focusable="false"><use href="#i-(\w+)"\/><\/svg>([^<]+)<\/li>/g,
    ),
  ].map(([, icono, texto]) => ({ icono, texto }));
  assert.deepEqual(renglones, secciones.pasos.tu);
  assert.deepEqual(
    renglones.map(({ icono }) => icono),
    ['toque', 'aviso', 'perillas'],
  );
  // Todo icono que la pagina pide esta dibujado en ella, una sola vez.
  const pedidos = new Set([...html.matchAll(/<use href="#(i-\w+)"/g)].map(([, id]) => id));
  assert.ok(pedidos.size >= 6);
  for (const id of pedidos) assert.equal(html.split(`<symbol id="${id}"`).length - 1, 1, id);
});

test('llms.txt cuenta los seis pasos con quien hace cada uno', () => {
  const llms = archivos.get('llms.txt')?.toString('utf8') ?? '';
  const pasos = /## Cómo funciona\n\n([\s\S]*?)\n\n## /.exec(llms)?.[1]?.split('\n');
  assert.deepEqual(pasos, [
    '1. Tu clientela: Te escriben por WhatsApp',
    '2. Tu agente: Contesta y ofrece tus horarios libres',
    '3. Tu agente: Aparta el lugar y cobra el anticipo',
    '4. Tu agente: La cita entra a tu calendario, garantizada',
    '5. Tu agente: Recuerda la cita, un día y una hora antes',
    '6. Tú: Tocas sí o no: ¿asistió?',
  ]);
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
      'Cotiza diseños con tu catálogo y agenda con el anticipo pagado, mientras tú sigues con tu clienta.',
      'Agenda limpiezas y valoraciones con anticipo pagado, sin que sueltes el instrumental.',
      'Agenda consultas con respeto y discreción. Nunca opina de salud: una urgencia te llega a ti.',
    ],
  );
  for (const giro of giros) {
    assert.ok(
      giro.tarjeta.alt.length > 15 && !/^foto|^imagen/i.test(giro.tarjeta.alt),
      `${giro.clave}: el alt describe la foto`,
    );
  }
  const bloque = seccion('para-quien');
  assert.ok(bloque.includes('>Hoy, para uñas, dentistas y médicos. <em>Pronto, más oficios.</em></h2>'));
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
      `<a class="oficio__otro" href="${sitio.contactoOficio}" data-lugar="para-quien"><span><b>¿El tuyo no está?</b> Escríbenos y te avisamos.</span>`,
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
  // La nota de la instalacion no cambia, con su "No cobramos comision por cita."
  assert.match(
    renglones[0] ?? '',
    /^Instalación única de \$[\d,]+\. La mensualidad empieza el día que tu agente queda activo\. Pago con tarjeta\. No cobramos comisión por cita\.$/,
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
  assert.ok(usadas.length >= 4);
  for (const nombre of usadas) assert.ok(vistas.has(nombre), `no existe la animacion "${nombre}"`);
});
