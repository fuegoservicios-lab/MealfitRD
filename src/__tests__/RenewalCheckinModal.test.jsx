// [P1-CHECKIN-QUEUE-PARITY · 2026-09-02] El check-in de renovación: lo guardado vuelve al
// formulario, el copy se entiende a la primera, y omitir no guarda nada.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fetchWithAuth = vi.fn();
vi.mock('../config/api', () => ({ fetchWithAuth: (...a) => fetchWithAuth(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import RenewalCheckinModal from '../components/plan/RenewalCheckinModal.jsx';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('RenewalCheckinModal', () => {
    beforeEach(() => fetchWithAuth.mockReset());

    it('guardar: envía el check-in y devuelve {weight, unit} al caller', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ engine_active: false }) });
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '135' } });
        fireEvent.click(screen.getByText('Guardar y generar mi plan'));
        await waitFor(() => expect(onDone).toHaveBeenCalledWith({ weight: 135, unit: 'lb' }));
        const body = JSON.parse(fetchWithAuth.mock.calls[0][1].body);
        expect(body.weight).toBe(135);
        expect(body.unit).toBe('lb');
    });

    it('omitir: no llama al backend y devuelve null', () => {
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        fireEvent.click(screen.getByText('Generar sin guardar'));
        expect(fetchWithAuth).not.toHaveBeenCalled();
        expect(onDone).toHaveBeenCalledWith(null);
    });

    it('si el guardado falla, el plan sigue (onDone(null)) y se avisa', async () => {
        fetchWithAuth.mockResolvedValue({ ok: false, status: 500 });
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        fireEvent.click(screen.getByText('Guardar y generar mi plan'));
        await waitFor(() => expect(onDone).toHaveBeenCalledWith(null));
    });

    it('copy para quien lo ve por primera vez: qué pasa con el peso y qué es opcional', () => {
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={() => {}} />);
        expect(screen.getByText('Un minuto antes de tu nuevo plan')).toBeTruthy();
        expect(screen.getByText(/Tu peso de hoy fija las calorías de este plan/)).toBeTruthy();
        expect(screen.getAllByText('(opcional)').length).toBe(2);
    });

    it('Plan.jsx pasa el peso guardado al formulario antes de generar', () => {
        const src = read('src/pages/Plan.jsx');
        expect(src).toContain("updateData('weight', saved.weight);");
        expect(src).toContain("updateData('weightUnit', saved.unit);");
    });
});
