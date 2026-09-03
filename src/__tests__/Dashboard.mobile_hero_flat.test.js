// [P2-MOBILE-HERO-FLAT · 2026-09-03] En móvil el panel se sentía estrecho por la tarjeta-dentro-
// de-tarjeta: el hero (borde + radio + 16px) contenía créditos, ventana, acciones y aviso, y los
// tres contadores de micronutrientes iban apilados uno por fila. A ≤480px el hero es sección a
// sangre y los contadores van 3 en fila. El escritorio no cambia.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const DASH = read('src/pages/Dashboard.jsx');
const MICRO = read('src/components/dashboard/MicronutrientMeter.module.css');

describe('hero del panel en móvil', () => {
    it('a ≤480px el hero pierde el marco y el padding lateral, en los DOS temas y después del override oscuro', () => {
        const dark = DASH.indexOf('html[data-theme="dark"] .dashboard-header {\n                    background: var(--bg-card);');
        expect(dark).toBeGreaterThan(0);
        const i = DASH.indexOf('[P2-MOBILE-HERO-FLAT');
        expect(i).toBeGreaterThan(dark);   // la cascada: la regla móvil va DESPUÉS del override oscuro
        const block = DASH.slice(i, i + 1400);
        expect(block).toContain('@media (max-width: 480px) {');
        expect(block).toContain('.dashboard-header,\n                    html[data-theme="dark"] .dashboard-header {');
        expect(block).toContain('background: transparent;');
        expect(block).toContain('border: none;');
        expect(block).toContain('padding: 0.25rem 0 0.5rem;');
        expect(block).toContain('border-radius: 0;');
    });
    it('el escritorio conserva su tarjeta', () => {
        const base = DASH.slice(DASH.indexOf('.dashboard-header {'), DASH.indexOf('.dashboard-header {') + 1200);
        expect(base).toContain('border-radius: 2rem;');
        expect(base).toContain('padding: 2rem;');
    });
});

describe('contadores de micronutrientes en móvil', () => {
    it('tres en una fila, número sobre etiqueta', () => {
        const i = MICRO.indexOf('@media (max-width: 560px) {');
        const block = MICRO.slice(i, i + 900);
        expect(block).not.toContain('.stat { min-width: 100%; }');
        expect(block).toContain('min-width: 0; flex: 1 1 0; flex-direction: column;');
    });
});
