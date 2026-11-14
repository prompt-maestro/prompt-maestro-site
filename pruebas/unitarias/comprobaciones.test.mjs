// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revisarEnlacesInternos, revisarGuiones, textoVisible } from '../../herramientas/comprobaciones.mjs';

test('textoVisible quita etiquetas, estilos, scripts y comentarios', () => {
  const html =
    '<style>p{color:red}</style><p>Hola <b>t&uacute;</b> &amp; yo</p><!-- nota --><script src="a.js"></script>';
  assert.equal(textoVisible(html), 'Hola t&uacute; & yo');
});

test('revisarGuiones encuentra el guion largo, el mediano y el guion suelto entre dos ideas', () => {
  for (const guion of [String.fromCodePoint(0x2014), String.fromCodePoint(0x2013), '-']) {
    assert.equal(revisarGuiones('a.html', `<p>Tu agenda ${guion} pagada.</p>`).length, 1);
  }
});

test('revisarGuiones deja pasar el guion dentro de una palabra o de una direccion', () => {
  assert.deepEqual(revisarGuiones('a.html', '<p>prompt-maestro.com y un chip pre-pago</p>'), []);
});

test('revisarGuiones no mira lo que no se lee: atributos, estilos y scripts', () => {
  assert.deepEqual(revisarGuiones('a.html', '<a class="a - b" href="/x">Ir</a><style>a{margin:1 - 2}</style>'), []);
});

test('revisarEnlacesInternos acepta lo que existe, con o sin .html', () => {
  const existe = (/** @type {string} */ ruta) => ['index.html', 'terminos.html', 'a/1/estilos/base.css'].includes(ruta);
  const html =
    '<link href="/a/1/estilos/base.css"><a href="/">Inicio</a><a href="/terminos">T</a><a href="/#planes">P</a>';
  assert.deepEqual(revisarEnlacesInternos('index.html', html, '/', existe), []);
});

test('revisarEnlacesInternos marca lo que no existe y lo que se sale de la base', () => {
  const existe = (/** @type {string} */ ruta) => ruta === 'index.html';
  const problemas = revisarEnlacesInternos(
    'index.html',
    '<a href="/pagina-previa/nada">x</a><img src="/foto.png">',
    '/pagina-previa/',
    existe,
  );
  assert.equal(problemas.length, 2);
  assert.match(problemas[0] ?? '', /no existe/);
  assert.match(problemas[1] ?? '', /no empieza con/);
});

test('revisarEnlacesInternos no toca enlaces de afuera, correos ni anclas', () => {
  const html = '<a href="https://alta.prompt-maestro.com/">x</a><a href="mailto:a@b.c">y</a><a href="#planes">z</a>';
  assert.deepEqual(
    revisarEnlacesInternos('index.html', html, '/', () => false),
    [],
  );
});
