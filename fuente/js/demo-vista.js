// @ts-check
// La vista de la demostracion: pinta lo que demo.js decide. Aqui viven los tiempos, el foco y el movimiento; ninguna
// regla de la historia. Si el visitante pidio menos movimiento, cada paso aparece completo y sin esperas.
import { accionesDe, avanzar, escenaDe, estadoInicial, porDefecto, presentacionDe } from './demo.js';
import { pesos } from './redaccion.js';

/** @typedef {import('./demo.js').Ejemplo} Ejemplo */
/** @typedef {import('./demo.js').Evento} Evento */
/** @typedef {import('./demo.js').Accion} Accion */
/** @typedef {import('./demo.js').Entrada} Entrada */
/** @typedef {import('./demo.js').LoQueVesTu} LoQueVesTu */

const ESPERA_PARA_ARRANCAR_SOLA = 4000;
const PAUSA_ENTRE_BURBUJAS = 320;
const PAUSA_ENTRE_PASOS = 1300;
const PAUSA_ANTES_DEL_CIERRE = 2400;
const ANCHO_CON_COLUMNA = '(min-width: 1200px)';

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
  const tuBoton = pieza(raiz, '[data-demo-tu-boton]');
  const tuResumen = pieza(raiz, '[data-demo-tu-resumen]');
  const tuDetalle = pieza(raiz, '[data-demo-tu-detalle]');
  const anuncio = pieza(raiz, '[data-demo-anuncio]');
  const papel = pieza(raiz, '[data-demo-papel]');
  const plantillaSello = /** @type {HTMLTemplateElement} */ (pieza(raiz, '[data-demo-sello]'));
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  const conColumna = window.matchMedia(ANCHO_CON_COLUMNA);

  const ejemplo = /** @type {Ejemplo} */ (ejemplos[0]);
  let estado = estadoInicial();
  let ocupada = false;
  let sola = false;
  let tocada = false;
  // Cada reinicio cambia el turno: lo que quedo esperando de un turno viejo ya no pinta nada.
  let turno = 0;
  // Quien avanza con el teclado no pierde su lugar: el foco pasa a lo siguiente que se puede hacer.
  let devolverFoco = false;

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, sinMovimiento.matches ? 0 : ms));

  function alFinal() {
    chat.scrollTop = chat.scrollHeight;
  }

  /**
   * @param {'cliente' | 'asistente'} de
   * @param {string} texto
   * @param {boolean} [conBoton]
   */
  function burbuja(de, texto, conBoton) {
    const globo = crear('p', `burbuja burbuja--${de}`);
    const quien = de === 'cliente' ? ejemplo.giro.cliente : ejemplo.giro.asistente;
    globo.append(crear('span', 'solo-lector', `${quien}: `), texto);
    if (conBoton) globo.append(crear('span', 'burbuja__boton', rotulo('cambiarCita')));
    return globo;
  }

  /** @param {string} concepto */
  function tarjetaDeCobro(concepto) {
    const tarjeta = crear('div', 'cobro');
    tarjeta.append(
      crear('span', 'cobro__concepto', concepto),
      crear('strong', 'cobro__monto', pesos(ejemplo.giro.anticipo)),
      crear('span', 'cobro__estado', rotulo('pagoPendiente')),
    );
    return tarjeta;
  }

  /** @param {string} texto */
  function marcarCobroAprobado(texto) {
    const tarjeta = chat.querySelector('.cobro:last-of-type');
    const estadoDelCobro = tarjeta?.querySelector('.cobro__estado');
    if (!tarjeta || !estadoDelCobro) return;
    tarjeta.classList.add('cobro--aprobado');
    const palomita = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    palomita.setAttribute('class', 'cobro__palomita');
    palomita.setAttribute('viewBox', '0 0 20 20');
    palomita.setAttribute('aria-hidden', 'true');
    const trazo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trazo.setAttribute('d', 'M4 10.5l4 4 8-9');
    trazo.setAttribute('fill', 'none');
    trazo.setAttribute('stroke', 'currentColor');
    trazo.setAttribute('stroke-width', '2.4');
    trazo.setAttribute('stroke-linecap', 'round');
    trazo.setAttribute('stroke-linejoin', 'round');
    palomita.append(trazo);
    estadoDelCobro.replaceChildren(palomita, texto);
  }

  /**
   * Pinta los mensajes nuevos de un paso, uno por uno, con su pausa.
   * @param {Entrada[]} entradas
   * @param {number} miTurno
   */
  async function pintarChat(entradas, miTurno) {
    for (const entrada of entradas) {
      if (entrada.de === 'aprobado') {
        marcarCobroAprobado(entrada.texto);
        await esperar(PAUSA_ENTRE_BURBUJAS);
      } else if (entrada.de === 'asistente') {
        const puntos = crear('p', 'burbuja burbuja--asistente burbuja--escribe');
        puntos.setAttribute('aria-hidden', 'true');
        puntos.append(crear('i', ''), crear('i', ''), crear('i', ''));
        chat.append(puntos);
        alFinal();
        await esperar(600 + Math.min(300, entrada.texto.length * 2));
        if (miTurno !== turno) return;
        puntos.replaceWith(burbuja('asistente', entrada.texto, entrada.boton));
      } else {
        if (entrada.de === 'cliente') chat.append(burbuja('cliente', entrada.texto));
        else if (entrada.de === 'cobro') chat.append(tarjetaDeCobro(entrada.texto));
        else chat.append(crear('p', 'chat__salto', entrada.texto));
      }
      alFinal();
      await esperar(PAUSA_ENTRE_BURBUJAS);
      if (miTurno !== turno) return;
    }
  }

  /** @param {boolean} abierto */
  function abrirTu(abierto) {
    tu.toggleAttribute('data-abierto', abierto);
    tuBoton.setAttribute('aria-expanded', String(abierto || conColumna.matches));
  }

  /**
   * @param {import('./demo.js').Fila} fila
   * @returns {string}
   */
  function textoDeFila(fila) {
    const { servicioCorto, cliente } = ejemplo.giro;
    if (fila.estado === 'garantizada') return `${servicioCorto} · ${cliente}`;
    if (fila.estado === 'asistio' || fila.estado === 'falto') return `${rotulo(fila.estado)} · ${cliente}`;
    return rotulo(fila.estado);
  }

  /**
   * Pone la agenda al dia sin volver a dibujarla: cada renglon cambia en su lugar y el sello, una vez puesto, se queda.
   * @param {LoQueVesTu} vista
   * @param {number} miTurno
   */
  async function pintarAgenda(vista, miTurno) {
    let agenda = tuDetalle.querySelector('.agenda');
    if (vista.filas.length === 0) {
      agenda?.remove();
      return;
    }
    if (!agenda) {
      agenda = crear('div', 'agenda');
      const cabeza = crear('p', 'agenda__cabeza');
      cabeza.append(crear('span', 'agenda__dia'), crear('span', 'agenda__de', rotulo('calendario')));
      agenda.append(cabeza, crear('ol', 'agenda__filas'));
      tuDetalle.prepend(agenda);
    }
    const dia = /** @type {HTMLElement} */ (agenda.querySelector('.agenda__dia'));
    dia.textContent = `${(vista.dia ?? '').charAt(0).toUpperCase()}${(vista.dia ?? '').slice(1)}`;
    const lista = /** @type {HTMLElement} */ (agenda.querySelector('.agenda__filas'));
    if (lista.children.length !== vista.filas.length) {
      lista.replaceChildren(
        ...vista.filas.map((fila) => {
          const renglon = crear('li', 'agenda__fila');
          renglon.append(crear('span', 'agenda__hora', fila.hora), crear('span', 'agenda__estado'));
          return renglon;
        }),
      );
    }
    for (const [indice, fila] of vista.filas.entries()) {
      const renglon = /** @type {HTMLElement} */ (lista.children[indice]);
      const antes = renglon.dataset.estado;
      if (antes === fila.estado) continue;
      const recienPagada = antes === 'apartado' && fila.estado === 'garantizada';
      // Primero se ve llegar el dinero (el resumen ya cambio); despues la cita entra a la agenda.
      if (recienPagada) await esperar(700);
      if (miTurno !== turno) return;
      renglon.dataset.estado = fila.estado;
      /** @type {HTMLElement} */ (renglon.children[1]).textContent = textoDeFila(fila);
      if (fila.estado === 'libre' || fila.estado === 'apartado') {
        renglon.querySelector('.sello')?.remove();
        delete renglon.dataset.sellada;
      } else if (!renglon.querySelector('.sello')) {
        // Y al final cae el sello.
        if (recienPagada) await esperar(520);
        if (miTurno !== turno) return;
        renglon.append(plantillaSello.content.cloneNode(true));
        renglon.dataset.sellada = '';
        if (recienPagada && !sinMovimiento.matches) navigator.vibrate?.(14);
      }
    }
  }

  /**
   * @param {LoQueVesTu} vista
   * @param {Accion[]} acciones
   * @param {number} miTurno
   */
  async function pintarTu(vista, acciones, miTurno) {
    tuResumen.textContent = vista.resumen;
    anuncio.textContent = vista.mensaje ? `${vista.resumen} ${vista.mensaje}` : vista.resumen;
    abrirTu(vista.abre);
    tu.toggleAttribute(
      'data-con-cita',
      vista.filas.some((fila) => fila.estado !== 'libre'),
    );
    tuDetalle.querySelector('.tu__mensaje')?.remove();
    tuDetalle.querySelector('.tu__botones')?.remove();
    await pintarAgenda(vista, miTurno);
    if (miTurno !== turno || !vista.mensaje) return;
    tuDetalle.append(crear('p', 'tu__mensaje', vista.mensaje));
    const respuestas = acciones.filter((accion) => accion.clase === 'si' || accion.clase === 'no');
    if (respuestas.length === 0) return;
    const botones = crear('div', 'tu__botones');
    for (const accion of respuestas) {
      const boton = crear('button', `boton boton--${accion.clase}`, rotulo(accion.clase));
      boton.type = 'button';
      boton.addEventListener('click', () => tocar(accion.evento));
      botones.append(boton);
    }
    tuDetalle.append(botones);
  }

  /**
   * Lo que la visitante puede tocar en este paso. Lo que conviene tocar late despacio: esa es la pista.
   * @param {Accion[]} acciones
   */
  function pintarPie(acciones) {
    const sugerida = porDefecto(estado, ejemplo.guion);
    /** @type {(HTMLElement | string)[]} */
    const piezas = [];
    if (estado.paso === 'reposo') piezas.push(crear('p', 'chat__borrador', ejemplo.guion.pregunta));
    if (estado.paso === 'asistencia') piezas.push(crear('p', 'chat__pista', rotulo('ahoraTu')));
    for (const accion of acciones) {
      if (accion.clase === 'si' || accion.clase === 'no') continue;
      const esFicha = accion.clase === 'ficha';
      const clase = esFicha ? 'ficha' : accion.clase === 'enviar' ? 'boton boton--enviar' : 'boton boton--ancho';
      const boton = crear('button', clase, esFicha ? accion.etiqueta : rotulo(accion.clase));
      boton.type = 'button';
      if (JSON.stringify(accion.evento) === JSON.stringify(sugerida)) boton.classList.add('pista');
      boton.addEventListener('click', () => tocar(accion.evento));
      piezas.push(boton);
    }
    if (estado.paso === 'cierre') {
      const empieza = crear('a', 'boton boton--ancho', rotulo('empieza'));
      empieza.href = datos.alta;
      empieza.dataset.lugar = 'demo';
      const otraVez = crear('button', 'enlace', rotulo('otraVez'));
      otraVez.type = 'button';
      otraVez.addEventListener('click', reiniciar);
      piezas.push(empieza, otraVez);
    }
    pie.replaceChildren(...piezas);
  }

  /** Pinta el paso en que quedo el estado: mensajes, lo que ves tu y, al final, lo que se puede tocar. */
  async function jugar() {
    const miTurno = turno;
    ocupada = true;
    if (raiz.contains(document.activeElement) && document.activeElement instanceof HTMLButtonElement)
      devolverFoco = true;
    pie.replaceChildren();
    const escena = escenaDe(estado, ejemplo);
    const acciones = accionesDe(estado, ejemplo.guion);
    await pintarChat(escena.chat, miTurno);
    if (miTurno !== turno) return;
    if (estado.paso === 'cierre') {
      const tarjeta = crear('div', 'cierre');
      tarjeta.append(
        crear('p', 'cierre__titulo', rotulo('cierreTitulo')),
        crear('p', 'cierre__texto', rotulo('cierreTexto')),
      );
      chat.append(tarjeta);
      alFinal();
    }
    await pintarTu(escena.tu, acciones, miTurno);
    if (miTurno !== turno) return;
    pintarPie(acciones);
    ocupada = false;
    raiz.dataset.paso = estado.paso;
    const siguiente = raiz.querySelector('.tu__botones button, [data-demo-pie] button, [data-demo-pie] a');
    if (devolverFoco && siguiente instanceof HTMLElement) {
      siguiente.focus({ preventScroll: true });
      devolverFoco = false;
    }
    // Los dos finales llevan solos a la tarjeta de cierre; lo demas espera a la visitante, salvo que haya pedido verlo todo.
    const fin = estado.paso === 'finSi' || estado.paso === 'finNo';
    if (!fin && !sola) return;
    await esperar(fin ? PAUSA_ANTES_DEL_CIERRE : PAUSA_ENTRE_PASOS);
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
    estado = siguiente;
    void jugar();
  }

  /**
   * La visitante toco algo: desde aqui manda ella.
   * @param {Evento} evento
   */
  function tocar(evento) {
    tocada = true;
    sola = false;
    despachar(evento);
  }

  function reiniciar() {
    turno += 1;
    tocada = true;
    sola = false;
    ocupada = false;
    estado = estadoInicial();
    const presentacion = presentacionDe(ejemplo.giro, rotulos);
    papel.textContent = presentacion.papel;
    chat.replaceChildren(papel);
    tuDetalle.replaceChildren();
    const escena = escenaDe(estado, ejemplo);
    tuResumen.textContent = escena.tu.resumen;
    anuncio.textContent = '';
    abrirTu(false);
    tu.removeAttribute('data-con-cita');
    pintarPie(accionesDe(estado, ejemplo.guion));
    raiz.dataset.paso = estado.paso;
  }

  // ---------- Arranque ----------
  chat.querySelector('[data-demo-transcripcion]')?.remove();
  pintarPie(accionesDe(estado, ejemplo.guion));
  abrirTu(false);
  raiz.dataset.paso = estado.paso;
  conColumna.addEventListener('change', () => abrirTu(tu.hasAttribute('data-abierto')));

  tuBoton.addEventListener('click', () => {
    if (!conColumna.matches) abrirTu(!tu.hasAttribute('data-abierto'));
  });
  pieza(raiz, '[data-demo-reiniciar]').addEventListener('click', reiniciar);
  pieza(raiz, '[data-demo-sola]').addEventListener('click', () => {
    tocada = true;
    if (estado.paso === 'cierre') reiniciar();
    sola = true;
    const evento = porDefecto(estado, ejemplo.guion);
    if (evento) despachar(evento);
  });

  // Si nadie la toca, manda sola el primer mensaje a los 4 segundos de estar a la vista. De ahi en adelante espera.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let reloj;
  const vigia = new IntersectionObserver(
    (entradas) => {
      const aLaVista = entradas.some((entrada) => entrada.isIntersecting);
      clearTimeout(reloj);
      if (!aLaVista || tocada || estado.paso !== 'reposo') return;
      reloj = setTimeout(() => {
        if (!tocada && estado.paso === 'reposo') despachar({ tipo: 'enviar' });
        vigia.disconnect();
      }, ESPERA_PARA_ARRANCAR_SOLA);
    },
    { threshold: 0.4 },
  );
  vigia.observe(pieza(raiz, '.telefono'));

  raiz.dataset.viva = '';
}
