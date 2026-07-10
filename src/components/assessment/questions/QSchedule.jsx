// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Moon, RefreshCw, Sun } from 'lucide-react';

export const QSchedule = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {[
                { val: 'standard', label: 'Día (Tradicional)', desc: 'Duermo de noche, activo de día', icon: Sun },
                { val: 'night_shift', label: 'Turno Nocturno', desc: 'Duermo de día, trabajo de noche', icon: Moon },
                { val: 'variable', label: 'Rotativo / Variable', desc: 'Mi horario cambia constantemente', icon: RefreshCw }
            ].map((opt) => (
                <RadioCard
                    key={opt.val} name="scheduleType" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.scheduleType === opt.val}
                    onChange={(e) => { updateData('scheduleType', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.scheduleType === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
