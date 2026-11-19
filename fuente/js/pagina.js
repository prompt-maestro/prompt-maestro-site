// @ts-check
// El arranque de la pagina. Cada pieza se trae y se monta por separado: si el archivo de una no llega (un tropiezo de
// la red) o truena al montarse, las demas siguen. La pieza que no arranca se queda como sin JavaScript: arranque.js le
// quita su marca cuando este archivo avisa que ya termino.

/** Lo mas que se espera a las piezas antes de avisar que el arranque termino (una que no llega no detiene el aviso). */
const ESPERA_MAXIMA = 8000;
/** Lo mas que se espera a que el cartel este pintado antes de traer las piezas. */
const ESPERA_DEL_PINTADO = 3000;
/** Donde corre el corto. La misma pregunta que hacen los estilos, corto-vista.js y los modulepreload de la pagina. */
const ANCHA = '(min-width: 900px) and (min-aspect-ratio: 1/1)';

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
 * Cede el turno: lo que sigue corre en otra tarea del navegador, que entre una y otra puede pintar o atender un toque.
 * @returns {Promise<void>}
 */
function otraTarea() {
  return new Promise((listo) => {
    const canal = new MessageChannel();
    canal.port1.onmessage = () => {
      canal.port1.close();
      listo();
    };
    canal.port2.postMessage(null);
  });
}

/**
 * Trae el archivo de una pieza y la monta, sin dejar que su falla tumbe a las demas. Cada pieza se monta en su propia
 * tarea: asi montar varias que llegaron juntas no deja al telefono sin responder de un tiron.
 * @template M
 * @param {() => Promise<M>} traer
 * @param {(modulo: M) => void} montar
 */
async function pieza(traer, montar) {
  try {
    const modulo = await traer();
    await otraTarea();
    montar(modulo);
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
      () => import('./cartel-vista.js'),
      ({ montarCartel }) => {
        const inicio = document.querySelector('[data-corto]');
        if (inicio instanceof HTMLElement) montarCartel(inicio);
      },
    ),
    pieza(
      () => import('./corto-vista.js'),
      ({ montarBarra, montarCorto }) => {
        const corto = document.querySelector('[data-corto]');
        if (!(corto instanceof HTMLElement)) return;
        montarCorto(corto);
        const barra = document.querySelector('[data-barra]');
        if (barra instanceof HTMLElement && corto.hasAttribute('data-viva')) montarBarra(barra, corto);
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
    pieza(
      () => import('./encendido.js'),
      ({ montarEncendido }) => montarEncendido(),
    ),
    pieza(
      () => import('./agente-vista.js'),
      ({ montarAgentes }) => {
        const agentes = document.querySelector('[data-agentes]');
        if (agentes instanceof HTMLElement) montarAgentes(agentes);
      },
    ),
  ]);
}

/**
 * En celular, el boton principal queda a la mano en una barra de abajo: aparece al pasar el inicio y se guarda
 * donde estorba: sobre la demostracion (ahi lo que se toca es la conversacion) y en el cierre, que ya trae su boton.
 * Mientras esta a la vista, la pagina lo dice en <html> para que la barra de arriba guarde su boton: uno solo a la vez.
 */
function montarBarraDeAbajo() {
  const barraMovil = document.querySelector('[data-barra-movil]');
  const zonas = document.querySelectorAll('[data-corto], #citas, #empieza, .pie');
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

/**
 * Cuando ya se pueden traer las piezas. En celular y en tableta de pie el inicio es un cartel quieto que no necesita
 * ninguna: lo primero es que se vea completo, asi que las piezas se traen cuando el navegador ya lo pinto, con todo y
 * su retrato, y su descarga no compite con la del cartel. En pantallas anchas no se espera: ahi el inicio es el
 * corto, y lo mueve una pieza (por eso solo ahi se adelantan sus archivos, con los modulepreload de la pagina).
 * @returns {Promise<void>}
 */
function trasElCartel() {
  if (matchMedia(ANCHA).matches) return Promise.resolve();
  return new Promise((listo) => {
    const avisos = typeof PerformanceObserver === 'function' ? (PerformanceObserver.supportedEntryTypes ?? []) : [];
    /**
     * Espera un aviso del navegador: que ya pinto algo.
     * @param {string} tipo
     * @param {(aviso: PerformanceEntry) => boolean} esElQueSeEspera
     */
    const esperar = (tipo, esElQueSeEspera) => {
      new PerformanceObserver((lista, vigia) => {
        if (!lista.getEntries().some(esElQueSeEspera)) return;
        vigia.disconnect();
        listo();
      }).observe({ type: tipo, buffered: true });
    };
    // El retrato del cartel, el de la escena que quedo a la vista: lleva la marca para que el navegador avise.
    const retrato = avisos.includes('element')
      ? document.querySelector('[data-duo]:not([hidden]) [elementtiming]')
      : null;
    if (retrato) {
      esperar('element', () => true);
      // Si el retrato no esta en la pantalla (quien llega por un ancla, o una ventana tan bajita que el cartel va sin
      // imagen) nadie lo va a pintar: no hay nada que esperar.
      new IntersectionObserver((entradas, vigia) => {
        vigia.disconnect();
        if (!entradas.some((entrada) => entrada.isIntersecting)) listo();
      }).observe(retrato);
    } else if (avisos.includes('paint')) {
      // Un navegador que no avisa del retrato: se espera a su primer pintado.
      esperar('paint', (aviso) => aviso.name === 'first-contentful-paint');
    } else {
      // Y uno que no avisa de nada: se le dan dos cuadros.
      requestAnimationFrame(() => requestAnimationFrame(() => listo()));
    }
    // Una pestana que se abrio escondida no pinta, y una foto puede no llegar: las piezas no esperan para siempre.
    setTimeout(listo, ESPERA_DEL_PINTADO);
  });
}

try {
  montarBarraDeAbajo();
} catch (error) {
  reportar(error);
}

trasElCartel()
  .then(() => Promise.race([arrancar(), new Promise((listo) => setTimeout(listo, ESPERA_MAXIMA))]))
  .finally(() => {
    // "Tu agente" llega con su aspecto de menu. Si su pieza no arranco completa (un menu o el selector de capitulos),
    // toda la seccion se queda escrita como lista: los dos capitulos, cada renglon con su oracion.
    if (document.querySelector(':is([data-agente], [data-capitulos]):not([data-viva])')) {
      for (const parte of document.querySelectorAll('[data-agente], [data-capitulos]'))
        parte.setAttribute('data-lista', '');
    }
    document.dispatchEvent(new Event('pagina:montada'));
  });
