// @ts-check
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { CARPETA_FUENTES, CARPETA_PAQUETES, FUENTES } from '../../herramientas/fuentes.mjs';

test('las tipografias del repo son identicas a las del paquete con version exacta', async () => {
  for (const { destino, origen } of FUENTES) {
    const enRepo = await readFile(path.join(CARPETA_FUENTES, destino));
    const enPaquete = await readFile(path.join(CARPETA_PAQUETES, origen));
    assert.ok(enRepo.equals(enPaquete), `${destino} no coincide con ${origen}`);
  }
});

test('las tipografias caben en su presupuesto: 120 KB entre todas', async () => {
  let total = 0;
  for (const { destino } of FUENTES) {
    if (destino.endsWith('.woff2')) total += (await stat(path.join(CARPETA_FUENTES, destino))).size;
  }
  assert.ok(total <= 120 * 1024, `las tipografias pesan ${Math.round(total / 1024)} KB`);
});
