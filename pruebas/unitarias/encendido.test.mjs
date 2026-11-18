// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bastaConAsomar, porEncender, turnosDe, yaLlego } from '../../fuente/js/encendido.js';

test('una pieza se enciende cuando asomo su quinta parte; antes, no', () => {
  const pantalla = 700;
  assert.equal(yaLlego({ parte: 0.2, alto: 500, pantalla }), true);
  assert.equal(yaLlego({ parte: 0.63, alto: 500, pantalla }), true);
  // El navegador a veces reporta la quinta parte un pelo por debajo: cuenta igual.
  assert.equal(yaLlego({ parte: 0.1996, alto: 500, pantalla }), true);
  assert.equal(yaLlego({ parte: 0.19, alto: 500, pantalla }), false);
  assert.equal(yaLlego({ parte: 0.01, alto: 500, pantalla }), false);
  assert.equal(yaLlego({ parte: 0, alto: 500, pantalla }), false);
});

test('a una pieza mucho mas alta que la pantalla le basta con asomar: nunca se queda apagada', () => {
  // Con zoom de 400 % una laptop deja unos 160 de alto: la quinta parte de una tarjeta de 650 ya no cabe en la mitad.
  assert.equal(bastaConAsomar(650, 160), true);
  assert.equal(yaLlego({ parte: 0.004, alto: 650, pantalla: 160 }), true);
  // Pero sin asomar nada, no: lo que sigue abajo espera su turno.
  assert.equal(yaLlego({ parte: 0, alto: 650, pantalla: 160 }), false);
  // En un celular o una computadora de siempre nadie se enciende por adelantado.
  assert.equal(bastaConAsomar(520, 584), false);
  assert.equal(bastaConAsomar(650, 792), false);
  // El limite: la quinta parte de la pieza mide justo media pantalla. Todavia cabe: espera a asomar su parte.
  assert.equal(bastaConAsomar(1000, 400), false);
  assert.equal(bastaConAsomar(1001, 400), true);
});

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
