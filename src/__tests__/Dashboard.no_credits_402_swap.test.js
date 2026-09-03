// [P3-NO-CREDITS-402-SWAP · 2026-09-03] Auditoría de créditos antes de producción: si el 402 del
// paywall se colaba en mitad de un cambio de plato (la pre-validación del botón es un cache de
// 120 s), el aviso decía «No se pudo conectar con la IA · Se usó una receta alternativa local»
// — culpaba a la red y prometía una receta que no existe. En el día completo, «Inténtalo de
// nuevo en un momento». Ahora ambos muestran el aviso de créditos (fecha de renovación +
// «Mejorar plan»), el MISMO que el botón «Sin créditos» (P2-NO-CREDITS-CTA).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const DASH = read('src/pages/Dashboard.jsx');
const CTX = read('src/context/AssessmentContext.jsx');

describe('402 en cambiar plato y actualizar día', () => {
    it('cambiar plato: el 402 muestra el aviso de créditos y la descripción genérica ya no miente', () => {
        const i = DASH.indexOf("console.error('Error al regenerar:', error);");
        expect(i).toBeGreaterThan(0);
        const block = DASH.slice(i, i + 900);
        expect(block).toContain('if (error?.status === 402) { _noCreditsToast(); return; }');
        expect(block.indexOf('error?.status === 402')).toBeLessThan(block.indexOf("toast.error(t('No se pudo conectar con la IA')"));
        expect(block).toContain("toast.error(t('No se pudo conectar con la IA'), { description: t('Inténtalo de nuevo.') });");
        expect(DASH).not.toContain('Se usó una receta alternativa local');
        // el error que llega trae el status del backend
        expect(CTX).toContain('err.status = response.status;');
    });
    it('actualizar día: el contexto devuelve status 402 sin toast y el Dashboard muestra el de créditos', () => {
        expect(CTX).toContain('if (resp.status === 402) return { ok: false, status: 402 };');
        const i = CTX.indexOf('if (resp.status === 402) return { ok: false, status: 402 };');
        expect(CTX.slice(i, i + 200)).toContain("toast.error(t('No se pudo actualizar el día'), { description: t('Inténtalo de nuevo en un momento.') });");
        expect(DASH.split('const _rd = await regenerateDay(writableIdx, optionId);').length - 1, 'las dos ramas del día').toBe(2);
        expect(DASH.split('if (_rd?.status === 402) _noCreditsToast();').length - 1).toBe(2);
    });
    it('catálogos: la clave huérfana salió y la reutilizada existe en los 4 idiomas', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['Se usó una receta alternativa local.'], loc).toBeUndefined();
            expect(cat['Inténtalo de nuevo.'], loc).toBeTruthy();
            expect(cat['Sin créditos este mes'], loc).toBeTruthy();
        }
    });
});
