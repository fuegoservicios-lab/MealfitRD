// [P1-PLAN-LOTE-368 · 2026-09-26] «¿Qué comiste?» sin el destello de Gemini.
//
// El dueño: «no me gusta que tenga el svg de Gemini, cámbialos los dos por otros que representen, y el botón de
// "Estimar macros por mí" también se ve feíto». El destello (`Sparkles`) salía en la tarjeta «Descríbelo y lo calculo» y
// en el botón de estimar. Ahora cada uno dice lo que hace: un globo con texto (describir con palabras) y una
// calculadora (calcular las macros); las dos formas llevan su icono en una pastilla tintada; y el botón de estimar es un
// botón tintado de verdad —no un contorno que parecía apagado— con el cursor correcto cuando falta el nombre.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('[368] iconos de «¿Qué comiste?»', () => {
    const jsx = leer('components/dashboard/LogMealModal.jsx');
    const css = leer('components/dashboard/LogMealModal.module.css');

    it('sin el destello; cada acción con su icono', () => {
        expect(jsx).not.toMatch(/\bSparkles\b/);
        expect(jsx).toContain('<MessageSquareText size={18} aria-hidden="true" />');
        expect(jsx).toContain('<Calculator size={16} aria-hidden="true" />');
        expect(jsx).toContain('<PenLine size={18} aria-hidden="true" />');
    });

    it('los iconos de las formas van en una pastilla tintada', () => {
        expect(jsx.match(/className=\{styles\.formaIcono\}/g)).toHaveLength(2);
        expect(css).toMatch(/\.formaIcono\s*\{[^}]*color-mix\(in srgb, var\(--primary\)/);
    });

    it('el botón de estimar es tintado (no un contorno) y sin nombre no pone el cursor de «esperando»', () => {
        const regla = css.match(/^\.estimateBtn\s*\{[^}]*\}/m)[0];
        expect(regla).toMatch(/background: color-mix\(in srgb, var\(--primary-fill, #4F46E5\) 14%, transparent\)/);
        expect(regla).toMatch(/border: 1px solid transparent/);
        expect(css).toContain('.estimateBtn:disabled { opacity: 0.5; cursor: not-allowed; }');
        expect(css).toContain(".estimateBtn[aria-busy='true'] { cursor: wait; opacity: 0.8; }");
        expect(jsx).toContain('aria-busy={estimating}');
    });
});
