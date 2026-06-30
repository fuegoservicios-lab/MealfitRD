import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Dumbbell, RefreshCw } from 'lucide-react';

/* [P3-LOGIN-SHOWCASE-DEMO · 2026-06-29] Demo de producto del login: loop narrativo de
   4 escenas que enseña qué hace MealfitRD (objetivo → la IA genera → tu plan → ajustas).
   Una sola "pantalla" cuyo contenido evoluciona (header + dots estables, cuerpo que cambia
   vía AnimatePresence). Orquestado con framer-motion. Respeta prefers-reduced-motion. */

const GOALS = ['Ganar músculo', 'Perder grasa', 'Mantenimiento'];
const FACTS = [
    { k: 'Peso', v: '78 kg' },
    { k: 'Entreno', v: '5 días/sem' },
    { k: 'Presupuesto', v: 'Medio' },
];
const STEPS = [
    'Analizando tu perfil clínico',
    'Calculando macronutrientes',
    'Seleccionando platos verificados',
    'Validando coherencia receta ↔ lista',
];
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
const CENA_SWAP = { name: 'Pollo al curry & quinoa', kcal: 580, thumb: 'linear-gradient(140deg,#F2C879 0%,#C98A3A 100%)' };

const SCENES = [
    { key: 'objetivo', label: 'Tu objetivo', ms: 4200 },
    { key: 'generando', label: 'Generando tu plan', ms: 4400 },
    { key: 'plan', label: 'Tu plan de hoy', ms: 5000 },
    { key: 'ajuste', label: 'Ajusta lo que quieras', ms: 4400 },
];

const R = 40;
const C = 2 * Math.PI * R;
const TARGET_OFFSET = C * (1 - 0.74);

const prefersReduced = () =>
    typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fade = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -14 },
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
};

/* ── Escena 1: objetivo ───────────────────────────────────────────────────── */
function SceneObjetivo() {
    const [picked, setPicked] = useState(0);
    const [pressed, setPressed] = useState(false);
    useEffect(() => {
        const t1 = setTimeout(() => setPicked(0), 200);
        const t2 = setTimeout(() => setPressed(true), 2600);
        const t3 = setTimeout(() => setPressed(false), 3000);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, []);
    return (
        <motion.div className="mf-scene" {...fade}>
            <div className="mf-q">¿Cuál es tu objetivo?</div>
            <div className="mf-chips">
                {GOALS.map((g, i) => (
                    <div key={g} className={`mf-chip${i === picked ? ' is-on' : ''}`}>
                        {i === picked && <Check size={14} strokeWidth={3} />}{g}
                    </div>
                ))}
            </div>
            <div className="mf-facts">
                {FACTS.map((f) => (
                    <div className="mf-fact" key={f.k}>
                        <span className="mf-fact__k">{f.k}</span>
                        <span className="mf-fact__v">{f.v}</span>
                    </div>
                ))}
            </div>
            <motion.button type="button" className="mf-btn mf-btn--primary mf-demo-cta" tabIndex={-1} aria-hidden="true"
                animate={{ scale: pressed ? 0.97 : 1 }} transition={{ duration: 0.16 }}>
                <Dumbbell size={17} /> Generar mi plan
            </motion.button>
            <Cursor target={pressed ? 'press' : 'cta'} />
        </motion.div>
    );
}

/* ── Escena 2: generando (checklist tipo Claude) ──────────────────────────── */
function SceneGenerando() {
    const [done, setDone] = useState(0);
    useEffect(() => {
        const ts = [
            setTimeout(() => setDone(1), 700),
            setTimeout(() => setDone(2), 1600),
            setTimeout(() => setDone(3), 2700),
            setTimeout(() => setDone(4), 3700),
        ];
        return () => ts.forEach(clearTimeout);
    }, []);
    return (
        <motion.div className="mf-scene mf-checklist" {...fade}>
            {STEPS.map((s, i) => {
                const isDone = i < done;
                const isCurrent = i === done;
                return (
                    <div key={s} className={`mf-step${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}>
                        <span className="mf-step__icon">
                            {isDone ? <Check size={14} strokeWidth={3} />
                                : isCurrent ? <Loader2 size={15} className="mf-spin" />
                                    : <span className="mf-step__num">{i + 1}</span>}
                        </span>
                        <span className="mf-step__txt">{s}</span>
                        {i === 1 && isDone && <span className="mf-step__tag">184P · 210C · 58G</span>}
                    </div>
                );
            })}
        </motion.div>
    );
}

/* ── Escena 3: plan (anillo con count-up + macros + comidas) ───────────────── */
function ScenePlan() {
    const [kcal, setKcal] = useState(0);
    useEffect(() => {
        let raf; const start = performance.now(); const dur = 1300; const to = 1940;
        const tick = (now) => {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setKcal(Math.round(to * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);
    return (
        <motion.div className="mf-scene" {...fade}>
            <div className="mf-hero">
                <div className="mf-ring">
                    <svg width="96" height="96" viewBox="0 0 96 96" className="mf-ring__svg">
                        <defs>
                            <linearGradient id="mfRingGrad" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#818CF8" /><stop offset="1" stopColor="#34D399" />
                            </linearGradient>
                        </defs>
                        <circle cx="48" cy="48" r="40" fill="none" stroke="var(--mf-border)" strokeWidth="9" />
                        <motion.circle cx="48" cy="48" r="40" fill="none" stroke="url(#mfRingGrad)" strokeWidth="9"
                            strokeLinecap="round" strokeDasharray={C}
                            initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: TARGET_OFFSET }}
                            transition={{ duration: 1.3, ease: 'easeOut' }} />
                    </svg>
                    <div className="mf-ring__center">
                        <span className="mf-ring__value">{kcal.toLocaleString('es-DO')}</span>
                        <span className="mf-ring__goal">de 2,100</span>
                    </div>
                </div>
                <div className="mf-macros">
                    {MACROS.map((m, i) => (
                        <div key={m.label}>
                            <div className="mf-macro__top">
                                <span className="mf-macro__label">{m.label}</span>
                                <span className="mf-macro__grams">{m.grams}g</span>
                            </div>
                            <div className="mf-macro__track">
                                <motion.div className="mf-macro__fill" style={{ background: m.color }}
                                    initial={{ width: '0%' }} animate={{ width: `${m.pct}%` }}
                                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 + i * 0.12 }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="mf-meals">
                {MEALS.map((meal, i) => (
                    <motion.div className="mf-meal mf-meal__real" key={meal.type}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.5 + i * 0.13 }}>
                        <div className="mf-meal__thumb" style={{ background: `${THUMB_HL}, ${meal.thumb}` }} />
                        <div className="mf-meal__body">
                            <div className="mf-meal__type">{meal.type}</div>
                            <div className="mf-meal__name">{meal.name}</div>
                        </div>
                        <span className="mf-meal__kcal">{meal.kcal}<small> kcal</small></span>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

/* ── Escena 4: ajuste (swap de un plato + toast) ──────────────────────────── */
function SceneAjuste() {
    const [swapped, setSwapped] = useState(false);
    const [press, setPress] = useState(false);
    useEffect(() => {
        const t1 = setTimeout(() => setPress(true), 1400);
        const t2 = setTimeout(() => { setPress(false); setSwapped(true); }, 1750);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);
    const cena = swapped ? CENA_SWAP : MEALS[2];
    return (
        <motion.div className="mf-scene" {...fade}>
            <div className="mf-q mf-q--sm">Cambia cualquier plato y tus macros se recalculan.</div>
            <div className="mf-meals mf-meals--adjust">
                {[MEALS[0], MEALS[1], { ...MEALS[2], ...cena }].map((meal, i) => (
                    <div className={`mf-meal mf-meal__real${i === 2 ? ' is-target' : ''}`} key={i}>
                        <div className="mf-meal__thumb" style={{ background: `${THUMB_HL}, ${meal.thumb}` }} />
                        <div className="mf-meal__body">
                            <div className="mf-meal__type">{meal.type}</div>
                            <AnimatePresence mode="wait">
                                <motion.div className="mf-meal__name" key={meal.name}
                                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.25 }}>
                                    {meal.name}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                        {i === 2 ? (
                            <motion.span className="mf-swap" animate={{ scale: press ? 0.85 : 1, rotate: swapped ? 360 : 0 }}
                                transition={{ duration: 0.4 }}><RefreshCw size={15} /></motion.span>
                        ) : (
                            <span className="mf-meal__kcal">{meal.kcal}<small> kcal</small></span>
                        )}
                    </div>
                ))}
            </div>
            <AnimatePresence>
                {swapped && (
                    <motion.div className="mf-toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}>
                        <Check size={14} strokeWidth={3} /> Plato actualizado · macros recalculadas
                    </motion.div>
                )}
            </AnimatePresence>
            {!swapped && <Cursor target={press ? 'press-swap' : 'swap'} />}
        </motion.div>
    );
}

/* ── Cursor reutilizable ──────────────────────────────────────────────────── */
function Cursor({ target }) {
    const pos = {
        cta: { left: '50%', bottom: 24, x: '-50%', y: 0 },
        press: { left: '50%', bottom: 24, x: '-50%', y: 5 },
        swap: { left: 'auto', right: 12, top: 170, x: 0, y: 0 },
        'press-swap': { left: 'auto', right: 12, top: 170, x: 0, y: 4 },
    }[target] || {};
    return (
        <motion.div className="mf-cursor" aria-hidden="true"
            initial={{ opacity: 0, x: -30, y: -20 }}
            animate={{ opacity: 1, x: pos.x ?? 0, y: pos.y ?? 0 }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
            style={{ left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom }}>
            {(target === 'press' || target === 'press-swap') && <span className="mf-ripple" key="r" />}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M5 3l14 7-6 2.2L9.8 19 5 3z" fill="#fff" stroke="#0A0F1C" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
        </motion.div>
    );
}

/* ── Componente principal ─────────────────────────────────────────────────── */
export default function PlanShowcase() {
    const [idx, setIdx] = useState(0);
    const reduced = useRef(prefersReduced());

    useEffect(() => {
        if (reduced.current) { setIdx(2); return undefined; } // estado "plan", estático
        let alive = true;
        let timer;
        const advance = (i) => {
            if (!alive) return;
            setIdx(i);
            timer = setTimeout(() => advance((i + 1) % SCENES.length), SCENES[i].ms);
        };
        advance(0);
        return () => { alive = false; clearTimeout(timer); };
    }, []);

    const scene = SCENES[idx];
    const Body = [SceneObjetivo, SceneGenerando, ScenePlan, SceneAjuste][idx];

    return (
        <div className="mf-showcase__anim">
            <motion.div className="mf-showcase__float"
                animate={reduced.current ? {} : { y: [0, -10, 0] }}
                transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity }}>
                <div className="mf-democard">
                    {/* Header estable */}
                    <div className="mf-democard__head">
                        <div className="mf-democard__title">
                            <span className="mf-democard__brand">Mealfit<b>RD</b></span>
                            <AnimatePresence mode="wait">
                                <motion.span className="mf-democard__label" key={scene.key}
                                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.25 }}>
                                    {scene.label}
                                </motion.span>
                            </AnimatePresence>
                        </div>
                        <div className="mf-dots">
                            {SCENES.map((s, i) => <span key={s.key} className={`mf-dot${i === idx ? ' is-on' : ''}`} />)}
                        </div>
                    </div>

                    {/* Cuerpo que cambia por escena */}
                    <div className="mf-democard__body">
                        <AnimatePresence mode="wait">
                            <Body key={scene.key} />
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
