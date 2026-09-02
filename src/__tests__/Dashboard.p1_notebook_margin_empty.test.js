/**
 * [P1-NOTEBOOK-MARGIN-EMPTY · 2026-08-21] «El subrayado de cuando está bloqueado
 * se ve mal visualmente ya que choca con las rayas rojas».
 *
 * Las dos rayas rojas son el margen del cuaderno (`.meals-container::before`,
 * pseudo-elemento POSICIONADO que pinta por ENCIMA de los hijos en flujo). Cuando
 * el día activo no tiene platos —pausa por nevera, «cocinando», programado— el
 * cuaderno muestra un EmptyState y el banner ámbar, y el margen las atraviesa:
 * una línea de margen sin filas que anotar es exactamente el defecto reportado.
 *
 * El fix es un gate por CLASE (`meals-container--sin-filas`), no borrar la
 * decoración: el margen está calibrado dos veces por el dueño
 * (DASH-NOTEBOOK-SOFTEN, P1-NOTEBOOK-MARGIN-LIGHT) y sigue intacto cuando hay
 * platos. La condición reutiliza el MISMO predicado de suplementos del render
 * (`_isSupplementEntry`, hoisted a scope de módulo) — dos copias del predicado
 * divergen (lección P1-DIET-CANON-SSOT).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DASH = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Dashboard.jsx'),
    'utf8',
);

/** Cuerpo de una regla CSS dentro del <style> de Dashboard.jsx (mismo helper que
 *  P1_notebook_margin_light: escapa TODOS los metacaracteres). */
function reglaCss(selector) {
    const re = new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm');
    const m = re.exec(DASH);
    if (!m) return null;
    const abre = DASH.indexOf('{', m.index);
    let nivel = 0;
    for (let j = abre; j < DASH.length; j++) {
        if (DASH[j] === '{') nivel++;
        else if (DASH[j] === '}') { nivel--; if (nivel === 0) return { cuerpo: DASH.slice(abre + 1, j), inicio: m.index }; }
    }
    return null;
}

describe('[P1-NOTEBOOK-MARGIN-EMPTY] el margen rojo no atraviesa el estado vacío/pausado', () => {
    it('existe la regla que apaga el margen sin filas, y apaga de verdad', () => {
        const regla = reglaCss('.meals-container--sin-filas::before');
        expect(regla, 'desapareció la regla .meals-container--sin-filas::before').toBeTruthy();
        expect(regla.cuerpo).toMatch(/display:\s*none/);
    });

    it('la regla del gate va DESPUÉS de la base (cascada: misma especificidad, gana la última)', () => {
        const base = reglaCss('.meals-container::before');
        const gate = reglaCss('.meals-container--sin-filas::before');
        expect(base).toBeTruthy();
        expect(gate).toBeTruthy();
        expect(
            gate.inicio,
            'el gate quedó ANTES de la base: misma especificidad, la base lo pisa y el margen reaparece',
        ).toBeGreaterThan(base.inicio);
    });

    it('el contenedor recibe la clase condicionalmente según haya platos en el día', () => {
        // La clase tiene que salir de una CONDICIÓN, no estar fija: fija apagaría
        // el margen también con platos (borrar la decoración calibrada del dueño).
        expect(DASH).toMatch(/meals-container\$\{[^}]*dayHasMealCards[^}]*meals-container--sin-filas/);
    });

    it('el predicado de suplementos es UNO solo (scope de módulo), no dos copias', () => {
        const defs = DASH.match(/const _isSupplementEntry\s*=/g) || [];
        expect(defs.length, 'hay ' + defs.length + ' definiciones de _isSupplementEntry: dos copias divergen').toBe(1);
        // Y la condición del gate lo usa — no una re-implementación inline.
        expect(DASH).toMatch(/dayHasMealCards\s*=[^;]*_isSupplementEntry/);
    });
});

describe('[P1-PAUSED-BANNER-NOTEBOOK] el aviso convive con el margen cuando sí hay platos', () => {
    it('el banner tiene una clase propia y se desplaza solo en escritorio', () => {
        expect(DASH).toMatch(/role="status"\s+className="chunk-paused-banner"/);

        const desktop = DASH.match(/@media \(min-width:\s*769px\)\s*\{\s*\.chunk-paused-banner\s*\{([^}]*)\}/);
        expect(desktop, 'falta el ajuste exclusivo de escritorio para el aviso pausado').toBeTruthy();
        expect(desktop[1]).toMatch(/margin-left:\s*4rem/);
        expect(desktop[1]).toMatch(/margin-right:\s*2rem/);
    });
});
