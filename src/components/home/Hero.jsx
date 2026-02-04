import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, Apple, Utensils, Activity, TrendingUp, ChevronRight, PlayCircle } from 'lucide-react';
import styles from './Hero.module.css';
import { useAssessment } from '../../context/AssessmentContext';
import heroBg from '../../assets/hero-bg.png';

const Hero = () => {
    const { planData } = useAssessment();

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
                            <Apple size={14} /> Nueva Generación en Nutrición
                        </div>

                        <h1 className={styles.title}>
                            Nutrición Inteligente, <br />
                            <span className={styles.gradientText}>Diseñada para Ti</span>
                        </h1>

                        <p className={styles.subtitle}>
                            Planes de alimentación 100% personalizados que se adaptan a tus gustos,
                            presupuesto y estilo de vida. Sin restricciones absurdas.
                        </p>

                        <div className={styles.actions}>
                            {planData ? (
                                <Link
                                    to="/dashboard"
                                    className={styles.primaryBtn}
                                    style={{
                                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                                    }}
                                >
                                    Ver mi Plan Activo <ArrowRight size={20} />
                                </Link>
                            ) : (
                                <Link to="/assessment" className={styles.primaryBtn}>
                                    Crear mi Plan Ahora <ChevronRight size={20} />
                                </Link>
                            )}


                        </div>

                        <div className={styles.trust}>
                            <div className={styles.trustItem}>
                                <CheckCircle size={16} className={styles.trustIcon} />
                                <span>100% Basado en Ciencia</span>
                            </div>
                            <div className={styles.trustItem}>
                                <CheckCircle size={16} className={styles.trustIcon} />
                                <span>Adaptado a tu Presupuesto</span>
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

                        {/* Card 1: Meals */}
                        <motion.div
                            className={`${styles.floatCard} ${styles.floatCard1}`}
                            animate={{ y: [-10, 10, -10] }}
                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <div className={styles.iconBox} style={{ background: '#EFF6FF', color: '#2563EB' }}>
                                <Utensils size={24} />
                            </div>
                            <div className={styles.cardText}>
                                <strong>Almuerzo Ideal</strong>
                                <small>600 kcal • 30g Prot</small>
                            </div>
                        </motion.div>

                        {/* Card 2: Health */}
                        <motion.div
                            className={`${styles.floatCard} ${styles.floatCard2}`}
                            animate={{ y: [10, -10, 10] }}
                            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                        >
                            <div className={styles.iconBox} style={{ background: '#ECFDF5', color: '#10B981' }}>
                                <Activity size={24} />
                            </div>
                            <div className={styles.cardText}>
                                <strong>Salud Optimizada</strong>
                                <small>Metabolismo activo</small>
                            </div>
                        </motion.div>

                        {/* Card 3: Progress */}
                        <motion.div
                            className={`${styles.floatCard} ${styles.floatCard3}`}
                            animate={{ y: [-5, 5, -5] }}
                            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                        >
                            <div className={styles.iconBox} style={{ background: '#FFF7ED', color: '#F97316' }}>
                                <TrendingUp size={24} />
                            </div>
                            <div className={styles.cardText}>
                                <strong>Progreso Real</strong>
                                <small>Objetivo: -2kg/mes</small>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default Hero;