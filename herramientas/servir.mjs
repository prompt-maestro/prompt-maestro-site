// @ts-check
// Servidor local de lo armado, para construir y para las pruebas:  node herramientas/servir.mjs [--previa] [--puerto 4173]
// Se porta como GitHub Pages: /terminos sirve terminos.html, una carpeta sirve su index.html y lo que no existe
// contesta 404 con 404.html. Con --previa sirve dist-previa/ dentro de /pagina-previa/, igual que en github.io.
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESTINOS } from './armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argumentos = process.argv.slice(2);
const destino = argumentos.includes('--previa') ? 'previa' : 'publica';
const puerto = Number(argumentos[argumentos.indexOf('--puerto') + 1]) || (destino === 'previa' ? 4174 : 4173);
const { base, carpeta } = DESTINOS[destino];
const raizSitio = path.join(RAIZ, carpeta);

/** @type {Record<string, string>} */
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json',
};

/**
 * @param {string} archivo
 * @returns {Promise<boolean>}
 */
async function esArchivo(archivo) {
  try {
    return (await stat(archivo)).isFile();
  } catch {
    return false;
  }
}

/**
 * El archivo que contesta una direccion, o null si no hay.
 * @param {string} ruta  ya sin la base y sin la diagonal inicial
 * @returns {Promise<string | null>}
 */
async function resolver(ruta) {
  const limpia = path.normalize(ruta).replace(/^([/\\]|\.\.[/\\]?)+/, '');
  const completa = path.join(raizSitio, limpia);
  if (!completa.startsWith(raizSitio)) return null;
  for (const candidata of [completa, `${completa}.html`, path.join(completa, 'index.html')]) {
    if (await esArchivo(candidata)) return candidata;
  }
  return null;
}

const servidor = createServer(async (peticion, respuesta) => {
  const ruta = decodeURIComponent(new URL(peticion.url ?? '/', 'http://local').pathname);
  const archivo = ruta.startsWith(base) ? await resolver(ruta.slice(base.length)) : null;
  const final = archivo ?? path.join(raizSitio, '404.html');
  try {
    const contenido = await readFile(final);
    respuesta.writeHead(archivo ? 200 : 404, {
      'content-type': TIPOS[path.extname(final)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    respuesta.end(
      `No existe ${carpeta}/. Arma primero: node herramientas/armar.mjs${destino === 'previa' ? ' --previa' : ''}`,
    );
  }
});

servidor.listen(puerto, '127.0.0.1', () => {
  console.log(`Sirviendo ${carpeta}/ en http://127.0.0.1:${puerto}${base}`);
});
