import { Zap } from 'lucide-react';
import styles from './CreditsMeter.module.css';

/* [P2-CREDITS-METER · 2026-06-15] Medidor de créditos del header del dashboard.
   Gauge circular cuyo anillo se llena con la fracción de créditos restantes y
   cambia de color por estado. Preserva exactamente la data del badge original
   (`remainingCredits` / `userPlanLimit` / `isLimitReached`) y la semántica
   ilimitado ('∞' / 'Ilimitado').

   [P2-CREDITS-METER-STATIC · 2026-06-15] El anillo se renderiza ESTÁTICO en su
   valor final — sin animación de "llenado" ni count-up. Antes usaba
   initial/animate de framer-motion: esa animación de carga se re-reproducía en
   cada montaje del componente (refresh de la página o re-render del dashboard),
   lo que se percibía como "se recarga a cada rato". El glow ambiental y el
   sheen del hover (decorativos, NO una barra de carga) siguen en CSS.

   Semántica: remainingCredits = max(0, userPlanLimit - planCount) (restantes),
   así que el anillo representa cuánta energía QUEDA (lleno = recién renovado,
   vacío = agotado). Ver AssessmentContext.jsx::remainingCredits. */

const RING = { size: 46, stroke: 3.5, r: 20 };
const CIRC = 2 * Math.PI * RING.r;

// Paletas por estado: stops del anillo, color del bloom y del rayo central.
const GRADIENT = {
    healthy: ['#818CF8', '#22D3EE', '#34D399'],
    low: ['#FBBF24', '#FB923C', '#FB923C'],
    depleted: ['#FB7185', '#F43F5E', '#F43F5E'],
    unlimited: ['#818CF8', '#A78BFA', '#22D3EE'],
    // [P1-GUEST-METER · 2026-06-15] Invitado: paleta indigo calmada (NO el rojo
    // de "agotado"). Un 0/1 para un invitado es "muestra usada", no un error.
    guest: ['#818CF8', '#A78BFA', '#22D3EE'],
};
const GLOW = {
    healthy: 'rgba(34, 211, 238, 0.5)',
    low: 'rgba(251, 146, 60, 0.5)',
    // [P3-CREDITS-BEAM · 2026-06-15] Rojo "agotado" atenuado: el bloom difuso
    // saturaba en móvil. El protagonista pasa a ser el haz nítido que orbita.
    depleted: 'rgba(251, 113, 133, 0.28)',
    unlimited: 'rgba(167, 139, 250, 0.5)',
    guest: 'rgba(129, 140, 248, 0.46)',
};
const ICON = {
    healthy: '#22D3EE',
    low: '#FB923C',
    depleted: '#FB7185',
    unlimited: '#A78BFA',
    guest: '#A5B4FC',
};

export default function CreditsMeter({ remainingCredits, userPlanLimit, isLimitReached, isGuest = false }) {
    const isUnlimited =
        remainingCredits === '∞' ||
        userPlanLimit === 'Ilimitado' ||
        typeof userPlanLimit !== 'number';
    const limit = typeof userPlanLimit === 'number' ? userPlanLimit : 0;
    const remaining = typeof remainingCredits === 'number' ? remainingCredits : 0;
    const fraction = isUnlimited
        ? 1
        : limit > 0
            ? Math.max(0, Math.min(1, remaining / limit))
            : 0;

    // [P1-GUEST-METER · 2026-06-15] Para invitados, estado 'guest' (indigo
    // calmado) en vez de rojo "agotado": el anillo sigue mostrando la fracción
    // (1/1 → 0/1) pero se lee como "prueba", no como error/penalización.
    let state = 'healthy';
    if (isGuest) state = 'guest';
    else if (isUnlimited) state = 'unlimited';
    else if (remaining <= 0 || isLimitReached) state = 'depleted';
    else if (fraction <= 0.34 || remaining <= 2) state = 'low';

    const [g0, g1, g2] = GRADIENT[state];
    const gradId = `creditsGauge_${state}`;
    const dashOffset = CIRC * (1 - fraction);

    const label = isGuest ? 'Prueba' : 'Créditos';
    const ariaLabel = isGuest
        ? (remaining > 0
            ? `Prueba gratis: ${remaining} de ${limit} generaciones`
            : 'Prueba gratis usada. Crea tu cuenta para más')
        : isUnlimited
            ? 'Créditos ilimitados'
            : `${remaining} de ${limit} créditos restantes`;

    return (
        <div
            className={`${styles.badge} ${styles[state]}`}
            style={{ '--meter-glow': GLOW[state], '--meter-icon': ICON[state] }}
            role="img"
            aria-label={ariaLabel}
            title={ariaLabel}
        >
            <div className={styles.gauge}>
                <svg
                    className={styles.ring}
                    width={RING.size}
                    height={RING.size}
                    viewBox={`0 0 ${RING.size} ${RING.size}`}
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={g0} />
                            <stop offset="50%" stopColor={g1} />
                            <stop offset="100%" stopColor={g2} />
                        </linearGradient>
                    </defs>
                    <circle
                        className={styles.track}
                        cx={RING.size / 2}
                        cy={RING.size / 2}
                        r={RING.r}
                        fill="none"
                        strokeWidth={RING.stroke}
                    />
                    {/* Anillo de progreso ESTÁTICO: strokeDashoffset fijo al valor
                        final, sin animación de llenado (ver nota de cabecera). */}
                    <circle
                        className={styles.progress}
                        cx={RING.size / 2}
                        cy={RING.size / 2}
                        r={RING.r}
                        fill="none"
                        stroke={`url(#${gradId})`}
                        strokeWidth={RING.stroke}
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={dashOffset}
                        transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}
                    />
                </svg>
                <div className={styles.core}>
                    <Zap size={17} strokeWidth={2.5} fill="currentColor" />
                </div>
            </div>

            <div className={styles.meta}>
                <span className={styles.label}>{label}</span>
                <div className={styles.value}>
                    {isUnlimited ? (
                        <span className={styles.num}>∞</span>
                    ) : (
                        <>
                            <span className={styles.num}>{remaining}</span>
                            <span className={styles.limit}>/ {limit}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
