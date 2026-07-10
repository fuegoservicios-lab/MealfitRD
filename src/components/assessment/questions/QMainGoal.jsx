// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { BicepsFlexed, Flame, Gauge, Scale } from 'lucide-react';
import { GoalCard } from './_shared';

export const QMainGoal = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            {[
                // Cada icono representa LITERALMENTE el objetivo:
                //   - Flame (Perder Grasa): llama = quemar grasa (rojo).
                //   - BicepsFlexed (Ganar Músculo): bíceps flexionado (azul).
                //   - Scale (Mantenimiento): balanza = equilibrio/mantener (verde).
                //   - Gauge (Rendimiento): velocímetro = performance (morado).
                // Antes TrendingUp/Zap/Shield/Target eran abstractos — y TrendingUp
                // (flecha SUBIENDO) contradecía "Perder Grasa".
                { val: "lose_fat", label: "Perder Grasa", icon: Flame, color: "#ef4444" },
                { val: "gain_muscle", label: "Ganar Músculo", icon: BicepsFlexed, color: "#3b82f6" },
                { val: "maintenance", label: "Mantenimiento", icon: Scale, color: "#10b981" },
                { val: "performance", label: "Rendimiento", icon: Gauge, color: "#8b5cf6" }
            ].map(opt => (
                <GoalCard 
                    key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} color={opt.color} 
                    isSelected={formData.mainGoal === opt.val} 
                    onSelect={(val) => { updateData('mainGoal', val); onAutoAdvance(); }} 
                />
            ))}
        </div>
    );
};
