// @ts-check
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  avanzar,
  avisoDe,
  chatEn,
  conversacionDeEjemplo,
  cuadroEn,
  duracionDe,
  duraElMomento,
  elegirEjemplo,
  estadoInicial,
  fichaDe,
  historiaDe,
  opcionesDeEjemplo,
  paradaTras,
  presentacionDe,
  principioDe,
  reposoDe,
  tramosDe,
} from '../../fuente/js/demo.js';
import { horaDeGlobo, horaDeReloj, minutosDe, pesos } from '../../fuente/js/redaccion.js';

/** @typedef {import('../../fuente/js/demo.js').Ejemplo} Ejemplo */
/** @typedef {import('../../fuente/js/demo.js').Estado} Estado */
/** @typedef {import('../../fuente/js/demo.js').Evento} Evento */
/** @typedef {import('../../fuente/js/demo.js').Toma} Toma */

const FUENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuente');
const leer = async (/** @type {string} */ ruta) => JSON.parse(await readFile(path.join(FUENTE, 'datos', ruta), 'utf8'));
const demo = await leer('demo.json');
const giros = await leer('giros.json');

/** @type {Ejemplo[]} */
const ejemplos = [];
for (const giro of giros) {
  ejemplos.push({
    giro,
    guion: await leer(`guiones/${giro.clave}.json`),
    fijos: demo.fijos,
    momentos: demo.momentos,
    finales: demo.finales,
    rotulos: demo.rotulos,
  });
}
const unas = /** @type {Ejemplo} */ (ejemplos[0]);
/** @param {string} clave */
const ejemploDe = (clave) => /** @type {Ejemplo} */ (ejemplos.find((ejemplo) => ejemplo.giro.clave === clave));
// En salud a quien se atiende se le dice paciente: asi se reconocen esos ejemplos, tambien los que se sumen despues.
const deSalud = ejemplos.filter((ejemplo) => ejemplo.giro.persona === 'paciente');
/** Lo que manda quien pide la cita: escrito o como nota de voz. */
const DE_QUIEN_PIDE = ['sale', 'voz'];
/** Lo que el agente le dice a quien pide la cita: escrito o con su nota de voz. */
const DEL_AGENTE = ['entra', 'vozDelAgente'];
/** Lo que solo dura mientras es lo ultimo que paso: no se queda en la conversacion. */
const SOLO_UN_RATO = ['escribe', 'graba', 'teclea', 'hoja', 'cierre'];

/** @type {Evento} */
const SIGUE = { tipo: 'sigue' };
/** @type {Evento} */
const PARADA = { tipo: 'parada' };
/** @type {Evento} */
const SI = { tipo: 'asistio', valor: true };
/** @type {Evento} */
const NO = { tipo: 'asistio', valor: false };
/** La hora al pie de un globo: "5:00 p. m.". */
const HORA_DE_GLOBO = /^(1[0-2]|[1-9]):[0-5]\d [ap]\. m\.$/;

/**
 * Lleva la historia por una ruta de eventos.
 * @param {Evento[]} eventos
 * @param {Ejemplo} [ejemplo]
 * @param {Estado} [desde]
 */
function recorrer(eventos, ejemplo = unas, desde = estadoInicial()) {
  let estado = desde;
  for (const evento of eventos) estado = avanzar(estado, evento, ejemplo);
  return estado;
}

/**
 * La historia, a tomas, hasta que la pregunta de asistencia queda esperando respuesta.
 * @param {Ejemplo} [ejemplo]
 */
function hastaLaPregunta(ejemplo = unas) {
  const tomas = historiaDe(ejemplo);
  const van = tomas.findIndex((toma) => toma.tipo === 'pregunta') + 1;
  assert.ok(van > 0, 'la historia no trae la pregunta');
  return recorrer(
    Array.from({ length: van }, () => SIGUE),
    ejemplo,
  );
}

/**
 * La primera toma de una historia que cumple algo. Truena si no hay.
 * @param {Toma[]} tomas
 * @param {(toma: Toma) => boolean} cual
 */
function tomaQue(tomas, cual) {
  const toma = tomas.find(cual);
  assert.ok(toma, 'no encontre esa toma');
  return toma;
}

/**
 * Todo lo que un ejemplo puede llegar a decir: su historia con los dos finales (lo de la conversacion, el letrero, las
 * tarjetas y la hora de cada cosa), su reposo y lo que la pagina dice de el fuera del celular.
 * @param {Ejemplo} ejemplo
 * @returns {string[]}
 */
function todoLoQueDice(ejemplo) {
  const { giro } = ejemplo;
  const textos = [giro.nombre, ...Object.values(fichaDe(ejemplo))];
  for (const telefono of /** @type {const} */ (['cliente', 'profesional'])) {
    textos.push(...Object.values(presentacionDe(ejemplo, telefono)));
  }
  const cuadros = [reposoDe(ejemplo)];
  for (const asistio of [true, false]) {
    for (const toma of historiaDe(ejemplo, asistio)) {
      // El agente redactando y el cierre no dicen nada en la conversacion: lo suyo va en el letrero.
      if (toma.tipo !== 'escribe' && toma.tipo !== 'graba' && toma.tipo !== 'cierre') textos.push(toma.texto);
      const sueltos = [toma.hora, toma.lector, toma.detalle, toma.monto, toma.boton, ...Object.values(toma.liga ?? {})];
      textos.push(...sueltos.filter((texto) => texto !== undefined));
      cuadros.push(toma.cuadro);
    }
  }
  for (const cuadro of cuadros) {
    textos.push(cuadro.rotulo, cuadro.letrero, cuadro.reloj, cuadro.cita.titulo, cuadro.cita.detalle);
    textos.push(cuadro.pago.titulo, cuadro.pago.detalle, cuadro.asistencia.titulo);
    // La respuesta de la tarjeta de asistencia va vacia mientras nadie contesta.
    if (cuadro.asistencia.estado === 'asistio' || cuadro.asistencia.estado === 'falto') {
      textos.push(cuadro.asistencia.respuesta);
    }
  }
  return textos;
}

test('empieza en reposo: ninguna toma y nada contestado', () => {
  assert.deepEqual(estadoInicial(), { van: 0, asistio: null });
});

test('la historia cuenta los seis momentos en orden, con los pasos que se miden y su rotulo numerado', () => {
  const tomas = historiaDe(unas);
  const momentos = tomas.map((toma) => toma.cuadro.momento);
  assert.deepEqual([...new Set(momentos)], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    momentos,
    momentos.toSorted((a, b) => a - b),
    'ningun momento regresa',
  );
  assert.deepEqual(
    [...new Set(tomas.map((toma) => toma.cuadro.paso))],
    ['precio', 'horarios', 'apartado', 'pagado', 'recordatorios', 'asistencia', 'finSi', 'cierre'],
  );
  assert.deepEqual(
    [...new Set(tomas.map((toma) => toma.cuadro.rotulo))],
    [
      '01 · Contesta',
      '02 · Ofrece horarios',
      '03 · Cobra el anticipo',
      '04 · Agenda',
      '05 · Recuerda',
      '06 · Pregunta si asistió',
    ],
  );
  assert.equal(tomas.at(-1)?.tipo, 'cierre');
});

test('cada momento dice su letrero; el tercero cambia cuando el pago se aprueba, y el final, con la respuesta', () => {
  /** @param {boolean} asistio */
  const letreros = (asistio) => [
    ...new Set(historiaDe(unas, asistio).map((toma) => `${toma.cuadro.momento}: ${toma.cuadro.letrero}`)),
  ];
  const hastaLaAsistencia = [
    '1: Contesta con texto o con nota de voz, como le escriban.',
    '2: Solo los horarios libres de tu Google Calendar.',
    '3: Lugar apartado unos minutos, mientras paga.',
    '3: $150 de anticipo, directo a tu cuenta de Mercado Pago.',
    '4: La cita entra sola a tu calendario, ya garantizada.',
    '5: Los recordatorios salen solos. Tú no haces nada.',
    '6: Tu única tarea: tocar sí o no.',
  ];
  assert.deepEqual(letreros(true), [...hastaLaAsistencia, '6: Cita completada.', '6: Así llega una cita garantizada.']);
  assert.deepEqual(letreros(false), [
    ...hastaLaAsistencia,
    '6: El anticipo se queda contigo, según tu política.',
    '6: Así llega una cita garantizada.',
  ]);
});

test('lo que le llega a la profesional: la cita libre, apartada y garantizada; su dinero, y la pregunta', () => {
  const tomas = historiaDe(unas);
  /** @param {number} momento  @param {string} [paso] */
  const alEntrar = (momento, paso) =>
    tomaQue(tomas, ({ cuadro }) => cuadro.momento === momento && (!paso || cuadro.paso === paso)).cuadro;
  const pendiente = { estado: 'espera', titulo: '¿Asistió Ana?', respuesta: '' };
  for (const momento of [1, 2]) {
    const cuadro = alEntrar(momento);
    assert.equal(cuadro.turno, 'cita');
    assert.deepEqual(cuadro.cita, {
      estado: 'libre',
      titulo: '5:00 pm · Libre',
      detalle: 'Tu agente solo ofrece lo que tienes libre',
    });
    assert.equal(cuadro.pago.llego, false);
    assert.deepEqual(cuadro.asistencia, pendiente);
  }
  const apartado = alEntrar(3, 'apartado');
  assert.equal(apartado.turno, 'cita');
  assert.deepEqual(apartado.cita, {
    estado: 'apartado',
    titulo: '5:00 pm · Apartado',
    detalle: 'Unos minutos, mientras paga',
  });
  assert.equal(apartado.pago.llego, false, 'apartada no es pagada');
  const pagado = alEntrar(3, 'pagado');
  assert.equal(pagado.turno, 'pago');
  assert.deepEqual(pagado.pago, { llego: true, titulo: 'Recibiste $150', detalle: 'Anticipo de Ana · Gelish' });
  assert.equal(pagado.cita.estado, 'apartado', 'la cita se garantiza un momento despues, con su sello');
  for (const momento of [4, 5]) {
    const cuadro = alEntrar(momento);
    assert.equal(cuadro.turno, 'cita');
    assert.deepEqual(cuadro.cita, { estado: 'garantizada', titulo: '5:00 pm · Ana', detalle: 'Gelish semipermanente' });
    assert.equal(cuadro.pago.llego, true);
    assert.deepEqual(cuadro.asistencia, pendiente);
  }
  const asistencia = alEntrar(6);
  assert.equal(asistencia.turno, 'asistencia');
  assert.deepEqual(asistencia.asistencia, { estado: 'pregunta', titulo: '¿Asistió Ana?', respuesta: '' });
  assert.equal(asistencia.cita.estado, 'garantizada', 'la cita conserva su sello');
});

test('los dos finales: asistio y no asistio, iguales hasta la pregunta', () => {
  const si = historiaDe(unas, true);
  const no = historiaDe(unas, false);
  const pregunta = si.findIndex((toma) => toma.tipo === 'pregunta');
  assert.deepEqual(no.slice(0, pregunta + 1), si.slice(0, pregunta + 1));
  assert.deepEqual(historiaDe(unas), si, 'sin decir nada, es el final feliz');

  const finSi = si.slice(pregunta + 1);
  assert.deepEqual(
    finSi.map((toma) => toma.tipo),
    ['respuesta', 'escribe', 'entra', 'cierre'],
  );
  assert.deepEqual([finSi[0]?.texto, finSi[0]?.quien], ['Sí', 'Bella']);
  assert.equal(
    finSi[2]?.texto,
    'Listo, registré que Ana sí asistió a su cita de Gelish semipermanente hoy a las 5:00 pm. Le mandé las gracias y la invité a agendar su siguiente cita.',
  );
  assert.equal(finSi[0]?.cuadro.paso, 'finSi');
  assert.equal(finSi[0]?.cuadro.letrero, 'Cita completada.');
  assert.deepEqual(finSi[0]?.cuadro.asistencia, { estado: 'asistio', titulo: '¿Asistió Ana?', respuesta: 'Asistió' });

  const finNo = no.slice(pregunta + 1);
  assert.deepEqual([finNo[0]?.texto, finNo[0]?.quien], ['No', 'Bella']);
  assert.match(finNo[2]?.texto ?? '', /no asistió .* Su anticipo de \$150 queda retenido y le ofrecí reagendar\.$/);
  assert.equal(finNo[0]?.cuadro.paso, 'finNo');
  assert.equal(finNo[0]?.cuadro.letrero, 'El anticipo se queda contigo, según tu política.');
  assert.deepEqual(finNo[0]?.cuadro.asistencia, {
    estado: 'falto',
    titulo: '¿Asistió Ana?',
    respuesta: 'No asistió',
  });

  // Los dos cierran igual, con la tarjeta de asistencia como quedo.
  for (const [fin, estado] of /** @type {const} */ ([
    [finSi, 'asistio'],
    [finNo, 'falto'],
  ])) {
    const cierre = fin.at(-1);
    assert.equal(cierre?.cuadro.paso, 'cierre');
    assert.equal(cierre?.cuadro.letrero, 'Así llega una cita garantizada.');
    assert.equal(cierre?.cuadro.asistencia.estado, estado);
    assert.equal(cierre?.dura, 0, 'el cierre es el final: no espera a nada');
  }
});

test('quien pide la cita manda una nota de voz donde lo dice su guion; lo demas se escribe primero en su caja', () => {
  // Unas: empieza por escrito y la nota de voz llega a media conversacion, al preguntar por el dia.
  const tomas = historiaDe(unas);
  const deLaClienta = tomas.filter((toma) => DE_QUIEN_PIDE.includes(toma.tipo));
  assert.deepEqual(
    deLaClienta.map((toma) => [toma.tipo, toma.texto]),
    [
      ['sale', 'Hola, ¿cuánto cuesta el gelish?'],
      ['voz', 'Sí, ¿tienes lugar el jueves?'],
      ['sale', 'A las 5:00 pm, por favor.'],
    ],
  );
  const voz = tomaQue(tomas, (toma) => toma.tipo === 'voz');
  assert.deepEqual(
    { quien: voz.quien, lector: voz.lector, detalle: voz.detalle, momento: voz.cuadro.momento },
    { quien: 'Ana', lector: 'Nota de voz de Ana: «Sí, ¿tienes lugar el jueves?»', detalle: '0:06', momento: 2 },
  );
  // La nota de voz no se teclea: llega de una vez.
  assert.notEqual(tomas[tomas.indexOf(voz) - 1]?.tipo, 'teclea');
  for (const [indice, toma] of tomas.entries()) {
    if (toma.tipo !== 'sale') continue;
    const antes = tomas[indice - 1];
    assert.deepEqual([antes?.tipo, antes?.texto], ['teclea', toma.texto], 'se escribe antes de salir');
    assert.equal(toma.quien, 'Ana');
  }
  // Los tres ejemplos no empiezan igual (lo pidio el dueno): uno trae la nota de voz a media conversacion, otro va
  // todo por escrito y otro empieza con la nota de voz.
  assert.deepEqual(
    ejemplos.map(({ giro, guion }) => [giro.clave, guion.voz ?? 'sin voz']),
    [
      ['unas', 'pideDia'],
      ['dentista', 'sin voz'],
      ['medico', 'pregunta'],
    ],
  );
  for (const ejemplo of ejemplos) {
    const notas = historiaDe(ejemplo).filter((toma) => toma.tipo === 'voz');
    assert.equal(notas.length, ejemplo.guion.voz ? 1 : 0, ejemplo.giro.clave);
    const primero = tomaQue(historiaDe(ejemplo), (toma) => DE_QUIEN_PIDE.includes(toma.tipo));
    assert.equal(primero.tipo, ejemplo.guion.voz === 'pregunta' ? 'voz' : 'sale', ejemplo.giro.clave);
  }
});

test('a una nota de voz el agente contesta con otra nota de voz; lo demas, y siempre el link de pago, por escrito', () => {
  for (const ejemplo of ejemplos) {
    const { giro, guion } = ejemplo;
    const tomas = historiaDe(ejemplo);
    /** Lo ultimo que mando quien pide la cita fue una nota de voz. */
    let porVoz = false;
    for (const [indice, toma] of tomas.entries()) {
      if (toma.tipo === 'voz') {
        porVoz = true;
        // Enseguida el agente graba la suya y la manda.
        assert.deepEqual(
          tomas.slice(indice + 1, indice + 3).map((siguiente) => siguiente.tipo),
          ['graba', 'vozDelAgente'],
          giro.clave,
        );
      }
      if (toma.tipo === 'sale') porVoz = false;
      if (toma.tipo === 'graba') {
        assert.equal(toma.texto, '', 'mientras graba no dice nada');
        assert.equal(tomas[indice + 1]?.tipo, 'vozDelAgente');
      }
      if (toma.tipo === 'vozDelAgente') {
        assert.ok(porVoz, 'solo contesta con voz a una nota de voz');
        assert.equal(tomas[indice - 1]?.tipo, 'graba', 'antes de mandarla, la graba');
        assert.equal(toma.quien, giro.asistente);
        assert.equal(toma.lector, `Nota de voz de ${giro.asistente}: «${toma.texto}»`);
        assert.equal(toma.detalle, '0:11');
        assert.equal(toma.liga, undefined, 'el link de pago nunca va en una nota de voz');
        assert.equal(toma.cuadro.telefono, 'cliente');
        assert.ok(toma.texto.length > 20);
      }
      // Lo que el agente escribe en el celular de quien pide la cita, lo escribe porque no le hablaron por voz, o
      // porque trae el link de pago.
      if (toma.tipo === 'entra' && toma.cuadro.telefono === 'cliente' && porVoz) {
        assert.ok(toma.liga, `${giro.clave}: ${toma.texto}`);
      }
    }
    const delAgente = tomas.filter((toma) => toma.tipo === 'vozDelAgente').map((toma) => toma.texto);
    if (guion.voz === 'pregunta') {
      // Le preguntaron el precio por voz: el saludo, con el precio, va en su nota de voz.
      assert.equal(delAgente.length, guion.saludo.length);
      assert.match(delAgente[0] ?? '', /asistente virtual/);
    } else if (guion.voz === 'pideDia') {
      // Le preguntaron el dia por voz: los horarios van en su nota de voz.
      assert.equal(delAgente.length, 1);
      assert.match(delAgente[0] ?? '', /^Le puedo ofrecer el /);
    } else {
      assert.deepEqual(delAgente, []);
      assert.equal(tomas.filter((toma) => toma.tipo === 'graba').length, 0);
    }
    // El link de pago va siempre por escrito, en los tres.
    const conLink = tomas.filter((toma) => toma.liga);
    assert.equal(conLink.length, 1);
    assert.equal(conLink[0]?.tipo, 'entra');
  }
  // En la version escrita (sin JavaScript) las notas de voz dicen de quien son.
  assert.deepEqual(
    conversacionDeEjemplo(unas)
      .filter((linea) => /nota de voz/.test(linea.quien))
      .map((linea) => [linea.quien, linea.texto.slice(0, 26)]),
    [
      ['Ana (nota de voz)', 'Sí, ¿tienes lugar el jueve'],
      ['Marifer (nota de voz)', 'Le puedo ofrecer el jueves'],
    ],
  );
});

test('el agente redacta antes de cada mensaje suyo; los recordatorios llegan solos', () => {
  const tomas = historiaDe(unas);
  for (const [indice, toma] of tomas.entries()) {
    if (toma.tipo !== 'entra' && toma.tipo !== 'pregunta') continue;
    assert.equal(toma.quien, 'Marifer');
    const esperado = toma.cuadro.paso === 'recordatorios' ? 'aviso' : 'escribe';
    assert.equal(tomas[indice - 1]?.tipo, esperado, toma.texto);
  }
  assert.deepEqual(
    tomas.filter((toma) => toma.tipo === 'aviso').map((toma) => toma.texto),
    ['Hoy', 'Un día antes', 'Una hora antes'],
  );
});

test('el link de pago va dentro del mensaje de apartado, y el recordatorio de un dia antes trae su boton', () => {
  const tomas = historiaDe(unas);
  const conLiga = tomas.filter((toma) => toma.liga);
  assert.equal(conLiga.length, 1);
  // El agente le habla de usted a la clienta (lo decidio el dueno el 19-nov-2026).
  assert.match(conLiga[0]?.texto ?? '', /^¡Listo! Le aparté el lugar para el jueves a las 5:00 pm\./);
  assert.equal(conLiga[0]?.cuadro.paso, 'apartado');
  assert.deepEqual(conLiga[0]?.liga, {
    titulo: 'Anticipo Gelish semipermanente',
    monto: '$150',
    sitio: 'mercadopago.com.mx',
  });
  const conBoton = tomas.filter((toma) => toma.boton);
  assert.equal(conBoton.length, 1);
  assert.equal(conBoton[0]?.boton, 'Cambiar cita');
  assert.match(conBoton[0]?.texto ?? '', /^¡Hola, Ana! Le recordamos su cita de Gelish semipermanente mañana jueves/);
  assert.match(conBoton[0]?.texto ?? '', /toque el botón de abajo y con gusto le ayudamos\.$/);
});

test('el pago aprobado es una hoja con el monto, que se queda unos dos segundos', () => {
  const tomas = historiaDe(unas);
  const hojas = tomas.filter((toma) => toma.tipo === 'hoja');
  assert.equal(hojas.length, 1);
  const [hoja] = hojas;
  assert.deepEqual(
    [hoja?.texto, hoja?.monto, hoja?.detalle],
    ['Pago aprobado', '$150', 'Anticipo Gelish semipermanente · Studio Bella'],
  );
  assert.ok((hoja?.dura ?? 0) >= 2000 && (hoja?.dura ?? 0) <= 2600);
  // Va despues del mensaje de apartado y antes de la confirmacion.
  const lugar = tomas.indexOf(/** @type {Toma} */ (hoja));
  assert.equal(tomas[lugar - 1]?.liga?.monto, '$150');
  assert.match(tomaQue(tomas.slice(lugar), (toma) => toma.tipo === 'entra').texto, /quedó confirmada/);
});

test('en el sexto momento el celular pasa a ser el de la profesional, y ahi se queda', () => {
  const tomas = historiaDe(unas);
  const cambio = tomas.findIndex((toma) => toma.tipo === 'cambio');
  assert.equal(tomas.filter((toma) => toma.tipo === 'cambio').length, 1);
  assert.equal(tomas[cambio]?.texto, 'Ahora eres tú. Al terminar la cita, tu agente te escribe.');
  assert.equal(principioDe(tomas, 6), cambio, 'es lo primero del sexto momento');
  for (const [indice, toma] of tomas.entries()) {
    assert.equal(toma.cuadro.telefono, indice < cambio ? 'cliente' : 'profesional', `toma ${indice}`);
  }
  assert.equal(reposoDe(unas).telefono, 'cliente');
});

test('las horas de los globos: la charla, los recordatorios y la pregunta, cada una a su hora', () => {
  for (const ejemplo of ejemplos) {
    const { guion, giro } = ejemplo;
    const tomas = historiaDe(ejemplo);
    const cita = minutosDe(guion.horaSugerida);
    for (const toma of tomas) assert.match(toma.hora, HORA_DE_GLOBO, giro.clave);
    // La charla: desde la hora del guion, sin regresar, y en unos cuantos minutos.
    const charla = tomas.filter(({ cuadro }) => cuadro.momento <= 4).map((toma) => toma.hora);
    assert.equal(charla[0], horaDeGlobo(minutosDe(guion.charla)), giro.clave);
    assert.equal(charla.at(-1), horaDeGlobo(minutosDe(guion.charla) + 3), giro.clave);
    assert.equal(new Set(charla).size, 4, 'cuatro minutos de platica');
    // Los recordatorios: un dia antes, a la hora de la cita; y una hora antes.
    const [diaAntes, horaAntes] = tomas.filter((toma) => toma.cuadro.paso === 'recordatorios' && toma.tipo === 'entra');
    assert.equal(diaAntes?.hora, horaDeGlobo(cita), giro.clave);
    assert.equal(horaAntes?.hora, horaDeGlobo(cita - 60), giro.clave);
    // La pregunta de asistencia llega despues de la cita, ese mismo dia.
    const pregunta = tomaQue(tomas, (toma) => toma.tipo === 'pregunta');
    assert.equal(pregunta.hora, horaDeGlobo(cita + 65), giro.clave);
    // La barra del celular ensena la hora del ultimo mensaje.
    for (const toma of tomas) assert.equal(`${toma.cuadro.reloj} `, toma.hora.slice(0, toma.cuadro.reloj.length + 1));
    assert.equal(reposoDe(ejemplo).reloj, horaDeReloj(minutosDe(guion.charla)));
  }
  assert.equal(historiaDe(unas)[0]?.hora, '10:12 a. m.');
  assert.equal(tomaQue(historiaDe(unas), (toma) => toma.tipo === 'pregunta').hora, '6:05 p. m.');
});

test('quien saluda con buenas tardes platica en la tarde; los demas, en la manana', () => {
  for (const { giro, guion } of ejemplos) {
    const enLaTarde = minutosDe(guion.charla) >= 12 * 60;
    assert.equal(enLaTarde, /buenas tardes/i.test(`${guion.pregunta} ${guion.saludo.join(' ')}`), giro.clave);
    // Y siempre antes de la cita, para que el dia tenga sentido.
    assert.ok(minutosDe(guion.charla) < minutosDe(guion.horaSugerida) - 60, giro.clave);
  }
});

test('la historia dura entre 35 y 45 segundos y cada momento da tiempo de leer su letrero', () => {
  for (const ejemplo of ejemplos) {
    for (const asistio of [true, false]) {
      const tomas = historiaDe(ejemplo, asistio);
      const total = duracionDe(tomas);
      assert.ok(total >= 35_000 && total <= 45_000, `${ejemplo.giro.clave}: dura ${total} ms`);
      for (const momento of [1, 2, 3, 4, 5, 6]) {
        const dura = duraElMomento(tomas, momento);
        assert.ok(dura >= 4000 && dura <= 9000, `${ejemplo.giro.clave}: el momento ${momento} dura ${dura} ms`);
      }
      // El final (la respuesta y su registro) tambien se alcanza a leer.
      const final = duracionDe(tomas.filter(({ cuadro }) => cuadro.paso === 'finSi' || cuadro.paso === 'finNo'));
      assert.ok(final >= 3000, `${ejemplo.giro.clave}: el final dura ${final} ms`);
      for (const toma of tomas) assert.ok(Number.isInteger(toma.dura) && toma.dura >= 0);
    }
  }
  // La pregunta espera unos cinco segundos a que la visitante conteste.
  assert.equal(tomaQue(historiaDe(unas), (toma) => toma.tipo === 'pregunta').dura, 5000);
});

test('duracionDe suma lo que dura cada toma, y duraElMomento solo las de ese momento, sin el final', () => {
  const tomas = historiaDe(unas);
  assert.equal(duracionDe([]), 0);
  assert.equal(duracionDe(tomas.slice(0, 2)), (tomas[0]?.dura ?? 0) + (tomas[1]?.dura ?? 0));
  const porMomento = [1, 2, 3, 4, 5, 6].map((momento) => duraElMomento(tomas, momento));
  const final = duracionDe(tomas.filter(({ cuadro }) => ['finSi', 'cierre'].includes(cuadro.paso)));
  assert.equal(porMomento.reduce((suma, dura) => suma + dura, 0) + final, duracionDe(tomas));
  assert.equal(duraElMomento(tomas, 6), duracionDe(tomas.filter(({ cuadro }) => cuadro.paso === 'asistencia')));
  assert.equal(duraElMomento(tomas, 7), 0);
});

test('sigue pone una toma a la vez, del reposo al cierre, y ahi se queda', () => {
  const tomas = historiaDe(unas);
  let estado = estadoInicial();
  for (let van = 1; van <= tomas.length; van++) {
    estado = avanzar(estado, SIGUE, unas);
    assert.equal(estado.van, van);
  }
  assert.equal(cuadroEn(tomas, estado.van, unas).paso, 'cierre');
  assert.equal(avanzar(estado, SIGUE, unas), estado, 'despues del cierre no hay nada');
  assert.equal(avanzar(estado, PARADA, unas), estado);
});

test('si nadie contesta la pregunta, la historia toma el si', () => {
  const pregunta = hastaLaPregunta();
  assert.equal(pregunta.asistio, null, 'la pregunta espera');
  const sola = avanzar(pregunta, SIGUE, unas);
  assert.deepEqual(sola, { van: pregunta.van + 1, asistio: true });
  assert.equal(cuadroEn(historiaDe(unas, true), sola.van, unas).paso, 'finSi');
});

test('la respuesta de la visitante decide el final: si o no', () => {
  const pregunta = hastaLaPregunta();
  const si = avanzar(pregunta, SI, unas);
  assert.deepEqual(si, { van: pregunta.van + 1, asistio: true });
  const no = avanzar(pregunta, NO, unas);
  assert.deepEqual(no, { van: pregunta.van + 1, asistio: false });
  const historiaDelNo = historiaDe(unas, false);
  assert.equal(cuadroEn(historiaDelNo, no.van, unas).paso, 'finNo');
  // Y el no llega a su cierre, con su registro.
  const cierre = recorrer(
    Array.from({ length: historiaDelNo.length }, () => SIGUE),
    unas,
    no,
  );
  assert.deepEqual(cierre, { van: historiaDelNo.length, asistio: false });
  assert.match(chatEn(historiaDelNo, cierre.van).at(-1)?.texto ?? '', /queda retenido y le ofrecí reagendar/);
});

test('un evento fuera de lugar no mueve nada', () => {
  const reposo = estadoInicial();
  assert.equal(avanzar(reposo, SI, unas), reposo, 'en reposo nadie pregunta');
  const aMedias = recorrer([SIGUE, SIGUE, SIGUE]);
  assert.equal(avanzar(aMedias, NO, unas), aMedias, 'a media platica tampoco');
  const contestada = avanzar(hastaLaPregunta(), SI, unas);
  assert.equal(avanzar(contestada, NO, unas), contestada, 'no se contesta dos veces');
  assert.equal(avanzar(aMedias, { tipo: 'brinca', momento: 9 }, unas), aMedias, 'un momento que no existe');
  assert.equal(avanzar(aMedias, { tipo: 'brinca', momento: 0 }, unas), aMedias);
});

test('avanzar no cambia el estado que recibe', () => {
  const pregunta = hastaLaPregunta();
  const copia = { ...pregunta };
  for (const evento of [SIGUE, PARADA, SI, NO, /** @type {Evento} */ ({ tipo: 'brinca', momento: 2 })]) {
    avanzar(pregunta, evento, unas);
    assert.deepEqual(pregunta, copia);
  }
});

test('reiniciar regresa al reposo desde cualquier punto', () => {
  const tomas = historiaDe(unas);
  for (let van = 0; van <= tomas.length; van++) {
    const estado = recorrer(Array.from({ length: van }, () => SIGUE));
    assert.deepEqual(avanzar(estado, { tipo: 'reiniciar' }, unas), estadoInicial());
  }
});

test('brincar lleva al principio de cada momento, con lo anterior ya escrito, y la respuesta vuelve a esperar', () => {
  const tomas = historiaDe(unas);
  const final = recorrer([...Array.from({ length: hastaLaPregunta().van }, () => SIGUE), NO, SIGUE, SIGUE, SIGUE]);
  assert.equal(final.asistio, false);
  for (const desde of [estadoInicial(), recorrer([SIGUE, SIGUE]), hastaLaPregunta(), final]) {
    for (const momento of [1, 2, 3, 4, 5, 6]) {
      const brinco = avanzar(desde, { tipo: 'brinca', momento }, unas);
      assert.deepEqual(brinco, { van: principioDe(tomas, momento), asistio: null }, `al momento ${momento}`);
      // Lo que ya paso es de los momentos anteriores; lo siguiente abre ese momento.
      for (const toma of tomas.slice(0, brinco.van)) assert.ok(toma.cuadro.momento < momento);
      assert.equal(tomas[brinco.van]?.cuadro.momento, momento);
      assert.equal(cuadroEn(tomas, avanzar(brinco, SIGUE, unas).van, unas).momento, momento);
    }
  }
  assert.equal(principioDe(tomas, 1), 0);
  assert.equal(principioDe(tomas, 7), -1);
  // Tras brincar al sexto, la pregunta se vuelve a hacer y se puede contestar distinto.
  let estado = avanzar(final, { tipo: 'brinca', momento: 6 }, unas);
  while (historiaDe(unas)[estado.van - 1]?.tipo !== 'pregunta') estado = avanzar(estado, SIGUE, unas);
  assert.deepEqual(avanzar(estado, SI, unas), { van: estado.van + 1, asistio: true });
});

test('de parada en parada: cada una pinta de un jalon hasta que cambia el letrero', () => {
  const tomas = historiaDe(unas);
  /** @type {string[]} */
  const paradas = [];
  let estado = estadoInicial();
  for (let vuelta = 0; vuelta < 20 && estado.van < tomas.length; vuelta++) {
    const antes = estado.van;
    estado = avanzar(estado, PARADA, unas);
    assert.ok(estado.van > antes);
    assert.equal(estado.van, paradaTras(historiaDe(unas, estado.asistio ?? true), antes));
    const cuadro = cuadroEn(tomas, estado.van, unas);
    paradas.push(`${cuadro.paso}: ${cuadro.letrero}`);
    // Dentro de una parada el letrero no cambia; en la siguiente, si.
    for (const toma of tomas.slice(antes, estado.van)) assert.equal(toma.cuadro.letrero, cuadro.letrero);
    assert.notEqual(tomas[estado.van]?.cuadro.letrero, cuadro.letrero);
  }
  assert.deepEqual(paradas, [
    'precio: Contesta con texto o con nota de voz, como le escriban.',
    'horarios: Solo los horarios libres de tu Google Calendar.',
    'apartado: Lugar apartado unos minutos, mientras paga.',
    'pagado: $150 de anticipo, directo a tu cuenta de Mercado Pago.',
    'pagado: La cita entra sola a tu calendario, ya garantizada.',
    'recordatorios: Los recordatorios salen solos. Tú no haces nada.',
    'asistencia: Tu única tarea: tocar sí o no.',
    'finSi: Cita completada.',
    'cierre: Así llega una cita garantizada.',
  ]);
  assert.deepEqual(estado, { van: tomas.length, asistio: true }, 'sin contestar, la parada del final toma el si');
  assert.equal(paradaTras(tomas, tomas.length), tomas.length);
  // La parada de la asistencia se detiene en la pregunta: ahi contesta la visitante.
  const asistencia = recorrer([PARADA, PARADA, PARADA, PARADA, PARADA, PARADA, PARADA]);
  assert.equal(tomas[asistencia.van - 1]?.tipo, 'pregunta');
  assert.equal(asistencia.asistio, null);
  const no = avanzar(avanzar(asistencia, NO, unas), PARADA, unas);
  const delNo = historiaDe(unas, false);
  assert.equal(cuadroEn(delNo, no.van, unas).paso, 'finNo');
  assert.equal(delNo[no.van - 1]?.tipo, 'entra', 'la parada del final llega hasta el registro');
});

test('la conversacion crece toma a toma y, al cambiar de celular, empieza limpia', () => {
  const tomas = historiaDe(unas);
  assert.deepEqual(chatEn(tomas, 0), []);
  const cambio = tomas.findIndex((toma) => toma.tipo === 'cambio');
  for (let van = 1; van <= tomas.length; van++) {
    const chat = chatEn(tomas, van);
    for (const toma of chat) {
      assert.ok(!SOLO_UN_RATO.includes(toma.tipo), 'lo que solo dura un rato no se queda');
      assert.ok(tomas.indexOf(toma) < van);
    }
    // Hasta el cambio esta toda la platica; desde el cambio, solo lo del celular de la profesional.
    const desde = van > cambio ? cambio : 0;
    assert.deepEqual(
      chat,
      tomas.slice(desde, van).filter((toma) => !SOLO_UN_RATO.includes(toma.tipo)),
    );
  }
  assert.deepEqual(
    chatEn(tomas, cambio).map((toma) => toma.tipo),
    ['aviso', 'sale', 'entra', 'voz', 'vozDelAgente', 'sale', 'entra', 'entra', 'aviso', 'entra', 'aviso', 'entra'],
  );
  assert.deepEqual(
    chatEn(tomas, tomas.length).map((toma) => toma.tipo),
    ['cambio', 'pregunta', 'respuesta', 'entra'],
  );
});

test('cuadroEn da el reposo antes de la primera toma y, despues, el cuadro de la ultima que paso', () => {
  const tomas = historiaDe(unas);
  assert.deepEqual(cuadroEn(tomas, 0, unas), reposoDe(unas));
  assert.equal(cuadroEn(tomas, 1, unas), tomas[0]?.cuadro);
  assert.equal(cuadroEn(tomas, tomas.length, unas), tomas.at(-1)?.cuadro);
});

test('el reposo ensena el celular de quien pide la cita, el letrero del primer momento y la cita libre', () => {
  for (const ejemplo of ejemplos) {
    const reposo = reposoDe(ejemplo);
    assert.deepEqual(
      { momento: reposo.momento, paso: reposo.paso, telefono: reposo.telefono, turno: reposo.turno },
      { momento: 0, paso: 'reposo', telefono: 'cliente', turno: 'cita' },
    );
    assert.equal(reposo.rotulo, '01 · Contesta');
    assert.equal(reposo.letrero, 'Contesta con texto o con nota de voz, como le escriban.');
    assert.equal(reposo.cita.estado, 'libre');
    assert.equal(reposo.cita.titulo, `${ejemplo.guion.horaSugerida} · Libre`);
    assert.equal(reposo.pago.llego, false);
    assert.equal(reposo.pago.titulo, `Recibiste ${pesos(ejemplo.giro.anticipo)}`);
    assert.equal(reposo.pago.detalle, `Anticipo de ${ejemplo.giro.cliente} · ${ejemplo.giro.servicioCorto}`);
    assert.equal(reposo.asistencia.estado, 'espera');
    assert.equal(reposo.asistencia.titulo, `¿Asistió ${ejemplo.giro.cliente}?`);
  }
});

test('las rayitas: hechas las de los momentos que ya pasaron, una que va y las demas pendientes', () => {
  const tomas = historiaDe(unas);
  assert.deepEqual(tramosDe(reposoDe(unas), 6), ['falta', 'falta', 'falta', 'falta', 'falta', 'falta']);
  /** @param {number} momento */
  const enElMomento = (momento) => tramosDe(tomaQue(tomas, ({ cuadro }) => cuadro.momento === momento).cuadro, 6);
  assert.deepEqual(enElMomento(1), ['va', 'falta', 'falta', 'falta', 'falta', 'falta']);
  assert.deepEqual(enElMomento(4), ['hecho', 'hecho', 'hecho', 'va', 'falta', 'falta']);
  assert.deepEqual(enElMomento(6), ['hecho', 'hecho', 'hecho', 'hecho', 'hecho', 'va']);
  // Con la cita terminada (los dos finales y el cierre) las seis estan hechas.
  for (const asistio of [true, false]) {
    for (const toma of historiaDe(unas, asistio)) {
      if (!['finSi', 'finNo', 'cierre'].includes(toma.cuadro.paso)) continue;
      assert.deepEqual(tramosDe(toma.cuadro, 6), ['hecho', 'hecho', 'hecho', 'hecho', 'hecho', 'hecho']);
    }
  }
  assert.equal(tramosDe(reposoDe(unas), 3).length, 3, 'tantas rayitas como momentos');
});

test('lo que la historia avisa: los seis pasos como paso, los dos finales como fin, y nada mas', () => {
  for (const paso of /** @type {const} */ ([
    'precio',
    'horarios',
    'apartado',
    'pagado',
    'recordatorios',
    'asistencia',
  ])) {
    assert.deepEqual(avisoDe(paso), { que: 'paso', detalle: { paso } });
  }
  assert.deepEqual(avisoDe('finSi'), { que: 'fin', detalle: { asistio: true } });
  assert.deepEqual(avisoDe('finNo'), { que: 'fin', detalle: { asistio: false } });
  assert.equal(avisoDe('reposo'), null);
  assert.equal(avisoDe('cierre'), null);
});

test('los tres ejemplos del arranque estan, con unas primero, y cada uno se elige por su nombre', () => {
  assert.deepEqual(
    ejemplos.slice(0, 3).map((ejemplo) => [ejemplo.giro.clave, ejemplo.giro.nombre]),
    [
      ['unas', 'Uñas'],
      ['dentista', 'Dentista'],
      ['medico', 'Médico'],
    ],
  );
  assert.equal(new Set(ejemplos.map((ejemplo) => ejemplo.giro.clave)).size, ejemplos.length, 'ninguna clave repetida');
  const opciones = opcionesDeEjemplo(ejemplos, ejemploDe('dentista'));
  assert.deepEqual(
    opciones.map((opcion) => [opcion.clave, opcion.nombre]),
    ejemplos.map((ejemplo) => [ejemplo.giro.clave, ejemplo.giro.nombre]),
  );
  assert.deepEqual(
    opciones.filter((opcion) => opcion.elegido).map((opcion) => opcion.clave),
    ['dentista'],
    'solo el que esta puesto queda marcado',
  );
});

test('cambiar de ejemplo regresa al estado inicial con el nuevo ejemplo, vaya por donde vaya la historia', () => {
  const dentista = ejemploDe('dentista');
  const final = avanzar(hastaLaPregunta(), NO, unas);
  for (const estado of [estadoInicial(), recorrer([SIGUE, SIGUE, SIGUE]), hastaLaPregunta(), final]) {
    const sesion = { ejemplo: unas, estado };
    const copia = { ...estado };
    const nueva = elegirEjemplo(ejemplos, sesion, 'dentista');
    assert.equal(nueva.ejemplo, dentista);
    assert.deepEqual(nueva.estado, estadoInicial(), `desde la toma ${estado.van}`);
    assert.deepEqual(sesion, { ejemplo: unas, estado: copia }, 'no cambia la sesion que recibe');
    // Y de regreso: cada ejemplo empieza limpio, sin nada del anterior.
    assert.deepEqual(elegirEjemplo(ejemplos, nueva, 'unas'), { ejemplo: unas, estado: estadoInicial() });
  }
});

test('elegir el ejemplo que ya esta puesto, o uno que no existe, no mueve nada', () => {
  const sesion = { ejemplo: unas, estado: hastaLaPregunta() };
  assert.equal(elegirEjemplo(ejemplos, sesion, 'unas'), sesion, 'la historia sigue donde iba');
  assert.equal(elegirEjemplo(ejemplos, sesion, 'veterinaria'), sesion);
  assert.equal(elegirEjemplo(ejemplos, sesion, ''), sesion);
});

test('el agente ya no ofrece hablar con la duena ni dice PERSONA, en ningun ejemplo ni en sus datos', () => {
  for (const ejemplo of ejemplos) {
    const dicho = [...todoLoQueDice(ejemplo), JSON.stringify(ejemplo.guion), JSON.stringify(ejemplo.giro)];
    dicho.push(...conversacionDeEjemplo(ejemplo).map((linea) => `${linea.quien}: ${linea.texto}`));
    // La palabra clave iba en mayusculas; en minusculas "persona" es una palabra cualquiera.
    for (const texto of dicho) assert.doesNotMatch(texto, /PERSONA|[Pp]refieres hablar/, ejemplo.giro.clave);
    assert.equal('humano' in ejemplo.giro, false, 'el dato de con quien comunicaba ya no hace falta');
  }
  assert.doesNotMatch(JSON.stringify(demo), /PERSONA|[Pp]refieres hablar|\{humano\}/);
});

test('en salud el guion nunca habla de dolor, sintomas, diagnosticos ni medicamentos, ni le dice clienta a nadie', () => {
  assert.ok(deSalud.includes(ejemploDe('dentista')) && deSalud.includes(ejemploDe('medico')));
  for (const ejemplo of deSalud) {
    // Lo que se llega a ver y, ademas, el guion y el giro tal como estan escritos.
    for (const texto of [...todoLoQueDice(ejemplo), JSON.stringify(ejemplo.guion), JSON.stringify(ejemplo.giro)]) {
      assert.doesNotMatch(texto, /dolor|s[ií]ntoma|diagn[oó]stic|medicament|clienta/i, ejemplo.giro.clave);
    }
  }
});

test('todo rotulo de los datos se usa: en la plantilla, o en el codigo que pinta', async () => {
  const fuentes = await Promise.all(
    ['plantillas/parciales/demo.html', 'js/demo.js', 'js/demo-vista.js'].map((ruta) =>
      readFile(path.join(FUENTE, ruta), 'utf8'),
    ),
  );
  const [plantilla = '', logica = '', vista = ''] = fuentes;
  for (const clave of Object.keys(demo.rotulos)) {
    const usado = plantilla.includes(`demo.rotulos.${clave}}}`) || `${logica}${vista}`.includes(`'${clave}'`);
    assert.ok(usado, `el rotulo "${clave}" no se usa`);
  }
});

test('un rotulo que falta, un momento que falta, una hora sugerida que no se ofrece o una nota de voz fuera de lugar detienen todo', () => {
  const { hoy: _, ...sinHoy } = unas.rotulos;
  assert.throws(() => historiaDe({ ...unas, rotulos: sinHoy }), /falta el rotulo "hoy"/);
  assert.throws(() => historiaDe({ ...unas, momentos: unas.momentos.slice(0, 5) }), /falta el momento 6/);
  assert.throws(() => reposoDe({ ...unas, momentos: [] }), /falta el momento 1/);
  const sinLetreroDePago = unas.momentos.map(({ rotulo, letrero }) => ({ rotulo, letrero }));
  assert.throws(() => historiaDe({ ...unas, momentos: sinLetreroDePago }), /letrero del pago/);
  assert.throws(
    () => historiaDe({ ...unas, guion: { ...unas.guion, horaSugerida: '9:00 pm' } }),
    /hora sugerida de "unas" no esta entre sus horarios/,
  );
  // La nota de voz de quien pide la cita solo va en su pregunta o al pedir el dia: una errata no la apaga en silencio.
  for (const voz of ['eligeHora', 'Pregunta', 'si']) {
    assert.throws(
      () => historiaDe({ ...unas, guion: /** @type {any} */ ({ ...unas.guion, voz }) }),
      /nota de voz de "unas" solo va en su pregunta o al pedir el dia/,
      voz,
    );
  }
  // Sin "voz" todo va por escrito, y eso si se vale.
  const { voz: _voz, ...sinVoz } = unas.guion;
  assert.equal(
    historiaDe({ ...unas, guion: sinVoz }).filter((toma) => ['voz', 'vozDelAgente', 'graba'].includes(toma.tipo))
      .length,
    0,
  );
});

for (const ejemplo of ejemplos) {
  const nombre = ejemplo.giro.clave;
  const { giro, guion } = ejemplo;
  const tomas = historiaDe(ejemplo);

  test(`${nombre}: la historia llega al cierre con si y con no, sin un texto vacio ni un hueco`, () => {
    for (const asistio of [true, false]) {
      const historia = historiaDe(ejemplo, asistio);
      assert.equal(historia.at(-1)?.cuadro.paso, 'cierre');
      assert.equal(historia.length, tomas.length, 'los dos finales miden lo mismo');
    }
    const textos = todoLoQueDice(ejemplo);
    assert.ok(textos.length > 400);
    for (const texto of textos) {
      assert.equal(typeof texto, 'string');
      assert.ok(texto.length > 0, 'un texto vacio');
      assert.doesNotMatch(texto, /[{}]/, texto);
    }
  });

  test(`${nombre}: fuera del celular dice que es una demostracion y con que negocio, y la ficha de su dia`, () => {
    const ficha = fichaDe(ejemplo);
    assert.equal(ficha.leyenda, `Demostración con ${giro.lugar} de ejemplo.`);
    // La ficha del calendario: el dia en tres letras mayusculas y un numero de dia, sin mes.
    assert.equal(ficha.dia, guion.dia.slice(0, 3).toUpperCase());
    assert.match(ficha.dia, /^\p{Lu}{3}$/u);
    assert.match(ficha.fecha, /^([1-9]|[12]\d|3[01])$/);
    assert.equal(ficha.fecha, String(guion.fecha));
  });

  test(`${nombre}: el agente se presenta como asistente virtual, da el precio e invita a agendar`, () => {
    const delPrimerMomento = tomas.filter(({ cuadro }) => cuadro.momento === 1);
    const dicho = delPrimerMomento
      .filter((toma) => DEL_AGENTE.includes(toma.tipo))
      .map((toma) => toma.texto)
      .join(' ');
    assert.match(dicho, /asistente virtual/);
    assert.ok(dicho.includes(giro.asistente));
    assert.ok(dicho.includes(`cuesta ${pesos(giro.precio)}`), 'da el precio real');
    assert.match(dicho, /le busco un horario/, 'invita a agendar');
    // De usted, sin un solo tuteo.
    assert.doesNotMatch(dicho, /\b(te|ti|tu|tus|quieres|deseas|animas)\b/i);
    const pregunta = tomaQue(delPrimerMomento, (toma) => DE_QUIEN_PIDE.includes(toma.tipo));
    assert.match(pregunta.texto, /¿cuánto cuesta/, 'la pregunta inicial es de precio');
    assert.equal(pregunta.tipo, guion.voz === 'pregunta' ? 'voz' : 'sale');
    if (pregunta.tipo === 'voz') {
      assert.equal(pregunta.lector, `Nota de voz de ${giro.cliente}: «${guion.pregunta}»`);
    }
    assert.equal(pregunta.cuadro.telefono, 'cliente');
    // Contesta como le escribieron: con su nota de voz si la pregunta fue una, y por escrito si no.
    const saludo = tomaQue(delPrimerMomento, (toma) => DEL_AGENTE.includes(toma.tipo));
    assert.equal(saludo.tipo, guion.voz === 'pregunta' ? 'vozDelAgente' : 'entra');
  });

  test(`${nombre}: ofrece a lo mas 4 horarios de un dia y la hora sugerida es una de ellas`, () => {
    assert.ok(guion.horas.length >= 2 && guion.horas.length <= 4);
    for (const hora of guion.horas) assert.match(hora, /^([1-9]|1[0-2]):[0-5]\d (am|pm)$/);
    assert.ok(guion.horas.includes(guion.horaSugerida));
    const oferta = tomaQue(tomas, (toma) => DEL_AGENTE.includes(toma.tipo) && toma.cuadro.paso === 'horarios');
    assert.match(oferta.texto, new RegExp(`^Le puedo ofrecer el ${guion.dia} a las? `));
    assert.match(oferta.texto, /¿Cuál le acomoda\?$/);
    for (const hora of guion.horas) assert.ok(oferta.texto.includes(hora), hora);
    const pide = tomas
      .filter((toma) => DE_QUIEN_PIDE.includes(toma.tipo) && toma.cuadro.momento === 2)
      .map((toma) => toma.texto);
    assert.ok(pide[0]?.includes(guion.dia), 'pregunta por el dia que se ofrece');
    assert.ok(pide[1]?.includes(guion.horaSugerida), 'elige la hora sugerida');
    // Del guion ya no se elige nada: un solo dia. "voz" solo va en el ejemplo que manda una nota de voz.
    assert.deepEqual(Object.keys(guion).sort(), [
      'apartado',
      'charla',
      'dia',
      'eligeHora',
      'fecha',
      'horaSugerida',
      'horas',
      'pideDia',
      'pregunta',
      'saludo',
      ...(guion.voz ? ['voz'] : []),
    ]);
  });

  test(`${nombre}: apartada no es confirmada; al pagar la cita queda garantizada y el agente la confirma`, () => {
    const apartado = tomas.filter(({ cuadro }) => cuadro.paso === 'apartado');
    assert.doesNotMatch(apartado.map((toma) => toma.texto).join(' '), /confirmada/);
    assert.equal(apartado.at(-1)?.liga?.monto, pesos(giro.anticipo));
    for (const { cuadro } of apartado) {
      assert.equal(cuadro.cita.titulo, `${guion.horaSugerida} · Apartado`);
      assert.equal(cuadro.pago.llego, false);
    }
    const pagado = tomas.filter(({ cuadro }) => cuadro.paso === 'pagado');
    assert.equal(pagado[0]?.tipo, 'hoja');
    assert.equal(pagado[0]?.monto, pesos(giro.anticipo));
    assert.equal(pagado[0]?.detalle, `Anticipo ${giro.servicio} · ${giro.negocio}`);
    assert.match(pagado[0]?.cuadro.letrero ?? '', /^\$\d+ de anticipo, directo a tu cuenta de Mercado Pago\.$/);
    assert.equal(pagado[0]?.cuadro.pago.titulo, `Recibiste ${pesos(giro.anticipo)}`);
    const confirmacion = pagado.at(-1);
    assert.match(confirmacion?.texto ?? '', /Recibimos su anticipo de \$\d+ y su cita de .+ quedó confirmada/);
    assert.doesNotMatch(confirmacion?.texto ?? '', /\b(te|tu|tus|necesitas|escríbenos)\b/i);
    assert.ok(confirmacion?.texto.includes(giro.direccion));
    assert.deepEqual(confirmacion?.cuadro.cita, {
      estado: 'garantizada',
      titulo: `${guion.horaSugerida} · ${giro.cliente}`,
      detalle: giro.servicio,
    });
  });

  test(`${nombre}: al terminar la cita el agente le pregunta a la profesional, en su celular`, () => {
    const asistencia = tomas.filter(({ cuadro }) => cuadro.paso === 'asistencia');
    assert.deepEqual(
      asistencia.map((toma) => toma.tipo),
      ['cambio', 'escribe', 'pregunta'],
    );
    for (const toma of asistencia) assert.equal(toma.cuadro.telefono, 'profesional');
    assert.match(asistencia[2]?.texto ?? '', new RegExp(`¿Asistió ${giro.cliente} a su cita de ${giro.servicio} hoy`));
    assert.match(asistencia[2]?.texto ?? '', /Toca un botón y lo dejo registrado\.$/);
    const si = historiaDe(ejemplo, true).filter(({ cuadro }) => cuadro.paso === 'finSi');
    assert.deepEqual([si[0]?.quien, si[0]?.texto], [giro.profesional, 'Sí']);
    assert.match(si.at(-1)?.texto ?? '', /sí asistió/);
    const no = historiaDe(ejemplo, false).filter(({ cuadro }) => cuadro.paso === 'finNo');
    assert.deepEqual([no[0]?.quien, no[0]?.texto], [giro.profesional, 'No']);
    assert.match(no.at(-1)?.texto ?? '', /queda retenido y le ofrecí reagendar/);
    assert.match(no[0]?.cuadro.letrero ?? '', /según tu política/, 'el anticipo se queda con ella segun SU politica');
    assert.equal(no[0]?.cuadro.asistencia.respuesta, 'No asistió');
  });

  test(`${nombre}: cada celular se presenta con su foto, su nombre y su renglon de abajo`, () => {
    const suyo = presentacionDe(ejemplo, 'cliente');
    assert.equal(suyo.nombre, giro.negocio);
    assert.equal(suyo.detalle, 'en línea');
    assert.match(suyo.iniciales, /^\p{Lu}{1,2}$/u);
    assert.equal(suyo.iniciales.charAt(0), giro.negocio.charAt(0));
    const deElla = presentacionDe(ejemplo, 'profesional');
    assert.deepEqual(deElla, { iniciales: 'PM', nombre: 'Tu agente', detalle: giro.negocio });
  });

  test(`${nombre}: la conversacion de ejemplo cuenta la historia completa en texto`, () => {
    const lineas = conversacionDeEjemplo(ejemplo);
    assert.deepEqual(lineas[0], { quien: '', texto: 'Hoy' });
    // La pregunta y el saludo: por escrito, o los dos como nota de voz si el ejemplo empieza con una.
    const alInicio = guion.voz === 'pregunta' ? ' (nota de voz)' : '';
    assert.deepEqual(lineas[1], { quien: `${giro.cliente}${alInicio}`, texto: guion.pregunta });
    assert.equal(lineas[2]?.quien, `${giro.asistente}${alInicio}`);
    assert.ok(lineas.some((linea) => linea.quien === giro.cliente && linea.texto.includes(guion.horaSugerida)));
    assert.ok(lineas.some((linea) => linea.texto === `Anticipo ${giro.servicio}: ${pesos(giro.anticipo)}`));
    assert.ok(lineas.some((linea) => linea.quien === '' && linea.texto === 'Pago aprobado'));
    assert.ok(lineas.some((linea) => /quedó confirmada/.test(linea.texto)));
    assert.ok(
      lineas.some((linea) => linea.quien === '' && /Ahora eres tú/.test(linea.texto)),
      'avisa el cambio de papel',
    );
    assert.ok(
      lineas.some(
        (linea) => linea.quien === `${giro.asistente}, a ${giro.profesional}` && /¿Asistió/.test(linea.texto),
      ),
    );
    assert.ok(lineas.some((linea) => linea.quien === giro.profesional && linea.texto === 'Sí'));
    assert.ok(lineas.some((linea) => /sí asistió/.test(linea.texto)));
    // El orden es el de la historia, y cada linea trae texto.
    const orden = ['Hoy', 'Pago aprobado', 'Un día antes', 'Una hora antes'].map((texto) =>
      lineas.findIndex((linea) => linea.quien === '' && linea.texto === texto),
    );
    assert.deepEqual(
      orden,
      orden.toSorted((a, b) => a - b),
    );
    assert.ok(orden.every((lugar) => lugar >= 0));
    for (const linea of lineas) {
      assert.ok(linea.texto.length > 0);
      assert.doesNotMatch(`${linea.quien}${linea.texto}`, /[{}]/);
    }
    assert.ok(lineas.length >= 15);
  });
}
