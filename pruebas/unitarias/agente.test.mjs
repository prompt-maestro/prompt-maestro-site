// @ts-check
// "Tu agente": la logica de su menu y de sus mini videos (sin navegador), los datos que aprobo el dueno y lo que la
// pagina armada trae escrito antes de que llegue una sola linea de JavaScript.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  altoDelMenu,
  anda,
  avanzar,
  botonDe,
  capituloCon,
  cuantoBajar,
  cuantoRecorrer,
  estadoInicial,
  instanteCon,
  instanteEn,
  reloj,
  segundoDicho,
  yaArrastra,
} from '../../fuente/js/agente.js';
import { armarSitio } from '../../herramientas/armado.mjs';
import { DURA, PIEZAS, problemasDeBeneficios } from '../../herramientas/beneficios.mjs';

/** @typedef {import('../../fuente/js/agente.js').Estado} Estado */
/** @typedef {import('../../fuente/js/agente.js').Evento} Evento */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUENTE = path.join(RAIZ, 'fuente');
const agentes = JSON.parse(await readFile(path.join(FUENTE, 'datos', 'agentes.json'), 'utf8'));
const secciones = JSON.parse(await readFile(path.join(FUENTE, 'datos', 'secciones.json'), 'utf8'));
/** Los dos capitulos de la seccion: lo que hace el agente y como se empieza. @type {any[]} */
const capitulos = agentes.capitulos;
/**
 * Los renglones de un capitulo, por su clave.
 * @param {string} clave
 * @returns {any[]}
 */
const videosDe = (clave) => capitulos.find((capitulo) => capitulo.clave === clave)?.videos ?? [];
/** Los beneficios: los renglones de "Lo que hace". */
const hace = videosDe('hace');
/** Los pasos para contratarlo: los renglones de "Como empiezas". */
const empieza = videosDe('empieza');
/** Todos los renglones de la seccion, en el orden de la pagina. */
const todos = [...hace, ...empieza];
/** Los beneficios que hay. */
const CUANTOS = hace.length;
/**
 * Un beneficio, por su titulo: las pruebas no dependen del lugar que ocupa en el menu.
 * @param {string} titulo
 */
const lugarDe = (titulo) => hace.findIndex((beneficio) => beneficio.titulo === titulo);

/** Los nueve beneficios, en su orden, con las palabras que aprobo el dueno (19-nov-2026). */
const APROBADOS = [
  [
    'Gestiona tus citas de principio a fin',
    'Desde el primer «hola» hasta el seguimiento después de la cita: contesta, cobra el anticipo, verifica el pago, agenda y recuerda. Tú solo le confirmas si llegó, con un toque.',
  ],
  [
    'Hecho a la medida de tu negocio',
    'Trabaja con su propia base de conocimiento: tus servicios, tus precios, tus horarios y tus políticas. Por eso es un agente dedicado a ti, distinto al de cualquier otro profesional.',
  ],
  [
    'Contesta a cualquier hora',
    'Precios, horarios y dudas, con el tono de tu negocio. Si le escriben en varios mensajes, espera a que terminen y contesta todo junto.',
  ],
  [
    'Maneja tu agenda por ti',
    'Ofrece solo los horarios libres de tu Google Calendar, agenda la cita y manda los recordatorios.',
  ],
  [
    'Asegura el pago antes de agendar',
    'La cita entra a tu calendario con el anticipo ya pagado, directo a tu cuenta de Mercado Pago.',
  ],
  [
    'Entiende notas de voz y contesta con voz',
    'Si tu clienta manda una nota de voz, la escucha y le contesta con otra nota de voz. El enlace de pago y lo que hay que copiar, siempre por escrito.',
  ],
  [
    'Ve las imágenes de referencia que le mandan',
    'Por la naturaleza de cada oficio, hoy esto aplica solo para negocios de uñas, no para dentistas ni médicos. Revisa el diseño que quiere tu clienta y, si el precio no está en tu catálogo, te pregunta a ti antes de cotizar.',
  ],
  [
    'Solo te contacta cuando se requiere tu intervención',
    'Lo de todos los días lo resuelve tu agente. Cuando algo necesita tu decisión, toma el recado y te avisa a tu WhatsApp personal.',
  ],
  [
    'Cambias tus precios y horarios con un mensaje',
    '¿Subió un precio o cambió tu horario? Se lo escribes a tu agente por WhatsApp y lo actualiza. Nada se aplica sin tu sí.',
  ],
];

/** Los cuatro pasos para contratarlo, en su orden, con las palabras que aprobo el dueno. */
const PASOS_APROBADOS = [
  [
    'Eliges tu plan',
    'Lo contratas en línea, con tarjeta. Hoy pagas solo la instalación: tu mensualidad empieza el día que tu agente queda activo.',
  ],
  [
    'Nos cuentas de tu negocio',
    'En una página hecha para tu celular, una cosa por pantalla: tus servicios, tus precios, tus horarios y tus políticas. Se guarda sola.',
  ],
  [
    'Conectas tus cuentas',
    'Tu agente vive en un número exclusivo de tu negocio con WhatsApp Business, que sigue en tu celular. Lo conectas junto con tu Google Calendar y tu Mercado Pago, con unos toques.',
  ],
  [
    'Tu agente empieza a atender',
    'Tocas «Genera tu agente» y, cuando queda listo, te escribe a tu WhatsApp personal para avisarte que ya está funcionando. Tú lo puedes probar antes que nadie.',
  ],
];

/**
 * Pasa un estado por una fila de eventos.
 * @param {Estado} estado
 * @param {...Evento} eventos
 * @returns {Estado}
 */
const tras = (estado, ...eventos) => eventos.reduce((va, evento) => avanzar(va, evento, CUANTOS), estado);
/** @type {Evento} */
const LLEGA = { tipo: 'vista', aLaVista: true };
/** @type {Evento} */
const SE_VA = { tipo: 'vista', aLaVista: false };
/** @type {Evento} */
const BOTON = { tipo: 'boton' };
/** @type {Evento} */
const TERMINA = { tipo: 'termina' };

/**
 * Todo lo que dice una escena, pieza por pieza y en su orden.
 * @param {any} beneficio
 * @returns {string[]}
 */
function dichos(beneficio) {
  /** @type {string[]} */
  const textos = [];
  const juntar = (/** @type {unknown} */ valor) => {
    if (typeof valor === 'string') textos.push(valor);
    else if (Array.isArray(valor)) valor.forEach(juntar);
    else if (valor && typeof valor === 'object') {
      for (const [clave, dentro] of Object.entries(valor)) if (clave !== 'de') juntar(dentro);
    }
  };
  for (const { en: _en, hasta: _hasta, ...pieza } of beneficio.pasos) juntar(pieza);
  return textos;
}

// ---------- La logica ----------

test('la seccion llega con el primer beneficio abierto y su mini video esperando a que lo vean', () => {
  assert.deepEqual(estadoInicial(), {
    abierto: 0,
    fase: 'espera',
    pausado: false,
    aLaVista: false,
    quieto: false,
    vuelta: 0,
  });
  assert.equal(anda(estadoInicial()), false);
  assert.equal(botonDe(estadoInicial()), 'pausar');
});

test('al llegar a la vista el primero corre solo, y solo una vez: al terminar se queda en su ultimo cuadro', () => {
  const corriendo = tras(estadoInicial(), LLEGA);
  assert.deepEqual(corriendo, { abierto: 0, fase: 'sigue', pausado: false, aLaVista: true, quieto: false, vuelta: 1 });
  assert.equal(anda(corriendo), true);
  const terminado = tras(corriendo, TERMINA);
  assert.equal(terminado.fase, 'fin');
  assert.equal(anda(terminado), false);
  assert.equal(botonDe(terminado), 'verDeNuevo');
  // Irse y regresar no lo vuelve a correr: sigue en su ultimo cuadro y no ha empezado otra vez.
  const deRegreso = tras(terminado, SE_VA, LLEGA, SE_VA, LLEGA);
  assert.equal(deRegreso.fase, 'fin');
  assert.equal(deRegreso.vuelta, 1);
  assert.equal(anda(deRegreso), false);
});

test('el mini video solo corre mientras se ve: si la visitante se va, espera donde iba', () => {
  const corriendo = tras(estadoInicial(), LLEGA);
  const fuera = tras(corriendo, SE_VA);
  assert.equal(fuera.fase, 'sigue');
  assert.equal(anda(fuera), false);
  // Regresar no lo empieza de nuevo: sigue el mismo.
  const deRegreso = tras(fuera, LLEGA);
  assert.equal(anda(deRegreso), true);
  assert.equal(deRegreso.vuelta, corriendo.vuelta);
  // Un aviso repetido no cambia nada (y devuelve el mismo estado: no hay nada que pintar).
  assert.equal(avanzar(deRegreso, LLEGA, CUANTOS), deRegreso);
});

test('elegir otro beneficio cierra el anterior y corre el suyo desde cero', () => {
  const visto = tras(estadoInicial(), LLEGA, TERMINA);
  const otro = tras(visto, { tipo: 'elige', cual: 4 });
  assert.deepEqual(otro, { abierto: 4, fase: 'sigue', pausado: false, aLaVista: true, quieto: false, vuelta: 2 });
  assert.equal(anda(otro), true);
  // Tambien a media funcion de otro, y aunque estuviera en pausa: el nuevo arranca corriendo.
  const enPausa = tras(otro, BOTON);
  assert.equal(enPausa.pausado, true);
  const tercero = tras(enPausa, { tipo: 'elige', cual: 1 });
  assert.deepEqual([tercero.abierto, tercero.fase, tercero.pausado, tercero.vuelta], [1, 'sigue', false, 3]);
});

test('elegir el que ya esta abierto lo vuelve a correr: el menu nunca se queda sin un beneficio abierto', () => {
  const visto = tras(estadoInicial(), LLEGA, TERMINA);
  const otraVez = tras(visto, { tipo: 'elige', cual: 0 });
  assert.equal(otraVez.abierto, 0);
  assert.equal(otraVez.fase, 'sigue');
  assert.equal(otraVez.vuelta, visto.vuelta + 1);
});

test('si se elige uno sin haberlo visto, empieza cuando la visitante llegue a el', () => {
  // Con el teclado se puede elegir un beneficio cuyo mini video todavia no asoma en la pantalla.
  const elegido = tras(estadoInicial(), { tipo: 'elige', cual: 2 });
  assert.equal(elegido.fase, 'sigue');
  assert.equal(anda(elegido), false);
  assert.equal(anda(tras(elegido, LLEGA)), true);
  // Y llegar no lo cuenta como otra vuelta: es la misma funcion, que estaba esperando.
  assert.equal(tras(elegido, LLEGA).vuelta, elegido.vuelta);
});

test('un beneficio que no existe no cambia nada', () => {
  const estado = tras(estadoInicial(), LLEGA);
  for (const cual of [-1, CUANTOS, 99, 1.5, Number.NaN]) {
    assert.equal(avanzar(estado, { tipo: 'elige', cual }, CUANTOS), estado, String(cual));
  }
});

test('el boton de la barra: pausa y reanuda donde iba, y al terminar ofrece verlo de nuevo', () => {
  const corriendo = tras(estadoInicial(), LLEGA);
  assert.equal(botonDe(corriendo), 'pausar');
  const enPausa = tras(corriendo, BOTON);
  assert.equal(enPausa.pausado, true);
  assert.equal(anda(enPausa), false);
  assert.equal(botonDe(enPausa), 'reproducir');
  // Reanudar no lo regresa al principio.
  const reanudado = tras(enPausa, BOTON);
  assert.equal(anda(reanudado), true);
  assert.equal(reanudado.vuelta, corriendo.vuelta);
  // Ya terminado, el mismo boton lo corre otra vez desde cero.
  const terminado = tras(reanudado, TERMINA);
  assert.equal(botonDe(terminado), 'verDeNuevo');
  const deNuevo = tras(terminado, BOTON);
  assert.deepEqual([deNuevo.fase, deNuevo.pausado, deNuevo.vuelta], ['sigue', false, corriendo.vuelta + 1]);
  assert.equal(botonDe(deNuevo), 'pausar');
});

test('que termine solo cuenta para el que esta corriendo', () => {
  const esperando = estadoInicial();
  assert.equal(avanzar(esperando, TERMINA, CUANTOS), esperando);
  const terminado = tras(estadoInicial(), LLEGA, TERMINA);
  assert.equal(avanzar(terminado, TERMINA, CUANTOS), terminado);
});

test('con movimiento reducido nada corre: cada beneficio es, de entrada, su ultimo cuadro', () => {
  const quieto = estadoInicial({ quieto: true });
  assert.equal(quieto.fase, 'fin');
  // Ni al llegar, ni al elegir otro, ni con el boton (que ademas no se ve).
  const llego = tras(quieto, LLEGA);
  assert.deepEqual([llego.fase, llego.vuelta, anda(llego)], ['fin', 0, false]);
  const otro = tras(llego, { tipo: 'elige', cual: 5 });
  assert.deepEqual([otro.abierto, otro.fase, otro.vuelta, anda(otro)], [5, 'fin', 0, false]);
  assert.equal(avanzar(otro, BOTON, CUANTOS), otro);
});

test('si la visitante pide menos movimiento a media funcion, el mini video se queda en su ultimo cuadro', () => {
  const corriendo = tras(estadoInicial(), LLEGA, BOTON);
  const quieto = tras(corriendo, { tipo: 'quieto', quieto: true });
  assert.deepEqual([quieto.fase, quieto.pausado, quieto.quieto], ['fin', false, true]);
  // Al quitar la preferencia nada arranca solo: lo siguiente que elija si correra.
  const suelto = tras(quieto, { tipo: 'quieto', quieto: false });
  assert.deepEqual([suelto.fase, suelto.quieto], ['fin', false]);
  assert.equal(tras(suelto, { tipo: 'elige', cual: 3 }).fase, 'sigue');
  assert.equal(avanzar(suelto, { tipo: 'quieto', quieto: false }, CUANTOS), suelto);
});

test('avanzar no cambia el estado que recibe', () => {
  const estado = tras(estadoInicial(), LLEGA);
  const copia = structuredClone(estado);
  tras(estado, BOTON, { tipo: 'elige', cual: 6 }, TERMINA, SE_VA, { tipo: 'quieto', quieto: true });
  assert.deepEqual(estado, copia);
});

test('mover la linea de avance: si el mini video corre o esta en pausa sigue como estaba; si no, empieza', () => {
  /** @type {Evento} */
  const BUSCA = { tipo: 'busca' };
  // Corriendo: no cambia nada del estado (la vista solo le mueve el reloj), y es el mismo objeto.
  const corriendo = tras(estadoInicial(), LLEGA);
  assert.equal(corriendo.fase, 'sigue');
  assert.equal(tras(corriendo, BUSCA), corriendo);
  // En pausa: se queda en pausa, en el instante al que ella lo llevo.
  const enPausa = tras(corriendo, BOTON);
  assert.equal(enPausa.pausado, true);
  assert.equal(tras(enPausa, BUSCA), enPausa);
  // Ya terminado: vuelve a empezar (otra vuelta) y corre desde donde ella apunto.
  const terminado = tras(corriendo, TERMINA);
  assert.equal(terminado.fase, 'fin');
  const deNuevo = tras(terminado, BUSCA);
  assert.deepEqual(
    [deNuevo.fase, deNuevo.pausado, deNuevo.vuelta, deNuevo.abierto],
    ['sigue', false, terminado.vuelta + 1, terminado.abierto],
  );
  assert.equal(anda(deNuevo), true);
  // Antes de empezar (nadie lo ha visto): tambien empieza.
  assert.equal(tras(estadoInicial(), BUSCA).fase, 'sigue');
  // Con menos movimiento no hay nada que mover: cada escena es su ultimo cuadro.
  const quieto = estadoInicial({ quieto: true });
  assert.equal(tras(quieto, BUSCA), quieto);
});

test('en la linea de avance las flechas van de segundo en segundo, sin salirse; Inicio y Fin van a las orillas', () => {
  assert.equal(instanteCon('ArrowRight', 3, 8), 4);
  assert.equal(instanteCon('ArrowUp', 3, 8), 4);
  assert.equal(instanteCon('ArrowLeft', 3, 8), 2);
  assert.equal(instanteCon('ArrowDown', 3, 8), 2);
  // A medio segundo tambien avanza o regresa uno entero.
  assert.equal(instanteCon('ArrowRight', 3.4, 8), 4.4);
  // En las orillas no se sale.
  assert.equal(instanteCon('ArrowRight', 7.6, 8), 8);
  assert.equal(instanteCon('ArrowLeft', 0.3, 8), 0);
  assert.equal(instanteCon('Home', 5, 28), 0);
  assert.equal(instanteCon('End', 5, 28), 28);
  // Cualquier otra tecla no es de la linea: Tab sigue su camino y Espacio no hace nada aqui.
  for (const tecla of ['Tab', 'Enter', ' ', 'a', 'Escape', 'PageDown'])
    assert.equal(instanteCon(tecla, 3, 8), null, tecla);
});

test('en pausa la linea de avance no llega hasta el final: se queda un instante antes y la pausa no se pierde', () => {
  // Corriendo llega a donde ella apunte, sin salirse de lo que dura.
  assert.equal(instanteEn(3, 8, false), 3);
  assert.equal(instanteEn(-2, 8, false), 0);
  assert.equal(instanteEn(11, 8, false), 8);
  // En pausa el final queda un instante antes: no termina solo, y al regresar la linea sigue en pausa.
  assert.equal(instanteEn(3, 8, true), 3);
  assert.equal(instanteEn(-1, 8, true), 0);
  assert.ok(instanteEn(8, 8, true) < 8);
  assert.ok(instanteEn(8, 8, true) > 7.9);
  assert.equal(instanteEn(30, 28, true), instanteEn(28, 28, true));
});

test('la linea de avance dice el total solo cuando el mini video de veras termino', () => {
  assert.equal(segundoDicho(0, 8, false), 0);
  assert.equal(segundoDicho(3.4, 8, false), 3);
  assert.equal(segundoDicho(3.6, 8, false), 4);
  // Casi al final (o en pausa, en la orilla) todavia no termina: dice el segundo anterior.
  assert.equal(segundoDicho(7.95, 8, false), 7);
  assert.equal(segundoDicho(8, 8, false), 7);
  // Terminado dice el total, venga de donde venga.
  assert.equal(segundoDicho(8, 8, true), 8);
  assert.equal(segundoDicho(0, 28, true), 28);
});

test('el dedo arrastra la linea de avance solo cuando se mueve de lado lo suficiente', () => {
  assert.equal(yaArrastra(100, 100), false);
  assert.equal(yaArrastra(100, 107), false);
  assert.equal(yaArrastra(100, 93), false);
  assert.equal(yaArrastra(100, 108), true);
  assert.equal(yaArrastra(100, 92), true);
});

test('lo que dura un mini video se dice como en un reproductor', () => {
  assert.equal(reloj(7), '0:07');
  assert.equal(reloj(8), '0:08');
  assert.equal(reloj(6.4), '0:06');
  assert.equal(reloj(59.6), '1:00');
  assert.equal(reloj(75), '1:15');
  assert.equal(reloj(0), '0:00');
  assert.equal(reloj(-3), '0:00');
});

test('la pagina baja lo justo para ensenar lo que se abrio, sin esconder su renglon', () => {
  // Cabe entero: no se mueve nada.
  assert.equal(cuantoBajar({ arriba: 200, abajo: 620, techo: 80, piso: 760 }), 0);
  // Se sale por abajo 140: baja 140 y su renglon sigue a la vista.
  assert.equal(cuantoBajar({ arriba: 400, abajo: 900, techo: 80, piso: 760 }), 140);
  // Es mas alto que la pantalla: baja hasta dejar su renglon justo bajo la barra de arriba, no mas.
  assert.equal(cuantoBajar({ arriba: 300, abajo: 1400, techo: 80, piso: 760 }), 220);
  // Y si su renglon ya esta arriba del todo, no baja: nunca lo esconde.
  assert.equal(cuantoBajar({ arriba: 80, abajo: 1400, techo: 80, piso: 760 }), 0);
  assert.equal(cuantoBajar({ arriba: 20, abajo: 1400, techo: 80, piso: 760 }), 0);
});

test('en computadora la pagina se recorre lo justo para que el escenario elegido se vea entero, o no se toca', () => {
  // Pegado bajo la barra de la pagina (a 88) y con lugar abajo: ya se ve entero, la pagina no se toca.
  assert.equal(cuantoRecorrer({ arriba: 88, abajo: 688, techo: 88, piso: 768 }), 0);
  // Al final del menu el escenario ya iba de salida: su orilla de arriba quedo escondida y la pagina sube lo que falta.
  assert.equal(cuantoRecorrer({ arriba: -26, abajo: 574, techo: 88, piso: 768 }), -114);
  assert.equal(cuantoRecorrer({ arriba: 87, abajo: 687, techo: 88, piso: 768 }), -1);
  // Recien llegada a la seccion, el escenario empieza donde el titulo y su parte de abajo no cabe: la pagina baja lo
  // que falta, sin esconderle la de arriba.
  assert.equal(cuantoRecorrer({ arriba: 280, abajo: 896, techo: 88, piso: 768 }), 128);
  assert.equal(cuantoRecorrer({ arriba: 120, abajo: 900, techo: 88, piso: 768 }), 32);
  // Y si cabe con su principio debajo de la barra, tampoco se toca.
  assert.equal(cuantoRecorrer({ arriba: 150, abajo: 760, techo: 88, piso: 768 }), 0);
});

test('en computadora el menu aparta lo alto de sus renglones y de su oracion mas larga', () => {
  assert.equal(altoDelMenu([61, 61, 61, 62], [39, 62, 85, 39]), 245 + 85);
  // Sin oraciones que medir (un menu de un solo renglon sin texto) no truena.
  assert.equal(altoDelMenu([61], []), 61);
  assert.equal(altoDelMenu([], []), 0);
});

test('en el selector de capitulos las flechas de lado pasan al de al lado y dan la vuelta; Inicio y Fin van a las orillas', () => {
  assert.equal(capituloCon('ArrowRight', 0, 2), 1);
  assert.equal(capituloCon('ArrowRight', 1, 2), 0);
  assert.equal(capituloCon('ArrowLeft', 0, 2), 1);
  assert.equal(capituloCon('ArrowLeft', 1, 2), 0);
  assert.equal(capituloCon('ArrowRight', 2, 3), 0);
  assert.equal(capituloCon('ArrowLeft', 0, 3), 2);
  assert.equal(capituloCon('Home', 2, 3), 0);
  assert.equal(capituloCon('End', 0, 3), 2);
  // Cualquier otra tecla deja el capitulo donde esta: Tab sigue su camino y Enter lo hace el boton. Las flechas de
  // arriba y abajo tampoco: las pestanas van en renglon y esas teclas siguen recorriendo la pagina.
  for (const tecla of ['Tab', 'Enter', ' ', 'a', 'Escape', 'ArrowDown', 'ArrowUp', 'PageDown']) {
    assert.equal(capituloCon(tecla, 1, 2), 1, tecla);
  }
  // Y sin capitulos que contar no truena.
  assert.equal(capituloCon('ArrowRight', 0, 0), 0);
  assert.equal(capituloCon('End', 0, Number.NaN), 0);
});

// ---------- Los datos ----------

test('dos capitulos: lo que hace, con sus nueve beneficios, y como empiezas, con sus cuatro pasos numerados', () => {
  assert.deepEqual(
    capitulos.map(({ clave, nombre, cuenta, numerado }) => ({ clave, nombre, cuenta, numerado })),
    [
      { clave: 'hace', nombre: 'Lo que hace', cuenta: undefined, numerado: undefined },
      { clave: 'empieza', nombre: 'Cómo empiezas', cuenta: '4 pasos', numerado: true },
    ],
  );
  // Al final del primero, el paso al segundo; al final del segundo, lo que se paga hoy junto al boton de empezar.
  assert.equal(capitulos[0].sigue, 'Siguiente: cómo empiezas, en 4 pasos');
  assert.equal(capitulos[1].arranca, 'Hoy pagas solo la instalación.');
  assert.equal(empieza.length, 4);
  assert.deepEqual(
    empieza.map(({ titulo, texto }) => [titulo, texto]),
    PASOS_APROBADOS,
  );
  // La lista vieja ya no existe: los beneficios viven dentro de su capitulo.
  assert.equal('hace' in agentes, false);
});

test('los nueve beneficios, en su orden, con el titulo y la oracion que aprobo el dueno', () => {
  assert.equal(CUANTOS, 9);
  assert.deepEqual(
    hace.map(({ titulo, texto }) => [titulo, texto]),
    APROBADOS,
  );
  // "Recuerda la cita" ya no es un renglon aparte: lo absorbio el de la agenda. Y "Habla de tu o de usted" salio: el
  // dueno decidio que el agente siempre habla de usted, asi que ya no es algo que presumir.
  assert.ok(!JSON.stringify(agentes).includes('Recuerda la cita'));
  assert.doesNotMatch(JSON.stringify(agentes), /de tú o de usted|De usted|De tú/);
  // Tampoco se promete "menos de un minuto": a veces el agente espera a proposito a que ella termine de escribir.
  assert.doesNotMatch(JSON.stringify(agentes), /menos de un minuto/i);
});

test('la seccion no habla de examenes: lo pidio el dueno', () => {
  assert.doesNotMatch(JSON.stringify(agentes), /ex[aá]men|examin/i);
});

test('como empiezas no promete tiempos de alta ni probar antes de pagar', () => {
  // Lo que se promete son los titulos y las oraciones; las escenas ensenan un negocio de ejemplo.
  const dicho = empieza.map(({ titulo, texto }) => `${titulo}. ${texto}`).join(' ');
  assert.doesNotMatch(dicho, /\d+\s*(minutos?|horas?|d[ií]as?)\b/i);
  assert.doesNotMatch(dicho, /antes de pagar|gratis|al instante/i);
  // Y dice lo que la tabla de la verdad pide decir: tarjeta, instalacion hoy, mensualidad al activar y numero exclusivo.
  for (const frase of [
    'con tarjeta',
    'Hoy pagas solo la instalación',
    'tu mensualidad empieza el día que tu agente queda activo',
    'un número exclusivo de tu negocio con WhatsApp Business',
    'sigue en tu celular',
    'Tú lo puedes probar antes que nadie',
  ]) {
    assert.ok(dicho.includes(frase), frase);
  }
});

test('cada mini video dura de 6 a 8 segundos (los que cuentan mas de un momento, hasta 30) y sus piezas aparecen en orden', () => {
  assert.deepEqual(problemasDeBeneficios(capitulos), []);
  assert.deepEqual([DURA.minimo, DURA.maximo, DURA.largo], [6, 8, 30]);
  // Dos son largos: el que cuenta la cita de principio a fin, que abre la seccion, y el de los cambios, que ensena un
  // ejemplo de precio y otro de horario (lo pidio el dueno).
  assert.deepEqual(
    todos.filter((beneficio) => beneficio.largo).map((beneficio) => beneficio.titulo),
    ['Gestiona tus citas de principio a fin', 'Cambias tus precios y horarios con un mensaje'],
  );
  assert.equal(hace[0].dura, 28);
  assert.equal(hace[lugarDe('Cambias tus precios y horarios con un mensaje')].dura, 15);
  for (const beneficio of todos) {
    assert.ok(beneficio.dura >= 6 && beneficio.dura <= (beneficio.largo ? 30 : 8), beneficio.titulo);
    /** @type {number[]} */
    const tiempos = beneficio.pasos.map((/** @type {{ en: number }} */ paso) => paso.en);
    assert.deepEqual(
      tiempos,
      tiempos.toSorted((a, b) => a - b),
      beneficio.titulo,
    );
    // La primera pieza no hace esperar y la ultima deja un rato para leerla.
    assert.ok((tiempos[0] ?? 9) <= 0.5, beneficio.titulo);
    assert.ok(beneficio.dura - (tiempos.at(-1) ?? 9) >= 1.4, beneficio.titulo);
  }
});

test('la escena de la cita completa cuenta sus cinco momentos y dice quien ve cada uno', () => {
  const cita = hace[0];
  assert.equal(cita.titulo, 'Gestiona tus citas de principio a fin');
  assert.deepEqual(
    dichos(cita).filter((texto) => !/^\d+:\d\d [ap]\. m\.$/.test(texto)),
    [
      'Lo ve tu clienta',
      'Antes de la cita',
      'Hola, buenos días. ¿Cuánto cuesta el gelish? ¿Hay lugar el jueves?',
      '¡Hola, Ana, buenos días! Con mucho gusto. El gelish cuesta $350 y el jueves tengo lugar a las 5:00 pm. ¿Se lo aparto?',
      'Lo sabe por tu base de conocimiento',
      'Anticipo Gelish semipermanente',
      '$150',
      'mercadopago.com.mx',
      'Listo, le aparté el jueves a las 5:00 pm. Su cita se confirma con el anticipo de $150.',
      'Lo ves tú',
      'La cita, garantizada',
      'Pago aprobado · $150',
      'JUE',
      '19',
      '5:00 pm · Ana',
      'Gelish',
      'Lo ve tu clienta',
      'Un día antes',
      'Hola, Ana. Le recordamos su cita de Gelish mañana jueves a las 5:00 pm. ¡Le esperamos!',
      'Lo ves tú',
      'Al terminar la cita',
      '¿Asistió Ana a su cita de Gelish hoy a las 5:00 pm?',
      'Sí',
      'No',
      'Lo ve tu clienta',
      'Después de la cita',
      '¡Gracias por venir, Ana! Cuando guste, le agendo su siguiente cita.',
      'Cita garantizada, de principio a fin',
    ],
  );
  // Cinco momentos, y se van turnando: lo que ve la clienta y lo que ve la profesional nunca salen en el mismo cuadro.
  const rotulos = cita.pasos.filter((/** @type {any} */ paso) => paso.quien);
  assert.deepEqual(
    rotulos.map((/** @type {any} */ paso) => [paso.quien.de, paso.quien.momento]),
    [
      ['clienta', 'Antes de la cita'],
      ['tu', 'La cita, garantizada'],
      ['clienta', 'Un día antes'],
      ['tu', 'Al terminar la cita'],
      ['clienta', 'Después de la cita'],
    ],
  );
  // Cada momento limpia la pantalla del anterior: lo de un momento se va antes de que llegue el rotulo del siguiente.
  for (const [lugar, rotulo] of rotulos.entries()) {
    const siguiente = rotulos[lugar + 1];
    if (!siguiente) continue;
    for (const paso of cita.pasos.filter((/** @type {any} */ uno) => uno.en >= rotulo.en && uno.en < siguiente.en)) {
      assert.ok(paso.hasta !== undefined && paso.hasta + 0.5 <= siguiente.en, JSON.stringify(paso));
    }
  }
  // Lo que queda al final es el ultimo momento, con su insignia grande, y ella contesto con un toque.
  assert.equal(cita.pasos.at(-1).hizo.grande, true);
  assert.deepEqual(cita.pasos.find((/** @type {any} */ paso) => paso.botones).botones, [
    { texto: 'Sí', toca: true },
    { texto: 'No' },
  ]);
});

test('cada escena de chat dice de quien es el celular, y nunca mezcla los dos en un mismo cuadro', () => {
  for (const beneficio of todos) {
    /** @type {any[]} */
    const pasos = beneficio.pasos;
    const conChat = pasos.some((paso) => paso.sale || paso.entra || paso.voz || paso.recado || paso.botones);
    if (!conChat) continue;
    // Antes del primer globo ya se dijo quien lo ve.
    const primerGlobo = pasos.findIndex((paso) => paso.sale || paso.entra || paso.voz || paso.recado);
    const primerRotulo = pasos.findIndex((paso) => paso.quien);
    assert.ok(primerRotulo >= 0 && primerRotulo < primerGlobo, beneficio.titulo);
    // Y cuando el celular cambia de manos, lo del anterior ya se fue: en el ultimo cuadro queda un solo rotulo.
    const alFinal = pasos.filter((paso) => paso.quien && paso.hasta === undefined);
    assert.equal(alFinal.length, 1, beneficio.titulo);
    for (const [lugar, paso] of pasos.entries()) {
      if (!paso.quien || paso.hasta !== undefined) continue;
      // Tras el ultimo rotulo ya no queda a la vista ningun globo de antes.
      for (const anterior of pasos.slice(0, lugar)) {
        if (anterior.pastilla) continue;
        assert.ok(
          anterior.hasta !== undefined && anterior.hasta <= paso.en,
          `${beneficio.titulo}: ${JSON.stringify(anterior)}`,
        );
      }
    }
  }
  // Los mensajes que le llegan a la profesional (si asistio, el recado, los cambios) van con el rotulo de ella.
  const deQuien = (/** @type {any} */ beneficio, /** @type {(paso: any) => boolean} */ cual) => {
    const lugar = beneficio.pasos.findIndex(cual);
    return beneficio.pasos.slice(0, lugar).findLast((/** @type {any} */ paso) => paso.quien)?.quien.de;
  };
  assert.equal(
    deQuien(hace[0], (paso) => paso.botones),
    'tu',
  );
  assert.equal(
    deQuien(hace[lugarDe('Solo te contacta cuando se requiere tu intervención')], (paso) => paso.recado),
    'tu',
  );
  assert.equal(
    deQuien(hace[lugarDe('Cambias tus precios y horarios con un mensaje')], (paso) => paso.botones),
    'tu',
  );
  assert.equal(
    deQuien(hace[lugarDe('Maneja tu agenda por ti')], (paso) => paso.agenda),
    'tu',
  );
  assert.equal(
    deQuien(hace[lugarDe('Asegura el pago antes de agendar')], (paso) => paso.cita),
    'tu',
  );
});

test('el agente saluda y le habla de usted a la clienta en todas las escenas: lo pidio el dueno', () => {
  /** Lo que el agente le escribe a la clienta o paciente: los globos que entran bajo un rotulo de ella. */
  const delAgente = todos.flatMap((beneficio) => {
    let de = '';
    /** @type {string[]} */
    const textos = [];
    for (const paso of beneficio.pasos) {
      if (paso.quien) de = paso.quien.de;
      if (paso.entra && de === 'clienta') textos.push(paso.entra.texto);
    }
    return textos;
  });
  assert.ok(delAgente.length >= 10);
  for (const texto of delAgente) {
    // Ni un tuteo: ni "te", ni "tu cita", ni verbos en segunda persona.
    assert.doesNotMatch(texto, /\b(te|ti|tu|tus|contigo)\b/i, texto);
    assert.doesNotMatch(texto, /\b(quieres|puedes|tienes|gustas|prefieres|mándame|dime|avísame)\b/i, texto);
  }
  // La primera respuesta de cada conversacion saluda o atiende con cortesia.
  const primeras = todos.flatMap((beneficio) => {
    const primera = beneficio.pasos.find((/** @type {any} */ paso) => paso.entra)?.entra.texto;
    const deElla = beneficio.pasos.find((/** @type {any} */ paso) => paso.quien)?.quien.de === 'clienta';
    return primera && deElla ? [primera] : [];
  });
  assert.ok(primeras.length >= 6);
  for (const texto of primeras) {
    assert.match(texto, /hola|con (mucho )?gusto|no se preocupe|qué bonito/i, texto);
  }
});

test('las escenas de como empiezas dicen lo que aprobo el dueno, pieza por pieza', () => {
  assert.deepEqual(empieza.map(dichos), [
    [
      'Tu plan',
      'Lo contratas en línea',
      'Hoy pagas',
      'Solo la instalación',
      'Tu mensualidad',
      'Empieza cuando tu agente esté activo',
      'Pago con tarjeta aprobado',
      'Sin comisión por cita',
    ],
    [
      'Tu negocio',
      'Studio Bella · lo llenas desde tu celular',
      'Servicios y precios',
      'Gelish $350 · Acrílicas $480',
      'Horarios',
      'Martes a sábado, 10 am a 7 pm',
      'Políticas',
      'Anticipo $150 · Tolerancia de 15 minutos',
      'Con esto se arma su base de conocimiento',
    ],
    [
      'Tus cuentas',
      'WhatsApp de tu negocio',
      'Conectado',
      'Google Calendar',
      'Conectado',
      'Mercado Pago',
      'Conectado',
      'Tu número personal no se toca',
    ],
    [
      'Lo ves tú',
      'Tu WhatsApp personal',
      'Soy tu asistente virtual de Studio Bella y ya estoy funcionando.',
      'Lo ve tu clienta',
      'Hola, ¿tendrá lugar el sábado?',
      '10:12 a. m.',
      '¡Hola, Ana! Con mucho gusto. El sábado tengo 11:00 am o 4:30 pm. ¿Cuál le queda mejor?',
      '10:12 a. m.',
      'Tu agente ya atiende',
    ],
  ]);
  // Lo que ella llena en el alta es lo mismo que despues ensena la base de conocimiento de su agente.
  const fichaDe = (/** @type {any} */ beneficio) =>
    beneficio.pasos.find((/** @type {any} */ paso) => paso.base).base.renglones;
  assert.deepEqual(fichaDe(empieza[1]), fichaDe(hace[lugarDe('Hecho a la medida de tu negocio')]));
});

test('las escenas de los beneficios dicen lo que aprobo el dueno, pieza por pieza', () => {
  // La de la cita completa tiene su propia prueba: aqui van las demas, en su orden.
  const sinHoras = (/** @type {any} */ beneficio) =>
    dichos(beneficio).filter((texto) => !/^\d+:\d\d [ap]\. m\.$/.test(texto));
  const escenas = hace.slice(1).map(sinHoras);
  assert.equal(escenas.length, 8);
  // La base de conocimiento del negocio de ejemplo y una respuesta que sale de ella, y que el agente da solo.
  assert.deepEqual(escenas[0], [
    'Lo defines tú',
    'Base de conocimiento',
    'Studio Bella · solo de este negocio',
    'Servicios y precios',
    'Gelish $350 · Acrílicas $480',
    'Horarios',
    'Martes a sábado, 10 am a 7 pm',
    'Políticas',
    'Anticipo $150 · Tolerancia de 15 minutos',
    'Lo ve tu clienta',
    'Disculpe, ¿y si llego unos minutos tarde?',
    'No se preocupe, Ana. Tiene 15 minutos de tolerancia. Para no perder su lugar, le recomiendo llegar 5 minutos antes.',
    'Lo sabe porque es la política de tu negocio',
  ]);
  // A cualquier hora: ella escribe en tres mensajes seguidos y el agente contesta una sola vez, todo junto.
  assert.deepEqual(escenas[1], [
    'Lo ve tu clienta',
    'Jueves · 11:48 p. m.',
    'Hola',
    'Buenas noches',
    'Me gustaría saber el precio del gelish',
    '¡Hola, buenas noches! Con mucho gusto. El gelish cuesta $350 y dura de 2 a 3 semanas. ¿Le gustaría agendar su cita?',
    'Esperó a que terminara de escribir y contestó todo junto',
  ]);
  const rafaga = hace[lugarDe('Contesta a cualquier hora')].pasos;
  assert.equal(rafaga.filter((/** @type {any} */ paso) => paso.sale).length, 3);
  assert.equal(rafaga.filter((/** @type {any} */ paso) => paso.entra).length, 1);
  // La agenda: primero lo que ve ella (la oferta y lo que elige) y despues lo que ve la profesional en su calendario.
  assert.deepEqual(escenas[2], [
    'Lo ve tu clienta',
    'Con mucho gusto. Para el sábado le puedo ofrecer 11:00 am o 4:30 pm. ¿Cuál le acomoda?',
    'A las 4:30 pm, por favor.',
    'Lo ves tú',
    'Tu Google Calendar · Sábado',
    '11:00 am',
    'Libre',
    '1:00 pm',
    'Ocupado',
    '4:30 pm',
    'Libre',
    'Ana',
    'Recordatorios: un día y una hora antes',
  ]);
  assert.deepEqual(escenas[3], [
    'Lo ve tu paciente',
    'Sí, aparte el jueves a las 10, por favor.',
    'Anticipo Consulta',
    '$300',
    'mercadopago.com.mx',
    'Con mucho gusto, señora Elvira. Para apartar su consulta, el anticipo es de $300. Aquí está su enlace de pago.',
    'Lo ves tú',
    'Pago aprobado · $300',
    'JUE',
    '19',
    '10:00 am · Elvira',
    'Consulta',
  ]);
  // La nota de voz: ella manda una y el agente contesta con otra. Es de un salon de unas (en salud la voz no esta
  // encendida), y la hora se dice como se oye: "las cinco en punto".
  assert.deepEqual(escenas[4], [
    'Lo ve tu clienta',
    'A',
    '0:07',
    'Escuchó: «Hola, ¿tendrá lugar mañana para un gelish?»',
    'B',
    '0:09',
    'Le contestó con nota de voz: «¡Hola, Ana! Con mucho gusto. Mañana tengo lugar a las cinco en punto. ¿Se lo aparto?»',
  ]);
  const notas = hace[lugarDe('Entiende notas de voz y contesta con voz')].pasos.filter(
    (/** @type {any} */ paso) => paso.voz,
  );
  assert.deepEqual(
    notas.map((/** @type {any} */ paso) => Boolean(paso.voz.entra)),
    [false, true],
  );
  assert.deepEqual(escenas[5], [
    'Lo ve tu clienta',
    'comercial/referencia-unas.webp',
    '¿Cuánto por este diseño?',
    'Vio la foto: francesas con decorado',
    '¡Qué bonito diseño, Ana! Son francesas con decorado y quedan en $420. ¿Le aparto un lugar?',
  ]);
  // Cuando hace falta ella: primero lo que ve la clienta y despues, aparte, el recado que le llega a la profesional.
  assert.deepEqual(escenas[6], [
    'Lo ve tu clienta',
    'Disculpe, se me levantó el gelish que me hice ayer.',
    'Lamento lo que pasó, Ana. Eso lo revisa Bella. Mándeme una foto, por favor, y con gusto le dejo su recado.',
    'Lo ves tú',
    'Tu WhatsApp personal',
    '📩 Ana te dejó un recado en el WhatsApp de Studio Bella: se le levantó el gelish que se hizo ayer y mandó una foto.',
    'Solo te busca cuando hace falta',
  ]);
  // Los cambios, un ejemplo de cada uno: ella lo pide, el agente dice exactamente que va a cambiar y nada se aplica
  // hasta que ella toca que si. Primero un precio y despues un horario.
  assert.deepEqual(escenas[7], [
    'Lo ves tú',
    'Cambio de precio',
    'Sube el gelish a $380',
    'Cambio el precio del gelish de $350 a $380. ¿Lo aplico?',
    'Sí, aplícalo',
    'No',
    'Precio actualizado',
    'Lo ves tú',
    'Cambio de horario',
    'El sábado solo atiendo hasta las 3 pm',
    'Bloqueo este sábado de 3:00 a 7:00 pm: en ese horario no agendo citas. ¿Lo aplico?',
    'Sí, aplícalo',
    'No',
    'Nada cambia sin tu sí',
  ]);
});

test('cuando hace falta la profesional, el agente nunca le promete a la clienta que alguien le va a escribir', () => {
  const escena = hace[lugarDe('Solo te contacta cuando se requiere tu intervención')];
  const delAgente = escena.pasos.find((/** @type {any} */ paso) => paso.entra).entra.texto;
  assert.equal(
    delAgente,
    'Lamento lo que pasó, Ana. Eso lo revisa Bella. Mándeme una foto, por favor, y con gusto le dejo su recado.',
  );
  // Tampoco le promete lo que no le toca decidir (el dueno, 19-nov-2026: "parece que se le esta haciendo una promesa a
  // la clienta... quitemonos la responsabilidad y mejor busquemos la aprobacion del profesional"): ni que el retoque
  // sale sin costo, ni que aplica la garantia, ni que la agenda.
  assert.doesNotMatch(delAgente, /sin costo|no tiene costo|garant[ií]a|agendo|aparto/i);
  // Ni en este ni en ningun otro mini video se piden o se dan descuentos: el agente agenda citas, no define precios.
  for (const beneficio of todos) assert.doesNotMatch(dichos(beneficio).join(' '), /descuento/i, beneficio.titulo);
  for (const promesa of [
    /\b(te|le|la) (va a |van a )?(escrib|contest|llam|busc)/i,
    /en (un momento|breve|seguida)/i,
    /\b(te|le) (aviso|confirmo|consulto|pregunto)/i,
    /se lo (consulto|pregunto)/i,
  ]) {
    assert.doesNotMatch(delAgente, promesa);
  }
  // Y lo de todos los dias no la molesta: el titulo dice justo eso.
  assert.match(escena.texto, /Lo de todos los días lo resuelve tu agente/);
});

test('las horas de los globos van como en el WhatsApp de la demostracion, y un mini video ocurre en un mismo rato', () => {
  // Los largos cuentan mas de un rato (la cita completa, varios dias; los cambios, dos ejemplos): sus rotulos dicen
  // en que momento van.
  for (const beneficio of todos.filter((uno) => !uno.largo)) {
    const horas = dichos(beneficio).filter((texto) => /^\d+:\d\d [ap]\. m\.$/.test(texto));
    // Quien escribe y quien contesta lo hacen en el mismo minuto, o en el siguiente.
    const minutos = horas.map((hora) => {
      const [, h = '0', m = '0', mitad = 'a'] = /^(\d+):(\d\d) ([ap])/.exec(hora) ?? [];
      return (Number(h) % 12) * 60 + Number(m) + (mitad === 'p' ? 720 : 0);
    });
    for (const [lugar, minuto] of minutos.entries()) {
      const anterior = minutos[lugar - 1] ?? minuto;
      assert.ok(minuto - anterior >= 0 && minuto - anterior <= 1, `${beneficio.titulo}: ${horas.join(', ')}`);
    }
  }
});

test('el armado se detiene si a un beneficio le falta algo o su mini video no dura lo que debe', () => {
  /** El de la base de conocimiento: un mini video corto, con seis pasos. */
  const BASE = lugarDe('Hecho a la medida de tu negocio');
  /** @param {(copia: any[]) => void} cambio  lo que se descompone en los beneficios de "Lo que hace" */
  const con = (cambio) => {
    const copia = structuredClone(hace);
    cambio(copia);
    return problemasDeBeneficios([{ clave: 'hace', nombre: 'Lo que hace', videos: copia }]);
  };
  assert.deepEqual(problemasDeBeneficios([]), ['agentes.json: no hay ningun capitulo']);
  assert.deepEqual(problemasDeBeneficios(undefined), ['agentes.json: no hay ningun capitulo']);
  // Un capitulo sin clave, con una clave repetida, sin nombre o sin renglones.
  const uno = { clave: 'hace', nombre: 'Lo que hace', videos: structuredClone(hace) };
  assert.deepEqual(problemasDeBeneficios([uno]), []);
  assert.deepEqual(problemasDeBeneficios([{ ...uno, clave: 'Lo que hace' }]), [
    'agentes.json, capitulo 1: su clave debe ser una palabra en minusculas',
  ]);
  assert.deepEqual(problemasDeBeneficios([uno, { ...uno }]), [
    'agentes.json, capitulo 2: la clave "hace" ya la lleva otro capitulo',
  ]);
  assert.deepEqual(problemasDeBeneficios([{ ...uno, nombre: ' ' }]), ['agentes.json, capitulo 1: le falta el nombre']);
  assert.deepEqual(problemasDeBeneficios([{ ...uno, videos: [] }]), [
    'agentes.json, capitulo 1: no trae ningun renglon',
  ]);
  assert.match(
    con((copia) => {
      copia[0].titulo = ' ';
    })[0] ?? '',
    /capitulo 1, renglon 1: le falta el titulo/,
  );
  assert.match(
    con((copia) => {
      copia[2].texto = undefined;
    })[0] ?? '',
    /renglon 3: le falta la oracion/,
  );
  for (const dura of [5, 9, 7.5, '7', undefined]) {
    assert.match(
      con((copia) => {
        copia[BASE].dura = dura;
      })[0] ?? '',
      /renglon 2: su mini video debe durar de 6 a 8/,
    );
  }
  // El largo, solo quien lo pide: hasta 30 segundos y ni uno mas. Y se pide con true, no con otra cosa.
  for (const dura of [5, 31, 26.5]) {
    assert.match(
      con((copia) => {
        copia[0].dura = dura;
      })[0] ?? '',
      /renglon 1: su mini video debe durar de 6 a 30/,
    );
  }
  assert.match(
    con((copia) => {
      delete copia[0].largo;
    })[0] ?? '',
    /renglon 1: su mini video debe durar de 6 a 8/,
  );
  assert.match(
    con((copia) => {
      copia[BASE].largo = 'si';
    })[0] ?? '',
    /renglon 2: "largo" solo puede ser true/,
  );
  assert.match(
    con((copia) => {
      copia[3].pasos = [];
    })[0] ?? '',
    /renglon 4: su escena no tiene pasos/,
  );
  // Una pieza que la plantilla no sabe dibujar, o dos en un mismo paso.
  assert.match(
    con((copia) => {
      copia[BASE].pasos[1] = { en: 1, globo: {} };
    })[0] ?? '',
    /el paso 2 debe traer una sola pieza/,
  );
  assert.match(
    con((copia) => {
      copia[BASE].pasos[1].hizo = { texto: 'x' };
    })[0] ?? '',
    /el paso 2 debe traer una sola pieza/,
  );
  // El examen ya no es una pieza: el dueno pidio no hablar de examenes.
  assert.match(
    con((copia) => {
      copia[BASE].pasos[1] = { en: 1, examen: { nombre: 'Examen 1' } };
    })[0] ?? '',
    /el paso 2 debe traer una sola pieza/,
  );
  // Los botones de respuesta: una lista, cada uno con su texto.
  for (const botones of [[], 'Sí', [{ toca: true }], [{ texto: ' ' }]]) {
    assert.match(
      con((copia) => {
        copia[BASE].pasos[1] = { en: 1, botones };
      })[0] ?? '',
      /los botones de el paso 2 deben ser una lista, cada uno con su texto/,
    );
  }
  // Fuera de orden, o tan tarde que el video termina antes de que entre.
  assert.match(
    con((copia) => {
      copia[BASE].pasos[2].en = 0.3;
    })[0] ?? '',
    /el paso 3 debe aparecer despues del anterior/,
  );
  assert.match(
    con((copia) => {
      copia[BASE].pasos[3].en = 7.8;
    })[0] ?? '',
    /el paso 4 debe aparecer/,
  );
  // Lo que se va: despues de entrar y antes del final. Y la agenda cambia cuando ya esta a la vista.
  const AGENDA = lugarDe('Maneja tu agenda por ti');
  const pasoDeLaAgenda = hace[AGENDA].pasos.findIndex((/** @type {any} */ paso) => paso.agenda);
  assert.match(
    con((copia) => {
      copia[AGENDA].pasos[1].hasta = copia[AGENDA].pasos[1].en + 0.1;
    })[0] ?? '',
    /el paso 2 debe irse despues de entrar/,
  );
  assert.match(
    con((copia) => {
      copia[AGENDA].pasos[1].hasta = 7.9;
    })[0] ?? '',
    /el paso 2 debe irse/,
  );
  assert.match(
    con((copia) => {
      copia[AGENDA].pasos[pasoDeLaAgenda].agenda.cambia = copia[AGENDA].pasos[pasoDeLaAgenda].en;
    })[0] ?? '',
    new RegExp(`la agenda de el paso ${pasoDeLaAgenda + 1} debe cambiar`),
  );
  // El rotulo de quien lo ve: de la clienta o de la profesional, con su texto; el momento, si viene, tambien.
  for (const quien of [
    { de: 'agente', texto: 'Lo ve el agente' },
    { de: 'clienta' },
    { de: 'tu', texto: ' ' },
    { de: 'tu', texto: 'Lo ves tú', momento: '' },
    'Lo ves tú',
  ]) {
    assert.match(
      con((copia) => {
        copia[BASE].pasos[1] = { en: 1, quien };
      })[0] ?? '',
      /el rotulo de el paso 2 debe decir de quien es \(clienta o tu\) y traer su texto/,
      JSON.stringify(quien),
    );
  }
  // El rotulo suelto de antes ("etiqueta") ya no es una pieza: lo reemplazo el de quien lo ve.
  assert.match(
    con((copia) => {
      copia[BASE].pasos[1] = { en: 1, etiqueta: { texto: 'De usted' } };
    })[0] ?? '',
    /el paso 2 debe traer una sola pieza/,
  );
  // Y el ultimo cuadro nunca queda vacio.
  assert.match(
    con((copia) => {
      for (const paso of copia[7].pasos) paso.hasta = paso.en + 1;
    }).at(-1) ?? '',
    /renglon 8: su ultimo cuadro queda vacio/,
  );
});

test('las piezas que acepta la armada son las que la plantilla sabe dibujar, y la comprobacion no viaja a la pagina', async () => {
  const plantilla = await readFile(path.join(FUENTE, 'plantillas', 'parciales', 'mini-video.html'), 'utf8');
  const dibujadas = [...plantilla.matchAll(/^\{\{(?:\/si\}\}\{\{)?#si (\w+)\}\}/gm)].map(([, pieza]) => pieza);
  assert.deepEqual(dibujadas.toSorted(), [...PIEZAS].sort());
  // Y cada pieza de las escenas de hoy es una de esas.
  const usadas = new Set(
    todos.flatMap((beneficio) =>
      beneficio.pasos.flatMap((/** @type {object} */ paso) =>
        Object.keys(paso).filter((clave) => clave !== 'en' && clave !== 'hasta'),
      ),
    ),
  );
  // Y al reves: ninguna pieza se queda dibujada sin que alguna escena la use.
  assert.deepEqual([...usadas].sort(), [...PIEZAS].sort());
  // Lo que comprueba la armada se queda en la armada: la pagina no carga con ello.
  const codigo = await readFile(path.join(FUENTE, 'js', 'agente.js'), 'utf8');
  assert.ok(!codigo.includes('problemasDeBeneficios') && !codigo.includes('pastilla'));
});

test('lo que tu agente no hace: ya no ofrece pasarle a la clienta, y sus seis renglones siguen completos', () => {
  const renglones = [...agentes.noHace, ...secciones.confianza.noHaceMas].map(({ texto }) => texto);
  assert.deepEqual(renglones, [
    'No confirma una cita sin su anticipo, salvo que tú lo decidas.',
    'No inventa precios: los toma de tu catálogo.',
    'No se hace pasar por una persona: avisa que es un asistente virtual.',
    'No cobra el resto del servicio. Solo el anticipo que garantiza la cita.',
    'No diagnostica ni recomienda medicamentos. Una urgencia te llega a ti.',
    'No te trae clientela nueva: atiende de maravilla a quien ya te escribe.',
  ]);
  // Los tres puntos de la confianza no cambiaron de texto: solo ganaron su icono.
  assert.deepEqual(
    secciones.confianza.lista.map((/** @type {any} */ punto) => [punto.icono, punto.titulo, punto.texto]),
    [
      [
        'celular',
        'Tu número sigue en tu celular',
        'Puedes entrar a cualquier conversación cuando quieras; tu agente se hace a un lado.',
      ],
      [
        'moneda',
        'Tu dinero no pasa por nosotros',
        'Cada anticipo cae directo a tu cuenta de Mercado Pago. No cobramos comisión por cita.',
      ],
      ['perillas', 'Tus reglas', 'Tú pones los precios, los horarios, el anticipo y lo que no haces.'],
    ],
  );
});

// ---------- La pagina armada ----------

/** @type {Map<string, Buffer>} */
let archivos;
let html = '';
let seccion = '';

before(async () => {
  ({ archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' }));
  html = archivos.get('index.html')?.toString('utf8') ?? '';
  seccion = /<section class="agentes" id="agente"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
});

/**
 * Lo que la pagina trae escrito de un capitulo: como llega su menu y sus renglones.
 * @param {string} clave
 */
function capituloEscrito(clave) {
  const [, guardado, numerado, dentro = ''] =
    new RegExp(
      `<div class="agentes__duo" id="capitulo-${clave}" data-agente data-capitulo="${clave}"( data-guardado)?( data-numerado)? data-pausar="Pausar" data-reproducir="Reproducir" data-ver-de-nuevo="Ver de nuevo" data-va-en="\\{va\\} de \\{total\\} segundos">([\\s\\S]*?)\\n {6}</div>\\n`,
    ).exec(seccion) ?? [];
  const renglones = [
    ...dentro.matchAll(
      /<li class="beneficio" data-beneficio( data-abierto data-fase="espera")?>\s*<h3 class="beneficio__nombre"><span class="beneficio__boton" data-beneficio-boton><span class="beneficio__play" aria-hidden="true">(<svg focusable="false"><use href="#i-reproducir"\/><\/svg>|<b>\d+<\/b>)<\/span>([^<]+)<\/span><\/h3>\s*<div class="beneficio__panel" id="(beneficio-[a-z]+-\d+)">\s*<div class="beneficio__dice"><p class="beneficio__texto">([^<]+)<\/p><\/div>/g,
    ),
  ].map(([, abierto, marca, titulo, panel, texto]) => ({ abierto: Boolean(abierto), marca, titulo, panel, texto }));
  return { guardado: Boolean(guardado), numerado: Boolean(numerado), dentro, renglones };
}

test('la pagina trae los dos menus ya escritos: cada renglon con su titulo y su oracion, y solo el primero abierto', () => {
  assert.ok(seccion, 'la pagina no trae la seccion #agente');
  assert.ok(seccion.includes('<p class="sobre">Tu agente</p>'));
  assert.ok(seccion.includes('>Atiende como tú lo harías. <em>A cualquier hora.</em></h2>'));
  // "Lo que hace" llega a la vista, con el triangulo de reproducir en cada renglon.
  const loQueHace = capituloEscrito('hace');
  assert.deepEqual([loQueHace.guardado, loQueHace.numerado], [false, false]);
  assert.deepEqual(
    loQueHace.renglones,
    APROBADOS.map(([titulo, texto], lugar) => ({
      abierto: lugar === 0,
      marca: '<svg focusable="false"><use href="#i-reproducir"/></svg>',
      titulo,
      panel: `beneficio-hace-${lugar + 1}`,
      texto,
    })),
  );
  // "Como empiezas" llega guardado, y en vez del triangulo cada renglon lleva el numero de su paso.
  const comoEmpiezas = capituloEscrito('empieza');
  assert.deepEqual([comoEmpiezas.guardado, comoEmpiezas.numerado], [true, true]);
  assert.deepEqual(
    comoEmpiezas.renglones,
    PASOS_APROBADOS.map(([titulo, texto], lugar) => ({
      abierto: lugar === 0,
      marca: `<b>${lugar + 1}</b>`,
      titulo,
      panel: `beneficio-empieza-${lugar + 1}`,
      texto,
    })),
  );
  assert.equal(seccion.split('<ol class="beneficios" role="list">').length - 1, 2);
  assert.equal(seccion.split(' data-agente ').length - 1, 2);
});

test('el selector de capitulos y lo que cierra cada uno vienen escritos, con los textos de los datos', () => {
  // El selector llega como texto, con el primero marcado: la pieza del menu lo vuelve pestanas de verdad.
  assert.match(
    seccion,
    /<div class="capitulos" data-capitulos data-rotulo="Lo que hace tu agente y cómo empiezas">\s*<span class="capitulo" data-capitulo-boton="hace" data-activo>Lo que hace<\/span>\s*<span class="capitulo" data-capitulo-boton="empieza">Cómo empiezas <small>4 pasos<\/small><\/span>\s*<\/div>/,
  );
  // Cada capitulo dice su nombre arriba de su lista: se lee cuando no hay selector (sin JavaScript, o en papel).
  assert.match(capituloEscrito('hace').dentro, /^\s*<h3 class="agentes__capitulo">Lo que hace<\/h3>/);
  assert.match(capituloEscrito('empieza').dentro, /^\s*<h3 class="agentes__capitulo">Cómo empiezas<\/h3>/);
  // "Lo que hace" termina con el paso al otro capitulo; "Como empiezas", con el boton de empezar y lo que se paga hoy.
  assert.match(
    capituloEscrito('hace').dentro,
    /<p class="agentes__sigue"><span class="agentes__ir" data-capitulo-sigue>Siguiente: cómo empiezas, en 4 pasos<svg aria-hidden="true" focusable="false"><use href="#i-flecha"\/><\/svg><\/span><\/p>\s*$/,
  );
  assert.doesNotMatch(capituloEscrito('hace').dentro, /agentes__arranca/);
  assert.match(
    capituloEscrito('empieza').dentro,
    /<p class="agentes__arranca"><a class="boton boton--luz" href="https:\/\/alta\.prompt-maestro\.com\/" data-lugar="agente">Empieza ahora<\/a> <span>Hoy pagas solo la instalación\.<\/span><\/p>\s*$/,
  );
  assert.doesNotMatch(capituloEscrito('empieza').dentro, /agentes__sigue/);
  // La seccion vieja ya no existe, y el enlace de la barra que llevaba a ella ahora trae a esta.
  assert.ok(!html.includes('id="como-funciona"'));
  assert.match(html, /<a class="barra__enlace" href="#agente" data-lugar="barra">Cómo funciona<\/a>/);
});

test('sin JavaScript no hay un solo boton en la seccion: los pone la pieza del menu cuando llega', () => {
  // Lo unico con forma de boton vive dentro de una plantilla, que el navegador no pinta ni deja tocar.
  const sinPlantilla = seccion.replace(/<template[\s\S]*?<\/template>/g, '');
  assert.doesNotMatch(sinPlantilla, /<button|role="button"|tabindex/);
  assert.equal(seccion.split('<template data-mv-barra>').length - 1, 1);
  const barra = /<template data-mv-barra>([\s\S]*?)<\/template>/.exec(seccion)?.[1] ?? '';
  // El boton de la barra nace diciendo lo que hace, y sus tres nombres viajan en la pagina, no en el codigo.
  assert.match(
    barra,
    /<button class="mv__pausa" type="button" data-mv-pausa data-estado="pausar" aria-label="Pausar">/,
  );
  assert.equal(
    seccion.split(
      ' data-pausar="Pausar" data-reproducir="Reproducir" data-ver-de-nuevo="Ver de nuevo" data-va-en="{va} de {total} segundos">',
    ).length - 1,
    2,
  );
  assert.deepEqual(agentes.rotulos, {
    pausar: 'Pausar',
    reproducir: 'Reproducir',
    verDeNuevo: 'Ver de nuevo',
    capitulos: 'Lo que hace tu agente y cómo empiezas',
    avance: 'Avance del video',
    vaEn: '{va} de {total} segundos',
  });
  // La linea de avance nace como un control que se agarra: dice que es y desde donde cuenta. Lo demas (hasta donde
  // llega y por donde va) lo pone la pieza del menu, que sabe cuanto dura cada mini video.
  assert.match(
    barra,
    /<span class="mv__linea" data-mv-linea role="slider" tabindex="0" aria-label="Avance del video" aria-valuemin="0" aria-valuenow="0"><i class="mv__avance" data-mv-avance><\/i><i class="mv__perilla"><\/i><\/span>/,
  );
  // Tampoco hay pestanas ni paneles antes de tiempo: sin la pieza, el selector no promete lo que no puede hacer.
  assert.doesNotMatch(sinPlantilla, /role="tab|aria-selected|aria-controls/);
});

test('cada beneficio trae su mini video escrito: una escena de adorno, con lo que dura y cada pieza a su tiempo', () => {
  const videos = [
    ...seccion.matchAll(
      /<div class="mv__riel"><div class="mv( mv--alta)?" data-mv data-dura="(\d+)">\s*(<template data-mv-guardada>)?\s*<div class="mv__escena" aria-hidden="true">([\s\S]*?)<\/div>\s*<\/div>\s*(?:<\/template>\s*)?<\/div><\/div>\s*<\/div>\s*<\/li>/g,
    ),
  ];
  assert.equal(videos.length, todos.length);
  /** El primer renglon de cada capitulo: el que llega abierto. */
  const primeros = new Set([hace[0], empieza[0]]);
  for (const [lugar, [, alta, dura, guardada, escena = '']] of videos.entries()) {
    const beneficio = todos[lugar];
    // La escena del que llega abierto viene en la pagina. Las demas viajan guardadas en una plantilla (el navegador no
    // las pinta ni carga con ellas) y la pieza del menu las saca la primera vez que se abren.
    assert.equal(Boolean(guardada), !primeros.has(beneficio), beneficio.titulo);
    // Las escenas que traen una ficha grande o varios globos a la vez piden una pantalla mas alta en el acordeon: su
    // alto viene escrito en la pagina, con los datos.
    assert.equal(Boolean(alta), beneficio.alta === true, beneficio.titulo);
    assert.equal(Number(dura), beneficio.dura, beneficio.titulo);
    const pasos = [...escena.matchAll(/<div class="mv__paso" data-en="([\d.]+)"(?: data-hasta="([\d.]+)")?>/g)].map(
      ([, en, hasta]) => (hasta ? { en: Number(en), hasta: Number(hasta) } : { en: Number(en) }),
    );
    assert.deepEqual(
      pasos,
      beneficio.pasos.map((/** @type {{ en: number, hasta?: number }} */ { en, hasta }) =>
        hasta ? { en, hasta } : { en },
      ),
      beneficio.titulo,
    );
    // Todo lo que la escena dice esta en la pagina, y nada de eso vive en la plantilla ni en el codigo.
    const escrito = escena
      .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    for (const texto of dichos(beneficio)) {
      if (texto.includes('/')) assert.ok(escena.includes(texto), texto);
      else assert.ok(escrito.includes(texto), `${beneficio.titulo}: ${texto}`);
    }
  }
  // La foto de referencia es la que ya estaba en el repo, y no se pide hasta que haga falta.
  assert.match(
    seccion,
    /<img class="mv__foto" src="\/r\/[0-9a-f]{10}\/comercial\/referencia-unas\.webp" alt="" width="336" height="336" loading="lazy" decoding="async">/,
  );
  assert.equal(seccion.split('<img ').length - 1, 1);
  // La primera de la seccion, la de la cita completa, llega con pantalla alta: es la que se ve al llegar y nada se
  // mueve cuando el menu despierta.
  assert.equal(hace[0].alta, true);
  // Y los tres sellos: el de la cita completa, el de la agenda y el de la consulta ya pagada.
  assert.equal(seccion.split('class="sello"').length - 1, 3);
  // Cada plantilla guardada se cierra, y no hay una dentro de otra: todas menos la primera de cada capitulo, y la barra.
  assert.equal(seccion.split('<template data-mv-guardada>').length - 1, todos.length - 2);
  assert.equal(seccion.split('</template>').length - 1, todos.length - 1);
});

test('ningun texto de la seccion vive en el codigo ni en los estilos: todo sale de los datos', async () => {
  const codigo = [
    await readFile(path.join(FUENTE, 'js', 'agente.js'), 'utf8'),
    await readFile(path.join(FUENTE, 'js', 'agente-vista.js'), 'utf8'),
    await readFile(path.join(FUENTE, 'estilos', 'agentes.css'), 'utf8'),
    await readFile(path.join(FUENTE, 'plantillas', 'parciales', 'mini-video.html'), 'utf8'),
  ].join('\n');
  const textos = [
    ...Object.values(agentes.rotulos),
    capitulos[0].sigue,
    capitulos[1].arranca,
    ...todos.flatMap((beneficio) => [beneficio.titulo, beneficio.texto, ...dichos(beneficio)]),
  ].filter((texto) => texto.length > 4 && !texto.includes('/'));
  assert.ok(textos.length > 100);
  for (const texto of textos) assert.ok(!codigo.includes(texto), texto);
});

test('las tres tarjetas de la confianza llevan su icono y los seis renglones de lo que no hace, su tacha', () => {
  const tarjetas = [
    ...seccion.matchAll(
      /<li><svg class="agentes__icono" aria-hidden="true" focusable="false"><use href="#i-(\w+)"\/><\/svg><div><h4>([^<]+)<\/h4><p>([^<]+)<\/p><\/div><\/li>/g,
    ),
  ].map(([, icono, titulo, texto]) => ({ icono, titulo, texto }));
  assert.deepEqual(tarjetas, secciones.confianza.lista);
  assert.ok(seccion.includes('>Tu número, tu dinero, <em>tus reglas.</em></h3>'));
  const renglones = [
    ...seccion.matchAll(
      /<li><svg class="agentes__tacha" aria-hidden="true" focusable="false"><use href="#i-tacha"\/><\/svg>([^<]+)<\/li>/g,
    ),
  ].map(([, texto]) => texto);
  assert.equal(renglones.length, 6);
  assert.equal(renglones[2], 'No se hace pasar por una persona: avisa que es un asistente virtual.');
  assert.ok(seccion.includes('<h3 class="agentes__subtitulo">Lo que tu agente no hace</h3>'));
  // Cada icono que la seccion pide esta dibujado en la pagina, una sola vez.
  const pedidos = new Set([...seccion.matchAll(/<use href="#(i-\w+)"/g)].map(([, id]) => id));
  assert.deepEqual([...pedidos].sort(), [
    'i-celular',
    'i-flecha',
    'i-libreta',
    'i-luna',
    'i-moneda',
    'i-palomita',
    'i-pausa',
    'i-perillas',
    'i-repite',
    'i-reproducir',
    'i-tacha',
    'i-tics',
  ]);
  for (const id of pedidos) assert.equal(html.split(`<symbol id="${id}"`).length - 1, 1, id);
});

test('las dos piezas del menu se adelantan solo en pantallas anchas, y pagina.js es quien las monta', async () => {
  for (const pieza of ['agente-vista.js', 'agente.js']) {
    assert.match(
      html,
      new RegExp(
        `<link rel="modulepreload" media="\\(min-width: 900px\\) and \\(min-aspect-ratio: 1/1\\)" href="/a/[0-9a-f]{10}/js/${pieza.replace('.', '\\.')}">`,
      ),
    );
    assert.ok(
      [...archivos.keys()].some((ruta) => ruta.endsWith(`/js/${pieza}`)),
      pieza,
    );
  }
  const pagina = await readFile(path.join(FUENTE, 'js', 'pagina.js'), 'utf8');
  assert.ok(pagina.includes("import('./agente-vista.js')"));
  assert.ok(pagina.includes('montarAgentes(agentes)'));
  // Y si no arranca completa (un menu o el selector), pagina.js anota toda la seccion para que los estilos la ensenen
  // como lista: los dos capitulos a la vista, sin selector.
  assert.ok(pagina.includes("document.querySelector(':is([data-agente], [data-capitulos]):not([data-viva])')"));
  assert.ok(pagina.includes("for (const parte of document.querySelectorAll('[data-agente], [data-capitulos]'))"));
  assert.ok(pagina.includes("parte.setAttribute('data-lista', '');"));
});

test('llms.txt cuenta los diez beneficios, los cuatro pasos para empezar y lo que el agente no hace', () => {
  const llms = archivos.get('llms.txt')?.toString('utf8') ?? '';
  const hechos = /## Lo que hace el agente\n\n([\s\S]*?)\n\n## /.exec(llms)?.[1]?.split('\n');
  assert.deepEqual(
    hechos,
    APROBADOS.map(([titulo, texto]) => `- ${titulo}: ${texto}`),
  );
  const pasos = /## Cómo empiezas\n\n([\s\S]*?)\n\n## /.exec(llms)?.[1]?.split('\n');
  assert.deepEqual(
    pasos,
    PASOS_APROBADOS.map(([titulo, texto], lugar) => `${lugar + 1}. ${titulo}: ${texto}`),
  );
  // La seccion vieja, con sus nueve pasos, ya no se cuenta. Ni se habla de examenes.
  assert.ok(!llms.includes('## Cómo funciona'));
  assert.doesNotMatch(/## Lo que hace el agente[\s\S]*?## Lo que no hace/.exec(llms)?.[0] ?? '', /ex[aá]men/i);
  const limites = /## Lo que no hace\n\n([\s\S]*?)\n\n## /.exec(llms)?.[1] ?? '';
  assert.ok(limites.includes('- No se hace pasar por una persona: avisa que es un asistente virtual.'));
  assert.doesNotMatch(llms, /te la pasa|si tu clienta lo pide/i);
  // Lo que viaja a los modelos de lenguaje es el titulo y la oracion: de la escena, nada.
  assert.ok(!llms.includes('señor Medina'));
});
