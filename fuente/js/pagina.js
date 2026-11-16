// @ts-check
// El arranque de la pagina. Cada pieza se monta por separado: si una falla, las demas siguen.
import { montarDemo } from './demo-vista.js';
import { montarBarra, montarPelicula } from './pelicula-vista.js';

const pelicula = document.querySelector('[data-pelicula]');
if (pelicula instanceof HTMLElement) {
  montarPelicula(pelicula);
  const barra = document.querySelector('[data-barra]');
  if (barra instanceof HTMLElement && pelicula.hasAttribute('data-viva')) montarBarra(barra, pelicula);
}

const demo = document.querySelector('[data-demo]');
if (demo instanceof HTMLElement) montarDemo(demo);
