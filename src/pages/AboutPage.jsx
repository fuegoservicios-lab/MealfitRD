import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import styles from './AboutPage.module.css';

/* [P3-ABOUT-PAGE-ABSTRACT · 2026-06-30] "Acerca de MealfitRD" con un lenguaje visual propio,
   intencionalmente distinto de las políticas (LegalLayout) y del marketing científico
   (papel milimetrado + figuras SVG). La atmósfera es 100% CSS —una aurora de gradientes en
   deriva, SIN imágenes— sobre tipografía editorial, numerales fantasma y layout asimétrico.
   El <title>/description de /about los fija RouteTitle (no self-managed). */

const HOW = [
    ['01', <><strong>Motor de orquestación</strong> — coordina la generación en varios pasos validados.</>],
    ['02', <><strong>Cálculo determinista de macros</strong> — cuadramos calorías y proteína con fórmulas, no a ojo.</>],
    ['03', <><strong>Guardas clínicas</strong> — ajustan el plan por condición (diabetes, renal, embarazo, bariátrica…).</>],
    ['04', <><strong>Motor de coherencia</strong> — la lista de compras concuerda con las recetas.</>],
    ['05', <><strong>Coach conversacional</strong> — responde, cambia comidas y registra tu consumo en tiempo real.</>],
];

const PRINCIPLES = [
    ['01', 'Precisión', 'Medimos qué tan cerca queda tu plan de tus objetivos y mejoramos sin parar.'],
    ['02', 'Transparencia', 'Te explicamos qué datos usamos, cómo funciona la IA y cuáles son sus límites.'],
    ['03', 'Privacidad', 'Tus datos son tuyos. No los vendemos ni entrenamos modelos con ellos.'],
    ['04', 'Seguridad clínica', 'Somos una herramienta de apoyo; nunca sustituimos a un profesional de la salud.'],
];

const ROWS = [
    {
        num: '01', label: 'Misión',
        title: 'Comer bien, sin que sea un lujo',
        body: (
            <p className={styles.rowText}>
                Creemos que una buena nutrición no debería requerir contratar a un especialista
                costoso ni seguir dietas genéricas pensadas para otros países y otros bolsillos.
                Por eso pusimos la <strong>nutrición de precisión al alcance de cualquiera</strong>,
                con la comida de aquí.
            </p>
        ),
    },
    {
        num: '02', label: 'El problema',
        title: 'Las apps no conocen tu mesa',
        body: (
            <p className={styles.rowText}>
                La mayoría usa catálogos de alimentos extranjeros, precios irreales y planes que
                ignoran tu contexto. El resultado: listas de compras imposibles y comidas que nadie
                quiere repetir. Nosotros partimos de un <strong>catálogo verificado de alimentos
                dominicanos</strong> con precios reales en RD$.
            </p>
        ),
    },
    {
        num: '03', label: 'Cómo lo hacemos',
        title: 'Mucho más que un modelo de IA',
        body: (
            <>
                <p className={styles.rowText}>
                    La IA es una pieza poderosa dentro de un sistema mayor. El valor está en la
                    validación, la personalización y la seguridad que la rodean.
                </p>
                <div className={styles.stack}>
                    {HOW.map(([idx, text]) => (
                        <div key={idx} className={styles.layer}>
                            <span className={styles.layerIdx}>{idx}</span>
                            <span className={styles.layerText}>{text}</span>
                        </div>
                    ))}
                </div>
            </>
        ),
    },
    {
        num: '04', label: 'Principios',
        title: 'En lo que no negociamos',
        body: (
            <div className={styles.principles}>
                {PRINCIPLES.map(([idx, title, text]) => (
                    <div key={idx} className={styles.principle}>
                        <span className={styles.pIndex}>{idx}</span>
                        <h3 className={styles.pTitle}>{title}</h3>
                        <p className={styles.pText}>{text}</p>
                    </div>
                ))}
            </div>
        ),
    },
    {
        num: '05', label: 'Quiénes somos',
        title: 'Hecho en República Dominicana',
        body: (
            <p className={styles.rowText}>
                MealfitRD es una plataforma operada desde República Dominicana, construida por un
                equipo que cree en la tecnología al servicio de la salud y la cultura local.
                Empezamos por la mesa dominicana, con la mira puesta en llevar esta misma precisión
                al resto de Latinoamérica.
            </p>
        ),
    },
];

const AboutPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

    return (
        <div className={styles.page}>
            {/* atmósfera abstracta: aurora + velo (todo CSS, sin imágenes) */}
            <div className={styles.canvas} aria-hidden="true" />
            <div className={styles.veil} aria-hidden="true" />

            <div className={styles.inner}>
                {/* ───────────── hero ───────────── */}
                <header className={styles.hero}>
                    <span className={`${styles.eyebrow} ${styles.reveal}`}>Acerca de MealfitRD</span>
                    <h1 className={`${styles.headline} ${styles.reveal}`} style={{ animationDelay: '0.06s' }}>
                        Precisión nutricional para la <span className={styles.grad}>mesa dominicana</span>.
                    </h1>
                    <p className={`${styles.lead} ${styles.reveal}`} style={{ animationDelay: '0.14s' }}>
                        Somos una plataforma dominicana de nutrición de precisión potenciada por
                        inteligencia artificial. Creamos planes 100% personalizados con alimentos que
                        de verdad se consiguen —y se comen— aquí.
                    </p>
                    <div className={`${styles.ticker} ${styles.reveal}`} style={{ animationDelay: '0.22s' }}>
                        <span>100% personalizado</span>
                        <span>precios reales en RD$</span>
                        <span>validación determinista</span>
                        <span>privacidad primero</span>
                    </div>
                </header>

                {/* ───────────── manifiesto ───────────── */}
                <div className={styles.rows}>
                    {ROWS.map((r, i) => (
                        <section
                            key={r.num}
                            className={`${styles.row} ${styles.reveal}`}
                            style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                        >
                            <div className={styles.rowAside}>
                                <div className={styles.ghost}>{r.num}</div>
                                <span className={styles.asideLabel}>{r.label}</span>
                            </div>
                            <div className={styles.rowBody}>
                                <h2 className={styles.rowTitle}>{r.title}</h2>
                                {r.body}
                            </div>
                        </section>
                    ))}
                </div>

                {/* ───────────── cierre ───────────── */}
                <section className={`${styles.closing} ${styles.reveal}`}>
                    <h2 className={styles.closingTitle}>Hablemos.</h2>
                    <p className={styles.closingText}>
                        ¿Preguntas, ideas o quieres colaborar con nosotros? Estamos a un correo de
                        distancia y respondemos en menos de 24 horas.
                    </p>
                    <a href="mailto:fuego.servicios@gmail.com" className={styles.mail}>
                        fuego.servicios@gmail.com
                    </a>
                    <div className={styles.ctaRow}>
                        <Link to="/assessment" className={styles.ctaPrimary}>
                            Crear mi Plan <ArrowRight size={18} strokeWidth={2.5} />
                        </Link>
                        <Link to="/como-funciona" className={styles.ctaGhost}>
                            Cómo funciona
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AboutPage;
