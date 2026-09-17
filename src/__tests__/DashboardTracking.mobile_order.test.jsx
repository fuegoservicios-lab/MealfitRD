// [P1-PLAN-LOTE-87 · 2026-09-17] En el teléfono, la invitación «¿Quieres que la IA te arme el plan?» va
// la primera y la tarjeta de macros recupera aire. El orden lo decide la rejilla por áreas: la invitación es
// hija DIRECTA de `.page` (no vive dentro de la columna lateral), así que `grid-template-areas` puede
// ponerla arriba en móvil y bajo la hidratación en escritorio.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('contador en el teléfono', () => {
    it('la invitación al plan es hija directa de la rejilla y va primera en móvil', () => {
        const jsx = src('src/components/dashboard/DashboardTracking.jsx');
        const sideCol = jsx.slice(jsx.indexOf('className={styles.sideCol}'), jsx.indexOf('className={styles.turnOnSlot}'));
        expect(sideCol).not.toContain('<TurnOnPlanCard');
        expect(jsx).toContain('<div className={styles.turnOnSlot}>');
        const css = src('src/components/dashboard/DashboardTracking.module.css');
        expect(css.replace(/\s+/g, ' ')).toContain('grid-template-areas: "main side" "main plan";');
        expect(css.replace(/\s+/g, ' ')).toContain('grid-template-areas: "plan" "main" "side";');
        expect(css).toContain('.turnOnSlot { grid-area: plan;');
    });

    it('la tarjeta de macros ya no va apretada en 480px', () => {
        const css = src('src/components/dashboard/TrackingProgress.module.css');
        const i = css.indexOf('@media (max-width: 480px) {');
        const block = css.slice(i, css.indexOf('\n}\n', i));
        expect(block).toContain('padding: 1.15rem;');
        expect(block).toContain('gap: 1.3rem;');
        expect(block).not.toContain('padding: 1rem;');
    });
});
