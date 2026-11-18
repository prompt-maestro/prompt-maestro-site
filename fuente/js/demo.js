// @ts-check
// La logica de la demostracion. No toca la pantalla: sabe contar la historia de una cita, toma por toma, y decir que
// se ve despues de cada una. Asi se prueba sin navegador, y la misma logica arma la conversacion de ejemplo que queda
// escrita en la pagina para quien no tiene JavaScript. Pintar, y llevar el tiempo, es trabajo de demo-vista.js.
//
// La historia corre sola, como un video, en seis momentos. En los cinco primeros el celular es el de quien pide la
// cita; en el sexto pasa a ser el de la profesional, y quien le escribe es su agente. Lo unico que la visitante decide
// es la respuesta del final: si la persona asistio o no.
//
// La misma historia se cuenta con varios ejemplos (unas, dentista, medico). Un ejemplo es un giro de datos/giros.json
// con su guion de datos/guiones/: sumar un oficio es sumar esas dos cosas, sin tocar este archivo.
import {
  aLaHora,
  conMayuscula,
  diaCorto,
  horaDeGlobo,
  horaDeReloj,
  listaDeHoras,
  minutosDe,
  pesos,
  rellenar,
} from './redaccion.js';

/**
 * Por donde va la historia. Son los nombres con que se mide: "pagado" empieza con el pago aprobado y abarca la
 * confirmacion de la cita.
 * @typedef {'reposo' | 'precio' | 'horarios' | 'apartado' | 'pagado' | 'recordatorios' | 'asistencia' | 'finSi' | 'finNo' | 'cierre'} Paso
 */
/** @typedef {'cliente' | 'profesional'} Telefono  de quien es el celular que se ve */
/**
 * Lo que cambia de un ejemplo a otro: lo que el agente redacta con su propio tono, a que hora platican, y el dia y los
 * horarios que ofrece. La historia toma la hora sugerida.
 * @typedef {{ charla: string, pregunta: string, saludo: string[], pideDia: string, dia: string, fecha: number,
 *   horas: string[], horaSugerida: string, eligeHora: string, apartado: string }} Guion
 */
/**
 * El negocio del ejemplo. "nombre" es con lo que se elige el ejemplo; "lugar", como se le llama a ese tipo de negocio
 * ("un consultorio dental"), y "persona", como le dice ese giro a quien atiende (clienta, paciente).
 * @typedef {{ clave: string, nombre: string, lugar: string, persona: string, negocio: string, asistente: string,
 *   profesional: string, cliente: string, servicio: string, servicioCorto: string, precio: number, anticipo: number,
 *   direccion: string }} Giro
 */
/**
 * Las frases que el motor manda tal cual, iguales en todos los ejemplos.
 * @typedef {Record<'horarios' | 'cobro' | 'confirmacion' | 'recordatorioDia' | 'recordatorioHora'
 *   | 'preguntaAsistencia' | 'registroSi' | 'registroNo', string>} Fijos
 */
/** Un momento de la historia: su nombre y lo que dice su letrero. @typedef {{ rotulo: string, letrero: string, letreroPagado?: string }} Momento */
/** Lo que dice el letrero al final. @typedef {{ si: string, no: string, cierre: string }} Finales */
/** @typedef {{ giro: Giro, guion: Guion, fijos: Fijos, momentos: Momento[], finales: Finales, rotulos: Record<string, string> }} Ejemplo */
/** La demostracion en un momento dado: que ejemplo esta puesto y por donde va su historia. @typedef {{ ejemplo: Ejemplo, estado: Estado }} Sesion */
/** Un ejemplo que se puede elegir; el elegido es el que esta puesto. @typedef {{ clave: string, nombre: string, elegido: boolean }} OpcionDeEjemplo */

/** La cita en el calendario de la profesional. @typedef {{ estado: 'libre' | 'apartado' | 'garantizada', titulo: string, detalle: string }} TarjetaDeCita */
/** El anticipo en su Mercado Pago. @typedef {{ llego: boolean, titulo: string, detalle: string }} TarjetaDePago */
/** La pregunta de asistencia en su WhatsApp. @typedef {{ estado: 'espera' | 'pregunta' | 'asistio' | 'falto', titulo: string, respuesta: string }} TarjetaDeAsistencia */
/** @typedef {'cita' | 'pago' | 'asistencia'} Turno  la tarjeta que le toca al momento */
/**
 * Lo que se ve fuera de la conversacion despues de una toma: en que momento va (0 es el reposo), de quien es el
 * celular, el letrero, lo que le llega a la profesional y la hora del celular.
 * @typedef {{ momento: number, paso: Paso, telefono: Telefono, rotulo: string, letrero: string, turno: Turno,
 *   cita: TarjetaDeCita, pago: TarjetaDePago, asistencia: TarjetaDeAsistencia, reloj: string }} Cuadro
 */
/**
 * Lo que puede pasar en una toma. "aviso" es una pastilla al centro; "voz", "sale" y "respuesta" son globos de quien
 * tiene el celular; "entra" y "pregunta", del agente; "cambio", el paso al celular de la profesional. "escribe" (el
 * agente redacta), "teclea" (quien tiene el celular escribe en su caja) y "hoja" (el pago aprobado) solo duran
 * mientras son lo ultimo que paso, y "cierre" no pone nada: cambia el letrero.
 * @typedef {'aviso' | 'voz' | 'escribe' | 'teclea' | 'sale' | 'entra' | 'hoja' | 'cambio' | 'pregunta' | 'respuesta' | 'cierre'} TipoDeToma
 */
/** La vista previa del link de pago. @typedef {{ titulo: string, monto: string, sitio: string }} Liga */
/**
 * Una toma: lo minimo que pasa en la pantalla. "dura" es lo que se queda a la vista antes de la siguiente; "quien",
 * el nombre de quien habla; "hora", la del pie del globo, y "cuadro", como queda todo lo demas.
 * @typedef {{ tipo: TipoDeToma, dura: number, texto: string, quien: string, hora: string, cuadro: Cuadro,
 *   lector?: string, detalle?: string, monto?: string, liga?: Liga, boton?: string }} Toma
 */
/** Por donde va la historia: cuantas tomas van y que contesto la visitante (null: todavia nada). @typedef {{ van: number, asistio: boolean | null }} Estado */
/**
 * "sigue" pone la toma siguiente; "parada" pinta de un jalon hasta que cambie el letrero (asi avanza quien pidio
 * menos movimiento); "brinca" va al principio de un momento.
 * @typedef {{ tipo: 'sigue' } | { tipo: 'parada' } | { tipo: 'asistio', valor: boolean } | { tipo: 'brinca', momento: number }
 *   | { tipo: 'reiniciar' }} Evento
 */
/** @typedef {'hecho' | 'va' | 'falta'} Tramo  como va cada rayita de avance */

/** Lo que cada toma se queda a la vista antes de la siguiente, en milisegundos. */
const DURA = {
  aviso: 450,
  voz: 1700,
  escribe: 1100,
  teclea: 950,
  sale: 800,
  hoja: 2400,
  cambio: 2000,
  /** Lo que la historia espera a que la visitante toque si o no. */
  pregunta: 5000,
  respuesta: 500,
};
/** Cuanto despues de la hora de la cita llega la pregunta de asistencia, en minutos. */
const DESPUES_DE_LA_CITA = 65;
/** Lo que se pone en la conversacion y ahi se queda. Lo demas solo dura mientras es lo ultimo que paso. */
const EN_LA_CONVERSACION = new Set(['aviso', 'voz', 'sale', 'entra', 'cambio', 'pregunta', 'respuesta']);
/** Los pasos en que la cita ya termino: sus seis momentos estan completos. */
const FINALES = new Set(['finSi', 'finNo', 'cierre']);

/**
 * Lo que se queda a la vista un mensaje del agente: mas, si es mas largo. Alcanza para leer el letrero y hojear el
 * mensaje; quien quiera leerlo entero tiene la pausa.
 * @param {string} texto
 * @returns {number}
 */
function paraLeer(texto) {
  return Math.min(3200, 1300 + texto.length * 8);
}

/**
 * El nombre de un momento como va en su letrero.
 * @param {number} numero
 * @param {string} nombre
 * @returns {string}  "01 · Contesta"
 */
function tituloDeMomento(numero, nombre) {
  return `${String(numero).padStart(2, '0')} · ${nombre}`;
}

/**
 * Los datos con que se llenan los huecos de los textos de un ejemplo.
 * @param {Ejemplo} ejemplo
 * @returns {Record<string, string>}
 */
function datosDe({ giro, guion }) {
  const hora = guion.horaSugerida;
  return {
    asistente: giro.asistente,
    negocio: giro.negocio,
    profesional: giro.profesional,
    cliente: giro.cliente,
    servicio: giro.servicio,
    servicioCorto: giro.servicioCorto,
    direccion: giro.direccion,
    lugar: giro.lugar,
    precio: pesos(giro.precio),
    anticipo: pesos(giro.anticipo),
    pregunta: guion.pregunta,
    dia: guion.dia,
    horas: listaDeHoras(guion.horas),
    hora,
    aLaHora: aLaHora(hora),
    ALaHora: conMayuscula(aLaHora(hora)),
  };
}

/**
 * Los rotulos de la pagina, ya con sus huecos llenos. Uno que no existe detiene todo: nunca sale un texto en blanco.
 * @param {Ejemplo} ejemplo
 * @returns {(clave: string) => string}
 */
function rotulosDe(ejemplo) {
  const datos = datosDe(ejemplo);
  return (clave) => {
    const texto = ejemplo.rotulos[clave];
    if (!texto) throw new Error(`Demostracion: falta el rotulo "${clave}"`);
    return rellenar(texto, datos);
  };
}

/**
 * @param {Momento[]} momentos
 * @param {number} numero  del 1 en adelante
 * @returns {Momento}
 */
function momentoDe(momentos, numero) {
  const momento = momentos[numero - 1];
  if (!momento) throw new Error(`Demostracion: falta el momento ${numero}`);
  return momento;
}

/** @returns {Estado} */
export function estadoInicial() {
  return { van: 0, asistio: null };
}

/**
 * Lo que se ve antes de que la historia empiece: el celular de quien pide la cita, el letrero del primer momento y la
 * cita, libre, en el calendario de la profesional.
 * @param {Ejemplo} ejemplo
 * @returns {Cuadro}
 */
export function reposoDe(ejemplo) {
  const { guion, momentos } = ejemplo;
  const rotulo = rotulosDe(ejemplo);
  const primero = momentoDe(momentos, 1);
  return {
    momento: 0,
    paso: 'reposo',
    telefono: 'cliente',
    rotulo: tituloDeMomento(1, primero.rotulo),
    letrero: rellenar(primero.letrero, datosDe(ejemplo)),
    turno: 'cita',
    cita: { estado: 'libre', titulo: rotulo('citaLibre'), detalle: rotulo('soloLibre') },
    pago: { llego: false, titulo: rotulo('recibiste'), detalle: rotulo('anticipoDe') },
    asistencia: { estado: 'espera', titulo: rotulo('asistioPregunta'), respuesta: '' },
    reloj: horaDeReloj(minutosDe(guion.charla)),
  };
}

/**
 * La historia completa de un ejemplo, toma por toma, con uno de sus dos finales. Hasta la pregunta de asistencia las
 * dos historias son la misma.
 * @param {Ejemplo} ejemplo
 * @param {boolean} [asistio]
 * @returns {Toma[]}
 */
export function historiaDe(ejemplo, asistio = true) {
  const { giro, guion, fijos, momentos, finales } = ejemplo;
  if (!guion.horas.includes(guion.horaSugerida)) {
    throw new Error(`Demostracion: la hora sugerida de "${giro.clave}" no esta entre sus horarios`);
  }
  const datos = datosDe(ejemplo);
  const llenar = (/** @type {string} */ texto) => rellenar(texto, datos);
  const rotulo = rotulosDe(ejemplo);
  const anticipo = pesos(giro.anticipo);
  const cita = minutosDe(guion.horaSugerida);
  let minuto = minutosDe(guion.charla);
  let cuadro = reposoDe(ejemplo);
  /** @type {Toma[]} */
  const tomas = [];

  /**
   * Empieza un momento: cambia el letrero y lo que venga en "cambios".
   * @param {number} numero
   * @param {Partial<Cuadro>} [cambios]
   */
  const empieza = (numero, cambios) => {
    const momento = momentoDe(momentos, numero);
    cuadro = {
      ...cuadro,
      momento: numero,
      rotulo: tituloDeMomento(numero, momento.rotulo),
      letrero: llenar(momento.letrero),
      ...cambios,
    };
  };
  /**
   * @param {TipoDeToma} tipo
   * @param {number} dura
   * @param {string} [texto]
   * @param {Partial<Toma>} [extras]
   */
  const pon = (tipo, dura, texto = '', extras = {}) => {
    cuadro = { ...cuadro, reloj: horaDeReloj(minuto) };
    tomas.push({ tipo, dura, texto, quien: '', hora: horaDeGlobo(minuto), cuadro, ...extras });
  };
  /**
   * El agente redacta y manda un mensaje.
   * @param {string} texto
   * @param {Partial<Toma>} [extras]
   */
  const agente = (texto, extras) => {
    const dicho = llenar(texto);
    pon('escribe', DURA.escribe);
    pon('entra', paraLeer(dicho), dicho, { quien: giro.asistente, ...extras });
  };
  /**
   * Quien pide la cita escribe en su caja y manda un mensaje.
   * @param {string} texto
   */
  const clienta = (texto) => {
    const dicho = llenar(texto);
    pon('teclea', DURA.teclea, dicho);
    pon('sale', DURA.sale, dicho, { quien: giro.cliente });
  };

  // 01. Contesta: llega una nota de voz y el agente saluda y da el precio.
  empieza(1, { paso: 'precio' });
  pon('aviso', DURA.aviso, rotulo('hoy'));
  pon('voz', DURA.voz, llenar(guion.pregunta), {
    quien: giro.cliente,
    lector: rotulo('notaDeVoz'),
    detalle: rotulo('duracionDeVoz'),
  });
  for (const texto of guion.saludo) agente(texto);

  // 02. Ofrece horarios: los que hay libres ese dia, y ella elige uno.
  empieza(2, { paso: 'horarios' });
  minuto += 1;
  clienta(guion.pideDia);
  agente(fijos.horarios);
  clienta(guion.eligeHora);

  // 03. Cobra el anticipo: aparta el lugar, manda el link y el pago se aprueba.
  empieza(3, {
    paso: 'apartado',
    cita: { estado: 'apartado', titulo: rotulo('citaApartada'), detalle: rotulo('mientrasPaga') },
  });
  minuto += 1;
  agente(guion.apartado, { liga: { titulo: llenar(fijos.cobro), monto: anticipo, sitio: rotulo('ligaSitio') } });
  const { letreroPagado } = momentoDe(momentos, 3);
  if (!letreroPagado) throw new Error('Demostracion: al momento 3 le falta el letrero del pago');
  cuadro = {
    ...cuadro,
    paso: 'pagado',
    letrero: llenar(letreroPagado),
    turno: 'pago',
    pago: { ...cuadro.pago, llego: true },
  };
  pon('hoja', DURA.hoja, rotulo('pagoAprobado'), { monto: anticipo, detalle: rotulo('pagoDetalle') });

  // 04. Agenda: la cita entra al calendario, ya garantizada, y el agente la confirma.
  empieza(4, {
    turno: 'cita',
    cita: { estado: 'garantizada', titulo: rotulo('citaGarantizada'), detalle: giro.servicio },
  });
  minuto += 1;
  agente(fijos.confirmacion);

  // 05. Recuerda: un dia antes, a la hora de la cita, y una hora antes.
  empieza(5, { paso: 'recordatorios' });
  minuto = cita;
  pon('aviso', DURA.aviso, rotulo('unDiaAntes'));
  const recordatorio = llenar(fijos.recordatorioDia);
  pon('entra', paraLeer(recordatorio), recordatorio, { quien: giro.asistente, boton: rotulo('cambiarCita') });
  minuto = cita - 60;
  pon('aviso', DURA.aviso, rotulo('unaHoraAntes'));
  const yaCasi = llenar(fijos.recordatorioHora);
  pon('entra', paraLeer(yaCasi), yaCasi, { quien: giro.asistente });

  // 06. Pregunta si asistio: el celular ya es el de la profesional.
  empieza(6, {
    paso: 'asistencia',
    telefono: 'profesional',
    turno: 'asistencia',
    asistencia: { ...cuadro.asistencia, estado: 'pregunta' },
  });
  minuto = cita + DESPUES_DE_LA_CITA;
  pon('cambio', DURA.cambio, rotulo('papelTu'));
  pon('escribe', DURA.escribe);
  pon('pregunta', DURA.pregunta, llenar(fijos.preguntaAsistencia), { quien: giro.asistente });

  // El final: ella contesta, el agente lo registra y la historia cierra.
  cuadro = {
    ...cuadro,
    paso: asistio ? 'finSi' : 'finNo',
    letrero: asistio ? finales.si : finales.no,
    asistencia: {
      ...cuadro.asistencia,
      estado: asistio ? 'asistio' : 'falto',
      respuesta: rotulo(asistio ? 'asistio' : 'falto'),
    },
  };
  pon('respuesta', DURA.respuesta, rotulo(asistio ? 'si' : 'no'), { quien: giro.profesional });
  agente(asistio ? fijos.registroSi : fijos.registroNo);
  cuadro = { ...cuadro, paso: 'cierre', letrero: finales.cierre };
  pon('cierre', 0);
  return tomas;
}

/**
 * Lo que se ve fuera de la conversacion cuando ya pasaron "van" tomas.
 * @param {Toma[]} tomas
 * @param {number} van
 * @param {Ejemplo} ejemplo
 * @returns {Cuadro}
 */
export function cuadroEn(tomas, van, ejemplo) {
  return tomas[van - 1]?.cuadro ?? reposoDe(ejemplo);
}

/**
 * La conversacion que se ve cuando ya pasaron "van" tomas: lo que se fue poniendo desde que el celular es de quien es.
 * @param {Toma[]} tomas
 * @param {number} van
 * @returns {Toma[]}
 */
export function chatEn(tomas, van) {
  const pasadas = tomas.slice(0, van);
  const desde = pasadas.map((toma) => toma.tipo).lastIndexOf('cambio');
  return pasadas.slice(Math.max(0, desde)).filter((toma) => EN_LA_CONVERSACION.has(toma.tipo));
}

/**
 * En que toma empieza un momento.
 * @param {Toma[]} tomas
 * @param {number} momento
 * @returns {number}  cuantas tomas van antes de la primera de ese momento, o -1 si no existe
 */
export function principioDe(tomas, momento) {
  return tomas.findIndex((toma) => toma.cuadro.momento === momento);
}

/**
 * Hasta donde llega la parada que empieza en "van": las tomas seguidas que comparten momento y letrero. Es lo que se
 * pinta de un jalon cuando la visitante pidio menos movimiento.
 * @param {Toma[]} tomas
 * @param {number} van
 * @returns {number}  cuantas tomas van al terminar la parada
 */
export function paradaTras(tomas, van) {
  const primera = tomas[van];
  if (!primera) return van;
  let fin = van + 1;
  for (let toma = tomas[fin]; toma && esLaMismaParada(primera, toma); toma = tomas[fin]) fin += 1;
  return fin;
}

/**
 * @param {Toma} una
 * @param {Toma} otra
 * @returns {boolean}
 */
function esLaMismaParada(una, otra) {
  return una.cuadro.momento === otra.cuadro.momento && una.cuadro.letrero === otra.cuadro.letrero;
}

/**
 * Lo que dura la historia entera, de la primera toma a la ultima.
 * @param {Toma[]} tomas
 * @returns {number}  milisegundos
 */
export function duracionDe(tomas) {
  return tomas.reduce((suma, toma) => suma + toma.dura, 0);
}

/**
 * Lo que dura un momento: es lo que tarda en llenarse su rayita. Del sexto solo cuenta hasta la pregunta.
 * @param {Toma[]} tomas
 * @param {number} momento
 * @returns {number}  milisegundos
 */
export function duraElMomento(tomas, momento) {
  return duracionDe(tomas.filter(({ cuadro }) => cuadro.momento === momento && !FINALES.has(cuadro.paso)));
}

/**
 * Como va cada rayita de avance: hecha, la que va o pendiente. Con la cita terminada todas estan hechas.
 * @param {Cuadro} cuadro
 * @param {number} cuantos  los momentos de la historia
 * @returns {Tramo[]}
 */
export function tramosDe(cuadro, cuantos) {
  const completa = FINALES.has(cuadro.paso);
  return Array.from({ length: cuantos }, (_, indice) => {
    const numero = indice + 1;
    if (completa || numero < cuadro.momento) return 'hecho';
    return numero === cuadro.momento ? 'va' : 'falta';
  });
}

/**
 * El estado siguiente. Un evento que no toca en ese punto devuelve el mismo estado, sin cambiarlo.
 * @param {Estado} estado
 * @param {Evento} evento
 * @param {Ejemplo} ejemplo
 * @returns {Estado}
 */
export function avanzar(estado, evento, ejemplo) {
  if (evento.tipo === 'reiniciar') return estadoInicial();
  const tomas = historiaDe(ejemplo, estado.asistio ?? true);
  // La pregunta espera respuesta mientras es lo ultimo que paso y nadie ha contestado.
  const esperaRespuesta = estado.asistio === null && tomas[estado.van - 1]?.tipo === 'pregunta';
  // Si la historia sigue sin que nadie conteste, toma el final feliz.
  const asistio = esperaRespuesta ? true : estado.asistio;
  switch (evento.tipo) {
    case 'sigue':
      return estado.van < tomas.length ? { van: estado.van + 1, asistio } : estado;
    case 'parada':
      return estado.van < tomas.length ? { van: paradaTras(tomas, estado.van), asistio } : estado;
    case 'asistio':
      return esperaRespuesta ? { van: estado.van + 1, asistio: evento.valor } : estado;
    case 'brinca': {
      const principio = principioDe(tomas, evento.momento);
      // Todo momento empieza antes de la pregunta: al brincar, la respuesta vuelve a quedar pendiente.
      return principio < 0 ? estado : { van: principio, asistio: null };
    }
  }
}

/**
 * Lo que la historia avisa al llegar a un paso, para quien quiera enterarse: los seis pasos de la cita se avisan como
 * paso y los dos finales como fin. El reposo y el cierre no avisan nada.
 * @param {Paso} paso
 * @returns {{ que: 'paso', detalle: { paso: string } } | { que: 'fin', detalle: { asistio: boolean } } | null}
 */
export function avisoDe(paso) {
  if (paso === 'reposo' || paso === 'cierre') return null;
  if (paso === 'finSi' || paso === 'finNo') return { que: 'fin', detalle: { asistio: paso === 'finSi' } };
  return { que: 'paso', detalle: { paso } };
}

/**
 * Como se presenta cada celular en su cabecera: las iniciales de la foto, el nombre y el renglon de abajo. En el de
 * quien pide la cita se ve el negocio, en linea; en el de la profesional, su agente y el negocio.
 * @param {Ejemplo} ejemplo
 * @param {Telefono} telefono
 * @returns {{ iniciales: string, nombre: string, detalle: string }}
 */
export function presentacionDe(ejemplo, telefono) {
  const { giro } = ejemplo;
  const rotulo = rotulosDe(ejemplo);
  if (telefono === 'profesional') {
    return { iniciales: rotulo('inicialesAgente'), nombre: rotulo('tuAgente'), detalle: giro.negocio };
  }
  return {
    iniciales: giro.negocio
      .split(/\s+/)
      .slice(0, 2)
      .map((palabra) => palabra.charAt(0).toUpperCase())
      .join(''),
    nombre: giro.negocio,
    detalle: rotulo('enLinea'),
  };
}

/**
 * Lo que la pagina dice de un ejemplo fuera del celular: que es una demostracion y con que tipo de negocio (es el
 * nombre de la demostracion para quien no la ve), y la ficha del dia de su calendario.
 * @param {Ejemplo} ejemplo
 * @returns {{ leyenda: string, dia: string, fecha: string }}
 */
export function fichaDe(ejemplo) {
  return {
    leyenda: rotulosDe(ejemplo)('leyendaEscrita'),
    dia: diaCorto(ejemplo.guion.dia),
    fecha: String(ejemplo.guion.fecha),
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
 * La visitante elige un ejemplo: la historia vuelve al principio con ese ejemplo, vaya por donde vaya. Elegir el que
 * ya esta puesto, o uno que no existe, devuelve la misma sesion sin cambiarla: la historia sigue donde iba.
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
 * La historia completa por el final feliz, como texto: quien habla y que dice. Es lo que queda escrito en la pagina
 * para quien no tiene JavaScript y para los buscadores.
 * @param {Ejemplo} ejemplo
 * @returns {{ quien: string, texto: string }[]}
 */
export function conversacionDeEjemplo(ejemplo) {
  const { giro } = ejemplo;
  const rotulo = rotulosDe(ejemplo);
  /** @type {{ quien: string, texto: string }[]} */
  const lineas = [];
  for (const toma of historiaDe(ejemplo, true)) {
    // En el celular de la profesional el agente le escribe a ella.
    const quien =
      toma.tipo !== 'respuesta' && toma.cuadro.telefono === 'profesional'
        ? `${toma.quien}, a ${giro.profesional}`
        : toma.quien;
    switch (toma.tipo) {
      case 'voz':
        lineas.push({ quien: rotulo('notaDeVozEscrita'), texto: toma.texto });
        break;
      case 'sale':
      case 'entra':
      case 'pregunta':
      case 'respuesta':
        lineas.push({ quien, texto: toma.texto });
        if (toma.liga) lineas.push({ quien, texto: `${toma.liga.titulo}: ${toma.liga.monto}` });
        break;
      case 'aviso':
      case 'cambio':
      case 'hoja':
        lineas.push({ quien: '', texto: toma.texto });
        break;
    }
  }
  return lineas;
}
