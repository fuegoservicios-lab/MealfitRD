// [P1-PLAN-LOTE-1145 · 2026-11-21] Tu día termina cuando duermes: el contador sigue en el viernes a las 4:22 sin dormir.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { fetchWithAuth } from '../config/api';
import { getBiologicalDateStr, fijarDiaActivo, diaExtendido } from '../utils/diaBiologico';
import { AvisoDiaActivo } from '../components/dashboard/DiaActivo';
import { pedirDiaActivo } from '../utils/diaActivo';

// 21-nov 4:22 en el huso del entorno de pruebas: el corte natural es a las 4:00 de ese día (hora local)
const corte = new Date(2026, 10, 21, 4, 0, 0);
const ahora = new Date(2026, 10, 21, 4, 22, 0);
const EXTENDIDO = {
    extendido: true, dia: '2026-11-20', dia_natural: '2026-11-21', anterior: '2026-11-20', motivo: 'despierto',
    fin: corte.toISOString(), hasta: new Date(2026, 10, 21, 9, 0, 0).toISOString(), puede_seguir: true,
};

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ahora);
    try { localStorage.clear(); } catch { /* */ }
});
afterEach(() => { fijarDiaActivo(null); vi.useRealTimers(); vi.clearAllMocks(); });

describe('[1145] el día que se vive', () => {
    it('sin día extendido, a las 4:22 ya es el sábado', () => {
        fijarDiaActivo(null);
        expect(getBiologicalDateStr(new Date())).toBe('2026-11-21');
    });

    it('sin dormir, a las 4:22 sigue siendo el viernes; las horas de antes del corte no cambian', () => {
        expect(fijarDiaActivo(EXTENDIDO)).toBe(true);
        expect(getBiologicalDateStr(new Date())).toBe('2026-11-20');
        expect(getBiologicalDateStr(new Date(2026, 10, 20, 23, 42))).toBe('2026-11-20');
        expect(getBiologicalDateStr(new Date(2026, 10, 21, 9, 30))).toBe('2026-11-21');   // pasado «hasta»
        expect(JSON.parse(localStorage.getItem('mealfit_dia_extendido')).dia).toBe('2026-11-20');
        fijarDiaActivo({ ...EXTENDIDO, extendido: false });
        expect(diaExtendido()).toBeNull();
        expect(localStorage.getItem('mealfit_dia_extendido')).toBeNull();
    });

    it('pedirDiaActivo aplica la respuesta y avisa al contador si el día cambió', async () => {
        const avisos = [];
        const oir = (e) => avisos.push(e.detail);
        window.addEventListener('mealfit:diary-changed', oir);
        fetchWithAuth.mockResolvedValueOnce({ ok: true, json: async () => EXTENDIDO });
        await pedirDiaActivo();
        window.removeEventListener('mealfit:diary-changed', oir);
        expect(fetchWithAuth.mock.calls[0][0]).toMatch(/^\/api\/diary\/dia-activo\?tzOffset=/);
        expect(getBiologicalDateStr(new Date())).toBe('2026-11-20');
        expect(avisos).toEqual([{ source: 'dia-activo' }]);
    });
});

describe('[1145] el aviso del contador', () => {
    it('«Sigues en tu viernes» con «Empezar mi sábado», que vuelve al día nuevo', async () => {
        fijarDiaActivo(EXTENDIDO);
        render(<AvisoDiaActivo />);
        expect(screen.getByText(/Sigues en tu viernes/i)).toBeTruthy();
        expect(screen.getByText('No has dormido: tu día sigue')).toBeTruthy();
        fetchWithAuth.mockResolvedValueOnce({ ok: true, json: async () => ({ ...EXTENDIDO, extendido: false, dia: '2026-11-21', puede_seguir: false }) });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Empezar mi sábado/i })); });
        expect(JSON.parse(fetchWithAuth.mock.calls[0][1].body)).toEqual({ accion: 'empezar' });
        await waitFor(() => expect(screen.queryByText(/Sigues en tu/i)).toBeNull());
        expect(getBiologicalDateStr(new Date())).toBe('2026-11-21');
    });

    it('de mañana tras una noche activa: «¿Aún no has dormido?», y se puede cerrar', () => {
        fijarDiaActivo({ ...EXTENDIDO, extendido: false, dia: '2026-11-21', motivo: null });
        render(<AvisoDiaActivo />);
        expect(screen.getByText('¿Aún no has dormido?')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Seguir en mi viernes/i })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        expect(screen.queryByText('¿Aún no has dormido?')).toBeNull();
    });
});
