// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correosExpuestos, esCorreoPrivado } from '../../herramientas/correos.mjs';
import { secretosEn } from '../../herramientas/secretos.mjs';

test('solo pasan los correos privados de GitHub', () => {
  assert.equal(esCorreoPrivado('12345+alguien@users.noreply.github.com'), true);
  assert.equal(esCorreoPrivado('noreply@github.com'), true);
  assert.equal(esCorreoPrivado('alguien@gmail.com'), false);
  assert.equal(esCorreoPrivado('alguien@users.noreply.github.com.mx'), false);
});

test('correosExpuestos devuelve cada correo personal una sola vez', () => {
  const correos = ['1+a@users.noreply.github.com', 'persona@correo.com', 'persona@correo.com', ''];
  assert.deepEqual(correosExpuestos(correos), ['persona@correo.com']);
});

// Las muestras se arman por pedazos para que este archivo no traiga nada con forma de llave.
const une = (/** @type {string[]} */ ...pedazos) => pedazos.join('');

test('secretosEn reconoce las formas de llave mas comunes y dice el tipo, nunca la llave', () => {
  const muestras = [
    une('-----BEGIN RSA ', 'PRIVATE KEY-----'),
    une('gh', 'p_', 'a'.repeat(36)),
    une('sk', '_live_', 'b'.repeat(24)),
    une('wh', 'sec_', 'c'.repeat(32)),
    une('AK', 'IA', 'D'.repeat(16)),
  ];
  for (const muestra of muestras) {
    const tipos = secretosEn(`const x = "${muestra}";`);
    assert.equal(tipos.length > 0, true, 'no reconocio una muestra');
    for (const tipo of tipos) assert.equal(tipo.includes(muestra), false);
  }
});

test('secretosEn no se asusta con el contenido normal de la pagina', () => {
  const normal = 'https://alta.prompt-maestro.com/ sha256 a/0123456789/estilos/base.css skeleton task_id price';
  assert.deepEqual(secretosEn(normal), []);
});
