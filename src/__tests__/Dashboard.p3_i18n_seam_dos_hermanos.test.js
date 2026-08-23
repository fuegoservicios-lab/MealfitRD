/**
 * [P3-I18N-SEAM-NOMBRE-CANONICO-DOS-HERMANOS · 2026-08-23] El cierre de
 * `P3-I18N-SEAM-NOMBRE-CANONICO-EN-MODALES` arregló UN aviso («{plato} registrado») y dejó dos
 * en la misma tarjeta: el toast «Aprenderemos que te gusta: {plato}» y el `aria-label` del
 * botón «Me lo comí» — el nombre accesible que un lector de pantalla lee en voz alta, en
 * español, sobre una tarjeta en francés. Los tres pasan ahora por `mealDisplayName`.
 * `meal.name` sigue siendo el identificador del motor (`likedMeals[meal.name]`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('[P3-I18N-SEAM-NOMBRE-CANONICO-DOS-HERMANOS]', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Dashboard.jsx'), 'utf8');

    it('ningún aviso ni nombre accesible interpola `plato: meal.name` a pelo', () => {
        const crudos = src.match(/\{ plato: meal\.name \}/g) || [];
        expect(crudos, 'vuelve el canónico en un sitio que se pinta').toEqual([]);
    });

    it('los dos hermanos usan el nombre que la tarjeta pinta', () => {
        expect(src).toMatch(/t\('Aprenderemos que te gusta: \{plato\}', \{ plato: mealDisplayName\(meal, _dashLocale\) \|\| meal\.name \}\)/);
        expect(src).toMatch(/aria-label=\{t\('Registrar que te comiste \{plato\}', \{ plato: mealDisplayName\(meal, _dashLocale\) \|\| meal\.name \}\)\}/);
    });

    it('el identificador del motor no se toca: likedMeals sigue indexado por meal.name', () => {
        expect(src).toMatch(/likedMeals\[meal\.name\]/);
    });
});
