import { Zap } from 'lucide-react';
import { useT } from '../../i18n';
import styles from './CreditsMeter.module.css';

/* [P2-CREDITS-METER · 2026-06-15] Medidor de créditos del header del dashboard.
   Gauge circular cuyo anillo se llena con la fracción de créditos restantes y
   cambia de color por estado. Preserva exactamente la data del badge original
   (`remainingCredits` / `userPlanLimit` / `isLimitReached`) y la semántica
   ilimitado ('∞' / 'Ilimitado') — que desde P1-PLAN-LOTE-718 es SOLO la cuenta
   `admin`: ningún plan de pago es ilimitado (Max = 500/mes).

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
    // [P1-GUEST-METER · 2026-06-15] Invitado CON crédito: paleta indigo calmada.
    guest: ['#818CF8', '#A78BFA', '#22D3EE'],
    // [P1-GUEST-METER-DEPLETED · 2026-06-21] Invitado SIN crédito (0/1): ámbar/naranja
    // → señal visual distinta "muestra usada, crea tu cuenta para seguir" (el owner
    // pidió un color diferente en 0). No es el rojo "error" del usuario pago.
    guestDepleted: ['#FBBF24', '#FB923C', '#FB923C'],
};
const GLOW = {
    healthy: 'rgba(34, 211, 238, 0.5)',
    low: 'rgba(251, 146, 60, 0.5)',
    // [P3-CREDITS-BEAM · 2026-06-15] Rojo "agotado" atenuado: el bloom difuso
    // saturaba en móvil. El protagonista pasa a ser el haz nítido que orbita.
    depleted: 'rgba(251, 113, 133, 0.28)',
    unlimited: 'rgba(167, 139, 250, 0.5)',
    guest: 'rgba(129, 140, 248, 0.46)',
    guestDepleted: 'rgba(251, 146, 60, 0.5)',
};
const ICON = {
    healthy: '#22D3EE',
    low: '#FB923C',
    depleted: '#FB7185',
    unlimited: '#A78BFA',
    guest: '#A5B4FC',
    guestDepleted: '#FB923C',
};

/* [P1-PLAN-LOTE-718 · 2026-09-28] Un número que llega como texto ('500') sigue siendo un número. */
const aNumero = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v);
    return null;
};

export default function CreditsMeter({ remainingCredits, userPlanLimit, isLimitReached, isGuest = false, regalo = 0 }) {
    const t = useT();
    // [P1-PLAN-LOTE-718 · 2026-09-28] «Ilimitado» es SOLO el centinela de la cuenta `admin` (AssessmentContext:
    // 'Ilimitado' / '∞'). Antes cualquier límite que no fuera `number` pintaba ∞ y «Créditos ilimitados»: así se veía
    // Max, que el backend corta en 500 (`auth._TIER_LIMITS`, P1-CREDITS-LADDER) — prometía lo que no daba. Un límite
    // numérico (o texto numérico) se pinta como número; uno ilegible cae a 0 (el anillo vacío dice «no sé cuánto
    // queda» sin prometer nada), nunca a ∞.
    const limiteNumerico = aNumero(userPlanLimit);
    const restantesNumerico = aNumero(remainingCredits);
    const isUnlimited =
        userPlanLimit === 'Ilimitado' ||
        userPlanLimit === '∞' ||
        (remainingCredits === '∞' && limiteNumerico === null);
    const limit = limiteNumerico ?? 0;
    const remaining = restantesNumerico ?? 0;
    const fraction = isUnlimited
        ? 1
        : limit > 0
            ? Math.max(0, Math.min(1, remaining / limit))
            : 0;

    // [P1-GUEST-METER · 2026-06-15] Para invitados, estado 'guest' (indigo
    // calmado) en vez de rojo "agotado": el anillo sigue mostrando la fracción
    // (1/1 → 0/1) pero se lee como "prueba", no como error/penalización.
    let state = 'healthy';
    // [P1-GUEST-METER-DEPLETED · 2026-06-21] Invitado sin crédito (0/1) → 'guestDepleted'
    // (ámbar) para distinguirlo del 'guest' con crédito (indigo). El owner pidió un
    // color diferente al llegar a 0.
    if (isGuest) state = (remaining <= 0 || isLimitReached) ? 'guestDepleted' : 'guest';
    else if (isUnlimited) state = 'unlimited';
    else if (remaining <= 0 || isLimitReached) state = 'depleted';
    else if (fraction <= 0.34 || remaining <= 2) state = 'low';

    const [g0, g1, g2] = GRADIENT[state];
    const gradId = `creditsGauge_${state}`;
    const dashOffset = CIRC * (1 - fraction);

    // [P3-CREDITS-LAST-ONE · 2026-09-02] Último crédito: el color NO cambia (ámbar = «aún
    // puedes»; el rojo queda para el 0 real, o pierde significado). La urgencia va en una
    // señal secundaria: etiqueta «Último crédito» + latido más vivo del bloom (CSS).
    const isLastCredit = state === 'low' && remaining === 1;
    const label = isGuest ? t('Prueba') : (isLastCredit ? t('Último crédito') : t('Créditos'));
    const ariaLabel = isGuest
        ? (remaining > 0
            ? t('Prueba gratis: {remaining} de {limit} generaciones', { remaining, limit })
            : t('Prueba gratis usada. Crea tu cuenta para más'))
        : isUnlimited
            ? t('Créditos ilimitados')
            : t('{remaining} de {limit} créditos restantes', { remaining, limit });

    // [P1-PLAN-LOTE-776] cuánto del tope es regalo: en el texto accesible y en una marca pequeña
    const conRegalo = !isGuest && !isUnlimited && regalo > 0;
    const etiquetaAccesible = conRegalo ? `${ariaLabel} ${t('(incluye {n} de regalo)', { n: regalo })}` : ariaLabel;

    return (
        <div
            className={`${styles.badge} ${styles[state]}${isLastCredit ? ` ${styles.lastCredit}` : ''}`}
            style={{ '--meter-glow': GLOW[state], '--meter-icon': ICON[state] }}
            role="img"
            aria-label={etiquetaAccesible}
            title={etiquetaAccesible}
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
                    {conRegalo && <span className={styles.regalo} aria-hidden="true">+{regalo}</span>}
                </div>
            </div>
        </div>
    );
}
