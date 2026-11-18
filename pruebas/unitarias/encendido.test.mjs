// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { porEncender, turnosDe } from '../../fuente/js/encendido.js';

test('solo se apaga, para encenderlo despues, lo que empieza debajo de la pantalla', () => {
  const piezas = [
    { nombre: 'ya paso', arriba: -900 },
    { nombre: 'a la vista', arriba: 120 },
    { nombre: 'asoma apenas', arriba: 799 },
    { nombre: 'justo en la orilla', arriba: 800 },
    { nombre: 'mas abajo', arriba: 2400 },
  ];
  assert.deepEqual(
    porEncender(piezas, 800).map(({ nombre }) => nombre),
    ['justo en la orilla', 'mas abajo'],
  );
});

test('lo que ya esta a la vista, o quedo arriba, se queda encendido: no se le apaga la luz para volver a prenderla', () => {
  assert.deepEqual(porEncender([{ arriba: 0 }, { arriba: 640.5 }, { arriba: -1 }], 641), []);
});

test('porEncender no cambia la lista que recibe y conserva su orden', () => {
  const piezas = [{ arriba: 3000 }, { arriba: 10 }, { arriba: 1000 }];
  const copia = structuredClone(piezas);
  assert.deepEqual(porEncender(piezas, 900), [{ arriba: 3000 }, { arriba: 1000 }]);
  assert.deepEqual(piezas, copia);
  assert.deepEqual(porEncender([], 900), []);
});

test('las piezas de un mismo grupo que entran juntas a la vista se encienden una tras otra, en su orden', () => {
  const ruta = { nombre: 'ruta' };
  assert.deepEqual(turnosDe([ruta, ruta, ruta, ruta, ruta, ruta]), [0, 1, 2, 3, 4, 5]);
  // Sola, una pieza no espera a nadie.
  assert.deepEqual(turnosDe([ruta]), [0]);
  assert.deepEqual(turnosDe([]), []);
});

test('cada grupo lleva su propia cuenta: una tarjeta de oficio no espera a las estaciones de la ruta', () => {
  const ruta = { nombre: 'ruta' };
  const oficios = { nombre: 'oficios' };
  assert.deepEqual(turnosDe([ruta, ruta, oficios, ruta, oficios, null, null]), [0, 1, 0, 2, 1, 0, 1]);
  // Los grupos se distinguen por ser el mismo, no por parecerse.
  assert.deepEqual(turnosDe([{ nombre: 'ruta' }, { nombre: 'ruta' }]), [0, 0]);
});
