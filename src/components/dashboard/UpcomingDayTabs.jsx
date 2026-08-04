// [P2-CHUNK-OVERDUE-SIGNAL · 2026-08-04] Pestañas fantasma de los días del plan
// que TODAVÍA no existen, más una pestaña resumen para los días lejanos.
//
// ORIGEN: absorbe el skeleton inline que vivía en `Dashboard.jsx` dentro del
// bloque `weekIdx === 0` (markers P0-DASH-MISSING-DAY-SLOT / P0-DASH-CHIP-
// HONESTY / -V2 / -V3 / -V4). Ese bloque tenía un problema de producto: un plan
// de 30 días mostraba 3-4 pestañas y nada más, sin decir en ningún sitio que
// los otros 26 días existen y vienen en camino. Peor: el temporal-gate V3
// escondía los slots futuros mientras el usuario aún consumía el chunk actual,
// que es EXACTAMENTE el 90% del tiempo — el usuario nunca los veía.
//
// LO QUE CAMBIA (spec 2026-08-04): los días futuros se muestran SIEMPRE. El
// temporal-gate V3 (la mitad VISUAL, no la operacional del backend) queda
// SUPERSEDED — no ocultamos el futuro, lo etiquetamos con la verdad. La misma
// reversión se aplicó al banner de chunks pausados de `Dashboard.jsx`, que
// conservaba su propia copia del gate: si esta pestaña dice «revisa el aviso de
// arriba», ese aviso tiene que estar ahí.
//
// LO QUE NO CAMBIA (y no se puede debilitar): la jerarquía de honestidad de
// P0-DASH-CHIP-HONESTY. El chip viejo decía "en camino" leyendo solo
// `generation_status`, que puede decir 'generating_next' con TODOS los chunks
// pausados — spinner girando para días que nadie estaba generando. Aquí el
// estado se resuelve contra la COLA (`/chunk-status`), en este orden:
//
//   1. atrasado  → `overdue` (hoy debería existir un día que no existe y NADA
//                  corre). INFORMATIVO, sin control: el reintento real ya lo
//                  hace `triggerShift` en cada montaje del Dashboard — ver los
//                  tres hechos en `renderGhost` antes de añadir un botón aquí.
//   2. pausado   → `pending_user_action_count > 0 && in_flight_count === 0`.
//                  Solo MARCA el día: el detalle y el CTA de la pausa los da el
//                  banner de arriba. No duplicamos ese copy aquí.
//   3. en proceso→ SOLO si ESTE chunk está en `processing`. Es la única
//                  etiqueta que afirma actividad, así que se decide por el
//                  estado del propio chunk y NUNCA por `in_flight_count`, que
//                  suma ('pending','processing','stale') y por tanto puede ser
//                  > 0 sin que nada corra.
//   4. programado→ el resto de la cola. Con `pending` anuncia su
//                  `execute_after` ("le toca el <día>"); con `stale` —un chunk
//                  encolado esperando que el worker lo re-pickee— dice «en
//                  cola», porque esa fecha ya venció y no responde cuándo lo
//                  verá el usuario.
//
// DEGRADACIÓN POR AUSENCIA: `upcoming_chunks` viene AUSENTE (no null) cuando el
// knob `MEALFIT_UPCOMING_DAYS_UI` está apagado o el backend es más viejo que
// este bundle. En ese caso renderizamos `null`, que es el comportamiento de
// hoy. Nunca inferimos estados que no podemos verificar contra la cola.
import { useState, useRef, useEffect, useId } from 'react';
import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';

// Máximo de pestañas fantasma dibujadas del próximo chunk. Alineado con el cap
// de la ventana rolling de días reales (`MAX_WINDOW`, utils/planWindow.js): más
// de 4 fantasmas empujan las pestañas reales fuera del scroll horizontal en
// móvil, que es justo lo contrario de lo que esta feature quiere.
const MAX_GHOSTS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

// `new Date('2026-08-05')` se parsea como MEDIANOCHE UTC; en cualquier TZ al
// oeste de Greenwich (toda RD y las Américas) `toLocaleDateString` local
// retrocede un día y el fantasma diría "martes" donde el plan dice "miércoles".
// Parseamos los componentes a mano para construir una fecha LOCAL.
//
// Solo para valores FECHA (`YYYY-MM-DD`, como `day.date`). Para timestamps
// (`execute_after`) hay que hacer lo CONTRARIO: `new Date(iso)` respeta el
// instante y `toLocaleDateString` ya lo baja a la fecha local correcta — ver
// `scheduledLabel`.
function parseIsoDateLocal(value) {
    if (typeof value !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
}

function capitalize(s) {
    return typeof s === 'string' && s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function num(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// Sin `onRetry`: el estado `atrasado` es INFORMATIVO. La razón, con sus tres
// hechos verificados, está escrita en `renderGhost` — no la borres al refactorizar.
const UpcomingDayTabs = ({ planData, chunkStatusInfo, isGuest }) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const popoverWrapRef = useRef(null);
    const popoverId = useId();

    // Cierre por Esc y por click fuera. Va ANTES de cualquier early-return: un
    // hook detrás de un `return null` condicional rompe el orden de hooks.
    useEffect(() => {
        if (!popoverOpen) return undefined;
        const onKeyDown = (e) => { if (e.key === 'Escape') setPopoverOpen(false); };
        const onPointerDown = (e) => {
            if (popoverWrapRef.current && !popoverWrapRef.current.contains(e.target)) {
                setPopoverOpen(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onPointerDown);
        };
    }, [popoverOpen]);

    // [P1-GUEST-MODE · 2026-06-15, preservado] En modo invitado NO hay chunking
    // en background (plan efímero capado a 3 días): un fantasma "se genera el
    // jueves" nunca resolvería. El gancho de la semana completa se comunica con
    // el CTA de crear cuenta, no con pestañas que mienten.
    if (isGuest) return null;
    if (!planData) return null;

    const upcoming = chunkStatusInfo?.upcoming_chunks;
    // AUSENTE (knob OFF / backend viejo) ⇒ comportamiento de hoy. Ojo: `[]` SÍ
    // es una respuesta — significa "la cola no tiene nada pendiente" — y por eso
    // se distingue de `undefined` con un chequeo de tipo, no con un truthy.
    if (!Array.isArray(upcoming)) return null;

    const days = Array.isArray(planData.days) ? planData.days : [];
    const archived = Array.isArray(planData._archived_days) ? planData._archived_days : [];
    // `days` es la ventana ROLLING: el shift poda hacia `_archived_days` sin
    // tocar `total_days_requested`. Contar solo `days` subcuenta cualquier plan
    // que ya rotó (mismo defecto que la Ronda 2 arregló en el predicado
    // backend `compute_chunk_overdue`).
    const generatedCount = archived.length + days.length;
    const total = num(planData.total_days_requested, generatedCount);

    const next = upcoming.length > 0 ? upcoming[0] : null;
    const overdue = chunkStatusInfo?.overdue === true;

    const offset = num(next?.days_offset, generatedCount);
    // Sin chunk en cola pero `overdue` ⇒ hay al menos un día que debería
    // existir. Dibujamos ese uno: es el que se marca como atrasado. Y la cola
    // vacía es el caso NORMAL aquí, no el borde — `compute_chunk_overdue`
    // devuelve False en cuanto hay algo en vuelo (ver `renderGhost`).
    const rawCount = num(next?.days_count, overdue ? 1 : 0);
    const ghostCount = Math.max(0, Math.min(rawCount, MAX_GHOSTS));
    // Todo lo que queda DESPUÉS de los fantasmas visibles va al resumen — si
    // el chunk trae más días de los que dibujamos, el excedente cuenta ahí.
    const remaining = Math.max(0, total - offset - ghostCount);

    if (ghostCount <= 0 && remaining <= 0) return null;

    const puac = num(chunkStatusInfo?.pending_user_action_count, 0);
    const inFlight = num(chunkStatusInfo?.in_flight_count, 0);
    const isPausedFromQueue = puac > 0 && inFlight === 0;
    // [Ronda 4] La etiqueta de la pestaña la decide el estado del PROPIO chunk,
    // nunca el contador global `in_flight_count`. Ese contador suma
    // `('pending','processing','stale')`, así que con `|| inFlight > 0` un chunk
    // en cola heredaba la etiqueta «en proceso» —con spinner y un title que
    // afirma «se está generando ahora mismo»— porque OTRO chunk (o él mismo, en
    // `stale`) hacía subir el contador. Es justo el cruce que la cabecera de
    // este componente se compromete a no hacer: afirmar actividad sin que la
    // cola la confirme. No se veía mientras `stale` quedaba fuera del payload;
    // al hacerlo visible, la afirmación falsa pasaba a ser nuestra.
    const nextStatus = typeof next?.status === 'string' ? next.status : null;
    const isProcessing = nextStatus === 'processing';
    // `stale` NO está corriendo: es un chunk encolado para que el worker lo
    // re-pickee al refrescar la pantry (`db_plans.py`: "el worker los re-pickea
    // al refrescar pantry"). Se trata como encolado, igual que `pending`.
    const isStale = nextStatus === 'stale';

    // Ancla de nombres: la ÚLTIMA fecha estampada de la ventana viva. Planes
    // pre-`date` (P1-CHAT-PAST-DAYS estampó `date` en los 3 sitios de
    // renumeración, pero los viejos siguen en localStorage) degradan a "Día N".
    let anchor = null;
    for (let i = days.length - 1; i >= 0 && !anchor; i -= 1) {
        anchor = parseIsoDateLocal(days[i]?.date);
    }

    // `execute_after` es un TIMESTAMP, no una fecha: hay que resolver el
    // instante y dejar que `toLocaleDateString` lo baje a la fecha LOCAL. Tomar
    // sus 10 primeros caracteres sería leer la fecha en UTC — y los ~12 paths
    // de recovery que escriben `execute_after = NOW()` producen horas UTC
    // < 04:00 que en RD (UTC−4) caen el día local ANTERIOR: diríamos "se genera
    // mié" cuando localmente todavía es martes.
    const scheduledLabel = (() => {
        if (typeof next?.execute_after !== 'string') return null;
        const d = new Date(next.execute_after);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString('es-DO', { weekday: 'short' });
    })();

    const overdueSinceLabel = (() => {
        const d = parseIsoDateLocal(chunkStatusInfo?.overdue_since);
        if (!d) return null;
        return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long' });
    })();

    const ghostName = (i) => {
        if (anchor) {
            const d = new Date(anchor.getTime() + (i + 1) * DAY_MS);
            return capitalize(d.toLocaleDateString('es-DO', { weekday: 'long' }));
        }
        return `Día ${offset + i + 1}`;
    };

    // Estado por fantasma. `atrasado` aplica SOLO al primero: es el día que
    // debería existir hoy. Los siguientes conservan su estado real — decir que
    // los 4 están atrasados sería la misma clase de mentira que el chip viejo.
    const stateFor = (i) => {
        if (overdue && i === 0) return 'atrasado';
        if (isPausedFromQueue) return 'pausado';
        if (isProcessing) return 'en proceso';
        return 'programado';
    };

    const BASE_STYLE = {
        flexShrink: 0,
        minWidth: 'fit-content',
        whiteSpace: 'nowrap',
        padding: '8px 16px',
        borderRadius: '8px',
        borderWidth: '1px',
        borderStyle: 'dashed',
        background: 'var(--bg-card)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontSize: '0.9rem',
        fontWeight: 500,
        opacity: 0.55,
        color: 'var(--text-muted)',
        borderColor: 'var(--border)',
    };

    const CHIP_STYLE = { fontSize: '0.7rem', opacity: 0.85 };

    const renderGhost = (i) => {
        const state = stateFor(i);
        const name = ghostName(i);

        let suffix; let ariaSuffix; let titleText; let showSpinner = false; let extraStyle = {};
        if (state === 'atrasado') {
            // ─────────────────────────────────────────────────────────────
            // AQUÍ NO VA UN BOTÓN. Ya se intentó dos veces; esto es lo que
            // impide la tercera. Tres hechos, los tres verificados:
            //
            // 1. `overdue` implica `needsFill && needsShift`, así que cuando
            //    este chip es visible el `triggerShift` de `Dashboard.jsx`
            //    YA hizo el mismo `POST /api/plans/shift-plan` al montar.
            //    Medido mutando el handler: `expected 1 to be greater than 1`
            //    — ese 1 es la llamada del montaje. Un botón aquí repite una
            //    request que el usuario ya disparó al abrir la pantalla.
            //
            // 2. Por tanto el chip solo PERSISTE visible cuando aquel shift
            //    no encoló nada. Repetirlo tampoco encolará: el escenario en
            //    que el botón sería útil es exactamente aquel en el que ya
            //    sabemos que no sirve.
            //
            // 3. Y puede hacer daño: en `partial`/`generating_next` el click
            //    archiva la ventana viva entera ⇒ `days = []` ⇒ el predicado
            //    `compute_chunk_overdue` devuelve False ⇒ el chip DESAPARECE
            //    y el toast celebra sin haberse generado un solo día. Un
            //    control que puede borrar la señal que esta feature existe
            //    para mostrar no se arregla: se retira.
            //
            // El usuario no pierde palanca: `[P2-δ] «Refrescar próximos días»`
            // (Dashboard.jsx) ya ofrece el mismo endpoint con copy neutral, y
            // el reintento automático ocurre en cada montaje. Por eso el copy
            // de abajo promete exactamente eso y nada más — ni un reintento
            // que no ocurre, ni un canal de soporte que no existe.
            //
            // Si alguien quiere volver a poner un control aquí: primero hay
            // que refutar los tres hechos, no añadir el botón y ver qué pasa.
            // ─────────────────────────────────────────────────────────────
            const desde = overdueSinceLabel ? ` desde el ${overdueSinceLabel}` : '';
            suffix = `· atrasado${desde}`;
            ariaSuffix = `atrasado${desde}`;
            titleText = `Este día no se generó a tiempo${desde}. El sistema lo reintenta solo la próxima vez que abras la app.`;
            extraStyle = { background: '#FFFBEB', color: '#B45309', borderColor: '#F59E0B', opacity: 1 };
        } else if (state === 'pausado') {
            // Solo marca el día. El detalle (reason_code → copy) y el CTA los
            // da el banner de arriba, que desde 2026-08-04 ya NO se auto-oculta
            // por el temporal-gate V3 — si no, esta frase remitiría a un aviso
            // invisible.
            suffix = '⏸ pausado';
            ariaSuffix = 'pausado';
            titleText = 'Este día está pausado. Revisa el aviso de arriba para continuar.';
            extraStyle = { background: '#FFFBEB', color: '#B45309', borderColor: '#F59E0B', opacity: 0.85 };
        } else if (state === 'en proceso') {
            suffix = '· en proceso';
            ariaSuffix = 'en proceso';
            titleText = 'Este día se está generando ahora mismo.';
            showSpinner = true;
        } else {
            // [Ronda 4] Un chunk `stale` va sin fecha, a propósito. Su
            // `execute_after` no responde "cuándo verás este día": es la reja de
            // elegibilidad con la que el worker reclama
            // (`WHERE status IN ('pending','stale') AND execute_after <= now`),
            // y en un chunk que espera re-pickeo esa hora ya pasó — de hecho el
            // TZ-sync la reescribe a `NOW()`. Anunciar «se genera <día>» con una
            // fecha vencida sería cambiar una afirmación falsa por otra. «En
            // cola» es exacto y no estrena estado: la jerarquía sigue siendo
            // atrasado > pausado > en proceso > programado, y esto es una
            // variante de copy del último, no un quinto nivel.
            const _label = isStale
                ? 'en cola'
                : (scheduledLabel ? `se genera ${scheduledLabel}` : 'en cola');
            suffix = `· ${_label}`;
            // El aria-label decía solo "programado", una palabra que el texto
            // visible no usa en ningún sitio: quien oye la pestaña se enteraba
            // de MENOS que quien la ve. Ahora dicen lo mismo.
            ariaSuffix = _label;
            titleText = isStale
                ? 'Este día está en cola. El sistema lo retomará en su próxima pasada.'
                : 'Este día todavía no existe. Se generará en su turno.';
        }

        return (
            <div
                key={`ghost-${i}`}
                role="presentation"
                title={titleText}
                style={{ ...BASE_STYLE, ...extraStyle }}
            >
                {showSpinner && (
                    <Loader2 size={12} strokeWidth={2.5} aria-hidden="true"
                             style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                )}
                <span>{name}</span>
                {/* El chip es el ÚNICO canal por el que un lector de pantalla
                    se entera del estado de este día: la pestaña que lo envuelve
                    es `presentation`. Por eso conserva el `role="status"` +
                    `aria-label` que tenía el bloque viejo, con el nombre del día
                    dentro (el chip solo dice "⏸ pausado" y fuera de contexto no
                    se sabe de cuál). `ariaSuffix` refleja el MISMO contenido que
                    el texto visible, incluida la fecha de `atrasado`. */}
                <span role="status" aria-label={`${name}: ${ariaSuffix}`} style={CHIP_STYLE}>
                    {suffix}
                </span>
            </div>
        );
    };

    return (
        <>
            {Array.from({ length: ghostCount }).map((_, i) => renderGhost(i))}

            {remaining > 0 && (
                <div ref={popoverWrapRef} style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={() => setPopoverOpen((v) => !v)}
                        aria-expanded={popoverOpen}
                        aria-controls={popoverId}
                        title="Los días que faltan de tu plan"
                        style={{
                            ...BASE_STYLE,
                            opacity: 0.75,
                            cursor: 'pointer',
                            borderStyle: 'dotted',
                        }}
                    >
                        📅 +{remaining} días
                    </button>
                    {popoverOpen && (
                        <div
                            id={popoverId}
                            role="tooltip"
                            style={{
                                position: 'absolute',
                                top: 'calc(100% + 6px)',
                                left: 0,
                                zIndex: 20,
                                width: 'min(260px, 70vw)',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-muted)',
                                fontSize: '0.78rem',
                                lineHeight: 1.45,
                                whiteSpace: 'normal',
                                boxShadow: '0 8px 20px -6px rgba(0,0,0,0.25)',
                            }}
                        >
                            Tu plan se genera por etapas cada 3-4 días.
                            {scheduledLabel ? ` Próximo lote: ${scheduledLabel}.` : ''}
                            {/* Copy del estado atrasado: dice lo que de verdad
                                pasa (`triggerShift` corre en cada montaje) y
                                nada más — ni un reintento que no ocurre, ni un
                                canal de soporte inventado. */}
                            {overdue ? ' Hay días que no se generaron a tiempo; el sistema los reintenta automáticamente cada vez que abres la app.' : ''}
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

UpcomingDayTabs.propTypes = {
    planData: PropTypes.object,
    chunkStatusInfo: PropTypes.object,
    isGuest: PropTypes.bool,
};

export default UpcomingDayTabs;
