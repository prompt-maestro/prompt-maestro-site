// @ts-check
// El arranque de la pagina. Cada pieza se trae y se monta por separado: si el archivo de una no llega (un tropiezo de
// la red) o truena al montarse, las demas siguen. La pieza que no arranca se queda como sin JavaScript: arranque.js le
// quita su marca cuando este archivo avisa que ya termino.

/** Lo mas que se espera a las piezas antes de avisar que el arranque termino (una que no llega no detiene el aviso). */
const ESPERA_MAXIMA = 8000;

const raiz = document.documentElement;
// Le dice a arranque.js que este archivo si llego y que el aviso de "ya monte" viene en camino.
raiz.setAttribute('data-arrancando', '');

/**
 * El error se reporta como cualquier otro de la pagina: asi la medicion se entera de que una pieza no arranco (en que
 * archivo y en que linea, nunca el mensaje).
 * @param {unknown} error
 */
function reportar(error) {
  if (typeof reportError === 'function') reportError(error);
  else console.error(error);
}

/**
 * Trae el archivo de una pieza y la monta, sin dejar que su falla tumbe a las demas.
 * @template M
 * @param {() => Promise<M>} traer
 * @param {(modulo: M) => void} montar
 */
async function pieza(traer, montar) {
  try {
    montar(await traer());
  } catch (error) {
    reportar(error);
  }
}

async function arrancar() {
  // La medicion va primero: asi oye un error de las piezas que siguen y el primer aviso de la demostracion.
  await pieza(
    () => import('./medicion-vista.js'),
    ({ montarMedicion }) => montarMedicion(),
  );

  await Promise.all([
    pieza(
      () => import('./pelicula-vista.js'),
      ({ montarBarra, montarPelicula }) => {
        const pelicula = document.querySelector('[data-pelicula]');
        if (!(pelicula instanceof HTMLElement)) return;
        montarPelicula(pelicula);
        const barra = document.querySelector('[data-barra]');
        if (barra instanceof HTMLElement && pelicula.hasAttribute('data-viva')) montarBarra(barra, pelicula);
      },
    ),
    pieza(
      () => import('./demo-vista.js'),
      ({ montarDemo }) => {
        const demo = document.querySelector('[data-demo]');
        if (demo instanceof HTMLElement) montarDemo(demo);
      },
    ),
    pieza(
      () => import('./calculadora-vista.js'),
      ({ montarCalculadora }) => {
        const calculadora = document.querySelector('[data-calculadora]');
        if (calculadora instanceof HTMLElement) montarCalculadora(calculadora);
      },
    ),
  ]);
}

/**
 * En celular, el boton principal queda a la mano en una barra de abajo: aparece al pasar el comercial y se guarda
 * donde estorba: sobre la demostracion (ahi lo que se toca es la conversacion) y en el cierre, que ya trae su boton.
 * Mientras esta a la vista, la pagina lo dice en <html> para que la barra de arriba guarde su boton: uno solo a la vez.
 */
function montarBarraDeAbajo() {
  const barraMovil = document.querySelector('[data-barra-movil]');
  const zonas = document.querySelectorAll('[data-pelicula], #citas, #empieza, .pie');
  if (!(barraMovil instanceof HTMLElement) || zonas.length === 0) return;
  const aLaVista = new Set();
  const vigia = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (entrada.isIntersecting) aLaVista.add(entrada.target);
      else aLaVista.delete(entrada.target);
    }
    const visible = aLaVista.size === 0;
    barraMovil.toggleAttribute('data-visible', visible);
    raiz.toggleAttribute('data-barra-abajo', visible);
  });
  for (const zona of zonas) vigia.observe(zona);
}

try {
  montarBarraDeAbajo();
} catch (error) {
  reportar(error);
}

Promise.race([arrancar(), new Promise((listo) => setTimeout(listo, ESPERA_MAXIMA))]).finally(() => {
  document.dispatchEvent(new Event('pagina:montada'));
});
