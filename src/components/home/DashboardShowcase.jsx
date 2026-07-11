import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    CalendarDays, ChefHat, ShoppingCart, Bot, Refrigerator,
    Clock, CheckCircle2, FileDown, Flame, Search, Plus,
    Sparkles, Send, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import SeeMoreLink from './SeeMoreLink';
import { makeSectionMotion } from './sectionMotion';
import styles from './DashboardShowcase.module.css';

/* [P3-DASHBOARD-3D · 2026-06-29] Rediseño RADICAL: coverflow 3D. Las 5 pantallas
   de la app en un carrusel con perspectiva — la activa al frente, las demás
   giradas/recibidas a los lados (rotateY + translateZ). Reusa los 5 mockups.
   Navegación: clic en una tarjeta lateral, flechas, o pills. Mobile-adaptive
   (offsets y profundidad reducidos por breakpoint) + accesible (pills = tablist). */

const FEATURES = [
    { id: 'plan', icon: CalendarDays, title: 'Plan Diario Personalizado', shortLabel: 'Plan', desc: 'Cada día con desayuno, almuerzo, cena y meriendas calibrados a tus macros exactos.', color: '#6366F1' },
    { id: 'recipes', icon: ChefHat, title: 'Recetas Paso a Paso', shortLabel: 'Recetas', desc: 'Cada plato con ingredientes en cantidades dominicanas y pasos claros para cocinarlo.', color: '#A78BFA' },
    { id: 'shopping', icon: ShoppingCart, title: 'Lista de Compras Inteligente', shortLabel: 'Lista', desc: 'Generada automáticamente, agrupada por categorías y exportable a PDF.', color: '#34D399' },
    { id: 'chat', icon: Bot, title: 'Nutricionista IA 24/7', shortLabel: 'Chat IA', desc: 'Pregunta, cambia comidas, registra lo que comiste — la IA responde al instante.', color: '#FB923C' },
    { id: 'pantry', icon: Refrigerator, title: 'Nevera Virtual', shortLabel: 'Nevera', desc: 'La IA sabe qué tienes en casa y evita que compres lo que ya está en tu nevera.', color: '#38BDF8' },
];

// ============================================================
//  Sub-componentes: un mockup por feature (compactos).
// ============================================================

export const PlanMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Tu plan de hoy</strong>
                <span className={styles.mockHeaderSub}>Lunes · Meta: 2,000 kcal</span>
            </div>
            <span className={styles.mockBadgePrimary}>4 comidas</span>
        </div>
        <div className={styles.planMeals}>
            {[
                { tag: 'DESAYUNO', name: 'Mangú con huevos y queso', time: '15 min', kcal: 480 },
                { tag: 'ALMUERZO', name: 'Pollo guisado con moro', time: '35 min', kcal: 620 },
                { tag: 'MERIENDA', name: 'Yogurt griego con frutas', time: '5 min', kcal: 220 },
                { tag: 'CENA', name: 'Pescado al horno con vegetales', time: '30 min', kcal: 540 },
            ].map((m) => (
                <div key={m.tag} className={styles.planMeal}>
                    <div className={styles.planMealLeft}>
                        <span className={styles.planMealTag}>{m.tag}</span>
                        <strong className={styles.planMealName}>{m.name}</strong>
                        <span className={styles.planMealTime}><Clock size={11} strokeWidth={2.5} /> {m.time}</span>
                    </div>
                    <div className={styles.planMealKcal}><strong>{m.kcal}</strong><small>kcal</small></div>
                </div>
            ))}
        </div>
        <div className={styles.planFooter}>
            <Flame size={14} strokeWidth={2.5} />
            <span>Total: <strong>1,860 / 2,000 kcal</strong></span>
            <div className={styles.planProgress}><span style={{ width: '93%' }} /></div>
        </div>
    </div>
);

export const RecipesMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Pollo guisado con moro</strong>
                <span className={styles.mockHeaderSub}>Rinde 2 porciones · 35 min de cocción</span>
            </div>
            <span className={styles.mockBadgeAccent}>Fácil</span>
        </div>
        <div className={styles.recipeBody}>
            <div className={styles.recipeIngredients}>
                <h5>Ingredientes</h5>
                <ul>
                    <li><span className={styles.recipeQty}>1 lb</span> Pechuga de pollo</li>
                    <li><span className={styles.recipeQty}>1 tz</span> Arroz blanco</li>
                    <li><span className={styles.recipeQty}>1/2 tz</span> Habichuelas negras</li>
                    <li><span className={styles.recipeQty}>1</span> Cebolla mediana</li>
                    <li><span className={styles.recipeQty}>2</span> Dientes de ajo</li>
                </ul>
            </div>
            <div className={styles.recipeSteps}>
                <h5>Preparación</h5>
                <ol>
                    <li><span className={styles.recipeStepNum}>1</span> Sofríe la cebolla y el ajo a fuego medio hasta dorar.</li>
                    <li><span className={styles.recipeStepNum}>2</span> Añade el pollo cortado en cubos y dora por 8 min.</li>
                    <li><span className={styles.recipeStepNum}>3</span> Agrega el arroz y las habichuelas, cubre con agua.</li>
                </ol>
            </div>
        </div>
    </div>
);

export const ShoppingMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Tu lista de compras</strong>
                <span className={styles.mockHeaderSub}>Para 7 días · 28 ingredientes</span>
            </div>
            <span className={styles.mockBadgeSuccess}><FileDown size={12} strokeWidth={2.5} /> PDF</span>
        </div>
        <div className={styles.shopBody}>
            {[
                { cat: 'Proteínas', items: [{ name: 'Pechuga de pollo', qty: '2 lb', done: true }, { name: 'Huevos', qty: '12 und', done: true }, { name: 'Pescado fresco', qty: '1 lb', done: false }] },
                { cat: 'Vegetales', items: [{ name: 'Plátano maduro', qty: '3 und', done: true }, { name: 'Cebolla', qty: '2 und', done: false }, { name: 'Cilantro fresco', qty: '1 atado', done: false }] },
            ].map((group) => (
                <div key={group.cat} className={styles.shopGroup}>
                    <h5>{group.cat}</h5>
                    <ul>
                        {group.items.map((item) => (
                            <li key={item.name} className={item.done ? styles.shopItemDone : styles.shopItemPending}>
                                {item.done ? <CheckCircle2 size={13} strokeWidth={2.5} /> : <span className={styles.shopBullet} aria-hidden="true" />}
                                <span>{item.name}</span>
                                <small>{item.qty}</small>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
        <div className={styles.shopLegend}>
            <span className={styles.shopLegendItem}><CheckCircle2 size={12} strokeWidth={2.5} /> Ya está en tu nevera</span>
            <span className={styles.shopLegendItem}><span className={styles.shopBullet} aria-hidden="true" /> Por comprar</span>
        </div>
    </div>
);

export const ChatMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div className={styles.chatHeaderRow}>
                <div className={styles.chatAvatar} aria-hidden="true"><Bot size={16} strokeWidth={2.5} /></div>
                <div>
                    <strong>Nutricionista IA</strong>
                    <span className={styles.mockHeaderSub}><span className={styles.chatStatusDot} aria-hidden="true" /> En línea</span>
                </div>
            </div>
            <Sparkles size={16} className={styles.chatSparkle} strokeWidth={2.5} />
        </div>
        <div className={styles.chatBody}>
            <div className={styles.chatBubbleUser}>¿Puedo cambiar el almuerzo de mañana? Hoy almorcé pollo.</div>
            <div className={styles.chatBubbleBot}>Claro — te sugiero pescado al horno con vegetales. Mantiene tus macros y rompe la rutina.</div>
            <div className={styles.chatBubbleUser}>Hazlo, gracias.</div>
            <div className={styles.chatBubbleBot}>Listo. Actualicé tu plan y la lista de compras. <strong>Pescado fresco · 1 lb</strong> añadido.</div>
        </div>
        <div className={styles.chatInputBar} aria-hidden="true">
            <span className={styles.chatInputPlaceholder}>Escribe lo que necesites…</span>
            <span className={styles.chatInputSend}><Send size={14} strokeWidth={2.5} /></span>
        </div>
    </div>
);

export const PantryMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Lo que tienes en casa</strong>
                <span className={styles.mockHeaderSub}>18 ingredientes guardados</span>
            </div>
            <span className={styles.mockBadgeNeutral}><Plus size={12} strokeWidth={3} /> Añadir</span>
        </div>
        <div className={styles.pantrySearch}>
            <Search size={13} strokeWidth={2.5} />
            <span>Buscar en la nevera…</span>
        </div>
        <div className={styles.pantryGrid}>
            {[
                { name: 'Arroz blanco', qty: '5 lb', state: 'fresh' },
                { name: 'Habichuelas', qty: '2 lb', state: 'fresh' },
                { name: 'Aceite de oliva', qty: '500 ml', state: 'fresh' },
                { name: 'Plátano maduro', qty: '3 und', state: 'soon', warn: 'Usar en 2 días' },
                { name: 'Cilantro', qty: '1 atado', state: 'soon', warn: 'Usar en 3 días' },
                { name: 'Huevos', qty: '8 und', state: 'fresh' },
            ].map((item) => (
                <div key={item.name} className={styles.pantryItem} data-state={item.state}>
                    <strong>{item.name}</strong>
                    <small>{item.qty}</small>
                    {item.state === 'soon' && (
                        <span className={styles.pantryWarn}><AlertTriangle size={10} strokeWidth={2.5} /> {item.warn}</span>
                    )}
                </div>
            ))}
        </div>
    </div>
);

const MOCKUPS = {
    plan: <PlanMockup />,
    recipes: <RecipesMockup />,
    shopping: <ShoppingMockup />,
    chat: <ChatMockup />,
    pantry: <PantryMockup />,
};

const PANEL_ID = 'dashboard-showcase-panel';

// [P3-DASHBOARD-RHYTHM · 2026-06-30] Cadencia "impredecible" del auto-rotado: alterna un
// dwell normal (~3.2-4.9s por tarjeta) con ráfagas rápidas (3-5 flips a ~0.4-0.55s) que
// barren varias tarjetas "de golpe" y luego vuelven a velocidad normal. Jitter + cooldown
// → ritmo orgánico, único, nunca dos ráfagas seguidas. (Antes: setInterval fijo de 3.8s.)
const RHYTHM = {
    normalMin: 3200, normalSpan: 1700,   // dwell normal: 3.2–4.9 s
    burstMin: 400, burstSpan: 150,        // flip dentro de ráfaga: 0.40–0.55 s
    burstProb: 0.45,                      // prob. de iniciar ráfaga (tras el cooldown)
};

// ============================================================
//  Componente principal — coverflow 3D
// ============================================================

const DashboardShowcase = () => {
    const [active, setActive] = useState(0);
    const tabRefs = useRef([]);
    // [P1-LANDING-MOTION · 2026-07-11] Reveal on-scroll compartido del landing.
    const reduce = useReducedMotion();
    const M = makeSectionMotion(reduce);
    // [P3-DASHBOARD-RHYTHM] Estado del ritmo (persiste entre re-arms del efecto):
    // burst = flips rápidos restantes; cooldown = dwells normales antes de re-armar ráfaga.
    const rhythmRef = useRef({ burst: 0, cooldown: 1 });
    const count = FEATURES.length;
    const current = FEATURES[active];
    const [paused, setPaused] = useState(false);

    // [P3-DASHBOARD-RHYTHM · 2026-06-30] Auto-rota el coverflow con cadencia variable
    // (ráfagas + dwell). Loop auto-reprogramado: cada tick avanza y agenda el siguiente con
    // un delay que sale de la máquina de ritmo (rhythmRef). Se pausa al interactuar
    // (hover/focus) y se desactiva con prefers-reduced-motion (a11y). El estado del ritmo
    // vive en rhythmRef para sobrevivir a los re-arms del efecto (pausa/reanudación).
    useEffect(() => {
        if (paused) return undefined;
        if (typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
        let id;
        const nextDelay = () => {
            const r = rhythmRef.current;
            if (r.burst > 0) {
                // dentro de una ráfaga: flips rápidos encadenados
                r.burst -= 1;
                return RHYTHM.burstMin + Math.random() * RHYTHM.burstSpan;
            }
            if (r.cooldown > 0) {
                // descanso obligatorio tras una ráfaga (nunca dos ráfagas pegadas)
                r.cooldown -= 1;
                return RHYTHM.normalMin + Math.random() * RHYTHM.normalSpan;
            }
            if (Math.random() < RHYTHM.burstProb) {
                // arranca una ráfaga: este flip + 2-4 más (3-5 "de golpe"), luego 1-2 dwells
                r.burst = 2 + Math.floor(Math.random() * 3);
                r.cooldown = 1 + Math.floor(Math.random() * 2);
                return RHYTHM.burstMin + Math.random() * RHYTHM.burstSpan;
            }
            return RHYTHM.normalMin + Math.random() * RHYTHM.normalSpan;
        };
        const tick = () => {
            setActive((a) => (a + 1) % count);
            id = setTimeout(tick, nextDelay());
        };
        id = setTimeout(tick, nextDelay());
        return () => clearTimeout(id);
    }, [paused, count]);

    const go = (i) => setActive(((i % count) + count) % count);

    const handleKeyDown = (e, index) => {
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = count - 1;
        if (next === null) return;
        e.preventDefault();
        setActive(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <section className={styles.section} id="dashboard">
            <div className={styles.bgGrid} aria-hidden="true" />

            <div className={styles.container}>
                <motion.div className={styles.header}
                    variants={M.container} initial="hidden" whileInView="show"
                    viewport={{ once: true, amount: 0.6 }}>
                    <motion.span className={styles.badge} variants={M.rise}>Tu Dashboard</motion.span>
                    <motion.h2 className={styles.title} variants={M.rise}>
                        Todo lo que necesitas, <br />
                        <span className={styles.titleAccent}>en un solo lugar</span>
                    </motion.h2>
                    <motion.p className={styles.subtitle} variants={M.rise}>
                        Más que un plan: una herramienta diaria que aprende contigo, organiza tus compras y te ahorra tiempo en la cocina.
                    </motion.p>
                </motion.div>

                {/* [P3-DASHBOARD-3D-AUTOCYCLE] Wrapper que pausa el auto-rotado mientras
                    el usuario interactúa (hover o foco de teclado).
                    [P1-LANDING-MOTION] Entra con fade-rise; el coverflow interno
                    conserva sus transforms CSS (el motion vive en el wrapper). */}
                <motion.div
                    className={styles.carousel}
                    variants={M.rise} initial="hidden" whileInView="show"
                    viewport={{ once: true, amount: 0.2 }}
                    onMouseEnter={() => setPaused(true)}
                    onMouseLeave={() => setPaused(false)}
                    onFocusCapture={() => setPaused(true)}
                    onBlurCapture={() => setPaused(false)}
                >
                {/* ── Coverflow 3D (visual; controlado por las pills de abajo) ── */}
                <div className={styles.stage3d}>
                    <button type="button" className={`${styles.navArrow} ${styles.navPrev}`} aria-label="Anterior" onClick={() => go(active - 1)}>
                        <ChevronLeft size={22} strokeWidth={2.5} />
                    </button>

                    <div className={styles.deck} aria-hidden="true">
                        {FEATURES.map((f, i) => {
                            let offset = i - active;
                            if (offset > count / 2) offset -= count;
                            if (offset < -count / 2) offset += count;
                            const abs = Math.abs(offset);
                            const isActive = i === active;
                            return (
                                <div
                                    key={f.id}
                                    className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
                                    style={{
                                        '--accent': f.color,
                                        '--offset': offset,
                                        '--abs': abs,
                                        '--sign': Math.sign(offset),
                                        opacity: abs === 0 ? 1 : abs === 1 ? 0.82 : 0.5,
                                        zIndex: 10 - abs,
                                        pointerEvents: isActive ? 'none' : 'auto',
                                    }}
                                    onClick={() => setActive(i)}
                                >
                                    {MOCKUPS[f.id]}
                                </div>
                            );
                        })}
                    </div>

                    <button type="button" className={`${styles.navArrow} ${styles.navNext}`} aria-label="Siguiente" onClick={() => go(active + 1)}>
                        <ChevronRight size={22} strokeWidth={2.5} />
                    </button>
                </div>

                {/* ── Info de la feature activa (panel accesible) ── */}
                <div className={styles.activeInfo} id={PANEL_ID} role="tabpanel" aria-live="polite">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={active}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <h3 style={{ color: current.color }}>{current.title}</h3>
                            <p>{current.desc}</p>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* ── Pills de navegación (control accesible: tablist) ── */}
                <div className={styles.nav} role="tablist" aria-label="Funciones del Dashboard">
                    {FEATURES.map((f, i) => {
                        const Icon = f.icon;
                        const isActive = i === active;
                        return (
                            <button
                                key={f.id}
                                type="button"
                                role="tab"
                                ref={(el) => { tabRefs.current[i] = el; }}
                                aria-selected={isActive}
                                aria-controls={PANEL_ID}
                                tabIndex={isActive ? 0 : -1}
                                className={`${styles.navPill} ${isActive ? styles.navPillActive : ''}`}
                                style={{ '--accent': f.color }}
                                onClick={() => setActive(i)}
                                onKeyDown={(e) => handleKeyDown(e, i)}
                            >
                                <Icon size={15} strokeWidth={2.4} />
                                <span>{f.shortLabel}</span>
                            </button>
                        );
                    })}
                </div>
                </motion.div>

                <SeeMoreLink to="/funciones">Explorar todas las funciones</SeeMoreLink>
            </div>
        </section>
    );
};

export default DashboardShowcase;
