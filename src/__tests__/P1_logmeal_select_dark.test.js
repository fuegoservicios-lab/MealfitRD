/* [P1-LOGMEAL-SELECT-DARK · 2026-08-12] Los <select> de los dos modales de
 * registrar comida (LogMealModal y su gemelo ScanMealModal).
 *
 * Dos defectos que el dueño vio juntos: «esto visualmente en modo oscuro no me
 * gusta, el modo claro está perfecto» + «la flechita hacia abajo del menú de
 * hoy está muy pegada al borde».
 *
 *  1. La FLECHA la dibuja el navegador y NO se mueve con relleno — medido en
 *     banco con tres selects nativos a 0,7rem / 1,2rem / 2rem de padding-right:
 *     la flecha sale en el mismo píxel en los tres. La única salida es apagar
 *     la nativa (`appearance: none`) y poner la nuestra con posición declarada.
 *  2. El DESPLEGABLE lo pinta el sistema: por eso el claro salía bien y el
 *     oscuro abría una lista gris. Chrome elige la variante por el
 *     `color-scheme` DEL ELEMENTO, no por el heredado del <html> (precedente ya
 *     escrito en `.mf-chip-select`, index.css).
 *
 * LA TRAMPA que este guard vigila: el bloque oscuro de ambos módulos agrupa el
 * select con otros controles y usaba el ATAJO `background:`, que resetea
 * `background-image` — o sea, borraba la flecha propia sin mencionarla. Si
 * alguien vuelve al atajo, la flecha desaparece solo en tema oscuro.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '../components/dashboard');
const MODULOS = [
    ['LogMealModal.module.css', '.select'],
    ['ScanMealModal.module.css', '.selectInput'],
];

const bloque = (css, selector) => {
    const i = css.indexOf(`\n${selector} {`);
    return i === -1 ? '' : css.slice(i, css.indexOf('}', i));
};

describe.each(MODULOS)('[P1-LOGMEAL-SELECT-DARK] %s', (archivo, clase) => {
    const css = fs.readFileSync(path.join(DIR, archivo), 'utf8');

    it('la flecha es propia y con aire declarado, no la del navegador', () => {
        const base = bloque(css, clase);
        expect(base, `no se encontró ${clase}`).not.toBe('');
        // Sin anclar el inicio, `-webkit-appearance` satisface el patrón y la
        // mutación «quitar appearance: none» pasa en verde — comprobado.
        expect(base, 'falta `appearance: none` sin prefijo').toMatch(/(^|[\s;{])appearance:\s*none/m);
        expect(base).toMatch(/-webkit-appearance:\s*none/);
        expect(base, 'sin flecha propia vuelve la nativa, pegada al canto').toMatch(/background-image:\s*url\("data:image\/svg\+xml/);
        expect(base, 'la flecha necesita su posición declarada').toMatch(/background-position:\s*right/);
        // El hueco donde vive: sin relleno derecho, la flecha se monta sobre el texto.
        expect(base).toMatch(/padding:[^;]*rem\s+[12](\.\d+)?rem/);
    });

    it('el desplegable sigue al tema en los DOS temas', () => {
        expect(bloque(css, clase), 'falta el color-scheme claro').toMatch(/color-scheme:\s*light/);
        const oscuro = css.slice(css.indexOf(`:global(html[data-theme="dark"]) ${clase} {`));
        expect(oscuro, 'el select no declara su color-scheme oscuro: la lista abre gris del sistema')
            .toMatch(/color-scheme:\s*dark/);
    });

    it('el bloque oscuro no usa el atajo `background` sobre el select', () => {
        // El atajo resetea background-image y borra la flecha SOLO en oscuro.
        const reglasConSelect = [...css.matchAll(/:global\(html\[data-theme="dark"\]\)[^{]*\{[^}]*\}/g)]
            .map((m) => m[0])
            .filter((r) => r.includes(clase));
        expect(reglasConSelect.length, 'ninguna regla oscura alcanza al select').toBeGreaterThan(0);
        for (const regla of reglasConSelect) {
            expect(
                /(^|[\s;{])background:\s/.test(regla),
                `una regla oscura usa el atajo \`background\` sobre ${clase}: eso resetea `
                + 'background-image y borra la flecha propia sin nombrarla',
            ).toBe(false);
        }
    });
});
