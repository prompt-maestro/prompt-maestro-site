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
import { soloLoQueSeVende } from '../../herramientas/oficios.mjs';

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
/** Los datos tal como estan en la fuente: con lo de todos los oficios, a la venta o guardados. @type {any} */
const secciones = await leer('secciones.json');
/** @type {any[]} */
const giros = await leer('giros.json');
/** @type {any[]} */
const preguntas = await leer('preguntas.json');
/** Lo que la pagina ensena de ellos: solo lo de los oficios a la venta (giros.json, "aLaVenta"). */
const { datos: vendido, claves: aLaVenta } = soloLoQueSeVende({ giros, preguntas, secciones });
/** Los oficios que ensena la pagina, en su orden. @type {any[]} */
const girosALaVista = vendido.giros;
/** Las preguntas que ensena la pagina: las de un oficio guardado ("solo") no van. @type {any[]} */
const preguntasALaVista = vendido.preguntas;
/** La nota de la cedula, si la pagina la ensena (solo con un oficio de salud a la venta); si no, vacia. */
const notaALaVista = /** @type {string} */ (vendido.secciones.planes.requisitosNota);
/** Si la pagina ensena un oficio de salud. */
const conSalud = ['dentista', 'medico'].some((clave) => aLaVenta.has(clave));

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
  assert.ok(bloque.includes('>Hoy, para profesionales de uñas. <em>Pronto, más oficios y profesiones.</em></h2>'));
  // Una tarjeta por oficio a la venta; de un guardado, ni su tarjeta ni su retrato.
  const tarjetas = [...bloque.matchAll(/<li class="oficio__tarjeta" data-enciende>([\s\S]*?)<\/li>/g)].map(
    ([, dentro]) => dentro ?? '',
  );
  assert.equal(tarjetas.length, girosALaVista.length);
  for (const giro of giros.filter((uno) => !aLaVenta.has(uno.clave))) {
    assert.ok(!bloque.includes(`<h3>${giro.tarjeta.nombre}</h3>`), giro.clave);
    assert.ok(!bloque.includes(`retratos/${giro.clave}-`), giro.clave);
  }
  for (const [lugar, giro] of girosALaVista.entries()) {
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
  /** @param {any[]} lista */
  const retratosDe = (lista) =>
    lista
      .flatMap((giro) =>
        ANCHOS.flatMap((ancho) => ['avif', 'webp'].map((tipo) => `${giro.clave}-retrato-${ancho}.${tipo}`)),
      )
      .sort();
  // En la fuente estan los de todos los oficios, tambien los guardados: encender uno no pide fotos nuevas.
  const esperados = retratosDe(giros);
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
  // Y viajan en lo armado, en su carpeta con huella, solo los de los oficios a la venta.
  const armadas = [...archivos.keys()]
    .filter((ruta) => /^r\/[0-9a-f]{10}\/retratos\//.test(ruta))
    .map((ruta) => ruta.replace(/^r\/[0-9a-f]{10}\/retratos\//, ''))
    .sort();
  assert.deepEqual(armadas, retratosDe(girosALaVista));
});

test('la tarjeta de cada oficio y su interruptor no viajan en los datos de la demostracion: a ella no le hacen falta', () => {
  const datos = JSON.parse(/<script type="application\/json" data-demo-datos>(.*?)<\/script>/s.exec(html)?.[1] ?? '{}');
  assert.deepEqual(
    datos.ejemplos.map((/** @type {any} */ ejemplo) => ejemplo.giro.clave),
    girosALaVista.map((giro) => giro.clave),
  );
  for (const { giro } of datos.ejemplos) {
    assert.equal('tarjeta' in giro, false, giro.clave);
    assert.equal('aLaVenta' in giro, false, giro.clave);
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
      '¿El dinero de los anticipos pasa por ustedes?',
      '¿Qué pasa si mi clienta no llega a su cita?',
      '¿Y si alguien no quiere pagar el anticipo?',
      '¿Tengo que cambiar mi número de WhatsApp?',
      '¿Qué pasa si le preguntan algo que mi agente no sabe?',
    ],
  );
  // Van primero: asi la pagina, los datos estructurados y llms.txt las llevan en el mismo orden.
  assert.ok(preguntas.slice(0, 5).every((duda) => duda.principal === true));
  assert.deepEqual(
    preguntas.slice(5).map((duda) => duda.pregunta),
    [
      '¿Mis clientas tienen que instalar algo?',
      '¿Puedo contestar yo una conversación?',
      'Soy dentista o médico. ¿Mi agente opina de salud?',
      '¿Reemplaza mi agenda o mis expedientes?',
      '¿Me trae clientela nueva?',
      '¿Cómo sé que no se va a equivocar con mis precios?',
      '¿Qué pasa con los mensajes y los datos de mis clientas?',
      '¿Y si mi profesión u oficio no está en la lista?',
    ],
  );
  assert.ok(preguntas.slice(5).every((duda) => !('principal' in duda)));
  // Las dos de salud solo se ensenan con un oficio de salud a la venta (el dueno, 23-nov-2026: hoy solo unas). Las
  // principales son de todos: las cinco de arriba nunca dependen del oficio.
  assert.deepEqual(
    preguntas.filter((duda) => duda.solo).map((duda) => [duda.pregunta, duda.solo]),
    [
      ['Soy dentista o médico. ¿Mi agente opina de salud?', ['dentista', 'medico']],
      ['¿Reemplaza mi agenda o mis expedientes?', ['dentista', 'medico']],
    ],
  );
  assert.ok(preguntas.filter((duda) => duda.principal).every((duda) => !duda.solo));
  assert.equal(preguntasALaVista.length, conSalud ? 13 : 11);
});

test('preguntas: cada una se entiende sola, sin dejar espacio a dudas, y ninguna respuesta nombra examenes', () => {
  // El dueno (20-nov-2026): "que todas las preguntas y respuestas sean claras y faciles de entender por cualquier
  // persona", con este ejemplo: "¿que pasa si no llega?" no dice quien; "si no llega el paciente/cliente", si.
  const de = (/** @type {string} */ inicio) => {
    const duda = preguntas.find((una) => una.pregunta.startsWith(inicio));
    assert.ok(duda, inicio);
    return duda;
  };
  // Las que no decian de quien o de que hablaban, ya lo dicen.
  assert.match(de('¿Qué pasa si mi clienta').pregunta, /mi clienta no llega a su cita/);
  assert.match(de('¿El dinero').pregunta, /de los anticipos/);
  assert.match(de('¿Y si alguien').pregunta, /el anticipo/);
  assert.match(de('¿Tengo que cambiar').pregunta, /mi número de WhatsApp/);
  assert.match(de('¿Qué pasa si le preguntan').pregunta, /algo que mi agente no sabe/);
  // Ninguna pregunta se queda en dos o tres palabras sueltas.
  for (const { pregunta } of preguntas) assert.ok(pregunta.split(' ').length >= 4, pregunta);
  // Las respuestas, con lo que el dueno ya habia decidido: sin examenes (19-nov-2026), el oficio que falta "lo
  // platicamos" (como en "Para quien") y, de los datos, lo que no se guarda es lo que le mandan a ella.
  const respuestas = preguntas.map((duda) => duda.respuesta).join(' ');
  assert.doesNotMatch(respuestas, /ex[aá]men|tres veces|errores graves|te avisamos cuando llegue/i);
  assert.equal(de('¿Y si mi profesión').respuesta, 'Escríbenos y lo platicamos.');
  assert.match(
    de('¿Cómo sé').respuesta,
    /^Cotiza solo con los precios de tu catálogo\. Si algo no está ahí, no lo inventa: te avisa\./,
  );
  assert.match(de('¿Qué pasa con los mensajes').respuesta, /los audios y las fotos que te mandan no se guardan/);
  // Las que ensena la pagina hablan de quien ella atiende sin nombrar un oficio que no esta a la venta: sin uno de
  // salud, ni pacientes ni salud (la de las fotos de pacientes salio con ellos).
  if (!conSalud) {
    for (const { pregunta, respuesta } of preguntasALaVista) {
      assert.doesNotMatch(`${pregunta} ${respuesta}`, /paciente|dentista|médic|salud|cédula/i, pregunta);
    }
  }
  // Y las que la tabla de la verdad pide con sus palabras, ahi siguen.
  // El anticipo siempre se queda con ella; nosotros no devolvemos, y si hace falta devolver uno, lo hace ella (el
  // dueno, 20-nov-2026).
  assert.equal(
    de('¿Qué pasa si mi clienta').respuesta,
    'Después de la cita, tu agente te pregunta si tu clienta asistió. Si tocas «No», el anticipo se queda contigo y a ella se le ofrece agendar de nuevo. Nosotros no hacemos devoluciones: si alguna vez quieres devolver un anticipo, lo haces tú directamente.',
  );
  assert.match(de('Soy dentista').respuesta, /No diagnostica ni recomienda medicamentos/);
  assert.match(de('¿Me trae').respuesta, /^No\. Hace que quienes ya te escriben sí lleguen/);
  assert.match(de('¿Y si alguien').respuesta, /tu agente no agenda esa cita/);
});

test('preguntas: cinco a la vista y las demas dentro de "Ver mas preguntas", sin JavaScript y todas cerradas', () => {
  const bloque = seccion('preguntas');
  const [aLaVista = '', resto = ''] = bloque.split('<details class="preguntas__mas">');
  const dudas = (/** @type {string} */ trozo) =>
    [
      ...trozo.matchAll(/<details class="pregunta"><summary><h3>([^<]+)<\/h3><\/summary><p>([^<]+)<\/p><\/details>/g),
    ].map(([, pregunta, respuesta]) => ({ pregunta, respuesta }));
  // Las que ensena la pagina: sin las de un oficio guardado (hoy, sin salud, seis dentro de "Ver mas preguntas").
  const sinMarca = preguntasALaVista.map(({ pregunta, respuesta }) => ({ pregunta, respuesta }));
  assert.deepEqual(dudas(aLaVista), sinMarca.slice(0, 5));
  assert.deepEqual(dudas(resto), sinMarca.slice(5));
  for (const { pregunta } of preguntas.filter((duda) => !preguntasALaVista.includes(duda))) {
    assert.ok(!html.includes(pregunta), `pregunta de un oficio guardado: ${pregunta}`);
  }
  // El boton es el resumen de un <details>: dice una cosa cerrado y otra abierto, y lo demas va dentro de el.
  assert.match(
    resto,
    /^\s*<summary class="boton boton--chico boton--contorno preguntas__ver"><span class="preguntas__ver-mas">Ver más preguntas<\/span><span class="preguntas__ver-menos">Ver menos preguntas<\/span><\/summary>\s*<div class="preguntas__resto">/,
  );
  assert.equal(bloque.split('<details class="preguntas__mas">').length, 2);
  // Nada llega abierto, y no hay un solo boton que dependa de JavaScript.
  assert.doesNotMatch(bloque, /<details[^>]*\sopen|<button/);
  // Las mismas siguen en lo que leen los buscadores y los modelos de lenguaje.
  const llms = archivos.get('llms.txt')?.toString('utf8') ?? '';
  assert.deepEqual(
    [...llms.matchAll(/^### (.+)$/gm)].map(([, pregunta]) => pregunta),
    preguntasALaVista.map(({ pregunta }) => pregunta),
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

test('planes: lo que hace falta para empezar va en cuatro fichas con su icono, y la cedula aparte, solo con salud', () => {
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
  // La cedula solo se pide en salud: la nota se ensena solo si uno de esos oficios esta a la venta.
  assert.deepEqual(planes.requisitosNotaSolo, ['dentista', 'medico']);
  assert.equal(notaALaVista, conSalud ? planes.requisitosNota : '');
  // La pagina las ensena tal cual: cada ficha con su icono de adorno, su titulo y su renglon.
  const bloque = seccion('planes');
  const fichas = [
    ...bloque.matchAll(
      /<li class="requisito"><span class="requisito__icono" aria-hidden="true"><svg class="requisito__trazo" focusable="false"><use href="#i-(\w+)"\/><\/svg><\/span><h4>([^<]+)<\/h4><p>([^<]+)<\/p><\/li>/g,
    ),
  ].map(([, icono, titulo, texto]) => ({ icono, titulo, texto }));
  assert.deepEqual(fichas, planes.requisitos);
  assert.ok(bloque.includes(`<p>${planes.requisitosBajada}</p>`));
  if (notaALaVista) {
    assert.ok(
      bloque.includes(
        `<p class="planes__cedula"><svg class="planes__cedula-icono" aria-hidden="true" focusable="false"><use href="#i-cedula"/></svg>${notaALaVista}</p>`,
      ),
    );
  } else {
    // Sin salud a la venta no hay renglon de la cedula, ni su icono, ni su texto en ningun lado de la pagina.
    assert.ok(!html.includes('planes__cedula'), 'sin salud no va el renglon de la cedula');
    assert.ok(!html.includes('i-cedula'), 'sin salud no viaja el icono de la cedula');
    assert.ok(!html.includes(planes.requisitosNota));
  }
  // Cada icono que piden esta dibujado en la pagina, una sola vez.
  for (const id of ['i-celular', 'i-calendario', 'i-cuenta', 'i-libreta', ...(notaALaVista ? ['i-cedula'] : [])]) {
    assert.equal(html.split(`<symbol id="${id}"`).length - 1, 1, id);
  }
  // Ninguna ficha promete un tiempo de alta ni dice que algo es gratis.
  assert.doesNotMatch(JSON.stringify([planes.requisitos, planes.requisitosBajada]), /minutos|hoy mismo|gratis/i);
  // Y llms.txt las cuenta con para que es cada una, y la cedula al final (si la pagina la ensena).
  const llms = archivos.get('llms.txt')?.toString('utf8') ?? '';
  const lista = /## Qué se necesita para empezar\n\n([\s\S]*?)\n\n## /.exec(llms)?.[1]?.split('\n');
  assert.deepEqual(lista, [
    ...planes.requisitos.map((/** @type {any} */ uno) => `- ${uno.titulo}. ${uno.texto}`),
    ...(notaALaVista ? [`- ${notaALaVista}`] : []),
  ]);
});
