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
//      `programado`. NINGÚN estado ofrece un control: los cuatro son
//      informativos. `atrasado` llegó a tener un CTA y se retiró en la ronda 3
//      — la razón, con sus tres hechos, vive en `renderGhost`, y el test
//      «en estado overdue el componente no expone ningun control…» la ancla.
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
  render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
  expect(screen.getAllByRole('presentation').length).toBe(4);      // 4 fantasmas
  expect(screen.getByText(/\+23 días/)).toBeInTheDocument();       // 30 - 3 - 4
});

test('estado programado muestra la fecha', () => {
  render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
  expect(screen.getAllByText(/se genera/i).length).toBeGreaterThan(0);
});

// [Ronda 3] Este test pedía originalmente un CTA («el click llama a onRetry»).
// El CTA se retiró — ver el bloque de tres hechos en `renderGhost`, rama
// `atrasado` — así que lo que se ancla ahora es lo que el estado SÍ hace: pintar
// el día como atrasado, con su fecha, sin ofrecer un control que no funciona.
// La ausencia del control tiene su propio test más abajo.
test('overdue pinta atrasado con la fecha, sin ofrecer ningún control', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                          isGuest={false} />);
  expect(screen.getAllByText(/atrasado/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/4 de agosto/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /atrasado|reintentar/i })).toBeNull();
});

test('guest no renderiza nada', () => {
  const { container } = render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={true} />);
  expect(container.firstChild).toBeNull();
});

test('degradacion: sin upcoming_chunks no renderiza nada', () => {
  const { container } = render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={{ in_flight_count: 0 }} isGuest={false} />);
  expect(container.firstChild).toBeNull();
});

test('plan de 7 dias sin resumen', () => {
  const plan7 = { ...plan30, total_days_requested: 7 };
  render(<UpcomingDayTabs planData={plan7} chunkStatusInfo={csi()} isGuest={false} />);
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
                          isGuest={false} />);
  expect(screen.getAllByText(/pausado/i).length).toBeGreaterThan(0);
  expect(screen.queryByText(/en proceso/i)).toBeNull();
  // El chip solo MARCA el día; el detalle y el CTA de la pausa viven en el
  // banner P0-DASH-CHIP-HONESTY-V2 de Dashboard.jsx. Sin botón aquí.
  expect(screen.queryByRole('button', { name: /pausado|reintentar/i })).toBeNull();
});

test('nunca dice "en proceso" con la cola parada (la mentira del chip viejo)', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ in_flight_count: 0 })}
                          isGuest={false} />);
  expect(screen.queryByText(/en proceso/i)).toBeNull();
  expect(screen.queryByText(/en camino/i)).toBeNull();
});

test('en proceso solo cuando la cola tiene algo corriendo', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ in_flight_count: 1 })}
                          isGuest={false} />);
  expect(screen.getAllByText(/en proceso/i).length).toBeGreaterThan(0);
});

test('atrasado gana sobre pausado y sobre en proceso', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04', pending_user_action_count: 1, in_flight_count: 2 })}
                          isGuest={false} />);
  // El primer fantasma dice "atrasado" aunque la cola también reporte pausa y
  // trabajo en vuelo.
  expect(screen.getAllByRole('presentation')[0]).toHaveTextContent(/atrasado/i);
});

test('ningun fantasma es interactivo, tampoco el atrasado', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                          isGuest={false} />);
  // Los 4 siguen siendo `presentation`: el atrasado ya no se convierte en botón.
  expect(screen.getAllByRole('presentation').length).toBe(4);
});

// [Ronda 3] ANCLA DE AUSENCIA. El CTA se intentó dos veces; este test es lo que
// hace que un tercer intento se ponga rojo en vez de llegar a producción.
//
// El único botón legítimo de este componente es el toggle del popover resumen
// («📅 +N días»), que no dispara ninguna request. Cualquier otro control en
// estado `overdue` sería, por la cadena de tres hechos documentada en
// `renderGhost`: (1) una repetición del POST que `triggerShift` ya hizo al
// montar, (2) inútil justo cuando el chip persiste, y (3) capaz de archivar la
// ventana viva y APAGAR el propio chip con un toast de éxito.
test('en estado overdue el componente no expone ningun control fuera del popover', () => {
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                          isGuest={false} />);
  const botones = screen.getAllByRole('button');
  expect(botones).toHaveLength(1);
  expect(botones[0]).toHaveAccessibleName(/\+23 días/);
  // Y ese único botón no habla de reintentar nada.
  expect(screen.queryByText(/reintent/i)).toBeNull();
});

// El componente ya no acepta `onRetry`. Si alguien vuelve a cablear un callback
// de reintento, este test lo delata aunque el botón parezca inofensivo.
test('un onRetry pasado por error jamas se invoca', () => {
  const onRetry = vi.fn();
  render(<UpcomingDayTabs planData={plan30}
                          chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                          isGuest={false} onRetry={onRetry} />);
  screen.getAllByRole('button').forEach((b) => fireEvent.click(b));
  expect(onRetry).not.toHaveBeenCalled();
});

test('sin dias restantes no renderiza nada', () => {
  const planCompleto = { ...plan30, total_days_requested: 3 };
  const { container } = render(<UpcomingDayTabs planData={planCompleto}
                          chunkStatusInfo={{ ...csi(), upcoming_chunks: [] }}
                          isGuest={false} />);
  expect(container.firstChild).toBeNull();
});

test('sin date estampada degrada a "Dia N" sin romper', () => {
  const planSinFechas = { total_days_requested: 30, days: [{}, {}, {}], generation_status: 'generating_next' };
  render(<UpcomingDayTabs planData={planSinFechas} chunkStatusInfo={csi()} isGuest={false} />);
  // days_offset=3 ⇒ el primer fantasma es el día 4 del plan.
  expect(screen.getAllByText(/Día 4/).length).toBeGreaterThan(0);
});

test('el resumen abre un popover explicando el ritmo por etapas', () => {
  render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
  expect(screen.queryByText(/por etapas/i)).toBeNull();
  // `fireEvent` (no el `.click()` crudo de los tests de arriba) porque este
  // click SÍ dispara un setState: RTL lo envuelve en `act()` y el re-render
  // queda aplicado antes del assert.
  fireEvent.click(screen.getByRole('button', { name: /\+23 días/ }));
  expect(screen.getByText(/por etapas/i)).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Ronda 2 — la rama PRINCIPAL del cálculo de fecha (no solo su fallback).
//
// El test del backend que borramos al absorber el skeleton protegía este
// cálculo; la cobertura que dejé en su lugar solo tocaba el fallback «sin
// `date` ⇒ Día N», así que un revert a parseo naive habría dejado la suite
// verde con TODOS los días corridos uno.
//
// La trampa es real y direccional: `new Date('2026-08-04')` es medianoche UTC,
// que en cualquier TZ al oeste de Greenwich cae el día ANTERIOR en local. Con
// TZ=America/La_Paz (UTC−4, el mismo offset que RD):
//     ancla local  2026-08-04 → martes    ⇒ primer fantasma → miércoles
//     ancla naive  2026-08-04 → lunes     ⇒ primer fantasma → martes
// Por eso el assert va contra el PRIMER fantasma y no contra "existe un tab que
// diga miércoles": bajo parseo naive «Miércoles» sigue apareciendo — como
// SEGUNDO fantasma. Un assert de mera presencia no distinguiría nada.
//
// La TZ se fija en el propio test para que sea determinista en cualquier
// máquina (Node invalida su caché de zona al asignar `process.env.TZ`, incluso
// después de que otros módulos ya hayan usado `Date` — verificado antes de
// escribir esto).
// ---------------------------------------------------------------------------
describe('nombres de día: rama con `date` estampada (TZ fija UTC−4)', () => {
  const _TZ_ORIGINAL = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/La_Paz'; });
  afterAll(() => {
    // `process.env.TZ = undefined` NO restaura nada: escribe la cadena literal
    // "undefined", que Node interpreta como zona inválida (`Etc/Unknown`,
    // offset 0). En una máquina sin TZ en el entorno —el caso normal en
    // Windows— eso dejaba el proceso en UTC para todo lo que corriera después.
    // Hay que BORRAR la variable, no asignarle texto.
    if (_TZ_ORIGINAL === undefined) delete process.env.TZ;
    else process.env.TZ = _TZ_ORIGINAL;
  });

  test('el primer fantasma sigue al ÚLTIMO día del plan en fecha LOCAL, no UTC', () => {
    render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
    const tabs = screen.getAllByRole('presentation');
    // Última `date` del plan = 2026-08-04 (martes local) ⇒ +1 = miércoles.
    // Con parseo naive saldría «Martes» y este assert se pone rojo.
    expect(tabs[0]).toHaveTextContent(/^Miércoles/);
    expect(tabs[1]).toHaveTextContent(/^Jueves/);
    expect(tabs[3]).toHaveTextContent(/^Sábado/);
  });

  test('`execute_after` se lee como INSTANTE, no como su parte-fecha en UTC', () => {
    // 02:00Z de un miércoles es todavía MARTES 22:00 en UTC−4. Los ~12 paths de
    // recovery que escriben `execute_after = NOW()` producen justo estas horas
    // UTC bajas; leer los 10 primeros caracteres diría "mié" cuando el usuario
    // aún está en martes.
    const csiMadrugada = csi({
      upcoming_chunks: [{ days_offset: 3, days_count: 4, status: 'pending', execute_after: '2026-08-05T02:00:00Z' }],
    });
    render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csiMadrugada} isGuest={false} />);
    expect(screen.getAllByText(/se genera mar/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/se genera mié/i)).toBeNull();
  });

  test('`overdue_since` se muestra en es-DO, nunca el ISO crudo', () => {
    render(<UpcomingDayTabs planData={plan30}
                            chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                            isGuest={false} />);
    const chip = screen.getAllByRole('status')[0];
    expect(chip).toHaveTextContent(/4 de agosto/);
    expect(chip.getAttribute('aria-label')).toMatch(/4 de agosto/);
    expect(chip.getAttribute('aria-label')).not.toMatch(/2026-08-04/);
    const tab = screen.getAllByRole('presentation')[0];
    expect(tab.getAttribute('title')).not.toMatch(/2026-08-04/);
    expect(tab.getAttribute('title')).toMatch(/4 de agosto/);
  });
});

// ---------------------------------------------------------------------------
// Ronda 2 — a11y. Las pestañas son `role="presentation"` (lo exige el contrato
// del brief), así que sin un chip semántico dentro un lector de pantalla no
// tendría NINGÚN canal para enterarse de que un día está pausado o en proceso:
// esa información la daba el bloque viejo con `role="status"` + `aria-label` y
// no se puede perder al mover el código.
// ---------------------------------------------------------------------------
describe('a11y', () => {
  test('el chip de estado conserva role="status" con el día nombrado', () => {
    render(<UpcomingDayTabs planData={plan30}
                            chunkStatusInfo={csi({ pending_user_action_count: 1, in_flight_count: 0 })}
                            isGuest={false} />);
    const chips = screen.getAllByRole('status');
    expect(chips.length).toBe(4);
    // El chip solo dice "⏸ pausado": fuera de contexto no se sabe de qué día,
    // por eso el aria-label lo nombra.
    expect(chips[0].getAttribute('aria-label')).toMatch(/pausado/);
    expect(chips[0].getAttribute('aria-label')).toMatch(/^\S+:/);
  });

  // [Ronda 3 · N5] El chip `atrasado` era el único estado sin `aria-label`, y el
  // test de a11y de arriba no lo cubría porque renderiza con `overdue:false`.
  test('el chip `atrasado` también lleva aria-label, con día y fecha', () => {
    render(<UpcomingDayTabs planData={plan30}
                            chunkStatusInfo={csi({ overdue: true, overdue_since: '2026-08-04' })}
                            isGuest={false} />);
    const label = screen.getAllByRole('status')[0].getAttribute('aria-label');
    expect(label).toMatch(/atrasado/i);
    expect(label).toMatch(/4 de agosto/);
    expect(label).toMatch(/^\S+:/);   // nombra el día, no solo el estado
  });

  // [Ronda 3 · N5] aria y texto visible tienen que decir lo MISMO: el label
  // decía «programado», palabra que la pestaña no muestra en ningún sitio.
  test('el aria-label de "programado" repite lo que se ve, no una etiqueta interna', () => {
    render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
    const chip = screen.getAllByRole('status')[0];
    expect(chip).toHaveTextContent(/se genera/i);
    expect(chip.getAttribute('aria-label')).toMatch(/se genera/i);
    expect(chip.getAttribute('aria-label')).not.toMatch(/programado/i);
  });

  test('el resumen declara aria-expanded y aria-controls apuntando al popover', () => {
    render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
    const btn = screen.getByRole('button', { name: /\+23 días/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    const controls = btn.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(controls)).toBeInTheDocument();
  });

  test('el popover cierra con Esc', () => {
    render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
    fireEvent.click(screen.getByRole('button', { name: /\+23 días/ }));
    expect(screen.getByText(/por etapas/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/por etapas/i)).toBeNull();
  });

  test('el popover cierra al hacer click fuera', () => {
    render(<UpcomingDayTabs planData={plan30} chunkStatusInfo={csi()} isGuest={false} />);
    fireEvent.click(screen.getByRole('button', { name: /\+23 días/ }));
    expect(screen.getByText(/por etapas/i)).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/por etapas/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [Ronda 3 · N4] Guard del restaurado de TZ. Va DELIBERADAMENTE al final del
// archivo: los `describe` corren en orden de declaración, así que para cuando
// este bloque ejecuta ya corrió el `afterAll` del pin de arriba.
//
// El defecto que cierra: `process.env.TZ = undefined` no borra la variable,
// escribe la cadena literal "undefined", y Node la interpreta como zona
// inválida ⇒ `Etc/Unknown`, offset 0. En una máquina sin TZ en el entorno (el
// caso de esta, verificado) eso dejaba TODO lo que corriera después del pin en
// UTC — incluidos los tests de a11y de este mismo archivo, que comparan nombres
// de día. Un test que ensucia el reloj de sus vecinos es peor que no fijar la
// zona: falla lejos de su causa.
// ---------------------------------------------------------------------------
describe('higiene del pin de TZ', () => {
  test('la zona queda restaurada, no con la cadena "undefined"', () => {
    expect(process.env.TZ).not.toBe('undefined');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('Etc/Unknown');
  });
});
