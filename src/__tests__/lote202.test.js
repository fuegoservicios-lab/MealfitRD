// [P1-PLAN-LOTE-202 · 2026-09-24] El delta de la lista de compras no da por caducados los secos de la Nevera.
//
// `buildDeltaShoppingList` (Dashboard) resta la Nevera a la lista del PDF y de «Ya compré», pero antes descarta lo que
// cree caducado: `master_ingredients.shelf_life_days` − días desde que se registró la fila. Ese campo vale 14 en 333 de
// 349 filas del catálogo (relleno; `pantry_durability.py` lo dice), así que a los 14 días la pasta, la avena, las
// habichuelas secas y las especias «caducaban» y la lista volvía a pedirlas. La inferencia por nombre de este mismo
// fichero ya sabía que un seco dura 180 días: ahora manda el MAYOR de los dos (nunca acorta lo perecedero).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '..', '..');
const dash = fs.readFileSync(path.resolve(raiz, 'src/pages/Dashboard.jsx'), 'utf-8');

describe('[P1-PLAN-LOTE-202] caducidad del delta de compras', () => {
    it('el plazo es el mayor entre el catálogo y la inferencia por nombre', () => {
        expect(dash).toMatch(/const shelfLife = Math\.max\(Number\(item\.master_ingredients\?\.shelf_life_days\) \|\| 0, inferShelfLifeDays\(name, category\)\);/);
    });
    it('el catálogo ya no gana solo', () => {
        expect(dash).not.toMatch(/item\.master_ingredients\?\.shelf_life_days \|\| inferShelfLifeDays\(name, category\)/);
    });
    it('la inferencia sigue sabiendo que los secos duran 180 días', () => {
        expect(dash).toMatch(/if \(DRY_GOODS\.some\(k => n\.includes\(k\)\)\) return 180;/);
    });
});
