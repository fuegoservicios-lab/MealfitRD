/* [P1-URGENT-FLASH-UNKNOWN · 2026-08-13] El aviso «⚠ Compra Urgente Requerida»
 * parpadeaba en rojo unos 300 ms en CADA refresh y se retiraba solo.
 *
 * Causa: `liveInventory` arranca en `null` mientras el fetch de la Nevera va en
 * camino, y el filtro metía DOS estados en el mismo cajón —
 *
 *     if (!Array.isArray(inventory) || inventory.length === 0) return missingList;
 *
 * — de modo que «todavía no sé» se resolvía como «no tienes nada», y el aviso
 * salía con la lista completa de faltantes para desdecirse al llegar el fetch.
 * Es el patrón del COALESCE que se cerró ayer en los chunks: un valor por
 * defecto convierte una AUSENCIA en un dato con autoridad.
 *
 * El estado real tiene TRES valores, no dos, y esa es la clave del arreglo:
 *   1. `null` + fetch en vuelo     → CARGANDO: no sé ⇒ no pinto (espero).
 *   2. `null` + `inventoryStale`   → FALLÓ: no voy a saber ⇒ pinto (fail-safe
 *      original intacto: más vale avisar de más que esconder una compra).
 *   3. array                       → SÉ: filtro contra la Nevera.
 *
 * Tratar el caso 2 como el 1 cambiaría un defecto por otro peor —el aviso
 * escondido PARA SIEMPRE cuando la Nevera no carga—, y por eso el guard lo
 * comprueba explícitamente.
 *
 * El precedente ya estaba en el archivo: el botón de la lista de compras gatea
 * con `liveInventory !== null` y su comentario dice «evita flash del botón».
 * Aquí faltaba.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { filterStillMissing } from '../pages/Dashboard.jsx';

const FALTA = ['55 ml de leche descremada', '40 g de avena'];
const NEVERA = [{ ingredient_name: 'Leche descremada' }];

// SIN comentarios: los de este bloque explican el contrato y nombran
// `inventoryStale`, así que un guard que lea el fuente crudo encuentra la
// palabra en su propia documentación y da por buena una rama borrada
// (comprobado por mutación: pasaba en verde con el código roto).
const SRC = fs.readFileSync(path.resolve(__dirname, '../pages/Dashboard.jsx'), 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('[P1-URGENT-FLASH-UNKNOWN] «no sé» deja de significar «no tienes»', () => {
    it('inventario DESCONOCIDO (null) no acusa faltantes', () => {
        // Lo que producía el parpadeo: con null devolvía la lista entera.
        expect(filterStillMissing(FALTA, null)).toEqual([]);
        expect(filterStillMissing(FALTA, undefined)).toEqual([]);
    });

    it('inventario VACÍO de verdad ([]) sigue acusando todo — el fail-safe no se toca', () => {
        expect(filterStillMissing(FALTA, [])).toEqual(FALTA);
    });

    it('inventario CONOCIDO filtra lo que ya tienes', () => {
        expect(filterStillMissing(FALTA, NEVERA)).toEqual(['40 g de avena']);
    });

    it('el caller distingue «cargando» de «no cargó» (si no, el aviso se esconde para siempre)', () => {
        // Con el fetch caído, liveInventory se queda null Y inventoryStale=true.
        // Sin esta rama, el usuario nunca vería una compra que sí necesita.
        const i = SRC.indexOf('_pantry_unsafe_after_flexible &&');
        expect(i, 'no se encontró el bloque del aviso').toBeGreaterThan(-1);
        const bloque = SRC.slice(i, i + 1200);
        // Las DOS ramas, por separado. Pedir solo la palabra `inventoryStale`
        // era insuficiente: sobrevive en la condición de «cargando» aunque se
        // borre la del fetch caído (comprobado por mutación — pasaba en verde).
        expect(bloque, 'falta la rama que CALLA mientras el fetch está en vuelo')
            .toMatch(/liveInventory\s*==\s*null\s*&&\s*!inventoryStale/);
        // Y que ese estado CORTE el render: definir la condición sin usarla
        // devuelve el parpadeo intacto (también comprobado por mutación).
        expect(bloque, '«cargando» se calcula pero no corta el render: el aviso vuelve a parpadear')
            .toMatch(/if\s*\(\s*_cargando\s*\)\s*return null/);
        expect(bloque, 'falta la rama que ACUSA cuando el fetch falló: sin ella el aviso '
            + 'queda escondido para siempre si la Nevera no carga')
            .toMatch(/liveInventory\s*==\s*null\s*&&\s*inventoryStale[\s\S]{0,120}_missing_ingredients/);
    });

    it('la línea «Faltan:» usa la tinta del tema, no un rojo fijo', () => {
        // Medido: #B91C1C sobre el fondo del aviso da 2,52:1 en tema oscuro
        // (bajo AA). Con el token sube a 8,61:1 y el claro se queda igual.
        const i = SRC.indexOf('Faltan:');
        expect(i).toBeGreaterThan(-1);
        const alrededor = SRC.slice(i - 400, i + 120);
        expect(alrededor).not.toMatch(/#B91C1C/i);
        expect(alrededor).toMatch(/var\(--danger-text\)/);
    });
});
