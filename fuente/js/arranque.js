// @ts-check
// Corre antes de pintar. Marca que hay JavaScript para que el comercial, la demostracion y la calculadora se vean
// vivos desde el primer instante. Cuando pagina.js avisa que ya monto lo que pudo, a la pieza que no arranco (su archivo
// no llego, o trono) se le quita su marca y se ensena como sin JavaScript: el comercial como texto corrido, la
// demostracion escrita y la calculadora guardada.
const raiz = document.documentElement;
raiz.classList.add('con-js', 'con-pelicula', 'con-cuenta');

let revisado = false;
function revisar() {
  if (revisado) return;
  revisado = true;
  if (!document.querySelector('[data-demo][data-viva]')) raiz.classList.remove('con-js');
  if (!document.querySelector('[data-pelicula][data-viva]')) raiz.classList.remove('con-pelicula');
  if (!document.querySelector('[data-calculadora][data-viva]')) raiz.classList.remove('con-cuenta');
}

document.addEventListener('pagina:montada', revisar);
// Si pagina.js no llego (o no pudo ni empezar) el aviso nunca vendra: entonces se revisa al terminar de cargar.
window.addEventListener('load', () => {
  if (!raiz.hasAttribute('data-arrancando')) revisar();
});
