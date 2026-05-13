import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CalendarDays, ChefHat, ShoppingCart, Bot, Refrigerator,
    Clock, CheckCircle2, FileDown, Flame, Search, Plus,
    Sparkles, Send, AlertTriangle
} from 'lucide-react';
import styles from './DashboardShowcase.module.css';

// --- Datos de las 5 features que se muestran a la izquierda ---
const FEATURES = [
    {
        id: 'plan',
        icon: CalendarDays,
        title: 'Plan Diario Personalizado',
        shortLabel: 'Plan Diario',
        desc: 'Cada día con desayuno, almuerzo, cena y meriendas calibrados a tus macros exactos.',
        color: '#4F46E5',
    },
    {
        id: 'recipes',
        icon: ChefHat,
        title: 'Recetas Paso a Paso',
        shortLabel: 'Recetas',
        desc: 'Cada plato con ingredientes en cantidades dominicanas y pasos claros para cocinarlo.',
        color: '#8B5CF6',
    },
    {
        id: 'shopping',
        icon: ShoppingCart,
        title: 'Lista de Compras Inteligente',
        shortLabel: 'Lista',
        desc: 'Generada automáticamente, agrupada por categorías y exportable a PDF para llevarla donde quieras comprar.',
        color: '#10B981',
    },
    {
        id: 'chat',
        icon: Bot,
        title: 'Nutricionista IA 24/7',
        shortLabel: 'Chat IA',
        desc: 'Pregunta, cambia comidas, registra lo que comiste — la IA responde al instante.',
        color: '#F97316',
    },
    {
        id: 'pantry',
        icon: Refrigerator,
        title: 'Nevera Virtual',
        shortLabel: 'Nevera',
        desc: 'La IA sabe qué tienes en casa y evita que compres lo que ya está en tu nevera.',
        color: '#0EA5E9',
    },
];

// ============================================================
//  Sub-componentes: un mockup por feature.
//  Replican visualmente las pantallas reales del Dashboard,
//  pero compactos para encajar en el container del showcase.
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

// ============================================================
//  Componente principal
// ============================================================

const DashboardShowcase = () => {
    const [activeFeature, setActiveFeature] = useState('plan');
    const currentFeature = FEATURES.find((f) => f.id === activeFeature) || FEATURES[0];

    // Estado del scroll horizontal de los tabs (mobile). Habilita
    // fade-mask en los bordes solo cuando hay contenido oculto en esa
    // dirección — patrón estilo iOS App Store. Inactivo en desktop:
    // el @media de la lista override quita el mask-image.
    const listRef = useRef(null);
    const [scrollHints, setScrollHints] = useState({ left: false, right: false });

    useEffect(() => {
        const el = listRef.current;
        if (!el) return undefined;

        const update = () => {
            const overflowing = el.scrollWidth > el.clientWidth + 1;
            const atStart = el.scrollLeft <= 4;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
            setScrollHints({
                left: overflowing && !atStart,
                right: overflowing && !atEnd,
            });
        };

        update();
        el.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            el.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, []);

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
                        Más que un plan: una herramienta diaria que aprende contigo, te organiza las compras y te ahorra tiempo en la cocina.
                    </p>
                </div>

                <div className={styles.grid}>
                    {/* Lista de features. Desktop: columna vertical con descripción
                        inline. Mobile: tabs horizontales scrolleables (solo icon +
                        shortLabel), con la descripción de la feature activa
                        renderizada como caption debajo del mockup. */}
                    <ul
                        ref={listRef}
                        className={styles.featureList}
                        data-fade-left={scrollHints.left ? '' : undefined}
                        data-fade-right={scrollHints.right ? '' : undefined}
                        role="tablist"
                        aria-label="Features del Dashboard"
                    >
                        {FEATURES.map((f) => {
                            const Icon = f.icon;
                            const isActive = activeFeature === f.id;
                            return (
                                <li key={f.id}>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        aria-controls={`mockup-${f.id}`}
                                        className={`${styles.featureItem} ${isActive ? styles.featureActive : ''}`}
                                        onClick={() => setActiveFeature(f.id)}
                                        style={isActive ? { '--feature-color': f.color } : undefined}
                                    >
                                        <span
                                            className={styles.featureIcon}
                                            style={{ '--feature-color': f.color }}
                                        >
                                            <Icon size={20} strokeWidth={2} />
                                        </span>
                                        <span className={styles.featureText}>
                                            {/* Dual label: full (desktop) + short (mobile).
                                                CSS oculta uno u otro según breakpoint. */}
                                            <strong>
                                                <span className={styles.labelFull}>{f.title}</span>
                                                <span className={styles.labelShort}>{f.shortLabel}</span>
                                            </strong>
                                            <span className={styles.featureDesc}>{f.desc}</span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {/* Mockup grande (derecha en desktop, centro en mobile) */}
                    <div
                        className={styles.mockupContainer}
                        id={`mockup-${activeFeature}`}
                        role="tabpanel"
                        aria-live="polite"
                    >
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeFeature}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                className={styles.mockupWrapper}
                            >
                                {MOCKUPS[activeFeature]}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Caption mobile-only: título completo + descripción de la
                        feature activa, debajo del mockup. En desktop esta caption
                        está oculta (la descripción ya vive en la lista lateral). */}
                    <div className={styles.featureCaption} aria-hidden="true">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeFeature}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                            >
                                <strong style={{ color: currentFeature.color }}>
                                    {currentFeature.title}
                                </strong>
                                <p>{currentFeature.desc}</p>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default DashboardShowcase;
