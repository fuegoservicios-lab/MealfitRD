import { ClipboardList, Cpu, Utensils, TrendingUp } from 'lucide-react';
import styles from './HowItWorks.module.css';

const steps = [
    {
        icon: ClipboardList,
        title: "Perfil Integral",
        desc: "Capturamos más que tu peso. Evaluamos tu estilo de vida, alergias, presupuesto y nivel de estrés.",
        color: "#3B82F6",
        bg: "#EFF6FF"
    },
    {
        icon: Cpu,
        title: "IA de Alta Potencia",
        desc: "Nuestro motor hiperavanzado procesa millones de variables nutricionales en segundos para armar tu plan perfecto.",
        color: "#8B5CF6",
        bg: "#F5F3FF"
    },
    {
        icon: Utensils,
        title: "Menú Milimétrico",
        desc: "Cada receta generada está calibrada exactamente a tus macros y preferencias, usando ingredientes accesibles.",
        color: "#10B981",
        bg: "#ECFDF5"
    },
    {
        icon: TrendingUp,
        title: "Evolución Dinámica",
        desc: "La IA aprende de tus progresos semana a semana, recalculando las porciones para evitar el estancamiento.",
        color: "#F97316",
        bg: "#FFF7ED"
    }
];

const HowItWorks = () => {
    return (
        <section className={styles.section} id="how-it-works">
            <div className={styles.bgGlow}></div>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.badge}>Proceso</div>
                    <h2 className={styles.title}>Así funciona tu transformación</h2>
                    <p className={styles.subtitle}>
                        Un proceso simple pero científicamente avanzado para garantizar resultados.
                    </p>
                </div>

                <div className={styles.gridContainer}>
                    <div className={styles.gridLine}>
                        <div className={styles.gridLineActive}></div>
                    </div>
                    
                    <div className={styles.grid}>
                        {steps.map((step, index) => {
                            const Icon = step.icon;
                            return (
                                <div className={styles.card} key={index}>
                                    <div className={styles.cardGlow} style={{ '--glow-color': step.color }}></div>
                                    <div className={styles.stepNumber}>0{index + 1}</div>
                                    <div className={styles.contentWrapper}>
                                        <div
                                            className={styles.iconWrapper}
                                            style={{
                                                '--bg-icon': step.bg,
                                                '--color-icon': step.color
                                            }}
                                        >
                                            <Icon size={32} strokeWidth={1.5} />
                                        </div>
                                        <h3 className={styles.cardTitle}>{step.title}</h3>
                                        <p className={styles.cardDesc}>{step.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
