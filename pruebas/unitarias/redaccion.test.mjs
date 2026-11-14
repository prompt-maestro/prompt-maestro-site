// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aLaHora, conMayuscula, listaDeHoras, pesos, rellenar } from '../../fuente/js/redaccion.js';

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
