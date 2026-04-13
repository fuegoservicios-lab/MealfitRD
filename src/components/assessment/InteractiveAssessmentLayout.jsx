import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import styles from './InteractiveAssessmentLayout.module.css';

const InteractiveAssessmentLayout = ({ children, totalSteps, title, subtitle }) => {
    const { currentStep, prevStep, planData } = useAssessment();
    const progress = (currentStep / (totalSteps - 1)) * 100;

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [currentStep]);

    return (
        <div className={styles.layout}>
            {/* Header / Top Bar */}
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    {currentStep > 0 ? (
                        <button onClick={prevStep} className={styles.backBtn}>
                            <ChevronLeft size={24} />
                        </button>
                    ) : (
                        <div className={styles.backSpacer} />
                    )}
                    
                    <Link to="/" className={styles.logo}>
                        Mealfit<span className={styles.highlight}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </Link>
                    
                    <Link to={planData ? '/dashboard' : '/'} className={styles.closeBtn}>
                        Cancelar
                    </Link>
                </div>
                
                {/* Progress Bar under header */}
                <div className={styles.progressContainer}>
                    <motion.div
                        className={styles.progressBar}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>
            </header>

            <main className={styles.main}>
                <div className={styles.contentWrapper}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={title}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className={styles.titleSection}
                        >
                            {title && <h1 className={styles.title}>{title}</h1>}
                            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                        </motion.div>
                    </AnimatePresence>

                    <div className={styles.stepContainer}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};

InteractiveAssessmentLayout.propTypes = {
    children: PropTypes.node.isRequired,
    totalSteps: PropTypes.number.isRequired,
    title: PropTypes.string,
    subtitle: PropTypes.string,
};

export default InteractiveAssessmentLayout;
