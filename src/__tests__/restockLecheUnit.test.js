// [P3-RESTOCK-LECHE-UNIT · 2026-06-23] Regresión: la leche descremada se re-agregaba
// a la Nevera en CADA cambio de duración (7/15/30) porque el delta del frontend no
// reconciliaba su unidad. La lista la emite como 'cartón' pero el restock la persiste
// como 'paquete' (backend CANONICAL_UNIT_MAP mapea cartón→paquete). El helper
// `toBaseUnit` (Dashboard.jsx, buildDeltaShoppingList) ponía 'paquete' en el tipo 'pkg'
// pero 'cartón' caía al fallback genérico → tipos distintos → nunca restaba → leche
// quedaba "faltante" y se re-agregaba al hacer restock. El fix mete 'cartón'/'carton'/
// 'cartones' en el mismo bucket 'pkg', alineando el frontend con el backend.
//
// Test PARSER-BASED sobre el source de prod (no importable: toBaseUnit es un closure
// dentro del componente). El tooltip-anchor en el source hace que un renombre/borrado
// del alias falle ESTE test antes de re-introducir el bug en producción.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = resolve(__dirname, '../pages/Dashboard.jsx');

describe('P3-RESTOCK-LECHE-UNIT — cartón se trata como paquete en el delta', () => {
  const src = readFileSync(DASHBOARD, 'utf8');

  it('el tooltip-anchor existe en el source', () => {
    expect(src).toContain('P3-RESTOCK-LECHE-UNIT');
  });

  it('el bucket de paquete en toBaseUnit incluye cartón/carton/cartones', () => {
    // Localiza el array de unidades que retorna type:'pkg'.
    const m = src.match(/if \(\[([^\]]*)\]\.includes\(u\)\)\s*\{\s*return \{ value: qty, type: 'pkg'/);
    expect(m, "no se encontró el bucket 'pkg' de toBaseUnit").toBeTruthy();
    const bucket = m[1];
    for (const alias of ['paquete', 'cartón', 'carton', 'cartones']) {
      expect(bucket, `el bucket 'pkg' debe incluir '${alias}'`).toContain(`'${alias}'`);
    }
  });

  it("la receta del bug (cartón=1 vs paquete=2) reconcilia: mismo tipo 'pkg' => excluida", () => {
    // Réplica mínima de toBaseUnit SOLO para la rama de paquete (el contrato que el fix garantiza).
    const PKG = ['pq', 'paq', 'paquete', 'paquetes', 'funda', 'fundita', 'fundas', 'sobre', 'sobres', 'cartón', 'carton', 'cartones'];
    const baseType = (unit) => (PKG.includes(unit.toLowerCase().trim()) ? 'pkg' : unit.toLowerCase().trim());
    expect(baseType('cartón')).toBe('pkg');
    expect(baseType('paquete')).toBe('pkg');
    // mismo tipo => el delta resta: need 1 - have 2 = -1 <= 0 => excluida (no se re-agrega)
    expect(baseType('cartón')).toBe(baseType('paquete'));
  });
});
