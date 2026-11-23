// @ts-check
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armarSitio } from '../../herramientas/armado.mjs';
import {
  datosEstructurados,
  jsonParaScript,
  LEGALES,
  llmsTxt,
  RASTREADORES_DE_IA,
  robots,
  sitemap,
  TOPES,
} from '../../herramientas/buscadores.mjs';
import { soloLoQueSeVende } from '../../herramientas/oficios.mjs';
import { SE_CONSERVAN } from '../../herramientas/publicacion.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = async (/** @type {string} */ ruta) =>
  JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', ruta), 'utf8'));
/**
 * Lo que la pagina ensena de los datos: solo lo de los oficios a la venta (giros.json, "aLaVenta").
 * @param {Record<string, any>} datos  ademas de giros.json, que siempre se lee
 */
const aLaVenta = async (datos) => soloLoQueSeVende({ giros: await leer('giros.json'), ...datos });

const ENTRADA = {
  origen: 'https://ejemplo.mx',
  base: '/',
  sitio: {
    nombre: 'Prompt Maestro',
    producto: 'Citas Garantizadas',
    alta: 'https://alta.ejemplo.mx/',
    titulo: 'Un titulo',
    descripcion: 'Una descripcion.',
    ciudad: 'Guadalajara',
  },
  planes: {
    moneda: 'mxn',
    planes: [
      { nombre: 'Bronce', mensual: 990, anual: 9900, instalacion: 2500, incluye: ['Una cosa', 'Otra cosa'] },
      { nombre: 'Plata', mensual: 1490, anual: 14900, instalacion: 2500, incluye: ['Todo lo de Bronce'] },
    ],
  },
  preguntas: [
    { pregunta: '¿Una?', respuesta: 'Sí.' },
    { pregunta: '¿Dos <b>?', respuesta: 'No.' },
  ],
};

/**
 * El ancho y el alto de un JPEG, leidos de su cabecera (el bloque SOF).
 * @param {Buffer} imagen
 * @returns {[number, number] | null}
 */
function medidasDeJpeg(imagen) {
  let i = 2;
  while (i + 9 < imagen.length && imagen[i] === 0xff) {
    const marca = imagen[i + 1] ?? 0;
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return [imagen.readUInt16BE(i + 7), imagen.readUInt16BE(i + 5)];
    }
    i += 2 + imagen.readUInt16BE(i + 2);
  }
  return null;
}

test('los datos estructurados dicen quien publica, que sitio es, el servicio con sus planes y las preguntas', () => {
  const datos = datosEstructurados(ENTRADA);
  assert.equal(datos['@context'], 'https://schema.org');
  const grafo = /** @type {any[]} */ (datos['@graph']);
  assert.deepEqual(
    grafo.map((nodo) => nodo['@type']),
    ['Organization', 'WebSite', 'Service', 'FAQPage'],
  );
  const [organizacion, sitio, servicio, preguntas] = grafo;
  assert.equal(organizacion.name, 'Prompt Maestro');
  assert.equal(organizacion.address.addressLocality, 'Guadalajara');
  assert.equal(sitio.publisher['@id'], organizacion['@id']);
  assert.equal(sitio.inLanguage, 'es-MX');
  assert.equal(servicio.provider['@id'], organizacion['@id']);
  assert.equal(preguntas.mainEntity.length, 2);
  assert.equal(preguntas.mainEntity[0].acceptedAnswer.text, 'Sí.');
  // Nada de calificaciones ni resenas: no existen y no se inventan.
  assert.doesNotMatch(JSON.stringify(datos), /aggregateRating|"review"|ratingValue/);
});

test('cada plan es una oferta con su mensualidad dicha como mensualidad, y la instalacion a la vista', () => {
  const grafo = /** @type {any[]} */ (datosEstructurados(ENTRADA)['@graph']);
  const { offers } = grafo.find((nodo) => nodo['@type'] === 'Service');
  assert.deepEqual(
    offers.map((/** @type {any} */ oferta) => [oferta.name, oferta.url]),
    [
      ['Plan Bronce', 'https://alta.ejemplo.mx/'],
      ['Plan Plata', 'https://alta.ejemplo.mx/'],
    ],
  );
  // Un buscador no puede contestar "cuesta $990" a secas: el precio lleva su periodo.
  assert.deepEqual(offers[0].priceSpecification, {
    '@type': 'UnitPriceSpecification',
    price: '990',
    priceCurrency: 'MXN',
    unitCode: 'MON',
    unitText: 'al mes',
  });
  assert.equal(offers[0].price, undefined);
  assert.equal(offers[0].description, 'Una cosa. Otra cosa. $990 MXN al mes, más una instalación única de $2,500 MXN.');
});

test('sin preguntas no hay bloque de preguntas: uno vacio no es valido', () => {
  const grafo = /** @type {any[]} */ (datosEstructurados({ ...ENTRADA, preguntas: [] })['@graph']);
  assert.deepEqual(
    grafo.map((nodo) => nodo['@type']),
    ['Organization', 'WebSite', 'Service'],
  );
});

test('un dato con "<" no puede cerrar la etiqueta script donde viaja', () => {
  const texto = jsonParaScript(datosEstructurados(ENTRADA));
  assert.doesNotMatch(texto, /</);
  assert.equal(JSON.parse(texto)['@graph'][3].mainEntity[1].name, '¿Dos <b>?');
  assert.doesNotMatch(jsonParaScript({ dato: '</script><!-- & "comillas"' }), /<\/script|<!--/);
});

test('robots.txt deja entrar a todos, nombra a los buscadores con IA y apunta al mapa', () => {
  const texto = robots({ origen: 'https://ejemplo.mx' });
  assert.match(texto, /^User-agent: \*\nAllow: \/\n/);
  for (const nombre of RASTREADORES_DE_IA) assert.ok(texto.includes(`User-agent: ${nombre}\n`), nombre);
  assert.doesNotMatch(texto, /Disallow/);
  assert.ok(texto.endsWith('Sitemap: https://ejemplo.mx/sitemap.xml\n'));
});

test('el mapa del sitio trae el inicio y las legales vigentes, sin fechas', () => {
  const texto = sitemap({ origen: 'https://ejemplo.mx' });
  assert.deepEqual(
    [...texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, direccion]) => direccion),
    ['https://ejemplo.mx/', 'https://ejemplo.mx/terminos.html', 'https://ejemplo.mx/privacidad.html'],
  );
  assert.doesNotMatch(texto, /lastmod/);
});

test('llms.txt cuenta la pagina en texto llano: que es, para quien, pasos, planes, preguntas y enlaces', () => {
  const texto = llmsTxt({
    ...ENTRADA,
    pasos: ['Primero.', 'Segundo.'],
    hace: [{ titulo: 'Entiende', texto: 'Todo.' }],
    cuida: ['Tus precios, tal cual. Cotiza con tu catálogo.'],
    requisitos: ['Un numero.'],
    glosario: { frase: 'Es una cosa.', palabras: [{ termino: 'Palabra', texto: 'Lo que es.' }] },
    paraQuien: 'Hoy, para tres oficios.',
    preciosDePrueba: true,
    legales: { terminos: 'https://ejemplo.mx/terminos', privacidad: 'https://ejemplo.mx/privacidad' },
  });
  assert.match(texto, /^# Citas Garantizadas\n\n> Una descripcion\.\n/);
  assert.match(texto, /producto de Prompt Maestro \(Guadalajara, México\)/);
  // Primero que es, en una frase y con sus palabras definidas; luego para quien.
  assert.ok(texto.includes('## En una frase\n\nEs una cosa.\n\n- Palabra: Lo que es.\n\n## Para quién\n'));
  assert.ok(texto.includes('1. Primero.\n2. Segundo.'));
  assert.ok(texto.includes('- Entiende: Todo.'));
  assert.ok(texto.includes('## Así cuidamos de tu negocio\n\n- Tus precios, tal cual. Cotiza con tu catálogo.\n'));
  assert.ok(!texto.includes('Lo que no hace'));
  assert.ok(texto.includes('- Bronce: $990 MXN al mes o $9,900 MXN al año. Una cosa. Otra cosa.'));
  assert.ok(texto.includes('- Instalación única: $2,500 MXN.'));
  // Mientras los precios sean de prueba, lo dice.
  assert.ok(texto.includes('Precios de prueba'));
  assert.ok(texto.includes('### ¿Una?\n\nSí.'));
  assert.ok(texto.includes('- [Empezar](https://alta.ejemplo.mx/)'));
  assert.ok(texto.includes('- [Aviso de privacidad](https://ejemplo.mx/privacidad)'));
});

// ---------------------------------------------------------------------------------------------------------------
// Lo mismo, ya en la pagina armada.
// ---------------------------------------------------------------------------------------------------------------
/** @type {Map<string, Buffer>} */
let publica = new Map();
/** @type {Map<string, Buffer>} */
let previa = new Map();
let html = '';

before(async () => {
  publica = (await armarSitio({ raiz: RAIZ, destino: 'publica' })).archivos;
  previa = (await armarSitio({ raiz: RAIZ, destino: 'previa' })).archivos;
  html = publica.get('index.html')?.toString('utf8') ?? '';
});

/**
 * @param {string} pagina
 * @param {string} nombre  el name o el property de la etiqueta meta
 * @returns {string | undefined}
 */
function meta(pagina, nombre) {
  return new RegExp(`<meta (?:name|property)="${nombre}" content="([^"]*)">`).exec(pagina)?.[1];
}

test('el titulo y la descripcion caben enteros en un resultado de busqueda', async () => {
  const sitio = await leer('sitio.json');
  assert.ok(sitio.titulo.length <= TOPES.titulo, `titulo: ${sitio.titulo.length}`);
  assert.ok(sitio.descripcion.length <= TOPES.descripcion, `descripcion: ${sitio.descripcion.length}`);
  assert.ok(html.includes(`<title>${sitio.titulo}</title>`));
  assert.equal(meta(html, 'description'), sitio.descripcion);
  assert.match(html, /<link rel="canonical" href="https:\/\/prompt-maestro\.com\/">/);
});

test('al compartir el enlace se ve el titulo, la descripcion y una imagen propia de 1200 por 630', async () => {
  const sitio = await leer('sitio.json');
  assert.equal(meta(html, 'og:title'), sitio.titulo);
  assert.equal(meta(html, 'og:description'), sitio.descripcion);
  assert.equal(meta(html, 'og:url'), 'https://prompt-maestro.com/');
  assert.equal(meta(html, 'og:locale'), 'es_MX');
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(html, 'og:image'), 'https://prompt-maestro.com/compartir.jpg');
  const imagen = publica.get('compartir.jpg');
  assert.ok(imagen, 'falta compartir.jpg');
  // Un JPEG de las medidas que la pagina declara, y ligero: WhatsApp no ensena imagenes pesadas.
  assert.equal(imagen.subarray(0, 3).toString('hex'), 'ffd8ff');
  assert.deepEqual(medidasDeJpeg(imagen), [1200, 630]);
  assert.deepEqual([meta(html, 'og:image:width'), meta(html, 'og:image:height')], ['1200', '630']);
  assert.ok(imagen.length < 300 * 1024, `pesa ${imagen.length}`);
  // El texto alterno dice lo mismo que la imagen trae escrito.
  assert.ok(sitio.compartirAlt.endsWith(sitio.compartirTexto.charAt(0).toLowerCase() + sitio.compartirTexto.slice(1)));
  // En la previa la imagen vive dentro de su carpeta.
  const htmlPrevia = previa.get('index.html')?.toString('utf8') ?? '';
  assert.equal(meta(htmlPrevia, 'og:image'), 'https://prompt-maestro.github.io/pagina-previa/compartir.jpg');
  assert.ok(previa.has('compartir.jpg'));
});

test('los datos estructurados de la pagina son JSON valido y dicen lo mismo que la pagina', async () => {
  const bloque = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  const grafo = /** @type {any[]} */ (JSON.parse(bloque)['@graph']);
  // Las preguntas que ensena la pagina: las de un oficio guardado no van ni en la pagina ni para los buscadores.
  const { preguntas } = (await aLaVenta({ preguntas: await leer('preguntas.json') })).datos;
  const { planes } = await leer('planes.json');
  const servicio = grafo.find((nodo) => nodo['@type'] === 'Service');
  const dudas = grafo.find((nodo) => nodo['@type'] === 'FAQPage');
  assert.deepEqual(
    servicio.offers.map((/** @type {any} */ oferta) => oferta.priceSpecification.price),
    planes.map((/** @type {any} */ plan) => String(plan.mensual)),
  );
  assert.deepEqual(
    dudas.mainEntity.map((/** @type {any} */ duda) => [duda.name, duda.acceptedAnswer.text]),
    preguntas.map((/** @type {any} */ duda) => [duda.pregunta, duda.respuesta]),
  );
  // Cada pregunta de los datos estructurados esta escrita tambien en la pagina, a la vista.
  for (const { pregunta } of preguntas) assert.ok(html.includes(`<h3>${pregunta}</h3>`), pregunta);
  // Y ninguna de un oficio guardado.
  for (const { pregunta, solo } of await leer('preguntas.json')) {
    if (!preguntas.some((/** @type {any} */ duda) => duda.pregunta === pregunta)) {
      assert.ok(solo, `sin "solo", la pregunta es de todos: ${pregunta}`);
      assert.ok(!html.includes(pregunta), pregunta);
    }
  }
});

test('en el dominio van robots.txt, sitemap.xml y llms.txt; en la previa no, porque no se indexa', async () => {
  for (const ruta of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
    assert.ok(publica.has(ruta), `falta ${ruta}`);
    assert.ok(!previa.has(ruta), `${ruta} no va en la previa`);
  }
  assert.ok(publica.get('robots.txt')?.toString().includes('Sitemap: https://prompt-maestro.com/sitemap.xml'));
  const llms = publica.get('llms.txt')?.toString() ?? '';
  assert.match(llms, /^# Citas Garantizadas\n/);
  assert.ok(llms.includes('https://alta.prompt-maestro.com/'));
  assert.ok(llms.includes('Hoy, para profesionales de uñas.'));
  // Sin un oficio de salud a la venta, llms.txt no habla de dentistas, medicos, pacientes ni cedula.
  const { claves } = await aLaVenta({});
  if (!claves.has('dentista') && !claves.has('medico')) assert.doesNotMatch(llms, /dentista|médic|paciente|cédula/i);
});

test('cada direccion del mapa existe: o la arma la pagina o es una legal que la publicacion conserva', () => {
  const mapa = publica.get('sitemap.xml')?.toString() ?? '';
  const rutas = [...mapa.matchAll(/<loc>https:\/\/prompt-maestro\.com\/([^<]*)<\/loc>/g)].map(([, ruta]) => ruta ?? '');
  assert.equal(rutas.length, 1 + LEGALES.length);
  for (const ruta of rutas) {
    const armada = publica.has(ruta === '' ? 'index.html' : ruta);
    assert.ok(armada || SE_CONSERVAN.includes(ruta), `${ruta} no existiria en el dominio`);
  }
});

test('la seccion "en una frase" ya no va en la pagina; su frase y sus tres palabras se conservan en llms.txt', async () => {
  // El dueno (20-nov-2026): "eliminamos toda la seccion 'En una frase', toda esa info ya la tenemos disponible en
  // otras secciones". De la pagina se fue entera: la seccion, su antes y despues, sus definiciones y sus estilos.
  for (const resto of ['en-una-frase', 'class="frase', 'frase__', '#i-tacha', 'id="i-tacha"', 'minicita--duda']) {
    assert.ok(!html.includes(resto), resto);
  }
  assert.doesNotMatch(html, /Con Citas Garantizadas|celular no para de sonar|Te siguen escribiendo|¿Llegará\?/);
  const estilos = [...publica.entries()].find(([ruta]) => ruta.endsWith('pagina.css'))?.[1].toString() ?? '';
  assert.ok(estilos.length > 10_000, 'la prueba esta leyendo la hoja de estilos');
  assert.doesNotMatch(estilos, /\.frase\b|frase__|minicita--duda/);
  // De los datos solo queda lo que cuenta llms.txt, para quien cita: la frase que define el producto y sus palabras.
  const secciones = await leer('secciones.json');
  assert.equal('enUnaFrase' in secciones, false);
  assert.deepEqual(Object.keys(secciones.glosario), ['frase', 'palabras']);
  assert.equal(
    secciones.glosario.frase,
    'Citas Garantizadas es un agente de WhatsApp que agenda solo con el anticipo pagado.',
  );
  assert.deepEqual(
    secciones.glosario.palabras.map((/** @type {any} */ palabra) => palabra.termino),
    ['Cita garantizada', 'Anticipo', 'Agente'],
  );
  const llms = publica.get('llms.txt')?.toString() ?? '';
  const bloque = /## En una frase\n\n([\s\S]*?)\n\n## /.exec(llms)?.[1] ?? '';
  assert.deepEqual(bloque.split('\n'), [
    secciones.glosario.frase,
    '',
    ...secciones.glosario.palabras.map((/** @type {any} */ palabra) => `- ${palabra.termino}: ${palabra.texto}`),
  ]);
  assert.ok(bloque.includes('Garantizada quiere decir pagada.'));
  // Y va antes de "Para quien": primero que es, luego para quien.
  assert.ok(llms.indexOf('## En una frase') < llms.indexOf('## Para quién'));
});

test('la tabla que comparaba con otras opciones no regreso: ni en la pagina, ni en los datos, ni en llms.txt', async () => {
  const secciones = await leer('secciones.json');
  assert.doesNotMatch(html, /<table|role="(table|row|cell|columnheader|rowheader)"|compara|En qué se distingue/);
  assert.doesNotMatch(JSON.stringify(secciones), /"compara/);
  assert.doesNotMatch(publica.get('llms.txt')?.toString() ?? '', /Agenda en línea|Bot de WhatsApp|otras opciones/);
});
