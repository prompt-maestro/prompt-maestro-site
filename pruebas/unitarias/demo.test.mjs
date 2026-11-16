// @ts-check
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  accionesDe,
  avanzar,
  conversacionDeEjemplo,
  elegirEjemplo,
  escenaDe,
  estadoInicial,
  opcionesDeEjemplo,
  porDefecto,
  presentacionDe,
  rotulosDeEjemplo,
  telefonoDe,
} from '../../fuente/js/demo.js';
import { pesos } from '../../fuente/js/redaccion.js';

/** @typedef {import('../../fuente/js/demo.js').Ejemplo} Ejemplo */
/** @typedef {import('../../fuente/js/demo.js').Evento} Evento */

const DATOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuente', 'datos');
const leer = async (/** @type {string} */ ruta) => JSON.parse(await readFile(path.join(DATOS, ruta), 'utf8'));
const demo = await leer('demo.json');
const giros = await leer('giros.json');

/** @type {Ejemplo[]} */
const ejemplos = [];
for (const giro of giros) {
  ejemplos.push({
    giro,
    guion: await leer(`guiones/${giro.clave}.json`),
    fijos: demo.fijos,
    tu: demo.tu,
    rotulos: demo.rotulos,
  });
}
const unas = /** @type {Ejemplo} */ (ejemplos[0]);
/** @param {string} clave */
const ejemploDe = (clave) => /** @type {Ejemplo} */ (ejemplos.find((ejemplo) => ejemplo.giro.clave === clave));
// En salud a quien se atiende se le dice paciente: asi se reconocen esos ejemplos, tambien los que se sumen despues.
const deSalud = ejemplos.filter((ejemplo) => ejemplo.giro.persona === 'paciente');

/**
 * Lleva la demostracion por una ruta de eventos.
 * @param {Evento[]} eventos
 * @param {Ejemplo} [ejemplo]
 */
function recorrer(eventos, ejemplo = unas) {
  let estado = estadoInicial();
  for (const evento of eventos) estado = avanzar(estado, evento, ejemplo.guion);
  return estado;
}

/** @type {Evento[]} */
const HASTA_ASISTENCIA = [
  { tipo: 'enviar' },
  { tipo: 'cuando', id: 'jueves' },
  { tipo: 'hora', hora: '5:00 pm' },
  { tipo: 'pagar' },
  { tipo: 'seguir' },
  { tipo: 'seguir' },
];
/** @type {Evento} */
const SI = { tipo: 'asistio', valor: true };
/** @type {Evento} */
const NO = { tipo: 'asistio', valor: false };
/** @type {Evento} */
const SEGUIR = { tipo: 'seguir' };

/**
 * Todo lo que un ejemplo puede llegar a decir: cada dia, cada hora y las dos respuestas, de reposo a cierre, mas lo
 * que la pagina dice de el fuera del telefono. Comprueba de paso que cada camino llega al cierre con lo elegido.
 * @param {Ejemplo} ejemplo
 * @returns {string[]}
 */
function todoLoQueDice(ejemplo) {
  const { giro, guion, rotulos } = ejemplo;
  const textos = [giro.nombre, ...Object.values(rotulosDeEjemplo(giro, rotulos))];
  for (const telefono of /** @type {const} */ (['cliente', 'profesional'])) {
    textos.push(...Object.values(presentacionDe(giro, rotulos, telefono)));
  }
  for (const opcion of guion.cuando) {
    for (const hora of opcion.horas) {
      for (const respuesta of [SI, NO]) {
        /** @type {Evento[]} */
        const ruta = [
          { tipo: 'enviar' },
          { tipo: 'cuando', id: opcion.id },
          { tipo: 'hora', hora },
          { tipo: 'pagar' },
          SEGUIR,
          SEGUIR,
          respuesta,
          SEGUIR,
        ];
        let estado = estadoInicial();
        for (const evento of [null, ...ruta]) {
          if (evento) estado = avanzar(estado, evento, guion);
          const escena = escenaDe(estado, ejemplo);
          textos.push(...escena.chat.map((entrada) => entrada.texto), ...escena.tu.filas.map((fila) => fila.texto));
          textos.push(escena.tu.resumen, escena.tu.dia);
        }
        assert.deepEqual(
          estado,
          { paso: 'cierre', cuando: opcion.id, hora, asistio: respuesta === SI },
          `${giro.clave}: el ${opcion.dia} ${hora} no llega al cierre`,
        );
      }
    }
  }
  return textos;
}

test('empieza en reposo, sin nada elegido', () => {
  assert.deepEqual(estadoInicial(), { paso: 'reposo', cuando: null, hora: null, asistio: null });
});

test('cada transicion del camino completo, en orden', () => {
  /** @type {string[]} */
  const pasos = [];
  let estado = estadoInicial();
  for (const evento of [...HASTA_ASISTENCIA, SI, SEGUIR]) {
    estado = avanzar(estado, evento, unas.guion);
    pasos.push(estado.paso);
  }
  assert.deepEqual(pasos, [
    'precio',
    'horarios',
    'apartado',
    'pagado',
    'recordatorios',
    'asistencia',
    'finSi',
    'cierre',
  ]);
});

test('los dos finales: asistio y no asistio', () => {
  assert.equal(recorrer([...HASTA_ASISTENCIA, SI]).paso, 'finSi');
  const no = recorrer([...HASTA_ASISTENCIA, NO]);
  assert.equal(no.paso, 'finNo');
  assert.equal(no.asistio, false);
  assert.equal(avanzar(no, SEGUIR, unas.guion).paso, 'cierre');
});

test('guarda lo que eligio: cuando y a que hora', () => {
  const estado = recorrer([{ tipo: 'enviar' }, { tipo: 'cuando', id: 'sabado' }, { tipo: 'hora', hora: '3:00 pm' }]);
  assert.deepEqual(estado, { paso: 'apartado', cuando: 'sabado', hora: '3:00 pm', asistio: null });
});

test('un evento fuera de lugar no mueve nada', () => {
  const reposo = estadoInicial();
  assert.equal(avanzar(reposo, { tipo: 'pagar' }, unas.guion), reposo);
  assert.equal(avanzar(reposo, SI, unas.guion), reposo);
  const precio = recorrer([{ tipo: 'enviar' }]);
  assert.equal(avanzar(precio, { tipo: 'enviar' }, unas.guion), precio);
  assert.equal(avanzar(precio, { tipo: 'cuando', id: 'domingo' }, unas.guion), precio, 'un dia que el guion no ofrece');
  const horarios = recorrer([{ tipo: 'enviar' }, { tipo: 'cuando', id: 'jueves' }]);
  assert.equal(
    avanzar(horarios, { tipo: 'hora', hora: '9:00 pm' }, unas.guion),
    horarios,
    'una hora que no se ofrecio',
  );
  const pagado = recorrer(HASTA_ASISTENCIA.slice(0, 4));
  assert.equal(avanzar(pagado, { tipo: 'pagar' }, unas.guion), pagado, 'no se paga dos veces');
});

test('reiniciar regresa al reposo desde cualquier paso', () => {
  for (let corte = 0; corte <= HASTA_ASISTENCIA.length; corte++) {
    const estado = recorrer(HASTA_ASISTENCIA.slice(0, corte));
    assert.deepEqual(avanzar(estado, { tipo: 'reiniciar' }, unas.guion), estadoInicial());
  }
});

test('avanzar no cambia el estado que recibe', () => {
  const antes = estadoInicial();
  const copia = { ...antes };
  avanzar(antes, { tipo: 'enviar' }, unas.guion);
  assert.deepEqual(antes, copia);
});

test('cada paso que espera a la visitante le ofrece algo que tocar, con su rotulo y una sola sugerida', () => {
  let estado = estadoInicial();
  for (const evento of [...HASTA_ASISTENCIA, SI]) {
    const acciones = accionesDe(estado, unas);
    assert.ok(acciones.length > 0, `sin acciones en ${estado.paso}`);
    assert.equal(acciones.filter((accion) => accion.sugerida).length, 1, `sugeridas en ${estado.paso}`);
    for (const accion of acciones) assert.ok(accion.etiqueta.length > 0, `sin rotulo en ${estado.paso}`);
    estado = avanzar(estado, evento, unas.guion);
  }
});

test('las acciones de cada paso son las del guion', () => {
  const precio = accionesDe(recorrer([{ tipo: 'enviar' }]), unas);
  assert.deepEqual(
    precio.map((accion) => [accion.etiqueta, accion.evento]),
    [
      ['El jueves', { tipo: 'cuando', id: 'jueves' }],
      ['El sábado', { tipo: 'cuando', id: 'sabado' }],
    ],
  );
  const horarios = accionesDe(recorrer([{ tipo: 'enviar' }, { tipo: 'cuando', id: 'jueves' }]), unas);
  assert.deepEqual(
    horarios.map((accion) => accion.etiqueta),
    ['10:00 am', '12:30 pm', '4:00 pm', '5:00 pm'],
  );
  assert.equal(horarios.find((accion) => accion.sugerida)?.etiqueta, '5:00 pm');
  const asistencia = accionesDe(recorrer(HASTA_ASISTENCIA), unas);
  assert.deepEqual(
    asistencia.map((accion) => [accion.clase, accion.etiqueta]),
    [
      ['si', 'Sí'],
      ['no', 'No'],
    ],
  );
  // Dos pasos seguidos de "seguir" no dicen lo mismo: cada boton dice a donde lleva.
  const trasPagar = accionesDe(recorrer(HASTA_ASISTENCIA.slice(0, 4)), unas)[0]?.etiqueta;
  const trasRecordar = accionesDe(recorrer(HASTA_ASISTENCIA.slice(0, 5)), unas)[0]?.etiqueta;
  assert.notEqual(trasPagar, trasRecordar);
});

test('en los finales y en el cierre no hay nada que tocar: la historia sigue sola', () => {
  for (const respuesta of [SI, NO]) {
    const fin = recorrer([...HASTA_ASISTENCIA, respuesta]);
    assert.deepEqual(accionesDe(fin, unas), []);
    assert.deepEqual(porDefecto(fin, unas.guion), SEGUIR);
    const cierre = avanzar(fin, SEGUIR, unas.guion);
    assert.deepEqual(accionesDe(cierre, unas), []);
    assert.equal(porDefecto(cierre, unas.guion), null);
  }
});

test('la accion por defecto lleva sola del reposo al cierre, por el final feliz', () => {
  let estado = estadoInicial();
  /** @type {string[]} */
  const pasos = [];
  for (let i = 0; i < 20 && estado.paso !== 'cierre'; i++) {
    const evento = porDefecto(estado, unas.guion);
    assert.ok(evento, `sin accion por defecto en ${estado.paso}`);
    estado = avanzar(estado, evento, unas.guion);
    pasos.push(estado.paso);
  }
  assert.deepEqual(pasos, [
    'precio',
    'horarios',
    'apartado',
    'pagado',
    'recordatorios',
    'asistencia',
    'finSi',
    'cierre',
  ]);
  assert.equal(estado.hora, unas.guion.horaSugerida);
});

test('el telefono es el de quien pide la cita hasta que la cita termina; despues es el de la profesional', () => {
  for (const paso of /** @type {const} */ (['reposo', 'precio', 'horarios', 'apartado', 'pagado', 'recordatorios'])) {
    assert.equal(telefonoDe(paso), 'cliente', paso);
  }
  for (const paso of /** @type {const} */ (['asistencia', 'finSi', 'finNo', 'cierre'])) {
    assert.equal(telefonoDe(paso), 'profesional', paso);
  }
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
  for (const eventos of [[], HASTA_ASISTENCIA.slice(0, 3), HASTA_ASISTENCIA, [...HASTA_ASISTENCIA, SI, SEGUIR]]) {
    const sesion = { ejemplo: unas, estado: recorrer(eventos) };
    const copia = { ...sesion.estado };
    const nueva = elegirEjemplo(ejemplos, sesion, 'dentista');
    assert.equal(nueva.ejemplo, dentista);
    assert.deepEqual(nueva.estado, estadoInicial(), `desde ${sesion.estado.paso}`);
    assert.deepEqual(sesion, { ejemplo: unas, estado: copia }, 'no cambia la sesion que recibe');
    // Y de regreso: cada ejemplo empieza limpio, sin nada del anterior.
    assert.deepEqual(elegirEjemplo(ejemplos, nueva, 'unas'), { ejemplo: unas, estado: estadoInicial() });
  }
});

test('elegir el ejemplo que ya esta puesto, o uno que no existe, no mueve nada', () => {
  const sesion = { ejemplo: unas, estado: recorrer(HASTA_ASISTENCIA) };
  assert.equal(elegirEjemplo(ejemplos, sesion, 'unas'), sesion, 'la historia sigue donde iba');
  assert.equal(elegirEjemplo(ejemplos, sesion, 'veterinaria'), sesion);
  assert.equal(elegirEjemplo(ejemplos, sesion, ''), sesion);
});

test('la salida PERSONA es la frase fija de cada giro: la duena en unas, una persona del consultorio en salud', () => {
  /** @param {Ejemplo} ejemplo */
  const salida = (ejemplo) => escenaDe(recorrer([{ tipo: 'enviar' }], ejemplo), ejemplo).chat.at(-1);
  assert.deepEqual(salida(unas), {
    de: 'asistente',
    texto: 'Si en algún momento prefieres hablar con la dueña, escribe PERSONA y le aviso.',
  });
  assert.ok(deSalud.includes(ejemploDe('dentista')) && deSalud.includes(ejemploDe('medico')));
  for (const ejemplo of deSalud) {
    assert.deepEqual(salida(ejemplo), {
      de: 'asistente',
      texto: 'Si en algún momento prefieres hablar con una persona del consultorio, escribe PERSONA y le aviso.',
    });
  }
});

test('en salud el guion nunca habla de dolor, sintomas, diagnosticos ni medicamentos, ni le dice clienta a nadie', () => {
  for (const ejemplo of deSalud) {
    // Lo que se llega a ver y, ademas, el guion y el giro tal como estan escritos.
    for (const texto of [...todoLoQueDice(ejemplo), JSON.stringify(ejemplo.guion), JSON.stringify(ejemplo.giro)]) {
      assert.doesNotMatch(texto, /dolor|s[ií]ntoma|diagn[oó]stic|medicament|clienta/i, ejemplo.giro.clave);
    }
  }
});

for (const ejemplo of ejemplos) {
  const nombre = ejemplo.giro.clave;
  const { giro, guion } = ejemplo;

  test(`${nombre}: llega al cierre por cada dia y cada hora, con si y con no, sin un texto vacio ni un hueco`, () => {
    assert.equal(guion.cuando.length, 2, 'ofrece dos dias');
    for (const opcion of guion.cuando) {
      assert.equal(opcion.horas.length, 4, `cuatro horas el ${opcion.dia}`);
      for (const hora of opcion.horas) assert.match(hora, /^([1-9]|1[0-2]):[0-5]\d (am|pm)$/);
    }
    const textos = todoLoQueDice(ejemplo);
    assert.ok(textos.length > 100);
    for (const texto of textos) {
      assert.equal(typeof texto, 'string');
      assert.ok(texto.length > 0, 'un texto vacio');
      assert.doesNotMatch(texto, /[{}]/, texto);
    }
  });

  test(`${nombre}: fuera del telefono, la leyenda nombra el tipo de negocio y el aviso dice que ejemplo es`, () => {
    const { leyenda, anuncio } = rotulosDeEjemplo(giro, ejemplo.rotulos);
    assert.equal(
      leyenda,
      `Demostración con ${giro.lugar} de ejemplo. Tócala y vívela como si fueras quien pide la cita.`,
    );
    assert.equal(anuncio, `Ejemplo: ${giro.nombre}. Eres ${giro.cliente} y le escribes a ${giro.negocio}.`);
  });

  /** @param {Evento[]} eventos */
  const escenaTras = (eventos) => escenaDe(recorrer(eventos, ejemplo), ejemplo);
  /** Los eventos del camino feliz hasta dejar la cita apartada. */
  const hastaApartado = () => {
    /** @type {Evento[]} */
    const eventos = [];
    let estado = estadoInicial();
    for (let i = 0; i < 3; i++) {
      const evento = /** @type {Evento} */ (porDefecto(estado, guion));
      eventos.push(evento);
      estado = avanzar(estado, evento, guion);
    }
    return eventos;
  };

  test(`${nombre}: ninguna escena deja un hueco sin llenar`, () => {
    for (const respuesta of [SI, NO]) {
      let estado = estadoInicial();
      for (let i = 0; i < 20; i++) {
        const escena = escenaDe(estado, ejemplo);
        const textos = [...escena.chat, ...escena.tu.filas]
          .map((algo) => algo.texto)
          .concat(escena.tu.resumen, escena.tu.dia);
        for (const texto of textos) {
          assert.ok(texto.length > 0, `${estado.paso}: un texto vacio`);
          assert.doesNotMatch(texto, /[{}]/, `${estado.paso}: ${texto}`);
        }
        if (estado.paso === 'cierre') break;
        const evento = estado.paso === 'asistencia' ? respuesta : porDefecto(estado, guion);
        assert.ok(evento);
        estado = avanzar(estado, evento, guion);
      }
      assert.equal(estado.paso, 'cierre');
    }
  });

  test(`${nombre}: el asistente se presenta como asistente virtual y ofrece la salida PERSONA`, () => {
    const escena = escenaTras([{ tipo: 'enviar' }]);
    const dicho = escena.chat
      .filter((entrada) => entrada.de === 'asistente')
      .map((entrada) => entrada.texto)
      .join(' ');
    assert.match(dicho, /asistente virtual/);
    assert.match(dicho, /escribe PERSONA y le aviso/);
    assert.ok(dicho.includes(giro.asistente));
    assert.ok(dicho.includes(`cuesta ${pesos(giro.precio)}`), 'da el precio real');
    assert.match(dicho, /te busco un horario/, 'invita a agendar');
    assert.equal(escena.chat[0]?.de, 'cliente');
    assert.match(escena.chat[0]?.texto ?? '', /¿cuánto cuesta/, 'la pregunta inicial es de precio');
    assert.equal(escena.telefono, 'cliente');
  });

  test(`${nombre}: ofrece a lo mas 4 horarios, la hora sugerida es una de ellas y hay cita para llenar el dia`, () => {
    for (const opcion of guion.cuando) {
      assert.ok(opcion.horas.length >= 2 && opcion.horas.length <= 4, opcion.id);
      assert.ok(guion.otras.length >= opcion.horas.length - 1, `faltan citas para llenar el ${opcion.dia}`);
    }
    assert.ok(guion.cuando[0]?.horas.includes(guion.horaSugerida));
  });

  test(`${nombre}: la agenda se ve desde el principio, con el primer dia del guion y todo libre`, () => {
    const { tu } = escenaDe(estadoInicial(), ejemplo);
    assert.equal(tu.dia, guion.cuando[0]?.dia);
    assert.deepEqual(
      tu.filas.map((fila) => fila.estado),
      guion.cuando[0]?.horas.map(() => 'libre'),
    );
  });

  test(`${nombre}: apartada no es confirmada; al pagar la cita queda garantizada y el chat la confirma`, () => {
    const eventos = hastaApartado();
    const { hora } = recorrer(eventos, ejemplo);
    const apartado = escenaTras(eventos);
    assert.equal(apartado.tu.filas.find((fila) => fila.hora === hora)?.estado, 'apartado');
    assert.equal(apartado.chat.at(-1)?.de, 'cobro');
    assert.doesNotMatch(apartado.chat.map((entrada) => entrada.texto).join(' '), /confirmada/);
    const pagado = escenaTras([...eventos, { tipo: 'pagar' }]);
    const cita = pagado.tu.filas.find((fila) => fila.hora === hora);
    assert.equal(cita?.estado, 'garantizada');
    assert.equal(cita?.texto, `${giro.servicioCorto} · ${giro.cliente}`);
    assert.equal(pagado.tu.filas.filter((fila) => fila.estado !== 'libre').length, 1);
    assert.equal(pagado.chat[0]?.de, 'aprobado');
    assert.match(pagado.chat[1]?.texto ?? '', /Recibimos tu anticipo de \$\d+ y tu cita de .+ quedó confirmada/);
    assert.match(pagado.tu.resumen, /Mercado Pago/);
  });

  test(`${nombre}: al terminar la cita el asistente le pregunta a la profesional, en su telefono`, () => {
    const eventos = [...hastaApartado(), /** @type {Evento} */ ({ tipo: 'pagar' }), SEGUIR, SEGUIR];
    const asistencia = escenaTras(eventos);
    assert.equal(asistencia.telefono, 'profesional');
    assert.deepEqual(
      asistencia.chat.map((entrada) => entrada.de),
      ['asistente'],
    );
    assert.match(asistencia.chat[0]?.texto ?? '', new RegExp(`¿Asistió ${giro.cliente} a su cita`));
    const si = escenaTras([...eventos, SI]);
    assert.deepEqual(
      si.chat.map((entrada) => entrada.de),
      ['profesional', 'asistente'],
    );
    assert.match(si.chat[1]?.texto ?? '', /sí asistió/);
    const no = escenaTras([...eventos, NO]);
    assert.match(no.chat[1]?.texto ?? '', /queda retenido y le ofrecí reagendar/);
    assert.match(no.tu.resumen, /según tu política/, 'el anticipo se queda con ella segun SU politica');
    assert.equal(no.tu.filas.find((fila) => fila.estado === 'falto')?.texto, `No asistió · ${giro.cliente}`);
  });

  test(`${nombre}: el cuadro final llena el dia: cada cita, garantizada`, () => {
    const eventos = [...hastaApartado(), /** @type {Evento} */ ({ tipo: 'pagar' }), SEGUIR, SEGUIR, SI, SEGUIR];
    const cierre = escenaTras(eventos);
    assert.deepEqual(cierre.chat, []);
    assert.equal(cierre.tu.filas.filter((fila) => fila.estado === 'libre').length, 0);
    assert.equal(cierre.tu.filas.filter((fila) => fila.estado === 'asistio').length, 1);
    assert.equal(
      new Set(cierre.tu.filas.map((fila) => fila.texto)).size,
      cierre.tu.filas.length,
      'ninguna cita repetida',
    );
  });

  test(`${nombre}: cada telefono se presenta con su nombre y con el papel que le toca a la visitante`, () => {
    const suyo = presentacionDe(giro, ejemplo.rotulos, 'cliente');
    assert.equal(suyo.nombre, giro.negocio);
    assert.ok(suyo.papel.includes(giro.cliente) && suyo.papel.includes(giro.negocio));
    assert.match(suyo.atiende, /asistente virtual/);
    const deElla = presentacionDe(giro, ejemplo.rotulos, 'profesional');
    assert.equal(deElla.nombre, giro.asistente);
    assert.match(deElla.papel, /Ahora eres tú/);
    for (const texto of [...Object.values(suyo), ...Object.values(deElla)]) assert.doesNotMatch(texto, /[{}]/);
  });

  test(`${nombre}: la conversacion de ejemplo cuenta la historia completa en texto`, () => {
    const lineas = conversacionDeEjemplo(ejemplo);
    assert.equal(lineas[0]?.quien, giro.cliente);
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
    for (const linea of lineas) assert.doesNotMatch(linea.texto, /[{}]/);
    assert.ok(lineas.length >= 10);
  });
}
