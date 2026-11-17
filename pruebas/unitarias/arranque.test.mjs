// @ts-check
// arranque.js corre en el <head>, antes del primer pintado, y no es un modulo: aqui se corre tal cual, con una pagina
// de mentiras, para comprobar lo que deja escrito. Lo que importa: que oficio elige para el cartel del celular.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODIGO = await readFile(path.join(RAIZ, 'fuente', 'js', 'arranque.js'), 'utf8');
const OFICIOS = ['unas', 'dentista', 'medico'];

/**
 * Una escena del cartel como viaja en la pagina: la primera a la vista y las demas guardadas.
 * @param {string} clave
 * @param {boolean} guardada
 */
function escena(clave, guardada) {
  return {
    clave,
    guardada,
    /** @param {string} nombre */
    getAttribute: (nombre) => (nombre === 'data-duo' ? clave : null),
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
 */
function correr({ azar, oficios = OFICIOS.join(' ') }) {
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
  const raiz = {
    classList: {
      add: (/** @type {string[]} */ ...nombres) => {
        for (const nombre of nombres) clases.add(nombre);
      },
      remove: (/** @type {string} */ nombre) => clases.delete(nombre),
    },
    dataset: datos,
    hasAttribute: () => false,
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
      currentScript: oficios === null ? null : { dataset: { oficios } },
      querySelectorAll: (/** @type {string} */ selector) => (selector === '[data-duo]' ? escenas : []),
      querySelector: () => null,
      addEventListener: escuchar,
    },
    window: { addEventListener: escuchar },
    MutationObserver: Vigia,
    Math: Object.assign(Object.create(Math), { random: () => azar }),
  });
  vm.runInContext(CODIGO, contexto);
  return {
    raiz,
    clases,
    datos,
    escenas,
    vigias,
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
