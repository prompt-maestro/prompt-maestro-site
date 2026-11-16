// @ts-check
// La logica de la demostracion. No toca la pantalla: recibe un estado y un evento y devuelve el estado siguiente, y
// sabe decir que se ve en cada paso. Asi se prueba sin navegador, y la misma logica arma la conversacion de ejemplo
// que queda escrita en la pagina para quien no tiene JavaScript. Pintar es trabajo de demo-vista.js.
//
// La historia tiene dos actos. En el primero la visitante es quien pide la cita y el telefono es el suyo. En el
// segundo (desde "asistencia") es la profesional: el telefono pasa a ser el de ella y quien le escribe es su asistente.
//
// La misma historia se cuenta con varios ejemplos (unas, dentista, medico). Un ejemplo es un giro de datos/giros.json
// con su guion de datos/guiones/: sumar un oficio es sumar esas dos cosas, sin tocar este archivo.
import { aLaHora, conMayuscula, listaDeHoras, pesos, rellenar } from './redaccion.js';

/** @typedef {'reposo' | 'precio' | 'horarios' | 'apartado' | 'pagado' | 'recordatorios' | 'asistencia' | 'finSi' | 'finNo' | 'cierre'} Paso */
/** @typedef {{ paso: Paso, cuando: string | null, hora: string | null, asistio: boolean | null }} Estado */
/**
 * @typedef {{ tipo: 'enviar' } | { tipo: 'cuando', id: string } | { tipo: 'hora', hora: string } | { tipo: 'pagar' }
 *   | { tipo: 'seguir' } | { tipo: 'asistio', valor: boolean } | { tipo: 'reiniciar' }} Evento
 */
/** @typedef {{ id: string, ficha: string, dice: string, dia: string, horas: string[] }} Cuando */
/**
 * Lo que cambia de un ejemplo a otro: lo que el asistente redacta con su propio tono, y las demas citas de ese dia.
 * @typedef {{ pregunta: string, saludo: string[], cuando: Cuando[], horaSugerida: string, eligeHora: string,
 *   apartado: string, otras: string[] }} Guion
 */
/**
 * El negocio del ejemplo. "nombre" es con lo que se elige el ejemplo; "lugar", como se le llama a ese tipo de negocio
 * ("un consultorio dental"); "persona", como le dice ese giro a quien atiende (clienta, paciente), y "humano", con
 * quien la comunica la salida PERSONA ("la duena", "una persona del consultorio").
 * @typedef {{ clave: string, nombre: string, lugar: string, persona: string, humano: string, negocio: string,
 *   asistente: string, profesional: string, cliente: string, servicio: string, servicioCorto: string, precio: number,
 *   anticipo: number, direccion: string }} Giro
 */
/**
 * Las frases que el motor manda tal cual, iguales en todos los ejemplos. Lo que cambia de un giro a otro dentro de
 * una frase fija (con quien pasa la salida PERSONA) es un dato del giro, nunca otra frase.
 * @typedef {Record<'salida' | 'horarios' | 'cobro' | 'confirmacion' | 'recordatorioDia' | 'recordatorioHora'
 *   | 'preguntaAsistencia' | 'registroSi' | 'registroNo', string>} Fijos
 */
/** @typedef {{ giro: Giro, guion: Guion, fijos: Fijos, tu: Record<Paso, string>, rotulos: Record<string, string> }} Ejemplo */
/** La demostracion en un momento dado: que ejemplo esta puesto y por donde va su historia. @typedef {{ ejemplo: Ejemplo, estado: Estado }} Sesion */
/** Un ejemplo que se puede elegir; el elegido es el que esta puesto. @typedef {{ clave: string, nombre: string, elegido: boolean }} OpcionDeEjemplo */
/** @typedef {'cliente' | 'profesional'} Telefono  de quien es el telefono que se ve */
/**
 * Un mensaje nuevo del chat. "cliente" y "profesional" son la visitante, segun el acto; "salto" es un paso del tiempo.
 * @typedef {{ de: 'cliente' | 'profesional' | 'asistente' | 'salto' | 'cobro' | 'aprobado', texto: string, boton?: boolean }} Entrada
 */
/** @typedef {'libre' | 'apartado' | 'garantizada' | 'asistio' | 'falto'} EstadoDeFila */
/** @typedef {{ hora: string, estado: EstadoDeFila, texto: string }} Fila */
/** Lo que ve la profesional: una linea que cuenta que pasa y su agenda de ese dia. @typedef {{ resumen: string, dia: string, filas: Fila[] }} LoQueVesTu */
/** @typedef {{ telefono: Telefono, chat: Entrada[], tu: LoQueVesTu }} Escena */
/**
 * Algo que la visitante puede tocar. La sugerida es la que la demostracion elegiria sola: lleva la pista.
 * @typedef {{ evento: Evento, clase: 'enviar' | 'ficha' | 'pagar' | 'seguir' | 'si' | 'no', etiqueta: string, sugerida: boolean }} Accion
 */

/** Los pasos del segundo acto: el telefono es el de la profesional. */
const ACTO_DE_LA_PROFESIONAL = new Set(['asistencia', 'finSi', 'finNo', 'cierre']);

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
 * @param {Paso} paso
 * @returns {Telefono}
 */
export function telefonoDe(paso) {
  return ACTO_DE_LA_PROFESIONAL.has(paso) ? 'profesional' : 'cliente';
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

/**
 * Lo que la visitante puede tocar en este paso. En los dos finales y en el cierre no hay nada: la historia sigue sola.
 * @param {Estado} estado
 * @param {Ejemplo} ejemplo
 * @returns {Accion[]}
 */
export function accionesDe(estado, ejemplo) {
  const { guion, rotulos } = ejemplo;
  const rotulo = (/** @type {string} */ clave) => rotulos[clave] ?? clave;
  const sugerida = JSON.stringify(porDefecto(estado, guion));
  /** @type {Omit<Accion, 'sugerida'>[]} */
  let acciones = [];
  switch (estado.paso) {
    case 'reposo':
      acciones = [{ evento: { tipo: 'enviar' }, clase: 'enviar', etiqueta: rotulo('enviar') }];
      break;
    case 'precio':
      acciones = guion.cuando.map((opcion) => ({
        evento: { tipo: 'cuando', id: opcion.id },
        clase: 'ficha',
        etiqueta: opcion.ficha,
      }));
      break;
    case 'horarios':
      acciones = (opcionElegida(estado, guion)?.horas ?? []).map((hora) => ({
        evento: { tipo: 'hora', hora },
        clase: 'ficha',
        etiqueta: hora,
      }));
      break;
    case 'apartado':
      acciones = [{ evento: { tipo: 'pagar' }, clase: 'pagar', etiqueta: rotulo('pagar') }];
      break;
    case 'pagado':
      acciones = [{ evento: { tipo: 'seguir' }, clase: 'seguir', etiqueta: rotulo('seguir') }];
      break;
    case 'recordatorios':
      acciones = [{ evento: { tipo: 'seguir' }, clase: 'seguir', etiqueta: rotulo('seguirAlFinal') }];
      break;
    case 'asistencia':
      acciones = [
        { evento: { tipo: 'asistio', valor: true }, clase: 'si', etiqueta: rotulo('si') },
        { evento: { tipo: 'asistio', valor: false }, clase: 'no', etiqueta: rotulo('no') },
      ];
      break;
  }
  return acciones.map((accion) => ({ ...accion, sugerida: JSON.stringify(accion.evento) === sugerida }));
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

/**
 * Lo que aparece al entrar a un paso: de quien es el telefono, los mensajes nuevos y lo que ve la profesional.
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
    humano: giro.humano,
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
  switch (estado.paso) {
    case 'precio':
      // El saludo lo redacta el asistente con su tono; la salida PERSONA es frase fija y cierra su primer mensaje.
      chat = [
        dice('cliente', guion.pregunta),
        ...guion.saludo.map((texto) => dice('asistente', texto)),
        dice('asistente', fijos.salida),
      ];
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
      chat = [dice('asistente', fijos.preguntaAsistencia)];
      break;
    case 'finSi':
      chat = [dice('profesional', rotulo('si')), dice('asistente', fijos.registroSi)];
      break;
    case 'finNo':
      chat = [dice('profesional', rotulo('no')), dice('asistente', fijos.registroNo)];
      break;
  }

  // La agenda de la profesional. Antes de que la visitante elija dia se ve el primero que ofrece el guion.
  const delDia = opcion ?? /** @type {Cuando} */ (guion.cuando[0]);
  const enCierre = estado.paso === 'cierre';
  const deLaCita = enCierre ? (estado.asistio ? 'asistio' : 'falto') : FILA_POR_PASO[estado.paso];
  let otra = 0;
  /** @type {Fila[]} */
  const filas = delDia.horas.map((hora) => {
    if (hora === estado.hora && deLaCita) {
      const texto =
        deLaCita === 'apartado'
          ? rotulo('apartado')
          : deLaCita === 'garantizada'
            ? `${giro.servicioCorto} · ${giro.cliente}`
            : `${rotulo(deLaCita)} · ${giro.cliente}`;
      return { hora, estado: deLaCita, texto };
    }
    // En el cuadro final el dia entero queda lleno: cada cita, con su anticipo pagado.
    const llena = enCierre ? guion.otras[otra++] : undefined;
    return llena ? { hora, estado: 'garantizada', texto: llena } : { hora, estado: 'libre', texto: rotulo('libre') };
  });

  return {
    telefono: telefonoDe(estado.paso),
    chat,
    tu: { resumen: llenar(tu[estado.paso]), dia: delDia.dia, filas },
  };
}

/**
 * Como se presenta cada telefono: las iniciales, el nombre, quien atiende y la acotacion que le dice a la visitante
 * que papel le toca.
 * @param {Giro} giro
 * @param {Record<string, string>} rotulos
 * @param {Telefono} telefono
 * @returns {{ iniciales: string, nombre: string, atiende: string, papel: string }}
 */
export function presentacionDe(giro, rotulos, telefono) {
  const datos = { asistente: giro.asistente, cliente: giro.cliente, negocio: giro.negocio };
  const deLaProfesional = telefono === 'profesional';
  const nombre = deLaProfesional ? giro.asistente : giro.negocio;
  return {
    iniciales: nombre
      .split(/\s+/)
      .slice(0, 2)
      .map((palabra) => palabra.charAt(0).toUpperCase())
      .join(''),
    nombre,
    atiende: rellenar(rotulos[deLaProfesional ? 'atiendeTu' : 'atiende'] ?? '', datos),
    papel: rellenar(rotulos[deLaProfesional ? 'papelTu' : 'papel'] ?? '', datos),
  };
}

/**
 * Los ejemplos que la visitante puede elegir, en su orden, con el que esta puesto marcado.
 * @param {Ejemplo[]} ejemplos
 * @param {Ejemplo} actual
 * @returns {OpcionDeEjemplo[]}
 */
export function opcionesDeEjemplo(ejemplos, actual) {
  return ejemplos.map(({ giro }) => ({
    clave: giro.clave,
    nombre: giro.nombre,
    elegido: giro.clave === actual.giro.clave,
  }));
}

/**
 * La visitante elige un ejemplo: la historia vuelve al reposo con ese ejemplo, vaya por donde vaya. Elegir el que ya
 * esta puesto, o uno que no existe, devuelve la misma sesion sin cambiarla: la historia sigue donde iba.
 * @param {Ejemplo[]} ejemplos
 * @param {Sesion} sesion
 * @param {string} clave
 * @returns {Sesion}
 */
export function elegirEjemplo(ejemplos, sesion, clave) {
  const ejemplo = ejemplos.find((uno) => uno.giro.clave === clave);
  if (!ejemplo || clave === sesion.ejemplo.giro.clave) return sesion;
  return { ejemplo, estado: estadoInicial() };
}

/**
 * Lo que la pagina dice de un ejemplo fuera del telefono: la leyenda al pie y el aviso, para quien no lo ve cambiar,
 * de cual es ahora el ejemplo y que papel le toca.
 * @param {Giro} giro
 * @param {Record<string, string>} rotulos
 * @returns {{ leyenda: string, anuncio: string }}
 */
export function rotulosDeEjemplo(giro, rotulos) {
  const datos = { nombre: giro.nombre, lugar: giro.lugar };
  const elegido = rellenar(rotulos.ejemploElegido ?? '', datos);
  return {
    leyenda: rellenar(rotulos.leyenda ?? '', datos),
    anuncio: `${elegido} ${presentacionDe(giro, rotulos, 'cliente').papel}`,
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
  /** @type {{ quien: string, texto: string }[]} */
  const lineas = [];
  /** @type {Telefono} */
  let telefono = 'cliente';
  let estado = estadoInicial();
  for (;;) {
    const escena = escenaDe(estado, ejemplo);
    if (escena.telefono !== telefono) {
      telefono = escena.telefono;
      lineas.push({ quien: '', texto: presentacionDe(giro, rotulos, telefono).papel });
    }
    const asistente = telefono === 'profesional' ? `${giro.asistente}, a ${giro.profesional}` : giro.asistente;
    for (const entrada of escena.chat) {
      if (entrada.de === 'cliente') lineas.push({ quien: giro.cliente, texto: entrada.texto });
      else if (entrada.de === 'profesional') lineas.push({ quien: giro.profesional, texto: entrada.texto });
      else if (entrada.de === 'asistente') lineas.push({ quien: asistente, texto: entrada.texto });
      else if (entrada.de === 'cobro')
        lineas.push({ quien: asistente, texto: `${entrada.texto}: ${pesos(giro.anticipo)}` });
      else lineas.push({ quien: '', texto: entrada.texto });
    }
    const evento = porDefecto(estado, guion);
    if (!evento) return lineas;
    estado = avanzar(estado, evento, guion);
  }
}
