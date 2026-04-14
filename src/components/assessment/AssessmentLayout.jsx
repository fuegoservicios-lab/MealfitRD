import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { ChevronLeft } from 'lucide-react';
import styles from './AssessmentLayout.module.css';
import { Link, useNavigate } from 'react-router-dom';

const AssessmentLayout = ({ children, totalSteps }) => {
    const { currentStep, prevStep, planData, userProfile, resetApp } = useAssessment();
    const navigate = useNavigate();

    const progress = ((currentStep) / (totalSteps - 1)) * 100;

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [currentStep]);

    const handleCancel = async () => {
        const hasCompletedAssessment = userProfile?.health_profile 
            && Object.keys(userProfile.health_profile).length > 0;

        if (hasCompletedAssessment || planData) {
            // Usuario existente re-haciendo el assessment → volver al dashboard
            navigate('/dashboard');
        } else {
            // Usuario nuevo que no ha completado nada → cerrar sesión
            await resetApp();
            navigate('/login');
        }
    };

    return (
        <div className={styles.layout}>
            {/* Header for Assessment - Mobile Only or Minimal */}
            <header className={styles.header}>
                <div className="container" style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 1.5rem' }}>
                    {currentStep === 1 && (
                        <button onClick={prevStep} className={styles.backBtn}>
                            <ChevronLeft size={24} />
                        </button>
                    )}
                    <Link to="/" className={styles.logo} style={{ textDecoration: 'none', color: 'inherit' }}>
                        Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </Link>
                    <button onClick={handleCancel} className={styles.closeBtn} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                </div>
            </header>

            {/* Progress Bar */}
            <div className={styles.progressContainer}>
                <motion.div
                    className={styles.progressBar}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                />
            </div>

            <main className={styles.main}>
                {/* Left Side: Desktop Visuals */}
                <div className={styles.leftPanel}>
                    <div className={styles.leftContent}>
                        <div className={styles.badge}>Paso {currentStep === 0 ? "0" : currentStep} de {totalSteps - 1}</div>
                        <h1 className={styles.leftTitle}>
                            {currentStep === 0 ? "Tu Transformación" :
                             currentStep === 1 ? "Háblanos de ti" :
                             currentStep === 2 ? "Estilo de vida" :
                             currentStep === 3 ? "Tus Gustos" :
                             "Tu Meta Final"}
                        </h1>
                        <p className={styles.leftSubtitle}>
                            {currentStep === 0 ? "Comenzaremos a diseñar el menú perfecto para ti." :
                             "Con estos datos, la IA calculará tus macros exactos y tus porciones ideales para no pasar hambre y ver resultados."}
                        </p>
                    </div>
                    {/* Decorative Elements */}
                    <div className={styles.decorativeCircle1}></div>
                    <div className={styles.decorativeCircle2}></div>
                </div>

                {/* Right Side: Form */}
                <div className={styles.rightPanel}>
                    <div className={styles.stepContainer}>
                        {children}
                    </div>
                    {/* Add extra scroll space padding solely for mobile devices below the steps */}
                    {currentStep > 0 && <div className={styles.mobileScrollSpacer}></div>}
                </div>
            </main>
        </div>
    );
};

AssessmentLayout.propTypes = {
    children: PropTypes.node.isRequired,
    totalSteps: PropTypes.number.isRequired,
};

export default AssessmentLayout;
