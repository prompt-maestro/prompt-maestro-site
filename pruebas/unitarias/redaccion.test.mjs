// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
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
} from '../../fuente/js/redaccion.js';

test('a las, pero a la una', () => {
  assert.equal(aLaHora('5:00 pm'), 'a las 5:00 pm');
  assert.equal(aLaHora('1:00 pm'), 'a la 1:00 pm');
  assert.equal(aLaHora('10:00 am'), 'a las 10:00 am');
  assert.equal(aLaHora('11:30 am'), 'a las 11:30 am');
});

test('la lista de horas se une como la redacta el asistente', () => {
  assert.equal(
    listaDeHoras(['10:00 am', '12:30 pm', '4:00 pm', '5:00 pm']),
    'a las 10:00 am, 12:30 pm, 4:00 pm o 5:00 pm',
  );
  assert.equal(listaDeHoras(['10:30 am', '11:00 am']), 'a las 10:30 am u 11:00 am');
  assert.equal(listaDeHoras(['4:00 pm', '8:00 pm']), 'a las 4:00 pm u 8:00 pm');
  assert.equal(listaDeHoras(['5:00 pm']), 'a las 5:00 pm');
});

test('minutosDe cuenta los minutos desde la medianoche, y una hora mal escrita detiene todo', () => {
  assert.equal(minutosDe('5:00 pm'), 17 * 60);
  assert.equal(minutosDe('10:12 am'), 10 * 60 + 12);
  assert.equal(minutosDe('12:00 am'), 0, 'la medianoche');
  assert.equal(minutosDe('12:30 pm'), 12 * 60 + 30, 'pasado el mediodia');
  assert.equal(minutosDe('1:05 am'), 65);
  assert.equal(minutosDe('11:59 pm'), 23 * 60 + 59);
  for (const mala of ['17:00', '5:00', '5 pm', '5:60 pm', '13:00 pm', '0:30 am', '5:00 PM', ' 5:00 pm', '']) {
    assert.throws(() => minutosDe(mala), /no entiendo la hora/, mala);
  }
});

test('la hora de un globo se escribe como en WhatsApp: 5:00 p. m.', () => {
  assert.equal(horaDeGlobo(17 * 60), '5:00 p. m.');
  assert.equal(horaDeGlobo(10 * 60 + 12), '10:12 a. m.');
  assert.equal(horaDeGlobo(0), '12:00 a. m.');
  assert.equal(horaDeGlobo(12 * 60), '12:00 p. m.');
  assert.equal(horaDeGlobo(12 * 60 + 42), '12:42 p. m.');
  assert.equal(horaDeGlobo(9 * 60 + 5), '9:05 a. m.');
  // Los minutos dan la vuelta al dia, hacia adelante y hacia atras.
  assert.equal(horaDeGlobo(24 * 60 + 30), '12:30 a. m.');
  assert.equal(horaDeGlobo(-60), '11:00 p. m.');
  // Ida y vuelta con las horas del guion.
  for (const hora of ['9:00 am', '11:30 am', '12:00 pm', '4:30 pm', '6:00 pm']) {
    assert.equal(horaDeGlobo(minutosDe(hora)), hora.replace(' am', ' a. m.').replace(' pm', ' p. m.'));
  }
});

test('la hora del reloj del celular va sin manana ni tarde', () => {
  assert.equal(horaDeReloj(17 * 60), '5:00');
  assert.equal(horaDeReloj(10 * 60 + 12), '10:12');
  assert.equal(horaDeReloj(0), '12:00');
  assert.equal(horaDeReloj(12 * 60 + 42), '12:42');
  assert.equal(horaDeReloj(-1), '11:59');
  assert.equal(horaDeReloj(24 * 60 + 61), '1:01');
});

test('el dia corto son sus tres primeras letras en mayusculas, con su acento', () => {
  assert.deepEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map(diaCorto), [
    'LUN',
    'MAR',
    'MIÉ',
    'JUE',
    'VIE',
    'SÁB',
    'DOM',
  ]);
});

test('pesos sin centavos y con coma de miles', () => {
  assert.equal(pesos(150), '$150');
  assert.equal(pesos(1250), '$1,250');
  assert.equal(pesos(24900), '$24,900');
});

test('conMayuscula solo toca la primera letra', () => {
  assert.equal(conMayuscula('a las 5:00 pm'), 'A las 5:00 pm');
});

test('rellenar llena cada hueco y se detiene si falta un dato', () => {
  assert.equal(
    rellenar('Hola {nombre}, tu cita es {cuando}.', { nombre: 'Ana', cuando: 'hoy' }),
    'Hola Ana, tu cita es hoy.',
  );
  assert.throws(() => rellenar('Hola {nombre}', {}), /\{nombre\}/);
});
