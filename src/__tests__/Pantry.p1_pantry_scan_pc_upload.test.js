/**
 * [P1-PANTRY-SCAN-PC-UPLOAD · 2026-07-28] Renombrado desde
 * Pantry.p1_pantry_scan_mobile_only.test.js. La corrección de
 * P1-PANTRY-SCAN-PC-UPLOAD cambia el CONTRATO de PantryScanButton.jsx (la
 * tarjeta ya no se oculta por dispositivo, solo por el flag backend
 * `enabled`) pero las aserciones de ESTE archivo sobre `Pantry.jsx` en sí
 * siguen siendo correctas sin cambios: Pantry.jsx nunca supo nada de
 * capacidad de dispositivo — solo pasaba `enabled`/`style` al SSOT. Lo único
 * que se corrige acá es el comentario que explicaba POR QUÉ el mecanismo
 * (sin <div> wrapper, margen vía prop `style`) es necesario.
 *
 * Historia: `Pantry.jsx` (página Nevera del dashboard) solía envolver
 * <PantryScanButton> en su PROPIO <div style={{margin}}> en ambos caminos de
 * render (topbar móvil + columna "Principal" desktop), gateado solo por
 * `{pantryStatus?.photo_scan_enabled && (...)}`.
 *
 * Bug original (P1-PANTRY-SCAN-MOBILE-ONLY, mismo día): al añadirle a
 * PantryScanButton.jsx un gate que podía retornar null por CAPACIDAD de
 * dispositivo (no solo por el flag backend), ese <div> wrapper de Pantry.jsx
 * — que no sabe nada de capacidad de dispositivo — seguía montando un <div>
 * VACÍO con su propio margen: un hueco fantasma exactamente donde estaba la
 * tarjeta en desktop.
 *
 * Con P1-PANTRY-SCAN-PC-UPLOAD, el gate por capacidad de dispositivo se
 * ELIMINÓ (la tarjeta es visible en todo dispositivo; el dispositivo ahora
 * solo elige MODO — visor en vivo vs. subir archivo directo). El ÚNICO caso
 * que sigue retornando null es `enabled=false` (flag backend apagado) — el
 * mismo riesgo de hueco fantasma existía ANTES de P1-PANTRY-SCAN-MOBILE-ONLY
 * (con el `{photo_scan_enabled && (<div>...)}` original) y sigue existiendo
 * hoy si alguien reintrodujera un wrapper. El fix (sin wrapper, `style` viaja
 * como prop hasta la raíz que el propio componente colapsa a null) protege
 * ese caso independientemente del añadido/quitado del gate de dispositivo —
 * por eso este archivo se RENOMBRA (el contrato sigue vivo) en vez de
 * eliminarse.
 *
 * Fix vigente: sin <div> wrapper en ningún camino, <PantryScanButton>
 * desnudo, pasando `style` (merge sobre la raíz que el propio componente
 * retorna null si `enabled` es false — cero DOM extra) y
 * `enabled={!!pantryStatus?.photo_scan_enabled}` directo como prop (mismo
 * mecanismo que ya usaba QPantryBuilder.jsx — un solo camino, no dos).
 *
 * Por qué este test es parser-based (regex sobre el source) y NO un montaje
 * RTL de <Pantry/>: Pantry.jsx es una página de ~3200 líneas que depende de
 * AssessmentContext, useDisabledIngredients, framer-motion y múltiples fetches
 * concurrentes en mount (inventario, master list, pantry-status, disabled
 * ingredients). CERO test existente en el repo monta <Pantry/> con
 * @testing-library/react — la convención establecida para este archivo
 * (ver Pantry.p3_audit_8_recalc_after_change.test.js) es exactamente esta:
 * parsear el source y anclar el invariante estructural. El mecanismo
 * FUNCIONAL (que `style` de hecho aterriza en la raíz sin nodo extra, y que
 * `enabled=false` colapsa a cero DOM) ya está cubierto con RTL en
 * PantryScanButton.p1_pantry_scan_pc_upload.test.jsx — este archivo solo
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

describe('P1-PANTRY-SCAN-PC-UPLOAD · Pantry.jsx sin wrapper vacío alrededor de PantryScanButton', () => {
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

    // [P1-PANTRY-SCAN-TOOLBAR · 2026-08-14] Antes se exigía `style={{...}}` con
    // margen en LAS DOS instancias, porque ambas colgaban sueltas y ese margen
    // sustituía al wrapper eliminado. La de escritorio se mudó DENTRO de la
    // barra, donde la separación la da el `gap` del flex — pedirle un margen
    // propio ahí la desalinearía de sus vecinos. Cada una resuelve su
    // separación por el medio que le toca, y eso es lo que se comprueba.
    test('cada instancia resuelve su separación: la suelta con margen, la de barra con el gap', () => {
        const src = readPantry();
        const re = /<PantryScanButton\b/g;
        let m;
        const tags = [];
        while ((m = re.exec(src)) !== null) {
            tags.push(extractTag(src, m.index));
        }
        expect(tags).toHaveLength(2);
        const enBarra = tags.filter((t) => /compact/.test(t));
        const sueltas = tags.filter((t) => !/compact/.test(t));
        expect(enBarra, 'debe haber exactamente una instancia en la barra').toHaveLength(1);
        expect(enBarra[0], 'la de la barra NO lleva margen propio: rompería la línea')
            .not.toMatch(/style=\{\{/);
        expect(sueltas, 'la del topbar móvil sigue suelta').toHaveLength(1);
        expect(sueltas[0], 'la suelta conserva su separación inline')
            .toMatch(/marginTop:\s*'0\.6rem'/);
    });

    // [P1-PANTRY-SCAN-PC-UPLOAD] Ninguna ocurrencia debe re-introducir un
    // gate por capacidad de dispositivo (pointer/matchMedia) EN Pantry.jsx —
    // esa decisión vive 100% dentro de PantryScanButton.jsx. Si Pantry.jsx
    // empezara a condicionar el render en base a `matchMedia`/`pointer`,
    // volveríamos a las dos rutas de gate que P0-NEW-A-style ya cerró.
    test('Pantry.jsx no condiciona PantryScanButton por pointer/matchMedia — esa decisión es interna al componente', () => {
        const src = readPantry();
        const re = /<PantryScanButton\b/g;
        let m;
        const tags = [];
        while ((m = re.exec(src)) !== null) {
            tags.push(extractTag(src, m.index));
        }
        tags.forEach((tag) => {
            expect(tag).not.toMatch(/pointer|matchMedia|coarse/i);
        });
    });
});
