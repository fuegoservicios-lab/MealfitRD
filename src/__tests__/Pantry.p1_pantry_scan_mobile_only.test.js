/**
 * [P1-PANTRY-SCAN-MOBILE-ONLY · 2026-07-28] `Pantry.jsx` (página Nevera del
 * dashboard) solía envolver <PantryScanButton> en su PROPIO <div style={{margin}}>
 * en ambos caminos de render (topbar móvil + columna "Principal" desktop),
 * gateado por `{pantryStatus?.photo_scan_enabled && (...)}`.
 *
 * Bug (descubierto al añadir el gate de capacidad mobile-only a
 * PantryScanButton.jsx, que ahora retorna null en desktop / puntero fino):
 * ese <div> wrapper de Pantry.jsx no sabe NADA de capacidad de dispositivo —
 * solo del flag `photo_scan_enabled`. Con el flag en `true` pero la tarjeta
 * oculta por capacidad, el wrapper seguía montando un <div> VACÍO con su
 * propio margen (y, en el topbar móvil, un `gap` extra del flex padre) —
 * un hueco fantasma exactamente donde estaba la tarjeta. Justo lo que el
 * owner notaría mirando la pantalla de escritorio.
 *
 * Fix: eliminar el <div> wrapper en AMBOS caminos y renderizar
 * <PantryScanButton> desnudo, pasando `style` (merge sobre la raíz que el
 * propio componente retorna null si está oculta — cero DOM extra) y
 * `enabled={!!pantryStatus?.photo_scan_enabled}` directo como prop (mismo
 * mecanismo de gate que ya usaba QPantryBuilder.jsx — un solo camino, no dos).
 *
 * Por qué este test es parser-based (regex sobre el source) y NO un montaje
 * RTL de <Pantry/>: Pantry.jsx es una página de ~3200 líneas que depende de
 * AssessmentContext, useDisabledIngredients, framer-motion y múltiples fetches
 * concurrentes en mount (inventario, master list, pantry-status, disabled
 * ingredients). CERO test existente en el repo monta <Pantry/> con
 * @testing-library/react — la convención establecida para este archivo
 * (ver Pantry.p3_audit_8_recalc_after_change.test.js) es exactamente esta:
 * parsear el source y anclar el invariante estructural. Construir el harness
 * RTL completo solo para esta aserción sería desproporcionado y frágil
 * (mocks de contexto + N fetches solo para leer un atributo de DOM que un
 * regex ya verifica con precisión). El mecanismo FUNCIONAL (que `style` de
 * hecho aterriza en la raíz sin nodo extra) ya está cubierto con RTL en
 * PantryScanButton.p1_pantry_scan_mobile_only.test.jsx — este archivo solo
 * ancla que Pantry.jsx invoca ese mecanismo correctamente.
 */

import fs from 'fs';
import path from 'path';

const PANTRY_PATH = path.resolve(__dirname, '..', 'pages', 'Pantry.jsx');

function readPantry() {
    return fs.readFileSync(PANTRY_PATH, 'utf-8');
}

// Extrae el tag `<PantryScanButton ... />` completo a partir del índice de
// inicio (hasta el próximo `/>` — el componente es siempre self-closing acá).
function extractTag(src, startIdx) {
    const closeIdx = src.indexOf('/>', startIdx);
    expect(closeIdx).toBeGreaterThan(-1);
    return src.slice(startIdx, closeIdx + 2);
}

describe('P1-PANTRY-SCAN-MOBILE-ONLY · Pantry.jsx sin wrapper vacío alrededor de PantryScanButton', () => {
    test('el SSOT sigue usado exactamente 2 veces (topbar móvil + columna Principal desktop)', () => {
        const src = readPantry();
        const matches = src.match(/<PantryScanButton\b/g) || [];
        expect(matches).toHaveLength(2);
    });

    test('NINGUNA ocurrencia está envuelta en un <div style={{ margin... }}> — el margen viaja con el componente', () => {
        const src = readPantry();
        const re = /<PantryScanButton\b/g;
        let m;
        let count = 0;
        while ((m = re.exec(src)) !== null) {
            count += 1;
            // Ventana de 400 chars inmediatamente antes del tag: suficiente para
            // cubrir "<div style={{ margin...}}>\n  " sin cruzar al elemento
            // hermano anterior (que en ambos call sites cierra su propio </div>
            // bastante antes). Si alguien reintroduce el wrapper, esta ventana
            // lo captura sin importar la redacción exacta del margen.
            const before = src.slice(Math.max(0, m.index - 400), m.index);
            expect(before).not.toMatch(/<div\s+style=\{\{\s*margin/);
        }
        expect(count).toBe(2);
    });

    test('el viejo patrón `photo_scan_enabled && (` (gate vía JSX condicional externo) ya NO existe', () => {
        const src = readPantry();
        // Pre-fix: `{pantryStatus?.photo_scan_enabled && (` envolvía el <div>
        // wrapper en ambos call sites (2 matches). El gate ahora vive 100% en
        // la prop `enabled` de PantryScanButton — un solo mecanismo.
        expect(src).not.toMatch(/pantryStatus\?\.photo_scan_enabled\s*&&\s*\(/);
    });

    test('AMBAS ocurrencias pasan `enabled={!!pantryStatus?.photo_scan_enabled}` directo — el flag backend sigue mandando', () => {
        const src = readPantry();
        const re = /<PantryScanButton\b/g;
        let m;
        const tags = [];
        while ((m = re.exec(src)) !== null) {
            tags.push(extractTag(src, m.index));
        }
        expect(tags).toHaveLength(2);
        tags.forEach((tag) => {
            expect(tag).toMatch(/enabled=\{!!pantryStatus\?\.photo_scan_enabled\}/);
        });
    });

    test('AMBAS ocurrencias pasan `style={{...}}` directo en la prop — la separación visual no se perdió al quitar el wrapper', () => {
        const src = readPantry();
        const re = /<PantryScanButton\b/g;
        let m;
        const tags = [];
        while ((m = re.exec(src)) !== null) {
            tags.push(extractTag(src, m.index));
        }
        expect(tags).toHaveLength(2);
        tags.forEach((tag) => {
            expect(tag).toMatch(/style=\{\{/);
        });
        // Topbar móvil: mismo valor que el wrapper que reemplaza (marginTop 0.6rem).
        expect(tags.some((t) => /marginTop:\s*'0\.6rem'/.test(t))).toBe(true);
        // Columna Principal desktop: mismo valor que el wrapper que reemplaza (margin 0.75rem 0).
        expect(tags.some((t) => /margin:\s*'0\.75rem 0'/.test(t))).toBe(true);
    });
});
