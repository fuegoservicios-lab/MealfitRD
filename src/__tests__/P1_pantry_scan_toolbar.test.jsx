/* [P1-PANTRY-SCAN-TOOLBAR · 2026-08-14] El escáner sube a la barra de la Nevera.
 *
 * Vivía como una tarjeta ancha centrada bajo el toolbar —icono, título,
 * subtítulo y pill BETA— y el dueño lo describió así: «está en una mala
 * posición, hace que el diseño de la nevera se vea feo». Tenía razón de
 * composición: era el único elemento centrado de una pantalla alineada a la
 * izquierda, y partía en dos la relación entre la barra de acciones y la lista.
 *
 * Va donde pertenece: junto a «+ Añadir», porque son LA MISMA tarea por dos
 * caminos —meter comida en la nevera, con foto o a mano—. Ese es el orden que
 * queda: buscador · temperatura · vaciar · escanear · añadir.
 *
 * Tres cosas que el modo compacto tiene que resolver, y por eso el guard las
 * vigila:
 *   1. El componente envuelve el botón CON la hoja de resultados y el visor.
 *      Metido tal cual en la barra, su contenedor sería un item más del flex y
 *      descolocaría todo ⇒ en compacto la raíz es `display: contents`, así que
 *      el botón se convierte en hijo directo de la barra y el wrapper
 *      desaparece del layout.
 *   2. La hoja de resultados (el flujo de PC: subir archivo) se pintaba EN
 *      FLUJO, debajo del botón. Desde la barra eso la metería entre los
 *      controles ⇒ en compacto flota anclada, no empuja nada.
 *   3. Altura 44px, la de sus vecinos: un botón más bajo o más alto rompe la
 *      línea de la barra, que es justo lo que se venía a arreglar.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const leer = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

const SCAN = leer('components/pantry/PantryScanButton.jsx');
const PANTRY = leer('pages/Pantry.jsx');

describe('[P1-PANTRY-SCAN-TOOLBAR] el escáner vive en la barra', () => {
    it('el componente acepta el modo compacto', () => {
        expect(SCAN, 'PantryScanButton no declara la prop `compact`').toMatch(/compact\s*[=,}]/);
    });

    it('en compacto la raíz no ocupa sitio en el layout (display: contents)', () => {
        // Sin esto, el wrapper flex-column del componente sería un item más de
        // la barra y el botón quedaría dentro de una caja que no pinta nada.
        expect(SCAN).toMatch(/display:\s*['"]contents['"]/);
    });

    it('en compacto la hoja de resultados FLOTA, no empuja la barra', () => {
        const i = SCAN.indexOf('!viewfinderOpen && scanResults');
        expect(i, 'no se encontró la hoja de resultados del flujo de archivo').toBeGreaterThan(-1);
        expect(SCAN.slice(i, i + 700), 'en la barra, una hoja en flujo se colaría entre los controles')
            .toMatch(/position:\s*compact\s*\?\s*['"]fixed['"]|compact\s*\?\s*\{[^}]*position:\s*['"]fixed['"]/);
    });

    it('el botón compacto mide lo mismo que sus vecinos de la barra', () => {
        // `.btn` de la barra declara min-height 44px; el escáner debe alinear.
        const i = SCAN.indexOf('compactBtn');
        expect(i, 'no se encontró el estilo del botón compacto').toBeGreaterThan(-1);
        expect(SCAN.slice(i, i + 600)).toMatch(/height:\s*44/);
    });

    it('la Nevera lo monta DENTRO de la barra y junto a «Añadir»', () => {
        // El orden importa: escanear y añadir son la misma tarea por dos
        // caminos, así que van seguidos y al final de la barra.
        const head = PANTRY.indexOf('className={fstyles.head}');
        const cierreHead = PANTRY.indexOf('{/* Chips de categoría', head);
        const zona = PANTRY.slice(head, cierreHead);
        const iScan = zona.indexOf('<PantryScanButton');
        const iAdd = zona.indexOf('Añadir');
        expect(iScan, 'el escáner no está dentro de la barra').toBeGreaterThan(-1);
        expect(iScan, 'el escáner debe ir justo antes de «Añadir»').toBeLessThan(iAdd);
        expect(zona.slice(iScan, iScan + 400)).toMatch(/compact/);
    });

    it('ya no queda la tarjeta ancha centrada bajo la barra', () => {
        // La versión anterior se centraba con `margin: 0 auto` y un maxWidth de
        // 420px — el detalle que la hacía desentonar en una pantalla alineada a
        // la izquierda. Si vuelve, es que alguien reintrodujo la tarjeta.
        const head = PANTRY.indexOf('className={fstyles.head}');
        const chips = PANTRY.indexOf('{/* Chips de categoría', head);
        const cierreBarra = PANTRY.indexOf('</div>', PANTRY.indexOf('Añadir', head));
        const entreBarraYChips = PANTRY.slice(cierreBarra, chips);
        expect(entreBarraYChips, 'volvió el escáner suelto bajo la barra')
            .not.toMatch(/<PantryScanButton/);
    });
});
