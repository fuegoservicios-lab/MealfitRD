// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { SUPPLEMENTS } from '../../../config/formValidation';
import { Check, Pill, Zap } from 'lucide-react';
import { handleActivationKey } from './_shared';
import { NextButton } from './NextButton';

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

export const QSupplements = ({ onFinish, isSubmitting }) => {
    const { formData, updateData } = useAssessment();

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
                aria-label="Incluir Suplementos"
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
                        Incluir Suplementos
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
                        * Si no marcas ninguno, la IA sugerirá los más adecuados para tu meta.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.75rem' }}>
                        {SUPPLEMENTS.map((val) => {
                            const meta = SUPPLEMENT_META[val];
                            if (!meta) return null;  // safety net — el invariante de arriba ya avisó
                            const isSelected = (formData.selectedSupplements || []).includes(val);
                            const toggleSupplement = () => {
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
                                    aria-label={meta.label}
                                    tabIndex={0}
                                    style={{
                                        cursor: 'pointer', padding: '0.75rem', borderRadius: '0.75rem',
                                        border: isSelected ? '1.5px solid var(--supplement-accent)' : '1px solid var(--border)',
                                        backgroundColor: isSelected ? 'var(--supplement-tint)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}
                                >
                                    <span>{meta.emoji}</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'var(--supplement-accent-strong)' : 'var(--text-main)' }}>{meta.label}</span>
                                    {isSelected && <Check size={14} style={{ color: 'var(--supplement-accent)', marginLeft: 'auto' }} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <NextButton onClick={onFinish} disabled={isSubmitting} label={isSubmitting ? "Generando Plan..." : "Finalizar y Generar"} icon={Zap} />
        </div>
    );
};
