// @ts-check
// Los pasos de "Como funciona": se numeran de corrido a traves de los actos y la armada se detiene si un paso no dice
// quien lo hace o trae una pieza que la plantilla no sabe pintar.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { numerarPasos, PAPELES, PIEZAS_DE_ESCENA, pasosConQuien } from '../../herramientas/pasos.mjs';

const secciones = JSON.parse(await readFile(new URL('../../fuente/datos/secciones.json', import.meta.url), 'utf8'));

/** Un paso que esta bien. */
const paso = (/** @type {string} */ papel, /** @type {string} */ quien, /** @type {string} */ rotulo) => ({
  quien,
  papel,
  rotulo,
  escena: [{ sale: { texto: 'Hola', hora: '10:12 a. m.' } }],
});

test('numera de corrido a traves de los actos, con dos cifras, sin tocar lo demas', () => {
  const actos = [
    { nombre: 'Uno', pasos: [paso('clientela', 'Tu clientela', 'a'), paso('agente', 'Tu agente', 'b')] },
    { nombre: 'Dos', pasos: [paso('tu', 'Tú', 'c')] },
  ];
  const { actos: numerados, problemas } = numerarPasos(actos);
  assert.deepEqual(problemas, []);
  assert.deepEqual(
    numerados.map(({ nombre, pasos }) => [nombre, pasos.map(({ numero, rotulo }) => `${numero} ${rotulo}`)]),
    [
      ['Uno', ['01 a', '02 b']],
      ['Dos', ['03 c']],
    ],
  );
  // Los datos de entrada no cambian.
  assert.equal('numero' in (actos[0]?.pasos[0] ?? {}), false);
  assert.deepEqual(pasosConQuien(numerados), ['Tu clientela: a', 'Tu agente: b', 'Tú: c']);
});

test('del 10 en adelante el numero sigue con dos cifras', () => {
  const pasos = Array.from({ length: 11 }, (_, i) => paso('agente', 'Tu agente', `p${i}`));
  const { actos } = numerarPasos([{ nombre: 'Largo', pasos }]);
  assert.deepEqual(
    actos[0]?.pasos.slice(8).map(({ numero }) => numero),
    ['09', '10', '11'],
  );
});

test('dice lo que esta mal: sin actos, un acto sin nombre o sin pasos, un papel que no existe o un nombre distinto', () => {
  assert.equal(numerarPasos(undefined).problemas.length, 1);
  assert.equal(numerarPasos([]).problemas.length, 1);
  const { problemas } = numerarPasos([
    { nombre: '', pasos: [] },
    {
      nombre: 'Bien',
      pasos: [
        paso('jefe', 'El jefe', 'x'),
        paso('agente', 'Tu agente', 'y'),
        paso('agente', 'Tu asistente', 'z'),
        { ...paso('tu', 'Tú', ''), escena: [] },
        { ...paso('tu', 'Tú', 'w'), escena: [{ horas: ['10:00'] }, { sale: {}, entra: {} }] },
      ],
    },
  ]);
  assert.deepEqual(problemas, [
    'secciones.json: pasos.actos[0] no tiene nombre',
    'secciones.json: pasos.actos[0] no tiene pasos',
    'secciones.json: pasos.actos[1].pasos[0]: el papel debe ser uno de clientela, agente, tu',
    'secciones.json: pasos.actos[1].pasos[2]: el papel "agente" ya se llama "Tu agente"',
    'secciones.json: pasos.actos[1].pasos[3] no tiene rotulo',
    'secciones.json: pasos.actos[1].pasos[3] no tiene escena',
    'secciones.json: pasos.actos[1].pasos[4].escena[0] debe traer una sola pieza de las que hay (sale, entra, nota, cita, botones)',
    'secciones.json: pasos.actos[1].pasos[4].escena[1] debe traer una sola pieza de las que hay (sale, entra, nota, cita, botones)',
  ]);
});

test('los datos de la pagina estan bien: tres actos de tres pasos, con los tres papeles y piezas que se saben pintar', () => {
  const { actos, problemas } = numerarPasos(secciones.pasos.actos);
  assert.deepEqual(problemas, []);
  assert.deepEqual(
    actos.map(({ pasos }) => pasos.length),
    [3, 3, 3],
  );
  const usados = new Set(actos.flatMap(({ pasos }) => pasos.map(({ papel }) => papel)));
  assert.deepEqual([...usados].sort(), [...PAPELES].sort());
  const piezas = new Set(actos.flatMap(({ pasos }) => pasos.flatMap(({ escena }) => escena.flatMap(Object.keys))));
  assert.deepEqual([...piezas].sort(), [...PIEZAS_DE_ESCENA].sort());
});
