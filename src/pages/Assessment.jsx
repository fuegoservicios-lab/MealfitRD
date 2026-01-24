import { useAssessment } from '../context/AssessmentContext';
import AssessmentLayout from '../components/assessment/AssessmentLayout';
import StepIntro from '../components/assessment/StepIntro';
import StepBiometrics from '../components/assessment/StepBiometrics';
import StepLifestyle from '../components/assessment/StepLifestyle';
import StepPreferences from '../components/assessment/StepPreferences';
import StepGoals from '../components/assessment/StepGoals';
import { AnimatePresence, motion } from 'framer-motion';

// Inner component to handle steps
const AssessmentFlow = () => {
    const { currentStep, direction } = useAssessment();

    // Define Steps
    const steps = [
        <StepIntro key="intro" />,
        <StepBiometrics key="bio" />,
        <StepLifestyle key="lifestyle" />,
        <StepPreferences key="prefs" />,
        <StepGoals key="goals" />,
        // ...
    ];

    // Animation variants
    const variants = {
        enter: (direction) => ({
            x: direction > 0 ? 50 : -50,
            opacity: 0
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction) => ({
            zIndex: 0,
            x: direction < 0 ? 50 : -50,
            opacity: 0
        })
    };

    return (
        <AssessmentLayout totalSteps={5}> {/* Intro + 4 Pillars */}
            <AnimatePresence mode='wait' custom={direction}>
                <motion.div
                    key={currentStep}
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                        x: { type: "spring", stiffness: 300, damping: 30 },
                        opacity: { duration: 0.2 }
                    }}
                >
                    {steps[currentStep] || <div>Paso en construcción</div>}
                </motion.div>
            </AnimatePresence>
        </AssessmentLayout>
    );
};

// Main Page Wrapper with Provider
const Assessment = () => {
    return <AssessmentFlow />;
};

export default Assessment;
