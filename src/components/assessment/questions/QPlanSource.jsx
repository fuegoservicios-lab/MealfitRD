// [P1-PANTRY-FIRST-PLAN · 2026-07-11] F3 — Primera pregunta del formulario: ¿plan
// completo diseñado libre por la IA, o plan construido a partir de lo que YA hay en
// tu Nevera? El modo 'pantry' activa: pre-flight determinista de factibilidad
// (con sugerencias de compra a precio RD si no alcanza) + generación Zero-Waste
// (el backend inyecta tu inventario real server-side).
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import { ChefHat, Refrigerator } from 'lucide-react';

export const QPlanSource = ({ onAutoAdvance }) => {
    const { formData, updateData, userProfile } = useAssessment();
    const value = formData.planSource || 'scratch';
    const isAuth = Boolean(userProfile?.id);

    const set = (v) => updateData('planSource', v);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <RadioCard
                name="planSource" value="scratch" icon={ChefHat}
                label="Plan completo con IA"
                desc="La IA diseña tu plan libre y la lista de compras te dice exactamente qué comprar."
                checked={value === 'scratch'}
                onChange={(e) => { set(e.target.value); onAutoAdvance(); }}
                onClick={() => { if (value === 'scratch') onAutoAdvance(); }}
            />
            <RadioCard
                name="planSource" value="pantry" icon={Refrigerator}
                label="Desde mi Nevera"
                desc={isAuth
                    ? 'La IA construye el plan alrededor de los alimentos que ya tienes y te sugiere solo lo que falte.'
                    : 'Requiere cuenta: tu Nevera vive en tu perfil. Inicia sesión para usar este modo.'}
                checked={value === 'pantry'}
                onChange={(e) => { if (isAuth) { set(e.target.value); onAutoAdvance(); } }}
                onClick={() => { if (isAuth && value === 'pantry') onAutoAdvance(); }}
            />
        </div>
    );
};
