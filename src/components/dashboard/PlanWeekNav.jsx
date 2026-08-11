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
import { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
    buildTimeline,
    projectRemaining,
    groupIntoWeeks,
    resolveDayState,
    WEEKDAY_LABELS,
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

    // [P1-WEEKNAV-MOBILE-SIZE · 2026-08-11] En el teléfono la fila DESLIZA (ver
    // index.css), y una fila que desliza tiene un problema que la rejilla no tenía:
    // la pastilla activa puede quedar fuera de la parte visible. Si hoy cae en la
    // semana 3, el usuario abriría el menú viendo las semanas 1 y 2 y ninguna
    // marcada — leería que no hay nada seleccionado.
    //
    // Se ajusta `scrollLeft` a mano en vez de usar `scrollIntoView`: ese método
    // puede mover TAMBIÉN el scroll vertical de la página para acercar el elemento,
    // y aquí solo queremos correr la fila. Y solo se toca si la pastilla está
    // realmente fuera: si ya se ve, moverla sería un salto gratis en cada render.
    const filaRef = useRef(null);
    const activaRef = useRef(null);
    useEffect(() => {
        const fila = filaRef.current;
        const activa = activaRef.current;
        if (!fila || !activa) return;
        if (fila.scrollWidth <= fila.clientWidth) return; // no desliza: nada que hacer
        const izq = activa.offsetLeft - fila.offsetLeft;
        const der = izq + activa.offsetWidth;
        const margen = 8;
        if (izq < fila.scrollLeft) {
            fila.scrollLeft = Math.max(0, izq - margen);
        } else if (der > fila.scrollLeft + fila.clientWidth) {
            fila.scrollLeft = der - fila.clientWidth + margen;
        }
    }, [semanaAbierta]);

    if (!modelo || modelo.weeks.length === 0) return null;

    const week = modelo.weeks[Math.min(semanaAbierta, modelo.weeks.length - 1)];
    const ctx = { chunkStatusInfo, firstLiveIso: modelo.firstLiveIso, today };

    // [P1-WEEKNAV-MOBILE-SIZE · 2026-08-11] Aquí vivía `etiquetaLote`, la línea gris
    // «se genera jueves» que iba entre las semanas y los días. El dueño la vio
    // innecesaria y al mirarla de cerca lo es: el día en que se genera el lote ES el
    // primer día marcado «en cola» en la propia fila, así que la frase repetía en
    // palabras algo que la fila ya dice en su sitio. Nació para consolidar un texto
    // que antes se repetía en los cuatro días (eso sí era ruido), pero consolidar un
    // dato redundante lo deja redundante, solo que una vez.
    //
    // Lo que se pierde y dónde queda: la palabra exacta («jueves») ya no se escribe,
    // pero cada celda sigue llevando la frase completa en su `aria-label`, así que
    // para un lector de pantalla no cambia nada.

    return (
        <div className="plan-week-nav">
            <div ref={filaRef} role="tablist" aria-label="Semanas del plan" className="plan-week-pills">
                {modelo.weeks.map((w, i) => (
                    <button
                        key={w.start.toISOString()}
                        ref={i === semanaAbierta ? activaRef : undefined}
                        type="button"
                        role="tab"
                        aria-selected={i === semanaAbierta}
                        onClick={() => setSemanaAbierta(i)}
                        aria-label={`Semana ${w.ordinal}, ${w.start.toLocaleDateString('es-DO', RANGO)} a ${w.end.toLocaleDateString('es-DO', RANGO)}, ${w.readyCount} de ${w.cells.filter(Boolean).length} días listos`}
                        className={`plan-week-pill${i === semanaAbierta ? ' is-active' : ''}${w.hasToday ? ' has-today' : ''}`}
                    >
                        <span className="plan-week-pill__title">Semana {w.ordinal}</span>
                        <span className="plan-week-pill__range">
                            {w.start.toLocaleDateString('es-DO', RANGO)} – {w.end.toLocaleDateString('es-DO', RANGO)}
                        </span>
                        {/* El conteo era una TERCERA línea de texto en cada
                            pastilla: cinco semanas × tres líneas llenaban el
                            bloque de ruido y obligaban a envolver, dejando la
                            última huérfana en una segunda fila. Como barra
                            ocupa 3px, se lee de un vistazo y encaja con el
                            lenguaje de instrumento de la marca. La cifra exacta
                            sigue estando, en el `aria-label` del tab. */}
                        <span className="plan-week-pill__bar" aria-hidden="true">
                            <i style={{ width: `${Math.round((w.readyCount / Math.max(1, w.cells.filter(Boolean).length)) * 100)}%` }} />
                        </span>
                    </button>
                ))}
            </div>

            {/* [P1-WEEKNAV-SQUARE-DAYS · 2026-08-11] La rejilla se declara en CSS, no
                aquí. Estaba en un `style` inline (`display:grid`, 7 columnas, gap 6px) y
                un inline NO RECIBE OVERRIDE RESPONSIVE: en el teléfono hace falta cerrar
                la separación para que a las celdas les quede ancho suficiente y puedan
                ser cuadradas, y desde un inline eso solo se conseguiría con `!important`
                — o no se conseguiría. Es la misma razón que ya está escrita unas líneas
                más arriba en el <style> del Dashboard para `.plan-week-nav`. */}
            <div
                data-testid="week-day-grid"
                className="plan-week-grid"
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
                                <span className="plan-week-cell__dow">{WEEKDAY_LABELS[i]}</span>
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
                            aria-label={`${WEEKDAY_LABELS[i]} ${cell.date.getDate()}: ${st.label}`}
                            onClick={() => { if (st.navegable) onSelect(cell); }}
                            className={`plan-week-cell${activo ? ' is-active' : ''}`}
                        >
                            <span className="plan-week-cell__dow">{WEEKDAY_LABELS[i]}</span>
                            <span className="plan-week-cell__num">{cell.date.getDate()}</span>
                            {/* `short`, NUNCA `label`: la frase completa
                                ("se genera viernes") va una sola vez en la
                                etiqueta de la semana. Ponerla aquí la repetiría
                                en cada día, que es la queja que originó este
                                rediseño. El texto completo sigue disponible en
                                el `aria-label`. */}
                            {/* El estado solo se ESCRIBE cuando aporta algo. Un
                                día ya generado no necesita que le pongan
                                "listo" debajo: se ve. Repetirlo siete veces era
                                lo que volvía la fila un formulario. Los estados
                                excepcionales (en cola, pausado, atrasado, en
                                proceso) sí se dicen, y el `aria-label` de la
                                celda lleva SIEMPRE la frase completa. */}
                            {st.key !== 'listo' && st.key !== 'hoy' && st.key !== 'pasado' && (
                                <span className="plan-week-cell__state">{st.short}</span>
                            )}
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
