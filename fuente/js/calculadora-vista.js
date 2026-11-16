// @ts-check
// La calculadora en la pagina: lee las dos casillas, hace la cuenta y la escribe. La cuenta vive en calculadora.js.
import { hacerLaCuenta, leerDinero, leerEntero, planMasBarato } from './calculadora.js';
import { pesos, rellenar } from './redaccion.js';

/**
 * @param {HTMLElement} raiz  el elemento [data-calculadora]
 */
export function montarCalculadora(raiz) {
  const citas = raiz.querySelector('[data-calculadora-citas]');
  const precio = raiz.querySelector('[data-calculadora-precio]');
  const salida = raiz.querySelector('[data-calculadora-salida]');
  if (!(citas instanceof HTMLInputElement) || !(precio instanceof HTMLInputElement) || !(salida instanceof HTMLElement))
    return;

  // Los planes ya estan escritos en la pagina: de ahi sale contra cual se compara.
  const planes = [...document.querySelectorAll('[data-plan]')].flatMap((tarjeta) => {
    if (!(tarjeta instanceof HTMLElement)) return [];
    const mensual = Number(tarjeta.dataset.mensual);
    return tarjeta.dataset.plan && Number.isFinite(mensual) && mensual > 0
      ? [{ nombre: tarjeta.dataset.plan, mensual }]
      : [];
  });
  const plan = planMasBarato(planes);
  if (!plan) return;
  const textos = raiz.dataset;
  // El ejemplo va de sugerencia en las casillas (placeholder), nunca como si ella lo hubiera escrito.
  const ejemplo = { citas: leerEntero(citas.placeholder), precio: leerDinero(precio.placeholder) };

  /**
   * @param {[string, string | undefined, Record<string, string>][]} renglones  clase, texto con huecos y sus datos
   */
  const escribir = (renglones) => {
    salida.replaceChildren();
    for (const [clase, plantilla, datos] of renglones) {
      const renglon = document.createElement('span');
      renglon.className = clase;
      renglon.textContent = rellenar(plantilla ?? '', datos);
      salida.append(renglon);
    }
  };

  // Como funcion flecha: asi conserva lo que ya se comprobo arriba (que las casillas y el plan existen).
  const pintar = () => {
    const escrito = { citas: leerEntero(citas.value), precio: leerDinero(precio.value) };
    // Con las dos casillas vacias se ensena la cuenta del ejemplo, dicho que es un ejemplo.
    const deEjemplo = escrito.citas === null && escrito.precio === null;
    const numeros = deEjemplo ? ejemplo : escrito;
    const cuenta = hacerLaCuenta({ ...numeros, mensualidad: plan.mensual });
    citas.removeAttribute('aria-invalid');
    precio.removeAttribute('aria-invalid');
    raiz.dataset.estado = deEjemplo && cuenta.estado === 'lista' ? 'ejemplo' : cuenta.estado;
    if (cuenta.estado === 'vacia') {
      salida.textContent = textos.vacia ?? '';
      return;
    }
    if (cuenta.estado === 'fuera') {
      (cuenta.casilla === 'citas' ? citas : precio).setAttribute('aria-invalid', 'true');
      salida.textContent = (cuenta.casilla === 'citas' ? textos.fueraCitas : textos.fueraPrecio) ?? '';
      return;
    }
    const datos = {
      plantones: String(numeros.citas),
      precio: pesos(numeros.precio ?? 0),
      perdido: pesos(cuenta.perdido),
      plan: plan.nombre,
      mensualidad: pesos(plan.mensual),
      citas: String(cuenta.citasParaPagar),
    };
    // Si con lo que hoy le plantan no alcanza para pagar el plan, no se le dice que "ya se pago": solo lo que cuesta.
    const pago = !cuenta.sePaga ? textos.soloCosto : cuenta.citasParaPagar === 1 ? textos.unaCita : textos.variasCitas;
    escribir([
      ...(deEjemplo
        ? /** @type {[string, string | undefined, Record<string, string>][]} */ ([
            ['calculadora__ejemplo', textos.ejemplo, datos],
          ])
        : []),
      ['calculadora__perdido', textos.perdido, datos],
      ['calculadora__pago', pago, datos],
    ]);
  };

  citas.addEventListener('input', pintar);
  precio.addEventListener('input', pintar);
  pintar();
  // La salida se anuncia a quien no la ve, pero solo lo que cambie de aqui en adelante: no la primera pintada.
  salida.setAttribute('role', 'status');
  raiz.dataset.viva = '';
}
