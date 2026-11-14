// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escaparHtml, pintar } from '../../herramientas/plantilla.mjs';

test('pinta un valor y lo escapa para HTML', () => {
  assert.equal(
    pintar('<p>{{nombre}}</p>', { nombre: 'Uñas & "más" <b>' }),
    '<p>Uñas &amp; &quot;más&quot; &lt;b&gt;</p>',
  );
});

test('lee una ruta con puntos y respeta los espacios dentro de las llaves', () => {
  assert.equal(
    pintar('{{ sitio.alta }}', { sitio: { alta: 'https://alta.prompt-maestro.com/' } }),
    'https://alta.prompt-maestro.com/',
  );
});

test('la llave triple no escapa (solo para HTML que arma el propio armador)', () => {
  assert.equal(pintar('{{{bloque}}}', { bloque: '<b>ya armado</b>' }), '<b>ya armado</b>');
});

test('un dato que no existe detiene la armada con el nombre del dato', () => {
  assert.throws(() => pintar('{{sitio.noExiste}}', { sitio: {} }), /sitio\.noExiste/);
});

test('un numero se pinta tal cual y cero no cuenta como faltante', () => {
  assert.equal(pintar('{{precio}} y {{cero}}', { precio: 990, cero: 0 }), '990 y 0');
});

test('cada repite el bloque con los campos del elemento, su indice y su numero', () => {
  const html = pintar('{{#cada planes}}[{{@numero}} {{nombre}} {{mensual}}]{{/cada}}', {
    planes: [
      { nombre: 'Bronce', mensual: 990 },
      { nombre: 'Plata', mensual: 1490 },
    ],
  });
  assert.equal(html, '[1 Bronce 990][2 Plata 1490]');
});

test('cada sobre una lista de textos usa este', () => {
  assert.equal(
    pintar('{{#cada incluye}}<li>{{este}}</li>{{/cada}}', { incluye: ['Uno', 'Dos'] }),
    '<li>Uno</li><li>Dos</li>',
  );
});

test('dentro de cada se alcanzan los datos de afuera', () => {
  assert.equal(pintar('{{#cada lista}}{{este}}{{moneda}} {{/cada}}', { lista: [1, 2], moneda: 'mxn' }), '1mxn 2mxn ');
});

test('cada anidado', () => {
  const html = pintar('{{#cada planes}}{{nombre}}:{{#cada incluye}}{{este}},{{/cada}};{{/cada}}', {
    planes: [
      { nombre: 'A', incluye: ['x', 'y'] },
      { nombre: 'B', incluye: [] },
    ],
  });
  assert.equal(html, 'A:x,y,;B:;');
});

test('si y no', () => {
  const plantilla = '{{#si destacado}}SI{{/si}}{{#no destacado}}NO{{/no}}';
  assert.equal(pintar(plantilla, { destacado: true }), 'SI');
  assert.equal(pintar(plantilla, { destacado: false }), 'NO');
});

test('si trata una lista vacia y un texto vacio como falso', () => {
  assert.equal(pintar('{{#si lista}}hay{{/si}}{{#no texto}}vacio{{/no}}', { lista: [], texto: '' }), 'vacio');
});

test('@primero y @ultimo dentro de cada', () => {
  const html = pintar(
    '{{#cada l}}{{#si @primero}}<{{/si}}{{este}}{{#no @ultimo}},{{/no}}{{#si @ultimo}}>{{/si}}{{/cada}}',
    {
      l: ['a', 'b', 'c'],
    },
  );
  assert.equal(html, '<a,b,c>');
});

test('incluye un parcial y el parcial ve los mismos datos', () => {
  const html = pintar('<main>{{> saludo}}</main>', { nombre: 'Bella' }, { saludo: 'Hola, {{nombre}}.' });
  assert.equal(html, '<main>Hola, Bella.</main>');
});

test('un parcial que no existe detiene la armada', () => {
  assert.throws(() => pintar('{{> fantasma}}', {}, {}), /fantasma/);
});

test('un parcial que se incluye a si mismo se detiene en lugar de ciclarse', () => {
  assert.throws(() => pintar('{{> a}}', {}, { a: '{{> a}}' }), /demasiado/);
});

test('un bloque sin cerrar o mal cerrado detiene la armada', () => {
  assert.throws(() => pintar('{{#si x}}abierto', { x: true }), /sin cerrar/);
  assert.throws(() => pintar('{{#si x}}a{{/cada}}', { x: true }), /cierra/);
  assert.throws(() => pintar('suelto{{/si}}', {}), /cierra/);
});

test('cada exige una lista', () => {
  assert.throws(() => pintar('{{#cada x}}a{{/cada}}', { x: 'texto' }), /lista/);
});

test('escaparHtml cubre los cinco caracteres', () => {
  assert.equal(escaparHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
