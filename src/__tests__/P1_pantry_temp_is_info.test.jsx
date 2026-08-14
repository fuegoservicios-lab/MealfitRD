/* [P1-PANTRY-TEMP-IS-INFO · 2026-08-14] «3°C · Frío Max» deja de parecer un
 * botón, porque estaba construido como uno y colocado entre botones.
 *
 * Tenía la anatomía completa de un control —fondo teñido, borde, padding
 * generoso y esquinas de 12px— y vivía en la fila de acciones, entre el
 * buscador y la papelera. El dueño: «ahí se ve mal al lado de los botones, ya
 * que parece un botón». Y se acentuó al subir el escáner a esa barra: dos
 * píldoras con velo de color seguidas, una pulsable y la otra no.
 *
 * Se arregla por las dos vías que él ofreció, porque son la misma causa:
 *   · DÓNDE — no es una acción, es el ESTADO del mueble seleccionado. Su sitio
 *     es debajo del interruptor Nevera/Alacena, que es lo que describe; de
 *     hecho solo existe cuando el mueble es la nevera. En la barra de acciones
 *     era el único elemento que no hacía nada al pulsarlo.
 *   · CÓMO — pierde la caja. Queda una línea de metadato: copo, cifra y punto
 *     de estado. Sin fondo ni borde no hay nada que invite a pulsar.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const leer = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const CSS = leer('pages/Pantry.fridge.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
const JSX = leer('pages/Pantry.jsx');

const regla = (sel) => {
    const m = CSS.match(new RegExp(`(^|\\n)\\s*\\${sel}\\s*\\{([^}]*)\\}`));
    return m ? m[2] : '';
};

describe('[P1-PANTRY-TEMP-IS-INFO] la temperatura es un dato, no un control', () => {
    it('ya no tiene la anatomía de un botón', () => {
        const t = regla('.temp');
        expect(t, 'no se encontró .temp').not.toBe('');
        expect(t, 'un fondo teñido la sigue leyendo como pulsable').not.toMatch(/background:/);
        expect(t, 'el borde es lo que más la disfrazaba de botón').not.toMatch(/border:/);
        expect(t, 'sin caja no hace falta radio de esquina').not.toMatch(/border-radius:/);
    });

    it('se lee como metadato: tinta apagada y cuerpo menor', () => {
        const t = regla('.temp');
        expect(t).toMatch(/color:\s*var\(--text-muted\)/);
        // Por debajo del texto de los controles (.btn usa .8rem).
        const m = t.match(/font-size:\s*\.(\d+)rem/);
        expect(m, 'falta font-size explícito').toBeTruthy();
        expect(Number(`0.${m[1]}`)).toBeLessThan(0.8);
    });

    it('el copo conserva el acento de la nevera (es la señal de frío)', () => {
        // La tinta general baja a --text-muted, pero el ícono mantiene el cian
        // del mueble: sin él, la línea pierde su identidad y parece un pie de
        // página cualquiera.
        expect(regla('.temp svg')).toMatch(/var\(--ink-door\)/);
    });

    it('vive en la barra lateral, bajo el interruptor de mueble', () => {
        const iZones = JSX.indexOf('className={fstyles.zones}');
        const iNav = JSX.indexOf('<nav', iZones);
        const iTemp = JSX.indexOf('className={fstyles.temp}');
        expect(iTemp, 'no se encontró el chip de temperatura').toBeGreaterThan(-1);
        expect(iTemp, 'debe ir DESPUÉS del interruptor de mueble').toBeGreaterThan(iZones);
        expect(iTemp, 'y ANTES de la lista de categorías').toBeLessThan(iNav);
    });

    it('ya no está en la fila de acciones', () => {
        const iHead = JSX.indexOf('className={fstyles.head}');
        const iChips = JSX.indexOf('{/* Chips de categoría', iHead);
        expect(JSX.slice(iHead, iChips), 'volvió a la barra de botones')
            .not.toMatch(/className=\{fstyles\.temp\}/);
    });

    it('sigue apareciendo solo cuando el mueble es la nevera', () => {
        // La alacena no tiene temperatura que declarar; el dato es del mueble.
        const i = JSX.indexOf('className={fstyles.temp}');
        expect(JSX.slice(Math.max(0, i - 260), i)).toMatch(/tempZone === 'frio'/);
    });
});
