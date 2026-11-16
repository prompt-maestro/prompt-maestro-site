// @ts-check
// Corre antes de pintar. Marca que hay JavaScript para que el comercial, la demostracion y la calculadora se vean
// vivos desde el primer instante. Si al terminar de cargar la pagina alguno no arranco (un archivo que no llego, un
// error), le quita su marca y esa pieza se ensena como sin JavaScript: el comercial como texto corrido, la
// demostracion escrita y la calculadora guardada.
const raiz = document.documentElement;
raiz.classList.add('con-js', 'con-pelicula', 'con-cuenta');
document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-demo][data-viva]')) raiz.classList.remove('con-js');
  if (!document.querySelector('[data-pelicula][data-viva]')) raiz.classList.remove('con-pelicula');
  if (!document.querySelector('[data-calculadora][data-viva]')) raiz.classList.remove('con-cuenta');
});
