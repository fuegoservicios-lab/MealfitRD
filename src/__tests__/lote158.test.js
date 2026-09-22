// [P1-PLAN-LOTE-158 · 2026-09-22] `fantasma`: la respuesta al ratón del botón secundario.
//
// El dueño, sobre «Ahora no» (la tarjeta «¿Quieres que la IA te arme el plan?» del contador):
// «el sombreado al pasar el mouse por encima no me gusta, quiero algo que le quede y se vea
// mejor».
//
// Llevaba `fila`, y `fila` está pensado para una FILA: velo tenue MÁS un anillo de 1 px que
// dibuja el contorno. En una lista ese anillo es lo que te dice dónde empieza y acaba lo que
// vas a pulsar; en un botón, que ya tiene forma propia, es un recuadro gris que aparece de la
// nada — y en el «Cancelar» del diálogo, que YA trae `1px solid var(--border)`, le pintaba un
// segundo borde pegado al primero.
//
// Lo que un botón secundario necesita decir no es «aquí están mis límites» —ya se ven— sino
// «sí, esto se pulsa»: la superficie se insinúa y el TEXTO sube a primer plano. Medido en el
// arnés con las reglas reales y los tokens del tema oscuro: con `fila` el rótulo se queda en
// `rgb(148,163,184)` (gris apagado); con `fantasma` pasa a `rgb(241,245,249)`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '..', '..');
const leer = (rel) => fs.readFileSync(path.resolve(raiz, rel), 'utf-8');

const bloqueDe = (css, variante) => {
    const i = css.indexOf(`[data-hover="${variante}"]:not(:disabled):hover {`);
    expect(i, `no existe la variante ${variante}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
};

describe('[P1-PLAN-LOTE-158] la variante `fantasma`', () => {
    const css = leer('src/index.css');

    it('existe y sube el texto a primer plano: la señal que `fila` no daba', () => {
        const b = bloqueDe(css, 'fantasma');
        expect(b).toContain('color: var(--text-main)');
    });

    it('NO dibuja el anillo de contorno — eso es lo que sobraba', () => {
        const b = bloqueDe(css, 'fantasma');
        // El velo es una sombra INTERIOR (`inset`); el anillo de `fila` es una sombra exterior
        // de 1 px. Si reaparece una segunda sombra sin `inset`, el recuadro ha vuelto.
        expect(b).toContain('inset 0 0 0 999px');
        expect(b).not.toMatch(/,\s*0 0 0 1px/);
    });

    it('el velo es más fuerte que el de `fila`: un botón es más superficie que una fila', () => {
        expect(bloqueDe(css, 'fantasma')).toContain('--text-main) 9%');
        expect(bloqueDe(css, 'fila')).toContain('--text-main) 6%');
    });

    it('aviva el borde propio si lo hay, sin inventar uno si no lo hay', () => {
        // `border-color` sobre un control con `border: 0` es inerte, así que la misma regla
        // sirve para el «Ahora no» (sin borde) y para el «Cancelar» (con borde).
        expect(bloqueDe(css, 'fantasma')).toContain('border-color: color-mix(in srgb, var(--text-main) 28%, var(--border))');
    });

    it('no mueve nada: sigue valiendo P2-HOVER-NO-MOTION', () => {
        const b = bloqueDe(css, 'fantasma');
        expect(b).not.toContain('transform');
        expect(b).not.toContain('translate');
    });

    it('`fila` se queda como estaba: las filas SÍ necesitan su anillo', () => {
        const b = bloqueDe(css, 'fila');
        expect(b).toContain('0 0 0 1px color-mix(in srgb, var(--text-light) 55%, transparent)');
    });
});

describe('[P1-PLAN-LOTE-158] quién la usa', () => {
    it('los dos «Ahora no» de la tarjeta del contador', () => {
        const src = leer('src/components/dashboard/DashboardTracking.jsx');
        // Son dos ofertas distintas (encender el plan y reanudar el pausado) y las dos tienen
        // su descarte. La de reanudar no tenía ninguna variante: no contestaba al ratón.
        expect((src.match(/data-hover="fantasma"/g) || []).length).toBe(2);
        expect(src).not.toContain('data-hover="fila"');
    });

    it('el «Cancelar» del diálogo de confirmación', () => {
        const dlg = leer('src/components/common/ConfirmDialog.jsx');
        expect(dlg).toMatch(/data-hover="fantasma"\s+onClick=\{onCancel\}/);
        expect(dlg).toMatch(/data-hover="boton"\s+onClick=\{onConfirm\}/);
    });

    it('cada uno con su propio radio: el velo es una sombra y toma la forma del elemento', () => {
        // Es el mismo guard del 151, aplicado a los controles que cambian de variante aquí.
        expect(leer('src/components/dashboard/DashboardTracking.module.css'))
            .toMatch(/\.turnOnGhost\s*\{[^}]*border-radius:/);
        expect(leer('src/components/common/ConfirmDialog.jsx'))
            .toMatch(/borderRadius: '0\.8rem'/);
    });
});
