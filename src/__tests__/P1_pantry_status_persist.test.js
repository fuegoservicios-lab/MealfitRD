/* [P1-PANTRY-STATUS-PERSIST · 2026-08-14] El banner ámbar «Tu nevera está
 * baja» deja de parpadear al refrescar.
 *
 * Tercer parpadeo de la misma familia en dos días (aviso rojo del plato,
 * chips de marca, y ahora este) y el mecanismo aquí es el más explícito de
 * los tres: el fetch de /pantry-status se DIFIERE 700 ms a propósito para no
 * competir con el primer paint, así que `is_below` no existe durante ~1 s en
 * cada refresh y el banner aparece tarde. La ironía: el comentario de aquel
 * defer afirmaba que los banners «no parpadean como CTA» — el CTA de escanear
 * ya se había arreglado cacheando UNA key (P2-SCAN-BTN-STABLE) y los banners
 * se quedaron fuera de la receta.
 *
 * Fix: se cachea el payload entero del status (4º dataset de pantryCache) y
 * el estado inicial hidrata de ahí, incluso stale; el fetch diferido
 * reconcilia. La key suelta del scan queda como fallback de transición.
 *
 * Invalidar el inventario no abre un hueco: conserva el snapshot hasta que el
 * servidor y la lista visible confirman el nuevo estado.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    getCachedPantryStatus, setCachedPantryStatus,
    invalidateInventoryCache, reconcilePantryStatus, _resetPantryCacheForTests,
} from '../utils/pantryCache';

const STATUS = { is_below: true, meaningful_count: 0, recommended_target: 20, photo_scan_enabled: true };

describe('[P1-PANTRY-STATUS-PERSIST] el status de la nevera se cachea', () => {
    beforeEach(() => { _resetPantryCacheForTests(); localStorage.clear(); });

    it('sin cache devuelve undefined (no un objeto que finja saber)', () => {
        expect(getCachedPantryStatus()).toBeUndefined();
    });

    it('lo guardado se recupera y sobrevive fuera de la memoria del módulo', () => {
        setCachedPantryStatus(STATUS);
        expect(getCachedPantryStatus()).toEqual(STATUS);
        const crudo = localStorage.getItem('mealfit_pantry_status_cache_v1');
        expect(crudo, 'sin disco, cada F5 vuelve el parpadeo').toBeTruthy();
        expect(JSON.parse(crudo).value).toEqual(STATUS);
    });

    it('un aviso caducado sigue en el primer paint mientras se revalida', () => {
        localStorage.setItem('mealfit_pantry_status_cache_v1', JSON.stringify({
            value: STATUS, expiresAt: Date.now() - 1000,
        }));
        expect(getCachedPantryStatus()).toEqual(STATUS);
        expect(localStorage.getItem('mealfit_pantry_status_cache_v1')).toBeTruthy();
    });

    it('payloads que no son objeto se ignoran (fail-open)', () => {
        setCachedPantryStatus(null);
        setCachedPantryStatus([1, 2]);
        expect(getCachedPantryStatus()).toBeUndefined();
    });

    it('invalidar el inventario conserva el aviso hasta la revalidación', () => {
        setCachedPantryStatus(STATUS);
        invalidateInventoryCache();
        expect(getCachedPantryStatus()).toEqual(STATUS);
    });

    it('una respuesta fail-soft no oculta el aviso si la lista sigue vacía', () => {
        const failSoft = { is_below: false, meaningful_count: 0, min_required: 3 };
        expect(reconcilePantryStatus(STATUS, failSoft, 0)).toEqual(STATUS);
    });

    it('retira el aviso cuando servidor y lista confirman que alcanzó el mínimo', () => {
        const resolved = { is_below: false, meaningful_count: 3, min_required: 3 };
        expect(reconcilePantryStatus(STATUS, resolved, 3)).toEqual(resolved);
    });
});

describe('[P1-PANTRY-STATUS-PERSIST] Pantry hidrata y persiste', () => {
    const SRC = fs.readFileSync(path.resolve(__dirname, '../pages/Pantry.jsx'), 'utf8')
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    it('el estado inicial lee el cache completo (no solo la key del scan)', () => {
        const i = SRC.indexOf('const [pantryStatus, setPantryStatus] = useState');
        expect(i).toBeGreaterThan(-1);
        expect(SRC.slice(i, i + 500)).toMatch(/getCachedPantryStatus\(\)/);
    });

    it('el fetch diferido persiste el payload para el próximo primer paint', () => {
        const i = SRC.indexOf("fetchWithAuth('/api/plans/pantry-status')");
        expect(i).toBeGreaterThan(-1);
        expect(SRC.slice(i, i + 1000)).toMatch(/setCachedPantryStatus\(reconciled\)/);
    });
});
