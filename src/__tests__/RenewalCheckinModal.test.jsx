// [P1-CHECKIN-QUEUE-PARITY · 2026-09-02 → P2-CHECKIN-NO-FABRICATED-ANSWERS · 2026-09-03]
// El check-in de renovación guarda SOLO lo que el usuario responde: la adherencia ya no viene
// precargada al 80 %, el peso del perfil no se guarda sin editarlo o confirmarlo, y un solo
// botón genera (sin nada respondido, no escribe ningún check-in).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fetchWithAuth = vi.fn();
const toastInfo = vi.fn();
vi.mock('../config/api', () => ({ fetchWithAuth: (...a) => fetchWithAuth(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), info: (...a) => toastInfo(...a), error: vi.fn() } }));

import RenewalCheckinModal from '../components/plan/RenewalCheckinModal.jsx';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('RenewalCheckinModal', () => {
    beforeEach(() => { fetchWithAuth.mockReset(); toastInfo.mockReset(); });

    it('sin tocar nada: genera sin escribir ningún check-in (onDone(null), cero fetch)', () => {
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        fireEvent.click(screen.getByText('Generar mi plan'));
        expect(fetchWithAuth).not.toHaveBeenCalled();
        expect(onDone).toHaveBeenCalledWith(null);
    });

    it('la adherencia arranca sin responder y no viaja inventada', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ engine_active: false }) });
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        expect(screen.getByText('Sin responder')).toBeTruthy();
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '135' } });
        fireEvent.click(screen.getByText('Generar mi plan'));
        await waitFor(() => expect(onDone).toHaveBeenCalledWith({ weight: 135, unit: 'lb' }));
        const body = JSON.parse(fetchWithAuth.mock.calls[0][1].body);
        expect(body.weight).toBe(135);
        expect(body.adherence_pct).toBeNull();
        expect(body.hunger).toBeNull();
    });

    it('editar el peso cuenta como confirmarlo; el chip desaparece', () => {
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={() => {}} />);
        expect(screen.getByText('Confirmar')).toBeTruthy();
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '131' } });
        expect(screen.queryByText('Confirmar')).toBeNull();
        expect(screen.getByText('Se guardará como tu peso de hoy.')).toBeTruthy();
    });

    it('señales sin peso confirmado: pide confirmar y no guarda ni genera', () => {
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        fireEvent.click(screen.getAllByText('3')[0]);   // hambre = 3
        fireEvent.click(screen.getByText('Generar mi plan'));
        expect(fetchWithAuth).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        expect(toastInfo).toHaveBeenCalledWith('Confirma tu peso para guardar el check-in.');
    });

    it('confirmar con un toque + señales: guarda el peso del perfil con lo respondido', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ engine_active: true }) });
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        fireEvent.click(screen.getByText('Confirmar'));
        expect(screen.getByText('Confirmado')).toBeTruthy();
        fireEvent.click(screen.getAllByText('4')[0]);   // hambre = 4
        fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });
        fireEvent.click(screen.getByText('Generar mi plan'));
        await waitFor(() => expect(onDone).toHaveBeenCalledWith({ weight: 130, unit: 'lb' }));
        const body = JSON.parse(fetchWithAuth.mock.calls[0][1].body);
        expect(body).toMatchObject({ weight: 130, unit: 'lb', hunger: 4, energy: null, adherence_pct: 70 });
    });

    it('si el guardado falla, el plan sigue (onDone(null)) y se avisa', async () => {
        fetchWithAuth.mockResolvedValue({ ok: false, status: 500 });
        const onDone = vi.fn();
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={onDone} />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '135' } });
        fireEvent.click(screen.getByText('Generar mi plan'));
        await waitFor(() => expect(onDone).toHaveBeenCalledWith(null));
    });

    it('copy para quien lo ve por primera vez: qué pasa con el peso, qué es opcional y un solo botón', () => {
        render(<RenewalCheckinModal defaultWeight={130} defaultUnit="lb" onDone={() => {}} />);
        expect(screen.getByText('Un minuto antes de tu nuevo plan')).toBeTruthy();
        expect(screen.getByText(/Tu peso de hoy fija las calorías de este plan/)).toBeTruthy();
        expect(screen.getAllByText('(opcional)').length).toBe(3);
        expect(screen.getByText('Solo guardamos lo que respondas.')).toBeTruthy();
        expect(screen.queryByText('Generar sin guardar')).toBeNull();
        expect(screen.queryByText('Guardar y generar mi plan')).toBeNull();
    });

    it('Plan.jsx pasa el peso guardado al formulario antes de generar', () => {
        const src = read('src/pages/Plan.jsx');
        expect(src).toContain("updateData('weight', saved.weight);");
        expect(src).toContain("updateData('weightUnit', saved.unit);");
    });
});

describe('RenewalCheckinModal: hover y foco uniformes', () => {
    it('el CTA comparte el lenguaje de hover del Dashboard y los botones de escala responden al mouse y al foco', () => {
        const src = read('src/components/plan/RenewalCheckinModal.jsx');
        expect(src).toContain('.rc-cta:hover:not(:disabled) {');
        expect(src).toContain('box-shadow: 0 14px 30px -8px rgba(16, 185, 129, 0.45), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);');
        expect(src).toContain('.rc-cta:active:not(:disabled) {');
        expect(src).toContain('.rc-scale:hover:not(:disabled), .rc-confirm:hover:not(:disabled) {');
        expect(src).toContain('.rc-scale:focus-visible, .rc-confirm:focus-visible, .rc-cta:focus-visible { outline: 2px solid #34d399;');
        expect(src).toContain('.rc-input:focus { outline: none; border-color: #34d399;');
        expect(src).toContain('@media (pointer: coarse) { .rc-scale { width: 40px !important; height: 40px !important; } }');
        expect(src).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
