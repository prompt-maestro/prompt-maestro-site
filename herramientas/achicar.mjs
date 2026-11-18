// @ts-check
// Achica una hoja de estilos SIN cambiar lo que significa: le quita los comentarios y los espacios que sobran, y
// nada mas. No reordena, no une reglas y no reescribe ningun valor. Los comentarios se quedan en los archivos de
// fuente/estilos/: solo se van de la hoja que se publica. Es pura: la misma hoja da siempre los mismos bytes.
//
// Lo que NO toca, porque ahi un espacio (o lo que parece un comentario) si significa algo:
//   - lo que va entre comillas ("..." y '...') y dentro de un url(...) sin comillas: se copian tal cual;
//   - los espacios alrededor de + - > ~ * / y de los parentesis: en calc() separan una suma de un signo, en un
//     selector son combinadores y en @media separan "and" de lo que sigue. Quedan en un solo espacio;
//   - el espacio antes de dos puntos ("a :hover" no es "a:hover") y el de un valor vacio ("--x: ;");
//   - un escape con diagonal invertida, con el espacio que lo cierra.

const ESPACIO = /\s/;
/** Junto a estos signos un espacio nunca significa nada: se quita el de antes y el de despues. */
const SIN_ESPACIOS = new Set(['{', '}', ';', ',']);

/**
 * Si en ese lugar empieza un url(...) sin comillas. Con comillas no hace falta cuidarlo: lo de adentro es una cadena.
 * @param {string} css
 * @param {number} i
 * @returns {boolean}
 */
function esUrlSinComillas(css, i) {
  if (css.slice(i, i + 4).toLowerCase() !== 'url(' || /[\w-]/.test(css[i - 1] ?? '')) return false;
  let sigue = i + 4;
  while (ESPACIO.test(css[sigue] ?? '')) sigue++;
  return css[sigue] !== '"' && css[sigue] !== "'";
}

/**
 * @param {string} css
 * @returns {string}
 */
export function achicarCss(css) {
  const largo = css.length;
  let salida = '';
  // Si entre lo ultimo que se escribio y lo que sigue habia espacios.
  let hueco = false;

  /**
   * Escribe un trozo. Si antes habia espacios deja uno solo, salvo donde no significa nada: al principio, junto a una
   * llave, un punto y coma o una coma, y despues de los dos puntos.
   * @param {string} trozo
   */
  const escribir = (trozo) => {
    const antes = salida.at(-1) ?? '';
    const primero = trozo[0] ?? '';
    // Un valor vacio a proposito ("--x: ;") conserva su espacio; fuera de el, despues de dos puntos el espacio sobra.
    const vacio = antes === ':' && (primero === ';' || primero === '}');
    const significa = antes !== '' && antes !== ':' && !SIN_ESPACIOS.has(antes) && !SIN_ESPACIOS.has(primero);
    if (hueco && (vacio || significa)) salida += ' ';
    hueco = false;
    salida += trozo;
  };

  let i = 0;
  while (i < largo) {
    const letra = /** @type {string} */ (css[i]);
    if (ESPACIO.test(letra)) {
      hueco = true;
      i++;
    } else if (letra === '/' && css[i + 1] === '*') {
      // Un comentario: se va entero. Solo si es lo unico que separa dos piezas ("0/**/auto") se deja uno vacio.
      const cierre = css.indexOf('*/', i + 2);
      const sigue = cierre < 0 ? largo : cierre + 2;
      const antes = salida.at(-1) ?? '';
      const despues = css[sigue] ?? '';
      const separa =
        !hueco &&
        antes !== '' &&
        despues !== '' &&
        !ESPACIO.test(despues) &&
        !(despues === '/' && css[sigue + 1] === '*');
      if (separa && !SIN_ESPACIOS.has(antes) && !SIN_ESPACIOS.has(despues)) salida += '/**/';
      i = sigue;
    } else if (letra === '"' || letra === "'") {
      // Una cadena, hasta su comilla de cierre (una comilla escapada no la cierra).
      let fin = i + 1;
      while (fin < largo && css[fin] !== letra) fin += css[fin] === '\\' ? 2 : 1;
      escribir(css.slice(i, fin + 1));
      i = fin + 1;
    } else if (letra === '\\') {
      // Un escape: la diagonal y lo que escapa. Si es un codigo (hasta seis digitos), tambien el espacio que lo cierra.
      const trozo = /^\\[0-9a-fA-F]{1,6}\s?/.exec(css.slice(i, i + 8))?.[0] ?? css.slice(i, i + 2);
      escribir(trozo);
      i += trozo.length;
    } else if (esUrlSinComillas(css, i)) {
      let fin = i + 4;
      while (fin < largo && css[fin] !== ')') fin += css[fin] === '\\' ? 2 : 1;
      escribir(css.slice(i, fin + 1));
      i = fin + 1;
    } else {
      escribir(letra);
      i++;
    }
  }
  return salida;
}
