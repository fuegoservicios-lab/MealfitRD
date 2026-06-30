import { useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    CalendarDays, ChefHat, ShoppingCart, Bot, Refrigerator, Check,
    FileDown, History, Sparkles, Gauge, Droplet, Lightbulb, HeartPulse, UserPlus,
    ChevronRight, ArrowRight, Info,
} from 'lucide-react';
import { PlanMockup, RecipesMockup, ShoppingMockup, ChatMockup, PantryMockup } from '../components/home/DashboardShowcase';
import styles from './Engine.module.css';

/* [P3-DETAIL-PAGES · 2026-06-29] Página de detalle de "Funciones": deep-dive de cada
   función de la app, ampliando el showcase del landing. Contenido real. Pública.
   [P3-FEATURES-AUDIT-FIX · 2026-06-30] Auditoría a profundidad (workflow 9 agentes):
   se quitó "Llamadas de voz" (la UI quedó deshabilitada en código, no solo gateada
   por tier — overclaim real), se le puso el mismo caveat de tier que voz ya tenía a
   "Memoria a largo plazo" (gateada a Básico+ en el backend, antes se presentaba como
   universal), se agregaron 2 funciones reales que faltaban (escaneo de comida por
   foto, Modo Cocina) + 2 EXTRAS (hidratación, razonamiento del plan), se limpiaron
   anglicismos internos (slot, pantry-aware) y mismatches ícono/contenido, se sumó
   FAQ y un mockup de pantalla real por feature (reusa los de DashboardShowcase). */

const STATS = [
    { num: '3-6', label: 'Comidas calibradas a tu condición' },
    { num: '200+', label: 'Alimentos verificados' },
    { num: '100%', label: 'Precios reales en RD$, no estimados' },
    { num: '24/7', label: 'Coach nutricional IA' },
];

const FEATURES = [
    {
        Icon: CalendarDays, color: '#6366F1', Mockup: PlanMockup,
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
        Icon: ChefHat, color: '#F472B6', Mockup: RecipesMockup,
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
        Icon: ShoppingCart, color: '#34D399', Mockup: ShoppingMockup,
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
        Icon: Bot, color: '#FB923C', Mockup: ChatMockup,
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
        Icon: Refrigerator, color: '#38BDF8', Mockup: PantryMockup,
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

const FeaturesPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    useEffect(() => {
        const prev = document.title;
        document.title = 'Funciones de MealfitRD — todo lo que hace la app';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
                <span className={styles.eyebrow}>Funciones</span>
                <h1 className={styles.title}>
                    Una app, <span className={styles.accent}>todo tu día</span> resuelto.
                </h1>
                <p className={styles.lead}>
                    Plan, recetas, lista de compras, coach y nevera — conectados por el mismo motor.
                    Esto es todo lo que MealfitRD hace por ti.
                </p>
                <div className={styles.stats}>
                    {STATS.map((s) => (
                        <div key={s.label} className={styles.stat}>
                            <div className={styles.statNum}>{s.num}</div>
                            <div className={styles.statLabel}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Las funciones principales</h2>
                <p className={styles.sectionLead}>
                    Cinco herramientas que cubren el ciclo completo: planear, cocinar, comprar, ajustar y renovar.
                </p>
                {FEATURES.map((f) => (
                    <div key={f.title} className={styles.feature}>
                        <div className={styles.featureHead}>
                            <span className={styles.featureIcon} style={{ background: f.color }}>
                                <f.Icon size={24} strokeWidth={2} />
                            </span>
                            <div>
                                <div className={styles.featureTitle}>{f.title}</div>
                                <div className={styles.featureSub}>{f.sub}</div>
                            </div>
                        </div>
                        <p className={styles.featureText}>{f.text}</p>
                        <ul className={styles.bullets}>
                            {f.bullets.map(([b, rest]) => (
                                <li key={b} className={styles.bullet}>
                                    <Check size={16} strokeWidth={3} className={styles.bulletIcon} />
                                    <span><strong>{b}:</strong> {rest}</span>
                                </li>
                            ))}
                        </ul>
                        <div className={styles.tagRow}>
                            {f.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                        </div>
                        <div className={styles.featureMockup}>
                            <f.Mockup />
                        </div>
                    </div>
                ))}
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Y además</h2>
                <div className={styles.cards}>
                    {EXTRAS.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Preguntas sobre las funciones</h2>
                <p className={styles.sectionLead}>
                    Dudas puntuales de uso. Para el método completo, mira «Cómo funciona».
                </p>
                <div className={styles.faq}>
                    {FAQS.map((f) => (
                        <div key={f.q} className={styles.faqItem}>
                            <div className={styles.faqQ}>{f.q}</div>
                            <div className={styles.faqA}>{f.a}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.disclaimer}>
                    <Info size={22} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>Sigue explorando.</strong> Mira <Link to="/como-funciona">cómo funciona el
                        método</Link>, la <Link to="/precision">precisión que medimos</Link>, <Link to="/motor">el
                        motor por dentro</Link> y los <Link to="/precios">planes</Link>. Algunas funciones (créditos
                        por mes, memoria a largo plazo, Súper Personalización) varían según tu plan — el detalle
                        completo está en Precios.
                    </div>
                </div>
            </section>

            <section className={styles.finalCta}>
                <h2 className={styles.finalTitle}>Pruébalo con tu propio plan</h2>
                <p className={styles.finalText}>Gratis para empezar, sin tarjeta. Crea tu primer plan en minutos.</p>
                <div className={styles.ctaRow}>
                    <Link to="/assessment" className={styles.ctaPrimary}>Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} /></Link>
                    <Link to="/precios" className={styles.ctaGhost}>Ver planes <ArrowRight size={18} strokeWidth={2.25} /></Link>
                </div>
            </section>
        </div>
    );
};

export default FeaturesPage;
