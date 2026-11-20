// @ts-check
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hacerLaCuenta, LIMITES, leerDinero, leerEntero, planMasBarato } from '../../fuente/js/calculadora.js';
import { pesos, rellenar } from '../../fuente/js/redaccion.js';
import { planesParaPagina, planesPublicos } from '../../herramientas/planes.mjs';

const DATOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuente', 'datos');
const leer = async (/** @type {string} */ ruta) => JSON.parse(await readFile(path.join(DATOS, ruta), 'utf8'));

test('las citas se leen como entero, con o sin comas de miles bien puestas', () => {
  assert.equal(leerEntero('6'), 6);
  assert.equal(leerEntero(' 1,200 '), 1200);
  assert.equal(leerEntero(''), null);
  assert.equal(leerEntero('   '), null);
  assert.ok(Number.isNaN(leerEntero('seis')));
  assert.ok(Number.isNaN(leerEntero('3.5')));
  assert.ok(Number.isNaN(leerEntero('-4')));
  // Una coma que no separa miles no es un entero: no se adivina.
  assert.ok(Number.isNaN(leerEntero('35,5')));
});

test('el precio acepta el signo de pesos y centavos, con punto o con coma, y no se asusta a medio teclear', () => {
  assert.equal(leerDinero('$400'), 400);
  assert.equal(leerDinero('1,200'), 1200);
  assert.equal(leerDinero('350.50'), 350.5);
  // Con coma decimal son 350 pesos con 50 centavos: nunca treinta y cinco mil.
  assert.equal(leerDinero('350,50'), 350.5);
  assert.equal(leerDinero('350,4'), 350.4);
  assert.equal(leerDinero('1,200.40'), 1200.4);
  // A medio teclear ("350." antes de los centavos, "1," antes de los miles) todavia no es un error.
  assert.equal(leerDinero('350.'), 350);
  assert.equal(leerDinero('1,'), 1);
  assert.equal(leerEntero('12,'), 12);
  assert.equal(leerDinero(''), null);
  assert.ok(Number.isNaN(leerDinero('abc')));
  assert.ok(Number.isNaN(leerDinero('1.200.5')));
  assert.ok(Number.isNaN(leerDinero('-400')));
});

test('con las dos casillas llenas hace la cuenta: lo que se va y con cuantas citas se paga el plan', () => {
  assert.deepEqual(hacerLaCuenta({ citas: 6, precio: 400, mensualidad: 990 }), {
    estado: 'lista',
    perdido: 2400,
    citasParaPagar: 3,
    sePaga: true,
  });
  // Si una sola cita ya cubre la mensualidad, es una, nunca cero.
  assert.deepEqual(hacerLaCuenta({ citas: 1, precio: 5000, mensualidad: 990 }), {
    estado: 'lista',
    perdido: 5000,
    citasParaPagar: 1,
    sePaga: true,
  });
  // La cuenta se hace con el precio exacto y se cierra al peso al final: 4 de $350.50 son $1,402, no $1,404.
  assert.equal(/** @type {any} */ (hacerLaCuenta({ citas: 4, precio: 350.5, mensualidad: 990 })).perdido, 1402);
  // En la raya: cobrar justo la mensualidad la paga con una cita; un peso menos ya pide dos.
  assert.equal(/** @type {any} */ (hacerLaCuenta({ citas: 2, precio: 990, mensualidad: 990 })).citasParaPagar, 1);
  assert.equal(/** @type {any} */ (hacerLaCuenta({ citas: 2, precio: 989, mensualidad: 990 })).citasParaPagar, 2);
});

test('si con lo que hoy le plantan no alcanza para pagar el plan, la cuenta lo dice', () => {
  // Una cita de $100 al mes: harian falta 10 para pagar el plan, y solo pierde una.
  assert.deepEqual(hacerLaCuenta({ citas: 1, precio: 100, mensualidad: 990 }), {
    estado: 'lista',
    perdido: 100,
    citasParaPagar: 10,
    sePaga: false,
  });
  assert.equal(/** @type {any} */ (hacerLaCuenta({ citas: 3, precio: 300, mensualidad: 990 })).sePaga, false);
  // Justo las que hacen falta: si se paga.
  assert.equal(/** @type {any} */ (hacerLaCuenta({ citas: 4, precio: 300, mensualidad: 990 })).sePaga, true);
});

test('una casilla vacia no es un error: todavia no hay cuenta', () => {
  assert.deepEqual(hacerLaCuenta({ citas: null, precio: null, mensualidad: 990 }), { estado: 'vacia' });
  assert.deepEqual(hacerLaCuenta({ citas: 6, precio: null, mensualidad: 990 }), { estado: 'vacia' });
});

test('sin una mensualidad de verdad no hay cuenta, en vez de una cuenta rota', () => {
  for (const mensualidad of [0, -5, Number.NaN]) {
    assert.deepEqual(hacerLaCuenta({ citas: 6, precio: 400, mensualidad }), { estado: 'vacia' });
  }
});

test('fuera de rango dice cual casilla, y la de citas va primero', () => {
  const [, maxCitas] = LIMITES.citas;
  const [, maxPrecio] = LIMITES.precio;
  assert.deepEqual(hacerLaCuenta({ citas: 0, precio: 400, mensualidad: 990 }), { estado: 'fuera', casilla: 'citas' });
  assert.deepEqual(hacerLaCuenta({ citas: maxCitas + 1, precio: 400, mensualidad: 990 }), {
    estado: 'fuera',
    casilla: 'citas',
  });
  assert.deepEqual(hacerLaCuenta({ citas: Number.NaN, precio: null, mensualidad: 990 }), {
    estado: 'fuera',
    casilla: 'citas',
  });
  assert.deepEqual(hacerLaCuenta({ citas: 6, precio: 0, mensualidad: 990 }), { estado: 'fuera', casilla: 'precio' });
  // Menos de un peso no es un precio, y media cita no es una cita.
  assert.deepEqual(hacerLaCuenta({ citas: 6, precio: 0.5, mensualidad: 990 }), { estado: 'fuera', casilla: 'precio' });
  assert.deepEqual(hacerLaCuenta({ citas: 2.5, precio: 400, mensualidad: 990 }), { estado: 'fuera', casilla: 'citas' });
  assert.deepEqual(hacerLaCuenta({ citas: 6, precio: Number.NaN, mensualidad: 990 }), {
    estado: 'fuera',
    casilla: 'precio',
  });
  assert.deepEqual(hacerLaCuenta({ citas: 6, precio: maxPrecio + 1, mensualidad: 990 }), {
    estado: 'fuera',
    casilla: 'precio',
  });
  assert.equal(hacerLaCuenta({ citas: maxCitas, precio: maxPrecio, mensualidad: 990 }).estado, 'lista');
});

test('la cuenta se compara contra el plan mas barato, este donde este en la lista', () => {
  assert.deepEqual(
    planMasBarato([
      { nombre: 'Oro', mensual: 2490 },
      { nombre: 'Bronce', mensual: 990 },
      { nombre: 'Plata', mensual: 1490 },
    ]),
    { nombre: 'Bronce', mensual: 990 },
  );
  assert.equal(planMasBarato([]), undefined);
});

test('cada texto de la calculadora usa los datos que la pagina le da, y ninguno mas', async () => {
  const { calculadora } = (await leer('secciones.json')).planes;
  const datos = {
    plantones: '6',
    precio: pesos(400),
    perdido: pesos(2400),
    plan: 'Bronce',
    mensualidad: pesos(990),
    citas: '3',
  };
  // Lo que cada renglon tiene que decir: si a un texto le quitan su hueco, la pagina diria una frase sin su numero.
  /** @type {Record<string, string[]>} */
  const huecos = {
    ejemplo: ['plantones', 'precio'],
    perdido: ['perdido'],
    unaCita: ['plan', 'mensualidad'],
    variasCitas: ['plan', 'mensualidad', 'citas'],
    contesta: [],
    incluye: ['plan', 'mensualidad'],
  };
  for (const [clave, esperados] of Object.entries(huecos)) {
    const usados = [...calculadora[clave].matchAll(/\{(\w+)\}/g)].map(([, hueco]) => hueco).sort();
    assert.deepEqual(usados, [...esperados].sort(), clave);
    // rellenar se detiene si falta un dato: aqui se comprueba que la vista le pasa todos.
    assert.ok(rellenar(calculadora[clave], datos).length > 0, clave);
  }
  assert.equal(rellenar(calculadora.perdido, datos), 'Hoy se te van cerca de $2,400 al mes.');
  // Solo cuando alcanza se dice que el plan "ya se pago".
  assert.match(calculadora.variasCitas, /ya se pagó/);
  // Cuando no alcanza (el dueno, 20-nov-2026: "como le hacemos para mantener el atractivo"), el titular ya no ensena
  // la perdida chica ni hace otra cuenta. Primero se probo "El plan Bronce equivale a 3 de tus citas al mes", y el dueno
  // lo vio decir "equivale a 495 de tus citas" mientras tecleaba el precio: "ese texto no se entiende, que sea claro y
  // facil de entender". Ahora dice, en claro, lo que hace el agente y lo que cuesta el plan: sin numeros de ella, sin
  // "ya se pago" y sin prometer ahorro.
  for (const vieja of ['soloCosto', 'equivale', 'tiempo']) assert.equal(vieja in calculadora, false, vieja);
  assert.equal(calculadora.contesta, 'Tu agente contesta tu WhatsApp por ti.');
  assert.equal(
    rellenar(calculadora.incluye, datos),
    'A cualquier hora: da tus precios, agenda con el anticipo pagado y manda los recordatorios. El plan Bronce cuesta $990 al mes.',
  );
  const noAlcanza = `${calculadora.contesta} ${calculadora.incluye}`;
  assert.doesNotMatch(noAlcanza, /ya se pag|ahorr|gana|recuper|equivale|\{citas\}|\{perdido\}|\{plantones\}/i);
});

test('cuando no alcanza para pagar el plan, lo que le plantan vale de verdad menos que el plan', () => {
  // En ese caso la pagina ya no hace cuentas con sus numeros: asi no sale nada raro mientras teclea ("2" antes de "200").
  let vistos = 0;
  for (const precio of [1, 50, 99.5, 100, 329, 330, 494, 495, 989, 990, 991, 5000]) {
    for (const citas of [1, 2, 3, 9, 10, 19, 20, 500]) {
      const cuenta = /** @type {any} */ (hacerLaCuenta({ citas, precio, mensualidad: 990 }));
      if (cuenta.sePaga) continue;
      vistos++;
      assert.ok(cuenta.citasParaPagar >= 2, `${citas} citas de $${precio}`);
      assert.ok(cuenta.citasParaPagar > citas, `${citas} citas de $${precio}`);
      // Y lo que pierde es, de verdad, menos que el plan.
      assert.ok(citas * precio < 990, `${citas} citas de $${precio}`);
    }
  }
  assert.ok(vistos >= 20, 'la prueba esta viendo casos que no alcanzan');
});

test('el ejemplo que sugieren las casillas es una cuenta valida y que si paga el plan', async () => {
  const { calculadora } = (await leer('secciones.json')).planes;
  const pagina = planesParaPagina(planesPublicos(await leer('planes.json')), pesos);
  const barato = planMasBarato(pagina.planes);
  const ejemplo = hacerLaCuenta({
    citas: leerEntero(calculadora.ejemploCitas),
    precio: leerDinero(calculadora.ejemploPrecio),
    mensualidad: barato?.mensual ?? 0,
  });
  assert.equal(ejemplo.estado, 'lista');
  assert.equal(/** @type {any} */ (ejemplo).sePaga, true);
});

test('los planes de la pagina llevan sus precios ya escritos como dinero y una sola instalacion', async () => {
  const pagina = planesParaPagina(planesPublicos(await leer('planes.json')), pesos);
  assert.equal(pagina.planes.length, 3);
  for (const plan of pagina.planes) {
    assert.equal(plan.mensualTexto, pesos(plan.mensual));
    assert.equal(plan.anualTexto, pesos(plan.anual));
    assert.match(plan.mensualTexto, /^\$[\d,]+$/);
  }
  assert.equal(pagina.instalacionTexto, pesos(pagina.planes[0]?.instalacion ?? 0));
});

test('si un dia la instalacion no es igual en todos los planes, la armada se detiene', async () => {
  const publicos = planesPublicos(await leer('planes.json'));
  const distintos = {
    ...publicos,
    planes: publicos.planes.map((plan, i) => (i === 1 ? { ...plan, instalacion: plan.instalacion + 1 } : plan)),
  };
  assert.throws(() => planesParaPagina(distintos, pesos), /instalacion/);
});
