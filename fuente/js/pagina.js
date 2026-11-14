// @ts-check
// El arranque de la pagina. Cada pieza se monta por separado: si una falla, las demas siguen.
import { montarDemo } from './demo-vista.js';

const demo = document.querySelector('[data-demo]');
if (demo instanceof HTMLElement) montarDemo(demo);
