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
  escenaDe,
  estadoInicial,
  porDefecto,
} from '../../fuente/js/demo.js';

const DATOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuente', 'datos');
const leer = async (/** @type {string} */ ruta) => JSON.parse(await readFile(path.join(DATOS, ruta), 'utf8'));
const demo = await leer('demo.json');
const giros = await leer('giros.json');

/** @type {import('../../fuente/js/demo.js').Ejemplo[]} */
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
const unas = /** @type {import('../../fuente/js/demo.js').Ejemplo} */ (ejemplos[0]);

/**
 * Lleva la demostracion por una ruta de eventos.
 * @param {import('../../fuente/js/demo.js').Evento[]} eventos
 */
function recorrer(eventos) {
  let estado = estadoInicial();
  for (const evento of eventos) estado = avanzar(estado, evento, unas.guion);
  return estado;
}

/** @type {import('../../fuente/js/demo.js').Evento[]} */
const HASTA_ASISTENCIA = [
  { tipo: 'enviar' },
  { tipo: 'cuando', id: 'jueves' },
  { tipo: 'hora', hora: '5:00 pm' },
  { tipo: 'pagar' },
  { tipo: 'seguir' },
  { tipo: 'seguir' },
];

test('empieza en reposo, sin nada elegido', () => {
  assert.deepEqual(estadoInicial(), { paso: 'reposo', cuando: null, hora: null, asistio: null });
});

test('cada transicion del camino completo, en orden', () => {
  /** @type {string[]} */
  const pasos = [];
  let estado = estadoInicial();
  for (const evento of [
    ...HASTA_ASISTENCIA,
    /** @type {const} */ ({ tipo: 'asistio', valor: true }),
    /** @type {const} */ ({ tipo: 'seguir' }),
  ]) {
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
  assert.equal(recorrer([...HASTA_ASISTENCIA, { tipo: 'asistio', valor: true }]).paso, 'finSi');
  const no = recorrer([...HASTA_ASISTENCIA, { tipo: 'asistio', valor: false }]);
  assert.equal(no.paso, 'finNo');
  assert.equal(no.asistio, false);
  assert.equal(avanzar(no, { tipo: 'seguir' }, unas.guion).paso, 'cierre');
});

test('guarda lo que eligio: cuando y a que hora', () => {
  const estado = recorrer([{ tipo: 'enviar' }, { tipo: 'cuando', id: 'sabado' }, { tipo: 'hora', hora: '3:00 pm' }]);
  assert.deepEqual(estado, { paso: 'apartado', cuando: 'sabado', hora: '3:00 pm', asistio: null });
});

test('un evento fuera de lugar no mueve nada', () => {
  const reposo = estadoInicial();
  assert.equal(avanzar(reposo, { tipo: 'pagar' }, unas.guion), reposo);
  assert.equal(avanzar(reposo, { tipo: 'asistio', valor: true }, unas.guion), reposo);
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

test('cada paso que espera a la visitante le ofrece al menos una accion', () => {
  let estado = estadoInicial();
  for (const evento of [...HASTA_ASISTENCIA, /** @type {const} */ ({ tipo: 'asistio', valor: true })]) {
    assert.ok(accionesDe(estado, unas.guion).length > 0, `sin acciones en ${estado.paso}`);
    estado = avanzar(estado, evento, unas.guion);
  }
  assert.deepEqual(
    accionesDe(recorrer([{ tipo: 'enviar' }]), unas.guion).map((a) => a.evento),
    [
      { tipo: 'cuando', id: 'jueves' },
      { tipo: 'cuando', id: 'sabado' },
    ],
  );
  assert.equal(accionesDe(recorrer([{ tipo: 'enviar' }, { tipo: 'cuando', id: 'jueves' }]), unas.guion).length, 4);
  assert.deepEqual(
    accionesDe(recorrer(HASTA_ASISTENCIA), unas.guion).map((a) => a.clase),
    ['si', 'no'],
  );
});

test('en los finales y en el cierre no hay nada que tocar: la historia sigue sola', () => {
  for (const valor of [true, false]) {
    const fin = recorrer([...HASTA_ASISTENCIA, { tipo: 'asistio', valor }]);
    assert.deepEqual(accionesDe(fin, unas.guion), []);
    assert.deepEqual(porDefecto(fin, unas.guion), { tipo: 'seguir' });
    assert.deepEqual(accionesDe(avanzar(fin, { tipo: 'seguir' }, unas.guion), unas.guion), []);
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
  assert.equal(porDefecto(estado, unas.guion), null, 'en el cierre ya no hay nada que hacer sola');
});

for (const ejemplo of ejemplos) {
  const nombre = ejemplo.giro.clave;

  test(`${nombre}: ninguna escena deja un hueco sin llenar`, () => {
    for (const asistio of [true, false]) {
      let estado = estadoInicial();
      for (let i = 0; i < 20; i++) {
        const escena = escenaDe(estado, ejemplo);
        const textos = [...escena.chat.map((e) => e.texto), escena.tu.resumen, escena.tu.mensaje ?? ''];
        for (const texto of textos) assert.doesNotMatch(texto, /[{}]/, `${estado.paso}: ${texto}`);
        if (estado.paso === 'cierre') break;
        const evento =
          estado.paso === 'asistencia'
            ? /** @type {const} */ ({ tipo: 'asistio', valor: asistio })
            : porDefecto(estado, ejemplo.guion);
        assert.ok(evento);
        estado = avanzar(estado, evento, ejemplo.guion);
      }
      assert.equal(estado.paso, 'cierre');
    }
  });

  test(`${nombre}: el asistente se presenta como asistente virtual y ofrece la salida PERSONA`, () => {
    const escena = escenaDe(avanzar(estadoInicial(), { tipo: 'enviar' }, ejemplo.guion), ejemplo);
    const dicho = escena.chat
      .filter((e) => e.de === 'asistente')
      .map((e) => e.texto)
      .join(' ');
    assert.match(dicho, /asistente virtual/);
    assert.match(dicho, /escribe PERSONA y le aviso/);
    assert.ok(dicho.includes(ejemplo.giro.asistente));
    assert.equal(escena.chat[0]?.de, 'cliente');
  });

  test(`${nombre}: ofrece a lo mas 4 horarios y la hora sugerida es una de ellas`, () => {
    for (const opcion of ejemplo.guion.cuando) {
      assert.ok(opcion.horas.length >= 2 && opcion.horas.length <= 4, opcion.id);
    }
    const primera = /** @type {import('../../fuente/js/demo.js').Cuando} */ (ejemplo.guion.cuando[0]);
    assert.ok(primera.horas.includes(ejemplo.guion.horaSugerida));
  });

  test(`${nombre}: al pagar, la agenda marca la cita como garantizada y el chat la confirma con el anticipo`, () => {
    let estado = estadoInicial();
    for (let i = 0; i < 3; i++)
      estado = avanzar(
        estado,
        /** @type {import('../../fuente/js/demo.js').Evento} */ (porDefecto(estado, ejemplo.guion)),
        ejemplo.guion,
      );
    const apartado = escenaDe(estado, ejemplo);
    assert.equal(apartado.tu.filas.find((f) => f.hora === estado.hora)?.estado, 'apartado');
    assert.equal(apartado.chat.at(-1)?.de, 'cobro');
    assert.doesNotMatch(apartado.chat.map((e) => e.texto).join(' '), /confirmada/, 'apartada no es confirmada');
    estado = avanzar(estado, { tipo: 'pagar' }, ejemplo.guion);
    const pagado = escenaDe(estado, ejemplo);
    assert.equal(pagado.tu.filas.find((f) => f.hora === estado.hora)?.estado, 'garantizada');
    assert.equal(pagado.chat[0]?.de, 'aprobado');
    assert.match(pagado.chat[1]?.texto ?? '', /Recibimos tu anticipo de \$\d+ y tu cita de .+ quedó confirmada/);
    assert.match(pagado.tu.resumen, /Mercado Pago/);
  });

  test(`${nombre}: la conversacion de ejemplo cuenta la historia completa en texto`, () => {
    const lineas = conversacionDeEjemplo(ejemplo);
    assert.equal(lineas[0]?.quien, ejemplo.giro.cliente);
    assert.ok(lineas.some((l) => /quedó confirmada/.test(l.texto)));
    assert.ok(lineas.some((l) => /Gracias por venir/.test(l.texto)));
    for (const linea of lineas) assert.doesNotMatch(linea.texto, /[{}]/);
    assert.ok(lineas.length >= 8);
  });
}
