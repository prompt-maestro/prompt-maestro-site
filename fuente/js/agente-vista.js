// @ts-check
// La vista de "Tu agente": vuelve boton cada renglon del menu, abre un beneficio a la vez y echa a andar su mini
// video. Cada escena se mueve con los estilos (animaciones con el retraso de los datos); aqui solo se abre, se cierra,
// se pausa y se vuelve a empezar. Lo que se decide sin tocar la pantalla vive en agente.js.
import { altoDelMenu, anda, avanzar, botonDe, cuantoBajar, estadoInicial, reloj } from './agente.js';
import { yaLlego } from './encendido.js';

/** @typedef {import('./agente.js').Estado} Estado */
/** @typedef {import('./agente.js').Evento} Evento */

/** Los tiempos que trae escritos cada pieza, en segundos. Los estilos los leen como --mv-en, --mv-hasta, etcetera. */
const TIEMPOS = ['en', 'hasta', 'cambia', 'dura'];
/** El aire que se le deja abajo al beneficio recien abierto cuando la pagina baja a ensenarlo. */
const AIRE = 16;

/**
 * @param {ParentNode} raiz
 * @param {string} selector
 * @returns {HTMLElement}
 */
function pieza(raiz, selector) {
  const elemento = raiz.querySelector(selector);
  if (!(elemento instanceof HTMLElement)) throw new Error(`Tu agente: falta ${selector}`);
  return elemento;
}

/**
 * Da vida al menu de beneficios que ya viene escrito en la pagina.
 * @param {HTMLElement} raiz
 */
export function montarAgente(raiz) {
  const menu = pieza(raiz, '.beneficios');
  const beneficios = /** @type {HTMLElement[]} */ ([...raiz.querySelectorAll('[data-beneficio]')]);
  const videos = beneficios.map((beneficio) => pieza(beneficio, '[data-mv]'));
  const dichos = beneficios.map((beneficio) => pieza(beneficio, '.beneficio__dice'));
  // La barra del mini video es una sola: se muda al que se abre.
  const plantilla = /** @type {HTMLTemplateElement} */ (pieza(raiz, '[data-mv-barra]'));
  const barra = pieza(/** @type {DocumentFragment} */ (plantilla.content.cloneNode(true)), '.mv__barra');
  const pausa = pieza(barra, '[data-mv-pausa]');
  const avance = pieza(barra, '[data-mv-avance]');
  const duracion = pieza(barra, '[data-mv-dura]');
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const ancha = matchMedia('(min-width: 900px)');

  /**
   * Cada pieza aparece a su tiempo: el retraso lo dicen los datos y lo cumplen los estilos.
   * @param {HTMLElement} donde
   */
  function aTiempo(donde) {
    for (const nombre of TIEMPOS) {
      for (const elemento of /** @type {NodeListOf<HTMLElement>} */ (donde.querySelectorAll(`[data-${nombre}]`))) {
        elemento.style.setProperty(`--mv-${nombre}`, `${elemento.dataset[nombre]}s`);
      }
    }
  }
  aTiempo(raiz);

  let estado = estadoInicial({
    abierto: Math.max(
      0,
      beneficios.findIndex((beneficio) => beneficio.hasAttribute('data-abierto')),
    ),
    quieto: sinMovimiento.matches,
  });
  /** El mini video abierto asoma lo suficiente en la pantalla. */
  let enPantalla = false;
  /** Las fotos de las escenas guardadas ya se pidieron. */
  let pedidas = false;
  /** @type {HTMLElement | undefined} */
  let vigilado;

  // El mini video solo corre mientras se ve: la misma regla con que se encienden las demas secciones.
  const vigia = new IntersectionObserver(
    (entradas) => {
      const ultima = entradas.filter((entrada) => entrada.target === vigilado).at(-1);
      if (!ultima) return;
      enPantalla =
        ultima.isIntersecting &&
        yaLlego({
          parte: ultima.intersectionRatio,
          alto: ultima.boundingClientRect.height,
          pantalla: ultima.rootBounds?.height ?? innerHeight,
        });
      alVer();
    },
    { threshold: [0, 0.2] },
  );

  /**
   * Pone la pagina como dice el estado.
   * @param {Estado} [antes]
   */
  function pintar(antes) {
    const abierto = /** @type {HTMLElement} */ (beneficios[estado.abierto]);
    const video = /** @type {HTMLElement} */ (videos[estado.abierto]);
    for (const [lugar, beneficio] of beneficios.entries()) {
      const es = beneficio === abierto;
      beneficio.toggleAttribute('data-abierto', es);
      if (!es) beneficio.removeAttribute('data-fase');
      botones[lugar]?.setAttribute('aria-expanded', String(es));
    }
    if (vigilado !== video) {
      if (vigilado) vigia.unobserve(vigilado);
      // La escena de un beneficio que llega cerrado viaja guardada: se saca la primera vez que se abre.
      const guardada = video.querySelector('template');
      if (guardada) {
        guardada.replaceWith(guardada.content);
        aTiempo(video);
      }
      video.append(barra);
      duracion.textContent = reloj(Number(video.dataset.dura));
      vigilado = video;
      vigia.observe(video);
    }
    // El que vuelve a empezar suelta sus animaciones y las toma de nuevo, desde cero.
    if (antes && antes.vuelta !== estado.vuelta) {
      abierto.removeAttribute('data-fase');
      video.getBoundingClientRect();
    }
    // Ya terminado no lleva marca: lo que se ve es su ultimo cuadro, que es lo que los estilos traen escrito.
    if (estado.fase === 'fin') abierto.removeAttribute('data-fase');
    else abierto.dataset.fase = estado.fase;
    raiz.toggleAttribute('data-anda', anda(estado));
    const boton = botonDe(estado);
    pausa.dataset.estado = boton;
    pausa.setAttribute('aria-label', raiz.dataset[boton] ?? '');
  }

  /** @param {Evento} evento */
  function mover(evento) {
    const antes = estado;
    estado = avanzar(estado, evento, beneficios.length);
    if (estado !== antes) pintar(antes);
  }

  /** La visitante llego al mini video, se fue de el o cambio de pestana. */
  function alVer() {
    // Al llegar por primera vez se piden las fotos de las escenas guardadas: asi ya estan cuando se abran.
    if (enPantalla && !pedidas) {
      pedidas = true;
      for (const guardada of raiz.querySelectorAll('template')) {
        for (const foto of guardada.content.querySelectorAll('img')) new Image().src = foto.getAttribute('src') ?? '';
      }
    }
    mover({ tipo: 'vista', aLaVista: enPantalla && !document.hidden });
  }

  /**
   * La visitante eligio un beneficio. En el acordeon el que estaba abierto se cierra de golpe: si quedaba arriba, la
   * pagina se recorre lo mismo, para que el renglon tocado no se mueva de donde esta el dedo. En computadora la
   * pagina no se toca: el escenario esta a un lado y no tiene por que moverse.
   * @param {number} lugar
   */
  function elegir(lugar) {
    const boton = /** @type {HTMLElement} */ (botones[lugar]);
    // De aqui en adelante lo que se abre lo abre ella: entra con suavidad.
    raiz.dataset.tocada = '';
    const acordeon = !ancha.matches;
    const estaba = acordeon ? boton.getBoundingClientRect().top : 0;
    mover({ tipo: 'elige', cual: lugar });
    if (!acordeon) return;
    const brinco = boton.getBoundingClientRect().top - estaba;
    if (brinco !== 0) scrollBy({ top: brinco, behavior: 'instant' });
    if (estado.quieto) return;
    // Y si lo que se abrio no cabe en la pantalla, la pagina baja con suavidad lo justo para ensenarlo.
    const caja = /** @type {HTMLElement} */ (beneficios[lugar]).getBoundingClientRect();
    const pagina = getComputedStyle(document.documentElement);
    const baja = cuantoBajar({
      arriba: caja.top,
      abajo: caja.bottom + AIRE,
      techo: Number.parseFloat(pagina.scrollPaddingTop) || 0,
      piso: innerHeight - (Number.parseFloat(pagina.scrollPaddingBottom) || 0),
    });
    if (baja > 0) scrollBy({ top: baja, behavior: 'smooth' });
  }

  /**
   * En computadora el menu aparta lo alto de su oracion mas larga: al cambiar de beneficio nada de abajo brinca. En
   * celular no hace falta (lo abierto se abre ahi mismo) y no se mide.
   */
  function medir() {
    if (!ancha.matches) return;
    const alto = (/** @type {Element | undefined} */ elemento) => elemento?.getBoundingClientRect().height ?? 0;
    const renglones = beneficios.map((beneficio, lugar) => alto(beneficio) - alto(dichos[lugar]));
    // Lo alto de una oracion guardada solo se sabe en puntos enteros: se le aparta uno de mas, y asi nunca le falta.
    const oraciones = dichos.map((dicho) => (dicho.firstElementChild?.scrollHeight ?? 0) + 1);
    menu.style.setProperty('--menu-alto', `${altoDelMenu(renglones, oraciones)}px`);
  }

  // Cada renglon del menu se vuelve un boton de verdad. Sin este archivo se queda como titulo, con su oracion debajo.
  const botones = beneficios.map((beneficio, lugar) => {
    const marca = pieza(beneficio, '[data-beneficio-boton]');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = marca.className;
    boton.setAttribute('aria-controls', pieza(beneficio, '.beneficio__panel').id);
    boton.append(...marca.childNodes);
    marca.replaceWith(boton);
    boton.addEventListener('click', () => elegir(lugar));
    return boton;
  });

  pintar();
  medir();
  pausa.addEventListener('click', () => mover({ tipo: 'boton' }));
  avance.addEventListener('animationend', () => mover({ tipo: 'termina' }));
  document.addEventListener('visibilitychange', alVer);
  sinMovimiento.addEventListener('change', () => mover({ tipo: 'quieto', quieto: sinMovimiento.matches }));
  addEventListener('resize', medir);
  document.fonts?.ready.then(medir);
  // Hasta aqui todo salio bien: el menu queda vivo.
  raiz.removeAttribute('data-lista');
  raiz.dataset.viva = '';
}
