// [P1-SWAP-PANTRY-GATE · 2026-07-30] El botón "Cambiar Plato" (swap individual)
// se podía pulsar con la Nevera vacía: el modal abría, el usuario elegía un
// motivo, se gastaba un crédito y el backend hacía soft-fail por strict-pantry
// sin inventario. Su hermano "Actualizar platos" (día completo) SÍ estaba
// gateado desde P3-UPDATE-PLATOS-REQUIRES-PANTRY (2026-05-17); el individual
// nunca leyó esa constante. Clase dominante del repo: un fix que aterrizó en
// una superficie y no en su hermana.
//
// Tres decisiones que este test ancla y que NO son obvias:
//
// 1. [P1-SWAP-PANTRY-GATE-FULL-BUTTON · 2026-07-30] El BOTÓN ENTERO se bloquea.
//    La primera versión gateaba motivo por motivo dentro del modal, para
//    preservar la exención de `P3-SWAP-PANTRY-DEFAULT` (2026-05-22: la Nevera es
//    la fuente ÚNICA para todos los motivos EXCEPTO `cravings` y `weekend`).
//    El owner lo revisó y eligió el bloqueo completo: prefiere la simetría con
//    "Actualizar platos" antes que abrir un modal donde media lista está muerta.
//    **Consecuencia asumida y explícita**: con la Nevera baja tampoco se puede
//    pedir un antojo ni un plato de fin de semana, aunque no necesiten
//    ingredientes propios. Decisión de producto, no descuido — si alguien la
//    revierte citando P3-SWAP-PANTRY-DEFAULT sin hablarlo, este bloque falla.
//
// 2. El gate por motivo SOBREVIVE como segunda barrera, y no es código muerto:
//    cubre la ventana en que la Nevera se vacía MIENTRAS el modal está abierto
//    (otra pestaña, un consume). El botón ya no deja entrar por debajo del
//    mínimo, pero nada impide que el inventario caiga entre abrir y elegir.
//
// 3. Dos umbrales, no uno. El día completo regenera 4 platos con reserva de
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

    it('cravings y weekend siguen fuera de la lista — segunda barrera', () => {
        // OJO al alcance tras P1-SWAP-PANTRY-GATE-FULL-BUTTON: el botón entero
        // ya bloquea la entrada, así que en la práctica estos dos TAMPOCO son
        // alcanzables con la Nevera baja (consecuencia asumida por el owner).
        // Esta lista sigue importando solo para la segunda barrera — la ventana
        // en que la Nevera se vacía con el modal ya abierto: ahí sí se
        // deshabilitan los 3 que consumen nevera y estos 2 siguen pulsables.
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

/**
 * El JSX del botón de swap, del comentario-marker a SU cierre `</button>`.
 *
 * Anclado a la estructura y no a una ventana de N bytes: la primera versión de
 * este test cortaba a 2.600 chars y el botón mide ~6.400, así que los asserts
 * de `disabled` (offset 2.929) y `title` (5.184) miraban texto que no era el
 * suyo y fallaban por el motivo equivocado. Una ventana fija caduca sola en
 * cuanto el elemento crece un atributo.
 */
function swapButtonJsx(src) {
    const i = src.indexOf('REGENERATE BUTTON (AI SWAP)');
    if (i === -1) throw new Error('marker del botón de swap no encontrado');
    const end = src.indexOf('</button>', i);
    if (end === -1) throw new Error('cierre </button> no encontrado tras el marker');
    return src.slice(i, end);
}

describe('P1-SWAP-PANTRY-GATE-FULL-BUTTON · el botón entero se bloquea', () => {
    // [2026-07-30] Decisión del owner tras ver la versión por-motivo: se prefiere
    // simetría con "Actualizar platos" antes que abrir un modal donde media lista
    // está muerta. Consecuencia asumida: con la Nevera baja tampoco se puede pedir
    // 'cravings'/'weekend'. Este bloque ancla ESA decisión — si alguien la revierte
    // por "restaurar la exención de P3-SWAP-PANTRY-DEFAULT" sin hablarlo, falla.
    it('el botón entra en el disabled real, no solo en el estilo', () => {
        const block = swapButtonJsx(_dashSrc);
        // Sanity del vehículo antes de los asserts que importan.
        expect(block).toContain('Cambiar Plato');
        expect(block).toMatch(/disabled=\{[^}]*isPantryTooEmptyForSwap/);
    });

    it('hay early-return en onClick — el disabled nativo no es la única barrera', () => {
        const block = swapButtonJsx(_dashSrc);
        expect(block).toMatch(/if\s*\(isPantryTooEmptyForSwap\)\s*return/);
    });

    it('el bloqueo dice POR QUÉ (title + aria-label), no solo se apaga', () => {
        const block = swapButtonJsx(_dashSrc);
        expect(block).toMatch(/title=\{[^}]*swapPantryClaim/);
        expect(block).toMatch(/aria-label=\{[^}]*swapPantryClaim/);
        // El copy nombra el número y adónde ir. Un "no disponible" pelado deja
        // al usuario sin acción posible.
        expect(_dashSrc).toMatch(/swapPantryClaim\s*=[\s\S]{0,240}Nevera/);
    });

    it('el gate por motivo SOBREVIVE como segunda barrera', () => {
        // No es redundante ni código muerto: cubre que la Nevera se vacíe
        // MIENTRAS el modal está abierto. Si alguien lo borra por "ya lo cubre
        // el botón", esa ventana queda descubierta.
        expect(_dashSrc).toContain('isSwapReasonPantryLocked');
        expect(_dashSrc).toContain('decorateSwapOption');
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
