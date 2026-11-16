// @ts-check
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mundoDe, oficioDe, rota, siguienteOficio, sinContestar } from '../../fuente/js/pelicula.js';

const FUENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuente');
const pelicula = JSON.parse(await readFile(path.join(FUENTE, 'datos', 'pelicula.json'), 'utf8'));
/** @type {string[]} */
const claves = pelicula.oficios.map((/** @type {{ clave: string }} */ oficio) => oficio.clave);

test('una toma con oficio fijo ensena el suyo; las demas, el que este elegido', () => {
  assert.equal(oficioDe({ clave: 'voz', oficio: 'dentista' }, 'unas'), 'dentista');
  assert.equal(oficioDe({ clave: 'ruido', oficio: '' }, 'medico'), 'medico');
});

test('los oficios solo rotan solos en la primera toma', () => {
  assert.equal(rota({ clave: 'ruido', oficio: '' }), true);
  for (const clave of ['duda', 'marca', 'texto', 'voz', 'foto', 'pago', 'cartel']) {
    assert.equal(rota({ clave, oficio: '' }), false, clave);
  }
});

test('el oficio que sigue da la vuelta al llegar al ultimo', () => {
  assert.equal(siguienteOficio('unas', ['unas', 'dentista', 'medico']), 'dentista');
  assert.equal(siguienteOficio('medico', ['unas', 'dentista', 'medico']), 'unas');
  assert.equal(siguienteOficio('otro', ['unas', 'dentista']), 'unas');
  assert.equal(siguienteOficio('unas', []), 'unas');
});

test('solo la toma de la duda ensena el lugar vacio', () => {
  assert.equal(mundoDe('duda'), 'espera');
  for (const clave of ['ruido', 'marca', 'texto', 'voz', 'foto', 'pago', 'cartel'])
    assert.equal(mundoDe(clave), 'trabajo');
});

test('los mensajes sin contestar suben con el tiempo, tienen tope y quedan en cero cuando entra el agente', () => {
  assert.equal(sinContestar('ruido', 0), 4);
  assert.equal(sinContestar('ruido', 1.7), 5);
  assert.equal(sinContestar('duda', 16), 14);
  assert.equal(sinContestar('ruido', 9999), 23);
  assert.equal(sinContestar('ruido', -5), 4);
  for (const clave of ['marca', 'texto', 'voz', 'foto', 'pago', 'cartel'])
    assert.equal(sinContestar(clave, 60), 0, clave);
});

test('el guion del comercial: empieza en el ruido, termina en el cartel y solo una toma es la primera', () => {
  const tomas = pelicula.tomas;
  assert.equal(tomas[0].clave, 'ruido');
  assert.equal(tomas.at(-1).clave, 'cartel');
  assert.equal(tomas.filter((/** @type {{ primera: boolean }} */ t) => t.primera).length, 1);
  assert.equal(tomas.filter((/** @type {{ ultima: boolean }} */ t) => t.ultima).length, 1);
  assert.equal(
    new Set(tomas.map((/** @type {{ clave: string }} */ t) => t.clave)).size,
    tomas.length,
    'sin tomas repetidas',
  );
});

test('cada ventaja la protagoniza un oficio que existe y que trae su charla', () => {
  for (const toma of pelicula.tomas) {
    if (!toma.oficio) continue;
    const oficio = pelicula.oficios.find((/** @type {{ clave: string }} */ o) => o.clave === toma.oficio);
    assert.ok(oficio, `la toma ${toma.clave} nombra un oficio que no existe`);
    assert.ok(
      oficio.charlas.some((/** @type {{ toma: string }} */ c) => c.toma === toma.clave),
      `al oficio ${oficio.clave} le falta la charla de la toma ${toma.clave}`,
    );
  }
  for (const oficio of pelicula.oficios) {
    for (const charla of oficio.charlas) {
      assert.ok(
        pelicula.tomas.some(
          (/** @type {{ clave: string, oficio: string }} */ t) => t.clave === charla.toma && t.oficio === oficio.clave,
        ),
        `la charla ${charla.toma} de ${oficio.clave} no tiene toma`,
      );
    }
  }
});

test('en salud ninguna charla ensena una foto: ahi una foto es imagen clinica, no referencia', () => {
  for (const oficio of pelicula.oficios) {
    if (oficio.clave === 'unas') continue;
    for (const charla of oficio.charlas) assert.equal(charla.foto, false, `${oficio.clave}: ${charla.toma}`);
    for (const mensaje of oficio.mensajes) assert.equal(mensaje.foto, false, `${oficio.clave}: ${mensaje.quien}`);
  }
});

test('cada oficio tiene en el repo sus fotos, y su video si dice tenerlo', async () => {
  const carpeta = path.join(FUENTE, 'recursos', 'comercial');
  for (const oficio of pelicula.oficios) {
    for (const momento of ['trabajo', 'espera']) {
      for (const ancho of [720, 1080]) {
        for (const tipo of ['avif', 'webp'])
          await access(path.join(carpeta, `${oficio.clave}-${momento}-${ancho}.${tipo}`));
      }
    }
    if (oficio.video) await access(path.join(carpeta, `${oficio.clave}-trabajo.mp4`));
  }
  assert.ok(claves.length >= 3);
});
