// [P1-DASH-WEEK-NAV · 2026-08-04] Navegación de "Tu Menú" en dos niveles:
// pastillas de semana natural arriba, los 7 días de la elegida debajo.
//
// QUÉ SUSTITUYE: la fila deslizante capada a `MAX_WINDOW = 4`, que en un plan
// de 30 días mostraba 4 casillas sin forma de llegar al resto y se desbordaba
// cortando los días por ambos lados; y `UpcomingDayTabs`, cuya resolución de
// estados vive ahora en `utils/planWeeks.js` (pura, testeable sin render).
//
// NAVEGAR ≠ PODER EDITAR. Este componente solo emite `onSelect(entry)`; es el
// Dashboard quien decide qué se puede escribir, porque `entry.idx` de un día
// vivo ES la dirección de escritura del swap (ruta jsonb `{days,<i>,meals,<j>}`).
// El guard es `writableDayIndex`, en utils/planWeeks.js.
//
// Tooltip-anchor: P1-DASH-WEEK-NAV. Tests: src/__tests__/PlanWeekNav.test.jsx.
import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
    buildTimeline,
    projectRemaining,
    groupIntoWeeks,
    resolveDayState,
    WEEKDAY_INITIALS,
} from '../../utils/planWeeks';

const RANGO = { month: 'short', day: 'numeric' };

const PlanWeekNav = ({ planData, chunkStatusInfo, today, selected, onSelect }) => {
    const modelo = useMemo(() => {
        const { ok, entries } = buildTimeline(planData);
        if (!ok) return null;
        const total = Number(planData?.total_days_requested) || entries.length;
        const weeks = groupIntoWeeks(projectRemaining(entries, total), today);
        const firstLive = entries.find((e) => e.origen === 'vivo');
        return { weeks, firstLiveIso: firstLive ? firstLive.iso : null };
    }, [planData, today]);

    const semanaDeHoy = useMemo(() => {
        if (!modelo) return 0;
        const i = modelo.weeks.findIndex((w) => w.hasToday);
        return i >= 0 ? i : 0;
    }, [modelo]);

    const [semanaAbierta, setSemanaAbierta] = useState(semanaDeHoy);

    // Seguir a hoy: al cruzar medianoche o tras un shift que re-indexa el plan,
    // la vista salta a la semana que contiene el día de hoy. Es el equivalente
    // del auto-seguimiento que ya hacía `resolveActiveDayIndex`.
    useEffect(() => { setSemanaAbierta(semanaDeHoy); }, [semanaDeHoy]);

    if (!modelo || modelo.weeks.length === 0) return null;

    const week = modelo.weeks[Math.min(semanaAbierta, modelo.weeks.length - 1)];
    const ctx = { chunkStatusInfo, firstLiveIso: modelo.firstLiveIso, today };

    // La etiqueta de "cuándo llega este bloque" va UNA sola vez, aquí. En la
    // fila anterior se leía "se genera vie" repetido en cada uno de los cuatro
    // días, que es ruido, no información.
    const etiquetaLote = (() => {
        for (const cell of week.cells) {
            if (!cell || cell.origen !== 'futuro') continue;
            const st = resolveDayState(cell, ctx);
            if (st.key !== 'sin_plan' || st.label.startsWith('se genera') || st.label === 'en cola') {
                return st.label;
            }
        }
        return null;
    })();

    return (
        <div className="plan-week-nav">
            <div role="tablist" aria-label="Semanas del plan" className="plan-week-pills">
                {modelo.weeks.map((w, i) => (
                    <button
                        key={w.start.toISOString()}
                        type="button"
                        role="tab"
                        aria-selected={i === semanaAbierta}
                        onClick={() => setSemanaAbierta(i)}
                        className={`plan-week-pill${i === semanaAbierta ? ' is-active' : ''}${w.hasToday ? ' has-today' : ''}`}
                    >
                        <span className="plan-week-pill__title">Semana {w.ordinal}</span>
                        <span className="plan-week-pill__range">
                            {w.start.toLocaleDateString('es-DO', RANGO)} – {w.end.toLocaleDateString('es-DO', RANGO)}
                        </span>
                        <span className="plan-week-pill__progress">
                            {w.readyCount} de {w.cells.filter(Boolean).length} listos
                        </span>
                    </button>
                ))}
            </div>

            {etiquetaLote && <p className="plan-week-nav__lote">{etiquetaLote}</p>}

            <div
                data-testid="week-day-grid"
                className="plan-week-grid"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}
            >
                {week.cells.map((cell, i) => {
                    if (!cell) {
                        return (
                            <div
                                key={`hueco-${week.ordinal}-${i}`}
                                data-testid={`day-cell-hueco-${i}`}
                                data-empty="true"
                                className="plan-week-cell is-empty"
                            >
                                <span className="plan-week-cell__initial">{WEEKDAY_INITIALS[i]}</span>
                            </div>
                        );
                    }
                    const st = resolveDayState(cell, ctx);
                    const activo = !!selected
                        && selected.origen === cell.origen
                        && selected.idx === cell.idx;
                    return (
                        <button
                            key={cell.iso}
                            type="button"
                            data-testid={`day-cell-${cell.iso}`}
                            data-empty="false"
                            data-state={st.key}
                            disabled={!st.navegable}
                            aria-current={activo ? 'date' : undefined}
                            aria-label={`${WEEKDAY_INITIALS[i]} ${cell.date.getDate()}: ${st.label}`}
                            onClick={() => { if (st.navegable) onSelect(cell); }}
                            className={`plan-week-cell${activo ? ' is-active' : ''}`}
                        >
                            <span className="plan-week-cell__initial">{WEEKDAY_INITIALS[i]}</span>
                            <span className="plan-week-cell__num">{cell.date.getDate()}</span>
                            {/* `short`, NUNCA `label`: la frase completa
                                ("se genera viernes") va una sola vez en la
                                etiqueta de la semana. Ponerla aquí la repetiría
                                en cada día, que es la queja que originó este
                                rediseño. El texto completo sigue disponible en
                                el `aria-label`. */}
                            <span className="plan-week-cell__state">{st.short}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

PlanWeekNav.propTypes = {
    planData: PropTypes.object,
    chunkStatusInfo: PropTypes.object,
    today: PropTypes.instanceOf(Date).isRequired,
    selected: PropTypes.shape({ origen: PropTypes.string, idx: PropTypes.number }),
    onSelect: PropTypes.func.isRequired,
};

export default PlanWeekNav;
