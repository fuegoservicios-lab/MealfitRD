// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from 'lucide-react';

export const QStress = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    // Progresión visual: la barra REPRESENTA el nivel de estrés —
    // a más estrés, más llena la barra (como un medidor que se
    // satura). El icono crece visualmente con la respuesta:
    //   Bajo      → BatteryLow (apenas marcada, calma)
    //   Moderado  → BatteryMedium (mitad)
    //   Alto      → BatteryFull (llena, mucho estrés acumulado)
    //   Muy Alto  → BatteryWarning (sobrecarga, alerta crítica)
    // Antes los 4 niveles usaban el mismo Battery → no se distinguían
    // visualmente y el chip seleccionado no comunicaba la severidad
    // de la respuesta del usuario.
    const _STRESS_OPTIONS = [
        { val: 'Bajo', icon: BatteryLow },
        { val: 'Moderado', icon: BatteryMedium },
        { val: 'Alto', icon: BatteryFull },
        { val: 'Muy Alto', icon: BatteryWarning },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {_STRESS_OPTIONS.map(opt => (
                <RadioCard
                    key={opt.val} name="stressLevel" value={opt.val} label={opt.val} icon={opt.icon}
                    checked={formData.stressLevel === opt.val}
                    onChange={(e) => { updateData('stressLevel', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.stressLevel === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
