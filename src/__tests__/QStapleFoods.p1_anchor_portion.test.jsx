// [P1-ANCHOR-PORTION · 2026-09-07] El campo «¿Cuánto en cada comida?» del editor de básicos.
//
// El ancla sabía decir CUÁNDO (franjas) y CUÁN A MENUDO (min/max por 7 días) pero no CUÁNTO, así
// que «desayuno 10 claras» no tenía dónde escribirse. El backend ya lo transporta y lo honra
// (P1-PORTION-HONORED); esto es la casilla donde la persona lo dice.
//
// Dos decisiones que este guard sujeta, y las dos son de producto, no de estilo:
//
//   · VACÍO significa «la ración normal», y no se siembra ningún número. Un default sembrado es
//     indistinguible de una elección, y aquí estaría decidiendo la comida de alguien.
//   · La unidad se ELIGE. Sin ella, «150» de pollo se leería como 150 piezas — es la lección de
//     P1-UNKNOWN-UNIT-NOT-WHOLE, y el compilador descarta una ración sin unidad.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anchorDefaults } from '../config/planPolicy';

const SRC = readFileSync(
    resolve(process.cwd(), 'src/components/assessment/questions/QStapleFoods.jsx'), 'utf8',
).split(String.fromCharCode(13)).join('');

describe('P1-ANCHOR-PORTION — la casilla de la ración', () => {
    it('el editor pregunta cuánto, y lo marca opcional', () => {
        expect(SRC).toContain("t('¿Cuánto en cada comida?')");
        expect(SRC).toContain("t('(opcional)')");
        expect(SRC).toContain("t('Déjalo vacío y usamos la ración normal.')");
    });

    it('escribe `portion` con qty Y unit, nunca solo el número', () => {
        expect(SRC).toContain("{ qty: n, unit: a.portion?.unit || 'unidad' }");
    });

    it('vacío o no-positivo borra la ración en vez de sembrar un default', () => {
        // `null`, no `{qty: 0}` ni un número inventado: el backend lee `None` como «la normal».
        expect(SRC).toMatch(/\?\s*null\s*\n?\s*:\s*\{ qty: n, unit:/);
        expect(SRC).toContain("v === '' || !Number.isFinite(n) || n <= 0");
    });

    it('la unidad se elige entre unidades y gramos, y no se adivina', () => {
        expect(SRC).toContain('<option value="unidad">');
        expect(SRC).toContain('<option value="g">');
    });

    it('acota la entrada sin imponer un límite clínico', () => {
        // 12 claras tienen que caber: la cota solo frena basura (el encargo excluye inventar un
        // límite diario, y el compilador aplica la suya propia).
        expect(SRC).toContain('min="1" max="100"');
    });

    it('el ancla por defecto NO trae ración', () => {
        expect(anchorDefaults('Clara de huevo').portion).toBeNull();
    });

    it('el campo es accesible por teclado y por lector de pantalla', () => {
        expect(SRC).toContain("aria-label={t('¿Cuánto en cada comida?')}");
        expect(SRC).toContain("aria-label={t('Unidad')}");
        expect(SRC).toContain('inputMode="numeric"');
    });
});
