// [P1-DASH-WEEK-NAV · 2026-08-04] Tests del componente de dos niveles.
// `today` entra por prop, así que no hay timers que mockear.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import PlanWeekNav from '../components/dashboard/PlanWeekNav';

const TODAY = new Date(2026, 7, 6); // jueves 6 ago 2026

function plan(total, archivedIsos, liveIsos) {
    return {
        total_days_requested: total,
        _archived_days: archivedIsos.map((iso) => ({ date: iso, meals: [] })),
        days: liveIsos.map((iso) => ({ date: iso, meals: [] })),
    };
}

const base = {
    chunkStatusInfo: { upcoming_chunks: [], paused_chunks: [], overdue: false },
    today: TODAY,
    selected: { origen: 'vivo', idx: 0 },
    onSelect: () => {},
};

describe('[P1-DASH-WEEK-NAV] PlanWeekNav', () => {
    it('un plan de 30 dias que empieza jueves pinta 5 semanas', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        expect(screen.getAllByRole('tab', { name: /semana/i })).toHaveLength(5);
    });

    it('la fila de dias es una rejilla de 7 columnas, sin scroll horizontal', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        const grid = screen.getByTestId('week-day-grid');
        expect(grid.style.gridTemplateColumns).toBe('repeat(7, 1fr)');
        expect(grid.style.overflowX).not.toBe('auto');
    });

    it('la semana parcial deja huecos vacios en L/M/X', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        const celdas = within(screen.getByTestId('week-day-grid')).getAllByTestId(/^day-cell-/);
        expect(celdas).toHaveLength(7);
        expect(celdas.slice(0, 3).every((c) => c.getAttribute('data-empty') === 'true')).toBe(true);
        expect(celdas[3].getAttribute('data-empty')).toBe('false');
    });

    it('un dia archivado se puede seleccionar y lleva su propio idx', () => {
        const onSelect = vi.fn();
        render(<PlanWeekNav planData={plan(30, ['2026-08-05'], ['2026-08-06'])} {...base} onSelect={onSelect} />);
        fireEvent.click(screen.getByTestId('day-cell-2026-08-05'));
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ origen: 'archivado', idx: 0 }));
    });

    it('un dia sin generar NO es seleccionable', () => {
        const onSelect = vi.fn();
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} onSelect={onSelect} />);
        fireEvent.click(screen.getByTestId('day-cell-2026-08-09'));
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('cambiar de semana muestra los dias de esa semana', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        expect(screen.queryByTestId('day-cell-2026-08-10')).toBeNull();
        fireEvent.click(screen.getAllByRole('tab', { name: /semana/i })[1]);
        expect(screen.getByTestId('day-cell-2026-08-10')).toBeTruthy();
    });

    it('la fecha del proximo lote va UNA vez, no repetida por dia', () => {
        const info = {
            paused_chunks: [],
            overdue: false,
            upcoming_chunks: [{ days_offset: 1, days_count: 3, status: 'pending', execute_after: '2026-08-07T14:00:00+00:00' }],
        };
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} chunkStatusInfo={info} />);
        expect(screen.getAllByText(/se genera viernes/i)).toHaveLength(1);
    });

    it('degrada a null si algun dia carece de date', () => {
        const p = plan(30, [], ['2026-08-06']);
        delete p.days[0].date;
        const { container } = render(<PlanWeekNav planData={p} {...base} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('cada estado se comunica tambien con texto, no solo con color', () => {
        render(<PlanWeekNav planData={plan(30, ['2026-08-05'], ['2026-08-06'])} {...base} />);
        expect(screen.getByTestId('day-cell-2026-08-06').getAttribute('aria-label')).toMatch(/hoy/i);
        expect(screen.getByTestId('day-cell-2026-08-05').getAttribute('aria-label')).toMatch(/pas/i);
    });

    it('la semana abierta al montar es la que contiene hoy, no la primera', () => {
        // Plan que arranco hace dos semanas: hoy cae en la semana 3.
        const p = plan(30, ['2026-07-23', '2026-07-30'], ['2026-08-06']);
        render(<PlanWeekNav planData={p} {...base} />);
        expect(screen.getByTestId('day-cell-2026-08-06')).toBeTruthy();
    });

    it('el dia seleccionado se marca con aria-current', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        expect(screen.getByTestId('day-cell-2026-08-06').getAttribute('aria-current')).toBe('date');
    });
});
