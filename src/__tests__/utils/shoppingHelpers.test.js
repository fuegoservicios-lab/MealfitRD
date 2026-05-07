/**
 * Tests P1-PDF-1: fetchFreshInventoryWithTimeout — degradación visible
 * cuando el fetch live de Supabase tarda o falla durante la generación del
 * PDF de lista de compras.
 *
 * Bug original (audit P1-PDF-1):
 *   `handleDownloadShoppingList` en Dashboard.jsx envolvía el fetch de
 *   `user_inventory` en `try/catch` con fallback silencioso a `liveInventory`
 *   cacheado. Si Supabase tardaba (red lenta) o fallaba (RLS, permisos),
 *   el PDF se generaba con datos stale → items que ya estaban en la nevera
 *   reaparecían → usuario compraba duplicado, sin alerta visual.
 *
 * Fix:
 *   1. `fetchFreshInventoryWithTimeout(fetchFn, timeoutMs=2000)` carrera
 *      contra timeout configurable.
 *   2. Devuelve `{ data, stale, reason }` con semántica explícita.
 *   3. `stale=true` activa banner amber en el PDF + `trackEvent` para que
 *      operadores midan frecuencia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    fetchFreshInventoryWithTimeout,
    computePdfLayoutDensity,
    PDF_LAYOUT_THRESHOLDS,
} from '../../utils/shoppingHelpers';


describe('fetchFreshInventoryWithTimeout — P1-PDF-1', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Path feliz: fetch retorna datos antes del timeout
    // -----------------------------------------------------------------------
    it('returns fresh data when fetch resolves within timeout', async () => {
        const mockData = [{ ingredient_name: 'Pollo', quantity: 500 }];
        const fetchFn = () => Promise.resolve({ data: mockData, error: null });

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.stale).toBe(false);
        expect(result.reason).toBeNull();
        expect(result.data).toEqual(mockData);
    });

    it('accepts an empty array as valid (user con nevera vacía legítima)', async () => {
        // Una nevera vacía NO es stale — es una respuesta válida.
        const fetchFn = () => Promise.resolve({ data: [], error: null });

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.stale).toBe(false);
        expect(result.data).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Path stale: timeout
    // -----------------------------------------------------------------------
    it('returns stale=true with reason="timeout" when fetch exceeds the cap', async () => {
        // Fetch que NUNCA resuelve antes del timeout (Supabase lentitud / red caída).
        const fetchFn = () => new Promise(() => { /* never resolves */ });

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        // Avanzamos el reloj más allá del timeout configurado.
        await vi.advanceTimersByTimeAsync(2001);
        const result = await promise;

        expect(result.stale).toBe(true);
        expect(result.reason).toBe('timeout');
        expect(result.data).toBeNull();
    });

    it('respects custom timeoutMs (subir el cap si SLA exige delta-fresh)', async () => {
        // Fetch que toma 3000ms; con cap=1000 debe degradar a timeout.
        const fetchFn = () => new Promise((resolve) => {
            setTimeout(() => resolve({ data: [], error: null }), 3000);
        });

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 1000);
        await vi.advanceTimersByTimeAsync(1001);
        const result = await promise;

        expect(result.stale).toBe(true);
        expect(result.reason).toBe('timeout');
    });

    // -----------------------------------------------------------------------
    // Path stale: error
    // -----------------------------------------------------------------------
    it('returns stale=true with reason="error" when Supabase responds with error field', async () => {
        // Supabase exitosamente responde pero con error (RLS, schema, permisos).
        const fetchFn = () => Promise.resolve({
            data: null,
            error: { message: 'permission denied', code: '42501' },
        });

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.stale).toBe(true);
        expect(result.reason).toBe('error');
        expect(result.data).toBeNull();
    });

    it('returns stale=true with reason="error" when fetch throws', async () => {
        // Excepción durante el fetch (network error, JSON parse, etc.).
        const fetchFn = () => Promise.reject(new Error('Network blip'));

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.stale).toBe(true);
        expect(result.reason).toBe('error');
    });

    // -----------------------------------------------------------------------
    // Path stale: empty_response (data ausente sin error explícito)
    // -----------------------------------------------------------------------
    it('returns stale=true with reason="empty_response" when data is null without error', async () => {
        // Caso patológico: Supabase con RLS denegando silenciosamente (data null,
        // error null). Tratar como stale para no asumir "nevera vacía".
        const fetchFn = () => Promise.resolve({ data: null, error: null });

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.stale).toBe(true);
        expect(result.reason).toBe('empty_response');
    });

    it('returns stale=true with reason="empty_response" when data is undefined', async () => {
        const fetchFn = () => Promise.resolve({});

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.stale).toBe(true);
        expect(result.reason).toBe('empty_response');
    });

    // -----------------------------------------------------------------------
    // Path stale: invalid_fetch_fn (defense en boundary)
    // -----------------------------------------------------------------------
    it('returns stale=true with reason="invalid_fetch_fn" when fetchFn is not a function', async () => {
        const result = await fetchFreshInventoryWithTimeout(null, 2000);
        expect(result.stale).toBe(true);
        expect(result.reason).toBe('invalid_fetch_fn');
    });

    it('returns stale=true when fetchFn is undefined', async () => {
        const result = await fetchFreshInventoryWithTimeout(undefined, 2000);
        expect(result.stale).toBe(true);
        expect(result.reason).toBe('invalid_fetch_fn');
    });

    // -----------------------------------------------------------------------
    // Resilencia: NUNCA debe lanzar — el caller espera siempre {data, stale, reason}
    // -----------------------------------------------------------------------
    it('never throws, even if fetchFn returns a non-Promise', async () => {
        const fetchFn = () => 'not-a-promise';
        // No `expect.toThrow` porque la API debe ser tolerante.
        const result = await fetchFreshInventoryWithTimeout(fetchFn, 2000);
        // Cualquier resultado distinto del shape `{data, error}` debería caer
        // a empty_response o error según cómo Promise.race lo coerce.
        expect(result.stale).toBe(true);
        expect(['empty_response', 'error']).toContain(result.reason);
    });

    // -----------------------------------------------------------------------
    // Bug original reproducido
    // -----------------------------------------------------------------------
    it('escenario bug original: fetch lento → degrada con stale=true en lugar de hang', async () => {
        // PRE-FIX: el await del fetch sin timeout colgaba la generación del
        // PDF si Supabase tardaba — el toast "Generando..." no avanzaba.
        // POST-FIX: timeout corta a 2000ms y devuelve stale, el PDF se
        // genera con liveInventory cacheado + banner amber.
        const fetchFn = () => new Promise((resolve) => {
            // Supabase tarda 10 segundos (peor caso real observado en incidentes).
            setTimeout(() => resolve({ data: [{ ingredient_name: 'Pollo' }], error: null }), 10_000);
        });

        const promise = fetchFreshInventoryWithTimeout(fetchFn, 2000);
        await vi.advanceTimersByTimeAsync(2001);
        const result = await promise;

        expect(result.stale).toBe(true);
        expect(result.reason).toBe('timeout');
        // Caller usaría `liveInventory` cacheado y mostraría banner amber.
    });
});


// ============================================================
// [P1-PDF-3] Tests para `computePdfLayoutDensity`.
// ------------------------------------------------------------
// Cierra el modo de fallo "lista mensual ≥80 items se comprime más allá
// de la legibilidad bajo `pagebreak: avoid-all` + `isUltraDense`". El
// helper centraliza la decisión de densidad y paginación.
// ============================================================
describe('computePdfLayoutDensity — P1-PDF-3', () => {
    // ---------------------------------------------------------------
    // Thresholds anchored en valores documentados.
    // ---------------------------------------------------------------
    it('exposes canonical thresholds (DENSE=26, ULTRA_DENSE=38, HYPER_DENSE=60, MULTI_PAGE=80)', () => {
        expect(PDF_LAYOUT_THRESHOLDS.DENSE).toBe(26);
        expect(PDF_LAYOUT_THRESHOLDS.ULTRA_DENSE).toBe(38);
        expect(PDF_LAYOUT_THRESHOLDS.HYPER_DENSE).toBe(60);
        expect(PDF_LAYOUT_THRESHOLDS.MULTI_PAGE).toBe(80);
    });

    it('thresholds frozen — no runtime mutation', () => {
        expect(Object.isFrozen(PDF_LAYOUT_THRESHOLDS)).toBe(true);
    });

    // ---------------------------------------------------------------
    // Tier discreto: ningún input cae en dos tiers a la vez.
    // ---------------------------------------------------------------
    it.each([
        // [totalItems, expected_density, expected_columnCount, expected_multiPage]
        [0,   'normal', 3, false],
        [10,  'normal', 3, false],
        [25,  'normal', 3, false],
        [26,  'dense',  3, false],   // edge: threshold exact
        [37,  'dense',  3, false],
        [38,  'ultra',  3, false],   // edge: threshold exact
        [59,  'ultra',  3, false],
        [60,  'hyper',  4, false],   // edge: HYPER_DENSE exact, NO multi-page yet
        [79,  'hyper',  4, false],
        [80,  'hyper',  4, true],    // edge: MULTI_PAGE exact
        [100, 'hyper',  4, true],
        [200, 'hyper',  4, true],
    ])('totalItems=%i → density=%s, columnCount=%i, multiPage=%s', (n, density, cols, multi) => {
        const layout = computePdfLayoutDensity(n);
        expect(layout.density).toBe(density);
        expect(layout.columnCount).toBe(cols);
        expect(layout.multiPage).toBe(multi);
    });

    // ---------------------------------------------------------------
    // Boolean flags consistencia con los tiers (no hay overlap silencioso).
    // ---------------------------------------------------------------
    it('isHyperDense implies isUltraDense implies isDense (cascada de flags)', () => {
        const hyper = computePdfLayoutDensity(60);
        expect(hyper.isHyperDense).toBe(true);
        expect(hyper.isUltraDense).toBe(true);
        expect(hyper.isDense).toBe(true);

        const ultra = computePdfLayoutDensity(38);
        expect(ultra.isHyperDense).toBe(false);
        expect(ultra.isUltraDense).toBe(true);
        expect(ultra.isDense).toBe(true);

        const dense = computePdfLayoutDensity(26);
        expect(dense.isHyperDense).toBe(false);
        expect(dense.isUltraDense).toBe(false);
        expect(dense.isDense).toBe(true);

        const normal = computePdfLayoutDensity(10);
        expect(normal.isHyperDense).toBe(false);
        expect(normal.isUltraDense).toBe(false);
        expect(normal.isDense).toBe(false);
    });

    // ---------------------------------------------------------------
    // showInventoryNotes: oculto solo en hyper-dense (libera ~10-12px verticales).
    // ---------------------------------------------------------------
    it('hides inventory notes only in hyper-dense (≥60)', () => {
        expect(computePdfLayoutDensity(0).showInventoryNotes).toBe(true);
        expect(computePdfLayoutDensity(38).showInventoryNotes).toBe(true);
        expect(computePdfLayoutDensity(59).showInventoryNotes).toBe(true);
        expect(computePdfLayoutDensity(60).showInventoryNotes).toBe(false);
        expect(computePdfLayoutDensity(100).showInventoryNotes).toBe(false);
    });

    // ---------------------------------------------------------------
    // Defensiveness: input inválido cae a 0 sin crash.
    // ---------------------------------------------------------------
    it.each([
        [null,        0],
        [undefined,   0],
        [NaN,         0],
        [Infinity,    0],
        [-5,          0],
        ['not-a-num', 0],
        [{},          0],
        [25.7,        25],   // floor a int — 25.7 items no tiene sentido pero acepta
    ])('graceful with non-numeric input: %p → totalItems=%i', (input, expected) => {
        const layout = computePdfLayoutDensity(input);
        expect(layout.totalItems).toBe(expected);
    });

    it('returns frozen-shape object with all expected keys', () => {
        const layout = computePdfLayoutDensity(50);
        expect(layout).toEqual(expect.objectContaining({
            totalItems: expect.any(Number),
            density: expect.any(String),
            isDense: expect.any(Boolean),
            isUltraDense: expect.any(Boolean),
            isHyperDense: expect.any(Boolean),
            multiPage: expect.any(Boolean),
            columnCount: expect.any(Number),
            showInventoryNotes: expect.any(Boolean),
        }));
    });

    // ---------------------------------------------------------------
    // Bug original (pre P1-PDF-3): para 100 items la heurística previa
    // (isUltraDense=true) trataba el caso igual que 50 items — mismo
    // padding/cols, mismo `avoid-all` — y comprimía hasta ilegibilidad.
    // Verificamos que ahora 100 items tiene una decisión MATERIALMENTE
    // distinta a 50 items.
    // ---------------------------------------------------------------
    it('escenario bug original: 100 items obtiene layout distinto que 50 items', () => {
        const fifty = computePdfLayoutDensity(50);
        const hundred = computePdfLayoutDensity(100);

        // PRE-FIX: ambos tendrían isUltraDense=true y nada más → mismo render.
        // POST-FIX: 100 entra en hyper-dense + multi-page; 50 sigue en ultra-dense.
        expect(fifty.density).toBe('ultra');
        expect(fifty.multiPage).toBe(false);
        expect(fifty.columnCount).toBe(3);

        expect(hundred.density).toBe('hyper');
        expect(hundred.multiPage).toBe(true);
        expect(hundred.columnCount).toBe(4);
        expect(hundred.showInventoryNotes).toBe(false);
    });
});
