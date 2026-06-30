import { useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    ClipboardList, ChevronRight, ArrowRight, Check, ShieldCheck, Gauge,
    Repeat, Soup, CalendarClock, Info, Plus, Cpu, Salad,
} from 'lucide-react';
import styles from './HowItWorksPage.module.css';

/* [P3-HOWITWORKS-PAGE-SCIENTIFIC · 2026-06-30] Página de detalle de "Cómo funciona"
   en clave minimalista-científica: figuras abstractas en SVG (line-art monocromo sobre
   cuadrícula), un esquema del método en el hero, una figura por etapa (campo de datos,
   red de inferencia, radar de cobertura, recálculo), pies de figura tipo paper, índice
   lateral con scroll-spy y reveals sutiles. Una sola gama (indigo + neutros). Contenido
   real y honesto. Pública, indexable, bajo <Layout>. */

/* ─────────────────────── figuras abstractas (SVG line-art) ─────────────────────
   Todas usan clases del módulo (stroke/fill vía tokens) → theme-aware. Geometría
   determinista; sin dependencias. */

function HeroDiagram() {
    const nodes = [[120, 118], [280, 90], [440, 112], [600, 58]];
    const curve = [[40, 142], ...nodes].map((p) => p.join(',')).join(' ');
    const scatter = [[92, 70], [205, 142], [360, 64], [520, 128]];
    return (
        <svg viewBox="0 0 680 200" className={styles.heroSvg} role="img" aria-label="Esquema abstracto del método: del dato al plato">
            <line x1="30" y1="168" x2="650" y2="168" className={styles.figLine} />
            {nodes.map(([x]) => <line key={`t${x}`} x1={x} y1="168" x2={x} y2="175" className={styles.figLine} />)}
            {nodes.map(([x, y]) => <line key={`d${x}`} x1={x} y1={y} x2={x} y2="168" className={styles.figDash} />)}
            {scatter.map(([x, y]) => <circle key={`s${x}`} cx={x} cy={y} r="2" className={styles.figDot} />)}
            <polyline points={curve} className={styles.figAccent} />
            {nodes.map(([x, y]) => <circle key={`n${x}`} cx={x} cy={y} r="4.5" className={styles.figDotAccent} />)}
            <circle cx="600" cy="58" r="13" className={styles.figAccent} />
            <line x1="582" y1="58" x2="618" y2="58" className={styles.figAccent} />
            <line x1="600" y1="40" x2="600" y2="76" className={styles.figAccent} />
        </svg>
    );
}

function FigProfile() {
    const xs = [40, 76, 112, 148, 184];
    const ys = [40, 76, 112, 148, 184];
    const hi = new Set(['76-76', '148-40', '112-148', '184-112']);
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Campo de datos: captura de variables del perfil">
            <line x1="22" y1="28" x2="22" y2="196" className={styles.figLine} />
            <line x1="22" y1="196" x2="198" y2="196" className={styles.figLine} />
            {ys.map((y) => xs.map((x) => {
                const key = `${x}-${y}`;
                return hi.has(key) ? (
                    <g key={key}>
                        <circle cx={x} cy={y} r="9" className={styles.figAccent} />
                        <circle cx={x} cy={y} r="4" className={styles.figDotAccent} />
                    </g>
                ) : (
                    <circle key={key} cx={x} cy={y} r="2.2" className={styles.figDot} />
                );
            }))}
        </svg>
    );
}

function FigEngine() {
    const cx = 110;
    const cy = 110;
    const R = 76;
    const outer = [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Red de inferencia del motor">
            {outer.map(([x, y], i) => <line key={`e${i}`} x1={cx} y1={cy} x2={x} y2={y} className={styles.figMuted} />)}
            {outer.map(([x, y], i) => {
                const [nx, ny] = outer[(i + 1) % outer.length];
                return <line key={`p${i}`} x1={x} y1={y} x2={nx} y2={ny} className={styles.figDash} />;
            })}
            {outer.map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r="5" className={styles.figDot} />)}
            <circle cx={cx} cy={cy} r="22" className={styles.figAccent} />
            <circle cx={cx} cy={cy} r="8.5" className={styles.figDotAccent} />
        </svg>
    );
}

function FigCalibration() {
    const cx = 110;
    const cy = 110;
    const N = 6;
    const ang = (i) => (2 * Math.PI / N) * i - Math.PI / 2;
    const ringPts = (r) => Array.from({ length: N }, (_, i) => `${cx + r * Math.cos(ang(i))},${cy + r * Math.sin(ang(i))}`).join(' ');
    const cover = [80, 62, 74, 56, 72, 66];
    const coverPts = cover.map((r, i) => `${cx + r * Math.cos(ang(i))},${cy + r * Math.sin(ang(i))}`).join(' ');
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Radar de cobertura nutricional contra las referencias diarias">
            {[28, 54, 82].map((r) => <polygon key={r} points={ringPts(r)} className={styles.figLine} />)}
            {Array.from({ length: N }, (_, i) => (
                <line key={i} x1={cx} y1={cy} x2={cx + 82 * Math.cos(ang(i))} y2={cy + 82 * Math.sin(ang(i))} className={styles.figLine} />
            ))}
            <polygon points={coverPts} className={styles.figFill} />
            {cover.map((r, i) => (
                <circle key={i} cx={cx + r * Math.cos(ang(i))} cy={cy + r * Math.sin(ang(i))} r="3.2" className={styles.figDotAccent} />
            ))}
        </svg>
    );
}

function FigAdaptation() {
    const pts = [[34, 68], [64, 106], [96, 90], [128, 124], [160, 132], [190, 130]];
    const poly = pts.map((p) => p.join(',')).join(' ');
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Recálculo del plan a lo largo del ciclo">
            {[64, 102, 140].map((y) => <line key={y} x1="30" y1={y} x2="196" y2={y} className={styles.figDash} />)}
            <line x1="30" y1="38" x2="30" y2="172" className={styles.figLine} />
            <line x1="30" y1="172" x2="196" y2="172" className={styles.figLine} />
            <line x1="30" y1="128" x2="196" y2="128" className={styles.figMuted} />
            <polyline points={poly} className={styles.figAccent} />
            {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.4" className={styles.figDotAccent} />)}
        </svg>
    );
}

/* ──────────────────────────────── datos ──────────────────────────────── */

const STATS = [
    { num: '20+', label: 'Variables de entrada' },
    { num: 'V4', label: 'Motor DeepSeek' },
    { num: '17', label: 'Micronutrientes vs DRI' },
    { num: '7/15/30', label: 'días · recálculo' },
];

const STAGES = [
    {
        Fig: FigProfile, figLabel: 'Captura de variables',
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
        Fig: FigEngine, figLabel: 'Red de inferencia',
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
        Fig: FigCalibration, figLabel: 'Cobertura vs DRI',
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
        Fig: FigAdaptation, figLabel: 'Recálculo por ciclo',
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

const SECTIONS = [
    { id: 'etapas', label: 'Las 4 etapas' },
    { id: 'pipeline', label: 'El pipeline' },
    { id: 'guardas', label: 'Guardas de calidad' },
    { id: 'adaptacion', label: 'Se adapta contigo' },
    { id: 'faq', label: 'Preguntas frecuentes' },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);

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

function useScrollSpy(ids) {
    const [activeId, setActiveId] = useState(ids[0]);
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return undefined;
        const targets = ids.map((id) => document.getElementById(id)).filter(Boolean);
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

                <Reveal className={styles.heroFigure} delay={0.1}>
                    <div className={`${styles.heroCanvas} ${styles.grid}`}>
                        <HeroDiagram />
                    </div>
                    <div className={styles.heroCaption}>
                        <span>Fig. 00 — del dato al plato</span>
                        <span>perfil → inferencia → calibración → adaptación</span>
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

            {/* ───────────────── layout: índice + contenido ───────────────── */}
            <div className={styles.layout}>
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

                <div className={styles.content}>
                    {/* (01) las 4 etapas */}
                    <section id="etapas" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>01 — El método</span>
                            <h2 className={styles.secTitle}>Las 4 etapas, de principio a fin</h2>
                            <p className={styles.secLead}>
                                Cada plan recorre estas cuatro etapas. Lo que ves es un plato; lo que pasa
                                debajo es un pipeline con control de calidad en cada paso.
                            </p>
                        </Reveal>
                        <div className={styles.stages}>
                            {STAGES.map((s, i) => (
                                <Reveal key={s.title} className={styles.stage}>
                                    <div className={styles.stageBody}>
                                        <span className={styles.stageKicker}>Etapa {String(i + 1).padStart(2, '0')}</span>
                                        <h3 className={styles.stageTitle}>{s.title}</h3>
                                        <div className={styles.stageSub}>{s.sub}</div>
                                        <p className={styles.stageText}>{s.text}</p>
                                        <ul className={styles.bullets}>
                                            {s.bullets.map(([b, rest]) => (
                                                <li key={b} className={styles.bullet}>
                                                    <Check size={15} strokeWidth={3} className={styles.bulletIcon} />
                                                    <span><strong>{b}:</strong> {rest}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className={styles.tags}>
                                            {s.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                                        </div>
                                    </div>
                                    <figure className={styles.figure}>
                                        <div className={`${styles.figCanvas} ${styles.grid}`}>
                                            <s.Fig />
                                        </div>
                                        <figcaption className={styles.figCaption}>
                                            Fig. {String(i + 1).padStart(2, '0')} — {s.figLabel}
                                        </figcaption>
                                    </figure>
                                </Reveal>
                            ))}
                        </div>
                    </section>

                    {/* (02) pipeline técnico */}
                    <section id="pipeline" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>02 — El proceso</span>
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
                            <span className={styles.secKicker}>03 — Control de calidad</span>
                            <h2 className={styles.secTitle}>Las guardas que cuidan tu plan</h2>
                            <p className={styles.secLead}>
                                Antes de entregarte un plan, el motor lo somete a una batería de guardas
                                deterministas. Si algo no cuadra, lo corrige o lo regenera.
                            </p>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsTwo}`}>
                            {GUARDS.map(({ Icon, title, text }) => (
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

                    {/* (04) adaptación */}
                    <section id="adaptacion" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>04 — Longitudinal</span>
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
                                    <div className={styles.cardHead}>
                                        <Icon size={19} strokeWidth={2} className={styles.cardIcon} />
                                        <div className={styles.cardTitle}>{title}</div>
                                    </div>
                                    <div className={styles.cardText}>{text}</div>
                                </div>
                            ))}
                        </Reveal>
                    </section>

                    {/* (05) FAQ */}
                    <section id="faq" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>05 — Dudas</span>
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
                    <Info size={20} strokeWidth={2.25} className={styles.disclaimerIcon} />
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
