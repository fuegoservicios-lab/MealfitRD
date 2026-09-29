// [P1-PLAN-LOTE-853 · 2026-09-29] Un español, un mexicano o un colombiano leen su palabra, no la dominicana.
//
// G24 (29-sep): «guineo», «lechosa», «auyama», «ají morrón», «queso blanco», «habichuelas» y «funda» salían en los platos
// y la lista de ES/MX/CO/US. Son nombres del CATÁLOGO (identificadores del motor): el plan no se toca, se cambia la
// palabra al PINTAR, por país de mercado, con el léxico como DATA. Los `casos` del JSON los corre también el backend
// (`tests/test_p1_plan_lote_853.py`), que además comprueba que este espejo es idéntico a su SSOT.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

let _locale = 'es-DO';
vi.mock('../i18n', async (importOriginal) => ({ ...(await importOriginal()), getLocale: () => _locale }));

import LEXICO from '../data/lexicoVistaPais.json';
import {
    envaseParaLeer, lexicoDeVistaActivo, nombreDeListaParaLeer, textoParaLeer,
} from '../utils/lexicoDelPais';
import { setPaisDeLectura } from '../utils/paisDelUsuario';
import { mealDisplay } from '../utils/displayMeal';
import { glossShoppingItemName, glossShoppingQty } from '../utils/shoppingHelpers';

const tIdentidad = (k, vars) => (vars ? k.replace(/\{(\w+)\}/g, (_m, v) => String(vars[v] ?? '')) : k);

afterEach(() => {
    setPaisDeLectura(null);
    _locale = 'es-DO';
    vi.unstubAllEnvs();
});

describe('[853] los casos compartidos con el backend', () => {
    const f = { texto: textoParaLeer, lista: nombreDeListaParaLeer, envase: envaseParaLeer };
    it.each(LEXICO.casos.map((c) => [c.funcion, c.pais, c.entrada, c.lectura]))(
        '%s %s «%s»', (funcion, pais, entrada, lectura) => {
            expect(f[funcion](entrada, pais)).toBe(lectura);
        },
    );
});

describe('[853] el plato en español se lee con la palabra del país', () => {
    const meal = {
        name: 'Batido cremoso de guineo y lechosa',
        desc: 'Guineo y lechosa con queso blanco fresco.',
        ingredients: ['½ guineo mediano', '½ lechosa mediana (405g)', '30 g de queso blanco', '1 taza de leche'],
        recipe: ['Pela el guineo y corta la lechosa.', 'Licúa todo con el queso blanco.'],
        ingredients_raw: ['½ guineo mediano'],
    };

    it('en México: nombre, descripción, ingredientes y pasos, sin tocar el meal', () => {
        const antes = JSON.stringify(meal);
        setPaisDeLectura('MX');
        const d = mealDisplay(meal, 'es-DO');
        expect(d.name).toBe('Batido cremoso de plátano y papaya');
        expect(d.description).toBe('Plátano y papaya con queso fresco.');
        expect(d.ingredients).toEqual(['½ plátano mediano', '½ papaya mediana (405g)', '30 g de queso fresco', '1 taza de leche']);
        expect(d.recipe).toEqual(['Pela el plátano y corta la papaya.', 'Licúa todo con el queso fresco.']);
        expect(JSON.stringify(meal)).toBe(antes);   // el dato no se toca
    });

    it('en EE. UU. (sin tabla del 649) también, con su léxico', () => {
        setPaisDeLectura('US');
        const d = mealDisplay({ name: 'Revoltillo con ají morrón', ingredients: ['½ ají morrón'], recipe: [] }, 'es-DO');
        expect(d.name).toBe('Revoltillo con pimiento morrón');
        expect(d.ingredients).toEqual(['½ pimiento morrón']);
    });

    it('en RD el resultado es el de siempre, byte a byte (los MISMOS arrays)', () => {
        setPaisDeLectura('DO');
        const d = mealDisplay(meal, 'es-DO');
        expect(d.name).toBe(meal.name);
        expect(d.ingredients).toBe(meal.ingredients);
        expect(d.recipe).toBe(meal.recipe);
    });

    it('en otro idioma manda la traducción, no el léxico', () => {
        setPaisDeLectura('MX');
        expect(mealDisplay(meal, 'en-US').ingredients).toBe(meal.ingredients);
    });

    it('con el knob apagado vuelve la glosa del 649', () => {
        vi.stubEnv('VITE_COUNTRY_DISPLAY_LEXICON', 'false');
        expect(lexicoDeVistaActivo()).toBe(false);
        setPaisDeLectura('ES');
        expect(mealDisplay({ name: 'Avena con guineo', ingredients: [], recipe: [] }, 'es-DO').name)
            .toBe('Avena con guineo (plátano)');
        setPaisDeLectura('US');
        expect(mealDisplay({ name: 'Revoltillo con ají morrón', ingredients: [], recipe: [] }, 'es-DO').name)
            .toBe('Revoltillo con ají morrón');
    });
});

describe('[853] la lista de la compra (PDF)', () => {
    it('el nombre sale con la palabra del país, sin glosa encima', () => {
        expect(glossShoppingItemName('Habichuelas negras', 'Black beans', 'es-DO', null, 'MX', null)).toBe('Frijoles negros');
        expect(glossShoppingItemName('Lechosa', 'Papaya', 'es-DO', null, 'MX', 'papaya')).toBe('Papaya');
        expect(glossShoppingItemName('Queso blanco', 'White cheese', 'es-DO', null, 'CO', null)).toBe('Queso campesino');
        expect(glossShoppingItemName('Ají morrón', 'Bell pepper', 'es-DO', null, 'US', null)).toBe('Pimiento morrón');
    });

    it('lo que el léxico no cubre sigue con su glosa, y RD no cambia', () => {
        expect(glossShoppingItemName('Chinola', 'Passion fruit', 'es-DO', null, 'ES', 'maracuyá')).toBe('Chinola (maracuyá)');
        expect(glossShoppingItemName('Lechosa', 'Papaya', 'es-DO', null, 'DO', 'papaya')).toBe('Lechosa');
        expect(glossShoppingItemName('Guineo', 'Banana', 'es-DO', null, 'PR', 'banana')).toBe('Guineo (banana)');
    });

    it('en otro idioma, el gloss del idioma de siempre (el léxico es para leer en español)', () => {
        expect(glossShoppingItemName('Lechosa', 'Papaya', 'en-US', null, 'MX', 'papaya')).toBe('Papaya (Lechosa)');
    });

    it('el envase: «funda» → «bolsa» en español; el paréntesis (rótulo real) no se toca', () => {
        setPaisDeLectura('ES');
        expect(glossShoppingQty('1 funda (Selecto 1 Lb)', tIdentidad)).toBe('1 bolsa (Selecto 1 Lb)');
        setPaisDeLectura('PR');
        expect(glossShoppingQty('1 funda (1 Lb)', tIdentidad)).toBe('1 funda (1 Lb)');
        setPaisDeLectura('DO');
        expect(glossShoppingQty('1 funda (1 Lb)', tIdentidad)).toBe('1 funda (1 Lb)');
    });

    it('en otro idioma el envase lo sigue traduciendo `t`', () => {
        setPaisDeLectura('ES');
        _locale = 'en-US';
        const tEn = (k) => ({ funda: 'bag' }[k] ?? k);
        expect(glossShoppingQty('1 funda (1 Lb)', tEn)).toBe('1 bag (1 Lb)');
    });
});

// ── display-only de verdad: «no lo es si alguien copia» ─────────────────────────────────────────────────────────────
describe('[853] nada de lo pintado vuelve al plan', () => {
    const SRC = resolve(__dirname, '..');
    const ficheros = (dir) => readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return n === '__tests__' ? [] : ficheros(p);
        return /\.(js|jsx|ts|tsx)$/.test(n) ? [p] : [];
    });

    it('solo las dos capas de vista importan el léxico', () => {
        const importan = ficheros(SRC)
            .filter((p) => /from '\.\/lexicoDelPais'|from '\.\.\/utils\/lexicoDelPais'|from '\.\.\/\.\.\/utils\/lexicoDelPais'/.test(readFileSync(p, 'utf8')))
            .map((p) => relative(SRC, p).replace(/\\/g, '/'))
            .sort();
        expect(importan).toEqual(['utils/displayMeal.js', 'utils/shoppingHelpers.js']);
    });

    it('el contexto que escribe el plan (swap, regenerar día, restore-local) no pinta', () => {
        const ctx = readFileSync(join(SRC, 'context/AssessmentContext.jsx'), 'utf8');
        expect(ctx).not.toMatch(/lexicoDelPais|textoParaLeer|mealDisplay\(/);
        const regen = readFileSync(join(SRC, 'hooks/useRegeneratePlan.js'), 'utf8');
        expect(regen).not.toMatch(/lexicoDelPais|textoParaLeer|mealDisplay\(|glossShoppingItemName|glossShoppingQty/);
    });
});
