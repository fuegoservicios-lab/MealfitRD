// [P2-SWAP-SHEET-SCROLL + P2-SWAP-BTN-TOUCH · 2026-09-03] «En móvil no me deja darle scroll para
// abajo para ver la última opción, "No me gusta el plato"». La hoja de motivos llevaba
// `drag="y"` en el MISMO elemento que scrolleaba: framer-motion se queda con el gesto vertical
// (touch-action) y el contenido no baja. Ahora el arrastre-para-cerrar arranca solo desde el
// tirador (dragControls) y el contenido scrollea en un hijo propio con pan-y. De paso, los
// botones «Cambiar Plato» y «Actualizar platos» en táctil: hover solo con puntero fino (el
// :hover se quedaba pegado tras el tap), :active visible y objetivos de 44/48 px.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const MODAL = read('src/components/dashboard/MotivoActualizarModal.jsx');
const DASH = read('src/pages/Dashboard.jsx');

describe('hoja de motivos: scroll y arrastre separados', () => {
    it('el arrastre arranca solo desde el tirador', () => {
        expect(MODAL).toContain('import { motion, AnimatePresence, useDragControls } from "framer-motion";');
        expect(MODAL).toContain('const dragControls = useDragControls();');
        expect(MODAL).toContain('dragListener={false}');
        expect(MODAL).toContain('dragControls={dragControls}');
        expect(MODAL).toContain('onPointerDown={(e) => dragControls.start(e)}');
        const handle = MODAL.indexOf('onPointerDown={(e) => dragControls.start(e)}');
        expect(MODAL.slice(handle, handle + 300)).toContain('touchAction: "none"');
    });
    it('el contenido scrollea en un hijo con pan-y, no en la hoja arrastrable', () => {
        const i = MODAL.indexOf('drag={sheet ? "y" : false}');
        const j = MODAL.indexOf('{/* drag handle', i);
        expect(i).toBeGreaterThan(0);
        expect(j).toBeGreaterThan(i);
        const sheetProps = MODAL.slice(i, j);
        expect(sheetProps).not.toContain('overflowY: "auto",');
        expect(sheetProps).toContain('overflowY: sheet ? "hidden" : "auto",');
        expect(sheetProps).toContain('display: sheet ? "flex" : undefined,');
        const k = MODAL.indexOf('className="mfa-scroll"');
        expect(k).toBeGreaterThan(j);
        const scroll = MODAL.slice(k, k + 260);
        expect(scroll).toContain('overflowY: "auto"');
        expect(scroll).toContain('touchAction: "pan-y"');
        expect(scroll).toContain('overscrollBehavior: "contain"');
        expect(scroll).toContain('minHeight: 0, flex: "1 1 auto"');
    });
});

describe('botones de cambiar/actualizar en táctil', () => {
    it('Cambiar Plato: hover solo con puntero fino, :active táctil y 44px', () => {
        const i = DASH.indexOf('.meal-act-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }');
        expect(i).toBeGreaterThan(0);
        const block = DASH.slice(i, i + 1800);
        expect(block).toContain('@media (hover: hover) {');
        expect(block.indexOf('@media (hover: hover) {')).toBeLessThan(block.indexOf('.meal-act-btn:hover:not(:disabled) {'));
        expect(block).toContain('html[data-theme="dark"] .meal-act-btn:hover:not(:disabled) {');
        expect(block).toContain('.meal-act-btn:active:not(:disabled) {\n                                filter: brightness(0.9);');
        expect(block).toContain('@media (pointer: coarse) {');
        expect(block).toContain('.meal-actions-row .meal-act-btn {\n                                    height: 44px !important;\n                                    min-width: 44px;');
    });
    it('Actualizar platos: hover bajo (hover: hover) y 48px en táctil', () => {
        const i = DASH.indexOf('.new-plan-btn:hover:not(:disabled):not([aria-disabled="true"]) {');
        expect(i).toBeGreaterThan(0);
        expect(DASH.slice(i - 120, i)).toContain('@media (hover: hover) {');
        expect(DASH).toContain('.new-plan-btn { min-height: 48px; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }');
    });
});
