/**
 * [P1-PLAN-LOTE-971 · 2026-10-01] Al terminar el plan, el panel ya está cargado.
 *
 * La pantalla de generación (`/plan`) vive fuera del layout del panel, y la precarga de páginas (lote 320) solo se
 * lanzaba DENTRO del panel. Quien llegaba del formulario descargaba y compilaba el código del panel (355 KB de JS)
 * justo después de «listo». Ahora la pantalla de carga lo pide en reposo durante la espera.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (rel) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('[971] precarga de la llegada al panel', () => {
    beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

    it('espera al reposo y pide SOLO el panel y su layout, una vez', async () => {
        const m = await import('../utils/precargaDePaginas');
        const pedidas = [];
        vi.spyOn(m.cargarPagina, 'hoy').mockImplementation(() => { pedidas.push('hoy'); return Promise.resolve({}); });
        for (const k of ['nevera', 'agente', 'progreso', 'historial']) {
            vi.spyOn(m.cargarPagina, k).mockImplementation(() => { pedidas.push(k); return Promise.resolve({}); });
        }
        let enReposo = null;
        vi.stubGlobal('requestIdleCallback', (fn) => { enReposo = fn; return 1; });
        m.precargarLlegadaAlPanel();
        m.precargarLlegadaAlPanel();
        expect(pedidas).toEqual([]);
        enReposo();
        expect(pedidas).toEqual(['hoy']);       // el layout va por su propio cargador, no por el menú
    });

    it('el layout comparte promesa con su `lazy` (una sola importación)', async () => {
        const m = await import('../utils/precargaDePaginas');
        expect(m.cargarLayoutDelPanel()).toBe(m.cargarLayoutDelPanel());
        const app = leer('src/App.jsx');
        expect(app).toContain('const DashboardLayout = lazy(cargarLayoutDelPanel);');
        expect(app).toContain('const Dashboard = lazy(cargarPagina.hoy);');
    });

    it('al volver pide el panel inmediatamente aunque el reposo siga pendiente', async () => {
        const m = await import('../utils/precargaDePaginas');
        const hoy = vi.spyOn(m.cargarPagina, 'hoy').mockResolvedValue({});
        vi.stubGlobal('requestIdleCallback', vi.fn());
        m.precargarLlegadaAlPanel();
        expect(hoy).not.toHaveBeenCalled();
        m.precargarLlegadaAlPanel({ inmediata: true });
        expect(hoy).toHaveBeenCalledOnce();
    });

    it('la pantalla de carga de la generación la lanza al montar', () => {
        const plan = leer('src/pages/Plan.jsx');
        const k = plan.indexOf('const LoadingScreen = (');
        expect(k).toBeGreaterThan(0);
        expect(plan.slice(k, k + 6000)).toContain('useEffect(() => { precargarLlegadaAlPanel(); }, []);');
    });
});
