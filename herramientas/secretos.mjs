// @ts-check
// La pagina no tiene secretos. Esta red existe para que nunca entre uno por descuido a un repo publico.

/** @type {[string, RegExp][]} */
const PATRONES = [
  ['llave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token de GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['token fino de GitHub', /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['llave de Stripe', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ['secreto de webhook de Stripe', /\bwhsec_[A-Za-z0-9]{24,}\b/],
  ['llave de OpenAI', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['token de Mercado Pago', /\b(?:APP_USR|TEST)-[0-9]{10,}-[0-9]{6}-[a-f0-9]{32}/],
  ['llave de Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['llave de AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['token JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

/**
 * Los tipos de secreto que aparecen en un texto (nunca el secreto mismo).
 * @param {string} texto
 * @returns {string[]}
 */
export function secretosEn(texto) {
  return PATRONES.filter(([, patron]) => patron.test(texto)).map(([nombre]) => nombre);
}
