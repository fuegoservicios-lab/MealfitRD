// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { Clock, Hourglass, Infinity as InfinityIcon, Timer } from 'lucide-react';

export const QCookingTime = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {[
                // Progresión literal de DURACIÓN de tiempo:
                //   Hourglass → Timer → Clock → Infinity
                // Cada icono representa exactamente el texto del label:
                //   - Hourglass (Nada): reloj de arena = "poco/nada de tiempo"
                //   - Timer (Poco): cronómetro corto = "30 min"
                //   - Clock (Medio): reloj completo = "ciclo de 45-60 min"
                //   - Infinity (Sin límite): ∞ = "sin restricción de tiempo"
                // Iteraciones previas con iconos de comida (Sandwich/Soup) o
                // energía (Zap) eran ambiguos — no comunicaban DURACIÓN
                // que es lo que el campo realmente mide.
                { val: 'none', label: 'Nada', desc: 'Opciones directas, de 5 mins', icon: Hourglass },
                { val: '30min', label: 'Poco', desc: 'Máximo 30 min', icon: Timer },
                { val: '1hour', label: 'Medio', desc: '45-60 min', icon: Clock },
                { val: 'plenty', label: 'Sin límite', desc: 'Me gusta cocinar', icon: InfinityIcon }
            ].map(opt => (
                <RadioCard
                    key={opt.val} name="cookingTime" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.cookingTime === opt.val}
                    onChange={(e) => { updateData('cookingTime', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.cookingTime === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};
