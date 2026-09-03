/* [P1-CTA-FILL-DEPTH · 2026-08-14] El relleno del CTA sólido: profundo, y no
 * la mancha luminosa que era en tema oscuro.
 *
 * «El botón que dice Añadir se ve muy brilloso». Medido, era literalmente la
 * superficie más luminosa de la pantalla: relleno en L* 68,2 sobre un panel de
 * 8,3 —destaca +60— porque el gradiente usaba `--primary-light → --primary`, y
 * en tema oscuro ESOS tokens se aclaran a propósito para servir de tinta y
 * acento sobre fondo oscuro. Usarlos como RELLENO invierte su intención.
 *
 * Y el brillo no era todo: el texto blanco encima medía 2,43:1, muy por debajo
 * de AA. Parte de la sensación de «brilloso» era el texto lavado. En tema
 * claro tampoco llegaba (4,34:1) — el gradiente vivía en un punto incómodo:
 * demasiado claro para tinta blanca, demasiado oscuro para tinta negra.
 *
 * El relleno pasa a token por tema:
 *   · claro  → `primary → primary-dark`: L* 34,6, texto blanco 7,89:1.
 *   · oscuro → los mismos, rebajados un 25% contra el panel: L* 44,8 (baja 23
 *     puntos, deja de deslumbrar) y texto blanco 5,42:1.
 * Con ambos rellenos profundos, la tinta es BLANCA en los dos temas — lo que
 * además cierra una divergencia vieja: escritorio la ponía blanca y móvil casi
 * negra sobre el MISMO gradiente.
 *
 * Se aplica a los cinco sitios a la vez. La lección de esta misma semana: el
 * usuario los ve como un único botón, y arreglar uno solo los vuelve a separar.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const leer = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CTA_CSS = [
    ['pages/Pantry.fridge.module.css', '.add'],
    ['pages/Pantry.mobileFridge.module.css', '.add'],
    ['components/recipes/RecipesView.module.css', '.primary'],
    ['components/recipes/MobileRecipes.module.css', '.primary'],
];

const bloque = (css, clase) => {
    const m = sinComentarios(css).match(new RegExp(`(^|\\n)\\s*\\${clase}\\s*\\{([^}]*)\\}`));
    return m ? m[2] : '';
};

describe('[P1-CTA-FILL-DEPTH] el relleno del CTA no deslumbra', () => {
    it('el token existe en los DOS temas y en oscuro es más profundo', () => {
        const ds = sinComentarios(leer('index.css'));
        const claro = ds.slice(ds.indexOf(':root'), ds.indexOf('html[data-theme="dark"]'));
        const oscuro = ds.slice(ds.indexOf('html[data-theme="dark"]'));
        expect(claro, 'falta --cta-fill en el tema claro').toMatch(/--cta-fill:/);
        expect(oscuro, 'falta --cta-fill en el tema oscuro').toMatch(/--cta-fill:/);
        // En oscuro NO puede ser la tinta cruda (--primary / --primary-light son
        // claros a propósito). [P2-PRIMARY-FILL-INK · 2026-09-03] La receta ya no es
        // obligatoria (la mezcla con el panel apagaba el color): vale un índigo
        // profundo literal; el contraste resultante lo mide test_p1_primary_fill_depth.py.
        const mOsc = oscuro.match(/--cta-fill:\s*([^;]+);/);
        expect(mOsc[1], 'el relleno oscuro no puede ser la tinta cruda')
            .not.toMatch(/var\(--primary(-light)?\)\s*[,)]/);
        expect(mOsc[1]).not.toMatch(/--primary-light/);
    });

    it.each(CTA_CSS)('%s %s se rellena con el token', (archivo, clase) => {
        const cuerpo = bloque(leer(archivo), clase);
        expect(cuerpo, `${clase} no usa var(--cta-fill)`).toMatch(/background:\s*var\(--cta-fill\)/);
        expect(cuerpo, 'volvió el gradiente que aclaraba el botón en tema oscuro')
            .not.toMatch(/--primary-light/);
    });

    it.each(CTA_CSS)('%s %s lleva tinta BLANCA (ambos rellenos son profundos)', (archivo, clase) => {
        // Cierra además la divergencia vieja: escritorio blanco / móvil #0B1120
        // sobre el mismo gradiente. Con el relleno profundo, el casi-negro sería
        // ilegible: medido 2,4:1 en oscuro.
        const cuerpo = bloque(leer(archivo), clase);
        expect(cuerpo).toMatch(/color:\s*#FFF(FFF)?/i);
        expect(cuerpo, 'la tinta casi negra no se lee sobre un relleno profundo')
            .not.toMatch(/#0B1120/i);
    });

    it('el CTA inline del Historial usa el mismo token y la misma tinta', () => {
        const jsx = sinComentarios(leer('components/history/HistoryDesktopPanel.jsx'));
        const i = jsx.indexOf('if (variant === "primary")');
        expect(i).toBeGreaterThan(-1);
        const rama = jsx.slice(i, i + 320);
        expect(rama, 'el botón del Historial se quedaría con el relleno viejo')
            .toMatch(/var\(--cta-fill\)/);
        expect(rama).not.toMatch(/--primary-light/);
        expect(rama).toMatch(/#FFF(FFF)?/i);
    });
});
