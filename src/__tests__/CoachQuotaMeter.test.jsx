// [P1-COACH-QUOTA-METER · 2026-09-02 · P2-COACH-QUOTA-MOBILE] El medidor mensual del coach.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CoachQuotaMeter from '../components/agent/CoachQuotaMeter.jsx';
import { coachQuotaState } from '../utils/coachQuota';

const q = (used, limit) => ({ used, limit, remaining: limit - used, resets_at: '2026-10-01T00:00:00+00:00' });

describe('CoachQuotaMeter', () => {
    it('sano por debajo del 80 % usado (pildora)', () => {
        render(<CoachQuotaMeter quota={q(12, 60)} />);
        const el = screen.getByRole('img');
        expect(el.getAttribute('data-state')).toBe('healthy');
        expect(el.getAttribute('data-variant')).toBe('pill');
        expect(el.textContent).toContain('48');
        expect(el.getAttribute('aria-label')).toMatch(/48 de 60 mensajes del coach este mes/);
    });
    it('ambar desde el 80 % usado, rojo solo en 0 restante', () => {
        expect(coachQuotaState(q(48, 60)).state).toBe('low');
        expect(coachQuotaState(q(59, 60)).state).toBe('low');
        expect(coachQuotaState(q(60, 60)).state).toBe('depleted');
        expect(coachQuotaState(null)).toBeNull();
    });
    it('fila del menu (movil) con la fecha de renovacion', () => {
        render(<CoachQuotaMeter quota={q(1, 60)} variant="row" />);
        const el = screen.getByRole('note');
        expect(el.getAttribute('data-variant')).toBe('row');
        expect(el.textContent).toContain('Mensajes');
        expect(el.textContent).toContain('59');
        expect(el.textContent).toMatch(/Se renueva el/);
        // la ventana es UTC: 2026-10-01T00:00Z es el día 1, no el 30 en husos negativos
        expect(el.textContent).toMatch(/ 1 /);
        expect(el.textContent).not.toMatch(/ 30 /);
    });
    it('la linea sobre el cuadro de texto solo aparece cuando queda poco o nada', () => {
        const { container: sano } = render(<CoachQuotaMeter quota={q(1, 60)} variant="caption" onlyWhenLow />);
        expect(sano.firstChild).toBeNull();
        render(<CoachQuotaMeter quota={q(58, 60)} variant="caption" onlyWhenLow />);
        expect(screen.getByRole('status').getAttribute('data-state')).toBe('low');
    });
    it('sin cuota no renderiza', () => {
        const { container } = render(<CoachQuotaMeter quota={null} />);
        expect(container.firstChild).toBeNull();
    });
    it('AgentPage: pildora solo en escritorio, fila en el menu y linea en el composer en movil; 402 con fecha', () => {
        const src = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8');
        expect(src).toContain("fetchWithAuth('/api/chat/quota')");
        expect(src).toContain('{!isMobile && <CoachQuotaMeter quota={coachQuota} />}');
        expect(src).toContain('{isMobile && <CoachQuotaMeter quota={coachQuota} variant="row" />}');
        expect(src).toContain('{isMobile && <CoachQuotaMeter quota={coachQuota} variant="caption" onlyWhenLow />}');
        expect(src).toContain("response.headers.get('X-Coach-Quota-Resets-At')");
        expect(src).toContain('userMessage: _quotaMessage');
        expect(src).toContain("month: 'long', timeZone: 'UTC'");
        expect(src).toContain("border: '1px solid var(--border)',");
    });
});
