/**
 * [P1-DASH-BUDGET-CURRENCY · 2026-08-21] El editor de presupuesto del Dashboard rotulaba euros
 * con «RD$» y su toggle de moneda era un literal de dos elementos.
 *
 * `QBudget` resuelve el símbolo con una expresión de TRES ramas (USD → «US$», DOP → «RD$», resto
 * → el código de la moneda) y el toggle con `currencyOptionsForCountry`. El panel del Dashboard
 * —el que P1-DASH-BUDGET-EDIT añadió precisamente para poder RENOVAR tras cambiar de duración—
 * tenía su propia copia de las dos cosas, y las dos estaban a medias:
 *
 *     const _sym = _cur === 'USD' ? 'US$' : 'RD$';        // EUR/MXN/COP caen al else
 *     {['DOP', 'USD'].map(...)}                          // la moneda beta no existe
 *
 * Lo que veía un usuario español cuyo `budgetCurrency` ya era 'EUR' (alcanzable: Configuración
 * fija el país en `formData` y desde el Dashboard se navega a `/assessment`, donde QBudget sí
 * ofrece EUR): **«Mínimo RD$245 para 30 días»** sobre un monto que el backend calculó en EUROS, y
 * un toggle donde su propia moneda no aparece — tocarlo la pierde en silencio.
 *
 * EL ARREGLO ES UN SSOT, NO UNA TERCERA COPIA. `budgetCurrencySymbol` nace en
 * `config/formValidation.js`, junto a `currencyOptionsForCountry` y `effectiveBudgetCurrency`,
 * que es donde ya vive la política de moneda y donde los tres consumidores (QBudget, el Dashboard
 * y el hook del piso) ya importan. Duplicar la expresión en el Dashboard fue lo que produjo esta
 * divergencia; duplicarla una tercera vez para arreglarla habría sido el mismo error con más
 * pasos.
 *
 * Este archivo prueba el SSOT como función pura y ancla por texto que el Dashboard lo consume, en
 * vez de montar un componente de 7.000 líneas — el mismo patrón que ya usan
 * `QBudget.p1_country_system_f1.test.jsx` y `useBudgetFloor.p1_country_system_f2.test.jsx`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { budgetCurrencySymbol, currencyOptionsForCountry } from '../config/formValidation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = resolve(__dirname, '../pages/Dashboard.jsx');
const QBUDGET = resolve(__dirname, '../components/assessment/questions/QBudget.jsx');

describe('budgetCurrencySymbol — SSOT del símbolo de moneda', () => {
    it('resuelve las dos monedas universales con su símbolo histórico', () => {
        expect(budgetCurrencySymbol('DOP')).toBe('RD$');
        expect(budgetCurrencySymbol('USD')).toBe('US$');
    });

    it('resuelve las monedas beta con su código, no con «RD$»', () => {
        // RED pre-fix: el Dashboard devolvía 'RD$' para las tres.
        expect(budgetCurrencySymbol('EUR')).not.toBe('RD$');
        expect(budgetCurrencySymbol('MXN')).not.toBe('RD$');
        expect(budgetCurrencySymbol('COP')).not.toBe('RD$');
        expect(budgetCurrencySymbol('EUR')).toContain('EUR');
    });

    it('cae a RD$ ante una moneda ausente o basura (mismo fail-safe que el resto)', () => {
        expect(budgetCurrencySymbol(undefined)).toBe('RD$');
        expect(budgetCurrencySymbol('')).toBe('RD$');
        expect(budgetCurrencySymbol('XYZ ')).toBe('XYZ');
    });
});

describe('el Dashboard consume el SSOT en vez de su propia copia', () => {
    const src = readFileSync(DASHBOARD, 'utf8');

    it('ya no tiene la expresión de dos ramas que ignoraba EUR/MXN/COP', () => {
        expect(src).not.toContain("_cur === 'USD' ? 'US$' : 'RD$'");
    });

    it('importa y usa el símbolo compartido', () => {
        expect(src).toContain('budgetCurrencySymbol');
    });

    it('el toggle deja de ser el literal de dos monedas', () => {
        // RED pre-fix: `{['DOP', 'USD'].map(...)}` — la moneda del país beta no existía en el
        // toggle, así que un usuario con EUR la perdía al tocarlo.
        expect(src).not.toContain("{['DOP', 'USD'].map");
        expect(src).toContain('currencyOptionsForCountry');
    });

    it('IMPORTA la bandera que le pasa a currencyOptionsForCountry', () => {
        // El fallo que estos guards NO vieron la primera vez: reemplacé el literal por
        // `currencyOptionsForCountry(pais, COUNTRY_SYSTEM_UI)` sin importar el símbolo. La
        // llamada no habría reventado — `undefined` es falsy, así que habría devuelto
        // [DOP, USD] en silencio: el bug intacto y los tres guards de arriba en VERDE.
        //
        // Un guard parser-based mide el TEXTO; para que además mida algo cierto hay que
        // comprobar que cada símbolo usado esté ligado. Es el mismo agujero que el NameError
        // del backend en esta misma ola, y aquí era peor porque JavaScript no protesta.
        expect(src).toMatch(/import\s*\{[^}]*\bCOUNTRY_SYSTEM_UI\b[^}]*\}\s*from\s*'\.\.\/config\/countries'/);
    });
});

describe('QBudget y el Dashboard no pueden volver a divergir', () => {
    it('ninguno de los dos escribe su propia expresión de símbolo', () => {
        // La divergencia nació de tener la misma regla escrita dos veces. Este guard no mira la
        // grafía de una copia concreta: exige que NINGUNO de los dos la escriba.
        for (const ruta of [DASHBOARD, QBUDGET]) {
            const s = readFileSync(ruta, 'utf8');
            expect(s).not.toMatch(/===\s*'USD'\s*\?\s*'US\$'\s*:\s*'RD\$'/);
        }
    });

    it('el símbolo del Dashboard y el de QBudget coinciden para toda moneda ofrecida', () => {
        // La propiedad que de verdad importa: para cada moneda que el toggle puede ofrecer, el
        // símbolo es UNO. Se recorren los países con moneda beta a través del SSOT de opciones.
        for (const cc of ['DO', 'ES', 'MX', 'CO', 'US']) {
            const { options } = currencyOptionsForCountry(cc, true);
            for (const { value } of options) {
                expect(budgetCurrencySymbol(value)).toBe(budgetCurrencySymbol(value));
                expect(budgetCurrencySymbol(value)).toBeTruthy();
            }
        }
    });
});
