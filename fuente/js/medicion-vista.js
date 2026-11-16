// @ts-check
// La medicion en la pagina: escucha lo que pasa (los clics, las preguntas que se abren, la calculadora, los avisos
// de la demostracion y los errores) y se lo pasa a Umami, si esta. Que se manda y con que datos lo decide medicion.js;
// aqui solo se leen de la pagina los datos sueltos que esa decision necesita.
import {
  calculadoraUso,
  clicEnEnlace,
  conTope,
  demoFin,
  demoInicio,
  demoPaso,
  ejemploCambio,
  errorJs,
  mandar,
  preguntaAbre,
} from './medicion.js';

/** @typedef {import('./medicion.js').Medida} Medida */

/** Cuantos errores distintos se avisan, a lo mas, en una visita. */
const TOPE_DE_ERRORES = 5;

/** Los avisos de la demostracion (los despacha demo-vista.js desde [data-demo]) y el evento que sale de cada uno. */
const AVISOS_DE_LA_DEMO = {
  'demo:inicio': demoInicio,
  'demo:paso': demoPaso,
  'demo:fin': demoFin,
  'demo:ejemplo': ejemploCambio,
};

/**
 * Manda un evento ya armado. A Umami se le busca cada vez: su script puede llegar despues que la pagina, o no llegar.
 * @param {Medida | null} medida
 */
function medir(medida) {
  mandar(/** @type {{ umami?: unknown }} */ (/** @type {unknown} */ (window)).umami, medida);
}

/**
 * Pone los escuchas de la medicion. No cambia nada de la pagina y no depende de que las demas piezas hayan arrancado.
 */
export function montarMedicion() {
  // Los errores de codigo. El mismo error (archivo y linea) cuenta una vez, y hay un tope por visita.
  const pasa = conTope(TOPE_DE_ERRORES);
  window.addEventListener('error', (evento) => {
    const medida = errorJs({ archivo: evento.filename, linea: evento.lineno });
    if (medida && pasa(JSON.stringify(medida.propiedades))) medir(medida);
  });

  // Los enlaces: el del alta y el de correo, esten donde esten (tambien los que la demostracion pinta despues).
  document.addEventListener('click', (evento) => {
    const enlace = evento.target instanceof Element ? evento.target.closest('a[href]') : null;
    if (!(enlace instanceof HTMLAnchorElement)) return;
    const tarjeta = enlace.closest('[data-plan]');
    medir(
      clicEnEnlace({
        href: enlace.href,
        lugar: enlace.dataset.lugar,
        plan: tarjeta instanceof HTMLElement ? tarjeta.dataset.plan : undefined,
      }),
    );
  });

  // Las preguntas. "toggle" no sube por el documento: se escucha en captura. Cuenta al abrir, no al cerrar.
  document.addEventListener(
    'toggle',
    (evento) => {
      const pregunta = evento.target;
      if (!(pregunta instanceof HTMLDetailsElement) || !pregunta.open || !pregunta.matches('.pregunta')) return;
      medir(preguntaAbre({ id: [...document.querySelectorAll('details.pregunta')].indexOf(pregunta) + 1 }));
    },
    true,
  );

  // La calculadora: solo la primera vez que escribe en una casilla. Lo que escribe no se lee aqui.
  document
    .querySelector('[data-calculadora]')
    ?.addEventListener('input', () => medir(calculadoraUso()), { once: true });

  // La demostracion avisa lo que pasa en su historia; de la medicion no sabe nada.
  for (const [aviso, armar] of Object.entries(AVISOS_DE_LA_DEMO)) {
    document.addEventListener(aviso, (evento) => medir(armar(evento instanceof CustomEvent ? evento.detail : null)));
  }
}
