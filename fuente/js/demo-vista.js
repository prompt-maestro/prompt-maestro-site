// @ts-check
// La vista de la demostracion: pinta lo que demo.js decide y lleva el tiempo. Aqui viven el reloj, el foco y el
// movimiento; ninguna regla de la historia. La historia corre sola mientras el celular esta a la vista y nadie la ha
// pausado. Si la visitante pidio menos movimiento no corre sola ni se anima: avanza de parada en parada, con el boton
// o con las rayitas, y cada parada aparece completa.
import {
  avanzar,
  avisoDe,
  chatEn,
  cuadroEn,
  duraElMomento,
  elegirEjemplo,
  estadoInicial,
  fichaDe,
  historiaDe,
  opcionesDeEjemplo,
  presentacionDe,
  tramosDe,
} from './demo.js';

/** @typedef {import('./demo.js').Ejemplo} Ejemplo */
/** @typedef {import('./demo.js').Evento} Evento */
/** @typedef {import('./demo.js').Toma} Toma */
/** @typedef {import('./demo.js').Cuadro} Cuadro */

/** Lo que espera, ya a la vista, antes de empezar sola. */
const ESPERA_PARA_EMPEZAR = 1000;
/** Lo que espera para volver a empezar cuando la visitante cambia de ejemplo o pide verla otra vez. */
const ESPERA_PARA_REPETIR = 450;
/** Si el plazo de la pregunta vence con el teclado en las respuestas, cada cuanto vuelve a mirar si ya las solto. */
const ESPERA_CON_EL_FOCO = 1000;
/** Cuanto del celular (o de la pantalla, si el celular no cabe en ella) tiene que verse para que la historia corra. */
const A_LA_VISTA = 0.5;
/** Lo que tarda la conversacion en subir para dejarle lugar a lo nuevo. */
const SUBIDA = 320;
const SUAVE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

/**
 * @template {keyof HTMLElementTagNameMap} E
 * @param {E} etiqueta
 * @param {string} clase
 * @param {string} [texto]
 * @returns {HTMLElementTagNameMap[E]}
 */
function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
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
 * Una copia de lo que trae una plantilla de la pagina.
 * @param {HTMLElement} plantilla
 * @returns {DocumentFragment}
 */
function copia(plantilla) {
  return /** @type {DocumentFragment} */ (/** @type {HTMLTemplateElement} */ (plantilla).content.cloneNode(true));
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
    momentos: datos.momentos,
    finales: datos.finales,
    rotulos: datos.rotulos,
  }));
  /** @type {Record<string, string>} */
  const rotulos = datos.rotulos;
  const rotulo = (/** @type {string} */ clave) => rotulos[clave] ?? clave;

  const tel = pieza(raiz, '[data-demo-tel]');
  const pantalla = pieza(raiz, '[data-demo-pantalla]');
  const hilo = pieza(raiz, '[data-demo-hilo]');
  const reloj = pieza(raiz, '[data-demo-reloj]');
  const iniciales = pieza(raiz, '[data-demo-iniciales]');
  const nombre = pieza(raiz, '[data-demo-nombre]');
  const detalle = pieza(raiz, '[data-demo-detalle]');
  const pie = pieza(raiz, '[data-demo-pie]');
  const borrador = pieza(raiz, '[data-demo-borrador]');
  const hojaMonto = pieza(raiz, '[data-demo-hoja-monto]');
  const hojaDetalle = pieza(raiz, '[data-demo-hoja-detalle]');
  const letrero = pieza(raiz, '[data-demo-letrero]');
  const pausa = pieza(raiz, '[data-demo-pausa]');
  const tramos = /** @type {HTMLElement[]} */ ([...raiz.querySelectorAll('[data-demo-tramo]')]);
  const tarjetas = {
    cita: pieza(raiz, '[data-demo-tarjeta="cita"]'),
    pago: pieza(raiz, '[data-demo-tarjeta="pago"]'),
    asistencia: pieza(raiz, '[data-demo-tarjeta="asistencia"]'),
  };
  const dia = pieza(raiz, '[data-demo-dia]');
  const fecha = pieza(raiz, '[data-demo-fecha]');
  const citaTitulo = pieza(raiz, '[data-demo-cita-titulo]');
  const citaDetalle = pieza(raiz, '[data-demo-cita-detalle]');
  const pagoTitulo = pieza(raiz, '[data-demo-pago-titulo]');
  const pagoDetalle = pieza(raiz, '[data-demo-pago-detalle]');
  const asistenciaTitulo = pieza(raiz, '[data-demo-asistencia-titulo]');
  const asistenciaRespuesta = pieza(raiz, '[data-demo-asistencia-respuesta]');
  const botonesDeEjemplo = /** @type {NodeListOf<HTMLButtonElement>} */ (raiz.querySelectorAll('[data-demo-ejemplo]'));
  const plantillaSello = pieza(raiz, '[data-demo-sello]');
  const plantillaTics = pieza(raiz, '[data-demo-tics]');
  const plantillaVoz = pieza(raiz, '[data-demo-voz]');
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

  // La pagina llega con el primer ejemplo, en reposo; la visitante puede elegir otro.
  let ejemplo = /** @type {Ejemplo} */ (ejemplos[0]);
  let estado = estadoInicial();
  let tomas = historiaDe(ejemplo);
  /** La visitante la detuvo con el boton. */
  let pausada = false;
  let aLaVista = false;
  /** La visitante ya toco algo de la demostracion: lo que arranque de aqui en adelante lo echo a andar ella. */
  let tocada = false;
  /** Esta historia ya salio del reposo, y los pasos por los que ya paso: cada aviso sale una vez por historia. */
  let empezada = false;
  /** @type {Set<string>} */
  const avisados = new Set();
  // El reloj de la historia: una sola espera a la vez, que se puede detener y retomar donde iba.
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let espera;
  let pendiente = false;
  let falta = 0;
  let vence = 0;
  /** La rayita del momento que va, llenandose. */
  /** @type {Animation | null} */
  let avance = null;
  let momentoDelAvance = 0;
  /** Lo ultimo que dijo el letrero: solo se vuelve a escribir (y a anunciar) cuando cambia. */
  let dicho = cuadroEn(tomas, 0, ejemplo);

  /** Si la historia puede avanzar sola en este instante. */
  const corre = () => !pausada && aLaVista && !document.hidden && !sinMovimiento.matches;
  const terminada = () => estado.van >= tomas.length;
  const respuestas = () => hilo.querySelector('.wa__respuestas');

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

  // ---------- El reloj ----------
  function armar() {
    vence = performance.now() + falta;
    espera = setTimeout(alVencer, falta);
  }

  /** Olvida lo que estaba esperando. */
  function soltar() {
    clearTimeout(espera);
    espera = undefined;
    pendiente = false;
  }

  /**
   * Deja pendiente el siguiente avance. El plazo solo corre mientras la historia puede correr.
   * @param {number} ms
   */
  function programar(ms) {
    soltar();
    pendiente = true;
    falta = ms;
    if (corre()) armar();
  }

  function alVencer() {
    espera = undefined;
    pendiente = false;
    // Con el teclado en las respuestas, la historia no contesta por ella: espera a que decida o las suelte.
    if (respuestas()?.contains(document.activeElement)) programar(ESPERA_CON_EL_FOCO);
    else seguir();
  }

  /** La historia se detuvo o se reanudo (la pausa, el scroll, la pestana, el movimiento): el reloj y la rayita la siguen. */
  function alCambiarLaMarcha() {
    if (corre()) {
      if (pendiente && espera === undefined) armar();
      if (avance?.playState === 'paused') avance.play();
    } else {
      if (espera !== undefined) {
        clearTimeout(espera);
        espera = undefined;
        falta = Math.max(0, vence - performance.now());
      }
      if (avance?.playState === 'running') avance.pause();
    }
    pintarBoton();
  }

  // ---------- Pintar la conversacion ----------
  /**
   * La hora al pie de un globo; lo que manda quien tiene el celular lleva sus palomitas.
   * @param {Toma} toma
   * @param {boolean} conPalomitas
   */
  function horaDe(toma, conPalomitas) {
    const hora = crear('span', 'wa__hora', toma.hora);
    if (conPalomitas) hora.append(copia(plantillaTics));
    return hora;
  }

  /**
   * @param {Toma} toma
   * @param {'entra' | 'sale'} lado
   */
  function globo(toma, lado) {
    const elemento = crear('p', `wa__m wa__m--${lado}`);
    elemento.append(crear('span', 'solo-lector', `${toma.quien}: `));
    if (toma.liga) {
      const liga = crear('span', 'wa__liga');
      const signo = crear('span', 'wa__liga-signo', '$');
      signo.setAttribute('aria-hidden', 'true');
      const texto = crear('span', 'wa__liga-texto');
      texto.append(crear('b', 'wa__liga-titulo', toma.liga.titulo), crear('span', 'wa__liga-monto', toma.liga.monto));
      texto.append(crear('small', 'wa__liga-sitio', toma.liga.sitio));
      liga.append(signo, texto);
      elemento.append(liga);
    }
    elemento.append(toma.texto, horaDe(toma, lado === 'sale'));
    if (toma.boton) elemento.append(crear('span', 'wa__boton', toma.boton));
    return elemento;
  }

  /**
   * La nota de voz: se ve como en WhatsApp, y a quien no la ve se le dice que es y que dice.
   * @param {Toma} toma
   */
  function notaDeVoz(toma) {
    const elemento = crear('p', 'wa__m wa__m--sale wa__m--voz');
    const dibujo = copia(plantillaVoz);
    pieza(dibujo, '[data-voz-inicial]').textContent = toma.quien.charAt(0);
    pieza(dibujo, '[data-voz-dura]').textContent = toma.detalle ?? '';
    pieza(dibujo, '[data-voz-hora]').append(toma.hora, copia(plantillaTics));
    elemento.append(crear('span', 'solo-lector', toma.lector ?? toma.texto), dibujo);
    return elemento;
  }

  /** Las dos respuestas de la profesional: lo unico de la conversacion que se toca. */
  function botonesDeRespuesta() {
    const grupo = crear('div', 'wa__respuestas');
    for (const [clave, valor] of /** @type {const} */ ([
      ['si', true],
      ['no', false],
    ])) {
      const boton = crear('button', 'wa__respuesta', rotulo(clave));
      boton.type = 'button';
      boton.addEventListener('click', () => responder(valor));
      grupo.append(boton);
    }
    return grupo;
  }

  /**
   * Lo que una toma pone en la conversacion: nada, si es de las que solo duran un rato.
   * @param {Toma} toma
   * @returns {HTMLElement[]}
   */
  function nodosDe(toma) {
    switch (toma.tipo) {
      case 'aviso':
        return [crear('p', 'wa__aviso', toma.texto)];
      case 'cambio':
        return [crear('p', 'wa__aviso wa__aviso--tu', toma.texto)];
      case 'voz':
        return [notaDeVoz(toma)];
      case 'sale':
      case 'respuesta':
        return [globo(toma, 'sale')];
      case 'entra':
      case 'pregunta':
        return [globo(toma, 'entra')];
      default:
        return [];
    }
  }

  /** La conversacion completa hasta donde va la historia, de golpe y sin animar. */
  function repintar() {
    const nodos = chatEn(tomas, estado.van).flatMap(nodosDe);
    if (tomas[estado.van - 1]?.tipo === 'pregunta') nodos.push(botonesDeRespuesta());
    hilo.replaceChildren(...nodos);
    pintarCuadro();
  }

  /** La toma que acaba de pasar: lo suyo entra por abajo y la conversacion sube a dejarle lugar. */
  function pintarUna() {
    const toma = tomas[estado.van - 1];
    if (!toma) return;
    // El celular cambia de manos: la conversacion empieza limpia.
    if (toma.tipo === 'cambio') hilo.replaceChildren();
    respuestas()?.remove();
    const nodos = nodosDe(toma);
    if (toma.tipo === 'pregunta') nodos.push(botonesDeRespuesta());
    if (nodos.length > 0) {
      const antes = hilo.offsetHeight;
      for (const nodo of nodos) nodo.dataset.entra = '';
      hilo.append(...nodos);
      const sube = hilo.offsetHeight - antes;
      if (sube > 0 && toma.tipo !== 'cambio' && !sinMovimiento.matches) {
        hilo.animate?.([{ transform: `translateY(${sube}px)` }, { transform: 'none' }], {
          duration: SUBIDA,
          easing: SUAVE,
        });
      }
    }
    pintarCuadro();
  }

  // ---------- Pintar lo demas ----------
  /**
   * @param {HTMLElement} tarjeta
   * @param {boolean} apagada  lo que ensena todavia no pasa: se ve tenue y no se le lee a nadie
   */
  function apagar(tarjeta, apagada) {
    tarjeta.toggleAttribute('data-apagada', apagada);
    if (apagada) tarjeta.setAttribute('aria-hidden', 'true');
    else tarjeta.removeAttribute('aria-hidden');
  }

  /** @param {Cuadro} cuadro */
  function pintarLetrero(cuadro) {
    if (cuadro.rotulo === dicho.rotulo && cuadro.letrero === dicho.letrero) return;
    const titulo = crear('p', 'guia__rotulo', cuadro.rotulo);
    const texto = crear('p', 'guia__texto', cuadro.letrero);
    if (cuadro.rotulo !== dicho.rotulo) titulo.dataset.entra = '';
    texto.dataset.entra = '';
    dicho = cuadro;
    // El letrero es la region que se anuncia: una vez por cambio, con su rotulo.
    letrero.replaceChildren(titulo, texto);
  }

  /** @param {Cuadro} cuadro */
  function pintarTramos(cuadro) {
    const estados = tramosDe(cuadro, tramos.length);
    for (const [indice, tramo] of tramos.entries()) {
      const como = estados[indice] ?? 'falta';
      tramo.dataset.estado = como;
      if (como === 'va') tramo.setAttribute('aria-current', 'step');
      else tramo.removeAttribute('aria-current');
    }
    const va = estados.indexOf('va') + 1;
    if (va === momentoDelAvance) return;
    avance?.cancel();
    avance = null;
    momentoDelAvance = va;
    const raya = tramos[va - 1]?.querySelector('.guia__lleno');
    if (!raya || sinMovimiento.matches || typeof raya.animate !== 'function') return;
    // La rayita del momento se llena en lo que el momento dura, y se detiene con la historia.
    avance = raya.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: duraElMomento(tomas, va),
      easing: 'linear',
      fill: 'both',
    });
    if (!corre()) avance.pause();
  }

  /** @param {Cuadro} cuadro */
  function pintarTarjetas({ cita, pago, asistencia, turno }) {
    for (const [clave, tarjeta] of Object.entries(tarjetas)) tarjeta.toggleAttribute('data-turno', clave === turno);
    tarjetas.cita.dataset.estado = cita.estado;
    citaTitulo.textContent = cita.titulo;
    citaDetalle.textContent = cita.detalle;
    // El sello cae cuando la cita queda garantizada y, una vez puesto, se queda.
    const sellada = cita.estado === 'garantizada';
    const sello = tarjetas.cita.querySelector('.sello');
    if (sellada && !sello) tarjetas.cita.append(copia(plantillaSello));
    else if (!sellada) sello?.remove();
    tarjetas.cita.toggleAttribute('data-sellada', sellada);
    apagar(tarjetas.pago, !pago.llego);
    pagoTitulo.textContent = pago.titulo;
    pagoDetalle.textContent = pago.detalle;
    apagar(tarjetas.asistencia, asistencia.estado === 'espera');
    tarjetas.asistencia.dataset.estado = asistencia.estado;
    asistenciaTitulo.textContent = asistencia.titulo;
    asistenciaRespuesta.textContent = asistencia.respuesta;
  }

  /** Todo lo que se ve fuera de la conversacion, y lo que solo dura mientras es lo ultimo que paso. */
  function pintarCuadro() {
    const cuadro = cuadroEn(tomas, estado.van, ejemplo);
    const ultima = tomas[estado.van - 1];
    raiz.dataset.paso = cuadro.paso;
    raiz.dataset.momento = String(cuadro.momento);
    raiz.dataset.telefono = cuadro.telefono;
    // La cabecera: de quien es el celular, y si el agente esta redactando.
    const presentacion = presentacionDe(ejemplo, cuadro.telefono);
    const escribe = ultima?.tipo === 'escribe';
    iniciales.textContent = presentacion.iniciales;
    nombre.textContent = presentacion.nombre;
    detalle.textContent = escribe ? rotulo('escribiendo') : presentacion.detalle;
    pantalla.toggleAttribute('data-escribe', escribe);
    reloj.textContent = cuadro.reloj;
    // La caja de abajo: lo que quien tiene el celular va escribiendo antes de mandarlo.
    const teclea = ultima?.tipo === 'teclea';
    borrador.textContent = teclea ? ultima.texto : rotulo('mensaje');
    pie.toggleAttribute('data-teclea', teclea);
    pantalla.toggleAttribute('data-hoja', ultima?.tipo === 'hoja');
    pintarLetrero(cuadro);
    pintarTramos(cuadro);
    pintarTarjetas(cuadro);
  }

  /** El boton de la pausa dice lo que hace: pausar, continuar, reproducir (con menos movimiento) o verla otra vez. */
  function pintarBoton() {
    const fin = terminada();
    const quieta = pausada || sinMovimiento.matches;
    pausa.dataset.estado = fin ? 'fin' : quieta ? 'pausa' : 'corre';
    const clave = fin ? 'otraVez' : sinMovimiento.matches ? 'reproducir' : pausada ? 'continuar' : 'pausar';
    pausa.setAttribute('aria-label', rotulo(clave));
    // La pagina sabe si la historia esta corriendo: lo que se mueve solo dentro del celular se detiene con ella.
    raiz.toggleAttribute('data-corre', corre());
  }

  /** Lo que es del ejemplo y no cambia con la historia: cual esta puesto, su nombre para quien no lo ve y sus fichas. */
  function pintarEjemplo() {
    const ficha = fichaDe(ejemplo);
    const opciones = opcionesDeEjemplo(ejemplos, ejemplo);
    for (const boton of botonesDeEjemplo) {
      const puesto = opciones.some((opcion) => opcion.elegido && opcion.clave === boton.dataset.demoEjemplo);
      boton.setAttribute('aria-pressed', String(puesto));
    }
    raiz.dataset.ejemplo = ejemplo.giro.clave;
    raiz.setAttribute('aria-label', ficha.leyenda);
    dia.textContent = ficha.dia;
    fecha.textContent = ficha.fecha;
    const pago = tomas.find((toma) => toma.tipo === 'hoja');
    hojaMonto.textContent = pago?.monto ?? '';
    hojaDetalle.textContent = pago?.detalle ?? '';
  }

  // ---------- Mover la historia ----------
  /**
   * Lleva la historia a su estado siguiente. Dice si algo cambio.
   * @param {Evento} evento
   */
  function mover(evento) {
    const siguiente = avanzar(estado, evento, ejemplo);
    if (siguiente === estado) return false;
    // Los dos finales son historias distintas desde la respuesta.
    if (siguiente.asistio !== estado.asistio) tomas = historiaDe(ejemplo, siguiente.asistio ?? true);
    estado = siguiente;
    return true;
  }

  /**
   * La historia llego a donde esta: avisa lo que haya que avisar (cada cosa, una vez por historia) y deja pendiente
   * la toma siguiente.
   */
  function alLlegar() {
    const cuadro = cuadroEn(tomas, estado.van, ejemplo);
    if (estado.van > 0 && !empezada) {
      empezada = true;
      avisar('inicio', { modo: tocada ? 'toque' : 'sola' });
    }
    // Una historia tiene un solo final: si la visitante regresa y contesta otra cosa, ya no se avisa.
    const aviso = avisoDe(cuadro.paso);
    const clave = aviso?.que === 'fin' ? 'fin' : cuadro.paso;
    if (aviso && !avisados.has(clave)) {
      avisados.add(clave);
      if (aviso.que === 'fin') avisar('fin', aviso.detalle);
      else avisar('paso', aviso.detalle);
    }
    pintarBoton();
    const ultima = tomas[estado.van - 1];
    if (ultima && !terminada()) programar(ultima.dura);
  }

  /** Pone la toma siguiente. */
  function seguir() {
    if (!mover({ tipo: 'sigue' })) return;
    pintarUna();
    alLlegar();
  }

  /** Empieza una historia nueva, en reposo, con el ejemplo puesto. */
  function nuevaHistoria() {
    soltar();
    avance?.cancel();
    avance = null;
    momentoDelAvance = 0;
    estado = estadoInicial();
    tomas = historiaDe(ejemplo);
    empezada = false;
    avisados.clear();
    pausada = false;
  }

  /** Vuelve a contar la historia desde el principio. Con menos movimiento, pinta de una vez su primera parada. */
  function otraVez() {
    nuevaHistoria();
    if (sinMovimiento.matches) {
      mover({ tipo: 'parada' });
      repintar();
      alLlegar();
    } else {
      repintar();
      pintarBoton();
      programar(ESPERA_PARA_REPETIR);
    }
  }

  /**
   * La visitante toco una rayita: la historia brinca al principio de ese momento, con lo anterior ya escrito, y de
   * ahi sigue (o, con menos movimiento, pinta esa parada).
   * @param {number} momento
   */
  function brincar(momento) {
    tocada = true;
    if (!mover({ tipo: 'brinca', momento })) return;
    soltar();
    pausada = false;
    // La rayita de ese momento vuelve a llenarse desde cero, aunque sea la que ya iba.
    avance?.cancel();
    avance = null;
    momentoDelAvance = 0;
    mover({ tipo: sinMovimiento.matches ? 'parada' : 'sigue' });
    repintar();
    alLlegar();
  }

  /**
   * La profesional contesta si la persona asistio.
   * @param {boolean} valor
   */
  function responder(valor) {
    tocada = true;
    const conFoco = respuestas()?.contains(document.activeElement) ?? false;
    if (!mover({ tipo: 'asistio', valor })) return;
    soltar();
    pausada = false;
    if (sinMovimiento.matches) {
      mover({ tipo: 'parada' });
      repintar();
    } else {
      pintarUna();
    }
    // Los botones de la respuesta ya no estan: quien venia con el teclado sigue en el boton de la pausa.
    if (conFoco) pausa.focus({ preventScroll: true });
    alLlegar();
  }

  /** El boton de la pausa: verla otra vez si ya termino, la parada siguiente con menos movimiento, o pausar y seguir. */
  function alTocarLaPausa() {
    tocada = true;
    if (terminada()) {
      otraVez();
    } else if (sinMovimiento.matches) {
      if (!mover({ tipo: 'parada' })) return;
      soltar();
      repintar();
      alLlegar();
    } else {
      pausada = !pausada;
      alCambiarLaMarcha();
    }
  }

  /**
   * La visitante eligio un ejemplo. Si es otro, la historia vuelve al principio con el y corre de nuevo. El foco se
   * queda en el boton que toco.
   * @param {string} clave
   */
  function elegir(clave) {
    const sesion = elegirEjemplo(ejemplos, { ejemplo, estado }, clave);
    if (sesion.ejemplo === ejemplo) return;
    tocada = true;
    ejemplo = sesion.ejemplo;
    nuevaHistoria();
    pintarEjemplo();
    repintar();
    pintarBoton();
    avisar('ejemplo');
    programar(ESPERA_PARA_REPETIR);
  }

  // ---------- Arranque ----------
  // La pagina ya trae escrito el reposo del primer ejemplo: aqui solo se pone al dia lo que depende de la visitante.
  pintarEjemplo();
  pintarCuadro();
  pintarBoton();
  pausa.addEventListener('click', alTocarLaPausa);
  for (const tramo of tramos) tramo.addEventListener('click', () => brincar(Number(tramo.dataset.demoTramo)));
  for (const boton of botonesDeEjemplo) {
    boton.addEventListener('click', () => elegir(boton.dataset.demoEjemplo ?? ''));
  }
  // La historia solo corre con el celular a la vista: por lo menos su mitad o, si no cabe, media pantalla de el.
  new IntersectionObserver(
    (entradas) => {
      const ultima = entradas[entradas.length - 1];
      if (!ultima) return;
      const alto = ultima.rootBounds?.height ?? window.innerHeight;
      aLaVista =
        ultima.isIntersecting &&
        (ultima.intersectionRatio >= A_LA_VISTA || ultima.intersectionRect.height >= alto * A_LA_VISTA);
      alCambiarLaMarcha();
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  ).observe(tel);
  document.addEventListener('visibilitychange', alCambiarLaMarcha);
  sinMovimiento.addEventListener('change', alCambiarLaMarcha);
  // Empieza sola al poco de estar a la vista.
  programar(ESPERA_PARA_EMPEZAR);
  // Hasta aqui todo salio bien: la conversacion escrita ya no hace falta y la demostracion queda viva.
  hilo.querySelector('[data-demo-transcripcion]')?.remove();
  raiz.dataset.viva = '';
}
