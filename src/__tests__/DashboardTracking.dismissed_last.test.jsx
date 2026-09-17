// [P1-PLAN-LOTE-91 · 2026-09-17] Descartada, la invitación al plan NO encabeza el contador en el teléfono.
//
// El dueño, con captura tras pulsar «Ahora no»: «se puso raro lo del progreso en tiempo real». Medido en el arnés a 392px:
// la tarjeta colapsa a un enlace tenue de 27px que se quedaba PRIMERO y, desde que las secciones van sin marco (lote 88),
// a 24px del título se leía como una línea del propio «Progreso en Tiempo Real». Ahora cierra la pantalla, con su hairline.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

const sinComentarios = (css) => {
    let out = '';
    let i = 0;
    for (;;) {
        const a = css.indexOf('/*', i);
        if (a < 0) return out + css.slice(i);
        out += css.slice(i, a);
        const b = css.indexOf('*/', a + 2);
        if (b < 0) return out;
        i = b + 2;
    }
};

const CSS = () => sinComentarios(src('src/components/dashboard/DashboardTracking.module.css'));
const bloque = (css, cabecera) => {
    const i = css.indexOf(cabecera);
    expect(i).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('\n}\n', css.indexOf('{', i))).split(/\s+/).join(' ');
};

describe('la invitación descartada no encabeza', () => {
    it('en ≤900px las áreas se reordenan cuando el hueco lleva el ENLACE (no la tarjeta)', () => {
        const css = CSS();
        const movil = bloque(css, '@media (max-width: 900px) {');
        // el orden de siempre (tarjeta sin descartar) sigue poniéndola primera — lote 87
        expect(movil).toContain('grid-template-areas: "plan" "main" "side";');
        // y solo con el enlace se va al final
        expect(movil).toContain('.page:has(.turnOnSlot > .turnOnLink) { grid-template-areas: "main" "side" "plan"; }');
        // se reordenan las ÁREAS, no la fila del bloque: una fila vacía seguiría cobrando sus dos huecos
        expect(movil).not.toContain('grid-row:');
        // el escritorio no se toca
        expect(css.slice(0, css.indexOf('@media')).split(/\s+/).join(' ')).toContain('grid-template-areas: "main side" "main plan";');
    });

    it('el enlace cierra con la misma línea fina que separa las secciones; la tarjeta no la lleva', () => {
        const plano = bloque(CSS(), '@media (max-width: 480px) {');
        expect(plano).toContain('.turnOnSlot:has(> .turnOnLink) { border-top: 1px solid var(--border,');
        expect(plano).toContain('padding-top: 1.5rem;');
        expect(plano).not.toContain('.turnOnCard { border-top');
    });

    it('la columna lateral vacía (hidratación apagada) sale del reparto: sin fila fantasma', () => {
        const css = CSS();
        expect(css.split(/\s+/).join(' ')).toContain('.sideCol:empty { display: none; }');
        // y la línea de la hidratación sigue condicionada a que haya algo
        expect(css).toContain('.sideCol:not(:empty) {');
    });
});
