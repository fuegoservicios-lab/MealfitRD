import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { ChevronLeft } from 'lucide-react';
import styles from './AssessmentLayout.module.css';
import { Link } from 'react-router-dom';

const AssessmentLayout = ({ children, totalSteps }) => {
    const { currentStep, prevStep } = useAssessment();

    const progress = ((currentStep) / (totalSteps - 1)) * 100;

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [currentStep]);

    return (
        <div className={styles.layout}>
            {/* Header for Assessment */}
            <header className={styles.header}>
                <div className="container" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                    {currentStep > 0 && (
                        <button onClick={prevStep} className={styles.backBtn}>
                            <ChevronLeft size={24} />
                        </button>
                    )}
                    <div className={styles.logo}>
                        Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>
                    <Link to="/" className={styles.closeBtn}>Cancelar</Link>
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
                <div className={styles.stepContainer}>
                    {children}
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
