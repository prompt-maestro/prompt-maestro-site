// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carpetasConHuella, INDISPENSABLES, planDePublicacion, SE_CONSERVAN } from '../../herramientas/publicacion.mjs';

// Lo que main trae hoy (la pagina de marzo), tal como lo lista git.
const MAIN_DE_MARZO = [
  '.nojekyll',
  '404.html',
  'CNAME',
  'DEPLOY-GUIDE.md',
  'favicon.svg',
  'index.html',
  'legal.css',
  'privacidad.html',
  'reembolso.html',
  'robots.txt',
  'sitemap.xml',
  'terminos.html',
];
const ARMADO = [
  '.nojekyll',
  '404.html',
  'CNAME',
  'favicon.svg',
  'index.html',
  'a/1111111111/estilos/pagina.css',
  'a/1111111111/js/arranque.js',
  'r/2222222222/fuentes/outfit.woff2',
];

test('la primera publicacion conserva las legales de marzo y retira la guia vieja', () => {
  const plan = planDePublicacion({ enMain: MAIN_DE_MARZO, inicioDeMain: '<html>sin carpetas</html>', armado: ARMADO });
  assert.deepEqual(plan.conservar, ['legal.css', 'privacidad.html', 'reembolso.html', 'terminos.html']);
  assert.deepEqual(plan.retirar, ['DEPLOY-GUIDE.md', 'robots.txt', 'sitemap.xml']);
  assert.equal(plan.escribir.length, ARMADO.length);
  // Nada queda en dos listas y nada de main se pierde de vista.
  const todo = [...plan.escribir, ...plan.conservar, ...plan.retirar];
  assert.equal(new Set(todo).size, todo.length);
  for (const ruta of MAIN_DE_MARZO) assert.ok(todo.includes(ruta), ruta);
});

test('lee de un HTML las carpetas con huella que usa', () => {
  const html = `<link rel="stylesheet" href="/a/98828ce54f/estilos/pagina.css">
    <link rel="preload" href="/r/c3f45bd49c/fuentes/outfit.woff2" as="font">
    <img srcset="/r/c3f45bd49c/comercial/unas-720.avif 720w, /r/c3f45bd49c/comercial/unas-1080.avif 1080w">
    <script type="module" src="/a/98828ce54f/js/arranque.js"></script>
    <a href="/alta/">no es una carpeta con huella</a> <a href="/r/corta/x">tampoco</a>`;
  assert.deepEqual(carpetasConHuella(html), ['a/98828ce54f', 'r/c3f45bd49c']);
  assert.deepEqual(carpetasConHuella('<p>nada</p>'), []);
});

test('la siguiente publicacion deja una vuelta mas los recursos de la anterior, y solo esos', () => {
  const enMain = [
    ...SE_CONSERVAN,
    ...INDISPENSABLES,
    'favicon.svg',
    'a/aaaaaaaaaa/estilos/pagina.css',
    'r/bbbbbbbbbb/fuentes/outfit.woff2',
    'a/0000000000/estilos/pagina.css', // de dos publicaciones atras: ya nadie la pide
  ];
  const inicioDeMain = '<link href="/a/aaaaaaaaaa/estilos/pagina.css"><link href="/r/bbbbbbbbbb/fuentes/outfit.woff2">';
  const plan = planDePublicacion({ enMain, inicioDeMain, armado: ARMADO });
  assert.ok(plan.conservar.includes('a/aaaaaaaaaa/estilos/pagina.css'));
  assert.ok(plan.conservar.includes('r/bbbbbbbbbb/fuentes/outfit.woff2'));
  assert.deepEqual(plan.retirar, ['a/0000000000/estilos/pagina.css']);
});

test('si los recursos no cambiaron, la carpeta de siempre simplemente se vuelve a escribir', () => {
  const enMain = [...SE_CONSERVAN, ...ARMADO];
  const inicioDeMain = '<link href="/a/1111111111/estilos/pagina.css">';
  const plan = planDePublicacion({ enMain, inicioDeMain, armado: ARMADO });
  assert.deepEqual(plan.conservar, [...SE_CONSERVAN].sort());
  assert.deepEqual(plan.retirar, []);
});

test('se detiene si a la armada le falta algo indispensable para el dominio', () => {
  for (const falta of INDISPENSABLES) {
    assert.throws(
      () =>
        planDePublicacion({
          enMain: MAIN_DE_MARZO,
          inicioDeMain: null,
          armado: ARMADO.filter((ruta) => ruta !== falta),
        }),
      /le falta/,
      falta,
    );
  }
});

test('se detiene si la armada pisaria una legal o si main ya no trae las legales que el pie enlaza', () => {
  assert.throws(
    () => planDePublicacion({ enMain: MAIN_DE_MARZO, inicioDeMain: null, armado: [...ARMADO, 'terminos.html'] }),
    /legales que se conservan/,
  );
  assert.throws(
    () =>
      planDePublicacion({
        enMain: MAIN_DE_MARZO.filter((ruta) => ruta !== 'privacidad.html'),
        inicioDeMain: null,
        armado: ARMADO,
      }),
    /ya no trae privacidad\.html/,
  );
});
