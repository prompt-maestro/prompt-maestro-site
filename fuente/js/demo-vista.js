// @ts-check
// La vista de la demostracion: pinta lo que demo.js decide. Aqui viven los tiempos, el foco y el movimiento; ninguna
// regla de la historia. Si el visitante pidio menos movimiento, cada paso aparece completo y sin animacion, pero
// conserva el tiempo para leer entre un paso y el siguiente.
import {
  accionesDe,
  avanzar,
  elegirEjemplo,
  escenaDe,
  estadoInicial,
  opcionesDeEjemplo,
  porDefecto,
  presentacionDe,
  rotulosDeEjemplo,
} from './demo.js';
import { conMayuscula, pesos } from './redaccion.js';

/** @typedef {import('./demo.js').Ejemplo} Ejemplo */
/** @typedef {import('./demo.js').Evento} Evento */
/** @typedef {import('./demo.js').Accion} Accion */
/** @typedef {import('./demo.js').Entrada} Entrada */
/** @typedef {import('./demo.js').LoQueVesTu} LoQueVesTu */
/** @typedef {import('./demo.js').Telefono} Telefono */

// Pausas de animacion: desaparecen con movimiento reducido.
const PAUSA_ENTRE_BURBUJAS = 320;
/** Lo que dura a la vista la acotacion que avisa el cambio de papel, antes de que el asistente escriba. */
const PAUSA_DE_LA_ACOTACION = 1900;
/** Tras "Pago aprobado": el dinero, despues la cita, despues el sello, y un silencio para que el sello se vea. */
const PAUSA_DEL_DINERO_A_LA_CITA = 600;
const PAUSA_DE_LA_CITA_AL_SELLO = 500;
const SILENCIO_TRAS_EL_SELLO = 1100;
/** En el cuadro final los sellos caen uno tras otro. */
const PAUSA_ENTRE_SELLOS = 240;

// Pausas para leer: se respetan siempre.
const ESPERA_PARA_ARRANCAR_SOLA = 4000;
const PAUSA_ENTRE_PASOS = 1300;
const PAUSA_ANTES_DEL_CIERRE = 2200;
/** Lo minimo entre un toque y los botones del paso siguiente: un segundo toque sin querer no elige nada. */
const PASO_MINIMO = 350;

/**
 * @template {keyof HTMLElementTagNameMap} E
 * @param {E} etiqueta
 * @param {string} clase
 * @param {string} [texto]
 * @returns {HTMLElementTagNameMap[E]}
 */
function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

/**
 * @param {ParentNode} raiz
 * @param {string} selector
 * @returns {HTMLElement}
 */
function pieza(raiz, selector) {
  const elemento = raiz.querySelector(selector);
  if (!(elemento instanceof HTMLElement)) throw new Error(`Demostracion: falta ${selector}`);
  return elemento;
}

/** @param {string | undefined} estado  si ese renglon de la agenda ya lleva sello */
const llevaSello = (estado) => estado === 'garantizada' || estado === 'asistio' || estado === 'falto';

/**
 * Da vida a la demostracion que ya viene escrita en la pagina.
 * @param {HTMLElement} raiz
 */
export function montarDemo(raiz) {
  const datos = JSON.parse(pieza(raiz, '[data-demo-datos]').textContent ?? '');
  /** @type {Ejemplo[]} */
  const ejemplos = datos.ejemplos.map((/** @type {Pick<Ejemplo, 'giro' | 'guion'>} */ ejemplo) => ({
    ...ejemplo,
    fijos: datos.fijos,
    tu: datos.tu,
    rotulos: datos.rotulos,
  }));
  /** @type {Record<string, string>} */
  const rotulos = datos.rotulos;
  const rotulo = (/** @type {string} */ clave) => rotulos[clave] ?? clave;

  const chat = pieza(raiz, '[data-demo-chat]');
  const pie = pieza(raiz, '[data-demo-pie]');
  const tu = pieza(raiz, '[data-demo-tu]');
  const tuResumen = pieza(raiz, '[data-demo-tu-resumen]');
  const agendaDia = pieza(raiz, '[data-demo-dia]');
  const agendaFilas = pieza(raiz, '[data-demo-filas]');
  const anuncio = pieza(raiz, '[data-demo-anuncio]');
  const iniciales = pieza(raiz, '[data-demo-iniciales]');
  const nombre = pieza(raiz, '[data-demo-nombre]');
  const atiende = pieza(raiz, '[data-demo-atiende]');
  const leyenda = pieza(raiz, '[data-demo-leyenda]');
  const botonesDeEjemplo = /** @type {NodeListOf<HTMLButtonElement>} */ (raiz.querySelectorAll('[data-demo-ejemplo]'));
  const plantillaSello = /** @type {HTMLTemplateElement} */ (pieza(raiz, '[data-demo-sello]'));
  const plantillaPalomita = /** @type {HTMLTemplateElement} */ (pieza(raiz, '[data-demo-palomita]'));
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

  // La pagina llega con el primer ejemplo; la visitante puede elegir otro.
  let ejemplo = /** @type {Ejemplo} */ (ejemplos[0]);
  let estado = estadoInicial();
  /** @type {Telefono} */
  let telefono = 'cliente';
  /** @type {HTMLElement | null} */
  let cobro = null;
  let ocupada = false;
  let sola = false;
  let tocada = false;
  // Cada paso y cada reinicio cambian el turno: lo que quedo esperando de un turno viejo ya no pinta ni avanza nada.
  let turno = 0;
  // Quien avanza con el teclado no pierde su lugar: el foco pasa a lo siguiente que se puede hacer.
  let devolverFoco = false;

  /** @param {number} ms */
  const leer = (ms) => /** @type {Promise<void>} */ (new Promise((listo) => setTimeout(listo, ms)));
  /** @param {number} ms */
  const animar = (ms) => leer(sinMovimiento.matches ? 0 : ms);

  function alFinal() {
    chat.scrollTop = chat.scrollHeight;
  }

  /**
   * Avisa lo que pasa en la historia, para quien quiera enterarse: un evento "demo:..." que sale de la raiz y sube por
   * el documento, con el ejemplo puesto y lo propio de cada aviso. La historia no espera respuesta ni depende de que
   * alguien escuche.
   * @param {'inicio' | 'paso' | 'fin' | 'ejemplo'} que
   * @param {Record<string, string | boolean>} [detalle]
   */
  function avisar(que, detalle) {
    const detail = { giro: ejemplo.giro.clave, ...detalle };
    raiz.dispatchEvent(new CustomEvent(`demo:${que}`, { bubbles: true, detail }));
  }

  /**
   * Cambia de quien es el telefono: su cabecera y, a escenario limpio, la acotacion que le dice a la visitante que
   * papel le toca ahora.
   * @param {Telefono} cual
   * @returns {string} la acotacion
   */
  function presentar(cual) {
    const presentacion = presentacionDe(ejemplo.giro, rotulos, cual);
    telefono = cual;
    cobro = null;
    raiz.dataset.telefono = cual;
    iniciales.textContent = presentacion.iniciales;
    nombre.textContent = presentacion.nombre;
    atiende.textContent = presentacion.atiende;
    // La acotacion la anuncia la region de avisos; aqui va escondida para el lector, que si no la diria dos veces.
    const acotacion = crear('p', 'chat__salto', presentacion.papel);
    acotacion.setAttribute('aria-hidden', 'true');
    chat.replaceChildren(acotacion);
    chat.dataset.acotacion = '';
    return presentacion.papel;
  }

  /**
   * @param {'cliente' | 'profesional' | 'asistente'} de
   * @param {string} texto
   * @param {boolean} [conBoton]
   */
  function burbuja(de, texto, conBoton) {
    const globo = crear('p', `burbuja burbuja--${de === 'asistente' ? 'asistente' : 'mia'}`);
    const { giro } = ejemplo;
    const quien = de === 'asistente' ? giro.asistente : de === 'cliente' ? giro.cliente : giro.profesional;
    globo.append(crear('span', 'solo-lector', `${quien}: `), texto);
    if (conBoton) globo.append(crear('span', 'burbuja__boton', rotulo('cambiarCita')));
    return globo;
  }

  /** @param {string} concepto */
  function tarjetaDeCobro(concepto) {
    cobro = crear('div', 'cobro');
    cobro.append(
      crear('span', 'cobro__concepto', concepto),
      crear('strong', 'cobro__monto', pesos(ejemplo.giro.anticipo)),
      crear('span', 'cobro__estado', rotulo('pagoPendiente')),
    );
    return cobro;
  }

  /** @param {string} texto */
  function marcarCobroAprobado(texto) {
    if (!cobro) return;
    cobro.classList.add('cobro--aprobado');
    cobro.querySelector('.cobro__estado')?.replaceChildren(plantillaPalomita.content.cloneNode(true), texto);
  }

  /**
   * Pinta mensajes nuevos, uno por uno, con su pausa. Devuelve falso si a media pintada cambio el turno.
   * @param {Entrada[]} entradas
   * @param {number} miTurno
   * @returns {Promise<boolean>}
   */
  async function pintarChat(entradas, miTurno) {
    for (const entrada of entradas) {
      delete chat.dataset.acotacion;
      if (entrada.de === 'aprobado') {
        marcarCobroAprobado(entrada.texto);
      } else if (entrada.de === 'asistente') {
        const puntos = crear('p', 'burbuja burbuja--asistente burbuja--escribe');
        puntos.setAttribute('aria-hidden', 'true');
        puntos.append(crear('i', ''), crear('i', ''), crear('i', ''));
        chat.append(puntos);
        alFinal();
        await animar(600 + Math.min(300, entrada.texto.length * 2));
        if (miTurno !== turno) return false;
        puntos.replaceWith(burbuja('asistente', entrada.texto, entrada.boton));
      } else if (entrada.de === 'cobro') {
        chat.append(tarjetaDeCobro(entrada.texto));
      } else if (entrada.de === 'salto') {
        chat.append(crear('p', 'chat__salto', entrada.texto));
      } else {
        chat.append(burbuja(entrada.de, entrada.texto));
      }
      alFinal();
      await animar(PAUSA_ENTRE_BURBUJAS);
      if (miTurno !== turno) return false;
    }
    return true;
  }

  /**
   * Pone al dia lo que ve la profesional: la linea que narra y su agenda. La agenda no se vuelve a dibujar: cada
   * renglon cambia en su lugar y el sello, una vez puesto, se queda. Devuelve falso si cambio el turno.
   * @param {LoQueVesTu} vista
   * @param {number} miTurno
   * @returns {Promise<boolean>}
   */
  async function pintarTu(vista, miTurno) {
    tuResumen.textContent = vista.resumen;
    anuncio.textContent = vista.resumen;
    agendaDia.textContent = conMayuscula(vista.dia);
    const horas = vista.filas.map((fila) => fila.hora).join('|');
    if (agendaFilas.dataset.horas !== horas) {
      agendaFilas.dataset.horas = horas;
      agendaFilas.replaceChildren(
        ...vista.filas.map((fila) => {
          const renglon = crear('li', 'agenda__fila');
          renglon.append(crear('span', 'agenda__hora', fila.hora), crear('span', 'agenda__estado'));
          return renglon;
        }),
      );
    }
    tu.toggleAttribute(
      'data-llena',
      vista.filas.every((fila) => fila.estado !== 'libre'),
    );
    for (const [indice, fila] of vista.filas.entries()) {
      const renglon = /** @type {HTMLElement} */ (agendaFilas.children[indice]);
      const texto = /** @type {HTMLElement} */ (renglon.children[1]);
      const antes = renglon.dataset.estado;
      if (antes === fila.estado && texto.textContent === fila.texto) continue;
      // Recien pagada: primero se ve llegar el dinero (la linea de arriba ya cambio) y despues la cita entra a la agenda.
      const recienPagada = antes === 'apartado' && fila.estado === 'garantizada';
      const sellar = llevaSello(fila.estado) && !renglon.querySelector('.sello');
      if (recienPagada) await animar(PAUSA_DEL_DINERO_A_LA_CITA);
      if (miTurno !== turno) return false;
      renglon.dataset.estado = fila.estado;
      texto.textContent = fila.texto;
      if (!llevaSello(fila.estado)) {
        renglon.querySelector('.sello')?.remove();
        delete renglon.dataset.sellada;
      } else if (sellar) {
        // Y al final cae el sello.
        await animar(recienPagada ? PAUSA_DE_LA_CITA_AL_SELLO : PAUSA_ENTRE_SELLOS);
        if (miTurno !== turno) return false;
        renglon.append(plantillaSello.content.cloneNode(true));
        renglon.dataset.sellada = '';
        if (recienPagada && !sinMovimiento.matches) navigator.vibrate?.(14);
      }
    }
    return true;
  }

  /**
   * Lo que la visitante puede tocar en este paso. Lo que conviene tocar late un rato: esa es la pista.
   * @param {Accion[]} acciones
   */
  function pintarPie(acciones) {
    /** @type {HTMLElement[]} */
    const piezas = [];
    if (estado.paso === 'reposo') piezas.push(crear('p', 'chat__borrador', ejemplo.guion.pregunta));
    for (const accion of acciones) {
      const clase = {
        enviar: 'boton boton--enviar',
        ficha: 'ficha',
        pagar: 'boton boton--ancho',
        seguir: 'boton boton--ancho',
        si: 'boton boton--mitad',
        no: 'boton boton--mitad boton--contorno',
      }[accion.clase];
      const boton = crear('button', clase, accion.etiqueta);
      boton.type = 'button';
      // Entre si y no no se sugiere nada: esa respuesta es de ella.
      if (accion.sugerida && accion.clase !== 'si') boton.classList.add('pista');
      boton.addEventListener('click', () => tocar(accion.evento));
      piezas.push(boton);
    }
    if (estado.paso === 'cierre') {
      const empieza = crear('a', 'boton boton--ancho boton--sello', rotulo('empieza'));
      empieza.href = datos.alta;
      empieza.dataset.lugar = 'demo';
      const otraVez = crear('button', 'enlace', rotulo('otraVez'));
      otraVez.type = 'button';
      otraVez.addEventListener('click', reiniciar);
      piezas.push(empieza, otraVez);
    }
    pie.replaceChildren(...piezas);
    alFinal();
  }

  /** Si la visitante venia con el teclado en el pie, el foco pasa a lo primero que ahora se puede hacer ahi. */
  function regresarElFoco() {
    if (!devolverFoco) return;
    // Si ella movio el foco a otra parte mientras se pintaba, se respeta.
    if (document.activeElement && document.activeElement !== document.body) {
      devolverFoco = false;
      return;
    }
    const siguiente = pie.querySelector('button, a');
    if (!(siguiente instanceof HTMLElement)) return; // un paso sin nada que tocar: se intenta en el siguiente
    siguiente.focus({ preventScroll: true });
    devolverFoco = false;
  }

  /** Pinta el paso en que quedo el estado: mensajes, lo que ves tu y, al final, lo que se puede tocar. */
  async function jugar() {
    const miTurno = turno;
    const inicio = performance.now();
    ocupada = true;
    pie.replaceChildren();
    raiz.toggleAttribute('data-final', estado.paso === 'cierre');
    const escena = escenaDe(estado, ejemplo);
    if (escena.telefono !== telefono) {
      // Cambio de acto: el escenario se limpia y una acotacion avisa el nuevo papel.
      anuncio.textContent = presentar(escena.telefono);
      await animar(PAUSA_DE_LA_ACOTACION);
      if (miTurno !== turno) return;
    }
    // Lo que ves tu cambia en su momento: tras "Pago aprobado" si lo hay (y entonces lo que falte del chat espera a que
    // el sello se vea); si no, cuando el chat de ese paso ya se pinto.
    const corte = escena.chat.findIndex((entrada) => entrada.de === 'aprobado') + 1 || escena.chat.length;
    if (!(await pintarChat(escena.chat.slice(0, corte), miTurno))) return;
    if (!(await pintarTu(escena.tu, miTurno))) return;
    if (corte < escena.chat.length) {
      await animar(SILENCIO_TRAS_EL_SELLO);
      if (miTurno !== turno || !(await pintarChat(escena.chat.slice(corte), miTurno))) return;
    }
    if (estado.paso === 'cierre') {
      const tarjeta = crear('div', 'cierre');
      tarjeta.append(
        crear('p', 'cierre__titulo', rotulo('cierreTitulo')),
        crear('p', 'cierre__texto', rotulo('cierreTexto')),
      );
      chat.append(tarjeta);
    }
    await leer(Math.max(0, PASO_MINIMO - (performance.now() - inicio)));
    if (miTurno !== turno) return;
    pintarPie(accionesDe(estado, ejemplo));
    ocupada = false;
    raiz.dataset.paso = estado.paso;
    regresarElFoco();
    // Los dos finales llevan solos al cuadro final; lo demas espera a la visitante, salvo que haya pedido verlo todo.
    const fin = estado.paso === 'finSi' || estado.paso === 'finNo';
    if (!fin && !sola) return;
    await leer(fin ? PAUSA_ANTES_DEL_CIERRE : PAUSA_ENTRE_PASOS);
    if (miTurno !== turno) return;
    const evento = porDefecto(estado, ejemplo.guion);
    if (evento) despachar(evento);
    else sola = false;
  }

  /** @param {Evento} evento */
  function despachar(evento) {
    if (ocupada) return;
    const siguiente = avanzar(estado, evento, ejemplo.guion);
    if (siguiente === estado) return;
    const saleDelReposo = estado.paso === 'reposo';
    estado = siguiente;
    turno += 1;
    // Si un paso no se puede pintar, la demostracion vuelve a empezar en lugar de quedarse muda.
    jugar().catch((error) => {
      // Se reporta como cualquier otro error de la pagina, y la historia vuelve a empezar.
      if (typeof reportError === 'function') reportError(error);
      reiniciar();
    });
    // Los avisos salen de aqui, el unico lugar donde la historia avanza: uno por cada llegada, y ninguno al reiniciar
    // o al cambiar de ejemplo, que regresan al reposo por otro camino. "tocada" dice si la visitante ya hizo algo
    // (tocar Enviar o pedir verlo todo): sin eso, quien mando el primer mensaje fue el reloj de los 4 segundos.
    if (saleDelReposo) avisar('inicio', { modo: tocada ? 'toque' : 'sola' });
    if (estado.paso === 'finSi' || estado.paso === 'finNo') avisar('fin', { asistio: estado.paso === 'finSi' });
    else if (estado.paso !== 'cierre') avisar('paso', { paso: estado.paso });
  }

  /**
   * La visitante toco algo del pie: desde aqui manda ella.
   * @param {Evento} evento
   */
  function tocar(evento) {
    tocada = true;
    sola = false;
    vigia.disconnect();
    devolverFoco = pie.contains(document.activeElement);
    despachar(evento);
  }

  /**
   * Pinta el reposo del ejemplo puesto, sin esperas. Corta lo que venia pintandose y lo que corria solo.
   * @returns {string} la acotacion
   */
  function ponerEnReposo() {
    turno += 1;
    tocada = true;
    sola = false;
    ocupada = false;
    vigia.disconnect();
    const papel = presentar('cliente');
    raiz.dataset.paso = estado.paso;
    raiz.removeAttribute('data-final');
    // Sin esperas: en reposo la agenda no tiene nada que sellar.
    void pintarTu(escenaDe(estado, ejemplo).tu, turno);
    pintarPie(accionesDe(estado, ejemplo));
    return papel;
  }

  function reiniciar() {
    const conFoco = pie.contains(document.activeElement);
    estado = avanzar(estado, { tipo: 'reiniciar' }, ejemplo.guion);
    anuncio.textContent = ponerEnReposo();
    devolverFoco = conFoco;
    regresarElFoco();
  }

  /**
   * La visitante eligio un ejemplo. Si es otro, la historia vuelve al reposo con el: cambian la cabecera, la pregunta,
   * la agenda y la leyenda, y el cambio se anuncia. El foco se queda en el boton que toco.
   * @param {string} clave
   */
  function elegir(clave) {
    const sesion = elegirEjemplo(ejemplos, { ejemplo, estado }, clave);
    if (sesion.ejemplo === ejemplo) return;
    ({ ejemplo, estado } = sesion);
    devolverFoco = false;
    ponerEnReposo();
    const opciones = opcionesDeEjemplo(ejemplos, ejemplo);
    for (const boton of botonesDeEjemplo) {
      const puesto = opciones.some((opcion) => opcion.elegido && opcion.clave === boton.dataset.demoEjemplo);
      boton.setAttribute('aria-pressed', String(puesto));
    }
    const palabras = rotulosDeEjemplo(ejemplo.giro, rotulos);
    raiz.dataset.ejemplo = ejemplo.giro.clave;
    leyenda.textContent = palabras.leyenda;
    anuncio.textContent = palabras.anuncio;
    avisar('ejemplo');
  }

  // Si nadie la toca, manda sola el primer mensaje a los 4 segundos de estar a la vista. De ahi en adelante espera.
  // No arranca con la pestana oculta ni si alguien ya esta dentro con el teclado.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let reloj;
  const vigia = new IntersectionObserver(
    (entradas) => {
      clearTimeout(reloj);
      if (!entradas.some((entrada) => entrada.isIntersecting)) return;
      reloj = setTimeout(() => {
        if (tocada || estado.paso !== 'reposo' || document.hidden || raiz.contains(document.activeElement)) return;
        vigia.disconnect();
        despachar({ tipo: 'enviar' });
      }, ESPERA_PARA_ARRANCAR_SOLA);
    },
    { threshold: 0.4 },
  );

  // ---------- Arranque ----------
  // La pagina ya trae escrito el reposo del primer ejemplo; solo falta lo que se puede tocar.
  agendaFilas.dataset.horas = escenaDe(estado, ejemplo)
    .tu.filas.map((fila) => fila.hora)
    .join('|');
  pintarPie(accionesDe(estado, ejemplo));
  // Ya viva, la leyenda invita a tocarla (sin JavaScript solo dice que es un ejemplo: no hay nada que tocar).
  leyenda.textContent = rotulosDeEjemplo(ejemplo.giro, rotulos).leyenda;
  pieza(raiz, '[data-demo-reiniciar]').addEventListener('click', reiniciar);
  for (const boton of botonesDeEjemplo) {
    boton.addEventListener('click', () => elegir(boton.dataset.demoEjemplo ?? ''));
  }
  pieza(raiz, '[data-demo-sola]').addEventListener('click', () => {
    if (estado.paso === 'cierre') reiniciar();
    tocada = true;
    sola = true;
    vigia.disconnect();
    const evento = porDefecto(estado, ejemplo.guion);
    if (evento) despachar(evento);
  });
  vigia.observe(pieza(raiz, '.telefono'));
  // Hasta aqui todo salio bien: la conversacion escrita ya no hace falta y la demostracion queda viva.
  chat.querySelector('[data-demo-transcripcion]')?.remove();
  raiz.dataset.viva = '';
}
