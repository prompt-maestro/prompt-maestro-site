// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planesPublicos } from '../../herramientas/planes.mjs';

const plan = (/** @type {Record<string, unknown>} */ cambios = {}) => ({
  clave: 'bronce',
  nombre: 'Bronce',
  mensual: 990,
  anual: 9900,
  instalacion: 2500,
  destacado: true,
  incluye: ['Asistente de WhatsApp'],
  ...cambios,
});

test('deja solo los campos publicos: nunca un identificador de pagos', () => {
  const salida = planesPublicos({ moneda: 'mxn', planes: [plan({ stripe: { mensual: 'price_123' }, interno: 'x' })] });
  assert.deepEqual(Object.keys(salida.planes[0] ?? {}), [
    'clave',
    'nombre',
    'mensual',
    'anual',
    'instalacion',
    'destacado',
    'incluye',
  ]);
  assert.doesNotMatch(JSON.stringify(salida), /price_123|stripe/);
});

test('conserva precios, plan destacado y lo que incluye, tal cual', () => {
  const origen = {
    moneda: 'mxn',
    planes: [plan({ destacado: false }), plan({ clave: 'plata', nombre: 'Plata', mensual: 1490 })],
  };
  const salida = planesPublicos(origen);
  assert.equal(salida.planes[1]?.mensual, 1490);
  assert.equal(salida.planes[1]?.destacado, true);
  assert.deepEqual(salida.planes[0]?.incluye, ['Asistente de WhatsApp']);
});

test('se detiene si falta un precio, si no es un entero o si es cero', () => {
  for (const mensual of [undefined, '990', 0, -5, 990.5]) {
    assert.throws(() => planesPublicos({ moneda: 'mxn', planes: [plan({ mensual })] }), /mensualidad/);
  }
});

test('se detiene sin planes, sin moneda, sin lo que incluye o sin un solo destacado', () => {
  assert.throws(() => planesPublicos({ moneda: 'mxn', planes: [] }), /ningun plan/);
  assert.throws(() => planesPublicos({ planes: [plan()] }), /moneda/);
  assert.throws(() => planesPublicos({ moneda: 'mxn', planes: [plan({ incluye: [] })] }), /incluye/);
  assert.throws(() => planesPublicos({ moneda: 'mxn', planes: [plan({ destacado: false })] }), /destacado/);
  assert.throws(() => planesPublicos({ moneda: 'mxn', planes: [plan(), plan({ clave: 'plata' })] }), /destacado/);
});

test('de la nota interna solo queda si los precios son de prueba, nunca su texto', () => {
  const salida = planesPublicos({
    moneda: 'mxn',
    nota: 'PRECIOS DE PRUEBA para el laboratorio: detalle interno',
    planes: [plan()],
  });
  assert.equal(salida.dePrueba, true);
  assert.doesNotMatch(JSON.stringify(salida), /laboratorio|detalle interno|nota/);
});

test('sin nota de prueba los precios son los vigentes', () => {
  assert.equal(planesPublicos({ moneda: 'mxn', planes: [plan()] }).dePrueba, false);
  assert.equal(planesPublicos({ moneda: 'mxn', nota: 'Precios vigentes', planes: [plan()] }).dePrueba, false);
});

test('la copia publica se puede volver a leer y sigue marcada como de prueba', () => {
  const copia = planesPublicos({ moneda: 'mxn', nota: 'PRECIOS DE PRUEBA', planes: [plan()] });
  assert.deepEqual(planesPublicos(JSON.parse(JSON.stringify(copia))), copia);
});
