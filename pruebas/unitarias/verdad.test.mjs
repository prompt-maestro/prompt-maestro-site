// @ts-check
// La pagina nunca promete algo que el producto no hace. Aqui se lee TODO lo que una persona ve en la pagina ya armada
// (plantilla, datos, comercial y demostracion) y se buscan las promesas prohibidas de la tabla de la verdad del PRD.
import assert from 'node:assert/strict';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armarSitio } from '../../herramientas/armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Lo prohibido, como se diria en la pagina. Cada una con su porque. */
const PROHIBIDO = /** @type {[RegExp, string][]} */ ([
  [/al instante/, 'el agente contesta en menos de un minuto, nunca "al instante"'],
  [/\d+\s?segundos?/, 'no se promete un numero de segundos'],
  [/sin intervenci[oó]n humana/, 'la profesional siempre puede entrar'],
  [/prueba(lo)? antes de pagar|prueba gratis|gratis/, 'no hay prueba antes de pagar ni nada gratis'],
  [/\d\s?%|por ciento/, 'ningun porcentaje de plantones o de mejora como hecho'],
  [/testimoni|nuestr[oa]s client[ea]s dicen|casos? de [eé]xito/, 'no hay testimonios de clientes que no existen'],
  // Se vale preguntarlo ("¿Me trae clientela nueva?") y negarlo; nunca afirmarlo.
  [/(?<!no te |¿me )trae client/, 'no trae clientela nueva: solo se puede decir en negativo'],
  // Quien manda audios es la clienta; el agente los entiende y contesta por escrito.
  [
    /(contesta|responde) (con|por) (voz|audios?|notas? de voz)|te (manda|env[ií]a) (audios?|notas? de voz)/,
    'sin audios',
  ],
  [/expediente cl[ií]nico/, 'no es un expediente clinico'],
  [/\boxxo\b|\bspei\b/, 'a Prompt Maestro se le paga solo con tarjeta'],
  [/certificaci[oó]n|\bsoc ?2\b|\biso ?27/, 'ninguna norma de seguridad como certificacion'],
  [/lista en \d+ minutos|en \d+ minutos (queda|est[aá])/, 'no se prometen tiempos exactos de alta'],
  [/abogad|veterinari|psic[oó]log|barber|est[eé]tica|spa\b/, 'no se nombran oficios que todavia no existen'],
  [/tu cuenta personal/, 'el anticipo cae en "tu Mercado Pago", no en "tu cuenta personal"'],
  [/—/, 'sin guiones largos'],
]);

let visible = '';
let html = '';

before(async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  html = archivos.get('index.html')?.toString('utf8') ?? '';
  // Lo que se lee: el texto, mas lo que va en atributos que tambien se ensenan o se dicen (etiquetas, sugerencias y
  // los textos que el JavaScript pinta despues, que viajan en data-*).
  const atributos = [...html.matchAll(/\s(?:aria-label|placeholder|content|alt|data-[\w-]+)="([^"]*)"/g)].map(
    ([, valor]) => valor,
  );
  const datos = [...html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, json]) => json,
  );
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  visible = [texto, ...atributos, ...datos].join(' ').replace(/\s+/g, ' ').toLowerCase();
});

test('la pagina armada trae sus secciones (si no, esta prueba no estaria leyendo nada)', () => {
  for (const frase of [
    'despreocúpate',
    'haz la cuenta',
    'lo que nos preguntan',
    'tu número, tu dinero',
    'pago aprobado',
  ]) {
    assert.ok(visible.includes(frase), frase);
  }
  assert.ok(visible.length > 8000);
});

for (const [patron, porque] of PROHIBIDO) {
  test(`nunca dice ${patron.source}: ${porque}`, () => {
    const hallado = patron.exec(visible);
    const donde = hallado ? visible.slice(Math.max(0, hallado.index - 60), hallado.index + 80) : '';
    assert.equal(hallado, null, `aparece en: ...${donde}...`);
  });
}

test('lo que la pagina si tiene que decir, con las palabras de la tabla de la verdad', () => {
  for (const frase of [
    'menos de un minuto',
    'tu mercado pago',
    'según la política que tú pones',
    'asistente virtual',
    'escribe persona',
    'no te trae clientela nueva',
    'no diagnostica ni recomienda medicamentos',
    'hoy, para uñas, dentistas y médicos',
  ]) {
    assert.ok(visible.includes(frase), frase);
  }
});

test('toda ancla de la pagina lleva a algo que existe', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id));
  const anclas = [...html.matchAll(/\shref="#([^"]+)"/g)].map(([, ancla]) => ancla);
  assert.ok(anclas.length >= 4);
  for (const ancla of anclas) assert.ok(ids.has(ancla ?? ''), `#${ancla} no existe`);
  // Y cada nombre se usa una sola vez.
  const repetidos = [...html.matchAll(/\sid="([^"]+)"/g)]
    .map(([, id]) => id)
    .filter((id, i, todos) => todos.indexOf(id) !== i);
  assert.deepEqual(repetidos, []);
});
