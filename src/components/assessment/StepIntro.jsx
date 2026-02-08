import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { ArrowRight, Activity, Moon, Heart, Brain } from 'lucide-react';
import styles from './StepIntro.module.css';

const StepIntro = () => {
    const { nextStep } = useAssessment();

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { loop: 1, staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className={styles.container}
        >
            <motion.p variants={itemVariants} className={styles.eyebrow}>
                COMIENZA TU TRANSFORMACIÓN
            </motion.p>

            <motion.h2 variants={itemVariants} className={styles.title}>
                Vamos a crear tu plan <br />
                <span className={styles.gradientText}>perfecto en 4 pasos</span>
            </motion.h2>

            <motion.p variants={itemVariants} className={styles.subtitle}>
                No es solo contar calorías. Nuestra IA necesita entender quién eres realmente.
            </motion.p>

            <div className={styles.grid}>
                <PillarCard
                    icon={Activity}
                    title="1. Biometría"
                    desc="Tu cuerpo y metabolismo"
                    delay={0.2}
                    color="#3B82F6"
                    bgColor="#EFF6FF"
                />
                <PillarCard
                    icon={Moon}
                    title="2. Estilo de Vida"
                    desc="Sueño, estrés y tiempo"
                    delay={0.3}
                    color="#6366F1"
                    bgColor="#EEF2FF"
                />
                <PillarCard
                    icon={Heart}
                    title="3. Preferencias"
                    desc="Gustos y salud"
                    delay={0.4}
                    color="#EC4899"
                    bgColor="#FDF2F8"
                />
                <PillarCard
                    icon={Brain}
                    title="4. Objetivos"
                    desc="Tu meta real"
                    delay={0.5}
                    color="#8B5CF6"
                    bgColor="#F5F3FF"
                />
            </div>

            <motion.button
                variants={itemVariants}
                onClick={nextStep}
                className={styles.button}
                whileTap={{ scale: 0.98 }}
            >
                Comenzar Evaluación <ArrowRight size={20} />
            </motion.button>
        </motion.div>
    );
};

const PillarCard = ({ icon: Icon, title, desc, delay, color, bgColor }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay }}
        className={styles.card}
    >
        <div
            className={styles.iconWrapper}
            style={{ background: bgColor, color: color, boxShadow: `0 4px 10px ${color}20` }}
        >
            <Icon size={28} strokeWidth={2} fill={color} fillOpacity={0.2} />
        </div>
        <h3 className={styles.cardTitle}>{title}</h3>
        <p className={styles.cardDesc}>{desc}</p>
    </motion.div>
);

export default StepIntro;
