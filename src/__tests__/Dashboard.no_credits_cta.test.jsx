// [P2-NO-CREDITS-CTA · 2026-09-02] Al límite de créditos: un aviso claro, sin navegar a la Nevera
// ni abrir el modal, sin brillo de hover; y el CTA de la Nevera con el mismo hover que los demás.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// sin regex de escapes: se quitan los CR con el código del carácter (13)
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('Dashboard: botón sin créditos', () => {
    const src = read('src/pages/Dashboard.jsx');
    it('la comprobación de créditos va ANTES que la de Nevera vacía y no navega', () => {
        // el handler del clic (no el validador async, que también llama al aviso)
        const marker = src.indexOf('Créditos ANTES que Nevera');
        expect(marker).toBeGreaterThan(-1);
        const i = src.indexOf('_noCreditsToast();', marker);
        const j = src.indexOf("navigate('/dashboard/pantry');", i);
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
        const between = src.slice(i, j);
        expect(between).toContain('return;');
        expect(between).toContain('if (planFinished) {');
    });
    it('etiqueta «Sin créditos» y sin sombra de hover/active en ese estado', () => {
        expect(src).toContain("? t('Sin créditos')");
        expect(src).not.toContain("t('Límite')");
        const h = src.indexOf("'--hover-shadow': isLimitReached");
        expect(h).toBeGreaterThan(-1);
        expect(src.slice(h, h + 120)).toContain("? 'none'");
        expect(src).toContain('.new-plan-btn:hover:not(:disabled):not([aria-disabled="true"])');
    });
    it('el aviso dice cuándo se renuevan y ofrece Mejorar plan salvo en nativo', () => {
        expect(src).toContain("toast.error(t('Sin créditos este mes'), {");
        expect(src).toContain("t('Se renuevan el {fecha}.', { fecha: _fecha })");
        expect(src).toContain("nativeHidesCommerce() ? {} : { action: { label: t('Mejorar plan')");
        expect(src).toContain("timeZone: 'UTC'");
        expect(src).not.toContain('No tienes créditos de regeneración disponibles.');
    });
});

describe('RestockNudge: hover uniforme', () => {
    it('el CTA «Sí, ya compré» tiene sombra de hover y estado activo como los demás', () => {
        const src = read('src/components/dashboard/RestockNudge.jsx');
        expect(src).toContain('.restock-nudge-cta:hover:not(:disabled) {');
        expect(src).toContain('.restock-nudge-cta:active:not(:disabled) {');
        const h = src.indexOf('.restock-nudge-cta:hover:not(:disabled) {');
        expect(src.slice(h, h + 160)).toContain('box-shadow: 0 14px 30px -8px rgba(16, 185, 129, 0.45)');
    });
});
