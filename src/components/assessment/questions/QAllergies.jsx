// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { Input } from '../../common/FormUI';
// [P1-FORM-2] SSOT de sentinels exclusivos. Antes cada Q* declaraba su
// `const SENTINEL = "Ninguna"` o `"Ninguno"` localmente; cambiar el copy en
// uno y olvidar los demás rompía la detección de exclusividad y la
// contradicción reaparecía en backend (P0-FORM-1). Ver
// `frontend/src/config/sentinels.js` para el contrato con backend
// (`_SENTINEL_NONE_VALUES` en `graph_orchestrator.py`).
import { SENTINELS } from '../../../config/sentinels';
import { Ban, Egg, Fish, Leaf, Milk, Nut, Wheat } from 'lucide-react';
import { ChipOption, toggleArrayWithExclusiveSentinel } from './_shared';
import { NextButton } from './NextButton';

export const QAllergies = ({ onManualAdvance }) => {
    // [P2-FORM-ALLERGY-SEVERITY · 2026-06-22] (audit fresco P2-25) DECISIÓN DE PRODUCTO documentada (el
    // audit permite "implementar toggle de severidad O documentar la decisión fail-safe"): este step NO
    // distingue alergia severa (IgE) de intolerancia leve — ambas se tratan como exclusión DURA. La dirección
    // es FAIL-SAFE (sobre-restrictivo: nunca se sirve el alérgeno → cero riesgo de seguridad); lo único que
    // se pierde es flexibilidad para una intolerancia leve (el usuario puede usar el free-text/Dislikes para
    // matices). Un toggle de severidad requiere diseño de producto + cambia el contrato del form (tests de
    // sentinel-drift); se difiere hasta que el owner lo priorice. NO añadir `allergySeverity` sin revisitar.
    const { formData, updateData } = useAssessment();
    // [P0-B1] sentinel mutuamente exclusivo con cualquier alergia real.
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.allergies;
    const noneSelected = (formData.allergies || []).includes(SENTINEL);
    const handleToggle = (value) => {
        // [P2-QCHIPS-INCLUDES-GUARD · 2026-06-01] `|| []`: si health_profile hidrata
        // allergies como null/string (dato legacy / write parcial), .includes() lanza
        // TypeError y crashea el render del step (pantalla en blanco). Alinea con QDislikes.
        const next = toggleArrayWithExclusiveSentinel(formData.allergies || [], value, SENTINEL);
        updateData('allergies', next);
        // [P0-FORM-1] Si el usuario acaba de activar el sentinel, limpia el textbox
        // libre `otherAllergies`. Sin esto, escribir "Maní" y luego marcar "Ninguna"
        // dejaba ambos campos en el payload — el backend mergeaba a
        // `["Ninguna","Maní"]` (contradicción de seguridad médica). El backend
        // tiene defensa en profundidad pero la fuente de verdad debe ser el form.
        if (next.length === 1 && next[0] === SENTINEL && (formData.otherAllergies || '').trim()) {
            updateData('otherAllergies', '');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                {[
                    { val: "Lacteos", label: "Lácteos", icon: Milk },
                    { val: "Gluten", label: "Gluten", icon: Wheat },
                    { val: "Huevo", label: "Huevo", icon: Egg },
                    { val: "Mariscos", label: "Mariscos", icon: Fish },
                    { val: "Frutos Secos", label: "Nueces", icon: Nut },
                    { val: "Soya", label: "Soya", icon: Leaf },
                ].map(opt => (
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={(formData.allergies || []).includes(opt.val)} onToggle={handleToggle} />
                ))}
                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={(formData.allergies || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P3-FORM-SENTINEL-LOCKS-FREETEXT · 2026-07-01] "Ninguna" bloquea el
                free-text (contradicción de safety médica: sin alergias + escribir una). */}
            <Input
                type="text" placeholder={noneSelected ? 'Marcaste «Ninguna»' : 'Otra (Ej. Maní, Fresa...)'}
                value={noneSelected ? '' : (formData.otherAllergies || '')}
                onChange={(e) => updateData('otherAllergies', e.target.value)}
                disabled={noneSelected}
            />
            {/* [P1-2] Mismo patrón de enforcement explícito que QDislikes
                (P0-FORM-4), QMedical y QStruggles (P1-FORM-7). ANTES este
                NextButton no tenía `disabled`, así que el usuario podía
                avanzar con `allergies=[]` Y `otherAllergies=''` aún teniendo
                el title con asterisco rojo. El backend interpretaba `[]`
                como "sin alergias declaradas" → el LLM podía incluir maní /
                gluten / mariscos en el plan a un usuario que en realidad
                nunca respondió. ESTE es el chip más sensible de los cuatro
                porque el riesgo es de SAFETY MÉDICA directa, no de UX.
                Forzar señal explícita ("Ninguna" si no aplica) convierte la
                ambigüedad en consentimiento informado. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={
                    (formData.allergies || []).length === 0 &&
                    (formData.otherAllergies || '').trim() === ''
                }
            />
        </div>
    );
};
