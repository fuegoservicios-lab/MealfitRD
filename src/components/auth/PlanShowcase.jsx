import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Dumbbell, RefreshCw, Wheat, Drumstick, Fish, Soup, Flame } from 'lucide-react';
// [P2-LINT-ZERO · 2026-07-09] Hook SSOT reactivo (P2-14) para reduce-motion.
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatNumber, t, useT } from '../../i18n';

/* [P3-LOGIN-SHOWCASE-DEMO · 2026-06-29] Demo de producto del login: loop narrativo de
   4 escenas que enseña qué hace Bioboros (objetivo → la IA genera → tu plan → ajustas).
   Una sola "pantalla" cuyo contenido evoluciona (header + dots estables, cuerpo que cambia
   vía AnimatePresence). Orquestado con framer-motion. Respeta prefers-reduced-motion.

   [P1-PLAN-LOTE-144 · 2026-09-20] Rediseño («mejora el diseño de esto radicalmente», el dueño):
   la tarjeta era un anillo + tres barras + tres cuadrados de color planos, con DOS rayas bajo el
   título (el borde de la cabecera y el del bloque del anillo, separados por un hueco). Ahora:
   tres anillos concéntricos —uno por macro— con las kcal en el centro, leyenda con gramos y %,
   cada plato como tarjeta con su icono y el reparto P/C/G en una mini-barra, borde con aurora,
   y dos «satélites» que salen de la tarjeta cuando el plan ya existe (y se recalculan con él). */

/* [P1-I18N-DASHBOARD · 2026-08-15] Las tablas de copy son FUNCIONES, no
   constantes: un `t()` en ámbito de módulo se evalúa al importar —antes de que
   el catálogo esté cargado— y se congela en español para siempre. Lo que NO se
   traduce va como constante, igual que antes: los nombres de platos (SSOT del
   motor clínico), los gradientes y los tiempos. */
function getGoals() {
    return [t('Ganar músculo'), t('Perder grasa'), t('Mantenimiento')];
}
function getPerfil() {
    return ['78 kg', t('5 días/sem'), t('Presupuesto medio')];
}
function getSteps() {
    return [
        t('Analizando tu perfil clínico'),
        t('Calculando macronutrientes'),
        t('Seleccionando platos verificados'),
        t('Validando coherencia receta ↔ lista'),
    ];
}
/* `r` es el radio de SU anillo (de fuera adentro); `grad` el id del degradado del trazo. */
function getMacros() {
    return [
        { label: t('Proteína'), grams: 184, pct: 78, color: 'var(--mf-protein)', r: 62, grad: 'mfRingP' },
        { label: t('Carbohidratos'), grams: 210, pct: 66, color: 'var(--mf-carbs)', r: 49, grad: 'mfRingC' },
        { label: t('Grasa'), grams: 58, pct: 46, color: 'var(--mf-fat)', r: 36, grad: 'mfRingG' },
    ];
}
const MLABEL = [['P', 'var(--mf-protein)'], ['C', 'var(--mf-carbs)'], ['G', 'var(--mf-fat)']];
const MCOLORS = ['var(--mf-protein)', 'var(--mf-carbs)', 'var(--mf-fat)'];
/* `tint` tiñe la casilla del icono; `split` es el reparto P/C/G del plato (% de sus kcal). */
function getMeals() {
    return [
        { type: t('Desayuno'), name: 'Avena & proteína', kcal: 520, Icon: Wheat, tint: '#FBBF24', split: [25, 50, 25] },
        { type: t('Almuerzo'), name: 'Pollo, arroz & palta', kcal: 760, Icon: Drumstick, tint: '#34D399', split: [31, 42, 27] },
        { type: t('Cena'), name: 'Salmón & vegetales', kcal: 620, Icon: Fish, tint: '#FB7185', split: [30, 25, 45] },
    ];
}
const CENA_SWAP = { name: 'Pollo al curry & quinoa', kcal: 580, Icon: Soup, tint: '#FBBF24', split: [32, 40, 28] };

/* `key` y `ms` son datos (identidad de escena y duración): se quedan como
   constante para que el temporizador del efecto no dependa del idioma. Solo la
   etiqueta visible pasa por el catálogo. */
const SCENES = [
    { key: 'objetivo', ms: 4200 },
    { key: 'generando', ms: 4400 },
    { key: 'plan', ms: 5000 },
    { key: 'ajuste', ms: 4400 },
];
function sceneLabel(key) {
    return {
        objetivo: t('Tu objetivo'),
        generando: t('Generando tu plan'),
        plan: t('Tu plan de hoy'),
        ajuste: t('Ajusta lo que quieras'),
    }[key] || '';
}

const KCAL_PLAN = 1940;
const KCAL_SWAP = 1900;

// [P2-I18N-META-LITERAL-PLANSHOWCASE · 2026-08-22] La meta de la demo, UNA vez.
//
// Estaba tecleada como TEXTO en dos sitios con separador de millares estadounidense: en
// francés la línea salía con media cifra formateada por locale y media no, en el mismo
// renglón. Era el ejemplo que el plan anterior usaba como «la prueba más visible» de que el
// formateo no seguía al idioma.
//
// Y peor: el número vivía DENTRO de la clave de traducción, así que cambiar la meta de la
// demo huerfanaba cuatro traducciones en silencio.
const META_DEMO_KCAL = 2100;

const fade = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -14 },
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
};

/* ── Pieza: un plato como tarjeta (icono teñido + nombre + kcal + reparto P/C/G) ── */
function MealRow({ meal, target = false, delay = 0, children }) {
    const { Icon } = meal;
    return (
        <motion.div className={`mf-meal mf-meal__real${target ? ' is-target' : ''}`}
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}>
            <div className="mf-meal__thumb" style={{ '--mf-tint': meal.tint }}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={meal.name} style={{ display: 'inline-flex' }}
                        initial={{ opacity: 0, scale: 0.6, rotate: -20 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.6, rotate: 20 }} transition={{ duration: 0.25 }}>
                        <Icon size={19} strokeWidth={2.1} />
                    </motion.span>
                </AnimatePresence>
            </div>
            <div className="mf-meal__body">
                <div className="mf-meal__type">{meal.type}</div>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div className="mf-meal__name" key={meal.name}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.25 }}>
                        {meal.name}
                    </motion.div>
                </AnimatePresence>
            </div>
            <div className="mf-meal__side">
                <span className="mf-meal__kcal">
                    {target ? <NumFlip>{meal.kcal}</NumFlip> : meal.kcal}<small> kcal</small>
                </span>
                <span className="mf-meal__split" aria-hidden="true">
                    {meal.split.map((w, i) => (
                        <motion.i key={i} style={{ background: MCOLORS[i] }}
                            initial={false} animate={{ width: `${w}%` }} transition={{ duration: 0.45, ease: 'easeOut' }} />
                    ))}
                </span>
            </div>
            {children}
        </motion.div>
    );
}

/* ── Escena 1: objetivo ───────────────────────────────────────────────────── */
function SceneObjetivo() {
    const t = useT();
    const [picked, setPicked] = useState(0);
    const [pressed, setPressed] = useState(false);
    useEffect(() => {
        const t1 = setTimeout(() => setPicked(0), 200);
        const t2 = setTimeout(() => setPressed(true), 2600);
        const t3 = setTimeout(() => setPressed(false), 3000);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, []);
    return (
        <motion.div className="mf-scene mf-scene--center" {...fade}>
            <div className="mf-q">{t('¿Cuál es tu objetivo?')}</div>
            <div className="mf-chips">
                {getGoals().map((g, i) => (
                    <div key={g} className={`mf-chip${i === picked ? ' is-on' : ''}`}>
                        {i === picked && <Check size={14} strokeWidth={3} />}{g}
                    </div>
                ))}
            </div>
            <div className="mf-perfil-label">{t('Tu perfil')}</div>
            <div className="mf-pills">
                {getPerfil().map((dato) => (
                    <span className="mf-pill" key={dato}>{dato}</span>
                ))}
            </div>
            {/* El cursor cuelga de SU objetivo (antes iba con coordenadas de la tarjeta: cualquier cambio
                de alto lo dejaba apuntando al aire). */}
            <div className="mf-demo-ctawrap">
                <motion.button type="button" className="mf-btn mf-btn--primary mf-demo-cta" tabIndex={-1} aria-hidden="true"
                    animate={{ scale: pressed ? 0.97 : 1 }} transition={{ duration: 0.16 }}>
                    <Dumbbell size={17} /> {t('Generar mi plan')}
                </motion.button>
                <Cursor pressed={pressed} style={{ left: '58%', bottom: -14 }} />
            </div>
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
    const pasos = getSteps();
    return (
        <motion.div className="mf-scene mf-checklist" {...fade}>
            {pasos.map((s, i) => {
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
            <div className="mf-genbar" aria-hidden="true">
                <motion.i initial={{ width: '4%' }} animate={{ width: `${Math.max(4, (done / pasos.length) * 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }} />
            </div>
        </motion.div>
    );
}

/* ── Escena 3: plan (tres anillos de macros con count-up + leyenda + comidas) ── */
function ScenePlan() {
    const t = useT();
    const [kcal, setKcal] = useState(0);
    useEffect(() => {
        let raf; const start = performance.now(); const dur = 1300; const to = KCAL_PLAN;
        const tick = (now) => {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setKcal(Math.round(to * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);
    const macros = getMacros();
    return (
        <motion.div className="mf-scene" {...fade}>
            <div className="mf-hero">
                <div className="mf-ring">
                    <svg width="148" height="148" viewBox="0 0 148 148" className="mf-ring__svg">
                        <defs>
                            <linearGradient id="mfRingP" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#C7D2FE" /><stop offset="1" stopColor="#6366F1" />
                            </linearGradient>
                            <linearGradient id="mfRingC" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#A7F3D0" /><stop offset="1" stopColor="#10B981" />
                            </linearGradient>
                            <linearGradient id="mfRingG" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#FDE68A" /><stop offset="1" stopColor="#F59E0B" />
                            </linearGradient>
                        </defs>
                        {macros.map((m, i) => {
                            const c = 2 * Math.PI * m.r;
                            return (
                                <g key={m.grad}>
                                    <circle cx="74" cy="74" r={m.r} fill="none" stroke={m.color} strokeOpacity="0.14" strokeWidth="10" />
                                    <motion.circle cx="74" cy="74" r={m.r} fill="none" stroke={`url(#${m.grad})`} strokeWidth="10"
                                        strokeLinecap="round" strokeDasharray={c}
                                        initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - m.pct / 100) }}
                                        transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.14 }} />
                                </g>
                            );
                        })}
                    </svg>
                    <div className="mf-ring__center">
                        <span className="mf-ring__value">{formatNumber(kcal)}</span>
                        <span className="mf-ring__goal">{t('de {meta}', { meta: formatNumber(META_DEMO_KCAL) })}</span>
                    </div>
                </div>
                <div className="mf-macros">
                    {macros.map((m, i) => (
                        <motion.div className="mf-macro" key={m.label}
                            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: 0.35 + i * 0.12 }}>
                            <i className="mf-macro__dot" style={{ background: m.color }} />
                            <span className="mf-macro__label">{m.label}</span>
                            <span className="mf-macro__grams">{m.grams}<small>g</small></span>
                            <span className="mf-macro__pct">{m.pct}%</span>
                        </motion.div>
                    ))}
                </div>
            </div>
            <div className="mf-meals">
                {getMeals().map((meal, i) => (
                    <MealRow meal={meal} key={meal.type} delay={0.55 + i * 0.12} />
                ))}
            </div>
        </motion.div>
    );
}

/* ── Escena 4: ajuste (swap de un plato + toast) ──────────────────────────── */
function NumFlip({ children }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(children)} style={{ display: 'inline-block' }}
                initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -9 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}>
                {children}
            </motion.span>
        </AnimatePresence>
    );
}

function SceneAjuste({ onSwap }) {
    const t = useT();
    const [swapped, setSwapped] = useState(false);
    const [press, setPress] = useState(false);
    useEffect(() => {
        const t1 = setTimeout(() => setPress(true), 1500);
        const t2 = setTimeout(() => { setPress(false); setSwapped(true); onSwap?.(true); }, 1850);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [onSwap]);
    const comidas = getMeals();
    const cena = swapped ? CENA_SWAP : comidas[2];
    const total = swapped ? KCAL_SWAP : KCAL_PLAN;
    const macros = swapped ? [178, 206, 56] : [184, 210, 58];
    const rows = [comidas[0], comidas[1], { ...comidas[2], ...cena }];

    return (
        <motion.div className="mf-scene" {...fade}>
            <div className="mf-q mf-q--sm">{t('Cambia cualquier plato y todo se recalcula al instante.')}</div>

            {/* Resumen que se recalcula en vivo (kcal + macros) */}
            <div className="mf-summary">
                <div className="mf-summary__row">
                    <span className="mf-summary__label">{t('Calorías de hoy')}</span>
                    <span className="mf-summary__val">
                        <NumFlip>{formatNumber(total)}</NumFlip><small> / {formatNumber(META_DEMO_KCAL)}</small>
                    </span>
                    <AnimatePresence>
                        {swapped && (
                            <motion.span className="mf-delta" initial={{ opacity: 0, scale: 0.8, x: -4 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ duration: 0.28, ease: 'backOut' }}>
                                −40
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
                <div className="mf-macrochips">
                    {MLABEL.map(([l, c], i) => (
                        <span className="mf-mc" key={l}>
                            <i style={{ background: c }} />{l} <b><NumFlip>{macros[i]}</NumFlip>g</b>
                        </span>
                    ))}
                </div>
            </div>

            {/* Comidas */}
            <div className="mf-meals mf-meals--adjust">
                {rows.map((meal, i) => (
                    <MealRow meal={meal} key={i} target={i === 2}>
                        {i === 2 && (
                            <>
                                <motion.span className="mf-swap" animate={{ scale: press ? 0.82 : 1, rotate: swapped ? 360 : 0 }}
                                    transition={{ duration: 0.45 }}><RefreshCw size={14} /></motion.span>
                                {!swapped && <Cursor pressed={press} style={{ right: 6, bottom: -16 }} />}
                            </>
                        )}
                    </MealRow>
                ))}
            </div>

            <AnimatePresence>
                {swapped && (
                    <motion.div className="mf-toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}>
                        <Check size={14} strokeWidth={3} /> {t('Recalculado al instante')}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ── Cursor reutilizable: se coloca DENTRO de su objetivo (que es `position: relative`) ── */
function Cursor({ pressed, style }) {
    return (
        <motion.div className="mf-cursor" aria-hidden="true"
            initial={{ opacity: 0, x: -34, y: -26 }}
            animate={{ opacity: 1, x: 0, y: pressed ? 4 : 0 }}
            transition={{ duration: pressed ? 0.16 : 0.9, ease: 'easeInOut' }}
            style={style}>
            {pressed && <span className="mf-ripple" key="r" />}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M5 3l14 7-6 2.2L9.8 19 5 3z" fill="#fff" stroke="#0A0F1C" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
        </motion.div>
    );
}

/* ── Satélites: salen de la tarjeta cuando el plan YA existe, y se recalculan con él ── */
function Satelites({ visible, swapped, reduced }) {
    const macros = swapped ? [178, 206, 56] : [184, 210, 58];
    const flota = (dy) => (reduced ? {} : { y: [0, dy, 0] });
    return (
        <AnimatePresence>
            {visible && (
                <motion.div className="mf-sat mf-sat--kcal" key="kcal"
                    initial={{ opacity: 0, scale: 0.7, x: -24, y: 18 }} animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: 0.9 }}>
                    <motion.div className="mf-sat__in" animate={flota(-7)} transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}>
                        <span className="mf-sat__ico"><Flame size={15} strokeWidth={2.4} /></span>
                        <span className="mf-sat__val"><NumFlip>{formatNumber(swapped ? KCAL_SWAP : KCAL_PLAN)}</NumFlip><small> kcal</small></span>
                    </motion.div>
                </motion.div>
            )}
            {visible && (
                <motion.div className="mf-sat mf-sat--macros" key="macros"
                    initial={{ opacity: 0, scale: 0.7, x: 24, y: -18 }} animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: 1.15 }}>
                    <motion.div className="mf-sat__in" animate={flota(6)} transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}>
                        {MLABEL.map(([l, c], i) => (
                            <span className="mf-mc" key={l}><i style={{ background: c }} />{l} <b><NumFlip>{macros[i]}</NumFlip></b></span>
                        ))}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/* ── Componente principal ─────────────────────────────────────────────────── */
export default function PlanShowcase() {
    const [idx, setIdx] = useState(0);
    const [swapped, setSwapped] = useState(false);
    // [P2-LINT-ZERO · 2026-07-09] Antes: useRef(prefersReduced()) leído durante
    // el render (react-hooks/refs) — además el valor quedaba congelado al mount.
    // El hook SSOT (P2-14) es reactivo: si el usuario activa reduce-motion en el
    // SO con la página abierta, la animación se detiene de verdad.
    // [P1-PLAN-LOTE-144] …y el JSX seguía leyendo la propiedad `.current` de aquel ref, que ya no existe:
    // `undefined` ⇒ la tarjeta flotaba y el segmento corría también con reduce-motion.
    const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');

    useEffect(() => {
        if (reduced) { setIdx(2); return undefined; } // estado "plan", estático
        let alive = true;
        let timer;
        const advance = (i) => {
            if (!alive) return;
            setIdx(i);
            if (i === 0) setSwapped(false);
            timer = setTimeout(() => advance((i + 1) % SCENES.length), SCENES[i].ms);
        };
        advance(0);
        return () => { alive = false; clearTimeout(timer); };
    }, [reduced]);

    const scene = SCENES[idx];

    return (
        <div className="mf-showcase__anim">
            <div className="mf-showcase__aura" aria-hidden="true" />
            <motion.div className="mf-showcase__float"
                animate={reduced ? {} : { y: [0, -10, 0] }}
                transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity }}>
                <Satelites visible={idx >= 2} swapped={swapped && idx === 3} reduced={reduced} />
                <div className="mf-democard">
                    {/* Header: progreso segmentado (tipo "stories") + etiqueta + contador */}
                    <div className="mf-democard__head">
                        <div className="mf-segs">
                            {SCENES.map((s, i) => (
                                <div className="mf-seg" key={s.key}>
                                    {i < idx && <div className="mf-seg__fill mf-seg__fill--done" />}
                                    {i === idx && (
                                        <motion.div className="mf-seg__fill" key={idx}
                                            initial={{ width: '0%' }} animate={{ width: '100%' }}
                                            transition={{ duration: reduced ? 0 : s.ms / 1000, ease: 'linear' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="mf-democard__titlerow">
                            <AnimatePresence mode="wait">
                                <motion.span className="mf-democard__label" key={scene.key}
                                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.25 }}>
                                    {sceneLabel(scene.key)}
                                </motion.span>
                            </AnimatePresence>
                            <span className="mf-democard__count">0{idx + 1}<i>/0{SCENES.length}</i></span>
                        </div>
                    </div>

                    {/* Cuerpo que cambia por escena (cross-fade) */}
                    <div className="mf-democard__body">
                        <AnimatePresence>
                            {idx === 0 && <SceneObjetivo key="objetivo" />}
                            {idx === 1 && <SceneGenerando key="generando" />}
                            {idx === 2 && <ScenePlan key="plan" />}
                            {idx === 3 && <SceneAjuste key="ajuste" onSwap={setSwapped} />}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
