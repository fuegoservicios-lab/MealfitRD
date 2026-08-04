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
// SUPERSEDED — no ocultamos el futuro, lo etiquetamos con la verdad.
//
// LO QUE NO CAMBIA (y no se puede debilitar): la jerarquía de honestidad de
// P0-DASH-CHIP-HONESTY. El chip viejo decía "en camino" leyendo solo
// `generation_status`, que puede decir 'generating_next' con TODOS los chunks
// pausados — spinner girando para días que nadie estaba generando. Aquí el
// estado se resuelve contra la COLA (`/chunk-status`), en este orden:
//
//   1. atrasado  → `overdue` (hoy debería existir un día que no existe y NADA
//                  corre). Único estado con CTA, porque es el único donde el
//                  usuario puede hacer algo.
//   2. pausado   → `pending_user_action_count > 0 && in_flight_count === 0`.
//                  Solo MARCA el día: el detalle y el CTA de la pausa ya los
//                  da el banner P0-DASH-CHIP-HONESTY-V2 arriba del menú. No
//                  duplicamos ese copy aquí.
//   3. en proceso→ chunk `processing` o `in_flight_count > 0`. Es la única
//                  etiqueta que afirma actividad, y solo la afirma cuando la
//                  cola lo confirma.
//   4. programado→ fecha de `execute_after`. El default honesto: "no corre
//                  nada, y no debería — le toca el <día>".
//
// DEGRADACIÓN POR AUSENCIA: `upcoming_chunks` viene AUSENTE (no null) cuando el
// knob `MEALFIT_UPCOMING_DAYS_UI` está apagado o el backend es más viejo que
// este bundle. En ese caso renderizamos `null`, que es el comportamiento de
// hoy. Nunca inferimos estados que no podemos verificar contra la cola.
import { useState } from 'react';
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
// retrocede un día y el fantasma diría "lunes" donde el plan dice "martes".
// Parseamos los componentes a mano para construir una fecha LOCAL.
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

const UpcomingDayTabs = ({ planData, chunkStatusInfo, isGuest, onRetry }) => {
    const [popoverOpen, setPopoverOpen] = useState(false);

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
    // existir. Dibujamos ese uno: es el que lleva el CTA.
    const rawCount = num(next?.days_count, overdue ? 1 : 0);
    const ghostCount = Math.max(0, Math.min(rawCount, MAX_GHOSTS));
    // Todo lo que queda DESPUÉS de los fantasmas visibles va al resumen — si
    // el chunk trae más días de los que dibujamos, el excedente cuenta ahí.
    const remaining = Math.max(0, total - offset - ghostCount);

    if (ghostCount <= 0 && remaining <= 0) return null;

    const puac = num(chunkStatusInfo?.pending_user_action_count, 0);
    const inFlight = num(chunkStatusInfo?.in_flight_count, 0);
    const isPausedFromQueue = puac > 0 && inFlight === 0;
    const isProcessing = next?.status === 'processing' || inFlight > 0;

    // Ancla de nombres: la ÚLTIMA fecha estampada de la ventana viva. Planes
    // pre-`date` (P1-CHAT-PAST-DAYS estampó `date` en los 3 sitios de
    // renumeración, pero los viejos siguen en localStorage) degradan a "Día N".
    let anchor = null;
    for (let i = days.length - 1; i >= 0 && !anchor; i -= 1) {
        anchor = parseIsoDateLocal(days[i]?.date);
    }

    const scheduledLabel = (() => {
        const d = parseIsoDateLocal(next?.execute_after)
            || (typeof next?.execute_after === 'string' ? new Date(next.execute_after) : null);
        if (!d || Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString('es-DO', { weekday: 'short' });
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

    const renderGhost = (i) => {
        const state = stateFor(i);
        const name = ghostName(i);

        if (state === 'atrasado') {
            const since = typeof chunkStatusInfo?.overdue_since === 'string'
                ? chunkStatusInfo.overdue_since : null;
            return (
                <button
                    key={`ghost-${i}`}
                    type="button"
                    onClick={() => onRetry?.(next?.chunk_id ?? null)}
                    aria-label={`${name}: atrasado${since ? ` desde ${since}` : ''}. Toca para reintentar.`}
                    title={`Este día ya debería estar listo${since ? ` (desde ${since})` : ''} y nada está corriendo. Toca para reintentar.`}
                    style={{
                        ...BASE_STYLE,
                        opacity: 1,
                        cursor: 'pointer',
                        background: '#FFFBEB',
                        color: '#B45309',
                        borderColor: '#F59E0B',
                    }}
                >
                    <span>{name}</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>· atrasado</span>
                    <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '6px',
                        background: '#FEF3C7',
                        color: '#92400E',
                    }}>
                        Reintentar
                    </span>
                </button>
            );
        }

        let suffix; let titleText; let showSpinner = false; let extraStyle = {};
        if (state === 'pausado') {
            // Solo marca el día. El detalle (reason_code → copy) y el CTA los
            // da el banner de arriba; duplicarlos aquí sería ruido.
            suffix = '⏸ pausado';
            titleText = 'Este día está pausado. Revisa el aviso de arriba para continuar.';
            extraStyle = { background: '#FFFBEB', color: '#B45309', borderColor: '#F59E0B', opacity: 0.85 };
        } else if (state === 'en proceso') {
            suffix = '· en proceso';
            titleText = 'Este día se está generando ahora mismo.';
            showSpinner = true;
        } else {
            suffix = scheduledLabel ? `· se genera ${scheduledLabel}` : '· se genera pronto';
            titleText = 'Este día todavía no existe. Se generará en su turno.';
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
                <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>{suffix}</span>
            </div>
        );
    };

    return (
        <>
            {Array.from({ length: ghostCount }).map((_, i) => renderGhost(i))}

            {remaining > 0 && (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={() => setPopoverOpen((v) => !v)}
                        aria-expanded={popoverOpen}
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
    onRetry: PropTypes.func,
};

export default UpcomingDayTabs;
