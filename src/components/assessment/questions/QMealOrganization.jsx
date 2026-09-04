// [P1-ARQ25-F4-FORM · 2026-09-03] Pregunta 1 del formulario progresivo (roadmap §6.7): el perfil
// global de recurrencia. Es la ÚNICA pregunta nueva obligatoria: sin ella el motor no sabe si
// repetir es acierto o defecto. Escribe intención (`mealOrganization`), nunca reglas.
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Repeat, LayoutGrid, Compass } from 'lucide-react';
import { useT } from '../../../i18n';
import { MEAL_ORGANIZATION_MODES, modeLabel, modeDescription } from '../../../config/planPolicy';

const ICONS = { routine: Repeat, balanced: LayoutGrid, explore: Compass };

export const QMealOrganization = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    return (
        <div role="radiogroup" aria-label={t('¿Cómo prefieres organizar tus comidas durante la semana?')}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {MEAL_ORGANIZATION_MODES.map((mode) => (
                <RadioCard
                    key={mode} name="mealOrganization" value={mode}
                    label={modeLabel(t, mode)} desc={modeDescription(t, mode)} icon={ICONS[mode]}
                    checked={formData.mealOrganization === mode}
                    onChange={(e) => { updateData('mealOrganization', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.mealOrganization === mode) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
