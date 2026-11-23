// @ts-check
// Que oficios ensena la pagina (herramientas/oficios.mjs): el interruptor "aLaVenta" de giros.json, lo que lleva
// "solo" y los recursos de un oficio guardado. Y, ya armada, que de un oficio guardado no viaja nada.
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armarSitio } from '../../herramientas/armado.mjs';
import { clavesALaVenta, esDeUnGuardado, seEnsena, soloLoQueSeVende } from '../../herramientas/oficios.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = async (/** @type {string} */ ruta) =>
  JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', ruta), 'utf8'));

/**
 * Unos datos de juguete con tres oficios: uno a la venta y dos guardados, y de cada cosa una de todos y una de salud.
 * @param {{ dentista?: boolean, medico?: boolean }} [encendidos]
 */
function datosDePrueba({ dentista = false, medico = false } = {}) {
  return {
    giros: [
      { clave: 'unas', aLaVenta: true, nombre: 'Uñas' },
      { clave: 'dentista', aLaVenta: dentista, nombre: 'Dentista' },
      { clave: 'medico', aLaVenta: medico, nombre: 'Médico' },
    ],
    corto: {
      cartel: { sobre: 'Para todos' },
      oficios: [
        { clave: 'unas', nombre: 'Uñas' },
        { clave: 'dentista', nombre: 'Dentista' },
        { clave: 'medico', nombre: 'Médico' },
      ],
    },
    preguntas: [
      { pregunta: '¿De todos?', respuesta: 'Sí.', principal: true },
      { pregunta: '¿De salud?', respuesta: 'Sí.', solo: ['dentista', 'medico'] },
      { pregunta: '¿Del dentista?', respuesta: 'Sí.', solo: ['dentista'] },
    ],
    agentes: {
      capitulos: [{ clave: 'hace' }],
      cuida: {
        titulo: 'Así cuidamos',
        lista: [
          { titulo: 'De todos', texto: 'Uno.' },
          { titulo: 'Lo clínico', texto: 'Dos.', solo: ['dentista', 'medico'] },
        ],
      },
    },
    secciones: {
      paraQuien: { titulo: 'Hoy.' },
      planes: {
        requisitos: [{ titulo: 'Uno' }],
        requisitosNota: 'Tu cédula.',
        requisitosNotaSolo: ['dentista', 'medico'],
      },
    },
    sitio: { nombre: 'Prompt Maestro' },
  };
}

/** @param {{ clave: string }[]} lista */
const clavesDe = (lista) => lista.map((uno) => uno.clave);
/** @param {{ titulo?: string, pregunta?: string }[]} lista */
const titulosDe = (lista) => lista.map((uno) => uno.titulo ?? uno.pregunta);

test('a la venta van los oficios que dicen "aLaVenta": true, en el orden de giros.json', () => {
  assert.deepEqual([...clavesALaVenta(datosDePrueba().giros)], ['unas']);
  assert.deepEqual([...clavesALaVenta(datosDePrueba({ medico: true }).giros)], ['unas', 'medico']);
  assert.deepEqual(
    [...clavesALaVenta(datosDePrueba({ dentista: true, medico: true }).giros)],
    ['unas', 'dentista', 'medico'],
  );
});

test('un oficio sin su interruptor detiene la armada: no se adivina si se vende', () => {
  const { giros } = datosDePrueba();
  /** @type {any[]} */
  const sinInterruptor = giros.map((giro) => (giro.clave === 'dentista' ? { clave: 'dentista', nombre: 'D' } : giro));
  assert.throws(() => clavesALaVenta(sinInterruptor), /giros\.json: al oficio "dentista" le falta "aLaVenta"/);
  // Tiene que ser true o false: un "si" escrito no cuenta.
  const conTexto = giros.map((giro) => (giro.clave === 'medico' ? { ...giro, aLaVenta: 'no' } : giro));
  assert.throws(() => clavesALaVenta(conTexto), /al oficio "medico" le falta "aLaVenta" \(true o false\)/);
  assert.throws(() => soloLoQueSeVende({ ...datosDePrueba(), giros: sinInterruptor }), /le falta "aLaVenta"/);
});

test('sin ningun oficio a la venta, o sin oficios, la pagina no se arma', () => {
  const apagados = datosDePrueba().giros.map((giro) => ({ ...giro, aLaVenta: false }));
  assert.throws(() => clavesALaVenta(apagados), /giros\.json: ningun oficio esta a la venta/);
  assert.throws(() => soloLoQueSeVende({ ...datosDePrueba(), giros: apagados }), /ningun oficio esta a la venta/);
  for (const nada of [[], undefined, null, {}]) {
    assert.throws(() => clavesALaVenta(nada), /giros\.json: no hay ningun oficio/);
  }
});

test('un oficio a la venta sin su escena en el corto detiene la armada', () => {
  const datos = datosDePrueba({ medico: true });
  const sinEscena = {
    ...datos,
    corto: { ...datos.corto, oficios: datos.corto.oficios.filter((o) => o.clave !== 'medico') },
  };
  assert.throws(() => soloLoQueSeVende(sinEscena), /corto\.json: al oficio "medico" \(a la venta\) le falta su escena/);
  // A un guardado si le puede faltar: no se ensena.
  const guardadoSinEscena = {
    ...datos,
    corto: { ...datos.corto, oficios: datos.corto.oficios.filter((o) => o.clave !== 'dentista') },
  };
  assert.deepEqual(clavesDe(soloLoQueSeVende(guardadoSinEscena).datos.corto.oficios), ['unas', 'medico']);
});

test('lo que lleva "solo" se ensena si alguno de sus oficios esta a la venta; lo que no, es de todos', () => {
  const unas = new Set(['unas']);
  assert.equal(seEnsena({}, unas), true);
  assert.equal(seEnsena({ solo: ['dentista', 'medico'] }, unas), false);
  assert.equal(seEnsena({ solo: ['dentista', 'medico'] }, new Set(['unas', 'medico'])), true);
  assert.equal(seEnsena({ solo: ['unas'] }, unas), true);
});

test('con solo unas a la venta: sus giros, su escena, las preguntas y compromisos de todos, y sin la nota de la cedula', () => {
  const entrada = datosDePrueba();
  const copia = structuredClone(entrada);
  const { datos, claves, guardados } = soloLoQueSeVende(entrada);
  assert.deepEqual([...claves], ['unas']);
  assert.deepEqual(guardados, ['dentista', 'medico']);
  assert.deepEqual(clavesDe(datos.giros), ['unas']);
  assert.deepEqual(clavesDe(datos.corto.oficios), ['unas']);
  assert.deepEqual(titulosDe(datos.preguntas), ['¿De todos?']);
  assert.deepEqual(titulosDe(datos.agentes.cuida.lista), ['De todos']);
  assert.equal(datos.secciones.planes.requisitosNota, '');
  // Lo demas pasa tal cual: los textos del corto, los capitulos, los requisitos y lo que no es de ningun oficio.
  assert.deepEqual(datos.corto.cartel, entrada.corto.cartel);
  assert.deepEqual(datos.agentes.capitulos, entrada.agentes.capitulos);
  assert.equal(datos.agentes.cuida.titulo, 'Así cuidamos');
  assert.deepEqual(datos.secciones.planes.requisitos, entrada.secciones.planes.requisitos);
  assert.deepEqual(datos.secciones.paraQuien, entrada.secciones.paraQuien);
  assert.deepEqual(datos.sitio, entrada.sitio);
  // Y no cambia los datos que recibe: devuelve otros.
  assert.deepEqual(entrada, copia);
});

test('al encender un oficio de salud se ensena lo suyo: sus preguntas, lo clinico y la nota de la cedula', () => {
  const { datos, guardados } = soloLoQueSeVende(datosDePrueba({ medico: true }));
  assert.deepEqual(guardados, ['dentista']);
  assert.deepEqual(clavesDe(datos.giros), ['unas', 'medico']);
  assert.deepEqual(clavesDe(datos.corto.oficios), ['unas', 'medico']);
  // La del dentista sigue guardada: solo es de el.
  assert.deepEqual(titulosDe(datos.preguntas), ['¿De todos?', '¿De salud?']);
  assert.deepEqual(titulosDe(datos.agentes.cuida.lista), ['De todos', 'Lo clínico']);
  assert.equal(datos.secciones.planes.requisitosNota, 'Tu cédula.');
  // Sin "requisitosNotaSolo" la nota es de todos.
  const base = datosDePrueba();
  const { requisitosNotaSolo: _solo, ...planes } = base.secciones.planes;
  const deTodos = soloLoQueSeVende({ ...base, secciones: { ...base.secciones, planes } });
  assert.equal(deTodos.datos.secciones.planes.requisitosNota, 'Tu cédula.');
});

test('guardado es todo oficio que no esta a la venta: tambien el que solo tiene su escena en el corto', () => {
  const datos = datosDePrueba();
  const conOtra = {
    ...datos,
    corto: { ...datos.corto, oficios: [...datos.corto.oficios, { clave: 'otro', nombre: 'Otro' }] },
  };
  const { datos: vendido, guardados } = soloLoQueSeVende(conOtra);
  assert.deepEqual(guardados, ['dentista', 'medico', 'otro']);
  assert.deepEqual(clavesDe(vendido.corto.oficios), ['unas']);
  // Solo con giros.json tambien funciona: lo demas no se toca.
  const soloGiros = soloLoQueSeVende({ giros: datos.giros });
  assert.deepEqual(clavesDe(soloGiros.datos.giros), ['unas']);
  assert.deepEqual(soloGiros.guardados, ['dentista', 'medico']);
  assert.deepEqual(Object.keys(soloGiros.datos), ['giros']);
});

test('un "solo" con un oficio que no existe, vacio o que no es lista detiene la armada y dice en que archivo', () => {
  const base = datosDePrueba();
  /** @param {Record<string, any>} cambio */
  const con = (cambio) => () => soloLoQueSeVende({ ...base, ...cambio });
  // Una errata ("medicos") no puede esconder algo para siempre.
  assert.throws(
    con({ preguntas: [...base.preguntas, { pregunta: '¿Y?', respuesta: 'Sí.', solo: ['medicos'] }] }),
    /preguntas\.json \(4\): "solo" nombra "medicos", que no es un oficio de giros\.json/,
  );
  const cuida = (/** @type {any} */ uno) => ({ ...base.agentes, cuida: { ...base.agentes.cuida, lista: [uno] } });
  assert.throws(
    con({ agentes: cuida({ titulo: 'X', texto: 'Y.', solo: ['dentistas'] }) }),
    /agentes\.json, cuida \(1\): "solo" nombra "dentistas"/,
  );
  const planes = (/** @type {any} */ solo) => ({
    ...base.secciones,
    planes: { ...base.secciones.planes, requisitosNotaSolo: solo },
  });
  assert.throws(
    con({ secciones: planes(['salud']) }),
    /secciones\.json, planes\.requisitosNotaSolo: "solo" nombra "salud"/,
  );
  // "solo" es una lista con al menos un oficio: vacia o escrita como texto no se entiende.
  assert.throws(
    con({ preguntas: [{ pregunta: '¿Y?', respuesta: 'Sí.', solo: [] }] }),
    /preguntas\.json \(1\): "solo" debe ser una lista de oficios/,
  );
  assert.throws(
    con({ agentes: cuida({ titulo: 'X', texto: 'Y.', solo: 'medico' }) }),
    /agentes\.json, cuida \(1\): "solo" debe ser una lista de oficios/,
  );
  assert.throws(con({ secciones: planes([]) }), /requisitosNotaSolo: "solo" debe ser una lista de oficios/);
  // Un oficio guardado si se vale: existe, aunque hoy no se venda.
  assert.doesNotThrow(con({ preguntas: [{ pregunta: '¿Y?', respuesta: 'Sí.', solo: ['medico'] }] }));
});

test('el nombre de un recurso dice si es de un oficio guardado: empieza con su clave y un guion', () => {
  const guardados = ['dentista', 'medico'];
  for (const ruta of [
    'comercial/medico-escena.mp4',
    'comercial/dentista-escena-1600.avif',
    'retratos/dentista-retrato-480.webp',
    'cartel/medico-tu-540.avif',
  ]) {
    assert.equal(esDeUnGuardado(ruta, guardados), true, ruta);
  }
  for (const ruta of [
    'comercial/unas-escena-1600.avif',
    'comercial/referencia-unas.webp',
    'cartel/agente-900.avif',
    'fuentes/outfit.woff2',
    // Lo que cuenta es el nombre del archivo, no su carpeta, y la clave entera con su guion.
    'medico-viejo/foto.webp',
    'comercial/medicos-escena.mp4',
    'comercial/medico.mp4',
  ]) {
    assert.equal(esDeUnGuardado(ruta, guardados), false, ruta);
  }
  assert.equal(esDeUnGuardado('comercial/medico-escena.mp4', []), false, 'sin guardados, todo viaja');
});

test('los datos de la fuente pasan: cada oficio con su interruptor, y lo de "solo" nombra oficios que existen', async () => {
  const giros = await leer('giros.json');
  for (const giro of giros) assert.equal(typeof giro.aLaVenta, 'boolean', giro.clave);
  const { datos, claves, guardados } = soloLoQueSeVende({
    giros,
    corto: await leer('corto.json'),
    preguntas: await leer('preguntas.json'),
    agentes: await leer('agentes.json'),
    secciones: await leer('secciones.json'),
  });
  assert.ok(claves.size >= 1);
  assert.deepEqual(
    clavesDe(datos.giros),
    clavesDe(giros.filter((/** @type {{ aLaVenta: boolean }} */ giro) => giro.aLaVenta)),
  );
  assert.deepEqual(clavesDe(datos.corto.oficios), clavesDe(datos.giros));
  assert.deepEqual(
    [...guardados].sort(),
    clavesDe(giros.filter((/** @type {{ aLaVenta: boolean }} */ giro) => !giro.aLaVenta)).sort(),
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Lo mismo, ya en la pagina armada.
// ---------------------------------------------------------------------------------------------------------------

const { claves: A_LA_VENTA, guardados: GUARDADOS } = soloLoQueSeVende({ giros: await leer('giros.json') });
const CON_SALUD = A_LA_VENTA.has('dentista') || A_LA_VENTA.has('medico');

/**
 * @param {Map<string, Buffer>} archivos
 * @param {string} ruta
 * @returns {string}
 */
function leerArmado(archivos, ruta) {
  const contenido = archivos.get(ruta);
  assert.ok(contenido, `falta ${ruta} en lo armado`);
  return contenido.toString('utf8');
}

test('de un oficio guardado no viaja ni un archivo: ni sus fotos, ni sus videos, ni sus retratos', async () => {
  for (const destino of /** @type {const} */ (['publica', 'previa'])) {
    const { archivos, problemas } = await armarSitio({ raiz: RAIZ, destino });
    assert.deepEqual(problemas, []);
    const rutas = [...archivos.keys()];
    // La prueba esta leyendo lo armado: los recursos de los oficios a la venta si viajan.
    for (const clave of A_LA_VENTA) {
      assert.ok(
        rutas.some((ruta) => ruta.endsWith(`/comercial/${clave}-escena-1600.avif`)),
        `${destino}: falta la escena de ${clave}`,
      );
      assert.ok(
        rutas.some((ruta) => ruta.endsWith(`/retratos/${clave}-retrato-480.webp`)),
        `${destino}: falta el retrato de ${clave}`,
      );
    }
    for (const clave of GUARDADOS) {
      const suyas = rutas.filter((ruta) => ruta.slice(ruta.lastIndexOf('/') + 1).startsWith(`${clave}-`));
      assert.deepEqual(suyas, [], `${destino}: viajan archivos de ${clave}`);
      // Ni una pagina los pide.
      for (const pagina of ['index.html', '404.html']) {
        assert.ok(!leerArmado(archivos, pagina).includes(`/${clave}-`), `${destino}, ${pagina}: nombra a ${clave}`);
      }
    }
  }
});

test('sin un oficio de salud a la venta, la pagina no habla de dentistas, medicos, pacientes ni cedula', {
  skip: CON_SALUD && 'con un oficio de salud a la venta la pagina si habla de salud',
}, async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  for (const pagina of ['index.html', '404.html']) {
    // Todo lo que viaja en la pagina: el texto, los atributos y los datos de la demostracion y de los buscadores. Los
    // nombres de los dibujos (<symbol id="i-oficio-...">) no se leen: no son texto.
    const html = leerArmado(archivos, pagina).replace(/<symbol id="[^"]*"/g, '<symbol');
    assert.ok(html.length > 1000, `la prueba esta leyendo ${pagina}`);
    for (const palabra of [/dentista/i, /médic/i, /\bmedicos?\b/i, /paciente/i, /cédula/i, /\bcedula\b/i]) {
      const hallado = palabra.exec(html);
      const cerca = hallado ? html.slice(Math.max(0, hallado.index - 60), hallado.index + 60) : '';
      assert.equal(hallado, null, `${pagina} dice ${palabra.source}: ...${cerca}...`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Encender un oficio guardado, en una copia de fuente/: sin tocar el repo.
// ---------------------------------------------------------------------------------------------------------------

/** Una copia de fuente/ en una carpeta temporal, para armarla con un dato cambiado. */
let copia = '';

before(async () => {
  copia = await mkdtemp(path.join(tmpdir(), 'pagina-oficios-'));
  await cp(path.join(RAIZ, 'fuente'), path.join(copia, 'fuente'), { recursive: true });
});

after(async () => {
  await rm(copia, { recursive: true, force: true });
});

test('encender un oficio guardado es cambiar su dato: la pagina lo ensena completo, con selector y cierre partido', async () => {
  const ruta = path.join(copia, 'fuente', 'datos', 'giros.json');
  const original = await readFile(ruta, 'utf8');
  /** @type {{ clave: string, aLaVenta: boolean, nombre: string }[]} */
  const giros = JSON.parse(original);
  // El primero a la venta y el primer guardado, juntos.
  const otro = giros.find((giro) => !giro.aLaVenta);
  if (!otro) return;
  await writeFile(ruta, JSON.stringify(giros.map((giro) => (giro === otro ? { ...giro, aLaVenta: true } : giro))));
  try {
    const { archivos, problemas } = await armarSitio({ raiz: copia, destino: 'publica' });
    assert.deepEqual(problemas, []);
    const html = leerArmado(archivos, 'index.html');
    const encendidos = giros.filter((giro) => giro.aLaVenta || giro === otro);
    // La demostracion trae su selector, con un boton (y su icono) por oficio encendido; ya no es la de uno solo.
    assert.deepEqual(
      [...html.matchAll(/ data-demo-ejemplo="([^"]+)"/g)].map(([, clave]) => clave),
      encendidos.map((giro) => giro.clave),
    );
    for (const { clave } of encendidos) assert.ok(html.includes(`<symbol id="i-oficio-${clave}" `), clave);
    assert.match(html, /<div class="demo" id="demo" data-demo /);
    // El cierre del corto se parte en una franja por oficio, cada una con su foto de pie.
    assert.ok(html.includes('<div class="todos">'), 'el cierre se parte');
    const franjas = html.match(/<div class="franja"[\s\S]*?<\/p>/g) ?? [];
    assert.equal(franjas.length, encendidos.length);
    for (const franja of franjas) assert.match(franja, /comercial\/[a-z]+-trabajo-720\.avif/);
    // Y viaja lo suyo: su tarjeta, su retrato, su escena y lo que lleva "solo" con el.
    const rutas = [...archivos.keys()];
    for (const sufijo of [`/retratos/${otro.clave}-retrato-480.webp`, `/comercial/${otro.clave}-escena-1600.avif`]) {
      assert.ok(
        rutas.some((una) => una.endsWith(sufijo)),
        sufijo,
      );
    }
    assert.ok(html.includes(` data-escena="${otro.clave}"`));
    if (otro.clave === 'dentista' || otro.clave === 'medico') {
      assert.ok(html.includes('Lo clínico es tuyo'));
      assert.ok(html.includes('class="planes__cedula"'));
      assert.ok(html.includes('<symbol id="i-cedula"'));
    }
  } finally {
    await writeFile(ruta, original, 'utf8');
  }
});

test('un oficio guardado tambien se revisa al armar: si le falta su guion, la armada se detiene', async () => {
  const [guardado] = GUARDADOS;
  if (!guardado) return;
  const ruta = path.join(copia, 'fuente', 'datos', 'guiones', `${guardado}.json`);
  const aparte = path.join(copia, `${guardado}.json`);
  await rename(ruta, aparte);
  try {
    await assert.rejects(
      armarSitio({ raiz: copia, destino: 'publica' }),
      new RegExp(`Demostracion: al ejemplo "${guardado}" le falta su guion`),
    );
  } finally {
    await rename(aparte, ruta);
  }
  // Ya con su guion de vuelta, la copia se arma sin problemas.
  assert.deepEqual((await armarSitio({ raiz: copia, destino: 'publica' })).problemas, []);
});
