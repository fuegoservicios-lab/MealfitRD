// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { Input, Label } from '../../common/FormUI';
// [P1-3] Rangos biométricos compartidos con el backend — rationale completo en QMeasurements.jsx.
import { BIO_RANGES, isBiometricInRange } from '../../../config/formValidation';
import { Ban } from 'lucide-react';
import { ChipOption } from './_shared';
import { NextButton } from './NextButton';

// [P1-CLINICAL-INTAKE · 2026-07-03] Meta de peso cuantificada + ritmo — lo primero
// que un nutriólogo fija tras conocer el objetivo. Antes el motor decidía el
// déficit/superávit genéricamente por mainGoal, sin meta ni ritmo del usuario.
// Va DESPUÉS de QMainGoal (adapta copy al objetivo). Contrato de señal explícita
// del repo: número válido O chip "Sin meta específica" (sentinel que bloquea el
// input, patrón P3-FORM-SENTINEL-LOCKS-FREETEXT). El ritmo solo aplica a
// lose_fat/gain_muscle. Sanity de dirección: perder grasa exige meta < peso
// actual (y ganar músculo, meta > actual) — un typo aquí invertiría el plan.
export const QGoalTarget = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const weightUnit = formData.weightUnit || 'lb';
    const weightRange = weightUnit === 'kg' ? BIO_RANGES.weightKg : BIO_RANGES.weightLb;
    const goal = formData.mainGoal;
    const needsPace = goal === 'lose_fat' || goal === 'gain_muscle';
    const auto = !!formData.targetWeightAuto;

    const handleAutoToggle = () => {
        const next = !auto;
        updateData('targetWeightAuto', next);
        if (next && (formData.targetWeight || '') !== '') updateData('targetWeight', '');
    };
    const handleWeightInput = (raw) => {
        const v = typeof raw === 'string' ? raw.replace(',', '.') : raw;
        updateData('targetWeight', v);
        if (v !== '' && auto) updateData('targetWeightAuto', false);
    };

    const tw = parseFloat(String(formData.targetWeight ?? '').replace(',', '.'));
    const cw = parseFloat(String(formData.weight ?? '').replace(',', '.'));
    const inRange = isBiometricInRange(formData.targetWeight, weightRange);
    const directionBad = Number.isFinite(tw) && Number.isFinite(cw) && (
        (goal === 'lose_fat' && tw >= cw) ||
        (goal === 'gain_muscle' && tw <= cw)
    );
    const targetOK = auto || (inRange && !directionBad);
    const paceOK = !needsPace || (formData.goalPace || '') !== '';

    const inputLabel = goal === 'maintenance'
        ? `¿En qué peso te quieres mantener? (${weightUnit})`
        : goal === 'performance'
            ? `¿Peso objetivo para rendir mejor? (${weightUnit})`
            : `¿A qué peso quieres llegar? (${weightUnit})`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
                <Label htmlFor="targetWeight">{inputLabel}</Label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'stretch' }}>
                    <Input
                        id="targetWeight" type="number" inputMode="decimal"
                        placeholder={auto ? 'Marcaste «Sin meta específica»' : (weightUnit === 'lb' ? 'Ej. 140' : 'Ej. 64')}
                        min={weightRange.min} max={weightRange.max} step={weightRange.step}
                        value={auto ? '' : (formData.targetWeight || '')}
                        onChange={e => handleWeightInput(e.target.value)}
                        disabled={auto}
                    />
                    <ChipOption
                        val="auto" label="Sin meta específica" icon={Ban}
                        isSelected={auto}
                        onToggle={handleAutoToggle}
                    />
                </div>
                {directionBad && !auto && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--warning, #F59E0B)' }}>
                        Para {goal === 'lose_fat' ? 'perder grasa, la meta debería ser menor' : 'ganar músculo, la meta debería ser mayor'} que tu peso actual ({formData.weight} {weightUnit}).
                    </div>
                )}
            </div>

            {needsPace && (
                <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                        ¿A qué ritmo quieres avanzar?
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                        {[
                            { val: 'gradual', label: 'Gradual (recomendado)' },
                            { val: 'moderado', label: 'Moderado' },
                            { val: 'decidido', label: 'Decidido' },
                        ].map(opt => (
                            <ChipOption
                                key={opt.val} val={opt.val} label={opt.label}
                                isSelected={formData.goalPace === opt.val}
                                onToggle={(val) => updateData('goalPace', val)}
                            />
                        ))}
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        Gradual prioriza sostenibilidad; Decidido es más exigente y requiere más constancia. Nunca usamos ritmos extremos que comprometan tu salud.
                    </div>
                </div>
            )}

            <NextButton onClick={onManualAdvance} disabled={!(targetOK && paceOK)} />
        </div>
    );
};
