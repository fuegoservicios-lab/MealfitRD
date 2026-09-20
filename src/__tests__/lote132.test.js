// [P1-PLAN-LOTE-132 · 2026-09-20] La foto de una ETIQUETA llega al coach como etiqueta.
//
// El coach pide «una foto de la tabla nutricional del pote» antes de anotar una proteína de envase (entre dos marcas hay
// el doble de calorías). El escáner del servidor clasifica esa foto como `etiqueta` y LEE sus cifras por porción; pero
// este cliente convertía todo tipo que no fuera 'otro' o 'items' en 'plato', y el coach la recibía como una comida.
// El escáner del Dashboard no cambia: una etiqueta trae `is_food: true` y cae al flujo de plato, que precarga UNA porción.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 132 · la etiqueta de un producto llega al coach como etiqueta', () => {
    it('el mapeo de tipos del chat la deja pasar; lo desconocido sigue siendo «plato»', () => {
        const ap = leer('src/pages/AgentPage.jsx');
        expect(ap).toContain("(item.kind === 'etiqueta' ? 'etiqueta' : 'plato')");
        expect(ap).toContain("kind: data.photo_kind || 'plato',");
    });

    it('el escáner del Dashboard solo desvía la COMPRA: la etiqueta sigue al registro con sus macros', () => {
        const modal = leer('src/components/dashboard/ScanMealModal.jsx');
        expect(modal).toContain("if (data.photo_kind === 'items') {");
        expect(modal).not.toContain("photo_kind === 'etiqueta'");
    });
});
