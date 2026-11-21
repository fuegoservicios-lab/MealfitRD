/**
 * [P1-PLAN-LOTE-1157 · 2026-11-21] La hoja de rangos (el dueño: «mejora esto en general; en PC no se puede scrollear
 * para abajo»).
 *  1. «Cómo llegar»: los tres ritmos que dan estrellas, con las semanas de cada uno; «a tu ritmo» solo si es razonable
 *     (1 estrella en 9 semanas daba «81 semanas», que desanimaba y se leía como un dato tuyo).
 *  2. Las reglas de las estrellas ya van en ese plan; en la cima, solas.
 *  3. En PC: dos columnas, barra visible con ratón, cuerpo enfocable y fundido mientras queda algo debajo.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EscaleraDeRangos } from '../components/dashboard/EscaleraDeRangos';
import { semanasPorRitmo, RITMO_PROPIO_MAX_SEMANAS } from '../utils/caminoDeRangos';

const CSS = readFileSync(resolve(process.cwd(), 'src/components/dashboard/EscaleraDeRangos.module.css'), 'utf8');

describe('[1157] cómo llegar', () => {
    it('tres ritmos: 7 días → 3 ★, 5 → 2 ★, 3 → 1 ★ por semana', () => {
        expect(semanasPorRitmo(9).map((r) => [r.dias, r.semanas])).toEqual([[7, 3], [5, 5], [3, 9]]);
        expect(semanasPorRitmo(0)).toEqual([]);
        expect(RITMO_PROPIO_MAX_SEMANAS).toBe(52);
    });

    it('el caso de la captura (1 ★, 9 semanas cerradas): el plan sí, «81 semanas» no', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={1} semanasCerradas={9} />);
        const plan = within(screen.getByText('Cómo llegar').nextElementSibling);
        expect(plan.getByText('7 días en meta por semana')).toBeTruthy();
        expect(plan.getByText('en 3 semanas')).toBeTruthy();
        expect(plan.getByText('en 9 semanas')).toBeTruthy();
        expect(screen.queryByText(/81/)).toBeNull();
        expect(screen.getByText('Las estrellas no se pierden: un día flojo solo deja de sumar.')).toBeTruthy();
        // las reglas sueltas ya no se repiten debajo
        expect(screen.queryByText('Cómo se ganan las estrellas')).toBeNull();
    });

    it('en la cima, las reglas siguen', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={120} semanasCerradas={40} />);
        expect(screen.getByText('Cómo se ganan las estrellas')).toBeTruthy();
        expect(screen.queryByText('Cómo llegar')).toBeNull();
    });
});

describe('[1157] en PC se puede bajar', () => {
    it('el cuerpo se enfoca (teclado) y con ratón la barra se ve', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={1} semanasCerradas={9} />);
        const body = document.querySelector('[role="dialog"] [class*="body"]');
        expect(body.getAttribute('tabindex')).toBe('0');
        expect(CSS).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.body \{ scrollbar-width: thin;/);
    });
    it('dos columnas en pantallas anchas y fundido sobre el pie mientras queda algo', () => {
        expect(CSS).toMatch(/@media \(min-width: 900px\) \{[^}]*\.sheet \{ max-width: 780px; \}\s*\.body \{ display: grid; grid-template-columns: 1fr 1fr;/);
        expect(CSS).toContain(".sheet[data-mas='si'] .pie::before");
        expect(document.querySelectorAll('[class*="columna"]').length).toBe(0);   // cerrada: nada
    });
});
