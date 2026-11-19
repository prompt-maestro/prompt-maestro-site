// @ts-check
// Lo que leen los buscadores, los de siempre y los que contestan con IA: datos estructurados, robots.txt, sitemap.xml
// y llms.txt. Todo es puro y sale de los mismos datos que arman la pagina: asi nunca dicen algo distinto a ella.
import { pesos } from '../fuente/js/redaccion.js';

/** @typedef {{ nombre: string, mensual: number, anual: number, instalacion: number, incluye: string[] }} Plan */
/** @typedef {{ pregunta: string, respuesta: string }} Pregunta */
/**
 * @typedef {Object} Entrada
 * @property {string} origen        "https://prompt-maestro.com"
 * @property {string} base          "/" (o la carpeta de la previa)
 * @property {{ nombre: string, producto: string, alta: string, titulo: string, descripcion: string, ciudad: string }} sitio
 * @property {{ moneda: string, planes: Plan[] }} planes
 * @property {Pregunta[]} preguntas
 */

/** Topes de lo que un buscador ensena sin cortar. */
export const TOPES = /** @type {const} */ ({ titulo: 60, descripcion: 155 });

/**
 * Los rastreadores de los buscadores con IA, por su nombre. Con "User-agent: *" ya pueden entrar; nombrarlos deja
 * dicho, sin lugar a dudas, que son bienvenidos.
 */
export const RASTREADORES_DE_IA = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
];

/**
 * Las paginas legales que van en el mapa del sitio. Ya viven en el dominio (herramientas/publicacion.mjs las conserva
 * al publicar) y una prueba cuida que sigan ahi. La de reembolsos de marzo se queda fuera del mapa: la politica vigente
 * es otra y la revisa la actividad de las legales.
 */
export const LEGALES = ['terminos.html', 'privacidad.html'];

/**
 * Los datos estructurados de la pagina (schema.org): quien la publica, el sitio, el servicio con sus planes y las
 * preguntas. El producto va como servicio (Service) y no como aplicacion (SoftwareApplication): para esa, Google
 * exige calificaciones o resenas, que todavia no existen y no se inventan.
 * @param {Entrada} entrada
 * @returns {Record<string, unknown>}
 */
export function datosEstructurados({ origen, base, sitio, planes, preguntas }) {
  const inicio = `${origen}${base}`;
  const organizacion = `${inicio}#organizacion`;
  const moneda = planes.moneda.toUpperCase();
  /** @type {Record<string, unknown>[]} */
  const grafo = [
    {
      '@type': 'Organization',
      '@id': organizacion,
      name: sitio.nombre,
      url: inicio,
      logo: `${inicio}favicon.svg`,
      address: { '@type': 'PostalAddress', addressLocality: sitio.ciudad, addressCountry: 'MX' },
    },
    {
      '@type': 'WebSite',
      '@id': `${inicio}#sitio`,
      url: inicio,
      name: sitio.producto,
      description: sitio.descripcion,
      inLanguage: 'es-MX',
      publisher: { '@id': organizacion },
    },
    {
      '@type': 'Service',
      '@id': `${inicio}#servicio`,
      name: sitio.producto,
      description: sitio.descripcion,
      serviceType: 'Agente de WhatsApp que agenda citas con anticipo pagado',
      areaServed: { '@type': 'Country', name: 'México' },
      url: inicio,
      provider: { '@id': organizacion },
      // Un plan, una oferta. El precio es una mensualidad y asi va dicho; la instalacion, que se paga una vez, tambien.
      offers: planes.planes.map((plan) => ({
        '@type': 'Offer',
        name: `Plan ${plan.nombre}`,
        description: `${plan.incluye.join('. ')}. ${pesos(plan.mensual)} ${moneda} al mes, más una instalación única de ${pesos(plan.instalacion)} ${moneda}.`,
        url: sitio.alta,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: String(plan.mensual),
          priceCurrency: moneda,
          unitCode: 'MON',
          unitText: 'al mes',
        },
      })),
    },
  ];
  // Una pagina de preguntas sin preguntas no es valida: sin ellas, el bloque no va.
  if (preguntas.length > 0) {
    grafo.push({
      '@type': 'FAQPage',
      '@id': `${inicio}#preguntas`,
      inLanguage: 'es-MX',
      mainEntity: preguntas.map(({ pregunta, respuesta }) => ({
        '@type': 'Question',
        name: pregunta,
        acceptedAnswer: { '@type': 'Answer', text: respuesta },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': grafo };
}

/**
 * Un JSON listo para ir dentro de una etiqueta script: ningun "<" puede cerrar la etiqueta desde un dato.
 * @param {unknown} dato
 * @returns {string}
 */
export function jsonParaScript(dato) {
  return JSON.stringify(dato).replace(/</g, '\\u003c');
}

/**
 * @param {{ origen: string }} entrada
 * @returns {string}
 */
export function robots({ origen }) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# Los buscadores que contestan con inteligencia artificial tambien son bienvenidos.',
    ...RASTREADORES_DE_IA.map((nombre) => `User-agent: ${nombre}`),
    'Allow: /',
    '',
    `Sitemap: ${origen}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * El mapa del sitio: el inicio y las legales vigentes. Sin fechas: armar dos veces da exactamente lo mismo.
 * @param {{ origen: string }} entrada
 * @returns {string}
 */
export function sitemap({ origen }) {
  const direcciones = [`${origen}/`, ...LEGALES.map((ruta) => `${origen}/${ruta}`)];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...direcciones.map((direccion) => `  <url><loc>${direccion}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * llms.txt: la pagina contada en texto llano para los modelos de lenguaje. Que es, para quien, que hace, como se
 * empieza, que no hace, cuanto cuesta y a donde ir.
 * @param {Entrada & {
 *   pasos: string[], hace: { titulo: string, texto: string }[], noHace: string[], requisitos: string[],
 *   paraQuien: string, preciosDePrueba: boolean, legales: { terminos: string, privacidad: string }
 * }} entrada
 * @returns {string}
 */
export function llmsTxt({
  origen,
  base,
  sitio,
  planes,
  preguntas,
  pasos,
  hace,
  noHace,
  requisitos,
  paraQuien,
  preciosDePrueba,
  legales,
}) {
  const moneda = planes.moneda.toUpperCase();
  return [
    `# ${sitio.producto}`,
    '',
    `> ${sitio.descripcion}`,
    '',
    `${sitio.producto} es un producto de ${sitio.nombre} (${sitio.ciudad}, México). Es un agente virtual con inteligencia artificial que atiende el WhatsApp de un negocio con agenda: contesta, ofrece horarios reales, cobra el anticipo y solo entonces agenda la cita.`,
    '',
    '## Para quién',
    '',
    paraQuien,
    '',
    '## Lo que hace el agente',
    '',
    ...hace.map(({ titulo, texto }) => `- ${titulo}: ${texto}`),
    '',
    '## Cómo empiezas',
    '',
    ...pasos.map((paso, i) => `${i + 1}. ${paso}`),
    '',
    '## Lo que no hace',
    '',
    ...noHace.map((texto) => `- ${texto}`),
    '',
    '## Planes',
    '',
    ...(preciosDePrueba ? ['Precios de prueba: todavía no son los definitivos.', ''] : []),
    ...planes.planes.map(
      (plan) =>
        `- ${plan.nombre}: ${pesos(plan.mensual)} ${moneda} al mes o ${pesos(plan.anual)} ${moneda} al año. ${plan.incluye.join('. ')}.`,
    ),
    `- Instalación única: ${pesos(planes.planes[0]?.instalacion ?? 0)} ${moneda}. La mensualidad empieza el día que el agente queda activo.`,
    '',
    '## Qué se necesita para empezar',
    '',
    ...requisitos.map((texto) => `- ${texto}`),
    '',
    '## Preguntas frecuentes',
    '',
    ...preguntas.flatMap(({ pregunta, respuesta }) => [`### ${pregunta}`, '', respuesta, '']),
    '## Enlaces',
    '',
    `- [Página principal](${origen}${base})`,
    `- [Empezar](${sitio.alta})`,
    `- [Términos](${legales.terminos})`,
    `- [Aviso de privacidad](${legales.privacidad})`,
    '',
  ].join('\n');
}
