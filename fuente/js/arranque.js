// @ts-check
// Corre antes de pintar. Marca que hay JavaScript para que la demostracion se vea viva desde el primer instante. Si
// al terminar de cargar la pagina la demostracion no arranco (un archivo que no llego, un error), quita la marca y
// la pagina ensena la conversacion escrita, igual que sin JavaScript.
document.documentElement.classList.add('con-js');
document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-demo][data-viva]')) document.documentElement.classList.remove('con-js');
});
