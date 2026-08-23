/**
 * [P1-CHAT-KB-SCROLL-QUIETO + P1-CHAT-PICKER-ANCLADO + P1-CHAT-AIRE-INFERIOR · 2026-08-23]
 * Los tres defectos que el dueño reportó desde su iPhone con la app instalada
 * (captura de las 5:50):
 *
 *  1. El menú nativo de la foto («Fototeca / Tomar foto / Seleccionar archivo») salía
 *     flotando a media pantalla, despegado del clip. iOS lo ancla al RECTÁNGULO del
 *     `<input type="file">` que lo disparó, y el input estaba en `display: none`: sin
 *     caja no hay ancla.
 *  2. «Pregúntale a Bioboros» lamiendo el borde inferior: los 64 px de la reserva son
 *     la barra de pestañas, no aire propio de la caja.
 *  3. «Cuando scrolleo, el teclado no se queda pegado»: con el teclado abierto iOS
 *     panea durante el scroll, `layoutInset = kb − paneo` cambiaba en cada fotograma
 *     y el contenedor —y con él la caja— se movía.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { insetEstabilizado, KB_INSET_HISTERESIS_PX } from '../utils/keyboardViewport';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P1-CHAT-KB-SCROLL-QUIETO] la caja no se mueve con el ruido del paneo', () => {
    it('la primera medición siempre se aplica (no hay anterior que conservar)', () => {
        expect(insetEstabilizado(null, 336, { abierto: true, estabaAbierto: false })).toBe(336);
        expect(insetEstabilizado(undefined, 120, { abierto: true, estabaAbierto: false })).toBe(120);
    });

    it('EL DEFECTO: el ruido del scroll (< umbral) NO mueve la caja', () => {
        const anterior = 336;
        for (const ruido of [1, 8, 23]) {
            expect(insetEstabilizado(anterior, anterior - ruido, { abierto: true, estabaAbierto: true }))
                .toBe(anterior);
        }
    });

    it('un cambio real (>= umbral) sí se aplica: no es un congelador', () => {
        expect(insetEstabilizado(336, 336 - KB_INSET_HISTERESIS_PX, { abierto: true, estabaAbierto: true }))
            .toBe(336 - KB_INSET_HISTERESIS_PX);
        expect(insetEstabilizado(336, 120, { abierto: true, estabaAbierto: true })).toBe(120);
    });

    it('abrir o cerrar el teclado NUNCA se ignora: es el evento, no ruido', () => {
        // se cierra con un delta pequeño respecto al anterior
        expect(insetEstabilizado(10, 0, { abierto: false, estabaAbierto: true })).toBe(0);
        // se abre
        expect(insetEstabilizado(0, 12, { abierto: true, estabaAbierto: false })).toBe(12);
    });

    it('con el teclado cerrado no hay nada que estabilizar', () => {
        expect(insetEstabilizado(300, 0, { abierto: false, estabaAbierto: false })).toBe(0);
    });

    it('`forzar` (el asiento tras 350 ms de silencio) salta la histéresis', () => {
        expect(insetEstabilizado(336, 330, { abierto: true, estabaAbierto: true })).toBe(336);
        expect(insetEstabilizado(336, 330, { abierto: true, estabaAbierto: true, forzar: true })).toBe(330);
    });

    it('valores basura no rompen ni devuelven negativos', () => {
        expect(insetEstabilizado(null, -50, { abierto: true, estabaAbierto: false })).toBe(0);
        expect(insetEstabilizado(null, NaN, { abierto: true, estabaAbierto: false })).toBe(0);
    });

    it('AgentPage aplica la histéresis y el asiento la fuerza', () => {
        const src = read('pages/AgentPage.jsx');
        expect(src).toMatch(/insetEstabilizado\(insetAplicadoRef\.current, objetivo/);
        expect(src, 'el asiento debe forzar: si no, la última medida buena podría quedar ignorada')
            .toMatch(/asiento = null; updateInputPosition\(true\)/);
        // el valor aplicado es el que se escribe: escribir `layoutInset` a pelo
        // reintroduce el defecto sin cambiar de forma.
        expect(src).toMatch(/setProperty\('--kb-inset', `\$\{aplicado\}px`\)/);
    });
});

describe('[P1-CHAT-PICKER-ANCLADO] el menú de la foto sale del clip', () => {
    it('el input de fichero tiene caja (no display:none) y está superpuesto al botón', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('type="file"');
        expect(i).toBeGreaterThan(0);
        const bloque = src.slice(i, i + 700);
        expect(bloque, 'sin rectángulo, iOS ancla el menú donde puede')
            .not.toMatch(/display:\s*'none'/);
        expect(bloque).toMatch(/position:\s*'absolute'/);
        expect(bloque).toMatch(/opacity:\s*0/);
        // el toque sigue siendo del botón
        expect(bloque).toMatch(/pointerEvents:\s*'none'/);
    });

    it('el input no es alcanzable por teclado ni por lector de pantalla (lo anuncia el botón)', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('type="file"');
        const bloque = src.slice(i, i + 700);
        expect(bloque).toMatch(/aria-hidden="true"/);
        expect(bloque).toMatch(/tabIndex=\{-1\}/);
    });
});

describe('[P1-CHAT-AIRE-INFERIOR] la caja no lame el borde', () => {
    it('con teclado cerrado, el aire propio va por encima de 0.8rem', () => {
        const src = read('pages/AgentPage.jsx');
        const m = src.match(/padding: 0\.8rem 1\.25rem calc\((\d+(?:\.\d+)?)rem \+ 64px/);
        expect(m, 'no encontré el padding de .input-wrapper').toBeTruthy();
        expect(parseFloat(m[1])).toBeGreaterThan(0.8);
    });

    it('con teclado abierto también', () => {
        const src = read('pages/AgentPage.jsx');
        const i = src.indexOf('html[data-kb-open] .input-wrapper {');
        expect(i).toBeGreaterThan(0);
        const regla = src.slice(i, src.indexOf('}', i));
        const m = regla.match(/padding-bottom:\s*(\d+(?:\.\d+)?)rem/);
        expect(m).toBeTruthy();
        expect(parseFloat(m[1])).toBeGreaterThan(0.8);
    });
});
