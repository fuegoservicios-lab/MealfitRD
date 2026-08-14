/* [P1-RECIPES-DAY-LABEL · 2026-08-14] Recetas dice SIEMPRE qué día estás
 * viendo.
 *
 * «¿Por qué si hoy es viernes, en Recetas no lo dice? En Tu Menú sí».
 *
 * Causa: las pestañas de día se renderizaban con `days.length > 1`. Ayer el
 * plan tenía dos días vivos (jueves y viernes) y las pestañas lo decían; hoy
 * el jueves ya se archivó, queda uno solo, y con la condición falsa la
 * pantalla se queda MUDA: ni pestañas ni ninguna otra mención del día. De paso
 * el encabezado pierde su ancla izquierda y todo el peso cae a la derecha.
 *
 * Y hay un segundo problema que sale al tirar del hilo: el riel dice «Comidas
 * de hoy» SIEMPRE, también cuando eliges otro día de la pestaña. Ahí no es que
 * falte información: es que afirma algo falso. Un plan de varios días permite
 * mirar mañana, y la pantalla seguía llamándolo «hoy».
 *
 * Contrato: el día activo se nombra siempre —como pestaña si hay varios, como
 * etiqueta si es uno solo— y el riel solo dice «hoy» cuando el día activo ES
 * hoy.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const leer = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const limpio = (s) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const VISTAS = [
    ['components/recipes/RecipesView.jsx'],
    ['components/recipes/MobileRecipes.jsx'],
];

describe('[P1-RECIPES-DAY-LABEL] la pantalla nunca se queda muda sobre el día', () => {
    it.each(VISTAS)('%s nombra el día aunque haya UNO solo', (archivo) => {
        const src = limpio(leer(archivo));
        // La condición `days.length > 1` puede seguir gobernando las PESTAÑAS,
        // pero tiene que existir la rama del día único.
        expect(src, 'con un solo día la pantalla no dice cuál es')
            .toMatch(/days\.length\s*===?\s*1|days\.length\s*<\s*2|:\s*\(?\s*<span[^>]*diaUnico|diaUnico/);
    });

    it('el riel solo dice «hoy» cuando el día activo ES hoy', () => {
        const src = limpio(leer('components/recipes/RecipesView.jsx'));
        const i = src.indexOf('railHead');
        expect(i).toBeGreaterThan(-1);
        const bloque = src.slice(Math.max(0, i - 400), i + 300);
        expect(bloque, 'el riel afirma «hoy» sin comprobar si el día activo lo es')
            .toMatch(/esHoy/);
    });

    it('Recipes calcula si cada día es hoy (y no lo adivina la vista)', () => {
        const src = limpio(leer('pages/Recipes.jsx'));
        const i = src.indexOf('const days = chunkDays.map');
        expect(i).toBeGreaterThan(-1);
        const bloque = src.slice(i, i + 900);
        expect(bloque, 'cada día debe saber si es hoy').toMatch(/esHoy/);
        // Comparación por FECHA local, no por índice: el índice del día activo
        // no dice nada sobre el calendario (lección de P1-HIST-DAY-IDENTITY).
        expect(bloque).toMatch(/toDateString\(\)|getDate\(\)/);
    });

    it('la vista recibe el día activo ya resuelto', () => {
        const src = limpio(leer('pages/Recipes.jsx'));
        const i = src.indexOf('const viewProps');
        const bloque = src.slice(i, i + 700);
        expect(bloque).toMatch(/activeDayLabel/);
        expect(bloque).toMatch(/activeDayEsHoy/);
    });
});
