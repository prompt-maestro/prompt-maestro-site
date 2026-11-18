// @ts-check
// El corto en la pagina. Solo existe en pantallas anchas: ahi corre solo al abrir, en una sola pantalla, y al
// terminar deja a la vista el cartel, que siempre estuvo debajo. Cuenta UN oficio por visita, el que arranque.js
// eligio al azar; al verlo de nuevo toca el que sigue. En celular y en tableta de pie no corre nunca: se ve el cartel
// y de aqui no se pide ni un video. El scroll no controla nada: si la visitante baja a media pelicula, el corto se da
// por terminado. Que momento toca lo decide corto.js; aqui solo se escucha y se mueve la pagina.
import {
  andar,
  arrastre,
  barrido,
  CARTEL,
  corridos,
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
} from './corto.js';

/** Donde corre el corto. La misma pregunta que hacen los estilos para pintar sus capas y sus controles. */
const ANCHA = '(min-width: 900px) and (min-aspect-ratio: 1/1)';
/**
 * Con menos alto que esto (una ventana muy bajita, o una pantalla con zoom de 400 %) el corto no cabe: queda el
 * cartel, que se lee completo con cualquier tamano de letra. La misma pregunta la hacen los estilos.
 */
const MUY_BAJITA = '(max-height: 479px)';
const QUIETA = '(prefers-reduced-motion: reduce)';
/** Lo que espera, ya cargada la pagina, para ir por el video: primero llega lo que se ve. */
const ESPERA_DEL_VIDEO = 300;
/** Lo que tarda un video en fundirse con su foto antes de volver a empezar: el mismo fundido de los estilos. */
const FUNDIDO_DEL_VIDEO = 900;
/** El aire entre ese fundido y la conversacion del agente: cuando ella empieza, la toma ya va otra vez de corrido. */
const AIRE_DEL_RELEVO = 400;
/** Los dos momentos que el codigo mueve cuadro por cuadro; los demas son cosa de los estilos. */
const AVALANCHA = 'avalancha';
const BARRIDO = 'barrido';
/** El momento en que la toma viva no debe notarse volver a empezar: ahi se mira a quien trabaja. */
const AGENTE = 'agente';
/** Lo que se inclina la raya de luz del barrido, en grados. */
const INCLINACION = 5;
/** Lo mas que la raya se lleva de lado lo que va barriendo, en centesimas del ancho de la pantalla. */
const EMPUJE = 24;
/** Desde cuanto de la seccion fuera de la pantalla la barra de arriba toma su fondo. */
const CASI_ENTERA = 0.98;

/**
 * @param {ParentNode} raiz
 * @param {string} selector
 * @returns {HTMLElement}
 */
function pieza(raiz, selector) {
  const elemento = raiz.querySelector(selector);
  if (!(elemento instanceof HTMLElement)) throw new Error(`Corto: falta ${selector}`);
  return elemento;
}

/**
 * @param {ParentNode} raiz
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
function piezas(raiz, selector) {
  return /** @type {HTMLElement[]} */ ([...raiz.querySelectorAll(selector)]);
}

/**
 * Le dice a los estilos a donde mira la camara en la foto de una escena o de una franja (a la persona), donde esta
 * el celular de la mesa y que zona ocupa la toma viva. Los numeros salen del dato de cada oficio: sumar uno no toca
 * los estilos.
 * @param {HTMLElement} caja
 */
function encuadrar(caja) {
  /** @param {Record<string, number>} medidas */
  const poner = (medidas) => {
    for (const [nombre, valor] of Object.entries(medidas)) caja.style.setProperty(nombre, String(valor));
  };
  const persona = punto(caja.dataset.persona);
  const celular = zona(caja.dataset.celular);
  const viva = zona(caja.dataset.viva);
  if (persona) poner({ '--fx': persona.x, '--fy': persona.y });
  if (celular) {
    poner({
      '--cx': celular.x + celular.ancho / 2,
      '--cy': celular.y + celular.alto / 2,
      '--cw': celular.ancho,
      '--ch': celular.alto,
    });
  }
  if (viva) poner({ '--vx': viva.x, '--vy': viva.y, '--vw': viva.ancho, '--vh': viva.alto });
}

/**
 * La vibracion del celular: dos copias de la foto de la escena, recortadas (por los estilos) al celular.
 * @param {HTMLElement} escena
 */
function ponerFantasmas(escena) {
  const foto = escena.querySelector('picture');
  const lugar = escena.querySelector('.foto__vivo');
  if (!foto || !lugar) return;
  for (const lado of ['a', 'b']) {
    const fantasma = document.createElement('div');
    fantasma.className = `fantasma fantasma--${lado}`;
    fantasma.append(foto.cloneNode(true));
    lugar.append(fantasma);
  }
}

/**
 * Da vida al corto que ya viene escrito en la pagina.
 * @param {HTMLElement} raiz  la seccion del inicio, el elemento [data-corto]
 */
export function montarCorto(raiz) {
  const guion = leerGuion(raiz.dataset.guion);
  const [primero] = guion;
  // Sin guion, en una ventana muy bajita o en un navegador que no sabe medir las escenas, queda el cartel. Y si la
  // pagina ya dio al corto por perdido (esta pieza llego demasiado tarde), tambien: sus capas ya no se pintan.
  const bajita = matchMedia(MUY_BAJITA);
  if (!primero || bajita.matches || !CSS.supports('width', '1cqw')) return;
  const pagina = document.documentElement;
  if (!pagina.classList.contains('con-corto')) return;
  const inicio = primero.clave;

  const cine = pieza(raiz, '[data-corto-cine]');
  const cartel = pieza(raiz, '[data-cartel]');
  const control = pieza(raiz, '[data-corto-control]');
  const saltar = pieza(raiz, '[data-corto-saltar]');
  const pausa = pieza(raiz, '[data-corto-pausa]');
  const avance = pieza(raiz, '[data-corto-avance]');
  const ver = pieza(raiz, '[data-corto-ver]');
  const verTexto = pieza(raiz, '[data-corto-ver-texto]');
  const antes = pieza(raiz, '[data-corto-antes]');
  const antesDentro = pieza(raiz, '[data-corto-antes-dentro]');
  const carro = pieza(raiz, '[data-corto-carro]');
  const letreros = piezas(raiz, '[data-letrero]');
  // Una escena por oficio, con luz fria y con luz calida, y a la vista solo las del oficio que toca.
  const frias = piezas(raiz, '[data-escenas="fria"] [data-escena]');
  const calidas = piezas(raiz, '[data-escenas="calida"] [data-escena]');
  const franjas = piezas(raiz, '[data-franja]');
  const oficios = frias.map((escena) => escena.dataset.escena ?? '');
  /** @param {Element} elemento  de que oficio es la escena que lo trae */
  const oficioDe = (elemento) => elemento.closest('[data-escena]')?.getAttribute('data-escena') ?? '';
  // El celular de cada oficio lleva su propia cuenta de mensajes sin contestar: ninguno recibe los mismos que otro.
  const cuentas = piezas(raiz, '[data-corto-cuenta]').map((cuenta) => ({
    cuenta,
    oficio: oficioDe(cuenta),
    limites: { base: Number(cuenta.dataset.base) || 0, tope: Number(cuenta.dataset.tope) || 0 },
  }));
  const videos = /** @type {HTMLVideoElement[]} */ ([...raiz.querySelectorAll('video[data-src]')]).map((video) => ({
    video,
    oficio: oficioDe(video),
  }));
  /** Los videos que ya terminaron su pasada y esperan, fundiendose con su foto, para volver a empezar. */
  /** @type {Map<HTMLVideoElement, ReturnType<typeof setTimeout>>} */
  const relevos = new Map();
  /** Los oficios cuya foto ya se pidio (por adelantado, o porque su escena ya corrio): ninguna se pide dos veces. */
  /** @type {Set<string>} */
  const adelantados = new Set();
  const calidoDesde = guion.findIndex((momento) => momento.clave === BARRIDO);
  const ancha = matchMedia(ANCHA);
  const quieta = matchMedia(QUIETA);
  /** Si el corto cabe en esta pantalla: ancha y no muy bajita. La misma pregunta que hacen los estilos. */
  const cabe = () => ancha.matches && !bajita.matches;

  // El tiempo que el corto lleva corriendo de verdad: en pausa o con la pestana escondida no avanza.
  let reloj = nuevoReloj();
  /** Si el corto esta puesto (corriendo o en pausa). Si no, lo que se ve es el cartel. */
  let corre = false;
  let pausada = false;
  let yaCorrio = false;
  let momento = '';
  let cuadro = 0;
  /** El oficio que cuenta el corto: el que arranque.js eligio para esta visita y, al verlo de nuevo, el que sigue. */
  let oficio = oficios.find((uno) => uno === pagina.dataset.oficio) ?? oficios[0] ?? '';
  /** Si sus capas ya estan listas: se preparan la primera vez que corre, nunca en una pantalla donde no corre. */
  let preparado = false;
  /** Si ya se puede ir por el video: despues de lo que se ve al abrir, y nunca con ahorro de datos. */
  let conVideos = false;
  /** Si el foco lo esta poniendo el codigo (al terminar): ese no cuenta como acercarse a un boton. */
  let porCodigo = false;

  function preparar() {
    if (preparado) return;
    preparado = true;
    for (const escena of [...frias, ...calidas]) encuadrar(escena);
    for (const escena of frias) ponerFantasmas(escena);
    for (const [turno, franja] of franjas.entries()) {
      encuadrar(franja);
      franja.style.setProperty('--n', String(turno));
    }
    for (const pantalla of piezas(raiz, '.pantalla')) {
      for (const [lugar, aviso] of piezas(pantalla, '.aviso').entries()) aviso.style.setProperty('--i', String(lugar));
    }
  }

  /** Deja a la vista las escenas del oficio que toca y guarda las demas: ni se pintan ni se piden sus fotos. */
  function ponerOficio() {
    cine.dataset.oficio = oficio;
    // Su foto ya viene en camino (la adelanto arranque.js, o se pide ahora, al pintarla): no se adelanta despues.
    adelantados.add(oficio);
    for (const escena of [...frias, ...calidas]) escena.hidden = escena.dataset.escena !== oficio;
  }

  /**
   * Pide desde ahora la foto de un oficio que todavia no se ve (el que sigue, cuando ella se acerca al boton de verlo
   * de nuevo): asi, al correr, ya esta. Que archivos son lo dice su propia escena.
   * @param {string} clave
   */
  function adelantar(clave) {
    const fuente = frias.find((escena) => escena.dataset.escena === clave)?.querySelector('source[srcset]');
    if (!fuente || adelantados.has(clave)) return;
    adelantados.add(clave);
    const adelanto = document.createElement('link');
    adelanto.setAttribute('rel', 'preload');
    adelanto.setAttribute('as', 'image');
    for (const [dato, suyo] of [
      ['type', 'type'],
      ['srcset', 'imagesrcset'],
      ['sizes', 'imagesizes'],
    ]) {
      const valor = fuente.getAttribute(dato ?? '');
      if (valor && suyo) adelanto.setAttribute(suyo, valor);
    }
    document.head.append(adelanto);
  }

  /** @param {number} parte  de 0 a 1, cuanto lleva la avalancha: con eso sube la cuenta del celular */
  function contar(parte) {
    for (const { cuenta, oficio: suyo, limites } of cuentas) {
      if (suyo !== oficio) continue;
      const texto = String(sinContestar(parte, limites));
      if (cuenta.textContent !== texto) cuenta.textContent = texto;
    }
  }

  /**
   * El barrido: la caja de lo de antes se corre a la derecha y su contenido se corre igual a la izquierda, asi lo de
   * adentro no se mueve y la orilla lo va destapando. La raya de luz viaja con la orilla y, ya dentro de la pantalla,
   * se lleva lo viejo un poco de lado y lo inclina: lo barre.
   * @param {number | null} va  de 0 a 1, o null para dejar todo en su lugar
   */
  function barrer(va) {
    if (va === null) {
      for (const capa of [antes, antesDentro, carro]) capa.style.removeProperty('transform');
      return;
    }
    const corrida = (va * 100).toFixed(3);
    antes.style.transform = `translateX(${corrida}%) skewX(-${INCLINACION}deg)`;
    carro.style.transform = antes.style.transform;
    const lleva = arrastre(va);
    const lado = `translateX(${(lleva * EMPUJE).toFixed(3)}vw) skewX(-${(lleva * INCLINACION).toFixed(3)}deg)`;
    antesDentro.style.transform = `skewX(${INCLINACION}deg) translateX(-${corrida}%) ${lado}`;
  }

  /**
   * Un video que termino su pasada se funde con su foto (que es su primer cuadro) y vuelve a empezar: detras de la
   * marca y de lo que hizo el agente, el trabajo nunca se queda quieto.
   * @param {HTMLVideoElement} video
   */
  function relevar(video) {
    if (relevos.has(video)) return;
    video.closest('[data-escena]')?.removeAttribute('data-con-video');
    relevos.set(
      video,
      setTimeout(() => {
        relevos.delete(video);
        if (video.readyState > 0) video.currentTime = 0;
        videosAlDia();
      }, FUNDIDO_DEL_VIDEO),
    );
  }

  /**
   * Desde que segundo entra la toma viva al mudarse a la luz calida. Dura menos que lo que falta del corto, asi que
   * una vez tiene que volver a empezar: entra a media pasada para que eso caiga mientras la marca la tapa, y cuando
   * empieza la conversacion del agente ya va otra vez de corrido.
   * @param {HTMLVideoElement} video
   * @returns {number}
   */
  function entrada(video) {
    const falta = empiezaEn(guion, AGENTE) - FUNDIDO_DEL_VIDEO - AIRE_DEL_RELEVO - corridos(reloj, performance.now());
    return entradaDeLaToma(video.duration * 1000, falta) / 1000;
  }

  /**
   * El video solo corre mientras el corto corre y se ve: primero con la luz fria y, desde el barrido, con la calida.
   * Es el mismo video: se muda de una escena a la otra cuando nadie lo ve, y al terminar su pasada vuelve a empezar.
   * Solo se pide el del oficio que toca, y mientras el corto no corre no se pide: en celular, nunca.
   */
  function videosAlDia() {
    const andan = conVideos && corre && !pausada && !document.hidden;
    const calido = calidoDesde >= 0 && guion.findIndex((uno) => uno.clave === momento) >= calidoDesde;
    for (const { video, oficio: suyo } of videos) {
      if (suyo !== oficio) {
        video.pause();
        continue;
      }
      const escena = (calido ? calidas : frias).find((una) => una.dataset.escena === suyo);
      const destino = escena?.querySelector('[data-corto-luz]');
      if (corre && destino && video.parentElement !== destino) {
        video.pause();
        video.closest('[data-escena]')?.removeAttribute('data-con-video');
        clearTimeout(relevos.get(video));
        relevos.delete(video);
        destino.append(video);
        if (video.readyState > 0) video.currentTime = calido ? entrada(video) : 0;
      }
      if (!andan) {
        video.pause();
        continue;
      }
      if (video.ended) {
        relevar(video);
        continue;
      }
      if (!video.src && video.dataset.src) video.src = video.dataset.src;
      video.play().catch(() => {});
    }
  }

  /** @param {string} clave  el momento que empieza */
  function ponerMomento(clave) {
    momento = clave;
    raiz.dataset.cuadro = clave;
    cine.dataset.momento = clave;
    // Lo que dura el momento: con eso los estilos miden lo que tiene que caber en el (el latido del halo).
    const dura = guion.find((uno) => uno.clave === clave)?.dura ?? 0;
    cine.style.setProperty('--dura', `${dura}ms`);
    for (const letrero of letreros) letrero.toggleAttribute('data-activo', letrero.dataset.letrero === clave);
    if (clave !== BARRIDO) barrer(null);
    if (clave === BARRIDO) contar(1);
    videosAlDia();
  }

  /** @param {number} ahora */
  function pintar(ahora) {
    const instante = momentoEn(guion, corridos(reloj, ahora));
    if (instante.fin) {
      terminar();
      return;
    }
    if (instante.clave !== momento) ponerMomento(instante.clave);
    avance.style.transform = `scaleX(${instante.avance.toFixed(4)})`;
    if (momento === AVALANCHA) contar(instante.parte);
    if (momento === BARRIDO) barrer(barrido(instante.parte));
  }

  function ciclo() {
    cancelAnimationFrame(cuadro);
    if (!corre || pausada || document.hidden) return;
    cuadro = requestAnimationFrame(() => {
      pintar(performance.now());
      ciclo();
    });
  }

  /** El boton del cartel dice lo que va a pasar: ver el video por primera vez, o verlo de nuevo. */
  function rotular() {
    verTexto.textContent = (yaCorrio ? ver.dataset.deNuevo : ver.dataset.elVideo) ?? '';
  }

  function arrancar() {
    preparar();
    ponerOficio();
    corre = true;
    pausada = false;
    // Una pestana que se abrio escondida todavia no ha visto nada: el reloj espera, detenido, a que la miren.
    reloj = document.hidden ? nuevoReloj() : andar(nuevoReloj(), performance.now());
    raiz.toggleAttribute('data-pausada', document.hidden);
    pausa.setAttribute('aria-pressed', 'false');
    avance.style.transform = 'scaleX(0)';
    for (const { video } of videos) if (video.readyState > 0) video.currentTime = 0;
    // El momento y su letrero se quitan y se vuelven a poner: asi las entradas de la primera toma corren otra vez
    // desde su principio, tambien si el corto se corto en ella.
    for (const letrero of letreros) letrero.removeAttribute('data-activo');
    cine.removeAttribute('data-momento');
    void cine.offsetWidth;
    ponerMomento(inicio);
    ciclo();
  }

  /** El corto se acaba (termino, lo saltaron, la visitante bajo o la ventana se angosto): queda el cartel. */
  function terminar() {
    if (!corre) return;
    corre = false;
    pausada = false;
    yaCorrio = true;
    reloj = parar(reloj, performance.now());
    cancelAnimationFrame(cuadro);
    raiz.dataset.cuadro = CARTEL;
    raiz.removeAttribute('data-pausada');
    pausa.setAttribute('aria-pressed', 'false');
    rotular();
    videosAlDia();
    // El foco no se queda en un control que ya no se ve: pasa al boton que corre el corto o, donde ese boton no
    // existe (la ventana dejo de ser ancha), al primer enlace del cartel.
    if (control.contains(document.activeElement)) {
      const destino = ver.offsetParent ? ver : cartel.querySelector('a');
      if (destino instanceof HTMLElement) {
        porCodigo = true;
        destino.focus({ preventScroll: true });
        porCodigo = false;
      }
    }
  }

  saltar.addEventListener('click', terminar);

  // La pausa detiene el reloj, los videos y las animaciones; el mismo boton lo reanuda.
  pausa.addEventListener('click', () => {
    if (!corre) return;
    pausada = !pausada;
    reloj = pausada ? parar(reloj, performance.now()) : andar(reloj, performance.now());
    raiz.toggleAttribute('data-pausada', pausada);
    pausa.setAttribute('aria-pressed', String(pausada));
    videosAlDia();
    ciclo();
  });

  // Ella pidio verlo: corre aunque haya pedido menos movimiento o ahorro de datos. Quien ya lo vio ve ahora el oficio
  // que sigue: asi conoce otra profesion. El foco pasa a la pausa, que es lo que sigue a la mano.
  ver.addEventListener('click', () => {
    if (!cabe()) return;
    if (yaCorrio) oficio = siguienteOficio(oficios, oficio);
    raiz.setAttribute('data-pedido', '');
    arrancar();
    pausa.focus({ preventScroll: true });
  });

  // En cuanto se acerca a ese boton (con el puntero o con el teclado), la foto del oficio que sigue se va pidiendo.
  // El foco que le pasa el codigo al terminar no cuenta: nadie se acerco.
  for (const aviso of ['pointerenter', 'focus']) {
    ver.addEventListener(aviso, () => {
      if (yaCorrio && !porCodigo && cabe()) adelantar(siguienteOficio(oficios, oficio));
    });
  }

  // Si el teclado llega al cartel mientras el corto lo tapa, el corto se quita: el foco nunca queda en algo escondido.
  cartel.addEventListener('focusin', terminar);

  // Con la pestana escondida el reloj no avanza, y con el todo lo demas.
  document.addEventListener('visibilitychange', () => {
    if (!corre || pausada) return;
    reloj = document.hidden ? parar(reloj, performance.now()) : andar(reloj, performance.now());
    raiz.toggleAttribute('data-pausada', document.hidden);
    // Escondida, la pagina deja de pintarse: se le pide una medida para que la pausa de las animaciones quede puesta
    // antes de eso. Si no, al volver brincarian todo el tiempo que estuvo escondida y el reloj no.
    if (document.hidden) void raiz.offsetWidth;
    videosAlDia();
    ciclo();
  });

  // Si la seccion sale de la pantalla mientras corre, el corto se da por terminado: al volver se ve el cartel.
  new IntersectionObserver((entradas) => {
    if (entradas.some((entrada) => !entrada.isIntersecting)) terminar();
  }).observe(raiz);

  // Si la ventana deja de dar para el corto a media pelicula (se angosta, o se queda muy bajita como un celular que
  // se acuesta), tambien: ahi el corto no existe. Al volver a caber no arranca solo; queda el cartel con su boton.
  for (const consulta of [ancha, bajita]) {
    consulta.addEventListener('change', () => {
      if (!cabe()) terminar();
    });
  }

  // Y si ella pide menos movimiento a media pelicula, se le respeta en el acto, salvo que el corto lo haya pedido.
  quieta.addEventListener('change', () => {
    if (quieta.matches && !raiz.hasAttribute('data-pedido')) terminar();
  });

  for (const { video } of videos) {
    video.addEventListener('playing', () => video.closest('[data-escena]')?.setAttribute('data-con-video', ''));
    video.addEventListener('ended', videosAlDia);
  }

  // Lo pesado llega despues de lo que se ve. Con ahorro de datos el video no se pide: el corto corre con su foto.
  const despuesDeCargar = () => {
    setTimeout(() => {
      const conexion = /** @type {{ saveData?: boolean } | undefined} */ (Reflect.get(navigator, 'connection'));
      conVideos = !conexion?.saveData;
      videosAlDia();
    }, ESPERA_DEL_VIDEO);
  };
  if (document.readyState === 'complete') despuesDeCargar();
  else window.addEventListener('load', despuesDeCargar, { once: true });

  for (const guardado of [control, ver]) guardado.hidden = false;
  rotular();
  raiz.setAttribute('data-viva', '');
  // Solo corre solo en una pantalla ancha, sin movimiento reducido, sin ahorro de datos ni conexion lenta (lo anota
  // arranque.js en <html>) y con la seccion enfrente (quien llega por un ancla, o recarga mas abajo, no lo tiene): en
  // cualquier otro caso se ve el cartel.
  const corresolo =
    cabe() && !quieta.matches && !pagina.hasAttribute('data-ahorro') && raiz.getBoundingClientRect().bottom > 0;
  if (corresolo) arrancar();
  else raiz.dataset.cuadro = CARTEL;
}

/**
 * La barra de arriba va transparente mientras el inicio no se ha movido de su lugar y toma su fondo en cuanto la
 * pagina baja: asi nada de lo que le pasa por debajo se imprime sobre el logotipo. La pantalla se cuenta como si
 * siguiera hacia abajo: en un celular bajito el inicio mide mas que ella, y aun asi arranca con la barra transparente.
 * @param {HTMLElement} barra
 * @param {HTMLElement} corto
 */
export function montarBarra(barra, corto) {
  const vigia = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) barra.toggleAttribute('data-fondo', entrada.intersectionRatio < CASI_ENTERA);
    },
    { threshold: CASI_ENTERA, rootMargin: '0px 0px 100% 0px' },
  );
  vigia.observe(corto);
}
