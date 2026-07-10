// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { Input } from '../../common/FormUI';
// [P1-FORM-2] SSOT de sentinels exclusivos — rationale completo en QAllergies.jsx y config/sentinels.js.
import { SENTINELS } from '../../../config/sentinels';
import { Ban, Bean, Beef, Cloud, Fish, Layers, Leaf, LeafyGreen, Shrimp, Sprout, TreeDeciduous } from 'lucide-react';
import { ChipOption, toggleArrayWithExclusiveSentinel } from './_shared';
import { NextButton } from './NextButton';

// [P1-B5] Step nuevo para `dislikes` — campo que el backend ya consume:
//   - Filtra catálogos de ingredientes (`constants._get_fast_filtered_catalogs`).
//   - Va al RAG dynamic_query (`graph_orchestrator.arun_plan_pipeline`).
//   - Se inyecta al prompt principal del LLM.
//   - Valida invalidación de cache semántico (P1-Q4).
//   - Considera al hacer swap-meal (`agent.py`).
// Antes el campo siempre llegaba como `[]` porque el formulario no lo capturaba —
// el backend operaba sin esta señal de alta calidad. Mismo patrón que QAllergies
// y QStruggles: chip multi-select con sentinel "Ninguno" exclusivo + free-text
// para casos no listados.
export const QDislikes = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.dislikes;
    const noneSelected = (formData.dislikes || []).includes(SENTINEL);
    const handleToggle = (value) => {
        const next = toggleArrayWithExclusiveSentinel(formData.dislikes || [], value, SENTINEL);
        updateData('dislikes', next);
        // [P0-FORM-1] ver QAllergies. dislikes alimenta el filtro de catálogo
        // y el cache semántico — un texto stale tras marcar "Ninguno" causaba
        // cache miss falso o inclusión de un alimento que el usuario rechazó.
        if (next.length === 1 && next[0] === SENTINEL && (formData.otherDislikes || '').trim()) {
            updateData('otherDislikes', '');
        }
    };

    // Lista de alimentos comúnmente rechazados en el contexto dominicano.
    // No exhaustiva: el input free-text de abajo captura el resto.
    // [FORM-DISLIKE-ICONS · 2026-07-03] Icono temático por alimento — antes 6 de 10
    // compartían Salad, Mariscos repetía Fish y Hígado usaba AlertTriangle (señal de
    // peligro, ni siquiera comida). El label siempre acompaña al icono, así que las
    // metáforas de forma funcionan como refuerzo visual:
    //   - Beef (Hígado): corte de carne/víscera.
    //   - Shrimp (Mariscos): camarón, distinto del pez.
    //   - TreeDeciduous (Brócoli): el "arbolito".
    //   - Cloud (Coliflor): forma de nube.
    //   - Sprout (Hongos): brota del suelo.
    //   - Layers (Cebolla): capas.
    //   - Bean (Aguacate): silueta ovalada con "pepa".
    const COMMON_DISLIKES = [
        { val: "Cilantro", label: "Cilantro", icon: Leaf },
        { val: "Hígado", label: "Hígado", icon: Beef },
        { val: "Berenjena", label: "Berenjena", icon: LeafyGreen },
        { val: "Pescado", label: "Pescado", icon: Fish },
        { val: "Mariscos", label: "Mariscos", icon: Shrimp },
        { val: "Brócoli", label: "Brócoli", icon: TreeDeciduous },
        { val: "Coliflor", label: "Coliflor", icon: Cloud },
        { val: "Hongos", label: "Hongos", icon: Sprout },
        { val: "Cebolla", label: "Cebolla", icon: Layers },
        { val: "Aguacate", label: "Aguacate", icon: Bean },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                {COMMON_DISLIKES.map(opt => (
                    <ChipOption
                        key={opt.val} val={opt.val} label={opt.label} icon={opt.icon}
                        isSelected={(formData.dislikes || []).includes(opt.val)}
                        onToggle={handleToggle}
                    />
                ))}
                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={(formData.dislikes || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P3-FORM-SENTINEL-LOCKS-FREETEXT · 2026-07-01] Si el usuario marca
                "Ninguno", el free-text queda bloqueado (contradicción "no rechazo
                nada" + escribir un rechazo). handleToggle ya limpia otherDislikes al
                marcar el sentinel; aquí lo hacemos no-editable para dejarlo claro. */}
            <Input
                type="text"
                placeholder={noneSelected ? 'Marcaste «Ninguno»' : 'Otros (Ej. Apio, Curry, Picante...)'}
                value={noneSelected ? '' : (formData.otherDislikes || '')}
                onChange={(e) => updateData('otherDislikes', e.target.value)}
                disabled={noneSelected}
            />
            {/* [P0-FORM-4] Requiere señal explícita: chip seleccionado, "Ninguno",
                o free-text con contenido. Antes el botón siempre estaba habilitado
                y el usuario podía avanzar con `dislikes=[]` + `otherDislikes=''` →
                el backend no podía distinguir "el usuario no tiene rechazos" de
                "el dato se perdió en la hidratación / cliente legacy". Resultado:
                ingredientes culturalmente sensibles (cilantro, hígado) colaban en
                el plan porque el RAG / catálogo / cache semántico los procesaban
                como `dislikes=[]` (no-op). Ahora forzamos al usuario a marcar
                "Ninguno" si genuinamente no rechaza nada — convierte la
                ambigüedad en señal explícita. `dislikes` alimenta:
                  - `constants._get_fast_filtered_catalogs` (filtro de catálogo)
                  - `graph_orchestrator.arun_plan_pipeline` (RAG dynamic_query)
                  - prompt LLM principal
                  - validación de cache semántico (P1-Q4)
                  - `agent.py` swap-meal */}
            <NextButton
                onClick={onManualAdvance}
                disabled={
                    (formData.dislikes || []).length === 0 &&
                    (formData.otherDislikes || '').trim() === ''
                }
            />
        </div>
    );
};
