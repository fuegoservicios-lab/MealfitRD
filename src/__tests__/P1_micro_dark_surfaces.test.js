/**
 * [P1-MICRO-DARK-SURFACES · 2026-08-11] «Mejora cómo se ve el panel de micronutrientes en
 * modo oscuro.»
 *
 * NO ERA CONTRASTE. El panel está sano: 14,7:1 el nombre del nutriente, 6,3:1 el texto
 * apagado, 7,1:1 el porcentaje. Medirlo primero evitó ir a subir tonos que ya estaban
 * bien. Eran dos INVERSIONES: reglas correctas en claro cuyo efecto se da la vuelta al
 * heredarlas el oscuro.
 *
 * 1. LA PISTA VACÍA BRILLABA MÁS QUE EL DATO. `.bar` se rellena con
 *    `color-mix(--text-light 40%, transparent)`. Sobre un fondo claro eso da un gris MÁS
 *    OSCURO que la tarjeta y se lee como el surco por recorrer. Sobre el casi-negro da un
 *    gris MÁS CLARO: medido, pista L* 30,2 contra tarjeta L* 12,7. En un nutriente al
 *    14%, la franja de «lo que falta» pesaba mucho más que la de «lo que llevas» — la
 *    barra comunicaba lo contrario de lo que mide.
 *
 * 2. EL FONDO SE VOLVÍA MARRÓN. `.att` mezcla su tono al 11% con `--bg-page`. Naranja
 *    sobre blanco roto da un melocotón que se lee como aviso; naranja sobre #0B1120 da
 *    rgb(37,31,35) — un marrón apagado que en una paleta de slates fríos se ve sucio.
 *
 * Este guard afirma la REGLA GENERAL, no los valores: en el tema oscuro, el hueco de una
 * barra no puede ser más claro que la superficie sobre la que se apoya. Es la formulación
 * que sobrevive a que alguien retoque los tonos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(SRC, 'components', 'dashboard', 'MicronutrientMeter.module.css'), 'utf8');
const INDEX = readFileSync(join(SRC, 'index.css'), 'utf8');

/** Valor de un token DENTRO del bloque del tema oscuro. Se lee del sistema en vez de
 *  copiarlo aquí: una constante copiada a mano puede mentir cuando el original cambia. */
function tokenOscuro(nombre) {
    const i = INDEX.search(/\[data-theme=["']dark["']\]/);
    const trozo = INDEX.slice(i, i + 4000);
    const m = new RegExp(`${nombre}:\\s*(#[0-9A-Fa-f]{6})`).exec(trozo);
    return m ? m[1] : null;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const Lestrella = (rgb) => {
    const y = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};
const sobre = (tinta, alfa, fondo) => tinta.map((c, i) => c * alfa + fondo[i] * (1 - alfa));

/** Cuerpo de la regla de un selector, escapando TODOS los metacaracteres — el selector
 *  del tema lleva corchetes y paréntesis, y escapar solo el punto hace que el test jure
 *  que la regla no existe. */
function regla(selector) {
    const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    const m = re.exec(CSS);
    return m ? m[1] : null;
}

const OSCURO = ':global(html[data-theme="dark"])';

describe('[P1-MICRO-DARK-SURFACES] en oscuro el hueco no pesa más que el dato', () => {
    it('la barra tiene una pista propia para el tema oscuro', () => {
        const r = regla(`${OSCURO} .bar`);
        expect(r, 'desapareció la pista de barra del tema oscuro: vuelve a heredar la de claro')
            .toBeTruthy();
        // La de claro se deriva de una tinta CLARA (`--text-light`), que es justamente lo
        // que la vuelve más brillante que la tarjeta cuando el fondo es casi negro.
        expect(
            /--text-light/.test(r),
            'la pista del tema oscuro vuelve a derivarse de una tinta clara: sobre casi-negro '
            + 'eso la deja MÁS brillante que la tarjeta y el hueco pesa más que el dato',
        ).toBe(false);
    });

    it('la pista queda MÁS OSCURA que la tarjeta sobre la que se apoya', () => {
        const rBar = regla(`${OSCURO} .bar`);
        const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(rBar);
        expect(m, 'la pista oscura no declara un rgba componible').toBeTruthy();

        const sunken = tokenOscuro('--surface-sunken');
        expect(sunken, 'no se pudo leer --surface-sunken del tema oscuro').toBeTruthy();

        // Superficie de la tarjeta en oscuro: el tono al 7% sobre el slate hundido.
        // Se usa el tono más claro de los cuatro estados (ámbar) como caso peor: si la
        // pista sigue siendo más oscura que ESA, lo es que todas.
        const tono = hex('#FBBF24');
        const tarjeta = sobre(tono, 0.07, hex(sunken));
        const pista = sobre([+m[1], +m[2], +m[3]], +m[4], tarjeta);

        const lTarjeta = Lestrella(tarjeta);
        const lPista = Lestrella(pista);
        expect(
            lPista,
            `la pista vacía (L* ${lPista.toFixed(1)}) es más clara que la tarjeta `
            + `(L* ${lTarjeta.toFixed(1)}): el hueco se lee más fuerte que lo conseguido`,
        ).toBeLessThan(lTarjeta);
    });

    it('la tarjeta de aviso se apoya en un slate, no en el fondo de página', () => {
        const r = regla(`${OSCURO} .att`);
        expect(r, 'desapareció la superficie de aviso del tema oscuro').toBeTruthy();
        expect(
            /--bg-page/.test(r),
            'la tarjeta vuelve a mezclar su tono sobre `--bg-page`: naranja sobre #0B1120 da un '
            + 'marrón apagado que en una paleta de slates fríos se ve sucio, no alarmante',
        ).toBe(false);
        expect(r).toMatch(/--surface-sunken|--bg-card/);
    });

    it('el tema claro no se toca: allí las dos reglas base son correctas', () => {
        // La regla base sigue derivando la pista de `--text-light` y mezclando sobre
        // `--bg-page`, que es lo que funciona sobre blanco. El arreglo es un override del
        // tema, no un cambio del sistema.
        expect(regla('.bar')).toMatch(/--text-light/);
        expect(regla('.att')).toMatch(/--bg-page/);
    });
});
