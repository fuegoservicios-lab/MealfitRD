import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, ArrowRight, ChevronRight, Info } from 'lucide-react';
import styles from './Engine.module.css';

/**
 * [P3-ENGINE-INFO-PAGE · 2026-06-28 · imagen del modelo P3-ENGINE-MODEL-IMAGE 2026-07-01]
 * Página pública del motor de MealfitRD (v1.0.0), estilo "anuncio del modelo": header mínimo
 * + fecha + UNA imagen abstracta grande (emblema botánico model-v1) como hero. Contenido técnico
 * real y honesto: pipeline, capa clínica, precisión, comparativa vs un LLM solo (gráfico de
 * barras), aprendizaje a largo plazo (RAG), catálogo y disclaimer. Marketing (dark-only).
 * [P3-ENGINE-DIAGRAM-REMOVED · 2026-07-01] El diagrama SVG blueprint se eliminó a pedido
 * (redundante con los pasos + el gráfico). Su estética "blueprint" (.modelCanvas/.blueprint)
 * la reusa el gráfico comparativo.
 */

// [P3-ENGINE-MODEL-IMAGE · 2026-07-01] Fecha de publicación del modelo (editable).
const RELEASE_DATE = '1 de julio de 2026';

/* ───────────────────────────────── datos ───────────────────────────────── */

// [P3-ENGINE-MINIMAL · 2026-07-01] La fila de stats-tarjetas se eliminó (minimalismo);
// sus cifras viven en la prosa técnica y en las secciones (clínica, precisión).

// [P3-ENGINE-COMPARISON · 2026-07-01] Datos REALES del A/B interno (motor on vs off),
// mismos números que BenchmarkShowcase. N=8, jun 2026. "LLM solo" = pedirle el plan al
// modelo sin el motor determinista. Precisión = 100 − MAPE. "En banda" = 90-112% (95-105% kcal).
const VERSUS = [
    { label: 'Proteína', full: 'Precisión de proteína', mealfit: 98.5, llm: 84 },
    { label: '4 macros', full: 'Los 4 macros en banda', mealfit: 91.7, llm: 24 },
    { label: 'Recalcular', full: 'Cuadran al recalcular', mealfit: 100, llm: 0 },
];

const MACROS_PREC = [
    { label: 'Calorías', mape: 2.0 },
    { label: 'Grasas', mape: 3.1 },
    { label: 'Carbos', mape: 3.2 },
    { label: 'Proteína', mape: 1.5 },
];

const DIFF = [
    { m: 'Catálogo verificado', llm: 'x', mf: 'Solo alimentos catalogados con precio real; nunca inventa comida.' },
    { m: 'Motor de macros', llm: 'parcial', mf: 'Recalcula desde los gramos reales y reescala porciones para clavar el objetivo.' },
    { m: 'Piso de proteína', llm: 'x', mf: 'Rechaza y reintenta si un día cae por debajo de tu mínimo.' },
    { m: 'Banda de macros', llm: 'parcial', mf: 'Marca y reintenta las comidas fuera del rango objetivo.' },
    { m: 'Coherencia receta↔lista', llm: 'x', mf: 'La lista de compras siempre cuadra con las recetas.' },
    { m: 'Reglas clínicas (código)', llm: 'parcial', mf: 'Reescribe o bloquea el plan: KDIGO, ADA, anti-dumping, mercurio, alergias.' },
    { m: 'Micronutrientes vs DRI', llm: 'x', mf: 'Panel de 17 nutrientes con medidor de cobertura (informativo).' },
    { m: 'A prueba de fallos', llm: 'x', mf: 'Si el modelo falla, cae a un plan matemático — no se cuelga ni se cae.' },
];

/* Gráfico comparativo (barras agrupadas): MealfitRD vs LLM solo */
function ComparisonChart() {
    const W = 640;
    const H = 360;
    const padL = 46;
    const padR = 18;
    const padT = 44;
    const padB = 66;
    // [P3-ENGINE-CHART-HEADROOM · 2026-07-01] la escala llega hasta MAX (>100) para que el
    // 100% NO toque el borde superior: deja headroom estético arriba. Las gridlines siguen
    // en 0-100; el espacio 100→MAX es aire.
    const MAX = 118;
    const plotH = H - padT - padB;
    const baseY = padT + plotH;
    const plotW = W - padL - padR;
    const groupW = plotW / VERSUS.length;
    const bw = 38;
    const gap = 18;
    const yOf = (v) => baseY - (v / MAX) * plotH;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img"
            aria-label="Comparación de precisión de macros: MealfitRD frente a un LLM solo, en tres métricas.">
            {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                    <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} className={styles.chartGrid} />
                    <text x={padL - 8} y={yOf(v) + 3.5} className={styles.chartYLabel}>{v}</text>
                </g>
            ))}
            {VERSUS.map((d, i) => {
                const gx = padL + groupW * i + groupW / 2;
                const x1 = gx - bw - gap / 2;
                const x2 = gx + gap / 2;
                return (
                    <g key={d.label}>
                        <rect x={x1} y={yOf(d.mealfit)} width={bw} height={baseY - yOf(d.mealfit)} rx="3.5" className={styles.chartBarMf} />
                        <rect x={x2} y={yOf(d.llm)} width={bw} height={Math.max(0.5, baseY - yOf(d.llm))} rx="3.5" className={styles.chartBarLlm} />
                        <text x={x1 + bw / 2} y={yOf(d.mealfit) - 7} className={styles.chartVal}>{d.mealfit}%</text>
                        <text x={x2 + bw / 2} y={yOf(d.llm) - 7} className={styles.chartValDim}>{d.llm}%</text>
                        <text x={gx} y={baseY + 22} className={styles.chartXLabel}>{d.label}</text>
                    </g>
                );
            })}
            <g>
                <rect x={padL} y={14} width={12} height={12} rx="2.5" className={styles.chartBarMf} />
                <text x={padL + 18} y={24} className={styles.chartLegend}>MealfitRD</text>
                <rect x={padL + 122} y={14} width={12} height={12} rx="2.5" className={styles.chartBarLlm} />
                <text x={padL + 140} y={24} className={styles.chartLegend}>LLM solo</text>
            </g>
        </svg>
    );
}

const Engine = () => {
    useEffect(() => {
        const prev = document.title;
        document.title = 'Presentamos a Mealfit v1 — el motor de MealfitRD';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            {/* ---- intro + imagen abstracta del modelo ---- */}
            <section className={styles.intro}>
                <span className={styles.eyebrow}>
                    <Cpu size={14} strokeWidth={2.5} /> Motor
                </span>
                <h1 className={styles.title}>
                    Presentamos a <span className={styles.accent}>Mealfit v1</span>
                </h1>
                <div className={styles.releaseMeta}>
                    <span className={styles.releaseDate}>{RELEASE_DATE}</span>
                </div>

                {/* imagen del modelo v1.0 (emblema) */}
                <figure className={styles.modelFigure}>
                    <div className={styles.modelImgWrap}>
                        <picture>
                            <source srcSet="/model-v1.webp" type="image/webp" />
                            <img
                                src="/model-v1.jpeg"
                                alt="Emblema del modelo MealfitRD v1.0: un mandala de alimentos y botánicos dominicanos alrededor del logotipo «v1.0»."
                                className={styles.modelImg}
                                width="671"
                                height="671"
                                loading="eager"
                                decoding="async"
                            />
                        </picture>
                    </div>
                </figure>

                <p className={styles.lead}>
                    Cada plan pasa por un pipeline de generación con IA y una capa de
                    validación clínica y de coherencia. Esto es lo que ocurre por dentro —
                    contado con honestidad.
                </p>
            </section>

            {/* ---- arquitectura (prosa técnica) ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>01 / arquitectura</span>
                <h2 className={styles.sectionTitle}>Cómo funciona por dentro</h2>
                <div className={styles.prose}>
                    <p>
                        MealfitRD v1.0 no es «un LLM y ya»: es un <strong>sistema híbrido</strong>.
                        Un modelo de lenguaje —DeepSeek V4— propone los platos día por día, y una
                        <strong> capa determinista</strong> (un orquestador por grafos de estados)
                        los valida y corrige. La generación ocurre por <strong>bloques en
                        paralelo</strong>; cada bloque pasa por un revisor que verifica esquema,
                        macros y reglas clínicas, y se <strong>reintenta hasta tres veces</strong>{' '}
                        usando el rechazo como retroalimentación. Si el proveedor del modelo falla,
                        un <em>circuit breaker</em> cae a un plan calculado matemáticamente — el
                        motor nunca se cuelga ni se cae.
                    </p>
                    <p>
                        El modelo solo trabaja con un <strong>catálogo verificado</strong> de
                        alimentos dominicanos con datos nutricionales reales: nunca inventa comida
                        que no exista. Sobre ese catálogo, un motor de optimización
                        <strong> recalcula los macros desde los gramos reales</strong> de cada
                        ingrediente y reescala las porciones para clavar tus objetivos —con un error
                        medio de apenas <strong>±3.2% en el peor macro</strong>—, compara el plan
                        contra 17 micronutrientes y cuadra la lista de compras con las recetas.
                        Según tu plan, la generación usa DeepSeek V4 <strong>flash</strong> (gratis)
                        o <strong>pro</strong> (planes de pago), priorizando siempre el costo más
                        bajo ante cualquier duda.
                    </p>
                </div>
            </section>

            {/* ---- capa clínica ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>02 / capa clínica</span>
                <h2 className={styles.sectionTitle}>La capa clínica</h2>
                <div className={styles.prose}>
                    <p>
                        Si declaras una condición o una alergia, el motor aplica reglas específicas
                        sobre cada comida: no es solo un prompt, son guardas deterministas que se
                        ejecutan sobre el plan.
                    </p>
                    <p>
                        En diabetes (DM2) controla el índice glucémico y la fibra mínima por caloría,
                        con criterios tipo ADA. En enfermedad renal topa la proteína según KDIGO
                        —0.8 g/kg, o 1.2 con diálisis— ajustada a tu peso. En hipertensión vigila el
                        sodio de todo el plan; en dislipidemia cambia las grasas saturadas por
                        opciones más magras; y en cirugía bariátrica aplica reglas anti-dumping con
                        topes de porción y de volumen. En embarazo y lactancia cuida el mercurio de
                        los pescados y evita el déficit calórico. Con alergias IgE elimina el
                        alérgeno por completo, incluidos derivados; considera interacciones de
                        medicamentos (como warfarina ↔ vitamina K); y en seguridad alimentaria evita
                        el huevo y los mariscos crudos de riesgo, priorizando la cocción segura.
                    </p>
                </div>
            </section>

            {/* ---- precisión ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>03 / precisión</span>
                <h2 className={styles.sectionTitle}>La precisión que medimos</h2>
                <div className={styles.prose}>
                    <p>
                        No basta con que se vea bien: el motor verifica que los números cuadren.
                        Mantiene la proteína, los carbohidratos, las grasas y las calorías dentro de
                        una banda objetivo —medido, no a ojo—; compara tu plan contra 17
                        micronutrientes frente a las referencias diarias (DRI), con un medidor de
                        cobertura; y cuida la coherencia receta↔lista: si una receta pide 200 g de
                        pollo, la lista de compras tiene ≈200 g × tu hogar, sin ingredientes fantasma.
                    </p>
                </div>
            </section>

            {/* ---- comparativa vs un LLM solo ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>04 / vs un LLM solo</span>
                <h2 className={styles.sectionTitle}>Por qué no es «un LLM y ya»</h2>
                <p className={styles.sectionLead}>
                    Le medimos al motor lo que aporta: encendemos y apagamos su capa determinista
                    sobre el mismo modelo. En precisión de macros, la diferencia es directa.
                </p>
                <figure className={styles.chartFigure}>
                    <div className={`${styles.modelCanvas} ${styles.blueprint}`}>
                        <ComparisonChart />
                    </div>
                    <figcaption className={styles.modelCaption}>
                        Precisión de macros — A/B interno (motor encendido vs apagado)
                    </figcaption>
                </figure>
                <p className={styles.chartNote}>
                    Medición continua sobre planes reales (N=8, jun 2026). «LLM solo» = pedirle el
                    plan al modelo sin el motor. Precisión = 100 − error medio (MAPE); «en banda» =
                    90-112% del objetivo (95-105% en calorías). Compara enfoques, no productos con
                    nombre — y son métricas de precisión, no de corrección clínica.
                </p>

                {/* precisión por macro */}
                <div className={styles.macroBars}>
                    {MACROS_PREC.map((mp) => {
                        const prec = +(100 - mp.mape).toFixed(1);
                        return (
                            <div key={mp.label} className={styles.macroBar}>
                                <div className={styles.macroBarLabel}>{mp.label}</div>
                                <div className={styles.macroBarTrack}>
                                    <span className={styles.macroBarFill} style={{ width: `${prec}%` }} />
                                </div>
                                <div className={styles.macroBarVal}>{prec}%</div>
                            </div>
                        );
                    })}
                </div>

                {/* tabla de diferenciadores */}
                <div className={styles.cmpTableWrap}>
                    <table className={styles.cmpTable}>
                        <thead>
                            <tr>
                                <th>Mecanismo determinista</th>
                                <th>LLM solo</th>
                                <th className={styles.cmpColHi}>MealfitRD</th>
                            </tr>
                        </thead>
                        <tbody>
                            {DIFF.map((d) => (
                                <tr key={d.m}>
                                    <td>{d.m}</td>
                                    <td className={styles.cmpBad}>{d.llm === 'x' ? '✗ no lo hace' : '~ parcial'}</td>
                                    <td className={styles.cmpColHi}>{d.mf}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ---- aprendizaje a largo plazo ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>05 / memoria</span>
                <h2 className={styles.sectionTitle}>Aprendizaje a largo plazo</h2>
                <div className={styles.prose}>
                    <p>
                        <strong>Qué recuerda.</strong> En los planes de pago (Básico, Plus y Ultra),
                        el coach no empieza de cero cada vez. Mientras conversas, un extractor destila
                        «hechos» estables sobre ti —lo que te gusta, lo que rechazas, tus hábitos y,
                        de forma prioritaria, tus alergias y condiciones— y los guarda como memoria
                        persistente ligada solo a tu cuenta. No archiva la conversación entera: se
                        queda con las conclusiones.
                    </p>
                    <p>
                        <strong>Cómo lo recupera.</strong> Cada hecho se indexa con un embedding
                        vectorial (Cohere Embed v4, 1536 dimensiones): una representación numérica de
                        su significado. Al volver, el motor trae los hechos más afines a lo que estás
                        pidiendo por cercanía semántica —por lo que quieres decir, no por la palabra
                        exacta— y solo los más relevantes entran al prompt del coach. La consulta y el
                        contenido guardado se embeben de forma asimétrica, una palanca de precisión
                        para que la búsqueda acierte.
                    </p>
                    <p>
                        <strong>Consolidación offline (el «Dreaming»).</strong> La memoria en vivo solo
                        ve unos pocos hechos por consulta; nunca cruza todo tu historial. Por eso un
                        proceso nocturno recorre tu memoria completa: fusiona preferencias repetidas
                        en un solo hecho canónico —de forma reversible, nunca borra en firme—, pondera
                        cada hecho por relevancia y deja que lo que dejas de reforzar pierda peso con
                        el tiempo, detecta contradicciones entre sesiones y sintetiza un «modelo de ti»
                        de alto nivel que resume quién eres para el motor. Cada frase de ese modelo va
                        anclada a hechos reales y verificados tuyos, para que no invente nada. Este
                        proceso ya está construido y se enciende por fases.
                    </p>
                    <p>
                        <strong>Tus salvaguardas.</strong> Tus alergias y condiciones médicas quedan
                        exentas de todo lo anterior: nunca se fusionan ni pierden peso, y su prioridad
                        se fija siempre al máximo (por diseño, fallan del lado seguro). Tu memoria vive
                        por cuenta —jamás se cruza con la de otro usuario ni se usa para entrenar
                        modelos de terceros— y puedes pausarla cuando quieras desde Ajustes.
                    </p>
                </div>
            </section>

            {/* ---- catálogo + nevera ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>06 / catálogo</span>
                <h2 className={styles.sectionTitle}>Catálogo real y Nevera Inteligente</h2>
                <div className={styles.prose}>
                    <p>
                        El motor solo usa alimentos de un catálogo de más de 200 productos
                        dominicanos con datos nutricionales reales, curados desde USDA: nada
                        inventado. La lista de compras se calcula por tamaño de envase con precios
                        reales de supermercado en RD$, para que el plan quepa en tu presupuesto. Y
                        con la Nevera Inteligente marcas «ya compré la lista» y, al renovar, el motor
                        reúsa lo que te sobró y te pide solo lo que falta para tener tu nevera al 100%.
                    </p>
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
