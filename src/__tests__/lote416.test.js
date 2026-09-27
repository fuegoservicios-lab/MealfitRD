// [P1-PLAN-LOTE-416 · 2026-09-27] Con la Nevera APAGADA, «Cambiar plato» y «Actualizar platos» no piden Nevera.
//
// Auditoría formulario→backend (otra sesión), verificada: desde el lote 217 la Nevera se apaga también en modo plan (a
// mano en Capacidades, o el sistema a las 48 h vacía si el usuario sigue activo) y entonces los bloques se generan SIN
// mirarla. Pero las dos puertas del Dashboard seguían contando sus alimentos: con 0 < 6 (cambiar un plato) y 0 < 10 (el
// día entero) bloqueaban el botón para siempre, con un aviso que manda a «añádelos en Nevera»… a una pantalla que ya no
// está en el menú. Cuenta real afectada al medirlo: `c7b90ca3` (modo plan, apagada por el sistema, 0 alimentos). La mitad
// del servidor (la puerta de suficiencia de swap/regenerar-día) es el lote 550 de la otra sesión.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computePantryGate, PANTRY_MIN_ITEMS_FOR_SWAP, PANTRY_MIN_ITEMS_FOR_UPDATE } from '../utils/pantryGate';

const DASH = readFileSync(resolve(process.cwd(), 'src/pages/Dashboard.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('[416] la puerta de la Nevera respeta la Nevera apagada', () => {
    it('apagada: no bloquea ni con 0 alimentos, en ninguno de los dos umbrales', () => {
        expect(computePantryGate(0, PANTRY_MIN_ITEMS_FOR_SWAP, { neveraOn: false })).toBe(false);
        expect(computePantryGate(3, PANTRY_MIN_ITEMS_FOR_UPDATE, { neveraOn: false })).toBe(false);
    });

    it('encendida, o sin decirlo, sigue igual (0 bloquea; sin cargar no bloquea)', () => {
        expect(computePantryGate(0, PANTRY_MIN_ITEMS_FOR_SWAP, { neveraOn: true })).toBe(true);
        expect(computePantryGate(0, PANTRY_MIN_ITEMS_FOR_SWAP)).toBe(true);
        expect(computePantryGate(null, PANTRY_MIN_ITEMS_FOR_SWAP, { neveraOn: true })).toBe(false);
    });

    it('el Dashboard pasa el estado de la Nevera a las DOS puertas', () => {
        expect(DASH).toMatch(/const isPantryTooEmpty = computePantryGate\(pantryItemCount, PANTRY_MIN_ITEMS_FOR_UPDATE, \{ neveraOn: _neveraOnPuertas \}\);/);
        expect(DASH).toMatch(/const isPantryTooEmptyForSwap = computePantryGate\(pantryItemCount, PANTRY_MIN_ITEMS_FOR_SWAP, \{ neveraOn: _neveraOnPuertas \}\);/);
        expect(DASH).toMatch(/const _neveraOnPuertas = neveraActiva\(userProfile\);/);
    });
});
