// [P3-HISTORY-COUNT-CORNER · 2026-09-02] El conteo del Historial es una etiqueta esquinada, no una pildora centrada.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Historial: conteo de planes', () => {
    it('movil: etiqueta a la izquierda con la tipografia del divisor, sin contenedor centrado', () => {
        const src = read('src/components/history/HistoryMobilePanel.jsx');
        expect(src).toContain('data-testid="history-count-label"');
        expect(src).toContain('<span style={bucketLabel}>{tn(total, "{n} plan nutricional"');
        expect(src).not.toContain('{/* pastilla de conteo (centrada) */}');
        expect(src).not.toMatch(/justifyContent: "center" \}\}>\s*<span style=\{countPill\}/);
    });
    it('escritorio: mismo tratamiento discreto (sin fondo de acento)', () => {
        const src = read('src/components/history/HistoryDesktopPanel.jsx');
        const i = src.indexOf('data-testid="history-count-label"');
        expect(i).toBeGreaterThan(-1);
        const win = src.slice(i, i + 400);
        expect(win).toContain('textTransform: "uppercase"');
        expect(win).not.toContain('color-mix(in srgb, var(--primary) 13%');
    });
});
