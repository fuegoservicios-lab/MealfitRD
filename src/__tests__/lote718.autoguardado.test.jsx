/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Dos huecos en «volcar sin poder esperar» (hooks/useAutoguardado.js).
 *
 *   1. Cerrar la ventana de Configuración con un PUT EN VUELO perdía la última edición: el desmontaje solo volcaba
 *      «si no hay nada en vuelo», y lo que esperaba en el temporizador (que el desmontaje cancela) no dejaba marca.
 *   2. El PUT de la despedida (`pagehide`) esperaba un token asíncrono antes de salir: en una descarga de verdad la
 *      página puede morir en esa espera y la petición no sale nunca. Y con un PUT en vuelo, ni siquiera se intentaba.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const sesion = { valor: null };
vi.mock('../utils/firstPartySession', () => ({ getStoredMfSession: () => sesion.valor }));
vi.mock('../config/api', () => ({
    api: (ruta) => `https://api.prueba${ruta}`,
    fetchWithAuth: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

import useAutoguardado, { enviarAlIrse, RETARDO_INSTANTANEO_MS } from '../hooks/useAutoguardado';
import { fetchWithAuth } from '../config/api';

const montar = (props) => renderHook((p) => useAutoguardado(p), { initialProps: props });

/** Un guardar cuyo PRIMER PUT se queda en vuelo hasta que la prueba lo suelta. */
const guardarConPrimeroEnVuelo = () => {
    let soltar;
    const guardar = vi.fn()
        .mockImplementationOnce(() => new Promise((r) => { soltar = () => r(undefined); }))
        .mockResolvedValue(undefined);
    return { guardar, soltar: () => soltar() };
};

describe('[718] cerrar la ventana con un PUT en vuelo no pierde la última edición', () => {
    it('lo que esperaba en el temporizador sale en cuanto vuelve el PUT en vuelo', async () => {
        const { guardar, soltar } = guardarConPrimeroEnVuelo();
        const base = { guardar, habilitado: true, instantaneos: ['n'] };
        const { rerender, result, unmount } = montar({ ...base, valor: { n: 0 } });

        rerender({ ...base, valor: { n: 1 } });
        act(() => { result.current.volcar(); });
        await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));   // n:1 en vuelo

        // Nueva edición: espera su temporizador de 400 ms… y la ventana se cierra antes.
        rerender({ ...base, valor: { n: 2 } });
        unmount();
        expect(guardar).toHaveBeenCalledTimes(1);   // nunca dos PUT en vuelo

        await act(async () => { soltar(); });
        await waitFor(() => expect(
            guardar,
            'la edición que esperaba en el temporizador murió con el desmontaje',
        ).toHaveBeenCalledTimes(2));
        expect(guardar.mock.calls[1][0]).toEqual({ n: 2 });
    });

    it('si lo último YA viajaba en el PUT en vuelo, no se repite nada', async () => {
        const { guardar, soltar } = guardarConPrimeroEnVuelo();
        const base = { guardar, habilitado: true, instantaneos: ['n'] };
        const { rerender, result, unmount } = montar({ ...base, valor: { n: 0 } });
        rerender({ ...base, valor: { n: 1 } });
        act(() => { result.current.volcar(); });
        unmount();
        await act(async () => { soltar(); });
        await new Promise((r) => { setTimeout(r, RETARDO_INSTANTANEO_MS + 50); });
        expect(guardar).toHaveBeenCalledTimes(1);
    });
});

describe('[718] irse de la página con un PUT en vuelo', () => {
    it('lo último sale YA por keepalive, y la repetición ordenada también lleva keepalive', async () => {
        const { guardar, soltar } = guardarConPrimeroEnVuelo();
        const base = { guardar, habilitado: true, instantaneos: ['n'] };
        const { rerender, result } = montar({ ...base, valor: { n: 0 } });
        rerender({ ...base, valor: { n: 1 } });
        act(() => { result.current.volcar(); });
        await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));

        rerender({ ...base, valor: { n: 2 } });
        act(() => { window.dispatchEvent(new Event('pagehide')); });
        // En el MISMO tic: una descarga no espera a que vuelva el PUT en vuelo.
        expect(guardar, 'con un PUT en vuelo la despedida no mandó nada').toHaveBeenCalledTimes(2);
        expect(guardar.mock.calls[1]).toEqual([{ n: 2 }, { keepalive: true }]);

        // Si la página sobrevive (bfcache, volver a la pestaña), la repetición en orden deja el último valor.
        await act(async () => { soltar(); });
        await waitFor(() => expect(guardar).toHaveBeenCalledTimes(3));
        expect(guardar.mock.calls[2]).toEqual([{ n: 2 }, { keepalive: true }]);
    });

    it('sin nada nuevo desde el PUT en vuelo, la despedida no duplica el envío', async () => {
        const { guardar, soltar } = guardarConPrimeroEnVuelo();
        const base = { guardar, habilitado: true, instantaneos: ['n'] };
        const { rerender, result } = montar({ ...base, valor: { n: 0 } });
        rerender({ ...base, valor: { n: 1 } });
        act(() => { result.current.volcar(); });
        act(() => { window.dispatchEvent(new Event('pagehide')); });
        expect(guardar).toHaveBeenCalledTimes(1);
        await act(async () => { soltar(); });
        await new Promise((r) => { setTimeout(r, 50); });
        expect(guardar).toHaveBeenCalledTimes(1);
    });
});

describe('[718] enviarAlIrse: el PUT de la despedida sale en el mismo tic', () => {
    let fetchGlobal;
    beforeEach(() => {
        fetchGlobal = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
        vi.stubGlobal('fetch', fetchGlobal);
        vi.mocked(fetchWithAuth).mockClear();
    });
    afterEach(() => { vi.unstubAllGlobals(); sesion.valor = null; });

    it('con sesión propia guardada: fetch SÍNCRONO, keepalive y X-MF-Session (sin esperar ningún token)', () => {
        sesion.valor = 'sesion-propia';
        const init = { method: 'PUT', body: JSON.stringify({ a: 1 }) };
        enviarAlIrse('/api/user/preferences/staple-foods', init);
        // Sin `await` de por medio: si hubiera una espera antes de `fetch`, esto sería 0.
        expect(fetchGlobal).toHaveBeenCalledTimes(1);
        const [url, opciones] = fetchGlobal.mock.calls[0];
        expect(url).toBe('https://api.prueba/api/user/preferences/staple-foods');
        expect(opciones.keepalive).toBe(true);
        expect(opciones.method).toBe('PUT');
        expect(opciones.headers.get('X-MF-Session')).toBe('sesion-propia');
        expect(opciones.headers.get('Content-Type')).toBe('application/json');
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });

    it('sin sesión propia: el camino de siempre (fetchWithAuth) con keepalive', () => {
        sesion.valor = null;
        enviarAlIrse('/api/x', { method: 'PUT', body: '{}' });
        expect(fetchGlobal).not.toHaveBeenCalled();
        expect(fetchWithAuth).toHaveBeenCalledWith('/api/x', expect.objectContaining({ keepalive: true, method: 'PUT' }));
    });
});
