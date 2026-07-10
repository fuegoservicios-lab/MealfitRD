// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { Input } from '../../common/FormUI';
// [P1-FORM-2] SSOT de sentinels exclusivos — rationale completo en QAllergies.jsx y config/sentinels.js.
import { SENTINELS } from '../../../config/sentinels';
import { AlertTriangle, Ban, Clock, Frown, HelpCircle, Users, XCircle } from 'lucide-react';
import { ChipOption, toggleArrayWithExclusiveSentinel } from './_shared';
import { NextButton } from './NextButton';

export const QStruggles = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P0-B1] sentinel exclusivo con cualquier struggle real (masculino,
    // distinto de QAllergies/QMedical que usan femenino).
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.struggles;
    const noneSelected = (formData.struggles || []).includes(SENTINEL);
    const handleToggle = (value) => {
        // [P2-QCHIPS-INCLUDES-GUARD · 2026-06-01] `|| []` (ver QAllergies).
        const next = toggleArrayWithExclusiveSentinel(formData.struggles || [], value, SENTINEL);
        updateData('struggles', next);
        // [P0-FORM-1] ver QAllergies. Aunque struggles es UX/calidad, no safety,
        // mantener el patrón consistente evita drift y deja el contrato de
        // exclusividad uniforme en los 4 multi-select con sentinel.
        if (next.length === 1 && next[0] === SENTINEL && (formData.otherStruggles || '').trim()) {
            updateData('otherStruggles', '');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                {[
                    { val: "Ansiedad por dulces", label: "Ansiedad / Dulces", icon: AlertTriangle },
                    { val: "Atracones nocturnos", label: "Atracones", icon: Frown },
                    { val: "Falta de tiempo", label: "Falta de tiempo", icon: Clock },
                    { val: "Comida social/Salidas", label: "Salidas Sociales", icon: Users },
                    { val: "No sé cocinar", label: "No sé cocinar", icon: XCircle },
                    { val: "Me aburro rápido", label: "Me aburro rápido", icon: HelpCircle }
                ].map(opt => (
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={(formData.struggles || []).includes(opt.val)} onToggle={handleToggle} />
                ))}

                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={(formData.struggles || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P3-FORM-SENTINEL-LOCKS-FREETEXT · 2026-07-01] "Ninguno" bloquea el free-text. */}
            <Input
                type="text" placeholder={noneSelected ? 'Marcaste «Ninguno»' : 'Ej. Viajes frecuentes...'}
                value={noneSelected ? '' : (formData.otherStruggles || '')}
                onChange={(e) => updateData('otherStruggles', e.target.value)}
                disabled={noneSelected}
            />
            {/* [P1-FORM-7] Mismo patrón que QDislikes/QMedical: requiere
                señal explícita antes de avanzar. ANTES, "Mayores Obstáculos"
                permitía avanzar con `struggles=[]` y `otherStruggles=''` —
                LLM no recibía contexto de coaching personalizado. Si el
                usuario no tiene obstáculos, marca "Ninguno" (1 click) y
                el LLM sabe que el contexto está confirmado vacío, no
                "no respondió". `struggles` alimenta el RAG dynamic_query
                (graph_orchestrator.py:8662) y el prompt JSON dump del
                planner. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={
                    (formData.struggles || []).length === 0 &&
                    (formData.otherStruggles || '').trim() === ''
                }
            />
        </div>
    );
};
