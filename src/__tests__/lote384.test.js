// [P1-PLAN-LOTE-384 · 2026-09-26] El componedor no tira lo que estás escribiendo ni se cierra a media escritura.
//
// Auditoría de «Registrar comida»:
//   10. Con líneas en el plato y un «Macros a mano» o un «Descríbelo» abiertos sin añadir, «Registrar» guardaba SIN ese
//       borrador, en silencio. Ahora «Registrar» espera y el pie dice por qué.
//   · Mientras registra, la hoja se podía cerrar (fondo o X) — el escáner no lo permite: ahora tampoco.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '..', 'components/dashboard/LogMealModal.jsx'), 'utf8').replace(/\r\n/g, '\n');

describe('[384] borradores y cierre', () => {
    it('con un borrador abierto, «Registrar» espera y el pie lo dice', () => {
        expect(src).toContain("const borradorAbierto = !!customDraft || !!String(describiendo?.texto || '').trim();");
        expect(src).toContain('disabled={!lines.length || saving || borradorAbierto}');
        expect(src).toContain("t('Añade o cancela lo que estás escribiendo para registrar.')");
        expect(src).toContain('if (!lines.length || saving || borradorAbierto) return;');
    });

    it('mientras registra no se cierra', () => {
        expect(src).toContain('useModalAccessibility({ isOpen: true, onClose, disableClose: saving })');
        expect(src).toContain('onClick={saving ? undefined : onClose}');
        expect(src).toContain("onClick={onClose} disabled={saving} aria-label={t('Cerrar')}");
    });
});
