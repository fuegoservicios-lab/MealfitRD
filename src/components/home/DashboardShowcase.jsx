import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CalendarDays, ChefHat, ShoppingCart, Bot, Refrigerator,
    Clock, CheckCircle2, FileDown, Flame, Search, Plus,
    Sparkles, Send, AlertTriangle
} from 'lucide-react';
import styles from './DashboardShowcase.module.css';

// --- Las 5 funciones (callouts flotantes). Copy más científico pero honesto. ---
const FEATURES = [
    {
        id: 'plan',
        icon: CalendarDays,
        title: 'Plan diario calibrado',
        shortLabel: 'Plan',
        desc: 'Cada comida ajustada a tu objetivo de macronutrientes y calorías — sin ojo, con número.',
        color: '#6366F1',
    },
    {
        id: 'recipes',
        icon: ChefHat,
        title: 'Recetas con gramaje exacto',
        shortLabel: 'Recetas',
        desc: 'Cantidades dominicanas cuantificadas y pasos claros. Porciones medidas, no «al gusto».',
        color: '#A78BFA',
    },
    {
        id: 'shopping',
        icon: ShoppingCart,
        title: 'Lista deducida y costeada',
        shortLabel: 'Lista',
        desc: 'Derivada del plan, agrupada por categoría y costeada con precios reales de supermercado RD$.',
        color: '#34D399',
    },
    {
        id: 'chat',
        icon: Bot,
        title: 'Asistente IA en contexto',
        shortLabel: 'Chat IA',
        desc: 'Consulta, ajusta comidas y registra. La IA razona con tu perfil clínico en contexto, 24/7.',
        color: '#FB923C',
    },
    {
        id: 'pantry',
        icon: Refrigerator,
        title: 'Inventario anti-desperdicio',
        shortLabel: 'Nevera',
        desc: 'Sabe qué tienes en casa y reusa los sobrantes para optimizar tu próxima compra.',
        color: '#38BDF8',
    },
];

// ============================================================
//  Sub-componentes: un mockup por feature (replican las pantallas
//  reales del Dashboard, compactos para el showcase).
// ============================================================

const PlanMockup = () => (
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
                        <span className={styles.planMealTime}>
                            <Clock size={11} strokeWidth={2.5} /> {m.time}
                        </span>
                    </div>
                    <div className={styles.planMealKcal}>
                        <strong>{m.kcal}</strong>
                        <small>kcal</small>
                    </div>
                </div>
            ))}
        </div>
        <div className={styles.planFooter}>
            <Flame size={14} strokeWidth={2.5} />
            <span>Total: <strong>1,860 / 2,000 kcal</strong></span>
            <div className={styles.planProgress}>
                <span style={{ width: '93%' }} />
            </div>
        </div>
    </div>
);

const RecipesMockup = () => (
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

const ShoppingMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Tu lista de compras</strong>
                <span className={styles.mockHeaderSub}>Para 7 días · 28 ingredientes</span>
            </div>
            <button className={styles.mockBadgeSuccess} type="button" aria-label="Descargar PDF">
                <FileDown size={12} strokeWidth={2.5} /> PDF
            </button>
        </div>
        <div className={styles.shopBody}>
            {[
                {
                    cat: 'Proteínas',
                    items: [
                        { name: 'Pechuga de pollo', qty: '2 lb', done: true },
                        { name: 'Huevos', qty: '12 und', done: true },
                        { name: 'Pescado fresco', qty: '1 lb', done: false },
                    ],
                },
                {
                    cat: 'Vegetales',
                    items: [
                        { name: 'Plátano maduro', qty: '3 und', done: true },
                        { name: 'Cebolla', qty: '2 und', done: false },
                        { name: 'Cilantro fresco', qty: '1 atado', done: false },
                    ],
                },
            ].map((group) => (
                <div key={group.cat} className={styles.shopGroup}>
                    <h5>{group.cat}</h5>
                    <ul>
                        {group.items.map((item) => (
                            <li key={item.name} className={item.done ? styles.shopItemDone : styles.shopItemPending}>
                                {item.done ? (
                                    <CheckCircle2 size={13} strokeWidth={2.5} />
                                ) : (
                                    <span className={styles.shopBullet} aria-hidden="true" />
                                )}
                                <span>{item.name}</span>
                                <small>{item.qty}</small>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
        <div className={styles.shopLegend}>
            <span className={styles.shopLegendItem}>
                <CheckCircle2 size={12} strokeWidth={2.5} /> Ya está en tu nevera
            </span>
            <span className={styles.shopLegendItem}>
                <span className={styles.shopBullet} aria-hidden="true" /> Por comprar
            </span>
        </div>
    </div>
);

const ChatMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div className={styles.chatHeaderRow}>
                <div className={styles.chatAvatar} aria-hidden="true">
                    <Bot size={16} strokeWidth={2.5} />
                </div>
                <div>
                    <strong>Nutricionista IA</strong>
                    <span className={styles.mockHeaderSub}>
                        <span className={styles.chatStatusDot} aria-hidden="true" /> En línea
                    </span>
                </div>
            </div>
            <Sparkles size={16} className={styles.chatSparkle} strokeWidth={2.5} />
        </div>
        <div className={styles.chatBody}>
            <div className={styles.chatBubbleUser}>
                ¿Puedo cambiar el almuerzo de mañana? Hoy almorcé pollo.
            </div>
            <div className={styles.chatBubbleBot}>
                Claro — te sugiero pescado al horno con vegetales. Mantiene tus macros y rompe la rutina.
            </div>
            <div className={styles.chatBubbleUser}>
                Hazlo, gracias.
            </div>
            <div className={styles.chatBubbleBot}>
                Listo. Actualicé tu plan y la lista de compras. <strong>Pescado fresco · 1 lb</strong> añadido.
            </div>
        </div>
        <div className={styles.chatInputBar} aria-hidden="true">
            <span className={styles.chatInputPlaceholder}>Escribe lo que necesites…</span>
            <span className={styles.chatInputSend}>
                <Send size={14} strokeWidth={2.5} />
            </span>
        </div>
    </div>
);

const PantryMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Lo que tienes en casa</strong>
                <span className={styles.mockHeaderSub}>18 ingredientes guardados</span>
            </div>
            <button className={styles.mockBadgeNeutral} type="button" aria-label="Añadir item">
                <Plus size={12} strokeWidth={3} /> Añadir
            </button>
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
                        <span className={styles.pantryWarn}>
                            <AlertTriangle size={10} strokeWidth={2.5} /> {item.warn}
                        </span>
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

// ============================================================
//  Componente principal — [P3-DASHBOARD-CALLOUTS · 2026-06-29]
//  Rediseño: mockup central que cambia + callouts flotantes
//  clicables alrededor (los callouts SON los tabs; el mockup el
//  tabpanel). Se preserva el patrón ARIA tablist/tab + navegación
//  por teclado (roving tabindex).
// ============================================================

const DashboardShowcase = () => {
    const [activeFeature, setActiveFeature] = useState('plan');
    const currentFeature = FEATURES.find((f) => f.id === activeFeature) || FEATURES[0];
    const tabRefs = useRef([]);

    const handleTabKeyDown = (e, index) => {
        const count = FEATURES.length;
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = count - 1;
        if (next === null) return;
        e.preventDefault();
        setActiveFeature(FEATURES[next].id);
        tabRefs.current[next]?.focus();
    };

    return (
        <section className={styles.section} id="dashboard">
            <div className={styles.bgGlow} aria-hidden="true" />

            <div className={styles.container}>
                <div className={styles.header}>
                    <span className={styles.badge}>Tu Dashboard</span>
                    <h2 className={styles.title}>
                        Todo lo que necesitas, <br />
                        <span className={styles.gradientText}>en un solo lugar</span>
                    </h2>
                    <p className={styles.subtitle}>
                        Más que un plan: una herramienta diaria que aprende contigo, organiza tus compras y te ahorra tiempo en la cocina.
                    </p>
                </div>

                <div className={styles.stage}>
                    {/* callouts flotantes (tabs) que controlan el mockup central */}
                    <div className={styles.callouts} role="tablist" aria-label="Funciones del Dashboard">
                        {FEATURES.map((f, idx) => {
                            const Icon = f.icon;
                            const isActive = activeFeature === f.id;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    role="tab"
                                    ref={(el) => { tabRefs.current[idx] = el; }}
                                    aria-selected={isActive}
                                    aria-controls={PANEL_ID}
                                    tabIndex={isActive ? 0 : -1}
                                    className={`${styles.callout} ${styles['callout' + (idx + 1)]} ${isActive ? styles.calloutActive : ''}`}
                                    style={{ '--feature-color': f.color }}
                                    onClick={() => setActiveFeature(f.id)}
                                    onMouseEnter={() => setActiveFeature(f.id)}
                                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                                >
                                    <span className={styles.calloutIcon}>
                                        <Icon size={18} strokeWidth={2} />
                                    </span>
                                    <span className={styles.calloutText}>
                                        <strong>{f.title}</strong>
                                        <small>{f.desc}</small>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* mockup central (tabpanel) que cambia según el callout activo */}
                    <div
                        className={styles.mockCenter}
                        id={PANEL_ID}
                        role="tabpanel"
                        tabIndex={0}
                        aria-label={`Vista previa: ${currentFeature.title}`}
                        aria-live="polite"
                        style={{ '--feature-color': currentFeature.color }}
                    >
                        <div className={styles.mockGlow} aria-hidden="true" />
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeFeature}
                                initial={{ opacity: 0, y: 14, scale: 0.985 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.99 }}
                                transition={{ duration: 0.32, ease: 'easeOut' }}
                                className={styles.mockupWrapper}
                            >
                                {MOCKUPS[activeFeature]}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default DashboardShowcase;
