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
// [P3-COUNTRY-SIMBOLO-MONEDA-DUPLICADO · 2026-08-23] El resolvedor que usa QBudget HOY. No es
// `budgetCurrencySymbol`: `P3-I18N-MONEDA-COMPUESTA-A-MANO-EN-EL-PRESUPUESTO` (2026-08-23) le
// quitó a QBudget su expresión de tres ramas y la sustituyó por `Intl`, que sigue al idioma
// activo. Para comparar las dos superficies hay que traer los DOS resolvedores; con uno solo
// no se compara nada, que es exactamente lo que hacía el caso de abajo antes de este cambio.
import { currencySymbol as symbolQBudget } from '../i18n';

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

    /* [P3-COUNTRY-SIMBOLO-MONEDA-DUPLICADO · 2026-08-23] AQUÍ HABÍA UNA TAUTOLOGÍA.
       El caso se titulaba «el símbolo del Dashboard y el de QBudget coinciden» y afirmaba
       `expect(budgetCurrencySymbol(v)).toBe(budgetCurrencySymbol(v))`: comparaba el SSOT
       consigo mismo. Pasaba en verde con QBudget resolviendo el símbolo por su cuenta —que es
       lo que hacía— y habría seguido pasando con las dos superficies divergiendo en todo.
       Un guard que certifica un cierre que no ocurrió es peor que no tenerlo: ocupa su sitio.

       Lo que se compara ahora son los DOS resolvedores VIVOS, cada uno traído de su módulo. */
    it('los dos resolvedores vivos dan el MISMO símbolo en el idioma base', () => {
        // es-DO es el idioma base del producto (`DEFAULT_LOCALE`) y el de la suite. Si las dos
        // superficies discrepan aquí, un usuario ve dos rótulos distintos para su propia moneda
        // en la misma sesión — que es el defecto que P1-DASH-BUDGET-CURRENCY cerró.
        for (const cc of ['DO', 'ES', 'MX', 'CO', 'US']) {
            const { options } = currencyOptionsForCountry(cc, true);
            for (const { value } of options) {
                expect(budgetCurrencySymbol(value)).toBeTruthy();
                expect(symbolQBudget(value)).toBe(budgetCurrencySymbol(value));
            }
        }
    });

    it('ninguno rotula con «RD$» una moneda que no es el peso dominicano', () => {
        // La forma exacta del bug original: «Mínimo RD$245 para 30 días» sobre un monto que el
        // backend había calculado en EUROS. Es la propiedad, independiente de qué función la
        // resuelva y de cuántas haya.
        for (const cc of ['ES', 'MX', 'CO', 'US']) {
            const { options } = currencyOptionsForCountry(cc, true);
            for (const { value } of options) {
                if (value === 'DOP') continue;
                expect(budgetCurrencySymbol(value)).not.toBe('RD$');
                expect(symbolQBudget(value)).not.toBe('RD$');
            }
        }
    });

    it('QBudget resuelve el símbolo con UN helper importado, nunca con una expresión propia', () => {
        // El gap medido decía que QBudget conservaba `${effectiveCurrency} ` —el código ISO con
        // un espacio final que el SSOT no tiene—. Ese trozo ya no existe: se lo llevó
        // P3-I18N-MONEDA-COMPUESTA-A-MANO-EN-EL-PRESUPUESTO el mismo día. Lo que este caso
        // impide es que vuelva CUALQUIER expresión propia, no la grafía de aquélla.
        //
        // Y SE MIRA LA ASIGNACIÓN, NO EL IMPORT. Comprobar que el import sigue ahí no prueba
        // nada: reintroduje la expresión de tres ramas dejando el import intacto (queda
        // huérfano, y JavaScript no protesta) y este caso pasaba en VERDE. Un import es lo que
        // el fichero PUEDE usar; la asignación es lo que USA.
        const s = readFileSync(QBUDGET, 'utf8');
        const asignacion = s.match(/\n\s*const\s+currencySymbol\s*=\s*([^;\n]+);/);
        expect(asignacion).toBeTruthy();
        const expr = asignacion[1].trim();
        // Una sola llamada a un identificador, y nada más: sin ternarios, sin concatenación.
        expect(expr).toMatch(/^[A-Za-z_$][\w$]*\([^()]*\)$/);
        const helper = expr.slice(0, expr.indexOf('('));
        expect(s).toMatch(new RegExp(`import\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}\\s*from`));
    });
});
