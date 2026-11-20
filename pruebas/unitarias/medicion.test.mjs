// @ts-check
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { historiaDe } from '../../fuente/js/demo.js';
import {
  ALTA,
  archivoDe,
  clicEnEnlace,
  conTope,
  demoFin,
  demoInicio,
  demoPaso,
  ejemploCambio,
  errorJs,
  GIROS,
  LUGARES,
  MODOS,
  mandar,
  PASOS,
  preguntaAbre,
} from '../../fuente/js/medicion.js';

/** @typedef {import('../../fuente/js/medicion.js').Medida} Medida */

const FUENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuente');
const leer = (/** @type {string} */ ruta) => readFile(path.join(FUENTE, ruta), 'utf8');
const leerDatos = async (/** @type {string} */ ruta) => JSON.parse(await leer(`datos/${ruta}`));

/** Un rastreador de mentira que anota lo que le mandan. */
function anotador() {
  /** @type {unknown[][]} */
  const llamadas = [];
  return { llamadas, track: (/** @type {unknown[]} */ ...argumentos) => llamadas.push(argumentos) };
}

// Lo que alguien podria colar en un dato: nada de esto esta en ningun vocabulario.
const RAROS = [undefined, null, '', ' ', 'Unas', 'unas ', 'otro', 'ana@correo.com', 7, true, {}, ['unas']];

test('demo_inicio lleva el giro y como arranco, y solo valores de la lista', () => {
  assert.deepEqual(demoInicio({ giro: 'unas', modo: 'toque' }), {
    nombre: 'demo_inicio',
    propiedades: { giro: 'unas', modo: 'toque' },
  });
  assert.deepEqual(demoInicio({ giro: 'medico', modo: 'sola' })?.propiedades, { giro: 'medico', modo: 'sola' });
  for (const raro of RAROS) {
    assert.equal(demoInicio({ giro: raro, modo: 'toque' }), null);
    assert.equal(demoInicio({ giro: 'unas', modo: raro }), null);
  }
  assert.equal(demoInicio({ giro: 'unas' }), null);
  assert.equal(demoInicio(null), null);
  assert.equal(demoInicio(undefined), null);
});

test('demo_paso solo conoce los seis pasos de la historia: ni el reposo, ni los finales, ni el cuadro final', () => {
  for (const paso of PASOS) {
    assert.deepEqual(demoPaso({ giro: 'dentista', paso }), {
      nombre: 'demo_paso',
      propiedades: { giro: 'dentista', paso },
    });
  }
  for (const paso of ['reposo', 'finSi', 'finNo', 'cierre', ...RAROS]) {
    assert.equal(demoPaso({ giro: 'dentista', paso }), null);
  }
  for (const raro of RAROS) assert.equal(demoPaso({ giro: raro, paso: 'precio' }), null);
  assert.equal(demoPaso(null), null);
});

test('demo_fin dice si asistio con "si" o "no", y solo a partir de un verdadero o falso', () => {
  assert.deepEqual(demoFin({ giro: 'unas', asistio: true }), {
    nombre: 'demo_fin',
    propiedades: { giro: 'unas', asistio: 'si' },
  });
  assert.deepEqual(demoFin({ giro: 'unas', asistio: false })?.propiedades, { giro: 'unas', asistio: 'no' });
  for (const raro of ['si', 'no', 1, 0, null, undefined]) assert.equal(demoFin({ giro: 'unas', asistio: raro }), null);
  for (const raro of RAROS) assert.equal(demoFin({ giro: raro, asistio: true }), null);
  assert.equal(demoFin(null), null);
});

test('ejemplo_cambio lleva solo el giro elegido', () => {
  assert.deepEqual(ejemploCambio({ giro: 'medico' }), { nombre: 'ejemplo_cambio', propiedades: { giro: 'medico' } });
  for (const raro of RAROS) assert.equal(ejemploCambio({ giro: raro }), null);
  assert.equal(ejemploCambio(null), null);
});

test('un clic al alta es clic_empieza con su lugar y, dentro de una tarjeta de plan, con el plan en minusculas', () => {
  assert.deepEqual(clicEnEnlace({ href: ALTA, lugar: 'barra' }), {
    nombre: 'clic_empieza',
    propiedades: { lugar: 'barra' },
  });
  assert.deepEqual(clicEnEnlace({ href: ALTA, lugar: 'planes', plan: 'Plata' }), {
    nombre: 'clic_empieza',
    propiedades: { lugar: 'planes', plan: 'plata' },
  });
  assert.deepEqual(clicEnEnlace({ href: ALTA, lugar: 'planes', plan: ' Básico Plus 2 ' })?.propiedades, {
    lugar: 'planes',
    plan: 'básico plus 2',
  });
  // Fuera de una tarjeta de plan el evento no lleva la propiedad, ni vacia.
  assert.deepEqual(Object.keys(clicEnEnlace({ href: ALTA, lugar: 'cierre' })?.propiedades ?? {}), ['lugar']);
  for (const lugar of LUGARES) assert.equal(clicEnEnlace({ href: ALTA, lugar })?.propiedades?.lugar, lugar);
});

test('un clic sin lugar conocido, o con un plan que no parece nombre de plan, no se mide', () => {
  for (const raro of [...RAROS, 'planes ', 'Planes', 'hero']) {
    assert.equal(clicEnEnlace({ href: ALTA, lugar: raro }), null);
    assert.equal(clicEnEnlace({ href: 'mailto:hola@prompt-maestro.com', lugar: raro }), null);
  }
  const malos = ['', ' ', 'plata<script>', 'oro; drop', 'https://x.com', 'a'.repeat(25), 7, {}, 'plata  oro', 'oro-2'];
  for (const plan of malos) assert.equal(clicEnEnlace({ href: ALTA, lugar: 'planes', plan }), null, String(plan));
  assert.equal(clicEnEnlace(null), null);
  assert.equal(clicEnEnlace({ lugar: 'barra' }), null);
});

test('solo cuentan el enlace del alta, tal cual, y los de correo; del correo no sale ni la direccion ni el asunto', () => {
  const correo = 'mailto:hola@prompt-maestro.com?subject=Quiero%20que%20me%20acompa%C3%B1en';
  assert.deepEqual(clicEnEnlace({ href: correo, lugar: 'citas' }), {
    nombre: 'clic_acompanar',
    propiedades: { lugar: 'citas' },
  });
  // Aunque el enlace de correo este dentro de una tarjeta de plan, clic_acompanar solo lleva el lugar.
  assert.deepEqual(clicEnEnlace({ href: correo, lugar: 'planes', plan: 'Oro' })?.propiedades, { lugar: 'planes' });
  const otros = [
    '#planes',
    'https://prompt-maestro.com/',
    'https://prompt-maestro.com/terminos',
    `${ALTA}otra`,
    `${ALTA}?plan=oro`,
    'https://alta.prompt-maestro.com.mx/',
    'http://alta.prompt-maestro.com/',
    'tel:+523300000000',
    '',
  ];
  for (const href of otros) assert.equal(clicEnEnlace({ href, lugar: 'barra' }), null, href);
});

test('pregunta_abre lleva la posicion de la pregunta, de 1 en adelante', () => {
  assert.deepEqual(preguntaAbre({ id: 1 }), { nombre: 'pregunta_abre', propiedades: { id: 1 } });
  assert.deepEqual(preguntaAbre({ id: 12 })?.propiedades, { id: 12 });
  // 0 es lo que sale cuando la pregunta no esta en la lista.
  for (const id of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3', null, undefined]) {
    assert.equal(preguntaAbre({ id }), null);
  }
  assert.equal(preguntaAbre(null), null);
});

test('archivoDe deja solo el nombre del archivo: sin sitio, sin carpetas, sin parametros y sin ancla', () => {
  assert.equal(archivoDe('https://prompt-maestro.com/a/0123456789/js/demo-vista.js'), 'demo-vista.js');
  assert.equal(archivoDe('https://prompt-maestro.com/a/0123456789/js/pagina.js?v=3&correo=ana@x.com#l10'), 'pagina.js');
  assert.equal(archivoDe('http://127.0.0.1:4173/pagina-previa/a/abc/js/corto-vista.js'), 'corto-vista.js');
  assert.equal(archivoDe('https://cloud.umami.is/script.js'), 'script.js');
  assert.equal(archivoDe('https://prompt-maestro.com/index.html'), 'index.html');
});

test('archivoDe no inventa un archivo donde no lo hay', () => {
  const sinArchivo = [
    '',
    'demo-vista.js',
    'js/demo-vista.js',
    'https://prompt-maestro.com',
    'https://prompt-maestro.com/',
    'https://prompt-maestro.com/a/js/',
    'https://prompt-maestro.com/pagina',
    'https://prompt-maestro.com/a/mi%20archivo.js',
    `https://prompt-maestro.com/${'a'.repeat(58)}.js`,
    'chrome-extension://abcdefgh/content.js',
    'webkit-masked-url://hidden/',
    'blob:https://prompt-maestro.com/5f0c1d2e',
    'data:text/javascript,alert(1)',
    'file:///C:/Users/ana/Desktop/pagina.js',
    'javascript:void(0)',
    undefined,
    null,
    42,
    {},
  ];
  for (const url of sinArchivo) assert.equal(archivoDe(url), null, String(url));
});

test('error_js lleva el nombre del archivo y la linea, y nada mas', () => {
  const medida = errorJs({ archivo: 'https://prompt-maestro.com/a/0123456789/js/demo-vista.js?x=1', linea: 348 });
  assert.deepEqual(medida, { nombre: 'error_js', propiedades: { archivo: 'demo-vista.js', linea: 348 } });
  // Un error sin archivo (de otro sitio, o de codigo sin archivo) o sin linea no se mide.
  assert.equal(errorJs({ archivo: '', linea: 0 }), null);
  assert.equal(errorJs({ archivo: '', linea: 12 }), null);
  assert.equal(errorJs({ archivo: 'https://prompt-maestro.com/a/x/js/pagina.js', linea: 0 }), null);
  assert.equal(errorJs({ archivo: 'https://prompt-maestro.com/a/x/js/pagina.js', linea: '12' }), null);
  assert.equal(errorJs({ archivo: 'https://prompt-maestro.com/a/x/js/pagina.js' }), null);
  assert.equal(errorJs({ linea: 3 }), null);
  assert.equal(errorJs(null), null);
});

test('privacidad: ningun evento lleva un texto libre, una direccion completa ni un valor fuera de su lista', () => {
  const SECRETO = 'zutana@correo.com 3312345678 $1,200';
  const direccion = `https://prompt-maestro.com/a/0123456789/js/pagina.js?q=${encodeURIComponent(SECRETO)}`;
  // A cada dato se le cuela ademas algo que nadie pidio: lo que la persona escribio, el texto de un error.
  /** @type {(datos: Record<string, unknown>) => Record<string, unknown>} */
  const conDeMas = (datos) => ({ ...datos, texto: SECRETO, mensaje: SECRETO });
  /** @type {(Medida | null)[]} */
  const medidas = [
    demoInicio(conDeMas({ giro: 'unas', modo: 'toque' })),
    demoPaso(conDeMas({ giro: 'unas', paso: 'pagado' })),
    demoFin(conDeMas({ giro: 'unas', asistio: true })),
    ejemploCambio(conDeMas({ giro: 'dentista' })),
    clicEnEnlace(conDeMas({ href: ALTA, lugar: 'planes', plan: 'Oro' })),
    clicEnEnlace(
      conDeMas({ href: `mailto:hola@prompt-maestro.com?subject=${encodeURIComponent(SECRETO)}`, lugar: 'pie' }),
    ),
    preguntaAbre(conDeMas({ id: 2 })),
    errorJs(conDeMas({ archivo: direccion, linea: 9 })),
  ];
  /** @type {Record<string, readonly string[]>} */
  const listas = { giro: GIROS, paso: PASOS, modo: MODOS, lugar: LUGARES, asistio: ['si', 'no'] };
  const permitidas = {
    demo_inicio: ['giro', 'modo'],
    demo_paso: ['giro', 'paso'],
    demo_fin: ['giro', 'asistio'],
    ejemplo_cambio: ['giro'],
    clic_empieza: ['lugar', 'plan'],
    clic_acompanar: ['lugar'],
    pregunta_abre: ['id'],
    error_js: ['archivo', 'linea'],
  };
  assert.deepEqual(medidas.map((medida) => medida?.nombre).sort(), Object.keys(permitidas).sort());
  for (const medida of medidas) {
    assert.ok(medida);
    const escrito = JSON.stringify(medida.propiedades ?? {});
    for (const pedazo of ['zutana', 'correo', '3312345678', '1,200', '1%2C200', 'http', '://', '?', '@', 'subject']) {
      assert.equal(escrito.includes(pedazo), false, `${medida.nombre} trae "${pedazo}"`);
    }
    const propias = /** @type {Record<string, string[]>} */ (permitidas)[medida.nombre] ?? [];
    for (const [clave, valor] of Object.entries(medida.propiedades ?? {})) {
      assert.ok(propias.includes(clave), `${medida.nombre} no lleva "${clave}"`);
      const lista = listas[clave];
      if (lista) assert.ok(lista.includes(String(valor)), `${medida.nombre}.${clave} = ${valor}`);
    }
  }
});

test('conTope deja pasar cada clave una sola vez y, en total, hasta el tope', () => {
  const pasa = conTope(3);
  assert.equal(pasa('a'), true);
  assert.equal(pasa('a'), false);
  assert.equal(pasa('b'), true);
  assert.equal(pasa('c'), true);
  // Lleno: ya no pasa ninguna nueva, y las viejas siguen sin repetirse.
  assert.equal(pasa('d'), false);
  assert.equal(pasa('d'), false);
  assert.equal(pasa('b'), false);
  assert.equal(conTope(0)('a'), false);
});

test('mandar le entrega al rastreador el nombre y las propiedades; sin propiedades, solo el nombre', () => {
  const umami = anotador();
  assert.equal(mandar(umami, demoPaso({ giro: 'unas', paso: 'precio' })), true);
  // Hoy toda medida lleva propiedades (la unica que no llevaba era la de la calculadora, que ya no existe); una
  // sin ellas se sigue mandando solo con su nombre.
  assert.equal(mandar(umami, { nombre: 'sin_propiedades' }), true);
  assert.deepEqual(umami.llamadas, [['demo_paso', { giro: 'unas', paso: 'precio' }], ['sin_propiedades']]);
});

test('mandar no hace nada sin evento o sin rastreador, y no lanza', () => {
  const umami = anotador();
  // Lo que no paso la validacion llega como null: no se manda.
  assert.equal(mandar(umami, demoPaso({ giro: 'otro', paso: 'precio' })), false);
  assert.deepEqual(umami.llamadas, []);
  const medida = demoPaso({ giro: 'unas', paso: 'precio' });
  for (const ausente of [undefined, null, {}, { track: 'no es funcion' }, 'umami', 0, []]) {
    assert.equal(mandar(ausente, medida), false);
  }
});

test('mandar se traga lo que truene en el rastreador, de inmediato o despues', async () => {
  const medida = demoPaso({ giro: 'unas', paso: 'precio' });
  const truena = {
    track() {
      throw new Error('umami roto');
    },
  };
  assert.equal(mandar(truena, medida), false);
  const envenenado = Object.defineProperty({}, 'track', {
    get() {
      throw new Error('ni se deja leer');
    },
  });
  assert.equal(mandar(envenenado, medida), false);
  // Sin red, el rastreador contesta con una promesa rota: tampoco queda un rechazo suelto.
  /** @type {unknown[]} */
  const sueltos = [];
  const anotar = (/** @type {unknown} */ razon) => sueltos.push(razon);
  process.on('unhandledRejection', anotar);
  try {
    assert.equal(mandar({ track: () => Promise.reject(new Error('sin red')) }, medida), true);
    await new Promise((listo) => setTimeout(listo, 20));
  } finally {
    process.off('unhandledRejection', anotar);
  }
  assert.deepEqual(sueltos, []);
});

test('el vocabulario va al dia con la pagina: los giros, el alta y los nombres de los planes', async () => {
  const giros = /** @type {{ clave: string }[]} */ (await leerDatos('giros.json'));
  assert.ok(giros.length > 0);
  for (const { clave } of giros) {
    assert.ok(demoInicio({ giro: clave, modo: 'toque' }), `falta el giro "${clave}" en GIROS de medicion.js`);
  }
  assert.equal((await leerDatos('sitio.json')).alta, ALTA);
  const { planes } = /** @type {{ planes: { nombre: string }[] }} */ (await leerDatos('planes.json'));
  assert.ok(planes.length > 0);
  for (const { nombre } of planes) {
    assert.equal(
      clicEnEnlace({ href: ALTA, lugar: 'planes', plan: nombre })?.propiedades?.plan,
      nombre.toLowerCase(),
      `el plan "${nombre}" no pasa la validacion de medicion.js`,
    );
  }
});

test('cada data-lugar que usa la pagina esta en la lista: un lugar nuevo no se queda sin medir', async () => {
  /** @type {string[]} */
  const usados = [];
  for (const carpeta of ['plantillas', 'plantillas/parciales', 'js']) {
    for (const archivo of await readdir(path.join(FUENTE, carpeta), { withFileTypes: true })) {
      if (!archivo.isFile()) continue;
      const texto = await leer(`${carpeta}/${archivo.name}`);
      // En una plantilla va como atributo; en el codigo que pinta un enlace, como dato del elemento.
      for (const hallazgo of texto.matchAll(/data-lugar="([^"]*)"|dataset\.lugar = '([^']*)'/g)) {
        usados.push(hallazgo[1] ?? hallazgo[2] ?? '');
      }
    }
  }
  assert.ok(usados.length >= 5, 'no encontre los data-lugar de la pagina');
  for (const lugar of new Set(usados)) {
    assert.ok(clicEnEnlace({ href: ALTA, lugar }), `falta el lugar "${lugar}" en LUGARES de medicion.js`);
  }
});

test('los pasos que se miden son los de la historia, en su orden', async () => {
  const demo = await leerDatos('demo.json');
  const [giro] = await leerDatos('giros.json');
  const ejemplo = { ...demo, giro, guion: await leerDatos(`guiones/${giro.clave}.json`) };
  /** @param {boolean} asistio  los pasos por los que pasa la historia, cada uno una vez y en su orden */
  const recorridos = (asistio) => [...new Set(historiaDe(ejemplo, asistio).map((toma) => toma.cuadro.paso))];
  // La historia pasa por los seis pasos, luego por uno de sus dos finales y termina en el cierre.
  assert.deepEqual(recorridos(true), [...PASOS, 'finSi', 'cierre']);
  assert.deepEqual(recorridos(false), [...PASOS, 'finNo', 'cierre']);
  // Y ningun paso regresa: una vez que la historia lo deja, no vuelve a el.
  const pasos = historiaDe(ejemplo, true).map((toma) => toma.cuadro.paso);
  assert.deepEqual(
    pasos.filter((paso, lugar) => paso !== pasos[lugar - 1]),
    [...PASOS, 'finSi', 'cierre'],
  );
});

test('la demostracion avisa, pero no sabe quien mide', async () => {
  const vista = await leer('js/demo-vista.js');
  assert.equal(/umami|medicion/i.test(vista), false);
  for (const aviso of ['inicio', 'paso', 'fin', 'ejemplo']) assert.ok(vista.includes(`avisar('${aviso}'`), aviso);
});
