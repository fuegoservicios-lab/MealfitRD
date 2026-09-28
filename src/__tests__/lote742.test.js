// [P1-PLAN-LOTE-742 · 2026-09-28] El borrado de la Nevera al cambiar de usuario, sin arrastrar pantryCache al arranque.
//
// Medido por mealfitrd-ia-9b tras 629/681/702: arranque 148,5 kB gz sobre un techo de 148. `pantryCache.js` (3,8 KB
// minificados) entraba sólo porque AssessmentContext llama a `borrarCacheDeInventario` al cambiar de usuario, y ese
// borrado tiene que ser SÍNCRONO (P1-XTAB-CACHE-LEAK: una copia del usuario anterior no puede sobrevivir un tick). El
// estado del inventario vive ahora en `inventarioEnMemoria.js`, que comparten los dos: el borrado sigue siendo síncrono y
// el resto de pantryCache se carga con las páginas.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { borrarCacheDeInventario } from '../utils/inventarioEnMemoria';
import { getCachedInventory, setCachedInventory, _resetPantryCacheForTests } from '../utils/pantryCache';

const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

beforeEach(() => { localStorage.clear(); _resetPantryCacheForTests(); });

describe('lote 742 — el estado del inventario en su módulo mínimo', () => {
    it('borrar desde el módulo mínimo vacía lo que ve pantryCache, en el acto', () => {
        setCachedInventory([{ name: 'Huevo' }]);
        expect(getCachedInventory()).toEqual([{ name: 'Huevo' }]);
        borrarCacheDeInventario();
        expect(getCachedInventory()).toBeUndefined();
        expect(localStorage.getItem('mealfit_pantry_inventory_cache_v1')).toBeNull();
    });

    it('el contexto de arranque importa el módulo mínimo, no pantryCache', () => {
        const ctx = leer('context/AssessmentContext.jsx');
        expect(ctx).toMatch(/import \{ borrarCacheDeInventario \} from '\.\.\/utils\/inventarioEnMemoria';/);
        expect(ctx).not.toMatch(/from '\.\.\/utils\/pantryCache'/);
        const minimo = leer('utils/inventarioEnMemoria.js');
        const imports = minimo.match(/^import .* from '([^']+)';$/gm) || [];
        expect(imports.every((l) => l.includes("'./safeLocalStorage'"))).toBe(true);
    });
});
