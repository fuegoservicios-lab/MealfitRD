// [P1-RESTOCK-NUDGE-SETTLED · 2026-07-28] El modal "¿Ya hiciste las compras?"
// (#2 prompt) "a veces aparece y desaparece" — se auto-abría con el valor
// CACHEADO de `hasPendingItems` (localStorage de la sesión anterior) mientras
// `liveInventory` todavía no había cargado (Dashboard.jsx:2151,
// `computedHasPendingShoppingItems === null` ⇒ fallback a cache en :2291), y se
// cerraba solo en cuanto el dato real resolvía. Peor: el auto-open fantasma ya
// había consumido `promptAutoShownSession` (P2-RESTOCK-PROMPT-ONCE), así que el
// nudge REAL (con datos asentados) nunca volvía a aparecer esa sesión.
//
// Fix: `pendingItemsSettled` (derivado en Dashboard de
// `computedHasPendingShoppingItems !== null`) le dice al componente si
// `hasPendingItems` es la respuesta REAL o solo la mejor suposición cacheada.
// Mientras no está asentado, las capas intrusivas/one-shot (#2 prompt, #3
// auto-fill, #4 recordatorio) no hacen NADA — ni auto-abren, ni fuerzan cierre,
// ni consumen su guard de una sola vez. El banner (#1) es la EXCEPCIÓN
// deliberada: persistente, no intrusivo, barato de estar mal un instante — sigue
// leyendo el valor cacheado tal cual.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RestockNudge from '../components/dashboard/RestockNudge';
import { AUTOFILL_GRACE_DAYS, planNudgeKey, wasReminderSent, wasAutoFilled } from '../utils/restockNudge';

function baseProps(overrides = {}) {
    return {
        planData: { cycle_start_date: '2026-07-20', id: 'plan-settled-gate' },
        hasPendingItems: true,
        pendingItemsSettled: true,
        restocked: false,
        daysSinceGroceryStart: 0,
        onConfirmRestock: vi.fn(),
        onSilentRestock: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

beforeEach(() => {
    localStorage.clear();
});

describe('[P1-RESTOCK-NUDGE-SETTLED] RestockNudge — gate de dato asentado', () => {
    it('reproduce el bug reportado: NO auto-abre con cache=true sin asentar, y tras asentar a false JAMÁS se abrió', () => {
        const { rerender } = render(<RestockNudge {...baseProps({ pendingItemsSettled: false, hasPendingItems: true })} />);

        // Mientras el dato no está asentado, el prompt NO debe aparecer —
        // aunque el valor cacheado (hasPendingItems=true) diga que sí hay pendientes.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        // El dato real resuelve: NO había pendientes. Si el prompt se hubiese
        // auto-abierto con el guess, ahora se cerraría solo (el "desaparece" del
        // reporte). La aserción de arriba ya prueba que nunca llegó a abrirse.
        rerender(<RestockNudge {...baseProps({ pendingItemsSettled: true, hasPendingItems: false })} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('unsettled → settled(true): el prompt se auto-abre exactamente una vez, EN la evaluación asentada (el guard de sesión no se quemó en la suposición)', () => {
        const { rerender } = render(<RestockNudge {...baseProps({ pendingItemsSettled: false, hasPendingItems: true })} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        rerender(<RestockNudge {...baseProps({ pendingItemsSettled: true, hasPendingItems: true })} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('¿Ya hiciste las compras?')).toBeInTheDocument();
    });

    it('unsettled: no dispara el auto-fill (POST) ni marca el recordatorio como enviado, aunque el resto de condiciones ya calcen', async () => {
        const onSilentRestock = vi.fn().mockResolvedValue(undefined);
        const planData = { cycle_start_date: '2026-07-10', id: 'plan-unsettled-autofill' };
        render(
            <RestockNudge
                {...baseProps({
                    planData,
                    pendingItemsSettled: false,
                    hasPendingItems: true,
                    daysSinceGroceryStart: AUTOFILL_GRACE_DAYS + 2,
                    onSilentRestock,
                })}
            />
        );

        // Deja correr cualquier microtask pendiente (el auto-fill real es async).
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onSilentRestock).not.toHaveBeenCalled();
        const k = planNudgeKey(planData);
        expect(wasReminderSent(k)).toBe(false);
        expect(wasAutoFilled(k)).toBe(false);
    });

    it('con el prompt ya abierto (asentado), una re-evaluación NO asentada no lo cierra — no hace nada mientras no está asentado', () => {
        const { rerender } = render(<RestockNudge {...baseProps({ pendingItemsSettled: true, hasPendingItems: true })} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        // El dato "se desasienta" de nuevo (p.ej. un refetch en curso) mientras el
        // modal sigue abierto — un render sin datos confiables NO debe cerrarlo.
        rerender(<RestockNudge {...baseProps({ pendingItemsSettled: false, hasPendingItems: true })} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('el banner (#1) sigue usando el valor cacheado incluso sin asentar — excepción deliberada (persistente, barato de estar mal)', () => {
        render(<RestockNudge {...baseProps({ pendingItemsSettled: false, hasPendingItems: true })} />);
        expect(screen.getByText('Tu Nevera está vacía para este plan')).toBeInTheDocument();
    });
});
