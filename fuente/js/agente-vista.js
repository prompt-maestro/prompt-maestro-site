// @ts-check
// La vista de "Tu agente": sus dos capitulos ("Lo que hace" y "Como empiezas") son dos menus iguales. En cada uno se
// vuelve boton cada renglon, se abre uno a la vez y se echa a andar su mini video. Cada escena se mueve con los
// estilos (animaciones con el retraso de los datos); aqui solo se abre, se cierra, se pausa y se vuelve a empezar. El
// selector de capitulos ensena un menu y guarda el otro. Lo que se decide sin tocar la pantalla vive en agente.js.
import {
  altoDelMenu,
  anda,
  avanzar,
  botonDe,
  capituloCon,
  cuantoBajar,
  cuantoRecorrer,
  estadoInicial,
  reloj,
} from './agente.js';
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
 * Vuelve boton de verdad una marca que la pagina trae escrita como texto: sin este archivo se queda como texto.
 * @param {HTMLElement} marca
 * @returns {HTMLButtonElement}
 */
function hacerBoton(marca) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = marca.className;
  boton.append(...marca.childNodes);
  marca.replaceWith(boton);
  return boton;
}

/**
 * Comprueba, sin tocar nada, que la seccion trae todo lo que se va a necesitar. Si falta una pieza truena aqui, antes
 * de volver boton un solo renglon: asi una falla nunca deja la seccion a medias (un menu vivo y el otro no), y la
 * pagina la deja entera como lista.
 * @param {HTMLElement} seccion
 * @param {HTMLElement[]} menus
 */
function comprobar(seccion, menus) {
  if (menus.length === 0) throw new Error('Tu agente: no hay ningun menu');
  const selector = pieza(seccion, '[data-capitulos]');
  const barra = /** @type {HTMLTemplateElement} */ (pieza(seccion, '[data-mv-barra]')).content;
  for (const parte of ['.mv__barra', '[data-mv-pausa]', '[data-mv-avance]', '[data-mv-dura]']) pieza(barra, parte);
  for (const menu of menus) {
    pieza(selector, `[data-capitulo-boton="${menu.dataset.capitulo ?? ''}"]`);
    pieza(menu, '.beneficios');
    const renglones = menu.querySelectorAll('[data-beneficio]');
    if (renglones.length === 0) throw new Error('Tu agente: un menu no trae renglones');
    for (const renglon of renglones) {
      for (const parte of ['[data-mv]', '.beneficio__dice', '[data-beneficio-boton]', '.beneficio__panel']) {
        pieza(renglon, parte);
      }
    }
  }
}

/**
 * Da vida a "Tu agente": a cada uno de sus menus y al selector de capitulos.
 * @param {HTMLElement} seccion  lo que envuelve al selector y a los menus
 */
export function montarAgentes(seccion) {
  const menus = /** @type {HTMLElement[]} */ ([...seccion.querySelectorAll('[data-agente]')]);
  // Si esta pieza llego tan tarde que la pagina ya dejo la seccion escrita como lista, asi se queda: despertarla ahora
  // moveria de lugar, con la pagina ya en uso, todo lo que hay debajo.
  if (menus.some((menu) => menu.hasAttribute('data-lista'))) return;
  comprobar(seccion, menus);
  const medidas = menus.map((menu) => montarAgente(menu, seccion));
  montarCapitulos(seccion, menus, medidas);
}

/**
 * El selector de capitulos: cada marca se vuelve una pestana de verdad y cada menu, su panel. Se ve un capitulo a la
 * vez; el mini video del que se guarda deja de verse, y con eso se detiene solo.
 * @param {HTMLElement} seccion
 * @param {HTMLElement[]} menus  un menu por capitulo, en su orden
 * @param {(() => void)[]} medidas  lo que vuelve a medir cada menu cuando se ensena
 */
function montarCapitulos(seccion, menus, medidas) {
  const selector = pieza(seccion, '[data-capitulos]');
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  selector.setAttribute('role', 'tablist');
  selector.setAttribute('aria-label', selector.dataset.rotulo ?? '');
  const pestanas = menus.map((menu, lugar) => {
    const clave = menu.dataset.capitulo ?? '';
    const pestana = hacerBoton(pieza(selector, `[data-capitulo-boton="${clave}"]`));
    pestana.id = `pestana-${clave}`;
    pestana.setAttribute('role', 'tab');
    pestana.setAttribute('aria-controls', menu.id);
    menu.setAttribute('role', 'tabpanel');
    menu.setAttribute('aria-labelledby', pestana.id);
    pestana.addEventListener('click', () => mostrar(lugar));
    // Con las flechas de lado se pasa de una pestana a la otra, como en cualquier juego de pestanas en renglon.
    pestana.addEventListener('keydown', (evento) => {
      const cual = capituloCon(evento.key, lugar, menus.length);
      if (cual === lugar) return;
      evento.preventDefault();
      mostrar(cual);
      pestanas[cual]?.focus();
    });
    return pestana;
  });

  /** @param {number} lugar  el capitulo que se ensena; los demas se guardan */
  function mostrar(lugar) {
    for (const [cual, menu] of menus.entries()) {
      const es = cual === lugar;
      const pestana = /** @type {HTMLButtonElement} */ (pestanas[cual]);
      menu.toggleAttribute('data-guardado', !es);
      pestana.toggleAttribute('data-activo', es);
      pestana.setAttribute('aria-selected', String(es));
      pestana.tabIndex = es ? 0 : -1;
    }
    // El menu que se ensena aparta su alto ahora que se puede medir.
    medidas[lugar]?.();
  }

  // Al final de un capitulo, el paso al siguiente: lo ensena y sube la pagina al principio de la seccion (asi el
  // escenario, que cuelga del titulo, queda entero a la vista), con el foco en su pestana.
  for (const [lugar, menu] of menus.entries()) {
    const marca = menu.querySelector('[data-capitulo-sigue]');
    if (!(marca instanceof HTMLElement) || lugar + 1 >= menus.length) continue;
    hacerBoton(marca).addEventListener('click', () => {
      mostrar(lugar + 1);
      pestanas[lugar + 1]?.focus({ preventScroll: true });
      seccion.scrollIntoView({ block: 'start', behavior: sinMovimiento.matches ? 'instant' : 'smooth' });
    });
  }

  mostrar(
    Math.max(
      0,
      menus.findIndex((menu) => !menu.hasAttribute('data-guardado')),
    ),
  );
  selector.dataset.viva = '';
}

/**
 * Da vida a un menu que ya viene escrito en la pagina: el de un capitulo.
 * @param {HTMLElement} raiz
 * @param {HTMLElement} seccion  donde vive la barra del mini video, que comparten los menus
 * @returns {() => void}  lo que vuelve a medir el menu: se llama cuando su capitulo se ensena
 */
function montarAgente(raiz, seccion) {
  const menu = pieza(raiz, '.beneficios');
  const beneficios = /** @type {HTMLElement[]} */ ([...raiz.querySelectorAll('[data-beneficio]')]);
  const videos = beneficios.map((beneficio) => pieza(beneficio, '[data-mv]'));
  const dichos = beneficios.map((beneficio) => pieza(beneficio, '.beneficio__dice'));
  // La barra del mini video es una sola por menu: se muda al que se abre.
  const plantilla = /** @type {HTMLTemplateElement} */ (pieza(seccion, '[data-mv-barra]'));
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
   * pagina se recorre lo mismo, para que el renglon tocado no se mueva de donde esta el dedo. En computadora el
   * escenario esta a un lado, pegado bajo la barra de la pagina: la pagina solo se recorre si no se ve entero (al
   * final del menu va de salida, y recien llegada a la seccion puede no caber su parte de abajo).
   * @param {number} lugar
   */
  function elegir(lugar) {
    const boton = /** @type {HTMLElement} */ (botones[lugar]);
    // De aqui en adelante lo que se abre lo abre ella: entra con suavidad.
    raiz.dataset.tocada = '';
    const acordeon = !ancha.matches;
    const estaba = acordeon ? boton.getBoundingClientRect().top : 0;
    mover({ tipo: 'elige', cual: lugar });
    if (!acordeon) {
      const escenario = /** @type {HTMLElement} */ (videos[lugar]);
      const { top, bottom } = escenario.getBoundingClientRect();
      const recorre = cuantoRecorrer({
        arriba: top,
        abajo: bottom + AIRE,
        techo: Number.parseFloat(getComputedStyle(escenario).top) || 0,
        piso: innerHeight,
      });
      if (Math.abs(recorre) >= 1) scrollBy({ top: recorre, behavior: estado.quieto ? 'instant' : 'smooth' });
      return;
    }
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
    // Un capitulo guardado no mide nada: se mide cuando se ensena.
    if (!ancha.matches || raiz.hasAttribute('data-guardado')) return;
    const alto = (/** @type {Element | undefined} */ elemento) => elemento?.getBoundingClientRect().height ?? 0;
    const renglones = beneficios.map((beneficio, lugar) => alto(beneficio) - alto(dichos[lugar]));
    // Lo alto de una oracion guardada solo se sabe en puntos enteros: se le aparta uno de mas, y asi nunca le falta.
    const oraciones = dichos.map((dicho) => (dicho.firstElementChild?.scrollHeight ?? 0) + 1);
    menu.style.setProperty('--menu-alto', `${altoDelMenu(renglones, oraciones)}px`);
  }

  // Cada renglon del menu se vuelve un boton de verdad. Sin este archivo se queda como titulo, con su oracion debajo.
  const botones = beneficios.map((beneficio, lugar) => {
    const boton = hacerBoton(pieza(beneficio, '[data-beneficio-boton]'));
    boton.setAttribute('aria-controls', pieza(beneficio, '.beneficio__panel').id);
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
  raiz.dataset.viva = '';
  return medir;
}
