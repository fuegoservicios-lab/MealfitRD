/**
 * [P2-I18N-VOCAB-CERRADO-ANOTACIONES-SIN-ROTULO · 2026-08-23] El vocabulario cerrado de la
 * receta son SEIS marcas: tres secciones y tres anotaciones. La promesa del diseño era la
 * misma para las seis —el identificador español se congela en el dato y el rótulo se
 * traduce al pintar— y se cumplía en tres: las secciones tenían `titleKey`; las
 * anotaciones sólo se RECONOCÍAN para no numerarlas y «🌱 Nota del Nutricionista AI:»
 * salía en español dentro de una receta francesa.
 *
 * El backend lo exige así en el dato (`_conserva_el_vocab_cerrado` descarta la traducción
 * que pierda la marca), así que la única vía correcta es la de las secciones: glosar el
 * rótulo al pintar. Este test mide la CONDUCTA de ese gloss con el catálogo real.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadLocale, t } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { glossAnnotationLabel, isRecipeAnnotation } from '../utils/recipeSteps';

const NOTA = '🌱 Nota del Nutricionista AI: espolvorea semillas de girasol al servir';
const SEGURIDAD = '⚠️ Seguridad alimentaria: el pollo debe llegar a 74 °C en el centro';
const PORCIONES = '💡 Ajustamos ligeramente las porciones para cuadrar tus macros';

describe('[P2-I18N-VOCAB-CERRADO-ANOTACIONES-SIN-ROTULO] glossAnnotationLabel', () => {
    describe('en francés', () => {
        beforeEach(async () => { await loadLocale('fr-FR'); });
        afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

        it('EL CASO: el rótulo sale traducido, el emoji y el cuerpo se conservan', () => {
            const out = glossAnnotationLabel(NOTA, t);
            expect(out.startsWith('🌱 Note du nutritionniste IA:'), out).toBe(true);
            expect(out).toContain('espolvorea semillas de girasol al servir');
            expect(out).not.toContain('Nota del Nutricionista');
        });

        it('la segunda marca también: «Seguridad alimentaria»', () => {
            const out = glossAnnotationLabel(SEGURIDAD, t);
            expect(out.startsWith('⚠️ Sécurité alimentaire:'), out).toBe(true);
            expect(out).toContain('74 °C');
        });

        it('el rótulo sin «AI» y sin dos puntos también se reconoce, y no se inventan dos puntos', () => {
            const out = glossAnnotationLabel('Nota del nutricionista prueba', t);
            expect(out).toBe('Note du nutritionniste IA prueba');
        });

        it('la tercera marca (porciones) es prosa entera, no un rótulo: se pinta tal cual', () => {
            // No hay «rótulo + cuerpo» que separar: la frase ES la anotación. Si el backend la
            // tradujo, viene traducida; si no, es el fallback español. Aquí no se inventa nada.
            expect(isRecipeAnnotation(PORCIONES)).toBe(true);
            expect(glossAnnotationLabel(PORCIONES, t)).toBe(PORCIONES);
        });

        it('un paso de cocina normal no se toca aunque contenga la palabra «nota» por dentro', () => {
            const paso = 'Sirve con una nota de limón y cilantro';
            expect(glossAnnotationLabel(paso, t)).toBe(paso);
        });

        it('el DATO no cambia: la función devuelve una cadena nueva y no muta nada', () => {
            const raw = NOTA;
            glossAnnotationLabel(raw, t);
            expect(raw).toBe(NOTA);
        });
    });

    describe('en es-DO (sin catálogo)', () => {
        it('el rótulo vuelve idéntico, byte a byte', async () => {
            await loadLocale(DEFAULT_LOCALE);
            expect(glossAnnotationLabel(NOTA, t)).toBe(NOTA);
            expect(glossAnnotationLabel(SEGURIDAD, t)).toBe(SEGURIDAD);
        });
    });

    it('sin `t` o con entrada vacía devuelve lo que recibió, sin reventar', () => {
        expect(glossAnnotationLabel(NOTA, null)).toBe(NOTA);
        expect(glossAnnotationLabel('', t)).toBe('');
        expect(glossAnnotationLabel(undefined, t)).toBe('');
    });

    it('los DOS renders de receta pasan el paso por el gloss cuando es anotación', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        for (const f of ['RecipesView.jsx', 'MobileRecipes.jsx']) {
            const src = fs.readFileSync(path.resolve(__dirname, '../components/recipes', f), 'utf8');
            expect(src, `${f} importa el gloss`).toMatch(/import \{[^}]*\bglossAnnotationLabel\b[^}]*\} from '\.\.\/\.\.\/utils\/recipeSteps'/);
            // El gloss tiene que estar DENTRO de lo que se pinta, condicionado a `annotation`.
            expect(src, `${f} glosa al pintar`).toMatch(/renderBold\(annotation \? glossAnnotationLabel\(body, t\) : body\)/);
        }
    });
});
