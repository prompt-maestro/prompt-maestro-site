// @ts-check
// Corre antes de pintar. Marca que hay JavaScript para que el corto del inicio, la demostracion y la calculadora se
// vean vivos desde el primer instante. Cuando pagina.js avisa que ya monto lo que pudo, a la pieza que no arranco (su
// archivo no llego, o trono) se le quita su marca y se ensena como sin JavaScript: del inicio queda su cartel, la
// demostracion escrita y la calculadora guardada.
const raiz = document.documentElement;
raiz.classList.add('con-js', 'con-corto', 'con-cuenta');

// Con ahorro de datos, o con una conexion lenta, el corto no corre solo ni se pide nada suyo: queda el cartel, con su
// boton para verlo. Se anota en <html> desde ahora: lo leen los estilos y corto-vista.js.
const conexion = /** @type {{ saveData?: boolean, effectiveType?: string } | undefined} */ (
  Reflect.get(navigator, 'connection')
);
const ahorro = Boolean(conexion?.saveData) || /^(slow-2g|2g|3g)$/.test(conexion?.effectiveType ?? '');
if (ahorro) raiz.setAttribute('data-ahorro', '');

// El inicio ensena UN oficio, al azar en cada visita (no rota solo con el tiempo): el cartel en celular y el corto en
// pantallas anchas. Los oficios que hay los dice la propia etiqueta de este archivo, y el elegido queda escrito en
// <html> desde ahora: antes de que exista la primera escena. Cada escena (la del cartel y las del corto) se guarda o
// se ensena en cuanto el navegador la lee, asi que nunca se pinta una para cambiarla por otra. Sin JavaScript se ve
// la primera.
const etiqueta = document.currentScript;
const oficios = (etiqueta?.dataset.oficios ?? '').split(' ').filter(Boolean);
const elegido = oficios[Math.floor(Math.random() * oficios.length)];
if (elegido) {
  raiz.dataset.oficio = elegido;
  const acomodar = () => {
    // La etiqueta de este archivo tambien dice "data-escena" (las fotos que se adelantan): esa no es una escena.
    for (const escena of document.querySelectorAll('[data-duo], [data-escena]:not(script)')) {
      const suyo = escena.getAttribute('data-duo') ?? escena.getAttribute('data-escena');
      escena.toggleAttribute('hidden', suyo !== elegido);
    }
  };
  const vigia = new MutationObserver(acomodar);
  vigia.observe(raiz, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    vigia.disconnect();
    acomodar();
  });

  // Donde el corto va a correr solo (la misma pregunta que hacen los estilos y corto-vista.js: pantalla ancha, no muy
  // bajita, con movimiento y sin ahorro de datos) su foto es lo mas grande de la pantalla: se pide desde ahora, y solo
  // la del oficio elegido. Que archivos son (con un asterisco en el lugar del oficio) y cuanto mide la foto en la
  // pantalla lo dice la etiqueta: lo mismo que dice la foto de cada escena.
  const CORRE_SOLO =
    '(min-width: 900px) and (min-aspect-ratio: 1/1) and (min-height: 480px) and (prefers-reduced-motion: no-preference)';
  const fotos = etiqueta?.dataset.escena ?? '';
  if (fotos && !ahorro && matchMedia(CORRE_SOLO).matches) {
    const adelanto = document.createElement('link');
    adelanto.setAttribute('rel', 'preload');
    adelanto.setAttribute('as', 'image');
    adelanto.setAttribute('type', 'image/avif');
    adelanto.setAttribute('imagesrcset', fotos.replaceAll('*', elegido));
    adelanto.setAttribute('imagesizes', etiqueta?.dataset.escenaMide ?? '100vw');
    adelanto.setAttribute('fetchpriority', 'high');
    document.head.append(adelanto);
  }
}

let revisado = false;
function revisar() {
  if (revisado) return;
  revisado = true;
  if (!document.querySelector('[data-demo][data-viva]')) raiz.classList.remove('con-js');
  if (!document.querySelector('[data-corto][data-viva]')) raiz.classList.remove('con-corto');
  if (!document.querySelector('[data-calculadora][data-viva]')) raiz.classList.remove('con-cuenta');
}

document.addEventListener('pagina:montada', revisar);
// Si pagina.js no llego (o no pudo ni empezar) el aviso nunca vendra: entonces se revisa al terminar de cargar.
window.addEventListener('load', () => {
  if (!raiz.hasAttribute('data-arrancando')) revisar();
});
