// @ts-check
// Comprobaciones sobre lo armado. Cada una devuelve una lista de problemas en espanol; vacia quiere decir que paso.

/** @type {Record<string, string>} */
const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

// Los cuatro guiones largos de Unicode (del 2012 al 2015), escritos por su numero para que este archivo no lleve ninguno,
// y el guion normal cuando va suelto entre dos espacios.
const GUIONES_LARGOS = [0x2012, 0x2013, 0x2014, 0x2015].map((codigo) => String.fromCodePoint(codigo)).join('');
const CONECTOR = new RegExp(`[${GUIONES_LARGOS}]| - `, 'g');

/**
 * El texto que lee una persona: sin scripts, sin estilos y sin etiquetas.
 * @param {string} html
 * @returns {string}
 */
export function textoVisible(html) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Los textos de la pagina no llevan guiones largos, ni un guion suelto que una dos ideas. Devuelve cada lugar donde
 * un texto ya limpio (sin etiquetas) lleva uno.
 * @param {string} texto
 * @returns {string[]}
 */
export function guionesEn(texto) {
  return [...texto.matchAll(CONECTOR)].map(
    (m) => `guion como conector en "...${texto.slice(Math.max(0, m.index - 30), m.index + 30)}..."`,
  );
}

/**
 * Lo mismo, sobre el texto que se lee de una pagina ya armada.
 * @param {string} nombre
 * @param {string} html
 * @returns {string[]}
 */
export function revisarGuiones(nombre, html) {
  return guionesEn(textoVisible(html)).map((hallazgo) => `${nombre}: ${hallazgo}`);
}

/**
 * Todo lo que el HTML pide dentro del sitio (hojas de estilo, scripts, imagenes, enlaces) tiene que existir en lo armado.
 * @param {string} nombre
 * @param {string} html
 * @param {string} base  la carpeta donde se sirve el sitio: "/" o "/pagina-previa/"
 * @param {(ruta: string) => boolean} existe
 * @returns {string[]}
 */
export function revisarEnlacesInternos(nombre, html, base, existe) {
  /** @type {string[]} */
  const problemas = [];
  for (const m of html.matchAll(/\s(?:href|src|poster)="([^"]*)"/g)) {
    const destino = m[1] ?? '';
    if (/^(https?:|mailto:|tel:|data:|#)/.test(destino)) continue;
    if (!destino.startsWith(base)) {
      problemas.push(`${nombre}: "${destino}" no empieza con ${base} (se rompe en la previa o en el dominio)`);
      continue;
    }
    const ruta = (destino.slice(base.length).split(/[?#]/)[0] ?? '').replace(/\/$/, '');
    const candidatas = ruta === '' ? ['index.html'] : [ruta, `${ruta}.html`, `${ruta}/index.html`];
    if (!candidatas.some(existe)) problemas.push(`${nombre}: "${destino}" no existe en lo armado`);
  }
  return problemas;
}
