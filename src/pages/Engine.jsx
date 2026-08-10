import { useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, Info } from 'lucide-react';
// [P2-PAPER-NO-INK · 2026-08-02, Task 13] Banda de cierre: última hija de las 6
// rutas papel. Componente propio, NUNCA dentro de Footer.jsx — el footer se
// renderiza en 21 rutas, incluidas las 10 legales (ver ClosingBand.jsx).
// Sustituye a la `<section className={styles.finalCta}>` que cerraba la página:
// pedía el mismo clic, con el mismo literal, justo antes de la banda.
// `ChevronRight` y `ArrowRight` salieron del import con ella. `Link` VOLVIÓ en
// fix1: al quitar el bloque, esta página se quedó con cero enlaces en el cuerpo
// (su disclaimer era prosa plana) — ver el comentario del disclaimer abajo.
import ClosingBand from '../components/home/ClosingBand';
// [P1-PAPER-BENCHMARK · 2026-08-02] Las cifras vienen del SSOT. Esta página era
// el TERCER sitio donde estaban escritas a mano (las otras dos:
// `components/home/BenchmarkShowcase.jsx` y `pages/PrecisionPage.jsx`), y el
// drift era a tres bandas, no a dos: aquí y en el landing decía `llm: 0`, en
// /precision decía `llm: 55`. El dueño fijó el 0 el 2026-08-02.
import { VERSUS, MACROS, BANDS, SERIES, HEADLINE_FIGURES, es1, CLINICAL, CLINICAL_DELIVERY_PCT } from '../data/benchmark';
import styles from './Engine.module.css';

/**
 * [P3-ENGINE-INFO-PAGE · 2026-06-28 · imagen del modelo P3-ENGINE-MODEL-IMAGE 2026-07-01]
 * Página pública del motor de Bioboros (v1.0.0), estilo "anuncio del modelo": header mínimo
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

// [P3-ENGINE-COMPARISON · 2026-07-01 · repuntado al SSOT P1-PAPER-BENCHMARK · 2026-08-02]
// Datos REALES del A/B interno (motor on vs off). "LLM solo" = pedirle el plan al modelo
// sin el motor determinista. Precisión = 100 − MAPE. Ahora se leen de
// `src/data/benchmark.js`: `v.axis` es la etiqueta corta del eje X y `v.label` la larga.
//
// El gráfico pasa de TRES barras agrupadas a DOS, y no por estética: la tercera era
// «Cuadran al recalcular», 100 contra 0 — una capacidad BINARIA dibujada en el mismo eje
// 0-100 que un `100 − MAPE` y que un porcentaje de planes. Un eje compartido es una
// afirmación de comparabilidad; con esas tres magnitudes era falsa. La capacidad no se
// pierde: la fila «Motor de macros» de la tabla de diferencias de más abajo ya dice que
// el motor recalcula desde los gramos reales.

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

/* Gráfico comparativo (barras agrupadas): Bioboros vs LLM solo */
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
            aria-label="Comparación de precisión de macros: Bioboros frente a un LLM solo, en dos métricas.">
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
                    /* [P1-PAPER-BENCHMARK · 2026-08-02] `rx` fuera de las barras y de
                       los cuadros de la leyenda: eran `3.5` y `2.5`, las últimas
                       esquinas redondeadas de una ruta de papel. `border-radius: 0`
                       NO alcanza a un `<rect rx="…">` — es geometría del elemento, no
                       caja CSS, así que ningún escáner de CSS del repo las veía. */
                    <g key={d.key}>
                        <rect x={x1} y={yOf(d.mealfit)} width={bw} height={baseY - yOf(d.mealfit)} className={styles.chartBarMf} />
                        <rect x={x2} y={yOf(d.llm)} width={bw} height={Math.max(0.5, baseY - yOf(d.llm))} className={styles.chartBarLlm} />
                        <text x={x1 + bw / 2} y={yOf(d.mealfit) - 7} className={styles.chartVal}>{es1(d.mealfit)}%</text>
                        <text x={x2 + bw / 2} y={yOf(d.llm) - 7} className={styles.chartValDim}>{es1(d.llm)}%</text>
                        <text x={gx} y={baseY + 22} className={styles.chartXLabel}>{d.axis}</text>
                    </g>
                );
            })}
            <g>
                <rect x={padL} y={14} width={12} height={12} className={styles.chartBarMf} />
                <text x={padL + 18} y={24} className={styles.chartLegend}>Bioboros</text>
                <rect x={padL + 122} y={14} width={12} height={12} className={styles.chartBarLlm} />
                <text x={padL + 140} y={24} className={styles.chartLegend}>LLM solo</text>
            </g>
        </svg>
    );
}

const Engine = () => {
    // [P3-NEWS-1 · 2026-07-01] Al navegar aquí (p.ej. desde el anuncio en el landing, ya
    // scrolleado abajo) hay que arrancar en el tope: la navegación cliente no la toca
    // ScrollRestoration (cada página hace su propio scrollTo). useLayoutEffect → antes del paint.
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

    useEffect(() => {
        const prev = document.title;
        document.title = 'Presentamos a Bioboros v1 — el motor de Bioboros';
        return () => { document.title = prev; };
    }, []);

    return (
        <>
        <div className={styles.page}>
            {/* ---- intro + imagen abstracta del modelo ---- */}
            <section className={styles.intro}>
                <span className={styles.eyebrow}>
                    <Cpu size={14} strokeWidth={2.5} /> Motor
                </span>
                <h1 className={styles.title}>
                    Presentamos a <span className={styles.accent}>Bioboros v1</span>
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
                                alt="Emblema del modelo Bioboros v1.0: un mandala de alimentos y botánicos dominicanos alrededor del logotipo «v1.0»."
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
                        Bioboros v1.0 no es «un LLM y ya»: es un <strong>sistema híbrido</strong>.
                        Un modelo de lenguaje de última generación —su identidad es confidencial y
                        rota según rendimiento— propone los platos día por día, y una
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
                        medio de apenas <strong>±{es1(HEADLINE_FIGURES.worstMacroError)}% en el peor
                        macro</strong>—, compara el plan
                        contra 17 micronutrientes y cuadra la lista de compras con las recetas.
                        Según tu plan, la generación usa un modelo <strong>estándar</strong> (gratis)
                        o uno <strong>avanzado</strong> (planes de pago), priorizando siempre el costo
                        más bajo ante cualquier duda. Qué modelos exactos orquestamos es parte de
                        nuestra receta: los evaluamos y rotamos constantemente para darte el mejor
                        resultado con la misma barra de validación.
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
                    {/* [P1-LANDING-CLINICAL-FACTS · 2026-08-08] verificación medida — cifras del
                        SSOT CLINICAL (data/benchmark.js), jamás a mano. */}
                    <p>
                        Y no es una promesa: en {CLINICAL.monthLong} corrimos los {CLINICAL.n} perfiles
                        clínicos más difíciles del formulario contra el motor de producción real. El{' '}
                        {CLINICAL.safetyPct} % de los planes entregados salió sin una sola violación de
                        alérgenos, dieta o condición; el {CLINICAL_DELIVERY_PCT} % de los perfiles recibió
                        su plan al primer intento — y el resto no recibió un plan inseguro: el motor lo
                        rechazó y lo dijo. Preferimos no entregar antes que entregar mal. La versión
                        actual del motor (tras las {CLINICAL.currentEngine.fixesCount} mejoras del{' '}
                        {CLINICAL.currentEngine.dateLong}) entregó {CLINICAL.currentEngine.delivered} de{' '}
                        {CLINICAL.currentEngine.n} en su primera corrida.
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
                    {/* [P1-PAPER-BENCHMARK · 2026-08-02] Decía «Medición continua sobre
                        planes reales». No lo es, y el dueño ya aprobó retirar esa misma
                        afirmación del landing (spec §10.1): es una serie cerrada de 8
                        planes de junio. */}
                    Serie de {`N=${SERIES.n}`} planes reales, {SERIES.monthLong}. «LLM solo» = pedirle el
                    plan al modelo sin el motor. Precisión = 100 − error medio (MAPE); «en banda» ={' '}
                    {`${100 + BANDS.macros[0]}-${100 + BANDS.macros[1]}%`} del objetivo
                    {` (${100 + BANDS.kcal[0]}-${100 + BANDS.kcal[1]}% en calorías)`}. Compara enfoques, no productos con
                    nombre — y son métricas de precisión, no de corrección clínica.
                </p>

                {/* precisión por macro */}
                <div className={styles.macroBars}>
                    {MACROS.map((mp) => {
                        const prec = +(100 - mp.mape).toFixed(1);
                        return (
                            <div key={mp.key} className={styles.macroBar}>
                                <div className={styles.macroBarLabel}>{mp.label}</div>
                                <div className={styles.macroBarTrack}>
                                    <span className={styles.macroBarFill} style={{ width: `${prec}%` }} />
                                </div>
                                <div className={styles.macroBarVal}>{es1(prec)}%</div>
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
                                <th className={styles.cmpColHi}>Bioboros</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* [P1-MOTOR-TABLE-STACK · 2026-08-10] `data-label` lleva el
                                encabezado de cada columna. En escritorio no se usa; bajo
                                640px la tabla se apila y esos rótulos son los que dicen
                                a qué columna pertenece cada bloque, que en una tabla
                                normal lo dice la posición. Sin ellos, apilar convierte
                                la comparación en una lista de frases sueltas. */}
                            {DIFF.map((d) => (
                                <tr key={d.m}>
                                    <td data-label="Mecanismo">{d.m}</td>
                                    <td data-label="LLM solo" className={styles.cmpBad}>{d.llm === 'x' ? '✗ no lo hace' : '~ parcial'}</td>
                                    <td data-label="Bioboros" className={styles.cmpColHi}>{d.mf}</td>
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
                        <strong>Solo alimentos reales.</strong> El motor cocina únicamente con lo que
                        existe: un catálogo de más de 200 productos dominicanos con datos
                        nutricionales reales curados desde USDA, incluido un panel ampliado de 17
                        micronutrientes. No inventa alimentos: la generación está limitada al catálogo
                        y, si algo se cuela fuera de él, no llega a tu plan ni a tu lista de compras.
                        Nada de calorías inventadas ni ingredientes fantasma que después no encuentras
                        en el súper.
                    </p>
                    <p>
                        <strong>Precio de góndola, no una estimación.</strong> La lista no se costea
                        por gramos abstractos, sino por el envase real que de verdad compras —la funda,
                        la lata, la libra, el cartón, el pote— con precios de supermercado en RD$, y
                        eligiendo la presentación más económica para la cantidad que necesitas (así
                        aprovecha el descuento por volumen). Los productos estables se cuentan una sola
                        vez y los perecederos se multiplican por las semanas del ciclo, para que el
                        total refleje lo que pagarías en caja y el plan quepa en tu presupuesto.
                    </p>
                    <p>
                        <strong>La lista cuadra con las recetas.</strong> Un guardián de coherencia
                        revisa que todo lo que una receta usa aparezca en la lista, en la cantidad
                        correcta, y que no se cuele nada de más. Si una comida lleva pollo, la lista
                        pide ese pollo en la magnitud que toca; si algo no cuadra, el motor lo corrige
                        antes de entregarte el plan.
                    </p>
                    <p>
                        <strong>Nevera Inteligente.</strong> Cuando marcas «ya compré la lista», tu
                        nevera se llena y el motor pasa a saber qué tienes en casa. Al renovar el ciclo
                        reúsa lo que te sobró y te pide solo lo que falta para volver a dejar tu nevera
                        al 100%, para que no vuelvas a comprar la sal, el aceite o el arroz que ya
                        tienes.
                    </p>
                </div>
            </section>

            {/* ---- honestidad ---- */}
            <section className={styles.section}>
                <div className={styles.disclaimer}>
                    <Info size={22} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    {/* [P2-PAPER-NO-INK fix1 · 2026-08-02] Los enlaces contextuales de este
                        párrafo son la ÚNICA salida del cuerpo de /motor. Al retirar el
                        `.finalCta` local (lo sustituye <ClosingBand />) esta página se quedó
                        con CERO `<Link to=` en su cuerpo: el disclaimer, a diferencia del de
                        /como-funciona y /funciones, era prosa plana sin un solo enlace. La
                        banda de cierre aporta /assessment y /precios; lo que faltaba era el
                        camino lateral a las otras páginas del método. */}
                    <div className={styles.disclaimerText}>
                        <strong>Con los pies en la tierra.</strong> Bioboros es una herramienta
                        de apoyo nutricional, no un sustituto de un nutricionista o médico. El motor
                        aplica criterios fundamentados en evidencia, pero recomendamos revisión
                        profesional cuando tu condición lo amerita. Las cantidades y micronutrientes
                        son estimaciones, no mediciones de laboratorio. Si quieres el recorrido
                        completo, mira <Link to="/como-funciona">cómo funciona el método</Link> o
                        la <Link to="/precision">precisión que medimos</Link>.
                    </div>
                </div>
            </section>

        </div>
        <ClosingBand />
        </>
    );
};

export default Engine;
