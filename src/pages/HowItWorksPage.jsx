import { useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    ClipboardList, Cpu, Salad, LineChart, ChevronRight, ArrowRight, Check,
    ShieldCheck, Gauge, Repeat, Soup, CalendarClock, Info,
} from 'lucide-react';
import styles from './Engine.module.css';

/* [P3-DETAIL-PAGES · 2026-06-29] Página de detalle de "Cómo funciona" (el método
   end-to-end). Amplía la sección del landing con todos los detalles del proceso, las
   guardas de calidad y la adaptación longitudinal. Contenido real basado en el motor;
   honesto (sin prometer resultados). Pública, indexable, bajo <Layout>. */

const STATS = [
    { num: '20+', label: 'Variables de entrada' },
    { num: 'V4', label: 'Motor DeepSeek' },
    { num: '17', label: 'Micronutrientes vs DRI' },
    { num: '7/15/30', label: 'días · recálculo del plan' },
];

const STAGES = [
    {
        Icon: ClipboardList, color: '#60A5FA',
        title: '1 · Perfil clínico-metabólico',
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
        title: '2 · Motor de inferencia',
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
        title: '3 · Calibración nutricional',
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
        title: '4 · Adaptación longitudinal',
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
    { q: '¿Puedo cambiar comidas que no me gustan?', a: 'Sí. Desde el coach IA puedes pedir cambiar un plato, regenerar un día completo o ajustar porciones — respetando tus macros y tu condición.' },
    { q: '¿Se adapta a mi condición de salud?', a: 'Sí. Diabetes, enfermedad renal, hipertensión, dislipidemia, embarazo, cirugía bariátrica y alergias IgE activan reglas específicas sobre cada comida.' },
    { q: '¿Necesito tarjeta para empezar?', a: 'No. El plan Gratis te deja descubrir el motor sin tarjeta. Puedes escalar cuando quieras.' },
];

const HowItWorksPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    useEffect(() => {
        const prev = document.title;
        document.title = 'Cómo funciona MealfitRD — el método, paso a paso';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
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
            </section>

            {/* Las 4 etapas */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Las 4 etapas del método</h2>
                <p className={styles.sectionLead}>
                    Cada plan recorre estas cuatro etapas. Lo que ves es un plato; lo que pasa
                    debajo es un pipeline con control de calidad en cada paso.
                </p>
                {STAGES.map((s) => (
                    <div key={s.title} className={styles.feature}>
                        <div className={styles.featureHead}>
                            <span className={styles.featureIcon} style={{ background: s.color }}>
                                <s.Icon size={24} strokeWidth={2} />
                            </span>
                            <div>
                                <div className={styles.featureTitle}>{s.title}</div>
                                <div className={styles.featureSub}>{s.sub}</div>
                            </div>
                        </div>
                        <p className={styles.featureText}>{s.text}</p>
                        <ul className={styles.bullets}>
                            {s.bullets.map(([b, rest]) => (
                                <li key={b} className={styles.bullet}>
                                    <Check size={16} strokeWidth={3} className={styles.bulletIcon} />
                                    <span><strong>{b}:</strong> {rest}</span>
                                </li>
                            ))}
                        </ul>
                        <div className={styles.tagRow}>
                            {s.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                        </div>
                    </div>
                ))}
            </section>

            {/* Pipeline técnico */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Qué ocurre cuando pulsas «Crear mi plan»</h2>
                <p className={styles.sectionLead}>
                    Del formulario a tu lista de compras, en cinco pasos.
                </p>
                <div className={styles.steps}>
                    {PIPELINE.map((step, i) => (
                        <div key={step.title} className={styles.step}>
                            <div className={styles.stepRail}>
                                <div className={styles.stepNum}>{i + 1}</div>
                                <div className={styles.stepLine} />
                            </div>
                            <div className={styles.stepBody}>
                                <div className={styles.stepTitle}>{step.title}</div>
                                <div className={styles.stepText}>{step.text}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Guardas de calidad */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Las guardas de calidad</h2>
                <p className={styles.sectionLead}>
                    Antes de entregarte un plan, el motor lo somete a una batería de guardas
                    deterministas. Si algo no cuadra, lo corrige o lo regenera.
                </p>
                <div className={styles.cards}>
                    {GUARDS.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Adaptación */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Se adapta contigo</h2>
                <p className={styles.sectionLead}>
                    Tu metabolismo se adapta: a medida que cambias, tu cuerpo ajusta cuánta energía gasta
                    —la termogénesis adaptativa que suele provocar las mesetas—. Por eso tu plan no es fijo:
                    se recalcula con tus datos actuales. Tres formas en que evoluciona contigo, sin empezar de cero.
                </p>
                <div className={styles.cards}>
                    {ADAPT.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* FAQ */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Preguntas frecuentes</h2>
                <div className={styles.faq}>
                    {FAQ.map((f) => (
                        <div key={f.q} className={styles.faqItem}>
                            <div className={styles.faqQ}>{f.q}</div>
                            <div className={styles.faqA}>{f.a}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Cross-links + disclaimer */}
            <section className={styles.section}>
                <div className={styles.disclaimer}>
                    <Info size={22} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>¿Quieres más?</strong> Mira <Link to="/funciones">todas las funciones</Link> de la
                        app, la <Link to="/precision">precisión que medimos</Link> o <Link to="/motor">el motor por
                        dentro</Link>. MealfitRD es una herramienta de apoyo nutricional, no un sustituto de un
                        profesional de la salud.
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className={styles.finalCta}>
                <h2 className={styles.finalTitle}>¿List@ para tu plan calculado?</h2>
                <p className={styles.finalText}>Responde unas preguntas y deja que el motor haga el resto.</p>
                <div className={styles.ctaRow}>
                    <Link to="/assessment" className={styles.ctaPrimary}>Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} /></Link>
                    <Link to="/precios" className={styles.ctaGhost}>Ver planes <ArrowRight size={18} strokeWidth={2.25} /></Link>
                </div>
            </section>
        </div>
    );
};

export default HowItWorksPage;
