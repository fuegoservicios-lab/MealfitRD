// [P1-SETTINGS-HEADER-GUTTER · 2026-08-10] La X del diálogo de Configuración estaba
// pegada al texto en el móvil.
//
// LA CAUSA, y no es «faltaba padding»: el botón es `position: absolute`, o sea que
// está FUERA DEL FLUJO — el título y el subtítulo no pueden saber que existe. La
// cabecera va centrada con 8px de margen lateral mientras el botón ocupa ~53px por la
// derecha, así que cualquier texto que llegue al borde corre por debajo de él.
// «Gustos, cocina, equipo y más para mejores planes» es exactamente eso.
//
// EL ARREGLO se ancla aquí porque lo que importa no es el número: es que la canaleta
// se CALCULE desde el botón. Un padding a ojo sería correcto hasta el próximo cambio
// de tamaño o de fuente — que es justo cómo nació este defecto, y la misma forma que
// ya vimos en P1-MACRO-LABEL-GUTTER (canaleta de 78px con un rótulo de 98).
//
// Simétrica a propósito: el título va centrado, así que reservar solo por la derecha
// lo descentraría respecto del panel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages', 'Settings.module.css'),
    'utf-8',
);

const regla = (selector) => {
    const i = CSS.indexOf(selector);
    expect(i, `desapareció la regla ${selector}`).toBeGreaterThan(0);
    return CSS.slice(i, CSS.indexOf('}', i));
};

describe('[P1-SETTINGS-HEADER-GUTTER] el texto de la cabecera no puede pisar la X', () => {
    it('el tamaño del botón vive en variables, no repartido por el archivo', () => {
        const raiz = regla('.inDialog {');
        expect(raiz).toMatch(/--settings-close-size:\s*\d+px/);
        expect(raiz).toMatch(/--settings-close-inset:/);
    });

    it('la canaleta de la cabecera se DERIVA del botón, no es un número suelto', () => {
        const cab = regla('.inDialog .pageHeader {');
        for (const lado of ['padding-left', 'padding-right']) {
            const m = cab.match(new RegExp(`${lado}:\\s*([^;]+);`));
            expect(m, `falta ${lado} en la cabecera`).toBeTruthy();
            const valor = m[1];
            expect(valor, `${lado} debe ser un calc(), no un número suelto`).toMatch(/calc\(/);
            expect(valor, `${lado} debe partir del tamaño del botón`).toContain('--settings-close-size');
            expect(valor, `${lado} debe sumar la separación del botón`).toContain('--settings-close-inset');
        }
    });

    it('y es simétrica: el título va centrado', () => {
        const cab = regla('.inDialog .pageHeader {');
        const izq = cab.match(/padding-left:\s*([^;]+);/);
        const der = cab.match(/padding-right:\s*([^;]+);/);
        expect(izq && der).toBeTruthy();
        expect(izq[1].trim()).toBe(der[1].trim());
    });

    it('el botón usa esas mismas variables (si no, la canaleta mide otra cosa)', () => {
        const btn = regla('.inDialog .exitSettingsBtn {');
        expect(btn).toMatch(/width:\s*var\(--settings-close-size\)/);
        expect(btn).toMatch(/height:\s*var\(--settings-close-size\)/);
        expect(btn).toMatch(/right:\s*var\(--settings-close-inset\)/);
        // El padding suelto que había antes falseaba el ancho real del botón y por
        // tanto la canaleta que se calcula a partir de él.
        expect(btn).toMatch(/padding:\s*0\s*;/);
    });

    it('la zona táctil llega a 44px sin agrandar el dibujo', () => {
        // Ampliar el botón se comería la canaleta; se estira solo el área sensible.
        const after = regla('.inDialog .exitSettingsBtn::after {');
        const m = after.match(/inset:\s*(-?\d+)px/);
        expect(m, 'falta el ::after que amplía la zona táctil').toBeTruthy();
        const size = Number(regla('.inDialog {').match(/--settings-close-size:\s*(\d+)px/)[1]);
        const tactil = size + 2 * Math.abs(Number(m[1]));
        expect(tactil, `zona táctil de ${tactil}px`).toBeGreaterThanOrEqual(44);
    });
});
