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

    // [P1-WEEKNAV-SQUARE-DAYS · 2026-08-11] La rejilla se declara ahora en CSS
    // (`.plan-week-grid` en index.css), no en un `style` inline. Un inline NO RECIBE
    // OVERRIDE RESPONSIVE, y en el teléfono hace falta cerrar el hueco entre columnas
    // para que a cada día le quede ancho suficiente y pueda ser cuadrado.
    //
    // Lo que este caso protege sigue igual —siete columnas y ni una menos, sin deslizar—
    // pero se afirma contando las celdas, no leyendo un atributo inline que ya no existe.
    // jsdom no aplica hojas de estilo, así que `style.gridTemplateColumns` seria vacío
    // aunque el CSS fuera correcto: mirar ahí no probaría nada.
    it('la fila de dias tiene 7 columnas y no desliza', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        const grid = screen.getByTestId('week-day-grid');
        expect(grid).toHaveClass('plan-week-grid');
        expect(within(grid).getAllByTestId(/^day-cell-/)).toHaveLength(7);
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

    // [P1-WEEKNAV-MOBILE-SIZE · 2026-08-11] ESTE CASO SE INVIRTIO, y conviene saber
    // por que antes de volver a darle la vuelta.
    //
    // Afirmaba que la fecha del proximo lote («se genera viernes») aparecia UNA vez y
    // no repetida en cada dia. Aquella consolidacion era correcta: antes se leia en
    // los cuatro dias, y eso era ruido. Pero consolidar un dato REDUNDANTE lo deja
    // redundante, solo que una vez — el dia en que se genera el lote ES el primer dia
    // marcado «en cola» en la propia fila. El dueño la vio innecesaria y tenia razon.
    //
    // Lo que este caso protege ahora es que la retirada fuera COMPLETA para la vista y
    // NULA para quien usa lector de pantalla: la frase no se escribe, pero sigue en el
    // `aria-label` de cada dia. Si vuelve como texto visible, esto se pone en rojo.
    it('la fecha del proximo lote no se escribe, pero sigue siendo accesible', () => {
        const info = {
            paused_chunks: [],
            overdue: false,
            upcoming_chunks: [{ days_offset: 1, days_count: 3, status: 'pending', execute_after: '2026-08-07T14:00:00+00:00' }],
        };
        const { container } = render(
            <PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} chunkStatusInfo={info} />,
        );
        expect(screen.queryAllByText(/se genera viernes/i)).toHaveLength(0);

        const conLaFrase = [...container.querySelectorAll('[aria-label]')]
            .filter((n) => /se genera viernes/i.test(n.getAttribute('aria-label')));
        expect(
            conLaFrase.length,
            'la frase desaparecio tambien del aria-label: entonces no se movio, se perdio',
        ).toBeGreaterThan(0);
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

    // [P1-DASH-WEEK-NAV · 2026-08-04] Reporte del owner sobre la version
    // desplegada: con iniciales sueltas la "M" no se lee como martes y la "X"
    // de miercoles se entiende menos todavia. Este test impide volver a una
    // sola letra "por compactar".
    it('los dias se nombran con abreviaturas legibles, no con iniciales sueltas', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        const jueves = screen.getByTestId('day-cell-2026-08-06');
        expect(jueves.textContent).toMatch(/Jue/);
        // Ninguna celda puede quedarse en un solo caracter de dia de semana.
        const celdas = within(screen.getByTestId('week-day-grid')).getAllByTestId(/^day-cell-/);
        celdas.forEach((c) => {
            const dow = c.querySelector('.plan-week-cell__dow');
            expect(dow).not.toBeNull();
            expect(dow.textContent.trim().length).toBeGreaterThan(1);
        });
    });

    it('el dia seleccionado se marca con aria-current', () => {
        render(<PlanWeekNav planData={plan(30, [], ['2026-08-06'])} {...base} />);
        expect(screen.getByTestId('day-cell-2026-08-06').getAttribute('aria-current')).toBe('date');
    });
});
