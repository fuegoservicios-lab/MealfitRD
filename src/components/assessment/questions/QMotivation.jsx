// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { Battery } from 'lucide-react';
import { NextButton } from './NextButton';

export const QMotivation = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
                <textarea
                    placeholder="Ej: Quiero recuperar mi energía diaria, prepararme para mi primera carrera..."
                    value={formData.motivation || ''}
                    onChange={(e) => updateData('motivation', e.target.value)}
                    rows={4}
                    aria-required="true"
                    aria-label="Tu motivación"
                    style={{
                        width: '100%', padding: '1.25rem', paddingLeft: '3rem', borderRadius: '1rem',
                        border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit',
                        resize: 'vertical', outline: 'none', transition: 'all 0.25s ease', background: 'var(--bg-card)', color: 'var(--text-main)'
                    }}
                />
                <div style={{ position: 'absolute', top: '1.25rem', left: '1rem', color: 'var(--text-muted)' }}>
                    <Battery size={20} />
                </div>
            </div>
            {/* [P0-FORM-3] `disabled` ahora trim-aware. Antes `!formData.motivation`
                trataba "   " (whitespace) como truthy → el usuario podía teclear
                espacios y avanzar. Backend ahora también rechaza con 422 vía
                `value.strip() == ""` en `_validate_form_data_min`, pero el gate
                frontend evita quemar quota y entrega feedback inmediato.
                `motivation` es consumido por `build_motivation_context` →
                planner + day generator del LLM. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={!formData.motivation || formData.motivation.trim() === ''}
            />
        </div>
    );
};
