// [P1-COACH-QUOTA-METER · 2026-09-02] El medidor mensual del coach: mismo lenguaje de color que créditos.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CoachQuotaMeter from '../components/agent/CoachQuotaMeter.jsx';

const q = (used, limit) => ({ used, limit, remaining: limit - used, resets_at: '2026-10-01T00:00:00+00:00' });

describe('CoachQuotaMeter', () => {
    it('sano por debajo del 80 % usado', () => {
        render(<CoachQuotaMeter quota={q(12, 60)} />);
        const el = screen.getByRole('img');
        expect(el.getAttribute('data-state')).toBe('healthy');
        expect(el.textContent).toContain('48');
        expect(el.textContent).toContain('Mensajes');
        expect(el.getAttribute('aria-label')).toMatch(/48 de 60 mensajes del coach este mes/);
    });
    it('ambar desde el 80 % usado', () => {
        render(<CoachQuotaMeter quota={q(48, 60)} />);
        expect(screen.getByRole('img').getAttribute('data-state')).toBe('low');
    });
    it('rojo solo en 0 restante', () => {
        render(<CoachQuotaMeter quota={q(60, 60)} />);
        expect(screen.getByRole('img').getAttribute('data-state')).toBe('depleted');
    });
    it('sin cuota no renderiza', () => {
        const { container } = render(<CoachQuotaMeter quota={null} />);
        expect(container.firstChild).toBeNull();
    });
    it('AgentPage lee la cuota, pinta el medidor y enriquece el 402 con la fecha de renovacion', () => {
        const src = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8');
        expect(src).toContain("fetchWithAuth('/api/chat/quota')");
        expect(src).toContain('<CoachQuotaMeter quota={coachQuota}');
        expect(src).toContain("response.headers.get('X-Coach-Quota-Resets-At')");
        expect(src).toContain('userMessage: _quotaMessage');
    });
});
