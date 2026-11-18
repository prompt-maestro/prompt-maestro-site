// @ts-check
// Redaccion de horas, dinero y textos con huecos. Sigue las mismas reglas con las que el asistente de verdad redacta
// (a las 5:00 pm, a la 1:00 pm; "a, b o c", con "u" antes de 8 y de 11), para que la demostracion suene igual.

/**
 * @param {string} hora  por ejemplo "5:00 pm"
 * @returns {string}  "a las 5:00 pm" o "a la 1:00 pm"
 */
export function aLaHora(hora) {
  return hora.startsWith('1:') ? `a la ${hora}` : `a las ${hora}`;
}

/**
 * @param {string[]} horas
 * @returns {string}  "a las 10:00 am, 12:30 pm, 4:00 pm o 5:00 pm"
 */
export function listaDeHoras(horas) {
  const [primera = '', ...resto] = horas;
  const ultima = resto.pop();
  if (ultima === undefined) return aLaHora(primera);
  const union = /^(8|11):/.test(ultima) ? 'u' : 'o';
  return `${[aLaHora(primera), ...resto].join(', ')} ${union} ${ultima}`;
}

/**
 * Una hora del guion, en minutos desde la medianoche. Una hora mal escrita detiene todo.
 * @param {string} hora  por ejemplo "5:00 pm"
 * @returns {number}  1020
 */
export function minutosDe(hora) {
  const partes = /^(1[0-2]|[1-9]):([0-5]\d) (am|pm)$/.exec(hora);
  if (!partes) throw new Error(`Guion: no entiendo la hora "${hora}"`);
  return ((Number(partes[1]) % 12) + (partes[3] === 'pm' ? 12 : 0)) * 60 + Number(partes[2]);
}

/**
 * La hora como la escribe WhatsApp al pie de cada mensaje. Los minutos dan la vuelta al dia.
 * @param {number} minutos  desde la medianoche
 * @returns {string}  "5:00 p. m.", "10:12 a. m."
 */
export function horaDeGlobo(minutos) {
  const delDia = ((minutos % 1440) + 1440) % 1440;
  return `${horaDeReloj(delDia)} ${delDia < 720 ? 'a. m.' : 'p. m.'}`;
}

/**
 * La hora como la ensena la barra de arriba de un celular: sin manana ni tarde.
 * @param {number} minutos  desde la medianoche
 * @returns {string}  "5:00", "12:42"
 */
export function horaDeReloj(minutos) {
  const delDia = ((minutos % 1440) + 1440) % 1440;
  return `${Math.floor(delDia / 60) % 12 || 12}:${String(delDia % 60).padStart(2, '0')}`;
}

/**
 * El dia como va en la ficha de un calendario: sus tres primeras letras, en mayusculas.
 * @param {string} dia  "jueves", "miércoles"
 * @returns {string}  "JUE", "MIÉ"
 */
export function diaCorto(dia) {
  return dia.slice(0, 3).toUpperCase();
}

/**
 * @param {number} cantidad
 * @returns {string}  "$150", "$1,250"
 */
export function pesos(cantidad) {
  return `$${Math.round(cantidad)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * @param {string} texto
 * @returns {string}
 */
export function conMayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Llena los huecos {asi} de un texto. Un hueco sin dato detiene todo: la demostracion nunca ensena una frase rota.
 * @param {string} texto
 * @param {Record<string, string>} datos
 * @returns {string}
 */
export function rellenar(texto, datos) {
  return texto.replace(/\{(\w+)\}/g, (_, clave) => {
    const valor = datos[clave];
    if (valor === undefined) throw new Error(`Guion: falta el dato {${clave}}`);
    return valor;
  });
}
