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
  empiezaEn,
  entradaDeLaToma,
  leerGuion,
  momentoEn,
  nuevoReloj,
  parar,
  punto,
  siguienteOficio,
  sinContestar,
  zona,
} from '../../fuente/js/corto.js';
import { armarSitio } from '../../herramientas/armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUENTE = path.join(RAIZ, 'fuente');
const corto = JSON.parse(await readFile(path.join(FUENTE, 'datos', 'corto.json'), 'utf8'));
/** Los ejemplos de la demostracion: el cartel cuenta la misma historia que ella, con el mismo negocio y anticipo. */
const giros = JSON.parse(await readFile(path.join(FUENTE, 'datos', 'giros.json'), 'utf8'));
/** La forma de la foto de pie de cada oficio (1536 por 2752): de ella se recorta el retrato del cartel. */
const FORMA_DE_LA_FOTO = 1536 / 2752;
/** La forma de la escena de cada oficio, acostada (5504 por 3072): sobre ella va la toma viva del corto. */
const FORMA_DE_LA_ESCENA = 5504 / 3072;
/** Las mismas preguntas que hacen los estilos: donde va "Tu y tu agente" y donde corre el corto. */
const ESTRECHA = 'not all and (min-width: 480px) and (min-aspect-ratio: 1/1)';
const ANCHA = '(min-width: 900px) and (min-aspect-ratio: 1/1)';
/** @type {import('../../fuente/js/corto.js').Momento[]} */
const GUION = corto.guion.map((/** @type {{ clave: string, dura: number }} */ { clave, dura }) => ({ clave, dura }));
const MOMENTOS = ['presion', 'vibra', 'avalancha', 'barrido', 'marca', 'agente', 'todos'];

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

test('una zona de la foto se lee en fracciones, y lo que no es una zona o se sale de la foto no pasa', () => {
  assert.deepEqual(zona('52 81 31 14'), { x: 0.52, y: 0.81, ancho: 0.31, alto: 0.14 });
  assert.deepEqual(zona(' 42  0 58 82.5 '), { x: 0.42, y: 0, ancho: 0.58, alto: 0.825 });
  // Puede llegar justo a la orilla de la foto, pero no pasarse.
  assert.deepEqual(zona('42 0 58 100'), { x: 0.42, y: 0, ancho: 0.58, alto: 1 });
  for (const mala of ['', '52 81', '52 81 31', '52 81 31 14 2', 'a b c d', '52 81 0 14', '52 81 31 0', '80 10 31 14']) {
    assert.equal(zona(mala), null, mala);
  }
  for (const mala of ['10 90 31 14', '-2 10 31 14', undefined, null]) assert.equal(zona(mala), null, String(mala));
});

test('al verlo de nuevo toca el oficio que sigue, dando la vuelta', () => {
  const lista = ['unas', 'dentista', 'medico'];
  assert.equal(siguienteOficio(lista, 'unas'), 'dentista');
  assert.equal(siguienteOficio(lista, 'dentista'), 'medico');
  assert.equal(siguienteOficio(lista, 'medico'), 'unas');
  // Quien repite una y otra vez los ve todos antes de volver al primero.
  const vistos = [];
  let va = 'dentista';
  for (let vez = 0; vez < lista.length; vez++) {
    vistos.push(va);
    va = siguienteOficio(lista, va);
  }
  assert.deepEqual([...vistos].sort(), [...lista].sort());
  assert.equal(va, 'dentista');
  // Uno que no esta en la lista da paso al primero; con un solo oficio, o sin lista, se queda el que habia.
  assert.equal(siguienteOficio(lista, 'nutriologa'), 'unas');
  assert.equal(siguienteOficio(['unas'], 'unas'), 'unas');
  assert.equal(siguienteOficio([], 'unas'), 'unas');
});

test('cada momento empieza donde termina el anterior', () => {
  assert.equal(empiezaEn(TRES, 'uno'), 0);
  assert.equal(empiezaEn(TRES, 'dos'), 1000);
  assert.equal(empiezaEn(TRES, 'tres'), 3000);
  // Uno que el guion no trae "empieza" cuando el corto termina.
  assert.equal(empiezaEn(TRES, 'cuatro'), 6000);
  assert.equal(empiezaEn([], 'uno'), 0);
});

test('la toma viva entra a media pasada, justo para terminar a su hora; si alcanza de sobra, desde el principio', () => {
  // Dura 10 segundos y faltan 6 para que tenga que haber terminado: entra en su segundo 4.
  assert.equal(entradaDeLaToma(10_000, 6000), 4000);
  assert.equal(entradaDeLaToma(10_000, 1), 9999);
  // Le sobra tiempo, ya es tarde o no se sabe cuanto dura (todavia no llega): desde su principio.
  for (const [dura, falta] of [
    [10_000, 10_000],
    [10_000, 25_000],
    [10_000, 0],
    [10_000, -300],
    [0, 5000],
    [Number.NaN, 5000],
    [10_000, Number.NaN],
  ]) {
    assert.equal(entradaDeLaToma(Number(dura), Number(falta)), 0, `${dura}, ${falta}`);
  }
  // Con el guion de la pagina y una toma de 10 segundos, la pasada que sigue al relevo cubre toda la conversacion
  // del agente y lo que tarda en taparla el cierre.
  const dura = 10_000;
  const fundido = 900;
  const termina = empiezaEn(GUION, 'agente') - fundido;
  const entra = entradaDeLaToma(dura, termina - empiezaEn(GUION, 'barrido'));
  assert.ok(entra > 0 && entra < dura, `entra en ${entra}`);
  assert.ok(termina + fundido + dura >= empiezaEn(GUION, 'todos') + 1400, 'la pasada nueva llega hasta el cierre');
});

test('el guion de la pagina: siete momentos en su orden, de 26 a 30 segundos, y los letreros de siempre', () => {
  assert.deepEqual(
    GUION.map((momento) => momento.clave),
    MOMENTOS,
  );
  for (const momento of GUION) assert.ok(momento.dura >= 1000, momento.clave);
  const total = duracion(GUION);
  assert.ok(total >= 26_000 && total <= 30_000, `dura ${total} ms`);
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
    todos: 'Cada negocio, su propio agente.',
  });
  assert.equal(corto.marca.frase, 'Deja que uno de nuestros agentes virtuales conteste por ti.');
  // El cierre: debajo de su letrero va un renglon chico, y cada franja dice de que negocio es su agente.
  assert.equal(
    corto.todos.baja,
    'Se arma con tus servicios, tus precios y tus horarios. Hoy para uñas, dentistas y médicos; pronto, más oficios.',
  );
  assert.equal(corto.todos.agenteDe, 'Agente de');
  for (const texto of [...Object.values(letreros), corto.todos.baja, corto.todos.agenteDe]) {
    assert.doesNotMatch(String(texto), /asistente|—/i, String(texto));
  }
});

test('el momento del agente dura lo que tarda su conversacion en entrar, paso a paso, y deja ver el sello un rato', async () => {
  const estilos = await readFile(path.join(FUENTE, 'estilos', 'corto.css'), 'utf8');
  // Cuando entra cada pieza lo dicen los estilos, en orden: el mensaje, lo que contesto, el pago, el papel y el sello.
  const pasos = ['--llega-mensaje', '--llega-respuesta', '--llega-pago', '--llega-papel', '--cae-sello'].map((paso) =>
    Number(new RegExp(`${paso}: (\\d+)ms;`).exec(estilos)?.[1]),
  );
  for (const paso of pasos) assert.ok(paso > 0, 'los estilos dicen cuando entra cada pieza');
  assert.deepEqual(
    [...pasos].sort((a, b) => a - b),
    pasos,
    'entran en su orden',
  );
  assert.equal(new Set(pasos).size, pasos.length, 'una tras otra, nunca dos a la vez');
  // Y cada pieza usa su paso: si un estilo dejara de leerlo, la conversacion entraria de golpe.
  for (const [pieza, paso] of [
    ['\\.trato > \\*', '--llega-mensaje'],
    ['\\.trato > \\.dice--agente', '--llega-respuesta'],
    ['\\.trato > \\.pago', '--llega-pago'],
    ['\\.trato > \\.hizo', '--llega-papel'],
    ['\\.hizo \\.sello', '--cae-sello'],
  ]) {
    assert.match(estilos, new RegExp(`${pieza} \\{[^}]*var\\(${paso}\\)`), `${pieza} entra con ${paso}`);
  }
  const cae = Number(/sello-cae (\d+)ms [^;]*var\(--cae-sello\)/.exec(estilos)?.[1]);
  assert.ok(cae > 0, 'los estilos dicen lo que tarda en caer el sello');
  const [, , , , sello = 0] = pasos;
  const agente = GUION.find((momento) => momento.clave === 'agente')?.dura ?? 0;
  // Despues de que cae el sello se queda quieto segundo y medio, por lo menos; y el momento no se alarga de mas.
  const quieto = agente - (sello + cae);
  assert.ok(quieto >= 1500, `el sello cae a los ${sello + cae} ms y el momento dura ${agente}`);
  assert.ok(quieto <= 3000, `el momento dura ${agente} ms: ${quieto} despues del sello`);
});

test('cada oficio trae lo suyo completo: a donde mira la camara, su cuenta, sus avisos, lo que hizo el agente y su cita', () => {
  assert.ok(corto.oficios.length >= 3);
  const claves = corto.oficios.map((/** @type {{ clave: string }} */ oficio) => oficio.clave);
  assert.equal(new Set(claves).size, claves.length, 'sin oficios repetidos');
  for (const oficio of corto.oficios) {
    // Su escena, acostada: a donde mira la camara, donde esta el celular de la mesa y que zona ocupa la toma viva.
    assert.ok(punto(oficio.mira.persona), `${oficio.clave}: a donde mira la camara al trabajar`);
    const celular = zona(oficio.mira.celular);
    const viva = zona(oficio.mira.viva);
    assert.ok(celular, `${oficio.clave}: donde esta el celular y cuanto mide`);
    assert.ok(viva, `${oficio.clave}: la zona de la toma viva`);
    // El celular es siempre el de la foto: la toma viva termina arriba de el. Y quien trabaja queda dentro de ella.
    assert.ok(viva.y + viva.alto <= celular.y + 0.03, `${oficio.clave}: la toma viva se mete en el celular`);
    const persona = punto(oficio.mira.persona) ?? { x: -1, y: -1 };
    assert.ok(
      persona.x > viva.x && persona.x < viva.x + viva.ancho && persona.y > viva.y && persona.y < viva.y + viva.alto,
      `${oficio.clave}: quien trabaja queda fuera de la toma viva`,
    );
    // Sus manos tambien: son lo que se mueve en la toma viva, y lo que la conversacion del agente nunca debe tapar
    // (lo cuidan las pruebas de navegador).
    const manos = punto(oficio.mira.manos) ?? { x: -1, y: -1 };
    assert.ok(
      manos.x > viva.x && manos.x < viva.x + viva.ancho && manos.y > viva.y && manos.y < viva.y + viva.alto,
      `${oficio.clave}: sus manos quedan fuera de la toma viva`,
    );
    // Y su foto de pie, la de la pantalla dividida del cierre.
    assert.ok(punto(oficio.mira.dePie), `${oficio.clave}: a donde mira la camara en su foto de pie`);
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
    // Lo que hizo el agente: el mensaje que entro, lo que contesto (y de donde lo saco), el pago aprobado y, en una
    // frase, lo que resolvio, con la cita en la agenda. La frase dice el anticipo que cobro, porque encima le cae el
    // sello de anticipo pagado; y la pagina dice "agente".
    const { trato } = oficio;
    assert.ok(trato.quien && trato.inicial, `${oficio.clave}: a quien le contesto`);
    assert.ok(trato.texto || trato.voz, `${oficio.clave}: el mensaje que entro no dice nada`);
    assert.ok(trato.responde && trato.hizo, `${oficio.clave}: falta lo que contesto o lo que hizo el agente`);
    assert.match(trato.hizo, /cobró \$\d+ de anticipo\.$/, `${oficio.clave}: la frase dice el anticipo que cobro`);
    // El pago aprobado es ese mismo anticipo, ni un peso mas ni uno menos.
    const cobro = /cobró (\$\d+) de anticipo/.exec(trato.hizo)?.[1] ?? 'sin anticipo';
    assert.match(trato.pago, /^\$\d+ · Mercado Pago$/, `${oficio.clave}: el pago`);
    assert.equal(trato.pago.split(' ')[0], cobro, `${oficio.clave}: el pago aprobado no es el anticipo que cobro`);
    // La cita quedo en la agenda a la hora que ofrecio el agente.
    assert.match(trato.agenda, /^En tu calendario: \S.*\d{1,2}:\d{2} [ap]m$/, `${oficio.clave}: la agenda`);
    const hora = /\d{1,2}:\d{2} [ap]m/.exec(trato.agenda)?.[0] ?? 'sin hora';
    assert.ok(trato.responde.includes(hora), `${oficio.clave}: la agenda dice otra hora que la que ofrecio el agente`);
    // De donde salio lo que contesto: de la informacion de ese negocio.
    assert.match(trato.fuente, /^\p{Lu}.* de tu \p{L}+$/u, `${oficio.clave}: de donde salio la respuesta`);
    assert.doesNotMatch(
      [trato.responde, trato.fuente, trato.pago, trato.hizo, trato.agenda].join(' '),
      /asistente/i,
      `${oficio.clave}: la pagina dice "agente"`,
    );
    const { cartel } = oficio;
    assert.ok(cartel.tarjeta, `${oficio.clave}: la foto de su tarjeta`);
    assert.ok(cartel.alt && cartel.cuando && cartel.quien, `${oficio.clave}: el cartel`);
    assert.ok(cartel.encuadre >= 0 && cartel.encuadre <= 100, `${oficio.clave}: encuadre`);
  }
});

test('la cita que agenda el agente en el corto no es la de su cartel: nunca dos citas el mismo dia y a la misma hora', () => {
  const SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  // Que dia es hoy lo dice la pantalla del celular del corto: con eso se entienden "hoy" y "mañana".
  const hoy = SEMANA.indexOf(corto.pantalla.dia.split(',')[0]);
  assert.ok(hoy >= 0, 'la pantalla del celular dice que dia es');
  const relativos = new Map([
    ['hoy', hoy],
    ['mañana', (hoy + 1) % SEMANA.length],
  ]);
  /**
   * El dia (su lugar en la semana) y la hora de una cita, como la dice el corto ("viernes, 5:00 pm", "hoy, 5:30 pm")
   * o el cartel ("Sábado · 11:00 am").
   * @param {string} texto
   */
  const cita = (texto) => {
    const [, dia = '', hora = ''] = /^(\p{L}+) ?[,·] (\d{1,2}:\d{2} [ap]m)$/u.exec(texto.toLowerCase()) ?? [];
    return { dia: relativos.get(dia) ?? SEMANA.indexOf(dia), hora };
  };
  // La cuenta distingue dos citas que no chocan y reconoce la misma dicha de dos maneras.
  assert.notDeepEqual(cita('viernes, 5:00 pm'), cita('Sábado · 11:00 am'));
  assert.deepEqual(cita('sábado, 11:00 am'), cita('Sábado · 11:00 am'));
  assert.deepEqual(cita('mañana, 10:00 am'), cita(`${SEMANA[(hoy + 1) % SEMANA.length]} · 10:00 am`));
  for (const oficio of corto.oficios) {
    const delCorto = cita(oficio.trato.agenda.replace('En tu calendario: ', ''));
    const delCartel = cita(oficio.cartel.cuando);
    for (const una of [delCorto, delCartel]) {
      assert.ok(una.dia >= 0 && una.hora, `${oficio.clave}: a una de sus citas no se le entiende el dia o la hora`);
    }
    assert.notDeepEqual(
      delCorto,
      delCartel,
      `${oficio.clave}: el corto agenda "${oficio.trato.agenda}" y su cartel ya tiene una cita el "${oficio.cartel.cuando}"`,
    );
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

/**
 * Lo que dura un video MP4, en milisegundos. Lo dice su caja "mvhd": la escala del tiempo y, en esa escala, cuanto
 * dura. Cero si no se le encuentra.
 * @param {Buffer} archivo
 */
function duraElVideo(archivo) {
  const i = archivo.indexOf('mvhd', 0, 'latin1');
  if (i < 0) return 0;
  // La version 1 de la caja guarda sus fechas y su duracion en 64 bits; la 0, en 32.
  const larga = archivo.readUInt8(i + 4) === 1;
  const escala = archivo.readUInt32BE(i + (larga ? 24 : 16));
  const dura = larga ? Number(archivo.readBigUInt64BE(i + 28)) : archivo.readUInt32BE(i + 20);
  return escala > 0 ? (dura / escala) * 1000 : 0;
}

test('con lo que de verdad dura cada toma viva, su unico relevo con luz calida cae mientras la marca la tapa: nunca a media conversacion del agente', async () => {
  const vista = await readFile(path.join(FUENTE, 'js', 'corto-vista.js'), 'utf8');
  const estilos = await readFile(path.join(FUENTE, 'estilos', 'corto.css'), 'utf8');
  // Lo que tarda la toma en fundirse con su foto y el aire que deja antes de la conversacion lo dice el codigo de la
  // pagina; lo que tarda el cierre en tapar la escena (su fundido), los estilos.
  const fundido = Number(/const FUNDIDO_DEL_VIDEO = (\d+);/.exec(vista)?.[1]);
  const aire = Number(/const AIRE_DEL_RELEVO = (\d+);/.exec(vista)?.[1]);
  const cierre = Number(/\[data-momento="todos"\] \.todos \{\s*transition: opacity (\d+)ms/.exec(estilos)?.[1]);
  for (const medida of [fundido, aire, cierre]) assert.ok(medida > 0, 'el codigo y los estilos dicen sus tiempos');
  const [barre = 0, marca = 0, agente = 0, todos = 0] = ['barrido', 'marca', 'agente', 'todos'].map((clave) =>
    empiezaEn(GUION, clave),
  );
  assert.ok(barre < marca && marca < agente && agente < todos && todos < duracion(GUION));
  const conVideo = corto.oficios.filter((/** @type {{ video: boolean }} */ oficio) => oficio.video);
  assert.ok(conVideo.length >= 1, 'al menos un oficio trae toma viva');
  for (const oficio of conVideo) {
    const dura = duraElVideo(await readFile(path.join(FUENTE, 'recursos', 'comercial', `${oficio.clave}-escena.mp4`)));
    assert.ok(dura >= 1000, `${oficio.clave}: no se pudo leer lo que dura su video`);
    // Como en corto-vista.js: al empezar el barrido la toma se muda a la luz calida y entra a media pasada; cada vez
    // que termina una pasada se funde con su foto y, pasado el fundido, vuelve a empezar.
    const entra = entradaDeLaToma(dura, agente - fundido - aire - barre);
    // Cuando empieza cada relevo, hasta que el cierre ya tapo la escena: de ahi en adelante nadie lo ve.
    /** @type {number[]} */
    const relevos = [];
    for (let termina = barre + dura - entra; termina < todos + cierre; termina += fundido + dura) relevos.push(termina);
    const dice = `${oficio.clave}: su toma dura ${dura} ms y se releva a los ${relevos.join(' y a los ')} ms`;
    assert.equal(relevos.length, 1, `${dice}: debe ser una sola vez`);
    const [relevo = 0] = relevos;
    assert.ok(relevo >= marca, `${dice}: antes de que la marca la tape (${marca} ms)`);
    assert.ok(relevo + fundido <= agente, `${dice}: la conversacion del agente empieza a los ${agente} ms`);
  }
});

test('cada oficio tiene en el repo sus fotos, y su toma viva si dice tenerla: sin sonido, de la forma de su zona y de poco peso', async () => {
  const comercial = path.join(FUENTE, 'recursos', 'comercial');
  for (const oficio of corto.oficios) {
    // Su escena, acostada, a dos anchos y en dos formatos; y su foto de pie, la del cierre.
    for (const foto of ['escena-1600', 'escena-2560', 'trabajo-720', 'trabajo-1080']) {
      for (const tipo of ['avif', 'webp']) await access(path.join(comercial, `${oficio.clave}-${foto}.${tipo}`));
    }
    // La escena es lo mas grande de la pantalla ancha: la que mas se pide, 90 KB o menos; la grande, 120 o menos.
    for (const [foto, tope] of /** @type {[string, number][]} */ ([
      ['escena-1600.avif', 90],
      ['escena-2560.avif', 120],
    ])) {
      const { length } = await readFile(path.join(comercial, `${oficio.clave}-${foto}`));
      assert.ok(length <= tope * 1024, `${oficio.clave}-${foto}: ${Math.round(length / 1024)} KB`);
    }
    // Las del cartel las dice el dato de cada oficio: su retrato para el celular, a dos anchos, y la de la tarjeta.
    for (const foto of ['540.avif', '540.webp', '840.avif', '840.webp']) {
      await access(path.join(FUENTE, 'recursos', `${oficio.cartel.tu.foto}-${foto}`));
    }
    for (const foto of ['600.avif', '600.webp']) {
      await access(path.join(FUENTE, 'recursos', `${oficio.cartel.tarjeta}-${foto}`));
    }
    if (!oficio.video) continue;
    const video = await readFile(path.join(comercial, `${oficio.clave}-escena.mp4`));
    const { tipos, ancho, alto } = pistasDe(video);
    assert.deepEqual(tipos, ['vide'], `${oficio.clave}: el video trae solo su pista de imagen, sin sonido`);
    // El video es el recorte de su zona en la escena: los estilos lo ponen ahi mismo, y si su forma no fuera la de
    // la zona se veria estirado o corrido.
    const parte = zona(oficio.mira.viva) ?? { ancho: 1, alto: 1 };
    const forma = (parte.ancho / parte.alto) * FORMA_DE_LA_ESCENA;
    assert.ok(
      Math.abs(ancho / alto / forma - 1) < 0.01,
      `${oficio.clave}: el video mide ${ancho} por ${alto} y su zona pide una forma de ${forma.toFixed(3)}`,
    );
    // En cada visita se pide uno solo: 480 KB o menos.
    assert.ok(video.length <= 480 * 1024, `${oficio.clave}: el video pesa ${Math.round(video.length / 1024)} KB`);
  }
});

test('los estilos ponen la toma viva en su zona de la foto, y la funden con ella en sus orillas', async () => {
  const estilos = await readFile(path.join(FUENTE, 'estilos', 'corto.css'), 'utf8');
  const video = /\.foto__video \{[^}]*\}/.exec(estilos)?.[0] ?? '';
  for (const medida of [
    'top: calc(var(--vy) * 100%);',
    'left: calc(var(--vx) * 100%);',
    'width: calc(var(--vw) * 100%);',
    'height: calc(var(--vh) * 100%);',
    'mask-image: var(--mascara);',
    'mask-composite: intersect;',
  ]) {
    assert.ok(video.includes(medida), medida);
  }
  // Sumar un oficio es cosa de datos: ningun estilo ni codigo del inicio nombra uno.
  const codigo = await Promise.all(
    ['corto.js', 'corto-vista.js', 'arranque.js'].map((archivo) => readFile(path.join(FUENTE, 'js', archivo), 'utf8')),
  );
  const sinComentarios = (/** @type {string} */ texto) =>
    texto
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/url\([^)]*\)/g, '');
  for (const oficio of corto.oficios) {
    const nombrado = new RegExp(`\\b${oficio.clave}\\b`);
    for (const texto of [estilos, ...codigo].map(sinComentarios)) {
      assert.doesNotMatch(texto, nombrado, `algo del inicio nombra el oficio "${oficio.clave}"`);
    }
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
  const deOficio = /^([a-z]+)-((trabajo-(720|1080)|escena-(1600|2560))\.(avif|webp)|escena\.mp4)$/;
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
    /<a class="boton boton--sello boton--luz" href="https:\/\/alta\.prompt-maestro\.com\/" data-lugar="pelicula">/,
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
    assert.match(video, / data-src="[^"]+-escena\.mp4"/);
    assert.doesNotMatch(video, / (src|autoplay|controls|loop)\b/);
  }
  // En celular el corto no existe: sus fotos no se piden si no se pintan. Son la escena de cada oficio, con luz fria
  // y con luz calida, y su foto de pie en el cierre.
  const tomas = delCine.match(/<img class="foto__toma"[^>]*>/g) ?? [];
  assert.equal(tomas.length, corto.oficios.length * 3, 'dos escenas y una franja por oficio');
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
  // La pagina no adelanta ninguna foto: en celular no hace falta, y en pantallas anchas la del corto la adelanta
  // arranque.js, que es quien sabe a que oficio le toco. Su etiqueta le dice que archivos son (con un asterisco en el
  // lugar del oficio) y cuanto miden en la pantalla: lo mismo que dice la foto de cada escena.
  assert.equal((html.match(/<link rel="preload" as="image"[^>]*>/g) ?? []).length, 0);
  const etiqueta = /<script src="[^"]*\/js\/arranque\.js"[^>]*>/.exec(html)?.[0] ?? '';
  const fotos = / data-escena="([^"]+)"/.exec(etiqueta)?.[1] ?? '';
  const mide = / data-escena-mide="([^"]+)"/.exec(etiqueta)?.[1] ?? '';
  assert.ok(fotos.includes('*') && mide, 'la etiqueta de arranque.js dice las fotos de la escena');
  for (const oficio of corto.oficios) {
    const escenas = delCine.match(
      new RegExp(`<div class="escena" data-escena="${oficio.clave}"[\\s\\S]*?</picture>`, 'g'),
    );
    assert.equal(escenas?.length, 2, `${oficio.clave}: su escena con luz fria y con luz calida`);
    for (const escena of escenas ?? []) {
      const fuente = /<source type="image\/avif" srcset="([^"]+)" sizes="([^"]+)">/.exec(escena);
      assert.equal(fuente?.[1], fotos.replaceAll('*', oficio.clave), `${oficio.clave}: la foto que se adelanta`);
      assert.equal(fuente?.[2], mide, `${oficio.clave}: lo que mide la foto que se adelanta`);
    }
  }
});

test('el corto trae escrita una escena por oficio: la primera a la vista y las demas guardadas, cada una con sus medidas', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const cine = /class="corto__cine"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  for (const luz of ['calida', 'fria']) {
    const juego =
      new RegExp(`data-escenas="${luz}"[\\s\\S]*?(?=data-escenas=|class="corto__carro")`).exec(cine)?.[0] ?? '';
    const escenas = juego.match(/<div class="escena"[^>]*>/g) ?? [];
    assert.equal(escenas.length, corto.oficios.length, `una escena por oficio con luz ${luz}`);
    for (const [lugar, escena] of escenas.entries()) {
      const { clave, mira } = corto.oficios[lugar];
      assert.ok(escena.includes(` data-escena="${clave}"`), escena);
      // Sin nadie que elija se ve la primera; las otras no se pintan.
      assert.equal(/ hidden>$/.test(escena), lugar > 0, `${clave}: ${escena}`);
      for (const [dato, valor] of [
        ['persona', mira.persona],
        ['celular', mira.celular],
        ['viva', mira.viva],
      ]) {
        assert.ok(escena.includes(` data-${dato}="${valor}"`), `${clave}: ${dato}`);
      }
    }
  }
  // El video de cada oficio va en su escena fria, y la calida no trae ninguno: el mismo se muda de una a otra.
  const calida = /data-escenas="calida"[\s\S]*?data-escenas="fria"/.exec(cine)?.[0] ?? '';
  assert.doesNotMatch(calida, /<video\b/);
  // El cierre: una franja por oficio, con su nombre y el negocio de su agente; y su letrero, con el renglon chico.
  const franjas = cine.match(/<div class="franja"[\s\S]*?<\/p>/g) ?? [];
  assert.equal(franjas.length, corto.oficios.length);
  for (const [lugar, franja] of franjas.entries()) {
    const oficio = corto.oficios[lugar];
    assert.ok(franja.includes(` data-franja="${oficio.clave}" data-persona="${oficio.mira.dePie}"`), oficio.clave);
    assert.ok(franja.includes(`-trabajo-720.avif`), `${oficio.clave}: su foto de pie`);
    assert.ok(
      franja.includes(
        `<p class="franja__nombre">${oficio.nombre}<small class="franja__agente">${corto.todos.agenteDe} ${oficio.cartel.charla.negocio}</small></p>`,
      ),
      `${oficio.clave}: su nombre y el negocio de su agente`,
    );
  }
  const negocios = corto.oficios.map((/** @type {any} */ oficio) => oficio.cartel.charla.negocio);
  assert.equal(new Set(negocios).size, negocios.length, 'cada agente es de un negocio distinto');
  const cierre = corto.guion.at(-1);
  assert.equal(cierre.clave, 'todos', 'el cierre es el ultimo momento');
  assert.ok(
    cine.includes(
      `<p class="letrero" data-letrero="todos">${cierre.letrero}<small class="letrero__baja">${corto.todos.baja}</small></p>`,
    ),
    'el letrero del cierre lleva debajo su renglon chico',
  );
  assert.equal(cine.match(/class="letrero__baja"/g)?.length, 1, 'solo el cierre lleva renglon chico');
});

test('el corto viaja escrito en la pagina: la marca en su halo, la cuenta de cada celular y lo que hizo el agente con su pago y su sello', async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  const html = archivos.get('index.html')?.toString('utf8') ?? '';
  const cine = /class="corto__cine"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  assert.ok(cine, 'las capas del corto');
  // La marca: su halo va antes que el logotipo, el nombre y la frase, que quedan encima.
  const marca = /<div class="corto__marca">[\s\S]*?<p class="corto__frase">[^<]*<\/p>/.exec(cine)?.[0] ?? '';
  assert.match(marca, /^<div class="corto__marca">\s*<div class="halo">/);
  for (const parte of ['halo__rayos', 'halo__aura', 'halo__latido', 'halo__orbita', 'halo__disco'])
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
  // Lo que hizo el agente: una conversacion por oficio, en su orden, cada una con sus cinco piezas (el mensaje, lo
  // que contesto, el pago aprobado, el papel con lo que resolvio y el sello) y de donde salio la respuesta.
  const tratos = cine.match(/<div class="trato">[\s\S]*?<\/div>/g) ?? [];
  assert.equal(tratos.length, corto.oficios.length);
  for (const [lugar, trato] of tratos.entries()) {
    const oficio = corto.oficios[lugar];
    const texto = trato.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const dice of [
      oficio.trato.quien,
      oficio.trato.responde,
      oficio.trato.fuente,
      `${corto.pagoAprobado} ${oficio.trato.pago}`,
      corto.cartel.tuAgente,
      oficio.trato.hizo,
      oficio.trato.agenda,
    ]) {
      assert.ok(texto.includes(dice), `${oficio.clave}: falta "${dice}"`);
    }
    if (oficio.trato.texto) assert.ok(texto.includes(oficio.trato.texto), `${oficio.clave}: el mensaje que entro`);
    assert.equal(trato.includes('class="dice__foto"'), oficio.trato.foto, `${oficio.clave}: la foto`);
    // El orden de lo que entra: el mensaje, lo que contesto el agente (y de donde lo saco), el pago, y el papel
    // con su renglon de la agenda y su sello.
    const orden = [
      'class="dice"',
      'class="dice dice--agente"',
      'class="trato__fuente"',
      'class="pago"',
      'class="hizo"',
      'class="hizo__agenda"',
      'class="sello sello--cita"',
    ];
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
  assert.match(html, new RegExp(`<script src="[^"]*/js/arranque\\.js" data-oficios="${claves}"[^>]*></script>`));
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
