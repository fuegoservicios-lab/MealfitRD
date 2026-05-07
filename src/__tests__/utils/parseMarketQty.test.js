/**
 * Tests P0-2: `parseMarketQty` y `resolveShopQty` en `utils/shoppingHelpers.js`.
 *
 * Bug original (audit P0-2):
 *   Dashboard.jsx:705 hacía `parseFloat(item.market_qty)` directamente, lo que
 *   convertía:
 *      "1 1/2" → 1   (pierde la fracción 0.5)
 *      "1/2"   → 0   (cae a "Al gusto", item desaparece del delta)
 *      "3/4"   → 3   (catastrófico — multiplica por ~4)
 *   `apply_smart_market_units` puede emitir esos strings (BLOQUE 2 con
 *   `is_native_weighable` y BLOQUE 3 de pesos dominicanos), por lo que el
 *   delta lista↔nevera quedaba subdimensionado y el usuario compraba menos
 *   de lo necesario.
 *
 * Fix:
 *   - Backend ahora expone `market_qty_numeric: float` SIEMPRE (post-MARKET_MINIMUMS).
 *   - Frontend prefiere ese campo vía `resolveShopQty(item)`.
 *   - Para items legacy persistidos antes del fix, `parseMarketQty` parsea
 *     fracciones tipo "a", "a/b", "a b/c" sin lanzar.
 */
import { describe, it, expect } from 'vitest';
import { parseMarketQty, resolveShopQty } from '../../utils/shoppingHelpers';

describe('P0-2 — parseMarketQty', () => {
    it('parsea fracción mixta "a b/c" preservando el valor real', () => {
        expect(parseMarketQty('1 1/2')).toBe(1.5);
        expect(parseMarketQty('2 3/4')).toBe(2.75);
        expect(parseMarketQty('  1  1/4  ')).toBe(1.25);
    });

    it('parsea fracción simple "a/b" donde parseFloat fallaría', () => {
        expect(parseMarketQty('1/2')).toBe(0.5);
        expect(parseMarketQty('3/4')).toBe(0.75);
        expect(parseMarketQty('1/4')).toBe(0.25);
    });

    it('regresión: parseFloat("3/4")===3, parseMarketQty NO debe regresar 3', () => {
        // Defensa explícita contra el bug exacto: parseFloat de string fraccional
        // tras la primera barra retorna el numerador.
        expect(parseFloat('3/4')).toBe(3); // confirmar el bug histórico
        expect(parseMarketQty('3/4')).toBe(0.75); // fix
    });

    it('respeta números directos', () => {
        expect(parseMarketQty(2)).toBe(2);
        expect(parseMarketQty(1.5)).toBe(1.5);
        expect(parseMarketQty(0)).toBe(0);
        expect(parseMarketQty('5')).toBe(5);
        expect(parseMarketQty('2.5')).toBe(2.5);
    });

    it('retorna 0 (nunca NaN/Infinity) para inputs inválidos', () => {
        expect(parseMarketQty(null)).toBe(0);
        expect(parseMarketQty(undefined)).toBe(0);
        expect(parseMarketQty('')).toBe(0);
        expect(parseMarketQty('   ')).toBe(0);
        expect(parseMarketQty('abc')).toBe(0);
        expect(parseMarketQty(NaN)).toBe(0);
        expect(parseMarketQty(Infinity)).toBe(0);
        expect(parseMarketQty(-Infinity)).toBe(0);
        expect(parseMarketQty('1/0')).toBe(0); // división por cero
        expect(parseMarketQty('a/b')).toBe(0);
    });

    it('no lanza ante objetos o arrays', () => {
        expect(() => parseMarketQty({})).not.toThrow();
        expect(() => parseMarketQty([])).not.toThrow();
        expect(parseMarketQty({})).toBe(0);
    });
});

describe('P0-2 — resolveShopQty', () => {
    it('prefiere market_qty_numeric cuando está presente y es válido', () => {
        const item = { market_qty_numeric: 1.5, market_qty: '1 1/2' };
        expect(resolveShopQty(item)).toBe(1.5);
    });

    it('prefiere market_qty_numeric incluso si market_qty es un string roto', () => {
        // Caso exacto: el backend nuevo poblará numeric=1.5 aunque
        // market_qty="1 1/2" siga ahí para display legacy.
        const item = { market_qty_numeric: 1.5, market_qty: '1 1/2', market_unit: 'lbs' };
        expect(resolveShopQty(item)).toBe(1.5);
        expect(resolveShopQty(item)).not.toBe(1); // bug original retornaba 1
    });

    it('cae a parseMarketQty(market_qty) cuando numeric ausente', () => {
        // Plan persistido antes del fix P0-2: solo trae market_qty fraccional.
        const item = { market_qty: '1 1/2' };
        expect(resolveShopQty(item)).toBe(1.5);
    });

    it('cae a parseMarketQty para fracciones simples sin numeric', () => {
        expect(resolveShopQty({ market_qty: '1/4' })).toBe(0.25);
        expect(resolveShopQty({ market_qty: '3/4' })).toBe(0.75);
    });

    it('respeta numeric=0 como sentinel "Al gusto" sin reparsear', () => {
        // numeric=0 puede venir de items "Al gusto" (sal, especias). NO debe
        // caer al fallback de market_qty si numeric es explícitamente 0.
        // Pero numeric=0 es un valor válido — retornamos 0 directamente.
        const item = { market_qty_numeric: 0, market_qty: 'Al gusto' };
        expect(resolveShopQty(item)).toBe(0);
    });

    it('ignora numeric inválido (NaN/Infinity) y cae a market_qty', () => {
        const item = { market_qty_numeric: NaN, market_qty: '1/2' };
        expect(resolveShopQty(item)).toBe(0.5);
    });

    it('retorna 0 sin lanzar para items malformados', () => {
        expect(resolveShopQty(null)).toBe(0);
        expect(resolveShopQty(undefined)).toBe(0);
        expect(resolveShopQty({})).toBe(0);
        expect(resolveShopQty('string suelto')).toBe(0);
    });

    it('último fallback: usa item.quantity para items legacy sin market_qty', () => {
        const item = { quantity: '2' };
        expect(resolveShopQty(item)).toBe(2);
    });
});

describe('P0-2 — escenario integración delta lista↔nevera', () => {
    it('"1 1/2 lbs Pollo" - 0.5 lb en nevera = 1.0 lb a comprar (no 0.5)', () => {
        // Antes del fix: parseFloat("1 1/2") = 1; con 0.5 en nevera → comprar 0.5
        // (resultado falso, faltaría 0.5 lb de pollo).
        // Con fix: numeric=1.5, comprar 1.0.
        const planItem = { market_qty_numeric: 1.5, market_qty: '1 1/2', market_unit: 'lbs' };
        const inventoryQty = 0.5;
        const shopQty = resolveShopQty(planItem);
        const remaining = shopQty - inventoryQty;
        expect(remaining).toBe(1.0);
    });

    it('"1/2 lb" — sin fix el item desaparecía (parseFloat("1/2")=0)', () => {
        const planItem = { market_qty_numeric: 0.5, market_qty: '1/2', market_unit: 'lb' };
        const shopQty = resolveShopQty(planItem);
        // Antes: rawShopQty=0 → entraba a la rama "Al gusto" y se agregaba sin
        // descontar inventario. Ahora: rawShopQty=0.5 → procesa delta correcto.
        expect(shopQty).toBeGreaterThan(0);
        expect(shopQty).toBe(0.5);
    });
});
