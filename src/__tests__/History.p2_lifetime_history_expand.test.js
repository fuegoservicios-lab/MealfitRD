// [P2-HIST-NEW-5 · 2026-05-09] Tests del toggle "Ver todos" / "Ver
// menos" del bloque "Historial reciente por chunk" (tab Lecciones).
//
// Bug original (audit profundo Historial 2026-05-09):
//   El bloque renderizaba `_history.slice(0, 5)` con counter "5 de N"
//   pero NO había botón para expandir y ver el resto. Surface
//   incompleto para planes con >5 entries — un plan tier ultra de
//   90 días puede tener 13+ chunks, todos visibles solo en el tab
//   Métricas pero no agregados aquí.
//
// Fix:
//   State `lifetimeHistoryExpanded` (bool single, no per-plan)
//   reset a false cuando selectedPlan cambia. Botón "Ver todos los N"
//   (colapsado) → "Ver menos" (expandido). Default colapsado a 5.
//
// Cobertura:
//   1. Anchor del marker.
//   2. State `lifetimeHistoryExpanded` declarado con default false.
//   3. useEffect resetea expansión cuando selectedPlan?.id cambia.
//   4. Slice dinámico: top 5 colapsado, full array expandido.
//   5. Botón solo render cuando _history.length > 5.
//   6. Copy es-DO: "Ver todos los N" / "Ver menos".
//   7. aria-expanded refleja el state (a11y).
//   8. CSS .lifetimeHistoryToggle declarado.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const css = readFileSync(_CSS_PATH, 'utf8');


describe('[P2-HIST-NEW-5] anchor + state setup', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-NEW-5\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(css).toMatch(/\[P2-HIST-NEW-5\s*·\s*2026-05-09\]/);
    });

    it('state lifetimeHistoryExpanded declarado con default false', () => {
        expect(src).toMatch(
            /\[lifetimeHistoryExpanded,\s*setLifetimeHistoryExpanded\]\s*=\s*useState\(\s*false\s*\)/
        );
    });
});


describe('[P2-HIST-NEW-5] reset cross-plan via useEffect', () => {
    it('useEffect resetea expansión a false', () => {
        // Sin reset, abrir A → expandir → cerrar → abrir B mostraría
        // B con state expandido por accidente.
        const idx = src.indexOf('Reset de la expansión del lifetime');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 800);
        expect(block).toMatch(/setLifetimeHistoryExpanded\(\s*false\s*\)/);
    });

    it('deps del useEffect = [selectedPlan?.id]', () => {
        // El reset debe dispararse al CAMBIAR el plan abierto.
        // selectedPlan?.id maneja el caso null (modal cerrado) sin
        // crash.
        const idx = src.indexOf('Reset de la expansión del lifetime');
        const block = src.slice(idx, idx + 800);
        expect(block).toMatch(/\[selectedPlan\?\.id\]/);
    });
});


describe('[P2-HIST-NEW-5] slice dinámico según expansión', () => {
    it('declara _COLLAPSED_CAP = 5 (no magic number)', () => {
        const idx = src.indexOf('lifetimeHistoryExpanded;');
        // Buscar dentro del bloque del IIFE.
        const blockStart = src.lastIndexOf('// [P2-HIST-NEW-5', idx);
        const block = src.slice(blockStart, blockStart + 3000);
        expect(block).toMatch(/_COLLAPSED_CAP\s*=\s*5/);
    });

    it('_visible = expandido ? full : slice(0, _COLLAPSED_CAP)', () => {
        const idx = src.indexOf('lifetimeHistoryExpanded;');
        const blockStart = src.lastIndexOf('// [P2-HIST-NEW-5', idx);
        const block = src.slice(blockStart, blockStart + 3000);
        expect(block).toMatch(/_expanded\s*\n?\s*\?\s*_history\s*\n?\s*:\s*_history\.slice\(\s*0\s*,\s*_COLLAPSED_CAP\s*\)/);
    });

    it('_canExpand = _history.length > _COLLAPSED_CAP', () => {
        // Solo render del botón cuando hay más de 5 entries.
        const idx = src.indexOf('lifetimeHistoryExpanded;');
        const blockStart = src.lastIndexOf('// [P2-HIST-NEW-5', idx);
        const block = src.slice(blockStart, blockStart + 3000);
        expect(block).toMatch(/_canExpand\s*=\s*_history\.length\s*>\s*_COLLAPSED_CAP/);
    });
});


describe('[P2-HIST-NEW-5] botón toggle', () => {
    it('render condicional: solo si _canExpand', () => {
        // Plan con ≤5 entries no debe mostrar botón inerte.
        const idx = src.indexOf('lifetimeHistoryToggle');
        expect(idx).toBeGreaterThan(-1);
        const blockStart = src.lastIndexOf('{_canExpand &&', idx);
        expect(blockStart).toBeGreaterThan(-1);
    });

    it('copy es-DO: "Ver menos" expandido / "Ver todos los N" colapsado', () => {
        const idx = src.indexOf('lifetimeHistoryToggle');
        const block = src.slice(Math.max(0, idx - 200), idx + 1500);
        // Ternario _expanded ? 'Ver menos' : `Ver todos los ${N}`.
        expect(block).toMatch(/_expanded[\s\S]*?\?\s*['"]Ver menos['"]/);
        expect(block).toMatch(/Ver todos los\s+\$\{_history\.length\}/);
    });

    it('aria-expanded refleja el state booleano', () => {
        // a11y: screen readers deben anunciar el estado.
        const idx = src.indexOf('lifetimeHistoryToggle');
        const block = src.slice(idx, idx + 1500);
        expect(block).toMatch(/aria-expanded=\{_expanded\}/);
    });

    it('onClick toggles via setter functional update', () => {
        // setLifetimeHistoryExpanded((prev) => !prev) — funcional para
        // garantizar el flip correcto si React hace batching.
        const idx = src.indexOf('lifetimeHistoryToggle');
        const block = src.slice(idx, idx + 1500);
        expect(block).toMatch(
            /setLifetimeHistoryExpanded\(\s*\(\s*prev\s*\)\s*=>\s*!prev\s*\)/
        );
    });

    it('button type="button" (no submit accidental dentro de form)', () => {
        const idx = src.indexOf('lifetimeHistoryToggle');
        const block = src.slice(Math.max(0, idx - 200), idx + 1500);
        expect(block).toMatch(/type=['"]button['"]/);
    });
});


describe('[P2-HIST-NEW-5] CSS lifetimeHistoryToggle', () => {
    it('declara la clase .lifetimeHistoryToggle', () => {
        expect(css).toMatch(/\.lifetimeHistoryToggle\s*\{/);
    });

    it('estilo link-like (transparent bg, border:none, underline)', () => {
        const idx = css.indexOf('.lifetimeHistoryToggle');
        const block = css.slice(idx, idx + 1000);
        expect(block).toMatch(/background\s*:\s*transparent/);
        expect(block).toMatch(/border\s*:\s*none/);
        expect(block).toMatch(/text-decoration\s*:\s*underline/);
    });

    it('focus-visible outline para a11y keyboard', () => {
        // Sin focus-visible outline, el botón es invisible al
        // navegar con Tab → fail WCAG 2.1 SC 2.4.7.
        const idx = css.indexOf('.lifetimeHistoryToggle');
        const block = css.slice(idx, idx + 1500);
        expect(block).toMatch(/:focus-visible/);
        expect(block).toMatch(/outline\s*:/);
    });
});
