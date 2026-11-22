/**
 * [P1-PLAN-LOTE-1160 · 2026-11-21] La papelera de la Nevera en la pantalla.
 * «Borrar todos» se llevó los tres potes del dueño con su etiqueta y no había forma de recuperarlos.
 *  1. «Deshacer» de un alimento saca la fila de la papelera (vuelve con marca, tipo y etiqueta), no la reinserta a mano.
 *  2. Quitar un pote también se puede deshacer.
 *  3. «Borrar todos» deja los potes en pantalla y ofrece «Deshacer» con los ids de la papelera.
 *  4. El aviso ya no dice «no se puede deshacer».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/Pantry.jsx'), 'utf8');
const cuerpo = (desde, largo = 2600) => SRC.slice(SRC.indexOf(desde), SRC.indexOf(desde) + largo);

describe('[1160] papelera de la Nevera', () => {
    it('«Deshacer» de un alimento restaura desde la papelera por su id', () => {
        const del = cuerpo('const handleDeleteItem = async', 5200);
        expect(del).toContain("'/api/inventory/papelera/restaurar'");
        expect(del).toContain('original_ids: [oldId]');
        expect(del).not.toContain("_apiJson('/api/inventory/items', {\n                            method: 'POST'");
    });

    it('quitar un pote ofrece «Deshacer»', () => {
        const sup = cuerpo('const borrarSuplemento = async', 900);
        expect(sup).toContain("restaurarDeLaPapelera({ original_ids: [id] })");
        expect(sup).toContain("label: t('Deshacer')");
    });

    it('«Borrar todos» deja los potes y se puede deshacer', () => {
        const all = cuerpo('const confirmDeleteAll = async', 3200);
        expect(all).toContain("setInventory(prev => prev.filter(i => i.kind === 'supplement'))");
        expect(all).not.toContain('setInventory([])');
        expect(all).toContain('restaurarDeLaPapelera({ papelera_ids: _papeleraIds })');
    });

    it('el aviso dice la verdad', () => {
        expect(SRC).not.toContain('Esta acción no se puede deshacer.');
        expect(SRC).toContain("t('de la Nevera. Tus suplementos se quedan, y si te equivocas puedes deshacerlo.')");
    });
});
