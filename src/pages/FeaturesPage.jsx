import { useEffect, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    LayoutGrid, Check, FileDown, History, Sparkles, Gauge, Droplet,
    Lightbulb, HeartPulse, UserPlus, ChevronRight, ArrowRight, Info, Plus,
} from 'lucide-react';
// Comparte el design system minimalista-científico de la página "Cómo funciona"
// (mismo patrón de módulo CSS compartido que Engine.module.css en el repo).
import styles from './HowItWorksPage.module.css';

/* [P3-FEATURES-PAGE-SCIENTIFIC · 2026-06-30] Rediseño de "Funciones" en la misma clave
   minimalista-científica que /como-funciona: columna única centrada, secciones numeradas,
   figuras abstractas SVG line-art sobre cuadrícula (una por función) + figura "hub" en el
   hero, una sola gama (indigo + neutros), FAQ acordeón y reveals sutiles. Conserva el 100%
   del contenido auditado en P3-FEATURES-AUDIT-FIX (overclaims corregidos, caveats de tier,
   funciones nuevas, EXTRAS, FAQ). Reemplaza los mockups reales por figuras abstractas. */

/* ─────────────────────── figuras abstractas (SVG line-art) ─────────────────────
   Reusan las clases .fig* del módulo compartido (stroke/fill vía tokens → theme-aware).
   Geometría determinista; sin dependencias. */

function FigHub() {
    const hub = [340, 104];
    const sats = [[150, 62], [235, 150], [340, 42], [445, 150], [530, 62]];
    return (
        <svg viewBox="0 0 680 200" className={styles.heroSvg} role="img" aria-label="Cinco herramientas conectadas por un mismo motor">
            {sats.map(([x, y], i) => <line key={`l${i}`} x1={hub[0]} y1={hub[1]} x2={x} y2={y} className={styles.figMuted} />)}
            {sats.map(([x, y], i) => <circle key={`s${i}`} cx={x} cy={y} r="9" className={styles.figDot} />)}
            <circle cx={hub[0]} cy={hub[1]} r="22" className={styles.figAccent} />
            <circle cx={hub[0]} cy={hub[1]} r="8" className={styles.figDotAccent} />
        </svg>
    );
}

function FigPlan() {
    const rows = [[44, 116], [84, 90], [124, 130], [164, 78]];
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Plan diario: comidas del día y meta calórica">
            <line x1="38" y1="32" x2="38" y2="176" className={styles.figLine} />
            {rows.map(([y, w], i) => (
                <g key={y}>
                    <circle cx="38" cy={y} r={i === 0 ? 5 : 4} className={styles.figDotAccent} />
                    <rect x="54" y={y - 6} width={w} height="12" rx="6" className={i === 0 ? styles.figFill : styles.figLine} />
                </g>
            ))}
            <rect x="38" y="194" width="158" height="9" rx="4.5" className={styles.figLine} />
            <rect x="38" y="194" width="104" height="9" rx="4.5" className={styles.figFill} />
        </svg>
    );
}

function FigRecipe() {
    const nodes = [[58, 64], [150, 104], [78, 162]];
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Recetas paso a paso: secuencia de pasos">
            {[[40, 36], [70, 30], [100, 38]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.4" className={styles.figDot} />)}
            <polyline points={nodes.map((p) => p.join(',')).join(' ')} className={styles.figAccent} />
            {nodes.map(([x, y], i) => (
                <g key={i}>
                    <circle cx={x} cy={y} r="13" className={styles.figAccent} />
                    <circle cx={x} cy={y} r="4" className={styles.figDotAccent} />
                </g>
            ))}
        </svg>
    );
}

function FigShopping() {
    const rows = [[44, true, 94], [80, true, 120], [116, false, 82], [152, false, 108]];
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Lista de compras: checklist y costo total">
            {rows.map(([y, checked, w]) => (
                <g key={y}>
                    <rect x="28" y={y - 8} width="16" height="16" rx="4" className={checked ? styles.figFill : styles.figLine} />
                    {checked && <polyline points={`31,${y} 35,${y + 4} 41,${y - 4}`} className={styles.figAccent} />}
                    <rect x="56" y={y - 4} width={w} height="8" rx="4" className={styles.figLine} />
                </g>
            ))}
            <line x1="28" y1="182" x2="196" y2="182" className={styles.figDash} />
            <rect x="120" y="192" width="76" height="14" rx="7" className={styles.figFill} />
        </svg>
    );
}

function FigChat() {
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Nutricionista IA: conversación">
            <rect x="24" y="36" width="118" height="32" rx="12" className={styles.figLine} />
            <rect x="78" y="84" width="118" height="30" rx="12" className={styles.figFill} />
            <rect x="24" y="130" width="138" height="32" rx="12" className={styles.figLine} />
            <rect x="24" y="180" width="172" height="22" rx="11" className={styles.figDash} />
            <circle cx="186" cy="191" r="7" className={styles.figDotAccent} />
        </svg>
    );
}

function FigPantry() {
    const cells = [
        [30, 70, 'on'], [92, 70, 'on'], [154, 70, 'off'],
        [30, 130, 'off'], [92, 130, 'on'], [154, 130, 'low'],
    ];
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Nevera inteligente: inventario de la despensa">
            <rect x="30" y="34" width="160" height="20" rx="6" className={styles.figLine} />
            <circle cx="44" cy="44" r="3.5" className={styles.figDot} />
            {cells.map(([x, y, state], i) => (
                <g key={i}>
                    <rect x={x} y={y} width="48" height="48" rx="8" className={state === 'low' ? styles.figDash : styles.figLine} />
                    {state === 'on' && <circle cx={x + 24} cy={y + 24} r="6" className={styles.figDotAccent} />}
                    {state === 'low' && <circle cx={x + 24} cy={y + 24} r="9" className={styles.figAccent} />}
                </g>
            ))}
        </svg>
    );
}

/* ──────────────────────────────── datos ──────────────────────────────── */

const STATS = [
    { num: '3-6', label: 'Comidas calibradas a tu condición' },
    { num: '200+', label: 'Alimentos verificados' },
    { num: '100%', label: 'Precios reales en RD$, no estimados' },
    { num: '24/7', label: 'Coach nutricional IA' },
];

const FEATURES = [
    {
        Fig: FigPlan, figLabel: 'Día calibrado',
        title: 'Plan Diario Personalizado',
        sub: 'Tu día entero, resuelto',
        text: 'Cada día trae desayuno, almuerzo, cena y meriendas calibrados a tus macros exactos. La cantidad de comidas se ajusta a tu perfil clínico (p. ej. 5–6 tomas en hipoglucemia, insulina o cirugía bariátrica).',
        bullets: [
            ['Macros por comida', 'cada plato muestra calorías y reparto de proteína, carbos y grasas.'],
            ['Cocina dominicana', 'mangú, moro, pollo guisado, pescado al horno… comida que de verdad comes.'],
            ['Meta diaria visible', 'una barra te muestra cuánto llevas frente a tu objetivo calórico.'],
        ],
        tags: ['Calibrado a tu condición', 'Meriendas', 'Macros por comida'],
    },
    {
        Fig: FigRecipe, figLabel: 'Paso a paso',
        title: 'Recetas Paso a Paso',
        sub: 'Sin adivinar cantidades',
        text: 'Cada plato viene con sus ingredientes en cantidades dominicanas y pasos claros para cocinarlo. Las cantidades de la receta cuadran con tu lista de compras — sin ingredientes fantasma.',
        bullets: [
            ['Cantidades reales', 'en medidas que entiendes (tazas, cucharadas, unidades).'],
            ['Pasos claros', 'instrucciones coherentes con los ingredientes del plato.'],
            ['Escala a tu hogar', 'las porciones se multiplican por el tamaño de tu familia.'],
            ['Modo Cocina', 'pasos grandes a pantalla completa, uno a la vez — y registra la comida automáticamente al terminar.'],
        ],
        tags: ['Cantidades dominicanas', 'Sin ingredientes fantasma', 'Modo Cocina'],
    },
    {
        Fig: FigShopping, figLabel: 'Costeada en RD$',
        title: 'Lista de Compras Inteligente',
        sub: 'Costeada de verdad, en RD$',
        text: 'Generada automáticamente desde tu plan, agrupada por categorías y costeada por tamaño de envase con precios reales de supermercado dominicano. Sabes cuánto te costará el ciclo antes de comprar.',
        bullets: [
            ['Directo de góndola', 'no es un promedio: el precio sale del supermercado dominicano real, igual que lo verías en caja.'],
            ['Costo por envase', 'calcula cuántos paquetes necesitas, no gramos sueltos.'],
            ['Costo total del ciclo', 'desglosa estables (1×) y perecederos (× semanas) y exporta a PDF.'],
        ],
        tags: ['Agrupada por categoría', 'Costo por envase', 'Exporta a PDF'],
    },
    {
        Fig: FigChat, figLabel: 'Coach 24/7',
        title: 'Nutricionista IA 24/7',
        sub: 'Un coach que ajusta tu plan',
        text: 'Pregunta lo que quieras, cambia comidas, regenera un día, escanea lo que comiste o regístralo a mano — la IA responde al instante y recalcula respetando tus macros y tu condición.',
        bullets: [
            ['Cambia y regenera', 'pídele cambiar un plato o rehacer un día; revisa que la comida, los macros y tu condición clínica cuadren.'],
            ['Escanea tu comida', 'toma una foto y la IA estima las macros al instante — revisas y confirmas antes de guardar.'],
            ['Registra lo que comes', 'lleva tu consumo y ajusta el resto del día.'],
            ['Memoria a largo plazo', 'recuerda lo que te gusta, tus condiciones y tu progreso. Incluida en Básico, Plus y Ultra.'],
        ],
        tags: ['Chat instantáneo', 'Escanea tu comida', 'Memoria a largo plazo (Básico+)'],
    },
    {
        Fig: FigPantry, figLabel: 'Inventario vivo',
        title: 'Nevera Inteligente',
        sub: 'No compres lo que ya tienes',
        text: 'La app sabe qué tienes en casa. Marcas «ya compré la lista» y, al renovar tu plan, el motor reusa lo que te sobró y te pide solo lo que falta para tener tu nevera al 100%.',
        bullets: [
            ['Inventario vivo', 'tu despensa se actualiza con lo que compras y consumes.'],
            ['Renovación inteligente', 'reusa lo duradero y compra solo el faltante.'],
            ['Cero desperdicio', 'evita comprar de nuevo lo que ya está en tu nevera.'],
        ],
        tags: ['Inventario', 'Renovar reusando', 'Restock'],
    },
];

const EXTRAS = [
    { Icon: FileDown, title: 'Exportación a PDF', text: 'Tu plan completo y tu lista de compras costeada, listos para imprimir o llevar al súper.' },
    { Icon: History, title: 'Historial de planes', text: 'Vuelve a cualquier plan anterior, compáralo y restáuralo cuando quieras.' },
    { Icon: Sparkles, title: 'Súper Personalización', text: 'Un panel opt-in para afinar aún más el plan y el coach a tus detalles particulares.' },
    { Icon: Gauge, title: '17 micronutrientes', text: 'Tu plan se compara contra las referencias diarias (DRI) con un medidor de cobertura.' },
    { Icon: HeartPulse, title: 'Multi-condición clínica', text: 'Combina varias condiciones (p. ej. DM2 + renal) con reglas que se respetan a la vez.' },
    { Icon: Droplet, title: 'Hidratación diaria', text: 'Meta de agua personalizada según tu peso y actividad, con racha de días para mantener el hábito.' },
    { Icon: Lightbulb, title: 'Razonamiento del plan', text: 'Diagnóstico, plan de acción y un tip del chef explicando el porqué de cada plan que te entregamos.' },
    { Icon: UserPlus, title: 'Empieza gratis', text: 'Plan Gratis sin tarjeta para descubrir el motor antes de decidir.' },
];

const FAQS = [
    { q: '¿Qué pasa si se me acaban los créditos del mes?', a: 'Tu Historial, tu Nevera y los planes que ya generaste siguen disponibles. Lo que se pausa es generar o regenerar planes, hablar con el coach IA y escanear comidas, hasta tu próximo ciclo o hasta subir de plan.' },
    { q: '¿Puedo cambiar una comida sin perder el resto de mi plan?', a: 'Sí. Pídeselo al coach IA —«cambia el almuerzo de mañana»— o usa «Cambiar Plato» en esa comida puntual. El resto del plan, tus macros y tu lista de compras se ajustan sin rehacer nada desde cero.' },
    { q: '¿La lista de compras sirve en cualquier supermercado dominicano?', a: 'Los precios se calculan con datos reales de supermercados dominicanos como guía de costo, pero no está integrada a un supermercado en particular ni reserva tus productos — tú decides dónde comprar.' },
    { q: '¿Qué cambia entre el Plan Gratis y los planes pagos?', a: 'El Plan Gratis te deja crear y usar un plan completo sin tarjeta. Los planes pagos suman más créditos al mes, memoria a largo plazo del coach y Súper Personalización. Compara todo en Precios.' },
];

/* ─────────────────────────── helpers de animación ─────────────────────────── */

function Reveal({ children, className, delay = 0 }) {
    const reduce = useReducedMotion();
    if (reduce) return <div className={className}>{children}</div>;
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        >
            {children}
        </motion.div>
    );
}

/* ─────────────────────────────── página ──────────────────────────────────── */

const FeaturesPage = () => {
    const reduce = useReducedMotion();
    const [openFaq, setOpenFaq] = useState(0);

    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    useEffect(() => {
        const prev = document.title;
        document.title = 'Funciones de MealfitRD — todo lo que hace la app';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            {/* ───────────────── hero ───────────────── */}
            <header className={styles.hero}>
                <span className={styles.eyebrow}><LayoutGrid size={14} strokeWidth={2.5} /> Funciones</span>
                <h1 className={styles.title}>
                    Una app, <span className={styles.accent}>todo tu día</span> resuelto.
                </h1>
                <p className={styles.lead}>
                    Plan, recetas, lista de compras, coach y nevera — conectados por el mismo motor.
                    Esto es todo lo que MealfitRD hace por ti.
                </p>

                <Reveal className={styles.heroFigure} delay={0.1}>
                    <div className={`${styles.heroCanvas} ${styles.grid}`}>
                        <FigHub />
                    </div>
                    <div className={styles.heroCaption}>
                        <span>Fig. 00 — cinco herramientas, un motor</span>
                        <span>plan · recetas · lista · coach · nevera</span>
                    </div>
                </Reveal>

                <div className={styles.stats}>
                    {STATS.map((s) => (
                        <div key={s.label} className={styles.stat}>
                            <div className={styles.statNum}>{s.num}</div>
                            <div className={styles.statLabel}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </header>

            {/* ───────────────── layout: contenido centrado ───────────────── */}
            <div className={styles.layout}>
                <div className={styles.content}>
                    {/* (01) funciones principales */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>01 — El ciclo completo</span>
                            <h2 className={styles.secTitle}>Las funciones principales</h2>
                            <p className={styles.secLead}>
                                Cinco herramientas que cubren el ciclo completo: planear, cocinar, comprar,
                                ajustar y renovar.
                            </p>
                        </Reveal>
                        <div className={styles.stages}>
                            {FEATURES.map((f, i) => (
                                <Reveal key={f.title} className={styles.stage}>
                                    <div className={styles.stageBody}>
                                        <span className={styles.stageKicker}>Función {String(i + 1).padStart(2, '0')}</span>
                                        <h3 className={styles.stageTitle}>{f.title}</h3>
                                        <div className={styles.stageSub}>{f.sub}</div>
                                        <p className={styles.stageText}>{f.text}</p>
                                        <ul className={styles.bullets}>
                                            {f.bullets.map(([b, rest]) => (
                                                <li key={b} className={styles.bullet}>
                                                    <Check size={15} strokeWidth={3} className={styles.bulletIcon} />
                                                    <span><strong>{b}:</strong> {rest}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className={styles.tags}>
                                            {f.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                                        </div>
                                    </div>
                                    <figure className={styles.figure}>
                                        <div className={`${styles.figCanvas} ${styles.grid}`}>
                                            <f.Fig />
                                        </div>
                                        <figcaption className={styles.figCaption}>
                                            Fig. {String(i + 1).padStart(2, '0')} — {f.figLabel}
                                        </figcaption>
                                    </figure>
                                </Reveal>
                            ))}
                        </div>
                    </section>

                    {/* (02) extras */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>02 — Y además</span>
                            <h2 className={styles.secTitle}>Más cosas que hace por ti</h2>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsThree}`}>
                            {EXTRAS.map(({ Icon, title, text }) => (
                                <div key={title} className={styles.card}>
                                    <div className={styles.cardHead}>
                                        <Icon size={19} strokeWidth={2} className={styles.cardIcon} />
                                        <div className={styles.cardTitle}>{title}</div>
                                    </div>
                                    <div className={styles.cardText}>{text}</div>
                                </div>
                            ))}
                        </Reveal>
                    </section>

                    {/* (03) FAQ */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>03 — Dudas</span>
                            <h2 className={styles.secTitle}>Preguntas sobre las funciones</h2>
                            <p className={styles.secLead}>
                                Dudas puntuales de uso. Para el método completo, mira «Cómo funciona».
                            </p>
                        </Reveal>
                        <Reveal className={styles.faq}>
                            {FAQS.map((f, i) => {
                                const isOpen = openFaq === i;
                                return (
                                    <div key={f.q} className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''}`}>
                                        <button
                                            type="button"
                                            className={styles.faqQ}
                                            onClick={() => setOpenFaq(isOpen ? -1 : i)}
                                            aria-expanded={isOpen}
                                        >
                                            {f.q}
                                            <Plus size={20} strokeWidth={2.25} className={styles.faqIcon} />
                                        </button>
                                        {reduce ? (
                                            isOpen && <div className={styles.faqA}>{f.a}</div>
                                        ) : (
                                            <AnimatePresence initial={false}>
                                                {isOpen && (
                                                    <motion.div
                                                        className={styles.faqAWrap}
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.28, ease: 'easeOut' }}
                                                    >
                                                        <div className={styles.faqA}>{f.a}</div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        )}
                                    </div>
                                );
                            })}
                        </Reveal>
                    </section>
                </div>
            </div>

            {/* ───────────────── cierre: disclaimer + CTA ───────────────── */}
            <div className={styles.closing}>
                <Reveal className={styles.disclaimer}>
                    <Info size={20} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>Sigue explorando.</strong> Mira <Link to="/como-funciona">cómo funciona el
                        método</Link>, la <Link to="/precision">precisión que medimos</Link>, <Link to="/motor">el
                        motor por dentro</Link> y los <Link to="/precios">planes</Link>. Algunas funciones (créditos
                        por mes, memoria a largo plazo, Súper Personalización) varían según tu plan — el detalle
                        completo está en Precios.
                    </div>
                </Reveal>

                <Reveal className={styles.finalCta}>
                    <h2 className={styles.finalTitle}>Pruébalo con tu propio plan</h2>
                    <p className={styles.finalText}>Gratis para empezar, sin tarjeta. Crea tu primer plan en minutos.</p>
                    <div className={styles.ctaRow}>
                        <Link to="/assessment" className={styles.ctaPrimary}>Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} /></Link>
                        <Link to="/precios" className={styles.ctaGhost}>Ver planes <ArrowRight size={18} strokeWidth={2.25} /></Link>
                    </div>
                </Reveal>
            </div>
        </div>
    );
};

export default FeaturesPage;
