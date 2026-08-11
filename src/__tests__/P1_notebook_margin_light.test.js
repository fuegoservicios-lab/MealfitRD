/**
 * [P1-NOTEBOOK-MARGIN-LIGHT · 2026-08-11] «Las dos líneas rojas del cuaderno se sienten
 * muy transparentes en modo claro».
 *
 * NO ERA UNA CUESTION DE GUSTO, y por eso se pudo medir. La misma línea de margen se
 * despega del papel:
 *
 *   tema oscuro  rgba(251,113,133,.35) sobre #111827  →  ΔL* 20,8
 *   tema claro   rgba(248,113,113,.22) sobre #FDFCF8  →  ΔL*  8,3   ← menos de la mitad
 *
 * El softening de junio (`DASH-NOTEBOOK-SOFTEN`, 0.4 → 0.22) se calibró mirando el tema
 * oscuro, donde el rojo sobre un fondo casi negro aguanta un alpha bajo. Sobre el papel
 * crema, ese mismo 0.22 compone un rosa casi indistinguible del fondo. Es el mismo modo
 * de fallo que P1-LIGHT-INK-CONTRACT: un valor afinado contra un tema, heredado por el
 * otro sin volver a medir.
 *
 * El anclaje es la GEMELA, no un número bonito: es el mismo elemento en los dos temas,
 * así que si en uno se lee y en el otro no, lo que falla es la paridad. Este guard
 * afirma exactamente eso —claro ≥ oscuro— y no un alpha concreto, para que ajustar el
 * tono no obligue a tocar el test.
 *
 * ΔL* y no ratio WCAG: es una superficie de 1px, no texto.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DASH = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Dashboard.jsx'),
    'utf8',
);

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const Lestrella = ([r, g, b]) => {
    const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
};
const componer = (tinta, alfa, fondo) => tinta.map((c, i) => c * alfa + fondo[i] * (1 - alfa));
const deltaL = (tinta, alfa, fondo) => Math.abs(Lestrella(componer(tinta, alfa, fondo)) - Lestrella(fondo));

const PAPEL_CLARO = [253, 252, 248];  // #FDFCF8 — `.meals-container` en claro
const PAPEL_OSCURO = [17, 24, 39];    // #111827 — var(--bg-card) en oscuro

/** Cuerpo de una regla CSS dentro del <style> de Dashboard.jsx, contando llaves. */
function reglaCss(selector) {
    // Escapa TODOS los metacaracteres, no solo `.` y `*`: el selector del tema oscuro
    // lleva `[data-theme="dark"]`, y unos corchetes sin escapar se leen como una clase
    // de caracteres — la regla existe y el test juraba que había desaparecido.
    const re = new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm');
    const m = re.exec(DASH);
    if (!m) return null;
    const abre = DASH.indexOf('{', m.index);
    let nivel = 0;
    for (let j = abre; j < DASH.length; j++) {
        if (DASH[j] === '{') nivel++;
        else if (DASH[j] === '}') { nivel--; if (nivel === 0) return DASH.slice(abre + 1, j); }
    }
    return null;
}

/** `rgba(r, g, b, a)` del `border-left` de una regla. */
function tintaDe(cuerpo) {
    const m = /border-left(?:-color)?:[^;]*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(cuerpo || '');
    return m ? { rgb: [+m[1], +m[2], +m[3]], alfa: +m[4] } : null;
}

describe('[P1-NOTEBOOK-MARGIN-LIGHT] la línea del cuaderno se ve igual en los dos temas', () => {
    const claro = tintaDe(reglaCss('.meals-container::before'));
    const oscuro = tintaDe(reglaCss('html[data-theme="dark"] .meals-container::before'));

    it('las dos reglas siguen existiendo y declaran un rgba', () => {
        expect(claro, 'desapareció la línea de margen del tema claro').toBeTruthy();
        expect(oscuro, 'desapareció la línea de margen del tema oscuro').toBeTruthy();
    });

    it('en claro NO se despega menos que en oscuro', () => {
        const dClaro = deltaL(claro.rgb, claro.alfa, PAPEL_CLARO);
        const dOscuro = deltaL(oscuro.rgb, oscuro.alfa, PAPEL_OSCURO);
        expect(
            dClaro,
            `la línea del tema claro se despega ΔL* ${dClaro.toFixed(1)} del papel y la del oscuro `
            + `${dOscuro.toFixed(1)}: es el MISMO elemento, así que en claro se está viendo menos. `
            + 'Fue exactamente el defecto que el dueño reportó («se siente muy transparente»).',
        ).toBeGreaterThanOrEqual(dOscuro);
    });

    it('sigue siendo una raya de cuaderno, no un subrayador', () => {
        // El límite superior también importa: el softening de junio existía por algo.
        // A opacidad total el ΔL* llega a 34,8; ahí deja de ser un margen y compite con
        // el contenido. Se acota por medida, no por «me parece mucho».
        const dClaro = deltaL(claro.rgb, claro.alfa, PAPEL_CLARO);
        expect(dClaro, 'la línea pasó de acento a trazo dominante').toBeLessThan(30);
    });

    it('las dos rayas del par comparten tono — es una sola línea de margen', () => {
        const cuerpo = reglaCss('.meals-container::before');
        const izq = /border-left:[^;]*rgba\([^)]*\)/.exec(cuerpo)[0].replace('border-left', '');
        const der = /border-right:[^;]*rgba\([^)]*\)/.exec(cuerpo)[0].replace('border-right', '');
        expect(izq, 'las dos rayas del margen dejaron de ir a juego').toBe(der);
    });
});
