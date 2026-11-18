// @ts-check
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  andar,
  arrastre,
  barrido,
  CARTEL,
  CRUZA_EN,
  corridos,
  duracion,
  leerGuion,
  momentoEn,
  nuevoReloj,
  parar,
  punto,
  sinContestar,
} from '../../fuente/js/corto.js';
import { armarSitio } from '../../herramientas/armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUENTE = path.join(RAIZ, 'fuente');
const corto = JSON.parse(await readFile(path.join(FUENTE, 'datos', 'corto.json'), 'utf8'));
/** Los ejemplos de la demostracion: el cartel cuenta la misma historia que ella, con el mismo negocio y anticipo. */
const giros = JSON.parse(await readFile(path.join(FUENTE, 'datos', 'giros.json'), 'utf8'));
/** La forma de la foto de trabajo de cada oficio (1536 por 2752): de ella se recorta el retrato del cartel. */
const FORMA_DE_LA_FOTO = 1536 / 2752;
/** Las mismas preguntas que hacen los estilos: donde va "Tu y tu agente" y donde corre el corto. */
const ESTRECHA = 'not all and (min-width: 480px) and (min-aspect-ratio: 1/1)';
const ANCHA = '(min-width: 900px) and (min-aspect-ratio: 1/1)';
/** @type {import('../../fuente/js/corto.js').Momento[]} */
const GUION = corto.guion.map((/** @type {{ clave: string, dura: number }} */ { clave, dura }) => ({ clave, dura }));
const MOMENTOS = ['presion', 'vibra', 'avalancha', 'barrido', 'marca', 'agente'];

/** Un guion corto para las cuentas: tres momentos de 1, 2 y 3 segundos. */
const TRES = [
  { clave: 'uno', dura: 1000 },
  { clave: 'dos', dura: 2000 },
  { clave: 'tres', dura: 3000 },
];

test('el guion se lee de como viaja escrito en la pagina, y lo que no se entiende se salta', () => {
  assert.deepEqual(leerGuion('presion:2600 vibra:2800 '), [
    { clave: 'presion', dura: 2600 },
    { clave: 'vibra', dura: 2800 },
  ]);
  assert.deepEqual(leerGuion('uno:1000 roto dos:-5 tres:abc cuatro:0 cinco:500'), [
    { clave: 'uno', dura: 1000 },
    { clave: 'cinco', dura: 500 },
  ]);
  // El cartel no es un momento del corto: es lo que queda cuando termina.
  assert.deepEqual(leerGuion('cartel:1000'), []);
  assert.deepEqual(leerGuion(''), []);
  assert.deepEqual(leerGuion(undefined), []);
});

test('el corto dura la suma de sus momentos', () => {
  assert.equal(duracion(TRES), 6000);
  assert.equal(duracion([]), 0);
});

test('cada instante cae en su momento, con lo que lleva de el y del corto entero', () => {
  assert.deepEqual(momentoEn(TRES, 0), { clave: 'uno', indice: 0, parte: 0, avance: 0, fin: false });
  assert.deepEqual(momentoEn(TRES, 500), { clave: 'uno', indice: 0, parte: 0.5, avance: 500 / 6000, fin: false });
  // Justo en la raya ya es el momento que sigue.
  assert.deepEqual(momentoEn(TRES, 1000), { clave: 'dos', indice: 1, parte: 0, avance: 1000 / 6000, fin: false });
  assert.deepEqual(momentoEn(TRES, 4500), { clave: 'tres', indice: 2, parte: 0.5, avance: 0.75, fin: false });
  assert.equal(momentoEn(TRES, 5999).clave, 'tres');
  // Antes de empezar es el principio, nunca un momento que no existe.
  assert.equal(momentoEn(TRES, -40).clave, 'uno');
  assert.equal(momentoEn(TRES, -40).avance, 0);
});

test('al terminar el ultimo momento queda el cartel, con el avance completo', () => {
  for (const corridosYa of [6000, 6001, 999_999]) {
    assert.deepEqual(momentoEn(TRES, corridosYa), { clave: CARTEL, indice: 3, parte: 1, avance: 1, fin: true });
  }
  // Sin guion no hay corto: de entrada es el cartel.
  assert.equal(momentoEn([], 0).fin, true);
});

test('el avance nunca retrocede y los momentos pasan en su orden', () => {
  let anterior = -1;
  /** @type {string[]} */
  const vistos = [];
  for (let ms = 0; ms <= duracion(GUION) + 200; ms += 50) {
    const instante = momentoEn(GUION, ms);
    assert.ok(instante.avance >= anterior, `en ${ms}`);
    anterior = instante.avance;
    if (vistos.at(-1) !== instante.clave) vistos.push(instante.clave);
  }
  assert.deepEqual(vistos, [...MOMENTOS, CARTEL]);
});

test('el reloj solo avanza mientras anda: en pausa, o con la pestana escondida, se queda donde iba', () => {
  let reloj = nuevoReloj();
  assert.equal(corridos(reloj, 5000), 0, 'detenido no corre');
  reloj = andar(reloj, 1000);
  assert.equal(corridos(reloj, 1400), 400);
  reloj = parar(reloj, 1600);
  assert.equal(corridos(reloj, 1600), 600);
  assert.equal(corridos(reloj, 90_000), 600, 'en pausa no avanza');
  reloj = andar(reloj, 100_000);
  assert.equal(corridos(reloj, 100_250), 850, 'sigue desde donde se quedo');
  // Echarlo a andar dos veces, o detenerlo dos veces, no cambia nada.
  assert.deepEqual(andar(reloj, 200_000), reloj);
  const detenido = parar(reloj, 100_300);
  assert.deepEqual(parar(detenido, 500_000), detenido);
  // Y si la hora del navegador diera un paso atras, el reloj no retrocede.
  assert.equal(corridos(andar(nuevoReloj(), 1000), 400), 0);
});

test('los mensajes sin contestar suben de la base al tope y ahi se quedan', () => {
  const limites = { base: 7, tope: 23 };
  assert.equal(sinContestar(0, limites), 7);
  assert.equal(sinContestar(0.4, limites), 15);
  assert.equal(sinContestar(0.8, limites), 23);
  assert.equal(sinContestar(1, limites), 23);
  assert.equal(sinContestar(7, limites), 23);
  assert.equal(sinContestar(-1, limites), 7);
  let anterior = 0;
  for (let parte = 0; parte <= 1; parte += 0.01) {
    const van = sinContestar(parte, limites);
    assert.ok(Number.isInteger(van) && van >= anterior, `en ${parte}`);
    anterior = van;
  }
});

test('la raya del barrido va de un lado al otro sin regresar, y termina de cruzar antes de que acabe su momento', () => {
  assert.equal(barrido(0), 0);
  // A media cruzada va a media pantalla.
  assert.equal(barrido(CRUZA_EN / 2), 0.5);
  // Ya cruzo: lo que queda del momento deja ver lo que destapo, con su letrero.
  assert.ok(CRUZA_EN > 0.5 && CRUZA_EN < 0.9);
  assert.equal(barrido(CRUZA_EN), 1);
  assert.equal(barrido(1), 1);
  assert.equal(barrido(-3), 0);
  assert.equal(barrido(3), 1);
  let anterior = 0;
  for (let parte = 0; parte <= 1; parte += 0.02) {
    assert.ok(barrido(parte) >= anterior, `en ${parte}`);
    anterior = barrido(parte);
  }
});

test('la raya no se lleva nada de lado mientras todavia no entra a la pantalla', () => {
  assert.equal(arrastre(0), 0);
  assert.equal(arrastre(0.18), 0);
  assert.ok(arrastre(0.5) > 0 && arrastre(0.5) < 1);
  assert.equal(arrastre(1), 1);
  assert.equal(arrastre(4), 1);
});

test('un punto de la foto se lee en fracciones, y lo que no es un punto no pasa', () => {
  assert.deepEqual(punto('46 78'), { x: 0.46, y: 0.78 });
  assert.deepEqual(punto(' 50  80.5 '), { x: 0.5, y: 0.805 });
  for (const malo of ['', '46', '46 78 3', 'a b', '120 40', '-4 10', undefined, null]) {
    assert.equal(punto(malo), null, String(malo));
  }
});

test('el guion de la pagina: seis momentos en su orden, unos 33 segundos y los letreros de siempre', () => {
  assert.deepEqual(
    GUION.map((momento) => momento.clave),
    MOMENTOS,
  );
  for (const momento of GUION) assert.ok(momento.dura >= 1000, momento.clave);
  const total = duracion(GUION);
  assert.ok(total >= 30_000 && total <= 36_000, `dura ${total} ms`);
  const letreros = Object.fromEntries(
    corto.guion.map((/** @type {{ clave: string, letrero: string }} */ m) => [m.clave, m.letrero]),
  );
  assert.deepEqual(letreros, {
    presion: 'Trabajas.',
    vibra: 'Y tu celular no para de sonar.',
    avalancha: '',
    barrido: 'Despreocúpate',
    marca: '',
    agente: '',
  });
  assert.equal(corto.marca.frase, 'Deja que uno de nuestros agentes virtuales conteste por ti.');
});

test('el momento del agente dura lo que tardan los oficios en contar lo suyo, uno tras otro, y deja ver el ultimo sello', async () => {
  const estilos = await readFile(path.join(FUENTE, 'estilos', 'corto.css'), 'utf8');
  // Lo que tarda cada oficio, lo que espera el primero y cuando cae el sello: los tres los dicen los estilos.
  const cada = Number(/--cada-trato: (\d+)ms;/.exec(estilos)?.[1]);
  const espera = Number(/--va: calc\(var\(--n, 0\) \* var\(--cada-trato\) \+ (\d+)ms\);/.exec(estilos)?.[1]);
  const sello = Number(
    /sello-cae (\d+)ms [^;]*calc\(var\(--va\) \+ (\d+)ms\)/
      .exec(estilos)
      ?.slice(1, 3)
      .reduce((a, b) => a + Number(b), 0),
  );
  assert.ok(cada >= 3000 && espera >= 300 && sello > 0, 'los estilos dicen el paso de lo que hizo el agente');
  // El sello de un oficio cae antes de que empiece el siguiente.
  assert.ok(sello <= cada, `el sello cae a los ${sello} ms y el siguiente oficio empieza a los ${cada}`);
  const agente = GUION.find((momento) => momento.clave === 'agente')?.dura ?? 0;
  const ultimoSello = (corto.oficios.length - 1) * cada + espera + sello;
  assert.ok(agente >= ultimoSello + 1000, `el ultimo sello cae a los ${ultimoSello} ms y el momento dura ${agente}`);
});

test('cada oficio trae lo suyo completo: a donde mira la camara, su cuenta, sus avisos, lo que hizo el agente y su cita', () => {
  assert.ok(corto.oficios.length >= 3);
  const claves = corto.oficios.map((/** @type {{ clave: string }} */ oficio) => oficio.clave);
  assert.equal(new Set(claves).size, claves.length, 'sin oficios repetidos');
  for (const oficio of corto.oficios) {
    assert.ok(punto(oficio.mira.persona), `${oficio.clave}: a donde mira la camara al trabajar`);
    assert.ok(punto(oficio.mira.celular), `${oficio.clave}: donde esta el celular`);
    assert.ok(oficio.llegan.length >= 1, `${oficio.clave}: el aviso que llega`);
    // Los mensajes sin contestar de su celular: suben de una base a su tope.
    assert.ok(
      Number.isInteger(oficio.cuenta.base) && Number.isInteger(oficio.cuenta.tope),
      `${oficio.clave}: su cuenta`,
    );
    assert.ok(oficio.cuenta.base > 0 && oficio.cuenta.base < oficio.cuenta.tope, `${oficio.clave}: su cuenta`);
    // La pantalla del celular acomoda ocho avisos; uno con foto ocupa el lugar de tres.
    const conFoto = oficio.avisos.filter((/** @type {{ foto: boolean }} */ aviso) => aviso.foto).length;
    assert.ok(
      oficio.avisos.length >= 4 && oficio.avisos.length + conFoto * 2 <= 8,
      `${oficio.clave}: avisos de la avalancha`,
    );
    for (const aviso of [...oficio.llegan, ...oficio.avisos]) {
      assert.ok(aviso.quien && aviso.inicial && aviso.hace, `${oficio.clave}: aviso incompleto`);
      assert.ok(aviso.texto || aviso.voz, `${oficio.clave}: el aviso de ${aviso.quien} no dice nada`);
    }
    // Lo que hizo el agente: el mensaje que entro, lo que contesto y, en una frase, lo que resolvio. La frase dice
    // el anticipo que cobro, porque encima le cae el sello de anticipo pagado; y la pagina dice "agente".
    const { trato } = oficio;
    assert.ok(trato.quien && trato.inicial, `${oficio.clave}: a quien le contesto`);
    assert.ok(trato.texto || trato.voz, `${oficio.clave}: el mensaje que entro no dice nada`);
    assert.ok(trato.responde && trato.hizo, `${oficio.clave}: falta lo que contesto o lo que hizo el agente`);
    assert.match(trato.hizo, /cobró \$\d+ de anticipo\.$/, `${oficio.clave}: la frase dice el anticipo que cobro`);
    assert.doesNotMatch(`${trato.responde} ${trato.hizo}`, /asistente/i, `${oficio.clave}: la pagina dice "agente"`);
    const { cartel } = oficio;
    assert.ok(cartel.tarjeta, `${oficio.clave}: la foto de su tarjeta`);
    assert.ok(cartel.alt && cartel.cuando && cartel.quien, `${oficio.clave}: el cartel`);
    assert.ok(cartel.encuadre >= 0 && cartel.encuadre <= 100, `${oficio.clave}: encuadre`);
    assert.ok(oficio.tarjeta, `${oficio.clave}: el texto de "para quien"`);
  }
});

test('"Tu y tu agente": cada oficio trae su retrato y su conversacion, y cuenta lo mismo que la demostracion', () => {
  for (const oficio of corto.oficios) {
    const { tu, charla } = oficio.cartel;
    assert.ok(tu.foto && tu.alt, `${oficio.clave}: el retrato y lo que se ve en el`);
    // El recorte cabe en la foto: mide tres de ancho por cuatro de alto y no se sale por ningun lado.
    const { x, y, ancho } = tu.recorte;
    const alto = ancho * (4 / 3) * FORMA_DE_LA_FOTO;
    assert.ok(x >= 0 && y >= 0 && ancho >= 40, `${oficio.clave}: el recorte`);
    assert.ok(x + ancho <= 100, `${oficio.clave}: el recorte se sale a lo ancho`);
    assert.ok(y + alto <= 100, `${oficio.clave}: el recorte se sale a lo alto`);
    for (const texto of [charla.negocio, charla.entra, charla.responde]) {
      assert.ok(texto, `${oficio.clave}: a la conversacion le falta un texto`);
    }
    assert.match(charla.iniciales, /^\p{Lu}{2}$/u, `${oficio.clave}: las iniciales del negocio`);
    assert.match(charla.anticipo, /^\$\d+$/, `${oficio.clave}: el anticipo`);
    // El agente pide el mismo anticipo que despues aparece pagado, y da la hora que queda en la cita.
    assert.ok(charla.responde.includes(charla.anticipo), `${oficio.clave}: el agente pide otro anticipo`);
    const hora = /\d{1,2}:\d{2} [ap]m/.exec(oficio.cartel.cuando)?.[0] ?? 'sin hora';
    assert.ok(charla.responde.includes(hora), `${oficio.clave}: el agente da otra hora`);
    // El negocio y su anticipo son los del ejemplo de la demostracion de mas abajo.
    const giro = giros.find((/** @type {{ clave: string }} */ uno) => uno.clave === oficio.clave);
    assert.ok(giro, `${oficio.clave}: no tiene ejemplo en la demostracion`);
    assert.equal(charla.negocio, giro.negocio, `${oficio.clave}: otro negocio que en la demostracion`);
    assert.equal(charla.anticipo, `$${giro.anticipo}`, `${oficio.clave}: otro anticipo que en la demostracion`);
  }
  const { cartel } = corto;
  for (const clave of ['ejemplo', 'tu', 'enLoTuyo', 'tuAgente', 'agenteHace', 'whatsapp', 'teEscriben', 'contesta']) {
    assert.ok(cartel[clave], `cartel.${clave}`);
    // La pagina dice "agente".
    assert.doesNotMatch(cartel[clave], /asistente/i, `cartel.${clave}`);
  }
});

test('en salud nadie manda una foto: ahi una foto es imagen clinica, no referencia', () => {
  for (const oficio of corto.oficios) {
    if (oficio.clave === 'unas') continue;
    for (const aviso of [...oficio.llegan, ...oficio.avisos, oficio.trato]) {
      assert.equal(aviso.foto, false, `${oficio.clave}: ${aviso.quien}`);
    }
  }
});

/**
 * Las pistas de un video MP4, por su tipo ("vide", "soun"), y la medida de su imagen. Lee las cajas del archivo: no
 * necesita ffmpeg, asi la revision de GitHub tambien lo comprueba.
 * @param {Buffer} archivo
 */
function pistasDe(archivo) {
  /** @type {string[]} */
  const tipos = [];
  let ancho = 0;
  let alto = 0;
  for (let i = archivo.indexOf('hdlr', 0, 'latin1'); i !== -1; i = archivo.indexOf('hdlr', i + 4, 'latin1')) {
    const tipo = archivo.toString('latin1', i + 12, i + 16);
    // "mdir" no es una pista: es la etiqueta del programa que escribio el archivo.
    if (tipo !== 'mdir') tipos.push(tipo);
  }
  for (let i = archivo.indexOf('tkhd', 0, 'latin1'); i !== -1; i = archivo.indexOf('tkhd', i + 4, 'latin1')) {
    const fin = i - 4 + archivo.readUInt32BE(i - 4);
    ancho = archivo.readUInt32BE(fin - 8) / 65536;
    alto = archivo.readUInt32BE(fin - 4) / 65536;
  }
  return { tipos, ancho, alto };
}

test('cada oficio tiene en el repo sus fotos, y su video si dice tenerlo: sin sonido y del tamano que esperan los estilos', async () => {
  const estilos = await readFile(path.join(FUENTE, 'estilos', 'corto.css'), 'utf8');
  // El alto del video en la franja, en por ciento del alto de la foto.
  const corte = Number(/\.foto__video \{[^}]*?height: ([\d.]+)%/.exec(estilos)?.[1]);
  assert.ok(corte > 50 && corte < 90, 'los estilos dicen hasta donde llega la toma viva');
  for (const oficio of corto.oficios) {
    for (const foto of ['trabajo-720.avif', 'trabajo-720.webp', 'trabajo-1080.avif', 'trabajo-1080.webp']) {
      await access(path.join(FUENTE, 'recursos', 'comercial', `${oficio.clave}-${foto}`));
    }
    // Las del cartel las dice el dato de cada oficio: su retrato para el celular, a dos anchos, y la de la tarjeta.
    for (const foto of ['540.avif', '540.webp', '840.avif', '840.webp']) {
      await access(path.join(FUENTE, 'recursos', `${oficio.cartel.tu.foto}-${foto}`));
    }
    for (const foto of ['600.avif', '600.webp']) {
      await access(path.join(FUENTE, 'recursos', `${oficio.cartel.tarjeta}-${foto}`));
    }
    if (!oficio.video) continue;
    const video = await readFile(path.join(FUENTE, 'recursos', 'comercial', `${oficio.clave}-trabajo.mp4`));
    const { tipos, ancho, alto } = pistasDe(video);
    assert.deepEqual(tipos, ['vide'], `${oficio.clave}: el video trae solo su pista de imagen, sin sonido`);
    // El video cubre la foto (1536 por 2752) de arriba hasta el corte: si su forma no es esa, se veria estirado.
    const cubre = ((alto / ancho) * (1536 / 2752) * 100).toFixed(1);
    assert.equal(cubre, corte.toFixed(1), `${oficio.clave}: el video mide ${ancho} por ${alto}`);
    assert.ok(video.length <= 160 * 1024, `${oficio.clave}: el video pesa ${Math.round(video.length / 1024)} KB`);
  }
});

test('las fotos del cartel pesan poco en celular: 60 KB o menos cada una, y la que mas se pide, 15 o menos', async () => {
  for (const oficio of corto.oficios) {
    for (const foto of ['540.avif', '840.avif', '540.webp', '840.webp']) {
      const archivo = await readFile(path.join(FUENTE, 'recursos', `${oficio.cartel.tu.foto}-${foto}`));
      const kb = Math.round(archivo.length / 1024);
      assert.ok(archivo.length <= 60 * 1024, `${oficio.cartel.tu.foto}-${foto}: ${kb} KB`);
      // En celular viajan las tres de entrada (se ve una al azar): la chica en AVIF tiene que ser de veras chica.
      if (foto === '540.avif') assert.ok(archivo.length <= 15 * 1024, `${oficio.cartel.tu.foto}-${foto}: ${kb} KB`);
    }
  }
});

test('en las carpetas del corto no queda nada que la pagina ya no use', async () => {
  const claves = new Set(corto.oficios.map((/** @type {{ clave: string }} */ oficio) => oficio.clave));
  const deOficio = /^([a-z]+)-(trabajo-(720|1080)\.(avif|webp)|trabajo\.mp4)$/;
  for (const archivo of await readdir(path.join(FUENTE, 'recursos', 'comercial'))) {
    if (archivo === 'referencia-unas.webp') continue;
    const [, clave = ''] = deOficio.exec(archivo) ?? [];
    assert.ok(claves.has(clave), `comercial/${archivo} no es de ningun oficio`);
  }
  const deVida = /^([a-z]+)-(vida-tarjeta-600|tu-(540|840))\.(avif|webp)$/;
  for (const archivo of await readdir(path.join(FUENTE, 'recursos', 'cartel'))) {
    const [, clave = ''] = deVida.exec(archivo) ?? [];
    assert.ok(claves.has(clave), `cartel/${archivo} no es de ningun oficio`);
  }
});

test('la pagina armada trae el cartel antes que el corto, y el corto no es para lectores ni para el teclado', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const seccion = /<section class="corto"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  assert.ok(seccion, 'la seccion del inicio');
  // El guion viaja escrito en la seccion, igual al de los datos.
  assert.deepEqual(leerGuion(/ data-guion="([^"]*)"/.exec(seccion)?.[1]), GUION);
  assert.match(seccion, new RegExp(` data-cuadro="${MOMENTOS[0]}"`));
  // El contenido de verdad es el cartel: va primero y trae el unico h1, la frase y los dos enlaces.
  const cartel = seccion.indexOf('class="cartel"');
  const cine = seccion.indexOf('class="corto__cine"');
  assert.ok(cartel > 0 && cine > cartel, 'el cartel va antes que las capas del corto');
  const delCartel = seccion.slice(cartel, cine);
  assert.match(delCartel, /<h1 class="cartel__titulo" id="titulo-inicio">Despreocúpate</);
  assert.ok(delCartel.includes(corto.cartel.frase));
  assert.match(
    delCartel,
    /<a class="boton boton--sello" href="https:\/\/alta\.prompt-maestro\.com\/" data-lugar="pelicula">/,
  );
  assert.match(delCartel, /<a class="enlace" href="#citas" data-lugar="pelicula">Vívelo tú<\/a>/);
  assert.equal(html.match(/<h1\b/g)?.length, 1, 'un solo h1 en la pagina');
  // Las capas del corto son decorativas: escondidas para lectores, sin enlaces ni botones adentro.
  const delCine = seccion.slice(cine);
  assert.match(delCine, /^class="corto__cine"[^>]* aria-hidden="true"/);
  assert.doesNotMatch(delCine, /<(a|button|input|h[1-6])\b/);
  // Los videos no se piden al cargar, no traen controles ni arrancan solos, y callados.
  const videos = delCine.match(/<video\b[^>]*>/g) ?? [];
  assert.equal(videos.length, corto.oficios.filter((/** @type {{ video: boolean }} */ o) => o.video).length);
  for (const video of videos) {
    assert.match(video, / muted /);
    assert.match(video, / playsinline /);
    assert.match(video, / preload="none" /);
    assert.match(video, / tabindex="-1" /);
    assert.match(video, / data-src="[^"]+\.mp4"/);
    assert.doesNotMatch(video, / (src|autoplay|controls|loop)\b/);
  }
  // En celular el corto no existe: sus fotos de trabajo no se piden si no se pintan.
  const tomas = delCine.match(/<img class="foto__toma"[^>]*>/g) ?? [];
  assert.equal(tomas.length, corto.oficios.length * 2, 'una foto por franja, con luz fria y con luz calida');
  for (const toma of tomas) assert.match(toma, / loading="lazy" /);
  // Lo que solo sirve con JavaScript llega guardado: sin el, no hay botones que no hacen nada. Y el cartel no trae
  // mas boton que el que corre el corto.
  for (const guardado of ['data-corto-control', 'data-corto-ver']) {
    assert.match(seccion, new RegExp(`<[^>]* ${guardado}[^>]* hidden[ >]`), guardado);
  }
  assert.equal(delCartel.match(/<button\b/g)?.length, 1, 'el unico boton del cartel es el del corto');
  // Las tarjetas de "su tiempo" son de las pantallas anchas: esperan, asi un celular (que no las pinta) no las pide.
  const tarjetas = delCartel.match(/<img class="vida__foto"[^>]*>/g) ?? [];
  assert.equal(tarjetas.length, corto.oficios.length);
  for (const tarjeta of tarjetas) assert.match(tarjeta, / loading="lazy"/);
  // En pantallas anchas se adelantan las tomas del corto; en celular no se adelanta nada (el oficio sale al azar).
  const adelantos = html.match(/<link rel="preload" as="image"[^>]*>/g) ?? [];
  assert.equal(adelantos.length, corto.oficios.length);
  for (const adelanto of adelantos) {
    assert.ok(adelanto.includes(` media="${ANCHA}" `), adelanto);
    assert.match(adelanto, /-trabajo-720\.avif/);
  }
});

test('el corto viaja escrito en la pagina: la marca en su halo, la cuenta de cada celular y lo que hizo el agente con su sello', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const cine = /class="corto__cine"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  assert.ok(cine, 'las capas del corto');
  // La marca: su halo va antes que el logotipo, el nombre y la frase, que quedan encima.
  const marca = /<div class="corto__marca">[\s\S]*?<p class="corto__frase">[^<]*<\/p>/.exec(cine)?.[0] ?? '';
  assert.match(marca, /^<div class="corto__marca">\s*<div class="halo">/);
  for (const parte of ['halo__rayos', 'halo__aura', 'halo__orbita', 'halo__disco'])
    assert.ok(marca.includes(parte), parte);
  assert.ok(marca.includes(`<p class="corto__frase">${corto.marca.frase}</p>`));
  // Cada celular lleva la cuenta de su oficio, y ninguna se repite.
  const cuentas = cine.match(/<b data-corto-cuenta[^>]*>\d+<\/b>/g) ?? [];
  assert.equal(cuentas.length, corto.oficios.length);
  for (const [lugar, cuenta] of cuentas.entries()) {
    const { base, tope } = corto.oficios[lugar].cuenta;
    assert.equal(cuenta, `<b data-corto-cuenta data-base="${base}" data-tope="${tope}">${tope}</b>`);
  }
  const topes = corto.oficios.map((/** @type {{ cuenta: { tope: number } }} */ oficio) => oficio.cuenta.tope);
  assert.equal(new Set(topes).size, topes.length, 'ningun celular marca lo mismo que otro');
  // Lo que hizo el agente: una conversacion por oficio, en su orden, cada una con su frase y su sello.
  const tratos = cine.match(/<div class="trato">[\s\S]*?<\/div>/g) ?? [];
  assert.equal(tratos.length, corto.oficios.length);
  for (const [lugar, trato] of tratos.entries()) {
    const oficio = corto.oficios[lugar];
    const texto = trato.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const dice of [oficio.trato.quien, oficio.trato.responde, corto.cartel.tuAgente, oficio.trato.hizo]) {
      assert.ok(texto.includes(dice), `${oficio.clave}: falta "${dice}"`);
    }
    if (oficio.trato.texto) assert.ok(texto.includes(oficio.trato.texto), `${oficio.clave}: el mensaje que entro`);
    assert.equal(trato.includes('class="dice__foto"'), oficio.trato.foto, `${oficio.clave}: la foto`);
    // El orden de lo que entra: el mensaje, lo que contesto el agente y la frase con su sello.
    const orden = ['class="dice"', 'class="dice dice--agente"', 'class="hizo"', 'class="sello sello--cita"'];
    const lugares = orden.map((pieza) => trato.indexOf(pieza));
    assert.deepEqual(
      [...lugares].sort((a, b) => a - b),
      lugares,
      `${oficio.clave}: el orden de la conversacion`,
    );
    assert.ok(
      lugares.every((uno) => uno >= 0),
      `${oficio.clave}: le falta una pieza`,
    );
    assert.match(
      trato,
      /<svg class="sello sello--cita"[^>]* role="img" aria-label="Cita garantizada: anticipo pagado"/,
    );
    assert.match(trato, />CITA GARANTIZADA<\/text>/);
    assert.match(trato, />ANTICIPO PAGADO<\/text>/);
  }
  // La foto que manda una clienta se ve en su aviso, y solo va donde el dato dice que hay foto.
  const fotos = cine.match(/class="aviso__mira"/g) ?? [];
  const conFoto = corto.oficios.flatMap((/** @type {{ llegan: object[], avisos: object[] }} */ oficio) =>
    [...oficio.llegan, ...oficio.avisos].filter((/** @type {any} */ aviso) => aviso.foto),
  );
  assert.equal(fotos.length, conFoto.length);
  assert.ok(conFoto.length >= 1, 'al menos una clienta manda una foto');
});

test('"Tu y tu agente" viaja escrito en la pagina: una escena por oficio, la primera a la vista y las demas guardadas', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const escenas = html.match(/<figure class="duo__escena"[\s\S]*?<\/figure>/g) ?? [];
  assert.equal(escenas.length, corto.oficios.length);
  for (const [lugar, escena] of escenas.entries()) {
    const oficio = corto.oficios[lugar];
    const abre = /^<figure[^>]*>/.exec(escena)?.[0] ?? '';
    assert.ok(abre.includes(` data-duo="${oficio.clave}"`), abre);
    assert.ok(abre.includes(` aria-label="${corto.cartel.ejemplo}"`), abre);
    // Sin JavaScript se ve la primera; las otras no se pintan ni se leen.
    assert.equal(/ hidden>$/.test(abre), lugar > 0, `${oficio.clave}: ${abre}`);
    // Su retrato: se pide de entrada (sin esperar) y con prisa, en AVIF y con respaldo en WebP, con su medida
    // escrita, y solo donde el cartel lo pinta: en una pantalla ancha no se pide.
    const foto = /<img class="duo__foto"[^>]*>/.exec(escena)?.[0] ?? '';
    assert.ok(foto.includes(` alt="${oficio.cartel.tu.alt}"`), foto);
    assert.match(foto, / width="540" height="720" /);
    assert.match(foto, / fetchpriority="high"/);
    assert.doesNotMatch(foto, / loading=/);
    // Y lleva la marca con la que el navegador avisa que ya la pinto: a ese aviso esperan las piezas de la pagina.
    assert.match(foto, / elementtiming="retrato"/);
    assert.match(foto, / src="data:image\/gif;base64,[^"]+"/);
    const fuentes = escena.match(/<source [^>]*>/g) ?? [];
    assert.equal(fuentes.length, 2);
    assert.match(fuentes[0] ?? '', / type="image\/avif" /);
    for (const [cual, fuente] of fuentes.entries()) {
      const tipo = cual === 0 ? 'avif' : 'webp';
      assert.ok(fuente.includes(` media="${ESTRECHA}" `), fuente);
      assert.ok(fuente.includes(`${oficio.cartel.tu.foto}-540.${tipo} 540w`), fuente);
      assert.ok(fuente.includes(`${oficio.cartel.tu.foto}-840.${tipo} 840w`), fuente);
      assert.match(fuente, / sizes="[^"]+"/);
    }
    // La conversacion es texto de verdad, y nada de la escena es una parada del teclado.
    const texto = escena.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const { charla } = oficio.cartel;
    for (const dice of [
      corto.cartel.tu,
      corto.cartel.enLoTuyo,
      corto.cartel.tuAgente,
      corto.cartel.agenteHace,
      charla.negocio,
      corto.cartel.whatsapp,
      `${corto.cartel.teEscriben} ${charla.entra}`,
      `${corto.cartel.contesta} ${charla.responde}`,
      `${corto.pagoAprobado} ${charla.anticipo}`,
      oficio.cartel.cuando,
      oficio.cartel.quien,
    ]) {
      assert.ok(texto.includes(dice), `${oficio.clave}: falta "${dice}"`);
    }
    assert.doesNotMatch(escena, /<(a|button|input|video)\b|tabindex/);
    assert.match(escena, /<svg class="sello"[^>]* role="img" aria-label="Garantizada: anticipo pagado"/);
  }
  // Ya no van en el cartel: ni el contador en ceros ni los botones para cambiar de oficio.
  const cartel = /class="cartel"[\s\S]*?class="corto__cine"/.exec(html)?.[0] ?? '';
  assert.doesNotMatch(cartel, /sin contestar|data-elegir|data-cartel-oficios/);
  // Quien elige es arranque.js, antes de pintar: su etiqueta le dice los oficios que hay, en su orden.
  const claves = corto.oficios.map((/** @type {{ clave: string }} */ oficio) => oficio.clave).join(' ');
  assert.match(html, new RegExp(`<script src="[^"]*/js/arranque\\.js" data-oficios="${claves}"></script>`));
  assert.ok(html.indexOf('js/arranque.js') < html.indexOf('rel="stylesheet"'), 'arranque.js va antes que los estilos');
});

test('las piezas de la pagina solo se adelantan en pantallas anchas: en celular llegan despues del cartel', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const adelantadas = html.match(/<link rel="modulepreload"[^>]*>/g) ?? [];
  assert.ok(adelantadas.length >= 8);
  for (const pieza of adelantadas) assert.ok(pieza.includes(` media="${ANCHA}" `), pieza);
  // Quien las trae, cuando toca, es pagina.js, que si llega de entrada.
  assert.match(html, /<script type="module" src="[^"]*\/js\/pagina\.js"><\/script>/);
  const pagina = await readFile(path.join(FUENTE, 'js', 'pagina.js'), 'utf8');
  assert.ok(pagina.includes(`const ANCHA = '${ANCHA}';`), 'pagina.js pregunta por la misma pantalla ancha');
});
