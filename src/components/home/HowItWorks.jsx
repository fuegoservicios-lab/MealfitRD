import { ClipboardList, Sparkles, Utensils, TrendingUp } from 'lucide-react';
import styles from './HowItWorks.module.css';

const steps = [
    {
        icon: ClipboardList,
        title: "Cuéntanos de ti",
        desc: "No es solo peso y altura. Analizamos tu estilo de vida, horarios, gustos y presupuesto.",
        color: "#3B82F6",
        bg: "#EFF6FF"
    },
    {
        icon: Sparkles,
        title: "La IA analiza",
        desc: "Nuestros algoritmos cruzan tus datos con miles de combinaciones nutricionales optimizadas.",
        color: "#8B5CF6",
        bg: "#F5F3FF"
    },
    {
        icon: Utensils,
        title: "Plan a Medida",
        desc: "Recibes un menú exacto, no una plantilla. Con ingredientes que encuentras en tu súper.",
        color: "#10B981",
        bg: "#ECFDF5"
    },
    {
        icon: TrendingUp,
        title: "Evolución Real",
        desc: "Registra tus avances y el plan se ajusta automáticamente a tu nuevo metabolismo.",
        color: "#F97316",
        bg: "#FFF7ED"
    }
];

const HowItWorks = () => {
    return (
        <section className={styles.section} id="how-it-works">
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Así funciona tu transformación</h2>
                    <p className={styles.subtitle}>
                        Un proceso simple pero científicamente avanzado para garantizar resultados.
                    </p>
                </div>

                <div className={styles.grid}>
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <div className={styles.card} key={index}>
                                <div className={styles.stepNumber}>0{index + 1}</div>
                                <div
                                    className={styles.iconWrapper}
                                    style={{
                                        '--bg-icon': step.bg,
                                        '--color-icon': step.color
                                    }}
                                >
                                    <Icon size={28} />
                                </div>
                                <h3 className={styles.cardTitle}>{step.title}</h3>
                                <p className={styles.cardDesc}>{step.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
