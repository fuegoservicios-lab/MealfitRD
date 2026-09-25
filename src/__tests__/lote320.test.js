/**
 * [P1-PLAN-LOTE-320 · 2026-09-25] Cambiar de apartado (Agente → Nevera) sin esperar.
 *
 * El dueño: «a veces se tarda mucho en cargar la Nevera». Medido en el arnés con build de PRODUCCIÓN (CPU ×4): con todo
 * en caliente la Nevera sale en 60-90 ms; lo lento eran dos casos:
 *   · la PRIMERA visita: el código de la página se compilaba y montaba en ese momento (622 ms, con pantalla de carga);
 *   · la caché del inventario vencida (10 min) o invalidada por el chat: esqueleto hasta que respondieran la red y la
 *     sesión, aunque el backend tarda 4 ms (medido en el VPS).
 * Ahora las páginas del menú se precargan en reposo, y la Nevera abre con la última copia conocida y se refresca en
 * silencio. Al cerrar sesión / cambiar de usuario la copia se BORRA (nada de ver la Nevera de otra cuenta).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (rel) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
const FILAS = [{ id: 1, ingredient_name: 'Pollo', quantity: 2 }];

describe('[320] la Nevera guarda su última copia para pintarla ya', () => {
    let c;
    beforeEach(async () => {
        vi.resetModules();
        localStorage.clear();
        c = await import('../utils/pantryCache');
    });
    afterEach(() => { vi.useRealTimers(); });

    it('vencida: no es «fresca», pero sigue disponible como copia vieja', () => {
        vi.useFakeTimers();
        c.setCachedInventory(FILAS);
        vi.advanceTimersByTime(11 * 60 * 1000);
        expect(c.getCachedInventory()).toBeUndefined();
        expect(c.getStaleInventory()).toEqual(FILAS);
    });

    it('invalidada (el chat o una mutación la cambió): se refetchea, pero se puede pintar mientras', () => {
        c.setCachedInventory(FILAS);
        c.invalidateInventoryCache();
        expect(c.getCachedInventory()).toBeUndefined();
        expect(c.getStaleInventory()).toEqual(FILAS);
    });

    it('sobrevive a recargar la página (localStorage) aunque esté vencida', async () => {
        vi.useFakeTimers();
        c.setCachedInventory(FILAS);
        vi.advanceTimersByTime(11 * 60 * 1000);
        vi.resetModules();
        const otra = await import('../utils/pantryCache');
        expect(otra.getStaleInventory()).toEqual(FILAS);
    });

    it('al cerrar sesión / cambiar de usuario se BORRA del todo', () => {
        c.setCachedInventory(FILAS);
        c.borrarCacheDeInventario();
        expect(c.getCachedInventory()).toBeUndefined();
        expect(c.getStaleInventory()).toBeUndefined();
    });

    it('el cambio de usuario usa el borrado total, no la invalidación', () => {
        const ctx = leer('src/context/AssessmentContext.jsx');
        const k = ctx.indexOf('const _clearUserScopedCaches = () => {');
        const cuerpo = ctx.slice(k, k + 1500);
        expect(cuerpo).toContain('borrarCacheDeInventario()');
        expect(cuerpo).not.toContain('invalidateInventoryCache()');
    });

    it('la Nevera arranca con la copia vieja y solo muestra el esqueleto si no hay NINGUNA', () => {
        const p = leer('src/pages/Pantry.jsx');
        expect(p).toContain('useState(() => getCachedInventory() || getStaleInventory() || [])');
        expect(p).toContain('useState(() => !getCachedInventory() && !getStaleInventory())');
        // al montar con copia vieja: refresco SILENCIOSO (fetchData(false) no enciende el esqueleto)
        expect(p).toContain('fetchData(!Array.isArray(getStaleInventory()));');
    });
});

describe('[320] las páginas del menú se precargan en reposo', () => {
    beforeEach(() => { vi.resetModules(); });

    it('cada página se importa UNA vez y lazy usa la misma promesa', async () => {
        const m = await import('../utils/precargaDePaginas');
        expect(m.cargarPagina.nevera()).toBe(m.cargarPagina.nevera());
    });

    it('la promesa ya cargada lleva su estado: React la usa sin enseñar la pantalla de carga', async () => {
        const m = await import('../utils/precargaDePaginas');
        const p = m._unaVez(() => Promise.resolve({ default: 'X' }))();
        await p;
        expect(p.status).toBe('fulfilled');
        expect(p.value).toEqual({ default: 'X' });
    });

    it('precargar espera al reposo del navegador y pide todas las del menú', async () => {
        const m = await import('../utils/precargaDePaginas');
        const pedidas = [];
        for (const k of Object.keys(m.cargarPagina)) vi.spyOn(m.cargarPagina, k).mockImplementation(() => { pedidas.push(k); return Promise.resolve({}); });
        let enReposo = null;
        vi.stubGlobal('requestIdleCallback', (fn) => { enReposo = fn; return 1; });
        m.precargarPaginasDelMenu();
        expect(pedidas).toEqual([]);            // nada antes del reposo
        enReposo();
        expect(pedidas.sort()).toEqual(['agente', 'historial', 'hoy', 'nevera', 'progreso']);
        vi.unstubAllGlobals();
    });

    it('App.jsx monta las páginas con esos cargadores y precarga desde el dashboard', () => {
        const app = leer('src/App.jsx');
        expect(app).toContain('const Pantry = lazy(cargarPagina.nevera);');
        expect(app).toContain('const AgentPage = lazy(cargarPagina.agente);');
        const k = app.indexOf('const DashboardAnimatedLayout = () => {');
        expect(app.slice(k, k + 2500)).toContain('precargarPaginasDelMenu()');
    });
});
