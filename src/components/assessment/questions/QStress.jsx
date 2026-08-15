// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from 'lucide-react';
import { useT } from '../../../i18n';

export const QStress = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
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
    // [P1-I18N-DASHBOARD · 2026-08-15] `val` es lo que se PERSISTE y viaja al
    // backend (`stressLevel`): no se traduce. `label` es lo único que se pinta.
    const _STRESS_OPTIONS = [
        { val: 'Bajo', label: t('Bajo'), icon: BatteryLow },
        { val: 'Moderado', label: t('Moderado'), icon: BatteryMedium },
        { val: 'Alto', label: t('Alto'), icon: BatteryFull },
        { val: 'Muy Alto', label: t('Muy Alto'), icon: BatteryWarning },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {_STRESS_OPTIONS.map(opt => (
                <RadioCard
                    key={opt.val} name="stressLevel" value={opt.val} label={opt.label} icon={opt.icon}
                    checked={formData.stressLevel === opt.val}
                    onChange={(e) => { updateData('stressLevel', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.stressLevel === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
