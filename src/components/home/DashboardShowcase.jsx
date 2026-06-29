import { motion } from 'framer-motion';
import {
    CalendarDays, ChefHat, ShoppingCart, Bot, Refrigerator,
    Flame, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import styles from './DashboardShowcase.module.css';

/* [P3-DASHBOARD-BENTO · 2026-06-29] Rediseño a BENTO GRID: mosaico de tiles de
   distintos tamaños, cada uno con una mini-demo viva de la función. Copy más
   científico pero honesto. Theme-aware + reveal escalonado on-scroll. */

const tileVariants = {
    hidden: { opacity: 0, y: 26 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};
const bentoVariants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

const PLAN_MEALS = [
    { tag: 'DESAYUNO', name: 'Mangú con huevos y queso', kcal: 480 },
    { tag: 'ALMUERZO', name: 'Pollo guisado con moro', kcal: 620 },
    { tag: 'MERIENDA', name: 'Yogurt griego con frutas', kcal: 220 },
    { tag: 'CENA', name: 'Pescado al horno con vegetales', kcal: 540 },
];
const LIST_ITEMS = [
    { name: 'Pechuga de pollo', qty: '2 lb', done: true },
    { name: 'Huevos', qty: '12 und', done: true },
    { name: 'Pescado fresco', qty: '1 lb', done: false },
    { name: 'Plátano maduro', qty: '3 und', done: false },
];
const PANTRY = [
    { name: 'Arroz', qty: '5 lb' },
    { name: 'Habichuelas', qty: '2 lb' },
    { name: 'Plátano', qty: '3 und', warn: true },
    { name: 'Aceite', qty: '500 ml' },
    { name: 'Cilantro', qty: '1 atado', warn: true },
    { name: 'Huevos', qty: '8 und' },
];
const RECIPE = [
    { qty: '1 lb', name: 'Pechuga de pollo' },
    { qty: '1 tz', name: 'Arroz blanco' },
    { qty: '½ tz', name: 'Habichuelas negras' },
    { qty: '2', name: 'Dientes de ajo' },
];

const DashboardShowcase = () => {
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

                <motion.div
                    className={styles.bento}
                    variants={bentoVariants}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, amount: 0.15 }}
                >
                    {/* ── PLAN (tile grande) ── */}
                    <motion.div variants={tileVariants} className={`${styles.tile} ${styles.tilePlan}`} style={{ '--accent': '#6366F1' }}>
                        <div className={styles.tileHead}>
                            <span className={styles.tileIcon}><CalendarDays size={18} strokeWidth={2.2} /></span>
                            <div className={styles.tileHeadText}>
                                <h3>Plan diario calibrado</h3>
                                <p>Cada comida ajustada a tu objetivo de macronutrientes y calorías — sin ojo, con número.</p>
                            </div>
                        </div>
                        <div className={styles.planPreview}>
                            {PLAN_MEALS.map((m) => (
                                <div key={m.tag} className={styles.planRow}>
                                    <div className={styles.planRowLeft}>
                                        <span className={styles.planTag}>{m.tag}</span>
                                        <strong className={styles.planName}>{m.name}</strong>
                                    </div>
                                    <span className={styles.planKcal}>{m.kcal}<small>kcal</small></span>
                                </div>
                            ))}
                            <div className={styles.planBar}>
                                <Flame size={13} strokeWidth={2.5} />
                                <span>1,860 / 2,000 kcal</span>
                                <span className={styles.planBarTrack}><span style={{ width: '93%' }} /></span>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── CHAT ── */}
                    <motion.div variants={tileVariants} className={`${styles.tile} ${styles.tileChat}`} style={{ '--accent': '#FB923C' }}>
                        <div className={styles.tileHead}>
                            <span className={styles.tileIcon}><Bot size={18} strokeWidth={2.2} /></span>
                            <div className={styles.tileHeadText}>
                                <h3>Asistente IA en contexto</h3>
                                <p>Consulta, ajusta y registra. Razona con tu perfil clínico, 24/7.</p>
                            </div>
                        </div>
                        <div className={styles.chatPreview}>
                            <span className={styles.bubbleUser}>¿Cambio el almuerzo de mañana?</span>
                            <span className={styles.bubbleBot}>Te sugiero pescado al horno con vegetales — mantiene tus macros y rompe la rutina.</span>
                            <span className={styles.bubbleUser}>Hazlo 👍</span>
                        </div>
                    </motion.div>

                    {/* ── NEVERA ── */}
                    <motion.div variants={tileVariants} className={`${styles.tile} ${styles.tileNevera}`} style={{ '--accent': '#38BDF8' }}>
                        <div className={styles.tileHead}>
                            <span className={styles.tileIcon}><Refrigerator size={18} strokeWidth={2.2} /></span>
                            <div className={styles.tileHeadText}>
                                <h3>Inventario anti-desperdicio</h3>
                                <p>Sabe qué tienes y reusa los sobrantes.</p>
                            </div>
                        </div>
                        <div className={styles.pantryPreview}>
                            {PANTRY.map((p) => (
                                <span key={p.name} className={`${styles.pantryChip} ${p.warn ? styles.pantryChipWarn : ''}`}>
                                    {p.warn && <AlertTriangle size={10} strokeWidth={2.5} />}
                                    {p.name} <small>{p.qty}</small>
                                </span>
                            ))}
                        </div>
                    </motion.div>

                    {/* ── LISTA ── */}
                    <motion.div variants={tileVariants} className={`${styles.tile} ${styles.tileLista}`} style={{ '--accent': '#34D399' }}>
                        <div className={styles.tileHead}>
                            <span className={styles.tileIcon}><ShoppingCart size={18} strokeWidth={2.2} /></span>
                            <div className={styles.tileHeadText}>
                                <h3>Lista deducida y costeada</h3>
                                <p>Del plan a tu carrito, con precios reales RD$.</p>
                            </div>
                        </div>
                        <div className={styles.listPreview}>
                            {LIST_ITEMS.map((it) => (
                                <div key={it.name} className={styles.listItem} data-done={it.done ? '' : undefined}>
                                    {it.done
                                        ? <CheckCircle2 size={13} strokeWidth={2.5} className={styles.listCheck} />
                                        : <span className={styles.listBullet} aria-hidden="true" />}
                                    <span>{it.name}</span>
                                    <small>{it.qty}</small>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* ── RECETAS ── */}
                    <motion.div variants={tileVariants} className={`${styles.tile} ${styles.tileRecetas}`} style={{ '--accent': '#A78BFA' }}>
                        <div className={styles.tileHead}>
                            <span className={styles.tileIcon}><ChefHat size={18} strokeWidth={2.2} /></span>
                            <div className={styles.tileHeadText}>
                                <h3>Recetas con gramaje exacto</h3>
                                <p>Cantidades cuantificadas, no «al gusto».</p>
                            </div>
                        </div>
                        <div className={styles.recipePreview}>
                            {RECIPE.map((ing) => (
                                <div key={ing.name} className={styles.recipeRow}>
                                    <span className={styles.recipeQty}>{ing.qty}</span>
                                    <span>{ing.name}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
};

export default DashboardShowcase;
