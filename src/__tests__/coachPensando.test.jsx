// [COACH-EMBLEMA · 2026-11-13] La fila de espera del coach dice solo cosas ciertas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CoachPensando from '../components/agent/CoachPensando';

describe('CoachPensando', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('sin estado del servidor, la frase sigue al tiempo y no inventa pasos', () => {
        render(<CoachPensando status={null} />);
        expect(screen.getByText('Leyendo tu mensaje…')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(4000); });
        expect(screen.getByText('Pensando la respuesta…')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(8000); });
        expect(screen.getByText('Sigo en ello…')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(15000); });
        expect(screen.getByText('Está tardando más de lo normal…')).toBeTruthy();
        // las frases por tiempo no son pasos: ninguna queda marcada como cumplida
        expect(document.querySelectorAll('.coach-pensando-hecho').length).toBe(0);
    });

    it('el estado real del servidor manda, y al cambiar queda como paso cumplido', () => {
        const { rerender } = render(<CoachPensando status="Analizando tu mensaje…" />);
        expect(screen.getByText('Analizando tu mensaje…')).toBeTruthy();
        rerender(<CoachPensando status="Anotando lo que comiste…" />);
        expect(screen.getByText('Anotando lo que comiste…')).toBeTruthy();
        const hechos = [...document.querySelectorAll('.coach-pensando-hecho')].map((n) => n.textContent);
        expect(hechos).toEqual(['Analizando tu mensaje']);
    });

    it('el reloj aparece a partir de 5 s', () => {
        render(<CoachPensando status="Analizando tus fotos… puede tardar un minuto" />);
        expect(document.querySelector('.coach-pensando-reloj')).toBeNull();
        act(() => { vi.advanceTimersByTime(6000); });
        expect(document.querySelector('.coach-pensando-reloj').textContent).toBe('6 s');
    });

    it('ya no existen las frases de relleno', async () => {
        const fs = await import('node:fs');
        const src = fs.readFileSync('src/pages/AgentPage.jsx', 'utf8');
        for (const f of ['Alineando tu genética', 'respuesta metabólica', 'Inteligencia Nutricional', 'typing-dot']) {
            expect(src.includes(f)).toBe(false);
        }
    });
});
