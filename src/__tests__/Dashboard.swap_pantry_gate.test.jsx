// [P1-SWAP-PANTRY-GATE · 2026-07-30] El botón "Cambiar Plato" (swap individual)
// se podía pulsar con la Nevera vacía: el modal abría, el usuario elegía un
// motivo, se gastaba un crédito y el backend hacía soft-fail por strict-pantry
// sin inventario. Su hermano "Actualizar platos" (día completo) SÍ estaba
// gateado desde P3-UPDATE-PLATOS-REQUIRES-PANTRY (2026-05-17); el individual
// nunca leyó esa constante. Clase dominante del repo: un fix que aterrizó en
// una superficie y no en su hermana.
//
// Dos decisiones que este test ancla y que NO son obvias:
//
// 1. El gate es POR MOTIVO, no del botón entero. `P3-SWAP-PANTRY-DEFAULT`
//    (2026-05-22) fijó que la Nevera es la fuente ÚNICA para todos los motivos
//    EXCEPTO `cravings` y `weekend`. Bloquear el botón entero revertiría de
//    facto esa decisión de producto. `dislike` tampoco se bloquea: no genera
//    nada, registra una preferencia — y esa señal sigue siendo válida con la
//    nevera vacía.
//
// 2. Dos umbrales, no uno. El día completo regenera 4 platos con reserva de
//    inventario ENTRE ellos; el swap individual regenera 1. Una sola constante
//    obliga a que una de las dos esté mal calibrada.
//
// Sobre el umbral: el owner propuso ~30. Medido antes de decidir — no hay
// distribución real que calibrar (4 usuarios con la MISMA lista de 10 ítems =
// seed), 30 bloquearía al 100% de los usuarios actuales, el catálogo maestro
// entero son 204 alimentos, y el backend ya trata 5/10/12 como "nevera con la
// que se puede trabajar". De ahí 10 (día) y 6 (swap).
//
// La lógica vive en `utils/pantryGate.js` y NO en `Dashboard.jsx` a propósito:
// los tests de Dashboard son parser-based (8.700 líneas, demasiado pesado para
// importar) y un test parser-based NO EJECUTA NADA — verifica que un texto está
// escrito, no que la función haga lo correcto. El fail-open es exactamente la
// clase de regla que un `toContain` no puede proteger. Mismo patrón que
// `utils/planWindow.js` (P3-DASH-WINDOW-TEST).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
    computePantryGate,
    SWAP_REASONS_REQUIRING_PANTRY,
    PANTRY_MIN_ITEMS_FOR_UPDATE,
    PANTRY_MIN_ITEMS_FOR_SWAP,
} from '../utils/pantryGate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _dashSrc = readFileSync(join(__dirname, '..', 'pages', 'Dashboard.jsx'), 'utf-8');
const _modalSrc = readFileSync(
    join(__dirname, '..', 'components', 'dashboard', 'MotivoActualizarModal.jsx'), 'utf-8'
);

describe('P1-SWAP-PANTRY-GATE · computePantryGate', () => {
    it('bloquea por debajo del mínimo', () => {
        expect(computePantryGate(5, 6)).toBe(true);
        expect(computePantryGate(1, 6)).toBe(true);
    });

    it('NO bloquea en el límite exacto ni por encima', () => {
        expect(computePantryGate(6, 6)).toBe(false);
        expect(computePantryGate(40, 6)).toBe(false);
    });

    it('bloquea con 0 — la nevera vacía es el caso original del bug', () => {
        // `0` es falsy: si la resolución fuera por truthiness en vez de por
        // `=== null`, este caso se confundiría con "no cargado" y haría
        // fail-open justo en el escenario que motivó el fix.
        expect(computePantryGate(0, 6)).toBe(true);
    });

    it('FAIL-OPEN: null/undefined nunca bloquean', () => {
        // `null` = inventario sin cargar todavía o fetch fallido. Un fallo de
        // red NO puede leerse como "tu nevera está vacía" y quitarle el botón
        // a alguien que sí tiene comida. Misma semántica que el gate del día
        // (P3-UPDATE-PLATOS-REQUIRES-PANTRY) y que P3-PLAN-BTN-STABLE.
        expect(computePantryGate(null, 6)).toBe(false);
        expect(computePantryGate(undefined, 6)).toBe(false);
    });

    it('un conteo no numérico no bloquea (fail-open ante shape rara)', () => {
        expect(computePantryGate(NaN, 6)).toBe(false);
        expect(computePantryGate('8', 6)).toBe(false);
    });
});

describe('P1-SWAP-PANTRY-GATE · qué motivos consumen la Nevera', () => {
    const REQUIRE = ['variety', 'time', 'similar'];
    const EXEMPT = ['cravings', 'weekend', 'dislike'];

    it.each(REQUIRE)('«%s» usa la Nevera como fuente exclusiva → se bloquea', (id) => {
        expect(SWAP_REASONS_REQUIRING_PANTRY).toContain(id);
    });

    it.each(EXEMPT)('«%s» NO se bloquea', (id) => {
        expect(SWAP_REASONS_REQUIRING_PANTRY).not.toContain(id);
    });

    it('la lista es EXACTAMENTE esos tres — bidireccional', () => {
        // Sin esto, añadir un motivo nuevo a la lista sin clasificarlo pasaría
        // desapercibido: los `it.each` de arriba solo comprueban presencia y
        // ausencia de los que YA conocemos.
        expect([...SWAP_REASONS_REQUIRING_PANTRY].sort()).toEqual([...REQUIRE].sort());
    });

    it('cravings y weekend siguen exentos — P3-SWAP-PANTRY-DEFAULT', () => {
        // Regresión de PRODUCTO, no de código: si alguien "simplifica" el gate
        // bloqueando el botón entero, estos dos caen con él y se revierte en
        // silencio la decisión del 2026-05-22.
        expect(SWAP_REASONS_REQUIRING_PANTRY).not.toContain('cravings');
        expect(SWAP_REASONS_REQUIRING_PANTRY).not.toContain('weekend');
    });
});

describe('P1-SWAP-PANTRY-GATE · umbrales', () => {
    it('día completo = 10, swap individual = 6', () => {
        expect(PANTRY_MIN_ITEMS_FOR_UPDATE).toBe(10);
        expect(PANTRY_MIN_ITEMS_FOR_SWAP).toBe(6);
    });

    it('el del swap nunca supera al del día', () => {
        // Invariante de forma, no de valor: regenerar 4 platos con reserva
        // entre ellos no puede exigir MENOS inventario que cambiar 1.
        expect(PANTRY_MIN_ITEMS_FOR_SWAP).toBeLessThanOrEqual(PANTRY_MIN_ITEMS_FOR_UPDATE);
    });

    it('el mínimo del día ya no es 3', () => {
        // El valor viejo. 4 platos desde 3 ingredientes no es un día.
        expect(PANTRY_MIN_ITEMS_FOR_UPDATE).toBeGreaterThan(3);
    });
});

describe('P1-SWAP-PANTRY-GATE · cableado', () => {
    it('Dashboard consume el módulo en vez de redefinir la constante', () => {
        expect(_dashSrc).toContain("from '../utils/pantryGate'");
        // La constante vieja no puede seguir declarada en Dashboard: dos
        // fuentes del mismo umbral divergen en el primer cambio.
        expect(_dashSrc).not.toMatch(/const\s+PANTRY_MIN_ITEMS_FOR_UPDATE\s*=/);
    });

    it('el modal individual recibe el gate derivado', () => {
        const i = _dashSrc.indexOf('MODAL (rediseño): ¿Por qué quieres cambiar? — un plato');
        expect(i).toBeGreaterThan(-1);
        const block = _dashSrc.slice(i, i + 3000);
        // Sanity del vehículo: si el slice no fuera el modal individual, los
        // asserts de abajo pasarían mirando otro trozo del archivo.
        expect(block).toContain('MotivoActualizarModal');
        expect(block).toContain('Quiero variedad');
        expect(block).toContain('P1-SWAP-PANTRY-GATE');
    });
});

describe('P1-SWAP-PANTRY-GATE · MotivoActualizarModal honra disabled', () => {
    it('las opciones y las filas extra soportan disabled', () => {
        expect(_modalSrc).toContain('P1-SWAP-PANTRY-GATE');
        expect(_modalSrc).toMatch(/o\.disabled|opt\.disabled|option\.disabled/);
    });

    it('una opción deshabilitada no dispara onPick', () => {
        // El candado tiene que bloquear la ACCIÓN, no solo verse gris: sin
        // esto el usuario deshabilitado igual gasta el crédito.
        expect(_modalSrc).toMatch(/disabled[\s\S]{0,400}onPick|onPick[\s\S]{0,200}disabled/);
    });
});
