// [P2-RESTOCK-COPY-COVERAGE · 2026-09-02] Vivo (plan renovado con la Nevera llena): el
// Dashboard decía «36 ítems de la lista ya en tu Nevera» y, justo debajo, el banner
// «Tu Nevera está vacía para este plan». El banner solo miraba «no restocked + hay
// pendientes» (is_restocked se resetea al renovar, a propósito) — ciego a la cobertura.
// El copy ahora sigue al estado de la Nevera: cobertura cero conserva el texto de
// siempre; cobertura parcial habla de lo que FALTA; cobertura total no renderiza nada
// (hasPendingItems=false, sin cambios).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RestockNudge from '../components/dashboard/RestockNudge';

function baseProps(overrides = {}) {
    return {
        planData: { cycle_start_date: '2026-09-01', id: 'plan-copy-coverage' },
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

describe('[P2-RESTOCK-COPY-COVERAGE] el banner sigue al estado de la Nevera', () => {
    it('cobertura parcial (36 de 41): habla de lo que falta, no de una Nevera vacía', () => {
        render(<RestockNudge {...baseProps({ coveredCount: 36, pendingCount: 5 })} />);
        expect(screen.getByText('Tu Nevera ya cubre 36 de 41 ítems de este plan')).toBeInTheDocument();
        expect(screen.getByText(/¿Ya compraste lo que falta \(5\)\?/)).toBeInTheDocument();
        expect(screen.queryByText('Tu Nevera está vacía para este plan')).not.toBeInTheDocument();
        // nombre EXACTO: el prompt (#2) también renderiza «Sí, ya compré — llenar mi Nevera»
        expect(screen.getByRole('button', { name: 'Sí, ya los compré' })).toBeInTheDocument();
    });

    it('cobertura cero: el copy de siempre (anclas históricas intactas)', () => {
        render(<RestockNudge {...baseProps({ coveredCount: 0, pendingCount: 41 })} />);
        expect(screen.getByText('Tu Nevera está vacía para este plan')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sí, ya compré' })).toBeInTheDocument();
        expect(screen.queryByText(/ya cubre/)).not.toBeInTheDocument();
    });

    it('sin props de cobertura (llamadores viejos) ⇒ mismo comportamiento que cobertura cero', () => {
        render(<RestockNudge {...baseProps()} />);
        expect(screen.getByText('Tu Nevera está vacía para este plan')).toBeInTheDocument();
    });

    it('el CTA de cobertura parcial dispara el MISMO restock (solo cambia el copy)', () => {
        const props = baseProps({ coveredCount: 36, pendingCount: 5 });
        render(<RestockNudge {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Sí, ya los compré' }));
        expect(props.onConfirmRestock).toHaveBeenCalledTimes(1);
    });
});
