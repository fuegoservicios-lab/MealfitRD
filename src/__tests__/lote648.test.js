// [P1-PLAN-LOTE-648 · 2026-09-27] Dos restos en español para quien usa la app en otro idioma (auditoría de idiomas):
//   · «Actualizar día → No me gustan»: la lista de platos que se bloquearán pintaba `m.name` (el canónico español)
//     en el aviso y en la hoja de confirmación, aunque el plan ya estuviera traducido;
//   · el modal «Tu Nevera no alcanza» escribía las cantidades con `toFixed` («1.5») en francés, portugués e italiano.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('[648] platos y cantidades en el idioma del usuario', () => {
    it('la lista de platos a bloquear usa el nombre traducido', () => {
        const src = leer('pages/Dashboard.jsx');
        expect(src).not.toContain("currentDayMeals.map(m => m.name).join(', ')");
        expect(src).toContain("currentDayMeals.map(m => mealDisplayName(m, _dashLocale) || m.name).join(', ')");
        expect(src).not.toMatch(/fontSize: '0\.82rem' \}\}>\{m\.name\}<\/li>/);
    });

    it('la cantidad del modal de la Nevera sale con el separador decimal del idioma', () => {
        const src = leer('components/common/PantryConsentModal.jsx');
        expect(src).not.toContain('qty.toFixed(1)');
        expect(src).toContain('formatNumber(qty, { maximumFractionDigits: 1 })');
    });
});
