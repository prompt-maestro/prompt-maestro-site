// @ts-check
// El comercial en la pagina: al bajar, cada tramo del recorrido es una toma; los oficios rotan solos en la primera y
// la visitante puede elegir el suyo. Lo que se decide vive en pelicula.js; aqui solo se escucha y se mueve la pagina.
import { mundoDe, oficioDe, rota, siguienteOficio, sinContestar } from './pelicula.js';

/** @typedef {import('./pelicula.js').Toma} Toma */

/** La misma pregunta que hacen los estilos para poner los tres oficios lado a lado. */
const ANCHA = '(min-width: 900px) and (min-aspect-ratio: 1/1)';
/** Cada cuanto cambia de oficio la primera toma. */
const CADA_OFICIO = 4600;
/** Cada cuanto se revisa el contador de mensajes. */
const CADA_CUENTA = 400;
/** Lo que espera, ya cargada la pagina, para ir por el video y por las fotos de la espera. */
const ESPERA_DE_LO_PESADO = 1600;

/**
 * @param {HTMLElement} raiz  el elemento [data-pelicula]
 */
export function montarPelicula(raiz) {
  const pasos = /** @type {HTMLElement[]} */ ([...raiz.querySelectorAll('[data-paso]')]);
  const paneles = /** @type {HTMLElement[]} */ ([...raiz.querySelectorAll('[data-panel]')]);
  const rotulos = /** @type {HTMLElement[]} */ ([...raiz.querySelectorAll('[data-rotulo]')]);
  const botones = /** @type {HTMLButtonElement[]} */ ([...raiz.querySelectorAll('[data-elegir]')]);
  const cuenta = raiz.querySelector('[data-cuenta]');
  const pausa = raiz.querySelector('[data-pausa]');
  /** @type {Toma[]} */
  const tomas = pasos.map((paso) => ({ clave: paso.dataset.paso ?? '', oficio: paso.dataset.oficio ?? '' }));
  const claves = paneles.map((panel) => panel.dataset.panel ?? '');
  const primera = tomas[0];
  const primerOficio = claves[0];
  if (!primera || !primerOficio || !(cuenta instanceof HTMLElement)) return;

  const quieta = matchMedia('(prefers-reduced-motion: reduce)');
  const ancha = matchMedia(ANCHA);
  const inicio = performance.now();
  let toma = primera;
  let elegido = primerOficio;
  let aMano = false;
  let pesado = false;
  let esperas = false;
  let aLaVista = true;
  let pausada = false;

  /** Las fotos de la espera (el lugar del cliente vacio) se piden una sola vez. */
  function traerEsperas() {
    if (esperas) return;
    esperas = true;
    for (const panel of paneles) ponerEspera(panel);
  }

  /** Los videos solo corren donde se ven: en el oficio a la vista (o en los tres, lado a lado) y con su toma de trabajo. */
  function videos() {
    const oficio = oficioDe(toma, elegido);
    for (const panel of paneles) {
      const video = panel.querySelector('video');
      if (!(video instanceof HTMLVideoElement)) continue;
      const seVe = mundoDe(toma.clave) === 'trabajo' && (ancha.matches || panel.dataset.panel === oficio);
      if (!pesado || quieta.matches || pausada || !aLaVista || !seVe) {
        video.pause();
        continue;
      }
      if (!video.src && video.dataset.src) {
        video.src = video.dataset.src;
        video.addEventListener('playing', () => panel.setAttribute('data-viva', ''), { once: true });
      }
      video.play().catch(() => {});
    }
  }

  function pintar() {
    const oficio = oficioDe(toma, elegido);
    // Si alguien baja muy rapido, la foto de la espera no puede llegar tarde a su toma.
    if (mundoDe(toma.clave) === 'espera') traerEsperas();
    raiz.dataset.toma = toma.clave;
    raiz.dataset.oficio = oficio;
    for (const panel of paneles) panel.toggleAttribute('data-activo', panel.dataset.panel === oficio);
    for (const rotulo of rotulos) rotulo.toggleAttribute('data-activo', rotulo.dataset.rotulo === toma.clave);
    for (const boton of botones) boton.setAttribute('aria-pressed', String(boton.dataset.elegir === oficio));
    contar();
    videos();
  }

  function contar() {
    if (!(cuenta instanceof HTMLElement)) return;
    const van = String(sinContestar(toma.clave, (performance.now() - inicio) / 1000));
    if (cuenta.textContent !== van) cuenta.textContent = van;
  }

  // Cada tramo del recorrido es una toma: manda la que cruza la mitad de la pantalla.
  const vigia = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        const nueva = tomas[pasos.indexOf(/** @type {HTMLElement} */ (entrada.target))];
        if (nueva && nueva !== toma) {
          toma = nueva;
          pintar();
        }
      }
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  for (const paso of pasos) vigia.observe(paso);

  // Lo que se mueve solo corre mientras el comercial esta en pantalla: al pasarlo, el video y los oficios descansan.
  new IntersectionObserver((entradas) => {
    for (const entrada of entradas) aLaVista = entrada.isIntersecting;
    videos();
  }).observe(raiz);

  // La visitante elige su oficio (o llega a los botones con el teclado): desde ahi ya no rotan solos.
  for (const boton of botones) {
    boton.addEventListener('click', () => {
      aMano = true;
      elegido = boton.dataset.elegir ?? elegido;
      pintar();
    });
  }

  // La pausa detiene el video, el cambio de oficio y lo que parpadea; el mismo boton lo reanuda.
  if (pausa instanceof HTMLButtonElement) {
    pausa.addEventListener('click', () => {
      pausada = !pausada;
      raiz.toggleAttribute('data-pausada', pausada);
      pausa.setAttribute('aria-pressed', String(pausada));
      videos();
    });
  }

  // Si el teclado llega a un rotulo que no esta a la vista (el boton del cartel), el recorrido va hasta su toma.
  raiz.addEventListener('focusin', (evento) => {
    if (evento.target instanceof Element && evento.target.closest('[data-elegir]')) aMano = true;
    const rotulo = evento.target instanceof Element ? evento.target.closest('[data-rotulo]') : null;
    if (!(rotulo instanceof HTMLElement) || rotulo.hasAttribute('data-activo')) return;
    const paso = pasos.find((uno) => uno.dataset.paso === rotulo.dataset.rotulo);
    paso?.scrollIntoView({ block: 'center', behavior: quieta.matches ? 'auto' : 'smooth' });
  });

  setInterval(() => {
    if (document.hidden || quieta.matches || pausada || !aLaVista || aMano || ancha.matches || !rota(toma)) return;
    elegido = siguienteOficio(elegido, claves);
    pintar();
  }, CADA_OFICIO);
  setInterval(contar, CADA_CUENTA);

  // Lo pesado (el video, las fotos de la espera) llega despues de lo que se ve. Con ahorro de datos, el video no se pide.
  const traerLoPesado = () => {
    traerEsperas();
    const conexion = /** @type {{ saveData?: boolean } | undefined} */ (Reflect.get(navigator, 'connection'));
    pesado = !conexion?.saveData;
    videos();
  };
  if (document.readyState === 'complete') setTimeout(traerLoPesado, ESPERA_DE_LO_PESADO);
  else window.addEventListener('load', () => setTimeout(traerLoPesado, ESPERA_DE_LO_PESADO), { once: true });
  ancha.addEventListener('change', videos);
  quieta.addEventListener('change', videos);

  pintar();
  raiz.setAttribute('data-viva', '');
}

/**
 * Le pone a un panel la foto de su espera (el lugar del cliente vacio): ligera donde el navegador sabe escoger formato.
 * @param {HTMLElement} panel
 */
function ponerEspera(panel) {
  const espera = panel.querySelector('[data-espera]');
  if (!(espera instanceof HTMLElement)) return;
  const { webp, avif, avifFina } = espera.dataset;
  if (!webp) return;
  espera.style.backgroundImage = `url("${webp}")`;
  if (!avif || !avifFina) return;
  const fina = `image-set(url("${avif}") type("image/avif") 1x, url("${avifFina}") type("image/avif") 2x, url("${webp}") type("image/webp") 1x)`;
  if (CSS.supports('background-image', fina)) espera.style.backgroundImage = fina;
}

/**
 * La barra de arriba va transparente mientras esta encima del comercial y toma su fondo al pasarlo.
 * @param {HTMLElement} barra
 * @param {HTMLElement} pelicula
 */
export function montarBarra(barra, pelicula) {
  const vigia = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) barra.toggleAttribute('data-fondo', !entrada.isIntersecting);
    },
    // La barra toma su fondo justo cuando el comercial se despega del fondo de la pantalla: antes de que su ultimo
    // titulo le pase por debajo y se imprima sobre el logotipo.
    { rootMargin: '-100% 0px 0px 0px' },
  );
  vigia.observe(pelicula);
}
