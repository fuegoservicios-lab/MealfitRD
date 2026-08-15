// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { BicepsFlexed, Flame, Gauge, Scale } from 'lucide-react';
import { GoalCard } from './_shared';
import { useT } from '../../../i18n';

export const QMainGoal = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
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
                { val: "lose_fat", label: t('Perder Grasa'), icon: Flame, color: "#ef4444" },
                { val: "gain_muscle", label: t('Ganar Músculo'), icon: BicepsFlexed, color: "#3b82f6" },
                { val: "maintenance", label: t('Mantenimiento'), icon: Scale, color: "#10b981" },
                { val: "performance", label: t('Rendimiento'), icon: Gauge, color: "#8b5cf6" }
            ].map(opt => (
                <GoalCard
                    key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} color={opt.color}
                    isSelected={formData.mainGoal === opt.val}
                    onSelect={(val) => {
                        // [P1-GOAL-CLEARS-TARGET · 2026-08-12] Cambiar de objetivo
                        // invalida la meta de peso (su VALIDEZ depende de la
                        // dirección: bajar con lose_fat, subir con gain_muscle).
                        // Sin esto, un targetWeight stale del objetivo anterior
                        // pasaba las puertas del salto/submit (solo miran
                        // presencia) y moría en el 422 invalid_biometric_range —
                        // sin paso al que navegar (targetWeight no tiene fields).
                        // Mismo patrón que QMeasurements al cambiar el peso.
                        if (val !== formData.mainGoal && (formData.targetWeight || '') !== '') {
                            updateData('targetWeight', '');
                            updateData('targetWeightAuto', true);
                        }
                        updateData('mainGoal', val);
                        onAutoAdvance();
                    }}
                />
            ))}
        </div>
    );
};
