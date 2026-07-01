import { useEffect, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    Microscope, ChevronRight, ArrowRight, Check, ShieldCheck, Lock,
    Ban, Sliders, BrainCircuit, Fingerprint, Info, Plus,
} from 'lucide-react';
// Comparte el design system minimalista-científico de "Cómo funciona" y "Funciones".
import styles from './HowItWorksPage.module.css';

/* [P3-RESEARCH-PAGE-SCIENTIFIC · 2026-06-30] Rediseño de "Investigación": deja de verse
   como una política (LegalLayout con badge de fecha + prosa) y adopta la clave minimalista-
   científica del resto del sitio — columna única centrada, secciones numeradas, figuras
   abstractas SVG line-art sobre cuadrícula (papel milimetrado), una sola gama (indigo +
   neutros), FAQ acordeón y reveals sutiles. CONSERVA el 100% de la sustancia legal del
   documento anterior (metricas agregadas, anonimización, exención de datos sensibles bajo
   Ley 172-13 + consentimiento, no-venta, no-entrenamiento, opt-out, base legal). Sustituye
   la presentación, no el contenido. La fecha de vigencia se conserva de forma discreta en
   el cierre en vez del badge de política. */

/* ─────────────────────── figuras abstractas (SVG line-art) ─────────────────────
   Reusan las clases .fig* del módulo compartido (stroke/fill vía tokens → theme-aware).
   Geometría determinista; sin dependencias. */

function FigHero() {
    // Distribución sobre muchos planes + curva ajustada (la "señal" del agregado).
    const bars = [26, 46, 72, 100, 116, 100, 72, 46, 26];
    const base = 172;
    const x0 = 68;
    const step = 62;
    const bw = 44;
    const curve = bars.map((h, i) => `${x0 + i * step + bw / 2},${base - h}`).join(' ');
    const scatter = [[120, 40], [300, 34], [470, 44], [210, 58], [560, 52]];
    return (
        <svg viewBox="0 0 680 200" className={styles.heroSvg} role="img" aria-label="Distribución de métricas sobre muchos planes con una señal agregada">
            <line x1="30" y1={base} x2="650" y2={base} className={styles.figLine} />
            {bars.map((h, i) => (
                <rect
                    key={i}
                    x={x0 + i * step}
                    y={base - h}
                    width={bw}
                    height={h}
                    rx="4"
                    className={i === 4 ? styles.figFill : styles.figLine}
                />
            ))}
            {scatter.map(([x, y]) => <circle key={`s${x}`} cx={x} cy={y} r="2" className={styles.figDot} />)}
            <polyline points={curve} className={styles.figAccent} />
            <circle cx={x0 + 4 * step + bw / 2} cy={base - 116} r="11" className={styles.figAccent} />
            <circle cx={x0 + 4 * step + bw / 2} cy={base - 116} r="4" className={styles.figDotAccent} />
        </svg>
    );
}

function FigStudy() {
    // Precisión: puntos que caen cerca del centro (objetivos), con un par de valores atípicos.
    const cx = 110;
    const cy = 110;
    const near = [[110, 110], [100, 98], [122, 104], [104, 122], [120, 120], [96, 112], [114, 92]];
    const out = [[152, 70], [74, 150]];
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Medición de precisión: los planes caen cerca de sus objetivos">
            {[28, 54, 80].map((r) => <circle key={r} cx={cx} cy={cy} r={r} className={styles.figLine} />)}
            <line x1={cx} y1={cy - 88} x2={cx} y2={cy + 88} className={styles.figDash} />
            <line x1={cx - 88} y1={cy} x2={cx + 88} y2={cy} className={styles.figDash} />
            {out.map(([x, y]) => <circle key={`o${x}`} cx={x} cy={y} r="3" className={styles.figDot} />)}
            {near.map(([x, y]) => <circle key={`n${x}-${y}`} cx={x} cy={y} r="3.2" className={styles.figDotAccent} />)}
            <circle cx={cx} cy={cy} r="6.5" className={styles.figAccent} />
        </svg>
    );
}

function FigProtect() {
    // Anonimización: una identidad distinta se disuelve en un conjunto anónimo indistinto.
    const cluster = [];
    [128, 152, 176].forEach((x) => [74, 104, 134].forEach((y) => cluster.push([x, y])));
    return (
        <svg viewBox="0 0 220 220" className={styles.figSvg} role="img" aria-label="Anonimización: tu identidad se disocia en un conjunto agregado">
            {[80, 104, 140].map((y) => <line key={y} x1="70" y1="110" x2="112" y2={y} className={styles.figMuted} />)}
            <circle cx="50" cy="110" r="16" className={styles.figAccent} />
            <circle cx="50" cy="110" r="5" className={styles.figDotAccent} />
            <rect x="112" y="58" width="90" height="94" rx="12" className={styles.figDash} />
            {cluster.map(([x, y]) => <circle key={`c${x}-${y}`} cx={x} cy={y} r="4" className={styles.figDot} />)}
        </svg>
    );
}

/* ──────────────────────────────── datos ──────────────────────────────── */

const STATS = [
    { num: '0', label: 'datos tuyos vendidos o cedidos' },
    { num: '0', label: 'usados para entrenar modelos de IA' },
    { num: '100%', label: 'anónimo o agregado, por defecto' },
    { num: '1', label: 'correo para oponerte (opt-out)' },
];

const STAGES = [
    {
        Fig: FigStudy, figLabel: 'Precisión medida',
        kicker: '01 — Qué estudiamos',
        title: 'Medimos el sistema, no a las personas',
        sub: 'Del uso real a un mejor plan',
        text: 'Analizamos cómo se comporta MealfitRD sobre datos reales para hacerlo más preciso y seguro. El foco es el sistema y sus resultados, nunca perfilarte a ti.',
        bullets: [
            ['Precisión del motor', 'medimos qué tan cerca quedan los planes de sus objetivos de macronutrientes, la tasa de éxito y los errores, para calibrar el sistema.'],
            ['Patrones nutricionales agregados', 'entendemos tendencias generales —p. ej. la cobertura de micronutrientes en una población de planes— para mejorar reglas y catálogos.'],
            ['Calidad y seguridad', 'detectamos combinaciones problemáticas, sesgos o fallos para hacer el servicio más seguro.'],
        ],
        tags: ['Métricas agregadas', 'Calibración', 'Sin perfilar personas'],
    },
    {
        Fig: FigProtect, figLabel: 'Datos disociados',
        kicker: '02 — Cómo protegemos tus datos',
        title: 'Anónimo por diseño, mínimo por principio',
        sub: 'Y tu salud, con protección reforzada',
        text: 'Trabajamos con datos que no te identifican y usamos solo lo estrictamente necesario. Tu información de salud recibe un cuidado adicional.',
        bullets: [
            ['Anónimo o agregado', 'preferimos métricas y estadísticas disociadas de tu identidad, del tipo «el X% de los planes quedó dentro de la banda de proteína».'],
            ['Minimización', 'usamos únicamente los datos mínimos necesarios para la finalidad de mejora — nada más.'],
            ['Datos de salud, exentos por defecto', 'tu perfil de salud (condiciones, alergias, peso) es dato sensible bajo la Ley 172-13: no lo usamos de forma identificable para investigación sin tu consentimiento expreso.'],
        ],
        tags: ['Seudonimización', 'Ley 172-13', 'Consentimiento para lo sensible'],
    },
];

const NOT_DO = [
    { Icon: Ban, title: 'No vendemos tus datos', text: 'Nunca vendemos ni cedemos tus datos a terceros con fines comerciales o publicitarios.' },
    { Icon: BrainCircuit, title: 'No entrenamos IA con ellos', text: 'No usamos tus datos para entrenar modelos de inteligencia artificial, ni propios ni de terceros.' },
    { Icon: Fingerprint, title: 'No publicamos nada identificable', text: 'Cualquier hallazgo que difundamos es agregado y anónimo — nunca información que permita reconocerte.' },
];

const CONTROL = [
    { Icon: Sliders, title: 'Opt-out cuando quieras', text: 'Puedes oponerte a que tus datos —incluso anonimizados— se usen para mejora del producto, escribiendo a fuego.servicios@gmail.com. No afecta tu servicio.' },
    { Icon: Lock, title: 'La memoria del coach es tuya', text: 'Lo que el asistente recuerda de tus gustos y tu progreso es personalización privada de tu cuenta; no se cruza ni se agrega con la de otras personas.' },
    { Icon: ShieldCheck, title: 'Base legal clara', text: 'La mejora del producto se ampara en interés legítimo sobre datos no sensibles o disociados. Para cualquier estudio con datos sensibles identificables, la base es tu consentimiento expreso.' },
];

const FAQ = [
    { q: '¿Usan mis datos de salud para investigar?', a: 'No de forma identificable sin tu permiso. Tu perfil de salud es dato sensible (Ley 172-13); por defecto solo trabajamos con datos disociados de tu identidad. Un estudio con datos identificables requeriría tu consentimiento expreso y separado, y podrías negarte sin afectar tu servicio.' },
    { q: '¿Entrenan la IA con lo que escribo o con mi plan?', a: 'No. No usamos tus datos para entrenar modelos de IA, ni propios ni de terceros. El modelo generativo base es de un proveedor externo y tampoco le cedemos tus datos para entrenamiento.' },
    { q: '¿Cómo me opongo a que usen mis datos para mejorar el producto?', a: 'Escríbenos a fuego.servicios@gmail.com y lo aplicamos. Oponerte no afecta tu capacidad de usar MealfitRD. También puedes ejercer el resto de tus derechos según la Política de Protección de Datos.' },
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

const ResearchPage = () => {
    const reduce = useReducedMotion();
    const [openFaq, setOpenFaq] = useState(0);

    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    useEffect(() => {
        const prev = document.title;
        document.title = 'Investigación en MealfitRD — mejoramos sin exponerte';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            {/* ───────────────── hero ───────────────── */}
            <header className={styles.hero}>
                <span className={styles.eyebrow}><Microscope size={14} strokeWidth={2.5} /> Investigación</span>
                <h1 className={styles.title}>
                    Aprendemos del <span className={styles.accent}>agregado</span>, no de ti.
                </h1>
                <p className={styles.lead}>
                    Para mejorar tu plan analizamos cómo funciona el sistema sobre datos reales
                    —medidos, anonimizados y bajo tu control—, nunca tu identidad ni tus datos de
                    salud sin tu permiso.
                </p>

                <Reveal className={styles.heroFigure} delay={0.1}>
                    <div className={`${styles.heroCanvas} ${styles.grid}`}>
                        <FigHero />
                    </div>
                    <div className={styles.heroCaption}>
                        <span>Fig. 00 — de muchos planes, una señal</span>
                        <span>medición → anonimización → mejora</span>
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

            {/* ───────────────── etapas: qué estudiamos + cómo protegemos ───────────────── */}
            <div className={styles.layout}>
                <div className={styles.content}>
                    <section id="metodo" className={styles.block}>
                        <div className={styles.stages}>
                            {STAGES.map((s) => (
                                <Reveal key={s.title} className={styles.stage}>
                                    <div className={styles.stageBody}>
                                        <span className={styles.stageKicker}>{s.kicker}</span>
                                        <h2 className={styles.stageTitle}>{s.title}</h2>
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
                                        <figcaption className={styles.figCaption}>{s.figLabel}</figcaption>
                                    </figure>
                                </Reveal>
                            ))}
                        </div>
                    </section>

                    {/* lo que NO hacemos */}
                    <section id="limites" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>03 — Límites</span>
                            <h2 className={styles.secTitle}>Lo que nunca hacemos</h2>
                            <p className={styles.secLead}>
                                Tres líneas que no cruzamos, pase lo que pase con la investigación.
                            </p>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsThree}`}>
                            {NOT_DO.map(({ Icon, title, text }) => (
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

                    {/* tu control */}
                    <section id="control" className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>04 — Tu control</span>
                            <h2 className={styles.secTitle}>Tú decides</h2>
                            <p className={styles.secLead}>
                                Puedes oponerte cuando quieras, tu memoria es privada, y todo se apoya
                                en una base legal explícita.
                            </p>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsThree}`}>
                            {CONTROL.map(({ Icon, title, text }) => (
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

                    {/* FAQ */}
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

            {/* ───────────────── cierre: nota + CTA ───────────────── */}
            <div className={styles.closing}>
                <Reveal className={styles.disclaimer}>
                    <Info size={20} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>Vigente desde el 30 de junio de 2026.</strong> Para el detalle completo de tus
                        derechos, lee la <Link to="/data-protection">Política de Protección de Datos</Link> y la{' '}
                        <Link to="/privacy">Política de Privacidad</Link>. ¿Preguntas sobre cómo investigamos?
                        Escríbenos a <strong>fuego.servicios@gmail.com</strong>.
                    </div>
                </Reveal>

                <Reveal className={styles.finalCta}>
                    <h2 className={styles.finalTitle}>Mejoramos sin exponerte</h2>
                    <p className={styles.finalText}>Cada análisis busca un mejor plan para ti, cuidando tu privacidad y tus datos de salud.</p>
                    <div className={styles.ctaRow}>
                        <Link to="/assessment" className={styles.ctaPrimary}>Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} /></Link>
                        <Link to="/data-protection" className={styles.ctaGhost}>Protección de Datos <ArrowRight size={18} strokeWidth={2.25} /></Link>
                    </div>
                </Reveal>
            </div>
        </div>
    );
};

export default ResearchPage;
