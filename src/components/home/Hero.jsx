import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, FlaskConical, Wallet, Bot, ShieldCheck, Unlock, Utensils, Activity, TrendingUp, ChevronRight } from 'lucide-react';
import styles from './Hero.module.css';
import { useAssessment } from '../../context/AssessmentContext';
import { useHeroCta } from '../../context/HeroCtaContext';
import heroBg from '../../assets/hero-bg.webp';

const Hero = () => {
    const { planData } = useAssessment();
    const { setHeroCtaVisible } = useHeroCta();
    const ctaRef = useRef(null);

    // [HEADER-STICKY-CTA · 2026-05-31] Reporta al Header (vía contexto) si el CTA
    // principal del Hero está en pantalla. El rootMargin top negativo ≈ altura del
    // header fixed (70px) para que el Header revele su CTA sticky justo cuando este
    // botón se desliza por detrás del header — no cuando toca el borde del viewport.
    useEffect(() => {
        const el = ctaRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const observer = new IntersectionObserver(
            ([entry]) => setHeroCtaVisible(entry.isIntersecting),
            { rootMargin: '-72px 0px 0px 0px', threshold: 0 }
        );
        observer.observe(el);
        return () => {
            observer.disconnect();
            // Al desmontar (salir del landing) reseteamos a "visible" para que el
            // sticky arranque oculto la próxima vez que se monte el Hero.
            setHeroCtaVisible(true);
        };
    }, [setHeroCtaVisible]);

    return (
        <section
            className={styles.hero}
            style={{ backgroundImage: `url(${heroBg})` }}
        >
            <div className={styles.bgOverlay} />

            <div className={styles.container}>
                <div className={styles.content}>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                        <div className={styles.badge}>
                            <span className={styles.badgeOrb} aria-hidden="true" /> Nueva Generación en Nutrición
                        </div>

                        <h1 className={styles.title}>
                            Nutrición Inteligente, <br />
                            <span className={styles.gradientText}>Diseñada para Ti</span>
                        </h1>

                        <p className={styles.subtitle}>
                            La IA que crea tu plan de comida basado en <strong>tus gustos</strong>, tu presupuesto y tu día a día. Comer bien nunca fue tan fácil.
                        </p>

                        <div className={styles.actions} ref={ctaRef}>
                            {planData ? (
                                <Link
                                    to="/dashboard"
                                    className={styles.activePlanBtn}
                                >
                                    Ver mi Plan <ArrowRight size={20} />
                                </Link>
                            ) : (
                                <Link to="/assessment" className={styles.primaryBtn}>
                                    Crear mi Plan Ahora <ChevronRight size={20} />
                                </Link>
                            )}
                        </div>

                        <div className={styles.trust}>
                            <div className={styles.trustItem}>
                                <FlaskConical size={16} className={styles.trustIcon} strokeWidth={2.25} />
                                <span>Fundamentado en Ciencia</span>
                            </div>
                            <div className={styles.trustItem}>
                                <Bot size={16} className={styles.trustIcon} strokeWidth={2.25} />
                                <span>Personalizado con IA</span>
                            </div>
                            <div className={styles.trustItem}>
                                <Wallet size={16} className={styles.trustIcon} strokeWidth={2.25} />
                                <span>Adaptado a tu Presupuesto</span>
                            </div>
                            <div className={styles.trustItem}>
                                <ShieldCheck size={16} className={styles.trustIcon} strokeWidth={2.25} />
                                <span>Privacidad Garantizada</span>
                            </div>
                            <div className={styles.trustItem}>
                                <Unlock size={16} className={styles.trustIcon} strokeWidth={2.25} />
                                <span>Cancela Cuando Quieras</span>
                            </div>
                        </div>
                    </motion.div>
                </div>

                <motion.div
                    className={styles.visual}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, delay: 0.2 }}
                >
                    <div className={styles.cardVisual}>
                        {/* Background Shapes */}
                        <div className={`${styles.visualCircle} ${styles.circle1}`} />
                        <div className={`${styles.visualCircle} ${styles.circle2}`} />

                        {/* Floating Interaction Cards */}

                        {/* [P2-HERO-STATIC-CARDS · 2026-05-31] Tarjetas ESTÁTICAS.
                            El CSS (Hero.module.css) ya declaró 'se quitó la flotación
                            continua que no gustó', pero el JSX seguía con
                            animate={{y:[...]}} repeat:Infinity → seguían oscilando en
                            prod (framer-motion escribe transform inline vía WAAPI, que
                            el guard global prefers-reduced-motion de CSS NO neutraliza).
                            Ahora son <div> estáticos: cumplen la intención del equipo y
                            cierran la fuga de reduced-motion. Los tints del iconBox
                            pasan a CSS custom props para que el dark-theme los pueda
                            re-mapear (antes inline > stylesheet = parche claro en dark). */}

                        {/* Card 1: Meals */}
                        <div className={`${styles.floatCard} ${styles.floatCard1}`}>
                            <div className={styles.iconBox} style={{ '--icon-bg': '#EFF6FF', '--icon-fg': '#2563EB' }}>
                                <Utensils size={24} />
                            </div>
                            <div className={styles.cardText}>
                                <strong>Almuerzo Ideal</strong>
                                <small>600 kcal • 30g Prot</small>
                            </div>
                        </div>

                        {/* Card 2: Health */}
                        <div className={`${styles.floatCard} ${styles.floatCard2}`}>
                            <div className={styles.iconBox} style={{ '--icon-bg': '#ECFDF5', '--icon-fg': '#10B981' }}>
                                <Activity size={24} />
                            </div>
                            <div className={styles.cardText}>
                                <strong>Salud Optimizada</strong>
                                <small>Metabolismo activo</small>
                            </div>
                        </div>

                        {/* Card 3: Progress */}
                        <div className={`${styles.floatCard} ${styles.floatCard3}`}>
                            <div className={styles.iconBox} style={{ '--icon-bg': '#FFF7ED', '--icon-fg': '#F97316' }}>
                                <TrendingUp size={24} />
                            </div>
                            <div className={styles.cardText}>
                                <strong>Progreso Real</strong>
                                <small>Objetivo: -2kg/mes</small>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default Hero;