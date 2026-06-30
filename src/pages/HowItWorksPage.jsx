import { useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    ClipboardList, Cpu, Salad, LineChart, ChevronRight, ArrowRight, Check,
    ShieldCheck, Gauge, Repeat, Soup, CalendarClock, Info, Plus,
} from 'lucide-react';
import styles from './HowItWorksPage.module.css';

/* [P3-HOWITWORKS-PAGE-EDITORIAL · 2026-06-30] Página de detalle de "Cómo funciona"
   rediseñada en clave editorial premium: índice lateral fijo con scroll-spy, secciones
   numeradas, tipografía con aire y reveals sutiles on-scroll. Contenido real basado en
   el motor; honesto (sin prometer resultados). Pública, indexable, bajo <Layout>. */

const STATS = [
    { num: '20+', label: 'Variables de entrada' },
    { num: 'V4', label: 'Motor DeepSeek' },
    { num: '17', label: 'Micronutrientes vs DRI' },
    { num: '7/15/30', label: 'días · recálculo del plan' },
];

const STAGES = [
    {
        Icon: ClipboardList, color: '#60A5FA',
        title: 'Perfil clínico-metabólico',
        sub: 'El sustrato de cada decisión',
        text: 'No partimos solo de tu peso. Construimos un perfil con más de 20 variables que el motor usa en cada cálculo:',
        bullets: [
            ['Composición y gasto energético', 'edad, sexo, estatura, peso, nivel de actividad → tu requerimiento calórico y de macros.'],
            ['Condiciones de salud', 'diabetes, enfermedad renal, hipertensión, dislipidemia, embarazo, cirugía bariátrica…'],
            ['Alergias IgE', 'se eliminan por completo, incluidos derivados.'],
            ['Presupuesto y estilo de vida', 'cuánto puedes gastar y cuánto tiempo tienes para cocinar.'],
            ['Gustos y rechazos', 'lo que te encanta y lo que no quieres ver en tu plan.'],
        ],
        tags: ['Datos biométricos', 'Condiciones', 'Alergias', 'Presupuesto'],
    },
    {
        Icon: Cpu, color: '#A78BFA',
        title: 'Motor de inferencia',
        sub: 'DeepSeek V4 · en minutos',
        text: 'El modelo resuelve tu plan día por día contra un catálogo de 200+ alimentos verificados, optimizando macronutrientes, coste y adherencia. Clave: el motor solo usa alimentos que existen en el catálogo — nunca inventa comida.',
        bullets: [
            ['Generación por chunks', 'el plan se arma por bloques para entregarte resultado rápido y robusto.'],
            ['Solo alimentos verificados', 'cada ingrediente tiene datos nutricionales reales (curados desde USDA).'],
            ['Optimización multi-objetivo', 'equilibra tus macros, tu presupuesto y la variedad a la vez.'],
        ],
        tags: ['DeepSeek V4', 'Catálogo verificado', 'Minutos'],
    },
    {
        Icon: Salad, color: '#34D399',
        title: 'Calibración nutricional',
        sub: '17 micronutrientes · DRI',
        text: 'Cada plato se ajusta a tus macronutrientes objetivo y se compara contra 17 micronutrientes (vs las referencias diarias, DRI), con un medidor de cobertura. Aquí entra el motor determinista que cuadra los números.',
        bullets: [
            ['Banda de macros', 'proteína, carbohidratos, grasas y calorías dentro de un rango objetivo.'],
            ['Piso de proteína', 'una guarda garantiza que nunca quedes por debajo de tu mínimo.'],
            ['Coherencia receta ↔ lista', 'si la receta pide 200 g de pollo, la lista tiene ≈200 g × tu hogar.'],
        ],
        tags: ['Macros en banda', 'Piso de proteína', '17 micros'],
    },
    {
        Icon: LineChart, color: '#FB923C',
        title: 'Adaptación longitudinal',
        sub: 'Recálculo por ciclo (7/15/30 días)',
        text: 'Tu plan no es estático. Al cerrar tu ciclo —de 7, 15 o 30 días, según elijas en el formulario— se recalcula con tu progreso para sortear la meseta metabólica y mantener el ritmo, ajustando porciones y objetivos a medida que cambias.',
        bullets: [
            ['Avance del ciclo', 'la ventana del plan rueda hacia adelante sin generar todo de nuevo.'],
            ['Renovación con tu nevera', 'al renovar, reusa lo que te sobró y pide solo lo que falta.'],
            ['Cambios con el coach', 'pídele a la IA cambiar una comida o registrar lo que comiste.'],
        ],
        tags: ['Recálculo por ciclo', 'Anti-meseta', 'Pantry-aware'],
    },
];

const PIPELINE = [
    { title: 'Tu perfil', text: 'Objetivo, datos biométricos, condiciones, alergias, presupuesto y preferencias entran al motor.' },
    { title: 'Cálculo de objetivos', text: 'Estimamos tus calorías diarias y tus macros — proteína, carbohidratos y grasas — según tu meta.' },
    { title: 'Generación con IA', text: 'DeepSeek V4 arma los platos día por día usando solo alimentos del catálogo verificado.' },
    { title: 'Validación', text: 'Cada comida pasa por guardas: piso de proteína, banda de macros, variedad, coherencia y la capa clínica.' },
    { title: 'Entrega', text: 'Plan completo + lista de compras costeada con precios reales de supermercado dominicano (RD$).' },
];

const GUARDS = [
    { Icon: Gauge, title: 'Banda de macros', text: 'Calorías en 95–105% del objetivo y cada macro —proteína, carbos y grasas— dentro del 90–112%. No es a ojo: se mide celda por celda (cada día contra cada macro), y un plan con demasiadas celdas fuera de banda se corrige o se regenera.' },
    { Icon: ShieldCheck, title: 'Piso de proteína', text: 'Tu proteína mínima se fija en gramos por kilo de peso —el rango que preserva masa muscular, sobre todo cuando estás en déficit—. Si un día queda corto, un cierre determinista re-apunta las porciones hasta alcanzarlo.' },
    { Icon: Soup, title: 'Variedad y coherencia del plato', text: 'Reglas deterministas evitan repetir la misma fuente de proteína —y su perfil de aminoácidos— dentro de un mismo día, y verifican que cada plato sea coherente: su nombre refleja los ingredientes reales (sin proteínas fantasma) y sus componentes combinan entre sí.' },
    { Icon: Cpu, title: 'Capa clínica', text: 'Diabetes, enfermedad renal, hipertensión, dislipidemia, embarazo o cirugía bariátrica activan reglas deterministas sobre cada comida —tope de proteína renal (KDIGO), sodio, carga glucémica, mercurio en el embarazo—. Es código que se ejecuta, no solo un prompt.' },
    { Icon: Salad, title: 'Seguridad alimentaria', text: 'Nada de huevo ni mariscos crudos de riesgo (Salmonella, Vibrio); vísceras, leguminosas y víveres siempre con cocción segura —las legumbres crudas contienen fitohemaglutinina y la yuca, compuestos cianogénicos—.' },
];

const ADAPT = [
    { Icon: CalendarClock, title: 'Avanza tu ciclo', text: 'Tu plan funciona como una ventana que rueda hacia adelante: conserva los días que aún no comes y solo extiende lo necesario. Mantenimiento, sin regenerar todo desde cero.' },
    { Icon: Repeat, title: 'Renueva con tu Nevera', text: 'Al renovar, recalcula tus calorías y macros con tu peso actual —el ajuste clave para sortear la meseta— y reaprovecha lo duradero de tu nevera, pidiéndote solo lo que falta.' },
    { Icon: Cpu, title: 'Ajusta con el Coach', text: 'Pídele al coach IA cambiar una comida, regenerar un día o registrar lo que comiste: recalcula al instante los macros del día y la lista de compras, sin rehacer el plan entero.' },
];

const FAQ = [
    { q: '¿Cuánto tarda en generarse mi plan?', a: 'Normalmente de 4 a 5 minutos. El motor genera por bloques y te entrega el plan completo con su lista de compras.' },
    { q: '¿Puedo cambiar comidas que no me gustan?', a: 'Sí, y de varias formas. En tu menú, cada comida tiene su botón «Cambiar Plato» para reemplazarla de forma individual (por horario), y «Actualizar platos» regenera el día completo cocinando desde tu Nevera. También desde el coach IA puedes pedir estos cambios o ajustar porciones — siempre respetando tus macros y tu condición.' },
    { q: '¿Se adapta a mi condición de salud?', a: 'Sí. Diabetes, enfermedad renal, hipertensión, dislipidemia, embarazo, cirugía bariátrica y alergias IgE activan reglas específicas sobre cada comida.' },
    { q: '¿Necesito tarjeta para empezar?', a: 'No. El plan Gratis te deja descubrir el motor sin tarjeta. Puedes escalar cuando quieras.' },
];

/* secciones del índice lateral (orden = orden en la página) */
const SECTIONS = [
    { id: 'etapas', label: 'Las 4 etapas' },
    { id: 'pipeline', label: 'El pipeline' },
    { id: 'guardas', label: 'Guardas de calidad' },
    { id: 'adaptacion', label: 'Se adapta contigo' },
    { id: 'faq', label: 'Preguntas frecuentes' },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);

/* ─────────────────────────── helpers de animación ─────────────────────────── */

/* Reveal sutil on-scroll. Respeta prefers-reduced-motion (devuelve el contenido
   sin transformar para quien no quiere animación). */
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

/* Scroll-spy: marca la sección activa según cuál cruza la banda superior del viewport.
   rootMargin recorta una "zona activa" justo bajo el header flotante. */
function useScrollSpy(ids) {
    const [activeId, setActiveId] = useState(ids[0]);
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return undefined;
        const targets = ids
            .map((id) => document.getElementById(id))
            .filter(Boolean);
        if (!targets.length) return undefined;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible.length) setActiveId(visible[0].target.id);
            },
            { rootMargin: '-110px 0px -55% 0px', threshold: 0 },
        );
        targets.forEach((t) => observer.observe(t));
        return () => observer.disconnect();
    }, [ids]);
    return activeId;
}

/* ─────────────────────────────── página ──────────────────────────────────── */

const HowItWorksPage = () => {
    const reduce = useReducedMotion();
    const activeId = useScrollSpy(SECTION_IDS);
    const [openFaq, setOpenFaq] = useState(0);

    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    useEffect(() => {
        const prev = document.title;
        document.title = 'Cómo funciona MealfitRD — el método, paso a paso';
        return () => { document.title = prev; };
    }, []);

    const handleTocClick = useCallback((e, id) => {
        e.preventDefault();
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, [reduce]);

    return (
        <div className={styles.page}>
            <div className={styles.bgGlow} aria-hidden="true" />

            {/* ───────────────── hero ───────────────── */}
            <header className={styles.hero}>
                <span className={styles.eyebrow}><ClipboardList size={14} strokeWidth={2.5} /> El método</span>
                <h1 className={styles.title}>
                    Del dato a tu plato,<br /><span className={styles.accent}>con método</span>.
                </h1>
                <p className={styles.lead}>
                    Simple por fuera, riguroso por dentro. Esto es todo lo que ocurre entre que
                    respondes unas preguntas y recibes un plan calculado a tu medida.
                </p>
                <div className={styles.stats}>
                    {STATS.map((s) => (
                        <div key={s.label} className={styles.stat}>
                            <div className={styles.statNum}>{s.num}</div>
                            <div className={styles.statLabel}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </header>
            <div className={styles.heroRule} aria-hidden="true" />

            {/* ───────────────── layout: índice + contenido ───────────────── */}
            <div className={styles.layout}>
                {/* índice lateral fijo */}
                <aside className={styles.toc} aria-label="En esta página">
                    <span className={styles.tocLabel}>En esta página</span>
                    <nav className={styles.tocNav}>
                        {SECTIONS.map((s, i) => (
                            <a
                                key={s.id}
                                href={`#${s.id}`}
                                onClick={(e) => handleTocClick(e, s.id)}
                                className={`${styles.tocItem} ${activeId === s.id ? styles.tocActive : ''}`}
                                aria-current={activeId === s.id ? 'true' : undefined}
                            >
                                <span className={styles.tocNum}>{String(i + 1).padStart(2, '0')}</span>
                                {s.label}
                            </a>
                        ))}
                    </nav>
                    <Link to="/assessment" className={styles.tocCta}>
                        Crear mi plan <ChevronRight size={15} strokeWidth={2.5} />
                    </Link>
                </aside>

                {/* contenido */}
                <div className={styles.content}>
                    {/* (01) las 4 etapas */}
                    <section id="etapas" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>El método</span>
                            <h2 className={styles.secTitle}>Las 4 etapas, de principio a fin</h2>
                            <p className={styles.secLead}>
                                Cada plan recorre estas cuatro etapas. Lo que ves es un plato; lo que pasa
                                debajo es un pipeline con control de calidad en cada paso.
                            </p>
                        </Reveal>
                        <div className={styles.stages}>
                            {STAGES.map((s, i) => (
                                <Reveal key={s.title} className={styles.stage}>
                                    <div className={styles.stageNum}>{String(i + 1).padStart(2, '0')}</div>
                                    <div>
                                        <div className={styles.stageHead}>
                                            <span className={styles.stageIcon} style={{ background: s.color, boxShadow: `0 10px 22px -12px ${s.color}` }}>
                                                <s.Icon size={22} strokeWidth={2} />
                                            </span>
                                            <div>
                                                <div className={styles.stageTitle}>{s.title}</div>
                                                <div className={styles.stageSub}>{s.sub}</div>
                                            </div>
                                        </div>
                                        <p className={styles.stageText}>{s.text}</p>
                                        <ul className={styles.bullets}>
                                            {s.bullets.map(([b, rest]) => (
                                                <li key={b} className={styles.bullet}>
                                                    <Check size={16} strokeWidth={3} className={styles.bulletIcon} />
                                                    <span><strong>{b}:</strong> {rest}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className={styles.tags}>
                                            {s.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                                        </div>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </section>

                    {/* (02) pipeline técnico */}
                    <section id="pipeline" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>El proceso</span>
                            <h2 className={styles.secTitle}>Qué ocurre cuando pulsas «Crear mi plan»</h2>
                            <p className={styles.secLead}>Del formulario a tu lista de compras, en cinco pasos.</p>
                        </Reveal>
                        <Reveal className={styles.steps}>
                            {PIPELINE.map((step, i) => (
                                <div key={step.title} className={styles.step}>
                                    <div className={styles.stepRail}>
                                        <div className={styles.stepDot}>{i + 1}</div>
                                        <div className={styles.stepLine} />
                                    </div>
                                    <div className={styles.stepBody}>
                                        <div className={styles.stepTitle}>{step.title}</div>
                                        <div className={styles.stepText}>{step.text}</div>
                                    </div>
                                </div>
                            ))}
                        </Reveal>
                    </section>

                    {/* (03) guardas de calidad */}
                    <section id="guardas" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>Control de calidad</span>
                            <h2 className={styles.secTitle}>Las guardas que cuidan tu plan</h2>
                            <p className={styles.secLead}>
                                Antes de entregarte un plan, el motor lo somete a una batería de guardas
                                deterministas. Si algo no cuadra, lo corrige o lo regenera.
                            </p>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsTwo}`}>
                            {GUARDS.map(({ Icon, title, text }) => (
                                <div key={title} className={styles.card}>
                                    <div className={styles.cardIcon}><Icon size={22} strokeWidth={2} /></div>
                                    <div className={styles.cardTitle}>{title}</div>
                                    <div className={styles.cardText}>{text}</div>
                                </div>
                            ))}
                        </Reveal>
                    </section>

                    {/* (04) adaptación */}
                    <section id="adaptacion" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>Longitudinal</span>
                            <h2 className={styles.secTitle}>Se adapta contigo</h2>
                            <p className={styles.secLead}>
                                Tu metabolismo se adapta: a medida que cambias, tu cuerpo ajusta cuánta energía
                                gasta —la termogénesis adaptativa que suele provocar las mesetas—. Por eso tu plan
                                no es fijo: se recalcula con tus datos actuales. Tres formas en que evoluciona
                                contigo, sin empezar de cero.
                            </p>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsThree}`}>
                            {ADAPT.map(({ Icon, title, text }) => (
                                <div key={title} className={styles.card}>
                                    <div className={styles.cardIcon}><Icon size={22} strokeWidth={2} /></div>
                                    <div className={styles.cardTitle}>{title}</div>
                                    <div className={styles.cardText}>{text}</div>
                                </div>
                            ))}
                        </Reveal>
                    </section>

                    {/* (05) FAQ */}
                    <section id="faq" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>Dudas</span>
                            <h2 className={styles.secTitle}>Preguntas frecuentes</h2>
                        </Reveal>
                        <Reveal className={styles.faq}>
                            {FAQ.map((f, i) => {
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
                    <Info size={22} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>¿Quieres más?</strong> Mira <Link to="/funciones">todas las funciones</Link> de la
                        app, la <Link to="/precision">precisión que medimos</Link> o <Link to="/motor">el motor por
                        dentro</Link>. MealfitRD es una herramienta de apoyo nutricional, no un sustituto de un
                        profesional de la salud.
                    </div>
                </Reveal>

                <Reveal className={styles.finalCta}>
                    <h2 className={styles.finalTitle}>¿List@ para tu plan calculado?</h2>
                    <p className={styles.finalText}>Responde unas preguntas y deja que el motor haga el resto.</p>
                    <div className={styles.ctaRow}>
                        <Link to="/assessment" className={styles.ctaPrimary}>Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} /></Link>
                        <Link to="/precios" className={styles.ctaGhost}>Ver planes <ArrowRight size={18} strokeWidth={2.25} /></Link>
                    </div>
                </Reveal>
            </div>
        </div>
    );
};

export default HowItWorksPage;
