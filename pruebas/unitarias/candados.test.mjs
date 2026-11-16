// @ts-check
// Los candados del camino a la pagina en vivo: a donde manda la pagina, que puede entrar a lo armado, que identidades
// y llaves se detienen antes de subir, y cuando la herramienta de publicacion dice que si.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ALTA as ALTA_DE_LA_MEDICION } from '../../fuente/js/medicion.js';
import { ALTA, armarSitio, PERMITIDOS } from '../../herramientas/armado.mjs';
import { correosExpuestos, identidadesDe } from '../../herramientas/correos.mjs';
import { enlacesHaciaFuera, repoDeGitHub, revisionEnVerde } from '../../herramientas/publicacion.mjs';
import { secretosEn } from '../../herramientas/secretos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Las muestras se arman por pedazos para que este archivo no traiga nada con forma de llave ni de correo personal.
const une = (/** @type {string[]} */ ...pedazos) => pedazos.join('');

// ---------------------------------------------------------------------------------------------------------------
// A donde manda la pagina.
// ---------------------------------------------------------------------------------------------------------------
/** Una copia de fuente/ en una carpeta temporal, para armarla con un dato cambiado sin tocar el repo. */
let copia = '';

before(async () => {
  copia = await mkdtemp(path.join(tmpdir(), 'pagina-candados-'));
  await cp(path.join(RAIZ, 'fuente'), path.join(copia, 'fuente'), { recursive: true });
});

after(async () => {
  await rm(copia, { recursive: true, force: true });
});

/**
 * Arma la copia con sitio.json cambiado y devuelve los problemas. Deja la copia como estaba.
 * @param {(sitio: Record<string, unknown>) => void} cambio
 * @returns {Promise<string[]>}
 */
async function problemasCon(cambio) {
  const ruta = path.join(copia, 'fuente', 'datos', 'sitio.json');
  const original = await readFile(ruta, 'utf8');
  const sitio = JSON.parse(original);
  cambio(sitio);
  await writeFile(ruta, JSON.stringify(sitio), 'utf8');
  try {
    return (await armarSitio({ raiz: copia, destino: 'publica' })).problemas;
  } finally {
    await writeFile(ruta, original, 'utf8');
  }
}

test('el boton de empezar lleva al alta de verdad, y el dato, el codigo y la medicion dicen lo mismo', async () => {
  const sitio = JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', 'sitio.json'), 'utf8'));
  assert.equal(ALTA, 'https://alta.prompt-maestro.com/');
  assert.equal(sitio.alta, ALTA);
  assert.equal(ALTA_DE_LA_MEDICION, ALTA);
  assert.deepEqual(await problemasCon(() => {}), []);
});

test('si alguien cambia a donde llevan los botones, la armada se detiene', async () => {
  for (const falsa of [
    'https://alta.prompt-maestro.co/',
    'http://alta.prompt-maestro.com/',
    'https://alta.prompt-maestro.com.otro.mx/',
    'https://alta.prompt-maestro.com/?r=otro',
  ]) {
    const problemas = await problemasCon((sitio) => {
      sitio.alta = falsa;
    });
    assert.ok(
      problemas.some((problema) => problema.includes('alta debe ser')),
      falsa,
    );
  }
});

test('el contacto solo puede ser un correo del dominio', async () => {
  for (const clave of ['contacto', 'contactoOficio', 'contactoGeneral']) {
    for (const falso of [une('mailto:alguien', '@', 'otro.mx'), 'https://wa.me/5210000000000', '']) {
      const problemas = await problemasCon((sitio) => {
        sitio[clave] = falso;
      });
      assert.ok(
        problemas.some((problema) => problema.includes(`${clave} debe ser un correo`)),
        `${clave}: ${falso}`,
      );
    }
  }
});

test('mientras el contacto o las legales no esten confirmados, la armada avisa que no se puede publicar', async () => {
  const sitio = JSON.parse(await readFile(path.join(RAIZ, 'fuente', 'datos', 'sitio.json'), 'utf8'));
  const { avisos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  assert.equal(
    avisos.some((aviso) => /canal de contacto/.test(aviso)),
    sitio.contactoProbado !== true,
  );
  assert.equal(
    avisos.some((aviso) => /paginas legales/.test(aviso)),
    sitio.legalesConfirmadas !== true,
  );
  for (const aviso of avisos) assert.match(aviso, /no se puede publicar/);
});

test('lo que se imprime antes de publicar: cada direccion de fuera a la que manda la pagina, una vez', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const enlaces = enlacesHaciaFuera(archivos.get('index.html')?.toString('utf8') ?? '');
  assert.ok(enlaces.includes(ALTA));
  assert.equal(new Set(enlaces).size, enlaces.length);
  // Nada fuera del dominio, salvo el alta (que es del dominio tambien).
  for (const enlace of enlaces) {
    assert.match(enlace, /^(?:https:\/\/(?:alta\.)?prompt-maestro\.com\/|mailto:[a-z]+@prompt-maestro\.com)/, enlace);
  }
  assert.deepEqual(enlacesHaciaFuera('<a class="x" href="https://a.mx/?b=1&amp;c=2">a</a> <a href="#ancla">b</a>'), [
    'https://a.mx/?b=1&c=2',
  ]);
});

// ---------------------------------------------------------------------------------------------------------------
// Lo que puede entrar a lo armado.
// ---------------------------------------------------------------------------------------------------------------
test('en cada carpeta de la fuente solo entran sus tipos de archivo: ni notas, ni secretos, ni originales', () => {
  for (const [carpeta, permitido] of Object.entries(PERMITIDOS)) {
    for (const intruso of [
      '.env',
      'notas.md',
      'clave.pem',
      'original.psd',
      'guion.map',
      'respaldo.zip',
      'x.html.bak',
    ]) {
      assert.equal(permitido.test(intruso), false, `${carpeta} dejaria entrar ${intruso}`);
    }
  }
  assert.ok(PERMITIDOS.recursos?.test('comercial/unas-trabajo-720.avif'));
  assert.ok(PERMITIDOS.raiz?.test('compartir.jpg'));
  assert.equal(PERMITIDOS.raiz?.test('index.html'), false);
});

test('un archivo que no debe publicarse detiene la armada en vez de salir al dominio', async () => {
  const intruso = path.join(copia, 'fuente', 'recursos', 'notas.md');
  await writeFile(intruso, 'una nota que no es para el publico', 'utf8');
  try {
    const { problemas, archivos } = await armarSitio({ raiz: copia, destino: 'publica' });
    assert.ok(
      problemas.some((problema) => problema.includes('notas.md')),
      problemas.join(' / '),
    );
    assert.ok(![...archivos.keys()].some((ruta) => ruta.endsWith('notas.md')));
  } finally {
    await rm(intruso, { force: true });
  }
});

test('los unicos datos que entran sin escapar a una pagina son los dos bloques de JSON', async () => {
  const plantillas = execFileSync('git', ['ls-files', 'fuente/plantillas'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  /** @type {string[]} */
  const crudos = [];
  for (const ruta of plantillas) {
    const texto = await readFile(path.join(RAIZ, ruta), 'utf8');
    for (const [, dato] of texto.matchAll(/\{\{\{\s*([^}]+?)\s*\}\}\}/g)) crudos.push(dato ?? '');
  }
  assert.deepEqual(crudos.sort(), ['armado.datosDemo', 'armado.datosEstructurados']);
});

// ---------------------------------------------------------------------------------------------------------------
// Antes de subir: identidades, correos y llaves.
// ---------------------------------------------------------------------------------------------------------------
test('de un commit se leen sus identidades tal cual, tengan o no forma de correo', () => {
  const personal = une('alguien', '@', 'correo.com');
  const commit = [
    'tree 0123456789abcdef0123456789abcdef01234567',
    `author Una Persona <${personal}> 1700000000 -0600`,
    'committer Prompt Maestro <1+pm@users.noreply.github.com> 1700000000 -0600',
    '',
    `Un mensaje que menciona a <otra@persona.mx> no es una identidad`,
  ].join('\n');
  assert.deepEqual(identidadesDe(commit), [personal, '1+pm@users.noreply.github.com']);
  assert.deepEqual(correosExpuestos(identidadesDe(commit)), [personal]);
  // La identidad automatica de una laptop sin configurar no tiene punto: tambien se ve y tambien se detiene.
  const automatica =
    'author josem <josem@LAPTOP-AB12CD> 1700000000 -0600\ncommitter x <josem@LAPTOP-AB12CD> 1 -0600\n\nm';
  assert.deepEqual(correosExpuestos(identidadesDe(automatica)), ['josem@LAPTOP-AB12CD']);
  // Y la de una etiqueta anotada.
  assert.deepEqual(identidadesDe(`object abc\ntype commit\ntag v1\ntagger X <${personal}> 1 -0600\n\nnota`), [
    personal,
  ]);
});

test('la red de llaves reconoce tambien las de los servicios que usa el negocio y las claves escritas en claro', () => {
  const muestras = [
    une('sb_', 'secret_', 'a'.repeat(30)),
    une('sb', 'p_', 'a1'.repeat(20)),
    une('EA', 'A', 'B'.repeat(60)),
    une('GOC', 'SPX-', 'c'.repeat(28)),
    une('xo', 'xb-', '1234567890-', 'abcdefghij'),
    une('np', 'm_', 'd'.repeat(36)),
    une('S', 'K', '0123456789abcdef'.repeat(2)),
    une('postgres', '://usuario:', 'clave-larga', '@servidor.mx:5432/base'),
    une('PASS', 'WORD = "', 'unaClaveLarga123', '"'),
    une('"api', '_key": "', 'zzzzzzzzzzzzzzzzzzzz', '"'),
  ];
  for (const muestra of muestras) {
    const tipos = secretosEn(`linea anterior\n${muestra}\nlinea siguiente`);
    assert.ok(tipos.length > 0, `no reconocio la muestra que empieza con ${muestra.slice(0, 6)}`);
    for (const tipo of tipos) assert.equal(tipo.includes(muestra), false);
  }
  // Y no se asusta con lo normal de una pagina o de su codigo.
  for (const normal of [
    'const password = leer(casilla);',
    'token: string, secret?: boolean',
    'https://alta.prompt-maestro.com/ sha512-abc/def+ghi== a/0123456789/js/pagina.js',
    'SKU0123 data-website-id="0f8fad5b-d9cb-469f-a165-70867728950e"',
  ]) {
    assert.deepEqual(secretosEn(normal), [], normal);
  }
});

test('ningun archivo del repo trae un correo personal ni una ruta de la laptop', async () => {
  const archivos = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\0')
    // Las pruebas traen muestras a proposito; el candado de dependencias y los binarios no son texto de la casa.
    .filter((ruta) => ruta && !ruta.startsWith('pruebas/') && ruta !== 'package-lock.json')
    .filter((ruta) => /\.(?:mjs|js|json|html|css|md|txt|xml|svg|yml|yaml|toml)$|^\.[\w/.-]+$/.test(ruta));
  assert.ok(archivos.length > 40, `solo se revisaron ${archivos.length} archivos`);
  const correo = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
  const permitido =
    /@(?:users\.noreply\.github\.com|prompt-maestro\.com|anthropic\.com|github\.com|fontsource[\w-]*|axe-core|biomejs|playwright|types)\b|^(?:noreply@|git@github\.com)/;
  /** @type {string[]} */
  const hallazgos = [];
  for (const ruta of archivos) {
    const texto = await readFile(path.join(RAIZ, ruta), 'utf8');
    for (const [hallado] of texto.matchAll(correo)) {
      if (!permitido.test(hallado)) hallazgos.push(`${ruta}: un correo que no es de la casa`);
    }
    if (/[A-Za-z]:\\Users\\|\/Users\/[a-z]|\/home\/[a-z]|LAPTOP-[A-Z0-9]{4,}/.test(texto)) {
      hallazgos.push(`${ruta}: una ruta o un nombre de la laptop`);
    }
  }
  assert.deepEqual([...new Set(hallazgos)], []);
});

// ---------------------------------------------------------------------------------------------------------------
// Cuando la herramienta de publicacion dice que si.
// ---------------------------------------------------------------------------------------------------------------
test('del remoto sale el repo de GitHub, y de lo que no es GitHub no sale nada', () => {
  assert.equal(
    repoDeGitHub('https://github.com/prompt-maestro/prompt-maestro-site.git'),
    'prompt-maestro/prompt-maestro-site',
  );
  assert.equal(
    repoDeGitHub('https://github.com/prompt-maestro/prompt-maestro-site'),
    'prompt-maestro/prompt-maestro-site',
  );
  assert.equal(repoDeGitHub('git@github.com:prompt-maestro/pagina-previa.git\n'), 'prompt-maestro/pagina-previa');
  assert.equal(repoDeGitHub('https://gitlab.com/a/b.git'), null);
  assert.equal(repoDeGitHub('https://github.com.otro.mx/a/b.git'), null);
  assert.equal(repoDeGitHub('C:/una/carpeta'), null);
});

test('la revision automatica solo esta en verde si existe, termino y todo salio bien', () => {
  const bien = { name: 'revisar', status: 'completed', conclusion: 'success' };
  assert.deepEqual(revisionEnVerde([bien]), { enVerde: true, porque: '' });
  assert.equal(revisionEnVerde([bien, bien]).enVerde, true);
  // Sin revisiones no hay verde: un commit que nadie reviso no se publica.
  assert.equal(revisionEnVerde([]).enVerde, false);
  assert.equal(revisionEnVerde(undefined).enVerde, false);
  assert.equal(revisionEnVerde({ check_runs: [bien] }).enVerde, false);
  assert.match(revisionEnVerde([bien, { ...bien, status: 'in_progress', conclusion: null }]).porque, /no termina/);
  for (const mala of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', null]) {
    assert.equal(revisionEnVerde([bien, { ...bien, conclusion: mala }]).enVerde, false, String(mala));
  }
});
