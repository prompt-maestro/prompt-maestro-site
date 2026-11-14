// @ts-check
// La logica de la demostracion. No toca la pantalla: recibe un estado y un evento y devuelve el estado siguiente, y
// sabe decir que se ve en cada paso. Asi se prueba sin navegador, y la misma logica arma la conversacion de ejemplo
// que queda escrita en la pagina para quien no tiene JavaScript. Pintar es trabajo de demo-vista.js.
import { aLaHora, conMayuscula, listaDeHoras, pesos, rellenar } from './redaccion.js';

/** @typedef {'reposo' | 'precio' | 'horarios' | 'apartado' | 'pagado' | 'recordatorios' | 'asistencia' | 'finSi' | 'finNo' | 'cierre'} Paso */
/** @typedef {{ paso: Paso, cuando: string | null, hora: string | null, asistio: boolean | null }} Estado */
/**
 * @typedef {{ tipo: 'enviar' } | { tipo: 'cuando', id: string } | { tipo: 'hora', hora: string } | { tipo: 'pagar' }
 *   | { tipo: 'seguir' } | { tipo: 'asistio', valor: boolean } | { tipo: 'reiniciar' }} Evento
 */
/** @typedef {{ id: string, ficha: string, dice: string, dia: string, horas: string[] }} Cuando */
/**
 * Lo que cambia de un ejemplo a otro: lo que el asistente redacta con su propio tono.
 * @typedef {{ pregunta: string, saludo: string[], cuando: Cuando[], horaSugerida: string, eligeHora: string, apartado: string }} Guion
 */
/**
 * @typedef {{ clave: string, nombre: string, persona: string, negocio: string, asistente: string, profesional: string,
 *   cliente: string, servicio: string, servicioCorto: string, precio: number, anticipo: number, direccion: string }} Giro
 */
/**
 * Las frases que el motor manda tal cual, iguales en todos los ejemplos.
 * @typedef {Record<'horarios' | 'cobro' | 'confirmacion' | 'recordatorioDia' | 'recordatorioHora' | 'preguntaAsistencia'
 *   | 'graciasSi' | 'avisoNo' | 'registroSi' | 'registroNo', string>} Fijos
 */
/** @typedef {{ giro: Giro, guion: Guion, fijos: Fijos, tu: Record<Paso, string>, rotulos: Record<string, string> }} Ejemplo */
/** @typedef {{ de: 'cliente' | 'asistente' | 'salto' | 'cobro' | 'aprobado', texto: string, boton?: boolean }} Entrada */
/** @typedef {'libre' | 'apartado' | 'garantizada' | 'asistio' | 'falto'} EstadoDeFila */
/** @typedef {{ hora: string, estado: EstadoDeFila }} Fila */
/**
 * Lo que ve la profesional: una linea, su agenda del dia y, si el asistente le escribe, su mensaje.
 * @typedef {{ resumen: string, abre: boolean, dia: string | null, filas: Fila[], mensaje: string | null }} LoQueVesTu
 */
/** @typedef {{ chat: Entrada[], tu: LoQueVesTu }} Escena */
/** @typedef {{ evento: Evento, clase: 'enviar' | 'ficha' | 'pagar' | 'seguir' | 'si' | 'no', etiqueta?: string }} Accion */

/** @returns {Estado} */
export function estadoInicial() {
  return { paso: 'reposo', cuando: null, hora: null, asistio: null };
}

/**
 * @param {Estado} estado
 * @param {Guion} guion
 * @returns {Cuando | null}
 */
function opcionElegida(estado, guion) {
  return guion.cuando.find((opcion) => opcion.id === estado.cuando) ?? null;
}

/**
 * El estado siguiente. Un evento que no toca en ese paso devuelve el mismo estado, sin cambiarlo.
 * @param {Estado} estado
 * @param {Evento} evento
 * @param {Guion} guion
 * @returns {Estado}
 */
export function avanzar(estado, evento, guion) {
  switch (evento.tipo) {
    case 'reiniciar':
      return estadoInicial();
    case 'enviar':
      return estado.paso === 'reposo' ? { ...estado, paso: 'precio' } : estado;
    case 'cuando':
      if (estado.paso !== 'precio' || !guion.cuando.some((opcion) => opcion.id === evento.id)) return estado;
      return { ...estado, paso: 'horarios', cuando: evento.id };
    case 'hora':
      if (estado.paso !== 'horarios' || !opcionElegida(estado, guion)?.horas.includes(evento.hora)) return estado;
      return { ...estado, paso: 'apartado', hora: evento.hora };
    case 'pagar':
      return estado.paso === 'apartado' ? { ...estado, paso: 'pagado' } : estado;
    case 'seguir':
      if (estado.paso === 'pagado') return { ...estado, paso: 'recordatorios' };
      if (estado.paso === 'recordatorios') return { ...estado, paso: 'asistencia' };
      if (estado.paso === 'finSi' || estado.paso === 'finNo') return { ...estado, paso: 'cierre' };
      return estado;
    case 'asistio':
      if (estado.paso !== 'asistencia') return estado;
      return { ...estado, paso: evento.valor ? 'finSi' : 'finNo', asistio: evento.valor };
  }
}

/**
 * Lo que la visitante puede hacer en este paso.
 * @param {Estado} estado
 * @param {Guion} guion
 * @returns {Accion[]}
 */
export function accionesDe(estado, guion) {
  switch (estado.paso) {
    case 'reposo':
      return [{ evento: { tipo: 'enviar' }, clase: 'enviar' }];
    case 'precio':
      return guion.cuando.map((opcion) => ({
        evento: { tipo: 'cuando', id: opcion.id },
        clase: 'ficha',
        etiqueta: opcion.ficha,
      }));
    case 'horarios':
      return (opcionElegida(estado, guion)?.horas ?? []).map((hora) => ({
        evento: { tipo: 'hora', hora },
        clase: 'ficha',
        etiqueta: hora,
      }));
    case 'apartado':
      return [{ evento: { tipo: 'pagar' }, clase: 'pagar' }];
    case 'asistencia':
      return [
        { evento: { tipo: 'asistio', valor: true }, clase: 'si' },
        { evento: { tipo: 'asistio', valor: false }, clase: 'no' },
      ];
    case 'finSi':
    case 'finNo':
    case 'cierre':
      return [];
    default:
      return [{ evento: { tipo: 'seguir' }, clase: 'seguir' }];
  }
}

/**
 * Lo que elige la demostracion cuando corre sola: siempre el camino feliz.
 * @param {Estado} estado
 * @param {Guion} guion
 * @returns {Evento | null}
 */
export function porDefecto(estado, guion) {
  switch (estado.paso) {
    case 'reposo':
      return { tipo: 'enviar' };
    case 'precio': {
      const primera = guion.cuando[0];
      return primera ? { tipo: 'cuando', id: primera.id } : null;
    }
    case 'horarios': {
      const horas = opcionElegida(estado, guion)?.horas ?? [];
      const hora = horas.includes(guion.horaSugerida) ? guion.horaSugerida : horas.at(-1);
      return hora ? { tipo: 'hora', hora } : null;
    }
    case 'apartado':
      return { tipo: 'pagar' };
    case 'asistencia':
      return { tipo: 'asistio', valor: true };
    case 'cierre':
      return null;
    default:
      return { tipo: 'seguir' };
  }
}

/** @type {Partial<Record<Paso, EstadoDeFila>>} */
const FILA_POR_PASO = {
  apartado: 'apartado',
  pagado: 'garantizada',
  recordatorios: 'garantizada',
  asistencia: 'garantizada',
  finSi: 'asistio',
  finNo: 'falto',
};

/** Los pasos en que lo que ve la profesional pasa al frente. */
const ABRE = new Set(['pagado', 'asistencia', 'finSi', 'finNo']);

/**
 * Lo que aparece al entrar a un paso: los mensajes nuevos del chat y lo que ve la profesional.
 * @param {Estado} estado
 * @param {Ejemplo} ejemplo
 * @returns {Escena}
 */
export function escenaDe(estado, ejemplo) {
  const { giro, guion, fijos, tu, rotulos } = ejemplo;
  const opcion = opcionElegida(estado, guion);
  /** @type {Record<string, string>} */
  const datos = {
    asistente: giro.asistente,
    negocio: giro.negocio,
    profesional: giro.profesional,
    cliente: giro.cliente,
    servicio: giro.servicio,
    direccion: giro.direccion,
    precio: pesos(giro.precio),
    anticipo: pesos(giro.anticipo),
  };
  if (opcion) {
    datos.dia = opcion.dia;
    datos.horas = listaDeHoras(opcion.horas);
  }
  if (estado.hora) {
    datos.aLaHora = aLaHora(estado.hora);
    datos.ALaHora = conMayuscula(datos.aLaHora);
  }
  const llenar = (/** @type {string} */ texto) => rellenar(texto, datos);
  const dice = (/** @type {Entrada['de']} */ de, /** @type {string} */ texto) => ({ de, texto: llenar(texto) });
  const rotulo = (/** @type {string} */ clave) => rotulos[clave] ?? clave;

  /** @type {Entrada[]} */
  let chat = [];
  /** @type {string | null} */
  let mensaje = null;
  switch (estado.paso) {
    case 'precio':
      chat = [dice('cliente', guion.pregunta), ...guion.saludo.map((texto) => dice('asistente', texto))];
      break;
    case 'horarios':
      chat = [dice('cliente', opcion?.dice ?? ''), dice('asistente', fijos.horarios)];
      break;
    case 'apartado':
      chat = [dice('cliente', guion.eligeHora), dice('asistente', guion.apartado), dice('cobro', fijos.cobro)];
      break;
    case 'pagado':
      chat = [dice('aprobado', rotulo('pagoAprobado')), dice('asistente', fijos.confirmacion)];
      break;
    case 'recordatorios':
      chat = [
        dice('salto', rotulo('unDiaAntes')),
        { ...dice('asistente', fijos.recordatorioDia), boton: true },
        dice('salto', rotulo('unaHoraAntes')),
        dice('asistente', fijos.recordatorioHora),
      ];
      break;
    case 'asistencia':
      chat = [dice('salto', rotulo('alTerminar'))];
      mensaje = llenar(fijos.preguntaAsistencia);
      break;
    case 'finSi':
      chat = [dice('asistente', fijos.graciasSi)];
      mensaje = llenar(fijos.registroSi);
      break;
    case 'finNo':
      chat = [dice('asistente', fijos.avisoNo)];
      mensaje = llenar(fijos.registroNo);
      break;
    case 'cierre':
      // Lo ultimo que el asistente le dijo a la profesional se queda a la vista.
      mensaje = llenar(estado.asistio ? fijos.registroSi : fijos.registroNo);
      break;
  }

  const porFila = estado.paso === 'cierre' ? (estado.asistio ? 'asistio' : 'falto') : FILA_POR_PASO[estado.paso];
  return {
    chat,
    tu: {
      resumen: llenar(tu[estado.paso]),
      abre: ABRE.has(estado.paso),
      dia: opcion?.dia ?? null,
      filas: (opcion?.horas ?? []).map((hora) => ({
        hora,
        estado: hora === estado.hora && porFila ? porFila : 'libre',
      })),
      mensaje,
    },
  };
}

/**
 * Como se presenta un ejemplo en el telefono: las iniciales del negocio, quien atiende y el papel de la visitante.
 * @param {Giro} giro
 * @param {Record<string, string>} rotulos
 * @returns {{ iniciales: string, atiende: string, papel: string }}
 */
export function presentacionDe(giro, rotulos) {
  const datos = { asistente: giro.asistente, cliente: giro.cliente, negocio: giro.negocio };
  return {
    iniciales: giro.negocio
      .split(/\s+/)
      .slice(0, 2)
      .map((palabra) => palabra.charAt(0).toUpperCase())
      .join(''),
    atiende: rellenar(rotulos.atiende ?? '', datos),
    papel: rellenar(rotulos.papel ?? '', datos),
  };
}

/**
 * La historia completa por el camino feliz, como texto: quien habla y que dice. Es lo que queda escrito en la pagina
 * para quien no tiene JavaScript y para los buscadores.
 * @param {Ejemplo} ejemplo
 * @returns {{ quien: string, texto: string }[]}
 */
export function conversacionDeEjemplo(ejemplo) {
  const { giro, guion, rotulos } = ejemplo;
  const aLaProfesional = `${giro.asistente}, a ${giro.profesional}`;
  /** @type {{ quien: string, texto: string }[]} */
  const lineas = [];
  let estado = estadoInicial();
  for (;;) {
    const escena = escenaDe(estado, ejemplo);
    if (estado.paso === 'finSi') {
      lineas.push({ quien: giro.profesional, texto: rotulos.si ?? '' });
      if (escena.tu.mensaje) lineas.push({ quien: aLaProfesional, texto: escena.tu.mensaje });
    }
    for (const entrada of escena.chat) {
      if (entrada.de === 'cliente') lineas.push({ quien: giro.cliente, texto: entrada.texto });
      else if (entrada.de === 'asistente') lineas.push({ quien: giro.asistente, texto: entrada.texto });
      else if (entrada.de === 'cobro')
        lineas.push({ quien: giro.asistente, texto: `${entrada.texto}: ${pesos(giro.anticipo)}` });
      else lineas.push({ quien: '', texto: entrada.texto });
    }
    if (estado.paso === 'asistencia' && escena.tu.mensaje)
      lineas.push({ quien: aLaProfesional, texto: escena.tu.mensaje });
    const evento = porDefecto(estado, guion);
    if (!evento) return lineas;
    estado = avanzar(estado, evento, guion);
  }
}
