// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAssessment } from '../../../context/AssessmentContext';
import { SUPPLEMENTS, blockedSupplementsFor } from '../../../config/formValidation';
import { Check, Pill, Zap, Ban } from 'lucide-react';
import { handleActivationKey } from './_shared';
import { NextButton } from './NextButton';
import { useT } from '../../../i18n';

// [P1-FORM-14] Metadata UI por suplemento. Las claves DEBEN coincidir EXACTAMENTE
// con `SUPPLEMENTS` (SSOT en formValidation.js). El check de invariante debajo
// avisa en dev si hay drift. Mismo patrón que `DIET_TYPE_META` de P1-FORM-8.
const SUPPLEMENT_META = {
    whey_protein:  { label: 'Proteína Whey', emoji: '🥛' },
    vegan_protein: { label: 'Prot. Vegana',  emoji: '🌱' },
    creatine:      { label: 'Creatina',      emoji: '⚡' },
    bcaa:          { label: 'BCAA / EAA',    emoji: '💪' },
    pre_workout:   { label: 'Pre-Entreno',   emoji: '🔥' },
    fat_burner:    { label: 'Quemador Grasa', emoji: '🌶️' },
    collagen:      { label: 'Colágeno',      emoji: '✨' },
    multivitamin:  { label: 'Multivitamínico', emoji: '💊' },
    omega3:        { label: 'Omega-3',       emoji: '🐟' },
    magnesium:     { label: 'Magnesio',      emoji: '🌙' },
    probiotics:    { label: 'Probióticos',   emoji: '🦠' },
    electrolytes:  { label: 'Electrolitos',  emoji: '💧' },
};

// [P1-I18N-DASHBOARD · 2026-08-15] Las etiquetas TRADUCIDAS viven en una FUNCIÓN,
// no en la tabla de arriba: una tabla de copy en ámbito de módulo se evalúa al
// importar —antes de que exista catálogo— y se congela en español para siempre
// (ver src/i18n/index.js). `SUPPLEMENT_META` se queda tal cual porque es el SSOT
// de claves↔emoji que cotejan el invariante de dev y
// `test_p1_form_14_supplements_sync.py`; su `label` es ahora el fallback.
// Los literales se repiten a propósito: `t(meta.label)` sería una clave dinámica
// que `npm run i18n:check` no puede ver, así que nunca llegaría a traducirse.
const getSupplementLabels = (t) => ({
    whey_protein:  t('Proteína Whey'),
    vegan_protein: t('Prot. Vegana'),
    creatine:      t('Creatina'),
    bcaa:          t('BCAA / EAA'),
    pre_workout:   t('Pre-Entreno'),
    fat_burner:    t('Quemador Grasa'),
    collagen:      t('Colágeno'),
    multivitamin:  t('Multivitamínico'),
    omega3:        t('Omega-3'),
    magnesium:     t('Magnesio'),
    probiotics:    t('Probióticos'),
    electrolytes:  t('Electrolitos'),
});

// [P1-FORM-14] Invariante de desarrollo: `SUPPLEMENT_META` debe cubrir
// exactamente las mismas claves que `SUPPLEMENTS`. Si un PR futuro añade
// "ashwagandha" al SSOT pero olvida la metadata UI, este aviso lo detecta en
// el primer mount durante dev. En prod (`import.meta.env.MODE !== 'development'`)
// el chequeo se omite — el render igual fallaría visualmente con un chip
// vacío, pero sin spam de consola. Vite reemplaza `import.meta.env.MODE` en
// build time, así que el bloque se elimina por dead-code elimination en
// producción. El test `backend/test_p1_form_14_supplements_sync.py` cierra
// el drift cross-language en CI.
if (import.meta.env?.MODE === 'development') {
    const metaKeys = Object.keys(SUPPLEMENT_META);
    const missingMeta = SUPPLEMENTS.filter((s) => !metaKeys.includes(s));
    const extraMeta = metaKeys.filter((k) => !SUPPLEMENTS.includes(k));
    if (missingMeta.length || extraMeta.length) {
        console.warn(
            '[P1-FORM-14] SUPPLEMENT_META drift vs SUPPLEMENTS:',
            { missingMeta, extraMeta }
        );
    }
}

// [P1-PANTRY-WIZARD-STEP · 2026-07-11] `finishLabel` opcional: en modo pantry este
// step ya no es el final del wizard (avanza al paso "Prepara tu Nevera") y el botón
// dice "Siguiente" en vez de "Finalizar y Generar".
export const QSupplements = ({ onFinish, isSubmitting, finishLabel }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const supplementLabels = getSupplementLabels(t);
    // Etiqueta visible: traducción si existe, y si no el label del SSOT (español).
    const labelOf = (val) => supplementLabels[val] ?? SUPPLEMENT_META[val]?.label ?? val;

    // [P1-SUPPLEMENT-CLINICAL-GATE · 2026-08-12] Chips vetados por el perfil
    // clínico (espejo UI de la tabla backend; el enforcement real es el gate
    // del prompt + la barredora post-gen). Patrón dead-control con MOTIVO
    // (P1-PLANSOURCE-DEAD-CONTROL): el chip se ve, no se puede marcar, y el
    // tap explica por qué — un control que desaparece sin explicación parece
    // un bug; uno gris que explica es una decisión clínica visible.
    const blocked = blockedSupplementsFor(formData);

    // Auto-limpieza: si una selección vieja quedó vetada (marcó el suplemento
    // ANTES de declarar la condición y volvió atrás), se retira con aviso.
    // Sin esto el estado mentiría: chip bloqueado pero internamente marcado.
    useEffect(() => {
        const current = formData.selectedSupplements || [];
        const vetados = current.filter((s) => blocked[s]);
        if (vetados.length) {
            updateData('selectedSupplements', current.filter((s) => !blocked[s]));
            toast.info(t('Quitamos suplementos no recomendados con tu perfil.'), {
                description: vetados.map((s) => labelOf(s) || s).join(', '),
                duration: 5000,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(Object.keys(blocked)), JSON.stringify(formData.selectedSupplements || [])]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div
                onClick={() => {
                    const newVal = !formData.includeSupplements;
                    updateData('includeSupplements', newVal);
                    if (!newVal) updateData('selectedSupplements', []);
                }}
                onKeyDown={handleActivationKey(() => {
                    const newVal = !formData.includeSupplements;
                    updateData('includeSupplements', newVal);
                    if (!newVal) updateData('selectedSupplements', []);
                })}
                role="switch"
                aria-checked={!!formData.includeSupplements}
                aria-label={t('Incluir Suplementos')}
                tabIndex={0}
                style={{
                    cursor: 'pointer', padding: '1.25rem 1.5rem',
                    borderRadius: formData.includeSupplements ? '1rem 1rem 0 0' : '1rem',
                    border: formData.includeSupplements ? '2px solid var(--supplement-accent)' : '1px solid var(--border)',
                    backgroundColor: formData.includeSupplements ? 'var(--supplement-tint)' : 'var(--bg-card)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem'
                }}
            >
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: formData.includeSupplements ? 'var(--supplement-accent)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Pill size={20} style={{ color: formData.includeSupplements ? 'var(--supplement-accent)' : 'var(--text-muted)' }} />
                        {t('Incluir Suplementos')}
                    </div>
                </div>
                {/* Toggle UI */}
                <div style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: formData.includeSupplements ? 'var(--supplement-accent)' : 'var(--toggle-track-off)', boxShadow: formData.includeSupplements ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 1px 2px rgba(0,0,0,0.25)', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
                     <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: 3, left: formData.includeSupplements ? 23 : 3, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                </div>
            </div>

            {formData.includeSupplements && (
                <div style={{ padding: '1.5rem 1rem', border: '2px solid var(--supplement-accent)', borderTop: 'none', borderRadius: '0 0 1rem 1rem', marginTop: '-1.5rem', backgroundColor: 'var(--supplement-tint-soft)' }}>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        {t('* Si no marcas ninguno, la IA sugerirá los más adecuados para tu meta.')}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.75rem' }}>
                        {SUPPLEMENTS.map((val) => {
                            const meta = SUPPLEMENT_META[val];
                            if (!meta) return null;  // safety net — el invariante de arriba ya avisó
                            const isSelected = (formData.selectedSupplements || []).includes(val);
                            const blockHint = blocked[val];
                            const toggleSupplement = () => {
                                // [P1-SUPPLEMENT-CLINICAL-GATE] Vetado: el tap EXPLICA en vez
                                // de marcar (aria-disabled emite click; disabled no emitiría
                                // nada y el bloqueo parecería una app colgada).
                                if (blockHint) {
                                    toast.info(t('No recomendado con tu perfil médico.'), {
                                        description: blockHint,
                                        duration: 4500,
                                    });
                                    return;
                                }
                                const current = formData.selectedSupplements || [];
                                const updated = current.includes(val) ? current.filter(s => s !== val) : [...current, val];
                                updateData('selectedSupplements', updated);
                            };
                            return (
                                <div
                                    key={val}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSupplement();
                                    }}
                                    onKeyDown={handleActivationKey(toggleSupplement)}
                                    role="button"
                                    aria-pressed={isSelected}
                                    aria-disabled={!!blockHint}
                                    aria-label={blockHint ? `${labelOf(val)} — ${blockHint}` : labelOf(val)}
                                    tabIndex={0}
                                    style={{
                                        cursor: blockHint ? 'not-allowed' : 'pointer', padding: '0.75rem', borderRadius: '0.75rem',
                                        border: isSelected ? '1.5px solid var(--supplement-accent)' : '1px solid var(--border)',
                                        backgroundColor: isSelected ? 'var(--supplement-tint)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        opacity: blockHint ? 0.45 : 1,
                                    }}
                                >
                                    <span>{meta.emoji}</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'var(--supplement-accent-strong)' : 'var(--text-main)' }}>{labelOf(val)}</span>
                                    {blockHint
                                        ? <Ban size={14} style={{ color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }} />
                                        : isSelected && <Check size={14} style={{ color: 'var(--supplement-accent)', marginLeft: 'auto' }} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <NextButton onClick={onFinish} disabled={isSubmitting} label={isSubmitting ? t('Generando Plan…') : (finishLabel || t('Finalizar y Generar'))} icon={Zap} />
        </div>
    );
};
