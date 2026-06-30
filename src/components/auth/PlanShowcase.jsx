import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/* [P3-LOGIN-SHOWCASE-ANIM · 2026-06-29] Preview animado del login: loop narrativo
   "generación en vivo" del plan (cursor → click → pensando → resuelve → loop),
   orquestado con framer-motion. Cuenta la propuesta de valor (plan personalizado en
   segundos). Respeta prefers-reduced-motion (estado resuelto, sin loop). */

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MACROS = [
    { label: 'Proteína', grams: 184, pct: 78, color: 'var(--mf-protein)' },
    { label: 'Carbohidratos', grams: 210, pct: 66, color: 'var(--mf-carbs)' },
    { label: 'Grasa', grams: 58, pct: 46, color: 'var(--mf-fat)' },
];
const THUMB_HL = 'radial-gradient(120% 120% at 26% 20%, rgba(255,255,255,0.26), transparent 55%)';
const MEALS = [
    { type: 'Desayuno', name: 'Avena & proteína', kcal: 520, thumb: 'linear-gradient(140deg,#E8C07E 0%,#C0832F 100%)' },
    { type: 'Almuerzo', name: 'Pollo, arroz & palta', kcal: 760, thumb: 'linear-gradient(140deg,#7FC98A 0%,#3E8E5A 100%)' },
    { type: 'Cena', name: 'Salmón & vegetales', kcal: 620, thumb: 'linear-gradient(140deg,#F0937F 0%,#C85C6A 100%)' },
];
const STATUS = ['Analizando tu perfil', 'Calculando macronutrientes', 'Seleccionando platos verificados'];

const R = 40;
const C = 2 * Math.PI * R;            // 251.3
const TARGET_OFFSET = C * (1 - 0.74); // ~1,940 / 2,100

const prefersReduced = () =>
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function PlanShowcase() {
    // arrive → click → think → build → hold → (loop)
    const [phase, setPhase] = useState('build');
    const [status, setStatus] = useState(0);
    const reduced = useRef(prefersReduced());

    // Timeline maestra del loop.
    useEffect(() => {
        if (reduced.current) { setPhase('hold'); return undefined; }
        let alive = true;
        const timers = [];
        const cycle = () => {
            if (!alive) return;
            setPhase('arrive');
            timers.push(setTimeout(() => setPhase('click'), 1300));
            timers.push(setTimeout(() => setPhase('think'), 1850));
            timers.push(setTimeout(() => setPhase('build'), 4350));
            timers.push(setTimeout(() => setPhase('hold'), 6700));
            timers.push(setTimeout(cycle, 9300));
        };
        timers.push(setTimeout(cycle, 2400)); // muestra el plan resuelto, luego arranca
        return () => { alive = false; timers.forEach(clearTimeout); };
    }, []);

    // Rotación del texto de estado durante "think".
    useEffect(() => {
        if (phase !== 'think') return undefined;
        setStatus(0);
        const t1 = setTimeout(() => setStatus(1), 850);
        const t2 = setTimeout(() => setStatus(2), 1700);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [phase]);

    const thinking = phase === 'think';
    const built = !thinking; // resultado visible en arrive/click/build/hold

    // Cursor: se acerca al botón (arrive), toca (click), luego se aleja.
    const cursorAnim =
        phase === 'arrive' ? { x: 0, y: 0, opacity: 1 } :
        phase === 'click' ? { x: 0, y: [0, 6, 0], opacity: 1 } :
        { x: 78, y: 44, opacity: 0.55 };

    return (
        <div className="mf-showcase__anim">
            <motion.div
                className="mf-showcase__float"
                animate={reduced.current ? {} : { y: [0, -12, 0] }}
                transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity }}
            >
                <div className="mf-plan">
                    {/* Header */}
                    <div className="mf-plan__header">
                        <div className="mf-plan__head-row">
                            <div>
                                <div className="mf-plan__title">Plan de hoy</div>
                                <div className="mf-plan__date">Lunes 2 de junio</div>
                            </div>
                            <span className="mf-badge">Ganar músculo</span>
                        </div>
                        <div className="mf-days">
                            {DAYS.map((d, i) => (
                                <span key={d + i} className={`mf-day${i === 0 ? ' is-active' : ''}`}>{d}</span>
                            ))}
                        </div>
                    </div>

                    {/* Estado "generando" */}
                    <motion.div
                        className="mf-genline"
                        initial={false}
                        animate={{ opacity: thinking ? 1 : 0, height: thinking ? 'auto' : 0, marginTop: thinking ? 12 : 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <span className="mf-genline__dot" />
                        <span className="mf-genline__text">{STATUS[status]}…</span>
                    </motion.div>

                    {/* Anillo + macros */}
                    <div className="mf-hero">
                        <div className="mf-ring">
                            <svg width="96" height="96" viewBox="0 0 96 96" className="mf-ring__svg">
                                <defs>
                                    <linearGradient id="mfRingGrad" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0" stopColor="#818CF8" />
                                        <stop offset="1" stopColor="#34D399" />
                                    </linearGradient>
                                </defs>
                                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--mf-border)" strokeWidth="9" />
                                <motion.circle
                                    cx="48" cy="48" r="40" fill="none"
                                    stroke="url(#mfRingGrad)" strokeWidth="9" strokeLinecap="round"
                                    strokeDasharray={C}
                                    initial={false}
                                    animate={{ strokeDashoffset: thinking ? C : TARGET_OFFSET }}
                                    transition={{ duration: thinking ? 0.35 : 1.15, ease: 'easeOut' }}
                                />
                                {thinking && (
                                    <circle
                                        className="mf-ring__spin"
                                        cx="48" cy="48" r="40" fill="none"
                                        stroke="var(--mf-primary)" strokeWidth="9" strokeLinecap="round"
                                        strokeDasharray={`${C * 0.16} ${C}`}
                                    />
                                )}
                            </svg>
                            <div className="mf-ring__center">
                                {thinking ? (
                                    <span className="mf-ring__dots"><i /><i /><i /></span>
                                ) : (
                                    <>
                                        <span className="mf-ring__value">1,940</span>
                                        <span className="mf-ring__goal">de 2,100</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mf-macros">
                            {MACROS.map((m, i) => (
                                <div key={m.label}>
                                    <div className="mf-macro__top">
                                        <span className="mf-macro__label">{m.label}</span>
                                        <motion.span
                                            className="mf-macro__grams"
                                            animate={{ opacity: built ? 1 : 0.25 }}
                                            transition={{ duration: 0.3, delay: built ? 0.5 + i * 0.12 : 0 }}
                                        >
                                            {m.grams}g
                                        </motion.span>
                                    </div>
                                    <div className="mf-macro__track">
                                        <motion.div
                                            className="mf-macro__fill"
                                            style={{ background: m.color }}
                                            initial={false}
                                            animate={{ width: built ? `${m.pct}%` : '0%' }}
                                            transition={{ duration: built ? 0.8 : 0.3, ease: 'easeOut', delay: built ? 0.35 + i * 0.12 : 0 }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Comidas (skeleton mientras piensa) */}
                    <div className="mf-meals">
                        {MEALS.map((meal, i) => (
                            <div className="mf-meal" key={meal.type}>
                                {/* Skeleton */}
                                <motion.div
                                    className="mf-meal__skel"
                                    animate={{ opacity: thinking ? 1 : 0 }}
                                    transition={{ duration: 0.25 }}
                                />
                                {/* Real */}
                                <motion.div
                                    className="mf-meal__real"
                                    initial={false}
                                    animate={{ opacity: built ? 1 : 0, x: built ? 0 : -10 }}
                                    transition={{ duration: 0.45, ease: 'easeOut', delay: built ? 0.55 + i * 0.13 : 0 }}
                                >
                                    <div className="mf-meal__thumb" style={{ background: `${THUMB_HL}, ${meal.thumb}` }} />
                                    <div className="mf-meal__body">
                                        <div className="mf-meal__type">{meal.type}</div>
                                        <div className="mf-meal__name">{meal.name}</div>
                                    </div>
                                    <span className="mf-meal__kcal">{meal.kcal}<small> kcal</small></span>
                                </motion.div>
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <div className="mf-cta">
                        <motion.button
                            type="button" className="mf-btn mf-btn--primary" tabIndex={-1} aria-hidden="true"
                            animate={{ scale: phase === 'click' ? 0.97 : 1 }}
                            transition={{ duration: 0.18 }}
                        >
                            <span className={`mf-cta__icon${thinking ? ' is-spin' : ''}`} aria-hidden="true">↻</span>
                            {thinking ? ' Generando tu plan…' : ' Generar nuevo plan'}
                        </motion.button>
                    </div>
                </div>

                {/* Cursor que toca el CTA */}
                {!reduced.current && (
                    <motion.div
                        className="mf-cursor"
                        initial={{ x: 78, y: 44, opacity: 0.55 }}
                        animate={cursorAnim}
                        transition={{ duration: phase === 'click' ? 0.35 : 1.0, ease: 'easeInOut' }}
                    >
                        {phase === 'click' && <span className="mf-ripple" key="rip" />}
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5 3l14 7-6 2.2L9.8 19 5 3z" fill="#fff" stroke="#0A0F1C" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
