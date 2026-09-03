// [P2-SWAP-SHEET-SCROLL + P2-SWAP-BTN-TOUCH · 2026-09-03] «En móvil no me deja darle scroll para
// abajo para ver la última opción, "No me gusta el plato"». La hoja de motivos llevaba
// `drag="y"` de framer en el MISMO elemento que scrolleaba y framer se quedaba con el gesto.
// Segunda vuelta el mismo día: limitar el arrastre al tirador tampoco sirvió («por inercia
// uno quiere salir deslizando el menú hacia abajo») y la barra de scroll chocaba con el chip
// del cupo «5/10». Ahora: gesto propio con eventos touch — el contenido scrollea nativo; si
// está arriba del todo y el dedo baja, la hoja sigue al dedo (motion value) y al soltar
// cierra por distancia o velocidad, o vuelve con muelle. De paso, «Cambiar Plato» y
// «Actualizar platos» en táctil: hover solo con puntero fino, :active visible, 44/48 px.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const MODAL = read('src/components/dashboard/MotivoActualizarModal.jsx');
const DASH = read('src/pages/Dashboard.jsx');

describe('hoja de motivos: scroll nativo y deslizar-para-cerrar desde cualquier punto', () => {
    it('sin drag de framer en la hoja; el gesto es propio (touch) y sigue al dedo con un motion value', () => {
        expect(MODAL).toContain('import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";');
        expect(MODAL).not.toContain('useDragControls');
        expect(MODAL).not.toContain('drag={sheet');
        expect(MODAL).not.toContain('dragListener');
        expect(MODAL).toContain('const sheetY = useMotionValue(0);');
        expect(MODAL).toContain('onTouchStart={sheet ? onSheetTouchStart : undefined}');
        expect(MODAL).toContain('onTouchMove={sheet ? onSheetTouchMove : undefined}');
        expect(MODAL).toContain('onTouchEnd={sheet ? onSheetTouchEnd : undefined}');
        expect(MODAL).toContain('onTouchCancel={sheet ? onSheetTouchEnd : undefined}');
        expect(MODAL).toContain('...(sheet ? { y: sheetY } : {}),');
    });
    it('la hoja solo sigue al dedo si el contenido está arriba y el dedo baja; si no, el gesto es del scroll', () => {
        const i = MODAL.indexOf('const onSheetTouchMove = (e) => {');
        expect(i).toBeGreaterThan(0);
        const fn = MODAL.slice(i, MODAL.indexOf('const onSheetTouchEnd', i));
        expect(fn).toContain('const atTop = !scrollRef.current || scrollRef.current.scrollTop <= 0;');
        expect(fn).toContain('if (dy > 8 && atTop) g.active = true;');
        expect(fn).toContain('else if (dy < -8 || !atTop) { g.y0 = null; return; }');
        expect(fn).toContain('sheetY.set(Math.max(0, dy - 8));');
        const j = MODAL.indexOf('const onSheetTouchEnd = () => {');
        const end = MODAL.slice(j, j + 600);
        expect(end).toContain('if ((y > 110 || g.vy > 0.6) && !busy) handleClose();');
        expect(end).toContain('else animate(sheetY, 0, { type: "spring", damping: 30, stiffness: 320 });');
    });
    it('el contenido scrollea en un hijo con pan-y, con el padding lateral y sin barra visible', () => {
        const i = MODAL.indexOf('onTouchStart={sheet ? onSheetTouchStart : undefined}');
        const j = MODAL.indexOf('{/* drag handle', i);
        expect(j).toBeGreaterThan(i);
        const sheetProps = MODAL.slice(i, j);
        expect(sheetProps).not.toContain('overflowY: "auto",');
        expect(sheetProps).toContain('overflowY: sheet ? "hidden" : "auto",');
        expect(sheetProps).toContain('display: sheet ? "flex" : undefined,');
        expect(sheetProps).toContain('padding: sheet ? "8px 0 calc(18px + env(safe-area-inset-bottom, 0px))" : 22,');
        const k = MODAL.indexOf('className="mfa-scroll"');
        expect(k).toBeGreaterThan(j);
        expect(MODAL.slice(k - 60, k)).toContain('ref={scrollRef}');
        const scroll = MODAL.slice(k, k + 320);
        expect(scroll).toContain('overflowY: "auto"');
        expect(scroll).toContain('touchAction: "pan-y"');
        expect(scroll).toContain('overscrollBehavior: "none"');
        expect(scroll).toContain('padding: "0 18px"');
        expect(scroll).toContain('scrollbarWidth: "none"');
        expect(MODAL).toContain('.mfa-scroll::-webkit-scrollbar{display:none}');
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
