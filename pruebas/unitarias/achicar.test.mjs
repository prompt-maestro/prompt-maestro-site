// @ts-check
// Achicar la hoja de estilos nunca cambia lo que significa: aqui estan los casos delicados, uno por uno.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { achicarCss } from '../../herramientas/achicar.mjs';

const ESTILOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuente', 'estilos');

test('quita los comentarios y los espacios que sobran, y deja lo demas como estaba', () => {
  const hoja = `/* La base. */
.a,
.b {
  color: red;
  margin: 0 auto; /* centrado */
}

.c {
  padding: 4px 8px;
}
`;
  assert.equal(achicarCss(hoja), '.a,.b{color:red;margin:0 auto;}.c{padding:4px 8px;}');
});

test('no reescribe valores ni quita el ultimo punto y coma: solo comentarios y espacios', () => {
  assert.equal(achicarCss('a { color: #ffffff; margin: 0.50em 0px;}'), 'a{color:#ffffff;margin:0.50em 0px;}');
  assert.equal(achicarCss('a{}  \n  b{}'), 'a{}b{}');
  // El espacio antes de cerrar la llave sobra, con o sin punto y coma.
  assert.equal(achicarCss('a { top: 0 } b { top: 0 ; }'), 'a{top:0}b{top:0;}');
  assert.equal(achicarCss(''), '');
  assert.equal(achicarCss('  /* solo un comentario */  '), '');
});

test('lo que va entre comillas se copia tal cual, aunque parezca un comentario o traiga espacios', () => {
  assert.equal(
    achicarCss('a::before { content: "/* no es comentario */";}'),
    'a::before{content:"/* no es comentario */";}',
  );
  assert.equal(
    achicarCss("a::after { content: '  dos   espacios ; { } , ' ; }"),
    "a::after{content:'  dos   espacios ; { } , ';}",
  );
  // Una comilla escapada no cierra la cadena.
  assert.equal(
    achicarCss('a { content: "dice \\"hola\\"  /* aqui */ " ;}'),
    'a{content:"dice \\"hola\\"  /* aqui */ ";}',
  );
  assert.equal(achicarCss('a { content: "" ;}'), 'a{content:"";}');
  assert.equal(
    achicarCss('.g { grid-template-areas:\n    "promesa  demo"\n    "cierre   demo";}'),
    '.g{grid-template-areas:"promesa  demo" "cierre   demo";}',
  );
  assert.equal(
    achicarCss('[data-estado="va  ya"] , [lang = "es"] { top: 0}'),
    '[data-estado="va  ya"],[lang = "es"]{top:0}',
  );
});

test('un url con datos se copia entero, con o sin comillas', () => {
  const svg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Cpath d='M7 7l7 7' /%3E%3C/svg%3E";
  assert.equal(
    achicarCss(`li::before { background: red url("${svg}") ; }`),
    `li::before{background:red url("${svg}");}`,
  );
  // Sin comillas, lo de adentro tampoco se toca: ni sus comas, ni sus puntos y coma, ni un "/*".
  assert.equal(
    achicarCss('a { background: url(data:image/gif;base64,R0lG/*AB*/Cg==) no-repeat , url( "b.png" )}'),
    'a{background:url(data:image/gif;base64,R0lG/*AB*/Cg==) no-repeat,url( "b.png" )}',
  );
  assert.equal(
    achicarCss('@font-face { src: url("../recursos/a.woff2")  format("woff2");}'),
    '@font-face{src:url("../recursos/a.woff2") format("woff2");}',
  );
  // Una palabra que termina en "url(" no es un url.
  assert.equal(achicarCss('a { width: mi-url( 1 , 2 )}'), 'a{width:mi-url( 1,2 )}');
});

test('en calc los espacios alrededor de la suma y la resta se conservan', () => {
  assert.equal(achicarCss('a { width: calc(100%  -  2px);}'), 'a{width:calc(100% - 2px);}');
  assert.equal(achicarCss('a { top: calc(var(--k, 0) * 240ms + 120ms)}'), 'a{top:calc(var(--k,0) * 240ms + 120ms)}');
  assert.equal(achicarCss('a { margin: calc(var(--hueco) / -2) -4px}'), 'a{margin:calc(var(--hueco) / -2) -4px}');
  assert.equal(
    achicarCss('a { font-size: min(13.5px, calc((100cqi - 20px) / 12));}'),
    'a{font-size:min(13.5px,calc((100cqi - 20px) / 12));}',
  );
  assert.equal(achicarCss('a { color: rgb(7 9 22 / 0.94)}'), 'a{color:rgb(7 9 22 / 0.94)}');
});

test('los combinadores de un selector siguen siendo los mismos', () => {
  assert.equal(achicarCss('.a > .b { top: 0}'), '.a > .b{top:0}');
  assert.equal(achicarCss('.a + .b , .a ~ .b { top: 0}'), '.a + .b,.a ~ .b{top:0}');
  // El espacio de "descendiente" no se pierde ni se inventa.
  assert.equal(achicarCss('.a   .b { top: 0}'), '.a .b{top:0}');
  assert.equal(achicarCss('.a.b { top: 0}'), '.a.b{top:0}');
  // "a :hover" (cualquier descendiente con el cursor encima) no es "a:hover".
  assert.equal(achicarCss('a :hover { top: 0}'), 'a :hover{top:0}');
  assert.equal(achicarCss('a:hover , a:not( .b ) ::before { top: 0}'), 'a:hover,a:not( .b ) ::before{top:0}');
  assert.equal(achicarCss('.a:nth-child(2n + 1) { top: 0}'), '.a:nth-child(2n + 1){top:0}');
});

test('las reglas de @media, @supports y @container conservan el espacio que las separa', () => {
  assert.equal(
    achicarCss('@media (min-width: 900px) and (min-aspect-ratio: 1/1) {\n  .a { top: 0; }\n}'),
    '@media (min-width:900px) and (min-aspect-ratio:1/1){.a{top:0;}}',
  );
  assert.equal(
    achicarCss('@media (prefers-reduced-motion: no-preference) { .a , .b { transition: color 1s , top 2s; }}'),
    '@media (prefers-reduced-motion:no-preference){.a,.b{transition:color 1s,top 2s;}}',
  );
  assert.equal(
    achicarCss('@supports (font-size: 1cqi) { .t { font-size: clamp(2.25rem, 10.5cqi, 4.25rem); }}'),
    '@supports (font-size:1cqi){.t{font-size:clamp(2.25rem,10.5cqi,4.25rem);}}',
  );
  assert.equal(achicarCss('@supports not (height: 100svh) { a { top: 0 }}'), '@supports not (height:100svh){a{top:0}}');
  assert.equal(achicarCss('@container (max-width: 343px) { a { top: 0 }}'), '@container (max-width:343px){a{top:0}}');
  assert.equal(
    achicarCss('@keyframes cae {\n  from { opacity: 0; }\n\n  55% { opacity: 1; }\n}'),
    '@keyframes cae{from{opacity:0;}55%{opacity:1;}}',
  );
});

test('un comentario que es lo unico que separa dos piezas deja uno vacio en su lugar', () => {
  // Sin el, "0" y "auto" se volverian una sola palabra.
  assert.equal(achicarCss('a { margin: 0/* arriba */auto}'), 'a{margin:0/**/auto}');
  assert.equal(achicarCss('a { margin: 0/* uno *//* dos */auto}'), 'a{margin:0/**/auto}');
  // Con un espacio de cualquiera de los dos lados, basta el espacio.
  assert.equal(achicarCss('a { margin: 0 /* arriba */auto}'), 'a{margin:0 auto}');
  assert.equal(achicarCss('a { margin: 0/* arriba */ auto}'), 'a{margin:0 auto}');
  // Junto a una llave, una coma o un punto y coma no hace falta nada.
  assert.equal(achicarCss('a {/* nada */color: red;/* nada */}/* fin */b{}'), 'a{color:red;}b{}');
  // Un comentario sin cerrar llega hasta el final de la hoja.
  assert.equal(achicarCss('a { top: 0 } /* se quedo abierto'), 'a{top:0}');
});

test('un valor vacio a proposito, un escape y !important quedan intactos', () => {
  assert.equal(achicarCss('a { --apagado: ; --otro:  ; color: red}'), 'a{--apagado: ;--otro: ;color:red}');
  assert.equal(achicarCss('a { --ultimo: }'), 'a{--ultimo: }');
  assert.equal(achicarCss('.sm\\:flex , .a\\ b { top: 0}'), '.sm\\:flex,.a\\ b{top:0}');
  // El espacio que cierra un codigo es parte del escape: se queda, y solo ese.
  assert.equal(
    achicarCss('a::before { content: "\\201c" } .\\31 0  .b { top: 0 }'),
    'a::before{content:"\\201c"}.\\31 0 .b{top:0}',
  );
  assert.equal(achicarCss('a { color: red  !important ;}'), 'a{color:red !important;}');
});

test('achicar dos veces da lo mismo que una, y lo mismo cada vez', () => {
  const hoja =
    '/* a */ .a > .b , .c { margin : calc( 1px + 2px ) auto ; content : "x  y" } @media (min-width: 1px) { a { top : 0 }}';
  const una = achicarCss(hoja);
  assert.equal(achicarCss(una), una);
  assert.equal(achicarCss(hoja), una);
});

test('las hojas de la pagina: sin comentarios, mas ligeras y con las mismas reglas, cadenas y numeros', async () => {
  /** @type {string[]} */
  const orden = JSON.parse(await readFile(path.join(ESTILOS, 'orden.json'), 'utf8'));
  const hojas = (await readdir(ESTILOS)).filter((nombre) => nombre.endsWith('.css'));
  assert.ok(orden.every((nombre) => hojas.includes(nombre)));
  /** Lo que significa una hoja no depende de sus espacios: sin ellos, la de fuente y la achicada son la misma. */
  const sinEspacios = (/** @type {string} */ css) => css.replace(/\s+/g, '');
  /** Las cadenas de una hoja, que no llevan comentarios dentro en ninguna de las nuestras. */
  const cadenas = (/** @type {string} */ css) => css.match(/"[^"\n]*"|'[^'\n]*'/g) ?? [];
  for (const nombre of hojas) {
    const fuente = await readFile(path.join(ESTILOS, nombre), 'utf8');
    const chica = achicarCss(fuente);
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!chica.includes('/*'), `${nombre}: quedo un comentario`);
    // Fuera de las cadenas (que aqui se cambian por una letra) no queda un salto de renglon ni dos espacios juntos.
    assert.ok(!/\s{2}|\n/.test(chica.replace(/"[^"]*"|'[^']*'/g, 'c')), `${nombre}: quedaron espacios de sobra`);
    assert.ok(chica.length < fuente.length, `${nombre}: no se achico`);
    assert.equal(
      sinEspacios(chica),
      sinEspacios(sinComentarios),
      `${nombre}: cambio algo mas que espacios y comentarios`,
    );
    assert.deepEqual(cadenas(chica), cadenas(sinComentarios), `${nombre}: cambio una cadena`);
    // Ni una llave de mas o de menos, y cada @media con su espacio.
    assert.equal(chica.split('{').length, sinComentarios.split('{').length, nombre);
    assert.equal(chica.split('}').length, sinComentarios.split('}').length, nombre);
    assert.ok(!/@(media|supports|container)\(/.test(chica), `${nombre}: una regla se pego a su parentesis`);
    // Las sumas y las restas de calc() conservan sus espacios.
    const sumas = (/** @type {string} */ css) => (css.match(/\S [+-] \S/g) ?? []).length;
    assert.equal(sumas(chica), sumas(sinComentarios.replace(/\s+/g, ' ')), `${nombre}: cambio una suma o una resta`);
  }
});

test('un signo escapado es una letra del nombre: el espacio que lo sigue se conserva', () => {
  // ".a\: .b" es "un .b dentro de la clase a:"; pegados serian otra clase.
  assert.equal(achicarCss('.a\\: .b { top: 0 }'), '.a\\: .b{top:0}');
  assert.equal(achicarCss('.a\\,  .b { top: 0 }'), '.a\\, .b{top:0}');
  assert.equal(achicarCss('.a\\; .b { top: 0 }'), '.a\\; .b{top:0}');
  assert.equal(achicarCss('.a\\{ .b { top: 0 }'), '.a\\{ .b{top:0}');
  assert.equal(achicarCss('.a\\} .b { top: 0 }'), '.a\\} .b{top:0}');
  // Y un comentario pegado a un signo escapado sigue separando dos piezas.
  assert.equal(achicarCss('.a\\,/* x */b { top: 0 }'), '.a\\,/**/b{top:0}');
  // Antes de una llave el espacio sobra igual, con escape o sin el.
  assert.equal(achicarCss('.a\\: { top: 0 }'), '.a\\:{top:0}');
});

test('el cierre de un codigo escapado es uno solo, aunque sea un retorno con su salto de renglon', () => {
  assert.equal(achicarCss('.\\31\r\n0 .b { top: 0 }'), '.\\31 0 .b{top:0}');
  assert.equal(achicarCss('.\\31\n0 { top: 0 }'), '.\\31 0{top:0}');
  assert.equal(achicarCss('.\\31\t0 { top: 0 }'), '.\\31 0{top:0}');
  // Seis digitos y su cierre; el segundo espacio ya es un descendiente.
  assert.equal(achicarCss('.\\000031  .b { top: 0 }'), '.\\000031  .b{top:0}');
});

test('solo los espacios de CSS son espacios: un espacio duro o una marca de orden de bytes se quedan', () => {
  const duro = String.fromCharCode(0xa0);
  const renglon = String.fromCharCode(0x2028);
  const marca = String.fromCharCode(0xfeff);
  assert.equal(achicarCss(`.a${duro}b { top: 0 }`), `.a${duro}b{top:0}`);
  assert.equal(achicarCss(`.a${renglon}b { top: 0 }`), `.a${renglon}b{top:0}`);
  assert.equal(achicarCss(`${marca}.a { top: 0 }`), `${marca}.a{top:0}`);
  assert.equal(achicarCss('.a\f\t\r\n.b { top: 0 }'), '.a .b{top:0}');
});

/**
 * Parte una hoja en piezas, sin ayuda del achicador: cadenas, url() sin comillas, escapes y letras sueltas. Entre
 * pieza y pieza anota si habia espacios ("e"), solo un comentario ("c") o nada ("").
 * @param {string} css
 * @returns {{ pieza: string, antes: string }[]}
 */
function piezasDe(css) {
  /** @type {{ pieza: string, antes: string }[]} */
  const piezas = [];
  const patron =
    /([ \t\n\r\f]+)|(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')|(url\(\s*[^"'\s)][^)]*\))|(\\[0-9a-fA-F]{1,6}[ \t\n\r\f]?|\\[\s\S])|([\s\S])/giy;
  let antes = '';
  for (const [, espacio, comentario, cadena, direccion, escapada, letra] of css.matchAll(patron)) {
    if (espacio) antes = 'e';
    else if (comentario) antes ||= 'c';
    else {
      piezas.push({ pieza: cadena ?? direccion ?? escapada ?? letra ?? '', antes });
      antes = '';
    }
  }
  return piezas;
}

test('las hojas de la pagina, pieza por pieza: las mismas, sin un espacio inventado y sin quitar uno que signifique', async () => {
  /** @type {string[]} */
  const orden = JSON.parse(await readFile(path.join(ESTILOS, 'orden.json'), 'utf8'));
  const hojas = (await readdir(ESTILOS)).filter((nombre) => nombre.endsWith('.css'));
  const unida = (await Promise.all(orden.map((nombre) => readFile(path.join(ESTILOS, nombre), 'utf8')))).join('');
  /** Junto a estos signos un espacio no significa nada; tras dos puntos, tampoco (en un selector nunca lo hay). */
  const sobraAntesDe = new Set(['{', '}', ';', ',']);
  const sobraDespuesDe = new Set(['{', '}', ';', ',', ':']);
  /** @type {[string, string][]} */
  const casos = [['la hoja unida', unida]];
  for (const nombre of hojas) casos.push([nombre, await readFile(path.join(ESTILOS, nombre), 'utf8')]);
  let quitados = 0;
  for (const [nombre, fuente] of casos) {
    const antes = piezasDe(fuente);
    const despues = piezasDe(achicarCss(fuente));
    assert.deepEqual(
      despues.map(({ pieza }) => pieza),
      antes.map(({ pieza }) => pieza),
      `${nombre}: cambio una pieza`,
    );
    for (const [lugar, { pieza, antes: habia }] of antes.entries()) {
      const queda = despues[lugar]?.antes ?? '';
      const previa = antes[lugar - 1]?.pieza ?? '';
      const donde = `${nombre}: entre "${previa}" y "${pieza}" (pieza ${lugar})`;
      // Nunca aparece un espacio (ni un comentario vacio) donde no habia nada.
      if (habia === '') assert.equal(queda, '', `${donde} aparecio un separador`);
      if (habia === 'e' && queda !== 'e') {
        // Un espacio solo se va al principio o junto a un signo donde no significa nada.
        assert.ok(lugar === 0 || sobraAntesDe.has(pieza) || sobraDespuesDe.has(previa), `${donde} se fue un espacio`);
        quitados++;
      }
      // Un comentario que era lo unico entre dos piezas las sigue separando, salvo junto a esos mismos signos.
      if (habia === 'c' && queda === '')
        assert.ok(sobraAntesDe.has(pieza) || sobraDespuesDe.has(previa), `${donde} se pegaron dos piezas`);
    }
  }
  // La prueba si esta mirando algo: en estas hojas se van miles de espacios.
  assert.ok(quitados > 5000, `solo se quitaron ${quitados} espacios`);
});
