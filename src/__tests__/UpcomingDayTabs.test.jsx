// [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] Pestañas fantasma de los días del plan
// que TODAVÍA no existen. Reemplaza (absorbe) el skeleton inline que vivía en
// Dashboard.jsx dentro del bloque `weekIdx === 0` — ver el comentario con este
// mismo marker allí.
//
// Lo que estos tests protegen, y que el skeleton viejo NO protegía:
//   1. El skeleton solo se dibujaba mientras `generation_status` decía
//      "generando" Y el temporal-gate V3 dejaba pasar; el resultado era que el
//      usuario NUNCA veía los días futuros de un plan de 30 días — la fila se
//      cortaba en 3-4 tabs sin explicación. Ahora los días futuros se muestran
//      SIEMPRE (el gate visual V3 queda SUPERSEDED por el spec 2026-08-04).
//   2. Lo que NO se relaja es la honestidad del estado (jerarquía
//      P0-DASH-CHIP-HONESTY): la etiqueta jamás puede afirmar que algo está
//      corriendo cuando la cola dice que nada corre. `atrasado` (overdue) gana
//      sobre `pausado`, que gana sobre `en proceso`, que gana sobre
//      `programado`. El único estado que ofrece un CTA es `atrasado` — porque
//      es el único donde el usuario puede hacer algo (reintentar).
//   3. Degradación POR AUSENCIA: si el backend es viejo o el knob
//      `MEALFIT_UPCOMING_DAYS_UI` está apagado, `upcoming_chunks` no viene en
//      el payload (ausente, no null) y el componente no renderiza nada — el
//      comportamiento de hoy, sin inventar estados que no podemos verificar.
import UpcomingDayTabs from '../components/dashboard/UpcomingDayTabs';
import { render, screen, fireEvent } from '@testing-library/react';

const plan30 = {
  total_days_requested: 30,
  days: [{ date: '2026-08-02' }, { date: '2026-08-03' }, { date: '2026-08-04' }],
  generation_status: 'generating_next',
};
const csi = (extra = {}) => ({
  in_flight_count: 0, pending_user_action_count: 0,
  upcoming_chunks: [{ days_offset: 3, days_count: 4, status: 'pending', execute_after: '2026-08-05T09:00:00Z' }],
  overdue: false, overdue_since: null, ...extra,
});

test('renderiza fantasmas del proximo chunk + resumen con el resto', () => {
  render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} onRetry={() => {}} />);
  expect(screen.getAllByRole('presentation').length).toBe(4);      // 4 fantasmas
  expect(screen.getByText(/\+23 días/)).toBeInTheDocument();       // 30 - 3 - 4
});

test('estado programado muestra la fecha', () => {
  render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} onRetry={() => {}} />);
  expect(screen.getAllByText(/se genera/i).length).toBeGreaterThan(0);
});

test('overdue pinta atrasado y el CTA llama onRetry', () => {
  const onRetry = vi.fn();
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                          isGuest={false} onRetry={onRetry} />);
  screen.getByRole('button', { name: /atrasado|reintentar/i }).click();
  expect(onRetry).toHaveBeenCalled();
});

test('guest no renderiza nada', () => {
  const { container } = render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={true} onRetry={() => {}} />);
  expect(container.firstChild).toBeNull();
});

test('degradacion: sin upcoming_chunks no renderiza nada', () => {
  const { container } = render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={{ in_flight_count: 0 }} isGuest={false} onRetry={() => {}} />);
  expect(container.firstChild).toBeNull();
});

test('plan de 7 dias sin resumen', () => {
  const plan7 = { ...plan30, total_days_requested: 7 };
  render(<UpcomingDayTabs planData={plan7} chunkStatusInfo={csi()} isGuest={false} onRetry={() => {}} />);
  expect(screen.queryByText(/\+\d+ días/)).toBeNull();
});

// ---------------------------------------------------------------------------
// Jerarquía de honestidad (P0-DASH-CHIP-HONESTY) — la regla que el bloque
// eliminado de Dashboard.jsx protegía y que NO se puede debilitar al mover el
// código: "en proceso" solo cuando algo corre de verdad.
// ---------------------------------------------------------------------------

test('pausado gana sobre en proceso y NO ofrece CTA (el banner de arriba ya lo da)', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ pending_user_action_count: 1, in_flight_count: 0 })}
                          isGuest={false} onRetry={() => {}} />);
  expect(screen.getAllByText(/pausado/i).length).toBeGreaterThan(0);
  expect(screen.queryByText(/en proceso/i)).toBeNull();
  // El chip solo MARCA el día; el detalle y el CTA de la pausa viven en el
  // banner P0-DASH-CHIP-HONESTY-V2 de Dashboard.jsx. Sin botón aquí.
  expect(screen.queryByRole('button', { name: /pausado|reintentar/i })).toBeNull();
});

test('nunca dice "en proceso" con la cola parada (la mentira del chip viejo)', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ in_flight_count: 0 })}
                          isGuest={false} onRetry={() => {}} />);
  expect(screen.queryByText(/en proceso/i)).toBeNull();
  expect(screen.queryByText(/en camino/i)).toBeNull();
});

test('en proceso solo cuando la cola tiene algo corriendo', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ in_flight_count: 1 })}
                          isGuest={false} onRetry={() => {}} />);
  expect(screen.getAllByText(/en proceso/i).length).toBeGreaterThan(0);
});

test('atrasado gana sobre pausado y sobre en proceso', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04', pending_user_action_count: 1, in_flight_count: 2 })}
                          isGuest={false} onRetry={() => {}} />);
  expect(screen.getByRole('button', { name: /atrasado|reintentar/i })).toBeInTheDocument();
});

test('solo el dia atrasado es interactivo: los demas siguen siendo presentation', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                          isGuest={false} onRetry={() => {}} />);
  // 4 fantasmas: el primero se convierte en <button> (CTA), quedan 3 inertes.
  expect(screen.getAllByRole('presentation').length).toBe(3);
});

test('sin dias restantes no renderiza nada', () => {
  const planCompleto = { ...plan30, total_days_requested: 3 };
  const { container } = render(<UpcomingDayTabs planData={planCompleto}
                          chunkStatusInfo={{ ...csi(), upcoming_chunks: [] }}
                          isGuest={false} onRetry={() => {}} />);
  expect(container.firstChild).toBeNull();
});

test('sin date estampada degrada a "Dia N" sin romper', () => {
  const planSinFechas = { total_days_requested: 30, days: [{}, {}, {}], generation_status: 'generating_next' };
  render(<UpcomingDayTabs planData={planSinFechas} chunkStatusInfo={csi()} isGuest={false} onRetry={() => {}} />);
  // days_offset=3 ⇒ el primer fantasma es el día 4 del plan.
  expect(screen.getAllByText(/Día 4/).length).toBeGreaterThan(0);
});

test('el resumen abre un popover explicando el ritmo por etapas', () => {
  render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} onRetry={() => {}} />);
  expect(screen.queryByText(/por etapas/i)).toBeNull();
  // `fireEvent` (no el `.click()` crudo de los tests de arriba) porque este
  // click SÍ dispara un setState: RTL lo envuelve en `act()` y el re-render
  // queda aplicado antes del assert.
  fireEvent.click(screen.getByRole('button', { name: /\+23 días/ }));
  expect(screen.getByText(/por etapas/i)).toBeInTheDocument();
});
