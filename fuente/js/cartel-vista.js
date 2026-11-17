// @ts-check
// El cartel del inicio en la pagina: mide justo la pantalla. No sabe nada del corto (que solo corre en pantallas
// anchas) ni elige nada: lo que ensena sale de los datos y de la plantilla, y el oficio que se ve en celular lo
// decide arranque.js antes del primer pintado.

/**
 * @param {HTMLElement} raiz  la seccion del inicio
 */
export function montarCartel(raiz) {
  /** Lo que haya encima del inicio (la cinta de la previa) se le descuenta: el cartel mide justo la pantalla. */
  function medir() {
    const arriba = Math.max(0, Math.round(raiz.getBoundingClientRect().top + window.scrollY));
    raiz.style.setProperty('--arriba', `${arriba}px`);
  }

  medir();
  window.addEventListener('resize', medir);
  // La letra que llega despues puede cambiar el alto de lo que hay arriba: se vuelve a medir.
  document.fonts?.ready.then(medir).catch(() => {});
}
