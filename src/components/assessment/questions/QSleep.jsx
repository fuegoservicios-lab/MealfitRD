// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { AlarmClock, BedDouble, Moon, MoonStar } from 'lucide-react';

export const QSleep = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    // Progresión visual de calidad/cantidad de descanso:
    //   AlarmClock → Moon → MoonStar → BedDouble
    // Cada icono representa el estado de sueño del usuario:
    //   - AlarmClock (<6h): la alarma te despierta antes de descansar.
    //   - Moon (6-7h): sueño regular pero corto.
    //   - MoonStar (7-8h): sueño con estrella = calidad óptima.
    //   - BedDouble (>8h): cama = sueño abundante / dormilón.
    // Antes los 4 niveles usaban el mismo Moon → no se distinguían
    // visualmente y la card no comunicaba la calidad/cantidad.
    const _SLEEP_OPTIONS = [
        { val: '< 6 horas', icon: AlarmClock },
        { val: '6-7 horas', icon: Moon },
        { val: '7-8 horas', icon: MoonStar },
        { val: '> 8 horas', icon: BedDouble },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {_SLEEP_OPTIONS.map(opt => (
                <RadioCard
                    key={opt.val} name="sleepHours" value={opt.val} label={opt.val} icon={opt.icon}
                    checked={formData.sleepHours === opt.val}
                    onChange={(e) => { updateData('sleepHours', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.sleepHours === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
