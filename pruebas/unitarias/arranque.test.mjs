// @ts-check
// arranque.js corre en el <head>, antes del primer pintado, y no es un modulo: aqui se corre tal cual, con una pagina
// de mentiras, para comprobar lo que deja escrito. Lo que importa: que oficio elige para el inicio (el cartel del
// celular y el corto de las pantallas anchas), y que foto adelanta donde el corto va a correr solo.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODIGO = await readFile(path.join(RAIZ, 'fuente', 'js', 'arranque.js'), 'utf8');
const OFICIOS = ['unas', 'dentista', 'medico'];
/** Lo que la etiqueta del archivo dice de la foto de cada escena del corto: sus archivos y lo que mide. */
const FOTOS = '/r/comercial/*-escena-1600.avif 1600w, /r/comercial/*-escena-2560.avif 2560w';
const MIDE = '150vw';
/** Donde el corto corre solo: pantalla ancha, no muy bajita y con movimiento. */
const CORRE_SOLO =
  '(min-width: 900px) and (min-aspect-ratio: 1/1) and (min-height: 480px) and (prefers-reduced-motion: no-preference)';

/**
 * Una escena del inicio como viaja en la pagina (la del cartel, data-duo, o una del corto, data-escena): la primera
 * a la vista y las demas guardadas.
 * @param {string} clave
 * @param {boolean} guardada
 * @param {'data-duo' | 'data-escena'} [dato]
 */
function escena(clave, guardada, dato = 'data-duo') {
  return {
    clave,
    guardada,
    /** @param {string} nombre */
    getAttribute: (nombre) => (nombre === dato ? clave : null),
    /**
     * @param {string} nombre
     * @param {boolean} valor
     */
    toggleAttribute(nombre, valor) {
      if (nombre === 'hidden') this.guardada = valor;
    },
  };
}

/**
 * Corre arranque.js en una pagina de mentiras.
 * @param {object} pagina
 * @param {number} pagina.azar              lo que contesta Math.random
 * @param {string | null} [pagina.oficios]  lo que dice la etiqueta del archivo (null: no hay etiqueta a la vista)
 * @param {boolean} [pagina.correSolo]      si en esta pantalla el corto corre solo (ancha, con movimiento)
 * @param {object} [pagina.conexion]        lo que el navegador dice de la conexion (navigator.connection), si lo dice
 */
function correr({ azar, oficios = OFICIOS.join(' '), correSolo = false, conexion = undefined }) {
  /** @type {Set<string>} */
  const clases = new Set();
  /** @type {Record<string, string>} */
  const datos = {};
  /** @type {ReturnType<typeof escena>[]} */
  const escenas = [];
  /** @type {Record<string, (() => void)[]>} */
  const escuchas = {};
  /** @type {{ aviso: () => void, que: unknown, opciones: unknown, desconectado: boolean }[]} */
  const vigias = [];
  /** Lo que el archivo deja en el <head>: cada etiqueta, con sus atributos. */
  /** @type {{ etiqueta: string, atributos: Record<string, string> }[]} */
  const cabeza = [];
  /** Las preguntas que le hace a la pantalla. */
  /** @type {string[]} */
  const preguntas = [];
  /** @type {Record<string, string>} */
  const atributos = {};
  /** La etiqueta del archivo: dice los oficios y, con "data-escena", las fotos que se adelantan. No es una escena. */
  const etiqueta = {
    dataset: { oficios, escena: FOTOS, escenaMide: MIDE },
    guardada: false,
    /** @param {string} nombre */
    getAttribute: (nombre) => (nombre === 'data-escena' ? FOTOS : null),
    /**
     * @param {string} nombre
     * @param {boolean} valor
     */
    toggleAttribute(nombre, valor) {
      if (nombre === 'hidden') this.guardada = valor;
    },
  };
  const raiz = {
    classList: {
      add: (/** @type {string[]} */ ...nombres) => {
        for (const nombre of nombres) clases.add(nombre);
      },
      remove: (/** @type {string} */ nombre) => clases.delete(nombre),
    },
    dataset: datos,
    hasAttribute: () => false,
    /**
     * @param {string} nombre
     * @param {string} valor
     */
    setAttribute: (nombre, valor) => {
      atributos[nombre] = valor;
    },
  };
  class Vigia {
    /** @param {() => void} aviso */
    constructor(aviso) {
      this.aviso = aviso;
      this.que = null;
      this.opciones = null;
      this.desconectado = false;
      vigias.push(this);
    }

    /**
     * @param {unknown} que
     * @param {unknown} opciones
     */
    observe(que, opciones) {
      this.que = que;
      this.opciones = opciones;
    }

    disconnect() {
      this.desconectado = true;
    }
  }
  /**
   * @param {string} tipo
   * @param {() => void} escucha
   */
  const escuchar = (tipo, escucha) => {
    escuchas[tipo] = [...(escuchas[tipo] ?? []), escucha];
  };
  const contexto = vm.createContext({
    document: {
      documentElement: raiz,
      currentScript: oficios === null ? null : etiqueta,
      // Contesta como el navegador las dos maneras de preguntar por las escenas: si la pregunta no descarta las
      // etiquetas <script>, la del archivo tambien sale, porque dice "data-escena".
      querySelectorAll: (/** @type {string} */ selector) => {
        if (selector === '[data-duo], [data-escena]:not(script)') return escenas;
        return selector === '[data-duo], [data-escena]' ? [etiqueta, ...escenas] : [];
      },
      querySelector: () => null,
      addEventListener: escuchar,
      createElement: (/** @type {string} */ etiqueta) => {
        /** @type {Record<string, string>} */
        const suyos = {};
        return {
          etiqueta,
          atributos: suyos,
          /**
           * @param {string} nombre
           * @param {string} valor
           */
          setAttribute: (nombre, valor) => {
            suyos[nombre] = valor;
          },
        };
      },
      head: {
        append: (/** @type {{ etiqueta: string, atributos: Record<string, string> }} */ uno) => cabeza.push(uno),
      },
    },
    window: { addEventListener: escuchar },
    navigator: conexion === undefined ? {} : { connection: conexion },
    matchMedia: (/** @type {string} */ pregunta) => {
      preguntas.push(pregunta);
      return { matches: correSolo };
    },
    MutationObserver: Vigia,
    Math: Object.assign(Object.create(Math), { random: () => azar }),
  });
  vm.runInContext(CODIGO, contexto);
  return {
    raiz,
    clases,
    datos,
    atributos,
    etiqueta,
    escenas,
    vigias,
    cabeza,
    preguntas,
    /** Lo que pasa cuando la pagina termina de leerse. */
    terminarDeLeer() {
      for (const escucha of escuchas.DOMContentLoaded ?? []) escucha();
    },
  };
}

/** @param {ReturnType<typeof escena>[]} escenas */
const aLaVista = (escenas) => escenas.filter((una) => !una.guardada).map((una) => una.clave);

test('marca que hay JavaScript antes de pintar', () => {
  const { clases } = correr({ azar: 0 });
  assert.deepEqual([...clases].sort(), ['con-corto', 'con-cuenta', 'con-js']);
});

test('elige un oficio segun el azar y lo deja escrito en <html>: a cada uno le toca su parte', () => {
  for (const [azar, esperado] of /** @type {[number, string][]} */ ([
    [0, 'unas'],
    [0.2, 'unas'],
    [0.3333, 'unas'],
    [0.3334, 'dentista'],
    [0.5, 'dentista'],
    [0.6666, 'dentista'],
    [0.6667, 'medico'],
    [0.9999999, 'medico'],
  ])) {
    assert.equal(correr({ azar }).datos.oficio, esperado, `con ${azar}`);
  }
  // Parejo: de trescientas visitas repartidas, cien para cada oficio.
  /** @type {Record<string, number>} */
  const cuenta = {};
  for (let visita = 0; visita < 300; visita++) {
    const { oficio = '' } = correr({ azar: (visita + 0.5) / 300 }).datos;
    cuenta[oficio] = (cuenta[oficio] ?? 0) + 1;
  }
  assert.deepEqual(cuenta, { unas: 100, dentista: 100, medico: 100 });
});

test('los oficios salen de la etiqueta del archivo: sumar uno no toca el codigo', () => {
  const cuatro = 'unas dentista medico nutriologa';
  assert.equal(correr({ azar: 0.76, oficios: cuatro }).datos.oficio, 'nutriologa');
  assert.equal(correr({ azar: 0.74, oficios: cuatro }).datos.oficio, 'medico');
  assert.equal(correr({ azar: 0.99, oficios: 'unas' }).datos.oficio, 'unas');
  // Espacios de mas no inventan un oficio vacio.
  assert.equal(correr({ azar: 0.99, oficios: ' unas  dentista ' }).datos.oficio, 'dentista');
});

test('sin oficios que elegir no elige nada ni vigila nada: se queda la primera escena, como sin JavaScript', () => {
  for (const oficios of ['', '   ', null]) {
    const { datos, vigias, clases } = correr({ azar: 0.5, oficios });
    assert.equal('oficio' in datos, false);
    assert.equal(vigias.length, 0);
    // Lo demas del arranque sigue en pie.
    assert.ok(clases.has('con-js'));
  }
});

test('cada escena se guarda o se ensena en cuanto el navegador la lee: nunca queda a la vista una que no es la elegida', () => {
  const pagina = correr({ azar: 0.5 });
  assert.equal(pagina.datos.oficio, 'dentista');
  const [vigia] = pagina.vigias;
  assert.ok(vigia, 'vigila lo que el navegador va leyendo');
  assert.equal(vigia.que, pagina.raiz);
  // Lo que el archivo crea vive en su propio mundo: se compara escrito.
  assert.equal(JSON.stringify(vigia.opciones), JSON.stringify({ childList: true, subtree: true }));
  // El navegador puede entregar la pagina por pedazos: primero llega una escena, luego las otras.
  pagina.escenas.push(escena('unas', false));
  vigia.aviso();
  assert.deepEqual(aLaVista(pagina.escenas), []);
  pagina.escenas.push(escena('dentista', true), escena('medico', true));
  vigia.aviso();
  assert.deepEqual(aLaVista(pagina.escenas), ['dentista']);
  // Al terminar de leer la pagina deja de vigilar, y todo queda como estaba.
  assert.equal(vigia.desconectado, false);
  pagina.terminarDeLeer();
  assert.equal(vigia.desconectado, true);
  assert.deepEqual(aLaVista(pagina.escenas), ['dentista']);
});

test('si le toca el primer oficio, la pagina queda como venia escrita', () => {
  const pagina = correr({ azar: 0.1 });
  pagina.escenas.push(escena('unas', false), escena('dentista', true), escena('medico', true));
  pagina.vigias[0]?.aviso();
  pagina.terminarDeLeer();
  assert.deepEqual(aLaVista(pagina.escenas), ['unas']);
});

test('las escenas del corto se guardan igual que la del cartel: a la vista queda solo la del oficio elegido', () => {
  const pagina = correr({ azar: 0.9 });
  assert.equal(pagina.datos.oficio, 'medico');
  // Una del cartel y, por cada oficio, la del corto con luz calida y con luz fria: llegan en el orden de la pagina.
  pagina.escenas.push(escena('unas', false), escena('dentista', true), escena('medico', true));
  for (const _luz of ['calida', 'fria']) {
    pagina.escenas.push(
      escena('unas', false, 'data-escena'),
      escena('dentista', true, 'data-escena'),
      escena('medico', true, 'data-escena'),
    );
    pagina.vigias[0]?.aviso();
    assert.deepEqual(aLaVista(pagina.escenas.slice(0, 3)), ['medico']);
    assert.ok(aLaVista(pagina.escenas.slice(3)).every((clave) => clave === 'medico'));
  }
  pagina.terminarDeLeer();
  assert.deepEqual(aLaVista(pagina.escenas), ['medico', 'medico', 'medico']);
});

test('la etiqueta del archivo tambien dice "data-escena" (las fotos que se adelantan) y no es una escena: nadie la guarda', () => {
  const pagina = correr({ azar: 0.5 });
  pagina.escenas.push(escena('unas', false, 'data-escena'), escena('dentista', true, 'data-escena'));
  pagina.vigias[0]?.aviso();
  pagina.terminarDeLeer();
  assert.equal(pagina.etiqueta.guardada, false, 'la etiqueta quedo con "hidden"');
  assert.deepEqual(aLaVista(pagina.escenas), ['dentista']);
});

test('donde el corto corre solo adelanta la foto del oficio elegido, y solo esa', () => {
  for (const [azar, elegido] of /** @type {[number, string][]} */ ([
    [0.1, 'unas'],
    [0.5, 'dentista'],
    [0.9, 'medico'],
  ])) {
    const { cabeza, preguntas } = correr({ azar, correSolo: true });
    // La misma pregunta que hacen los estilos y corto-vista.js: pantalla ancha, no muy bajita y con movimiento.
    assert.deepEqual(preguntas, [CORRE_SOLO]);
    assert.equal(cabeza.length, 1, `con ${azar}`);
    const [adelanto] = cabeza;
    assert.equal(adelanto?.etiqueta, 'link');
    assert.deepEqual(adelanto?.atributos, {
      rel: 'preload',
      as: 'image',
      type: 'image/avif',
      imagesrcset: FOTOS.replaceAll('*', elegido),
      imagesizes: MIDE,
      fetchpriority: 'high',
    });
  }
});

test('en celular, con movimiento reducido o sin oficio que elegir no adelanta ninguna foto del corto', () => {
  assert.deepEqual(correr({ azar: 0.5, correSolo: false }).cabeza, []);
  for (const oficios of ['', null]) assert.deepEqual(correr({ azar: 0.5, oficios, correSolo: true }).cabeza, []);
});

test('con ahorro de datos o conexion lenta lo anota en <html> y no adelanta nada: el corto no correra solo', () => {
  for (const conexion of [
    { saveData: true },
    { effectiveType: 'slow-2g' },
    { effectiveType: '2g' },
    { effectiveType: '3g' },
  ]) {
    const { atributos, cabeza, datos } = correr({ azar: 0.5, correSolo: true, conexion });
    assert.deepEqual(atributos, { 'data-ahorro': '' }, JSON.stringify(conexion));
    assert.deepEqual(cabeza, [], JSON.stringify(conexion));
    // El oficio se elige igual: el cartel lo necesita.
    assert.equal(datos.oficio, 'dentista');
  }
  // Una conexion buena, o un navegador que no dice nada de su conexion, no anota nada.
  for (const conexion of [{ saveData: false, effectiveType: '4g' }, {}, undefined]) {
    const { atributos, cabeza } = correr({ azar: 0.5, correSolo: true, conexion });
    assert.deepEqual(atributos, {}, JSON.stringify(conexion));
    assert.equal(cabeza.length, 1);
  }
});
