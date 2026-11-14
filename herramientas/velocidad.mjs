// @ts-check
// Mide la pagina armada con Lighthouse, como un celular de gama media con 4G:  node herramientas/velocidad.mjs
// Sale con 1 si no cumple los presupuestos. Mide dist/ (la armada publica), servida como en GitHub Pages.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright-core';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4179;
const PUERTO_DEL_NAVEGADOR = 9339;

/** Lo minimo de cada calificacion (de 0 a 100). */
const CALIFICACIONES = { performance: 95, accessibility: 100, 'best-practices': 100, seo: 100 };
/** Lo maximo de cada medida. */
const MEDIDAS = /** @type {const} */ ({
  'largest-contentful-paint': { tope: 2000, unidad: 'ms', nombre: 'LCP' },
  'cumulative-layout-shift': { tope: 0.1, unidad: '', nombre: 'CLS' },
  'total-blocking-time': { tope: 200, unidad: 'ms', nombre: 'Tiempo bloqueado' },
});
/** Peso maximo de lo que viaja, en KB. */
const PESOS = /** @type {const} */ ({ script: 60, stylesheet: 30, font: 120, total: 300 });

const servidor = spawn(process.execPath, ['herramientas/servir.mjs', '--puerto', String(PUERTO)], {
  cwd: RAIZ,
  stdio: 'ignore',
});
for (let intento = 0; ; intento++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PUERTO}/`)).ok) break;
  } catch {
    // todavia no levanta
  }
  if (intento === 40) {
    servidor.kill();
    throw new Error('El servidor local no levanto: arma primero con node herramientas/armar.mjs');
  }
  await new Promise((listo) => setTimeout(listo, 150));
}
// El mismo navegador de las pruebas, abierto con un puerto para que Lighthouse lo maneje.
const navegador = await chromium.launch({ args: [`--remote-debugging-port=${PUERTO_DEL_NAVEGADOR}`] });

/** @type {string[]} */
const fallas = [];
try {
  const corrida = await lighthouse(`http://127.0.0.1:${PUERTO}/`, {
    port: PUERTO_DEL_NAVEGADOR,
    output: 'html',
    logLevel: 'error',
    onlyCategories: Object.keys(CALIFICACIONES),
  });
  if (!corrida) throw new Error('Lighthouse no devolvio resultado');
  const { lhr, report } = corrida;
  await mkdir(path.join(RAIZ, '.lighthouse'), { recursive: true });
  await writeFile(path.join(RAIZ, '.lighthouse', 'inicio.html'), String(report));

  for (const [categoria, minimo] of Object.entries(CALIFICACIONES)) {
    const nota = Math.round((lhr.categories[categoria]?.score ?? 0) * 100);
    console.log(`${nota >= minimo ? 'ok   ' : 'FALLA'} ${categoria}: ${nota} (minimo ${minimo})`);
    if (nota < minimo) {
      fallas.push(categoria);
      const flojas = (lhr.categories[categoria]?.auditRefs ?? [])
        .map((ref) => lhr.audits[ref.id])
        .filter(
          (auditoria) =>
            auditoria &&
            auditoria.score !== null &&
            auditoria.score < 1 &&
            auditoria.scoreDisplayMode !== 'informative',
        );
      for (const auditoria of flojas)
        console.log(`        ${auditoria?.id}: ${auditoria?.displayValue ?? auditoria?.title}`);
    }
  }
  for (const [id, { tope, unidad, nombre }] of Object.entries(MEDIDAS)) {
    const valor = lhr.audits[id]?.numericValue ?? Number.POSITIVE_INFINITY;
    const bien = valor < tope;
    console.log(
      `${bien ? 'ok   ' : 'FALLA'} ${nombre}: ${unidad ? Math.round(valor) : valor.toFixed(3)} ${unidad} (tope ${tope})`,
    );
    if (!bien) fallas.push(nombre);
  }
  const recursos = /** @type {{ items?: { resourceType: string, transferSize: number }[] } | undefined} */ (
    lhr.audits['resource-summary']?.details
  );
  if (!recursos?.items?.length) {
    console.log('FALLA Lighthouse no entrego el resumen de pesos');
    fallas.push('pesos');
  }
  for (const [tipo, tope] of Object.entries(PESOS)) {
    const kb = (recursos?.items?.find((item) => item.resourceType === tipo)?.transferSize ?? 0) / 1024;
    const bien = kb <= tope;
    console.log(`${bien ? 'ok   ' : 'FALLA'} peso ${tipo}: ${kb.toFixed(1)} KB (tope ${tope})`);
    if (!bien) fallas.push(`peso ${tipo}`);
  }
} finally {
  await navegador.close();
  servidor.kill();
}

if (fallas.length > 0) {
  console.error(`No cumple: ${fallas.join(', ')}. El informe completo esta en .lighthouse/inicio.html`);
  process.exit(1);
}
console.log('La pagina cumple sus presupuestos de velocidad.');
