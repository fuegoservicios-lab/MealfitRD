// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16 (T7)] Lista de compras en modo beta honesto.
//
// Test parser-based (mismo patrón que Dashboard.p3_banner_reason_copy.test.js): Dashboard.jsx
// es un árbol de dependencias pesado y `_rebuildItemFromVariant`/`applyBrandToPlanOptimistic`
// son `const` NO exportadas — importar el módulo completo para testear 2 funciones internas
// sería frágil (cualquier fallo de import ajeno a esta feature tumba el test) y no hay una vía
// más liviana para invocarlas directo. Se lee el SOURCE y se ancla la ESTRUCTURA del gate —
// consistente con cómo T6 testeó QBudget.jsx/InteractiveAssessmentFlow.jsx desde el lado
// backend (test_p1_country_system_f1.py) y con cómo P3-BANNER-REASON-COPY testeó Dashboard.jsx
// desde el lado frontend.
//
// Contrato (T7 brief): con `planData._pricing_mode === 'beta_no_prices'` el backend nunca
// emitió `estimated_cost_rd` para este plan — el cliente debe reflejar esa ausencia, no
// resucitar precios al elegir marca (writer optimista), ni ofrecer el panel "Marcas del
// súper" (comparar precios no tiene sentido sin precios), ni imprimir el pie/cabecera del
// PDF con el texto dominicano. DO (`_pricing_mode` ausente) es byte-idéntico a antes de T7.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _src = readFileSync(join(__dirname, '..', 'pages', 'Dashboard.jsx'), 'utf-8');

// [ventanas por ÍNDICE, no por conteo fijo de chars — la lección de P3-BANNER-REASON-COPY:
// "las ventanas fijas de chars caducan con cualquier comentario nuevo (CUARTA vez de la
// clase en este repo)"]
const _slice = (startMarker, endMarker, from = 0) => {
    const i = _src.indexOf(startMarker, from);
    expect(i, `marcador de inicio no encontrado: ${startMarker}`).toBeGreaterThan(-1);
    const j = endMarker ? _src.indexOf(endMarker, i + startMarker.length) : i + 2000;
    expect(j, `marcador de fin no encontrado: ${endMarker}`).toBeGreaterThan(i);
    return _src.slice(i, j);
};

describe('P1-COUNTRY-SYSTEM-F1 (T7) — writer optimista de marca (_rebuildItemFromVariant)', () => {
    it('_rebuildItemFromVariant acepta suppressCost, default false (byte-identidad DO)', () => {
        expect(_src).toContain(
            "const _rebuildItemFromVariant = (it, variant, suppressCost = false) => {"
        );
    });

    it('el bloque de costo se gatea con !suppressCost — el WRITER real que la mutación debe apuntar', () => {
        const body = _slice(
            'const _rebuildItemFromVariant = (it, variant, suppressCost = false) => {',
            '\n};'
        );
        expect(body).toContain('if (price > 0 && !suppressCost) {');
        // el resto del rebuild (marca/tamaño/conteo) NO debe gatearse — sigue aplicando
        // incluso en modo beta (elegir marca sigue siendo útil sin precio).
        expect(body).toContain('out.display_qty = sizeLabel');
        expect(body).toContain('out.sku_size_label');
    });

    it('applyBrandToPlanOptimistic deriva suppressCost de plan?._pricing_mode', () => {
        const body = _slice(
            'const applyBrandToPlanOptimistic = (plan, foodKey, variant) => {',
            '\n};'
        );
        expect(body).toContain("plan?._pricing_mode === 'beta_no_prices'");
        expect(body).toContain('_rebuildItemFromVariant(it, variant, _suppressCost)');
    });

    it('el call site del rebuild SIEMPRE pasa el 3er argumento (nunca invoca con 2, que perdería el gate)', () => {
        const body = _slice(
            'const applyBrandToPlanOptimistic = (plan, foodKey, variant) => {',
            '\n};'
        );
        expect(body).not.toMatch(/_rebuildItemFromVariant\(it, variant\)[^,]/);
    });
});

describe('P1-COUNTRY-SYSTEM-F1 (T7) — panel "Marcas del súper" oculto en modo beta', () => {
    it('la condición de render de SupermarketBrands incluye el gate de pricing_mode', () => {
        const i = _src.indexOf('{brandsPanelList.length > 0');
        expect(i).toBeGreaterThan(-1);
        const j = _src.indexOf('<SupermarketBrands', i);
        const window = _src.slice(i, j);
        expect(window).toContain("planData?._pricing_mode !== 'beta_no_prices'");
    });

    it('el gate nuevo NO reemplaza los guards preexistentes (isPlanExpired/planFinished/isPlanCorrupted/hasItems)', () => {
        const i = _src.indexOf('{brandsPanelList.length > 0');
        const j = _src.indexOf('<SupermarketBrands', i);
        const window = _src.slice(i, j);
        expect(window).toContain('shoppingDeltaMeta?.hasItems !== false');
        expect(window).toContain('!isPlanExpired');
        expect(window).toContain('!planFinished');
        expect(window).toContain('!isPlanCorrupted');
    });
});

describe('P1-COUNTRY-SYSTEM-F1 (T7) — aviso beta en el PDF (cabecera + pie)', () => {
    it('_isBetaPricing se deriva de effectivePlanData (no del planData externo, que puede estar stale)', () => {
        expect(_src).toContain(
            "const _isBetaPricing = effectivePlanData?._pricing_mode === 'beta_no_prices';"
        );
    });

    it('la cabecera del PDF incluye un banner condicional con el aviso beta', () => {
        const body = _slice('${_isBetaPricing ? `', '` : \'\'}');
        expect(body).toContain(
            "t('Precios del súper de tu país: próximamente. Tu lista sale sin importes.')"
        );
    });

    it('el pie del PDF alterna entre el aviso beta y el texto DOP histórico — DOP EXACTO, sin tocar', () => {
        const i = _src.indexOf('<p style="margin: 6px 0 0; font-size: 11px; color: #4b5563;">');
        const line = _src.slice(i, _src.indexOf('</p>', i) + 4);
        expect(line).toContain("_isBetaPricing ? t('Precios del súper de tu país: próximamente. Tu lista sale sin importes.')");
        expect(line).toContain(
            ": t('Precios estimados a partir de supermercados dominicanos (Nacional/La Sirena); pueden variar según tienda y fecha.')"
        );
    });

    it('el texto DOP del pie no perdió NINGÚN carácter (byte-identidad) — sigue existiendo verbatim en el archivo', () => {
        expect(_src).toContain(
            'Precios estimados a partir de supermercados dominicanos (Nacional/La Sirena); pueden variar según tienda y fecha.'
        );
    });
});

describe('P1-COUNTRY-SYSTEM-F1 (T7, fold de T6) — panel de presupuesto del Dashboard usa effectiveBudgetCurrency', () => {
    it('importa effectiveBudgetCurrency de config/formValidation (no lo redefine)', () => {
        expect(_src).toMatch(
            /import\s*\{[^}]*effectiveBudgetCurrency[^}]*\}\s*from\s*['"]\.\.\/config\/formValidation['"]/
        );
        expect(_src).not.toContain('export function effectiveBudgetCurrency');
    });

    it('el autofill de presupuesto al cambiar duración usa effectiveBudgetCurrency, no budgetCurrency crudo', () => {
        const i = _src.indexOf("if (formData?.budget === 'custom') {");
        expect(i).toBeGreaterThan(-1);
        const j = _src.indexOf('const _afMin = minBudgetFor(_afCur, opt.value);', i);
        expect(j).toBeGreaterThan(i);
        const window = _src.slice(i, j);
        expect(window).toContain('effectiveBudgetCurrency(formData?.country, formData?.budgetCurrency)');
        expect(window).not.toContain("formData?.budgetCurrency || 'DOP'");
    });

    it('el símbolo/mínimo del panel de presupuesto usa effectiveBudgetCurrency, no budgetCurrency crudo', () => {
        const i = _src.indexOf("const _sym = _cur === 'USD' ? 'US$' : 'RD$';");
        expect(i).toBeGreaterThan(-1);
        const before = _src.slice(Math.max(0, i - 300), i);
        expect(before).toContain('effectiveBudgetCurrency(formData?.country, formData?.budgetCurrency)');
    });

    it('cero call sites restantes de `formData?.budgetCurrency || \'DOP\'` crudo en todo el archivo', () => {
        expect(_src).not.toContain("formData?.budgetCurrency || 'DOP'");
    });
});
