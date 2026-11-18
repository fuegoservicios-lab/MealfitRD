/**
 * [P1-PLAN-LOTE-1073 · 2026-11-17] «Añade a tu Nevera»: el dueño quiere cerrarla «sin darle a la X». En móvil la hoja
 * se arrastra hacia abajo desde la cabecera (y desde las sugerencias) y se cierra al soltar pasado el umbral; tocar la
 * barrita también la cierra. Cabecera, buscador y chips en su módulo de CSS (tokens, «+» índigo).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/Pantry.jsx'), 'utf8');
const CSS = readFileSync(resolve(process.cwd(), 'src/pages/Pantry.hojaAnadir.module.css'), 'utf8');

describe('[1073] cerrar la hoja sin la X', () => {
    it('la hoja se arrastra en vertical solo desde sus asas y se cierra al soltar pasado el umbral', () => {
        expect(SRC).toContain('useDragControls');
        expect(SRC).toMatch(/drag: 'y',\s+dragControls: addSheetDrag,\s+dragListener: false/);
        expect(SRC).toContain('dragElastic: { top: 0, bottom: 0.7 }');
        expect(SRC).toMatch(/info\.offset\.y > 80 \|\| info\.velocity\.y > 450\) _closeAddMenu\(\)/);
        // las dos asas: la cabecera y la zona de sugerencias
        expect((SRC.match(/onPointerDown=\{isMobileLayout \? _empezarArrastreHoja : undefined\}/g) || []).length).toBe(2);
    });

    it('la barrita es un botón que cierra, y el gesto no se lo queda el scroll', () => {
        expect(SRC).toMatch(/className=\{hstyles\.asa\} onClick=\{_closeAddMenu\} aria-label=\{t\('Cerrar'\)\}/);
        expect(CSS).toMatch(/\.arrastrable \{ touch-action: none;/);
    });

    it('el buscador tiene «limpiar» y los chips son del módulo, con el «+» índigo y sin colores sueltos', () => {
        expect(SRC).toContain("aria-label={t('Limpiar búsqueda')}");
        expect(SRC).not.toContain('ADD_CHIP_STYLE}');
        expect(CSS).toContain('.chip svg { color: var(--primary);');
        expect(CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(CSS).toMatch(/font-size: 1rem;/);   // ≥16 px en el campo: iOS no hace zoom
    });
});
