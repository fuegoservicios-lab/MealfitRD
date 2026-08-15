// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
// [P1-FORM-8] `DIET_TYPES` es el SSOT del enum de tipos de dieta — espejo de
// `_DIET_TYPE_ENUM` en `backend/routers/plans.py`. QDietType consume esta
// lista para renderizar los chips, evitando hardcodear los strings en cada
// `<DietOption val=...>`. Una invariant runtime más abajo verifica que la
// metadata UI (`DIET_TYPE_META`) cubre exactamente la misma lista — si un
// futuro PR añade un tipo a `DIET_TYPES` sin actualizar la metadata, el
// componente avisa explícitamente en consola.
import { DIET_TYPES } from '../../../config/formValidation';
import { Salad, UtensilsCrossed, Vegan } from 'lucide-react';
import { DietOption } from './_shared';
import { t as _t, useT } from '../../../i18n';

// [P1-FORM-8] Metadata UI por cada tipo de dieta. Las claves DEBEN coincidir
// EXACTAMENTE con `DIET_TYPES` (SSOT de validación). El check de invariante
// debajo del componente avisa si hay drift.
// [FORM-DIET-ICONS · 2026-07-03] Escalera semántica: cubiertos cruzados (come de
// todo) → bowl de ensalada (sin carne, pero variado) → sello vegano de lucide
// (el marcador estándar de etiquetado 100% vegetal). Antes Utensils (tenedor
// solitario que se leía como tridente) / Leaf genérica / Salad.
// [P1-I18N-DASHBOARD · 2026-08-15] FUNCIÓN, no constante: una tabla de copy en
// ámbito de módulo se congela en español al importarse (ver src/i18n/index.js).
// Las CLAVES (`balanced`/`vegetarian`/`vegan`) son el enum que consume el motor:
// no se tocan; solo `label`/`desc`, que es lo que se pinta.
const getDietTypeMeta = (t = _t) => ({
    balanced:   { label: t('Balanceada'),   icon: UtensilsCrossed, desc: t('De todo un poco') },
    vegetarian: { label: t('Vegetariana'),  icon: Salad,           desc: t('Sin carne') },
    vegan:      { label: t('Vegana'),       icon: Vegan,           desc: t('100% vegetal') },
});

// [P1-FORM-8] Invariante de desarrollo: `DIET_TYPE_META` debe cubrir
// exactamente las mismas claves que `DIET_TYPES`. Si un PR futuro añade
// "keto" al SSOT pero olvida la metadata UI, este aviso lo detecta en el
// primer mount durante dev. En prod (`import.meta.env.MODE !== 'development'`)
// el chequeo se omite — el render igual fallaría visualmente pero sin spam de
// consola. Vite reemplaza `import.meta.env.MODE` en build time, así que el
// bloque se elimina por dead-code elimination en producción.
if (import.meta.env?.MODE === 'development') {
    const metaKeys = Object.keys(getDietTypeMeta());
    const missingMeta = DIET_TYPES.filter((t) => !metaKeys.includes(t));
    const extraMeta = metaKeys.filter((k) => !DIET_TYPES.includes(k));
    if (missingMeta.length || extraMeta.length) {
        console.warn(
            '[P1-FORM-8] DIET_TYPE_META drift vs DIET_TYPES:',
            { missingMeta, extraMeta }
        );
    }
}

export const QDietType = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const dietTypeMeta = getDietTypeMeta(t);
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            {DIET_TYPES.map((diet) => {
                const meta = dietTypeMeta[diet];
                if (!meta) return null;  // safety net — el invariante de arriba ya avisó
                return (
                    <DietOption
                        key={diet}
                        val={diet}
                        label={meta.label}
                        icon={meta.icon}
                        desc={meta.desc}
                        isSelected={formData.dietType === diet}
                        onSelect={(val) => { updateData('dietType', val); onAutoAdvance(); }}
                    />
                );
            })}
        </div>
    );
};
