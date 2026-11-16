// @ts-check
// El arranque de la pagina. Cada pieza se monta por separado: si una falla, las demas siguen.
import { montarCalculadora } from './calculadora-vista.js';
import { montarDemo } from './demo-vista.js';
import { montarBarra, montarPelicula } from './pelicula-vista.js';

/**
 * Monta una pieza sin dejar que su error tumbe a las demas. La pieza que no arranca se queda como sin JavaScript
 * (arranque.js le quita su marca).
 * @param {() => void} pieza
 */
function montar(pieza) {
  try {
    pieza();
  } catch (error) {
    console.error(error);
  }
}

const pelicula = document.querySelector('[data-pelicula]');
montar(() => {
  if (!(pelicula instanceof HTMLElement)) return;
  montarPelicula(pelicula);
  const barra = document.querySelector('[data-barra]');
  if (barra instanceof HTMLElement && pelicula.hasAttribute('data-viva')) montarBarra(barra, pelicula);
});

montar(() => {
  const demo = document.querySelector('[data-demo]');
  if (demo instanceof HTMLElement) montarDemo(demo);
});

montar(() => {
  const calculadora = document.querySelector('[data-calculadora]');
  if (calculadora instanceof HTMLElement) montarCalculadora(calculadora);
});

// En celular, el boton principal queda a la mano en una barra de abajo: aparece al pasar el comercial y se guarda
// donde estorba: sobre la demostracion (ahi lo que se toca es la conversacion) y en el cierre, que ya trae su boton.
// Mientras esta a la vista, la pagina lo dice en <html> para que la barra de arriba guarde su boton: uno solo a la vez.
montar(() => {
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
    document.documentElement.toggleAttribute('data-barra-abajo', visible);
  });
  for (const zona of zonas) vigia.observe(zona);
});
