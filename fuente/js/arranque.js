// @ts-check
// Corre antes de pintar. Marca que hay JavaScript para que el corto del inicio, la demostracion y la calculadora se
// vean vivos desde el primer instante. Cuando pagina.js avisa que ya monto lo que pudo, a la pieza que no arranco (su
// archivo no llego, o trono) se le quita su marca y se ensena como sin JavaScript: del inicio queda su cartel, la
// demostracion escrita y la calculadora guardada.
const raiz = document.documentElement;
raiz.classList.add('con-js', 'con-corto', 'con-cuenta');

// El cartel en celular ensena UN oficio, al azar en cada visita (no rota solo con el tiempo). Los oficios que hay
// los dice la propia etiqueta de este archivo, y el elegido queda escrito en <html> desde ahora: antes de que exista
// la primera escena. Cada escena del cartel se guarda o se ensena en cuanto el navegador la lee, asi que nunca se
// pinta una para cambiarla por otra. Sin JavaScript se ve la primera.
const oficios = (document.currentScript?.dataset.oficios ?? '').split(' ').filter(Boolean);
const elegido = oficios[Math.floor(Math.random() * oficios.length)];
if (elegido) {
  raiz.dataset.oficio = elegido;
  const acomodar = () => {
    for (const escena of document.querySelectorAll('[data-duo]')) {
      escena.toggleAttribute('hidden', escena.getAttribute('data-duo') !== elegido);
    }
  };
  const vigia = new MutationObserver(acomodar);
  vigia.observe(raiz, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    vigia.disconnect();
    acomodar();
  });
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
