import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Cpu, ShieldCheck, Activity, ScanSearch, Refrigerator,
    HeartPulse, Droplets, Scale, Baby, FlaskConical, Pill, Egg,
    Gauge, ListChecks, ArrowRight, ChevronRight, Sparkles, Info,
} from 'lucide-react';
import styles from './Engine.module.css';

/**
 * [P3-ENGINE-INFO-PAGE · 2026-06-28] Página pública informativa del motor de
 * MealfitRD (v1.0.0). Explica el pipeline de generación, la capa clínica, la
 * precisión y la honestidad del producto. Contenido REAL (basado en el motor) y
 * calibrado: describe mecanismos sin prometer precisión clínica absoluta + incluye
 * disclaimer. Vive en el apex (público, indexable) bajo <Layout>.
 */

const STATS = [
    { num: '200+', label: 'Alimentos verificados' },
    { num: '17', label: 'Micronutrientes vs DRI' },
    { num: '100%', label: 'Ingredientes verificados' },
    { num: 'V4', label: 'Motor DeepSeek' },
];

const PIPELINE = [
    { title: 'Tu perfil', text: 'Objetivo, datos biométricos, condiciones de salud, alergias, presupuesto y lo que te gusta (o no). Todo entra al motor.' },
    { title: 'Cálculo de objetivos', text: 'Estimamos tus calorías diarias (gasto energético) y tus macros — proteína, carbohidratos y grasas — según tu meta.' },
    { title: 'Generación con IA', text: 'DeepSeek V4 arma los platos día por día usando SOLO alimentos del catálogo verificado. El motor nunca inventa comida que no exista.' },
    { title: 'Validación', text: 'Cada comida pasa por guardas: piso de proteína, banda de macros, variedad, coherencia receta↔lista y la capa clínica según tu perfil.' },
    { title: 'Entrega', text: 'Tu plan completo + una lista de compras costeada con precios reales de supermercado dominicano (RD$).' },
];

const CLINICAL = [
    { Icon: Droplets, title: 'Diabetes (DM2)', text: 'Control de índice glucémico y fibra mínima por caloría, siguiendo criterios tipo ADA.' },
    { Icon: FlaskConical, title: 'Enfermedad renal', text: 'Tope de proteína según KDIGO (0.8 g/kg, 1.2 si hay diálisis), ajustado a tu peso.' },
    { Icon: HeartPulse, title: 'Hipertensión', text: 'Control del sodio a lo largo de todo el plan.' },
    { Icon: Activity, title: 'Dislipidemia', text: 'Sustituye grasas saturadas por opciones más magras.' },
    { Icon: Scale, title: 'Cirugía bariátrica', text: 'Reglas anti-dumping, tope de porciones y de volumen por comida.' },
    { Icon: Baby, title: 'Embarazo y lactancia', text: 'Cuida el mercurio de los pescados y evita el déficit calórico.' },
    { Icon: ShieldCheck, title: 'Alergias (IgE)', text: 'Elimina el alérgeno por completo — incluidos derivados — y sustituye de forma segura.' },
    { Icon: Pill, title: 'Medicamentos', text: 'Considera interacciones como warfarina ↔ vitamina K según tu tratamiento.' },
    { Icon: Egg, title: 'Seguridad alimentaria', text: 'Sin huevo crudo ni mariscos crudos de riesgo: prioriza cocción segura.' },
];

const PRECISION = [
    { Icon: Gauge, title: 'Macros en banda', text: 'Proteína, carbohidratos, grasas y calorías dentro de un rango objetivo. Medido, no a ojo.' },
    { Icon: ScanSearch, title: '17 micronutrientes', text: 'Comparamos tu plan contra las referencias diarias (DRI) con un medidor de cobertura.' },
    { Icon: ListChecks, title: 'Coherencia receta↔lista', text: 'Si una receta pide 200 g de pollo, la lista de compras tiene ≈200 g × tu hogar. Sin ingredientes fantasma.' },
];

const Engine = () => {
    useEffect(() => {
        const prev = document.title;
        document.title = 'El motor de MealfitRD — cómo funciona';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            {/* ---- intro ---- */}
            <section className={styles.intro}>
                <span className={styles.eyebrow}>
                    <Cpu size={14} strokeWidth={2.5} /> Motor v1.0.0
                </span>
                <h1 className={styles.title}>
                    No adivinamos tu plato.<br />
                    Lo <span className={styles.accent}>calculamos</span>.
                </h1>
                <p className={styles.lead}>
                    Cada plan de MealfitRD pasa por un pipeline de generación con IA y una
                    capa de validación clínica y de coherencia. Esto es lo que ocurre por
                    dentro — contado con honestidad.
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

            {/* ---- pipeline ---- */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Cómo nace tu plan</h2>
                <p className={styles.sectionLead}>
                    Del formulario a tu lista de compras, en cinco pasos. Cada uno con su
                    propia capa de control de calidad.
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

            {/* ---- capa clínica ---- */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>La capa clínica</h2>
                <p className={styles.sectionLead}>
                    Si declaras una condición o una alergia, el motor aplica reglas
                    específicas sobre cada comida — no es solo un prompt, son guardas
                    deterministas que se ejecutan sobre el plan.
                </p>
                <div className={styles.cards}>
                    {CLINICAL.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ---- precisión ---- */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>La precisión que medimos</h2>
                <p className={styles.sectionLead}>
                    No basta con que se vea bien: el motor verifica que los números cuadren.
                </p>
                <div className={styles.cards}>
                    {PRECISION.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ---- catálogo + nevera ---- */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Catálogo real y Nevera Inteligente</h2>
                <div className={styles.cards}>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><Sparkles size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>200+ alimentos verificados</div>
                        <div className={styles.cardText}>
                            Productos dominicanos con datos nutricionales reales (curados desde
                            USDA). El motor solo usa alimentos de este catálogo: nada inventado.
                        </div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><ListChecks size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>Lista costeada de verdad</div>
                        <div className={styles.cardText}>
                            La lista de compras se calcula por tamaño de envase con precios reales
                            de supermercado RD$ — para que el plan quepa en tu presupuesto.
                        </div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><Refrigerator size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>Nevera Inteligente</div>
                        <div className={styles.cardText}>
                            Marcas “ya compré la lista” y, al renovar, el motor reusa lo que te
                            sobró y te pide SOLO lo que falta para tener tu nevera al 100%.
                        </div>
                    </div>
                </div>
            </section>

            {/* ---- honestidad ---- */}
            <section className={styles.section}>
                <div className={styles.disclaimer}>
                    <Info size={22} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>Con los pies en la tierra.</strong> MealfitRD es una herramienta
                        de apoyo nutricional, no un sustituto de un nutricionista o médico. El motor
                        aplica criterios fundamentados en evidencia, pero recomendamos revisión
                        profesional cuando tu condición lo amerita. Las cantidades y micronutrientes
                        son estimaciones, no mediciones de laboratorio.
                    </div>
                </div>
            </section>

            {/* ---- CTA final ---- */}
            <section className={styles.finalCta}>
                <h2 className={styles.finalTitle}>¿List@ para tu plan calculado?</h2>
                <p className={styles.finalText}>
                    Responde unas preguntas y deja que el motor haga el resto — en minutos.
                </p>
                <div className={styles.ctaRow}>
                    <Link to="/assessment" className={styles.ctaPrimary}>
                        Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} />
                    </Link>
                    <Link to="/" className={styles.ctaGhost}>
                        Volver al inicio <ArrowRight size={18} strokeWidth={2.25} />
                    </Link>
                </div>
            </section>
        </div>
    );
};

export default Engine;
