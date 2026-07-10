// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Mars, Venus } from 'lucide-react';
import { PREGNANCY_CHIP_LABELS } from './_shared';

export const QGender = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P1-PREGNANCY-INTAKE-CAPTURE · 2026-06-19] Al fijar el género, limpia los chips de embarazo/lactancia
    // si el nuevo valor NO es mujer (los chips solo existen para mujeres; sin esto quedan huérfanos sin
    // chip visible para deseleccionarlos). Idempotente para 'female' (filter no-op si no hay valores).
    const setGender = (value) => {
        if (value !== 'female') {
            const cleaned = (formData.medicalConditions || []).filter(c => !PREGNANCY_CHIP_LABELS.includes(c));
            if (cleaned.length !== (formData.medicalConditions || []).length) updateData('medicalConditions', cleaned);
        }
        updateData('gender', value);
    };
    // [P6-FORM-RADIO-CLICK-FIX] Híbrido: `onChange` mantiene la persistencia
    // del valor en formData (necesario para back-navigation), `onClick`
    // SOLO dispara auto-advance cuando el valor YA estaba seleccionado
    // (caso donde onChange no fire por no haber cambio). Si los dos
    // dispararían advance, daría doble-trigger en cambio de opción.
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Símbolos biológicos universales (♀ ♂) — coherentes con
                el subtítulo "sexo biológico". Antes ambos chips usaban
                User/UserCircle (personas genéricas) y no se distinguían
                visualmente entre sí. */}
            <RadioCard
                name="gender" value="female" label="Mujer" icon={Venus}
                checked={formData.gender === 'female'}
                onChange={(e) => { setGender(e.target.value); onAutoAdvance(); }}
                onClick={() => { if (formData.gender === 'female') onAutoAdvance(); }}
            />
            <RadioCard
                name="gender" value="male" label="Hombre" icon={Mars}
                checked={formData.gender === 'male'}
                onChange={(e) => { setGender(e.target.value); onAutoAdvance(); }}
                onClick={() => { if (formData.gender === 'male') onAutoAdvance(); }}
            />
        </div>
    );
};
