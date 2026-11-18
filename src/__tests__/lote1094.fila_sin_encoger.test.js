// [P1-PLAN-LOTE-1094 · 2026-11-18] «No quiero que al presionarlo haga esa animación tan extraña»: la fila de una comida en
// Progreso se encogía por dentro (el 0,97 común de 1064) mientras la tarjeta seguía quieta. Una fila se ilumina, no se encoge.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'TrackingProgress.module.css'), 'utf8');

describe('[1094] la fila de una comida al pulsarla', () => {
    it('no se encoge y sí se ilumina', () => {
        expect(css).toMatch(/\.mealOpen:active:not\(:disabled\) \{ transform: none; \}/);
        expect(css).toMatch(/\.mealOpen:active:not\(:disabled\) \{ background:/);
    });
    it('el encogido común sigue con especificidad cero (la clase del módulo le gana)', () => {
        const idx = readFileSync(resolve(__dirname, '..', 'index.css'), 'utf8');
        expect(idx).toMatch(/:where\(button:not\(:disabled\):active/);
    });
});
