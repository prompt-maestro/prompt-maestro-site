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
import { SE_CONSERVAN } from '../../herramientas/publicacion.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = async (/** @type {string} */ ruta) =>
  JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', ruta), 'utf8'));

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
    paraQuien: 'Hoy, para tres oficios.',
    preciosDePrueba: true,
    legales: { terminos: 'https://ejemplo.mx/terminos', privacidad: 'https://ejemplo.mx/privacidad' },
  });
  assert.match(texto, /^# Citas Garantizadas\n\n> Una descripcion\.\n/);
  assert.match(texto, /producto de Prompt Maestro \(Guadalajara, México\)/);
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
  const preguntas = await leer('preguntas.json');
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
});

test('en el dominio van robots.txt, sitemap.xml y llms.txt; en la previa no, porque no se indexa', () => {
  for (const ruta of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
    assert.ok(publica.has(ruta), `falta ${ruta}`);
    assert.ok(!previa.has(ruta), `${ruta} no va en la previa`);
  }
  assert.ok(publica.get('robots.txt')?.toString().includes('Sitemap: https://prompt-maestro.com/sitemap.xml'));
  const llms = publica.get('llms.txt')?.toString() ?? '';
  assert.match(llms, /^# Citas Garantizadas\n/);
  assert.ok(llms.includes('https://alta.prompt-maestro.com/'));
  assert.ok(llms.includes('Hoy, para uñas, dentistas y médicos.'));
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

test('la pagina trae el bloque "en una frase": la frase que define el producto y sus tres palabras definidas', async () => {
  const { enUnaFrase } = await leer('secciones.json');
  const bloque = /<section class="frase" id="en-una-frase"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  // De aqui leen los buscadores y los asistentes con IA: la frase y las definiciones no cambian.
  assert.ok(
    bloque.includes(
      '>Citas Garantizadas es un agente de WhatsApp <em>que agenda solo con el anticipo pagado.</em></h2>',
    ),
  );
  assert.deepEqual(
    enUnaFrase.definiciones.map((/** @type {any} */ palabra) => palabra.termino),
    ['Cita garantizada', 'Anticipo', 'Agente'],
  );
  assert.deepEqual(
    [...bloque.matchAll(/<div class="frase__definicion"><dt>([^<]+)<\/dt><dd>([^<]+)<\/dd><\/div>/g)].map(
      ([, termino, texto]) => ({ termino, texto }),
    ),
    enUnaFrase.definiciones,
  );
});

test('en lugar de la tabla que comparaba con otras opciones va un antes y un despues, y nada de ella quedo', async () => {
  const { enUnaFrase } = await leer('secciones.json');
  const bloque = /<section class="frase" id="en-una-frase"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  // La tabla se fue de la pagina, de los datos y de lo que leen los modelos de lenguaje (ahi nunca estuvo).
  assert.doesNotMatch(html, /<table|role="(table|row|cell|columnheader|rowheader)"|compara|En qué se distingue/);
  assert.deepEqual(
    Object.keys(enUnaFrase).filter((clave) => clave.startsWith('compara')),
    [],
  );
  assert.doesNotMatch(publica.get('llms.txt')?.toString() ?? '', /Agenda en línea|Bot de WhatsApp|otras opciones/);

  // Dos tarjetas: antes y despues. Solo la de despues va encendida.
  const [antes, despues] = enUnaFrase.lados;
  assert.equal(enUnaFrase.lados.length, 2);
  assert.deepEqual([antes.encendido === true, despues.encendido === true], [false, true]);
  const lados = [
    ...bloque.matchAll(/<div class="frase__lado( frase__lado--despues)?" data-enciende>([\s\S]*?)<\/ul>\s*<\/div>/g),
  ];
  assert.deepEqual(
    lados.map(([, encendido]) => Boolean(encendido)),
    [false, true],
  );
  for (const [lugar, lado] of [antes, despues].entries()) {
    const tarjeta = lados[lugar]?.[2] ?? '';
    assert.ok(
      tarjeta.includes(`<p class="frase__rotulo">${lado.rotulo}</p>`) &&
        tarjeta.includes(`<h3 class="frase__dice">${lado.frase}</h3>`),
      lado.rotulo,
    );
    // Sus tres renglones, cada uno con su marca: tacha antes, palomita despues.
    assert.deepEqual(
      [...tarjeta.matchAll(/<li><svg class="frase__marca"[^>]*><use href="#i-(\w+)"\/><\/svg>([^<]+)<\/li>/g)].map(
        ([, marca, texto]) => [marca, texto],
      ),
      lado.renglones.map((/** @type {any} */ renglon) => [lugar === 0 ? 'tacha' : 'palomita', renglon.texto]),
    );
    // La pantalla es una ilustracion: no se le lee a quien no la ve. Trae los mismos tres mensajes en los dos lados.
    const pantalla = /<div class="frase__pantalla" aria-hidden="true">([\s\S]*?)<\/div>/.exec(tarjeta)?.[1] ?? '';
    assert.ok(pantalla.includes(`<b>${lado.cuenta}</b><span>${enUnaFrase.hora}</span>`), lado.cuenta);
    for (const mensaje of enUnaFrase.mensajes) {
      assert.ok(pantalla.includes(`<b>${mensaje.inicial}</b><span>${mensaje.texto}</span>`), mensaje.texto);
    }
    assert.ok(pantalla.includes(`<b>${enUnaFrase.cita.titulo}</b><span>${lado.anticipo}</span>`), lado.anticipo);
  }
  assert.deepEqual(
    [antes, despues].map((lado) => [lado.rotulo, lado.frase, lado.cuenta, lado.anticipo]),
    [
      ['Antes', 'Tú trabajas y tu celular no para de sonar.', '7 sin contestar', 'Sin anticipo'],
      [
        'Con Citas Garantizadas',
        'Te siguen escribiendo, y tu agente contesta por ti.',
        '0 sin contestar',
        'Anticipo $150',
      ],
    ],
  );
  assert.deepEqual(
    [antes, despues].map((lado) => lado.renglones.map((/** @type {any} */ renglon) => renglon.texto)),
    [
      ['Contestas cuando puedes.', 'Apartas la hora sin anticipo.', 'Si no llega, pierdes la hora.'],
      [
        'Contesta a cualquier hora, con el tono de tu negocio.',
        'Agenda solo con el anticipo pagado.',
        'Si no llega, el anticipo se queda contigo, según tu política.',
      ],
    ],
  );
  assert.deepEqual(
    enUnaFrase.mensajes.map((/** @type {any} */ mensaje) => [mensaje.texto, mensaje.hace]),
    [
      ['Hola, ¿tienes lugar el jueves?', 'hace 2 h'],
      ['Nota de voz · 0:14', 'hace 1 h'],
      ['¿Cuánto por este diseño?', 'hace 40 min'],
    ],
  );
  // Antes, cada mensaje espera y la cita esta en duda; despues, cada uno esta contestado y la cita lleva el sello.
  const [pantallaDeAntes = '', pantallaDeDespues = ''] = lados.map(([, , tarjeta]) => tarjeta);
  for (const { hace } of enUnaFrase.mensajes) assert.ok(pantallaDeAntes.includes(`<small>${hace}</small>`), hace);
  assert.ok(pantallaDeAntes.includes('<span class="frase__duda">¿Llegará?</span>'));
  assert.ok(!pantallaDeAntes.includes('class="sello"') && !pantallaDeAntes.includes('Contestado'));
  assert.equal(pantallaDeDespues.split('</svg>Contestado</small>').length - 1, 3);
  assert.equal(pantallaDeDespues.split('class="sello"').length - 1, 1);
  assert.ok(!pantallaDeDespues.includes('¿Llegará?') && !pantallaDeDespues.includes('hace '));
  // Los mensajes son buenos (es negocio): despues siguen llegando, y eso es lo que dice la tarjeta.
  assert.match(despues.frase, /^Te siguen escribiendo/);
  assert.doesNotMatch(JSON.stringify(despues), /ya no|dejan de|sin mensajes|silencio/i);
});
