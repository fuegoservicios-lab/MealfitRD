// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAssessment } from '../../../context/AssessmentContext';
import { SUPPLEMENTS, blockedSupplementsFor } from '../../../config/formValidation';
import { Check, Pill, Zap, Ban } from 'lucide-react';
import { handleActivationKey } from './_shared';
import { NextButton } from './NextButton';
import { useT } from '../../../i18n';
import { normalizarSuplementos } from '../../../utils/normalizarSuplementos';

// [P1-FORM-14] Metadata UI por suplemento. Las claves DEBEN coincidir EXACTAMENTE
// con `SUPPLEMENTS` (SSOT en formValidation.js). El check de invariante debajo
// avisa en dev si hay drift. Mismo patrón que `DIET_TYPE_META` de P1-FORM-8.
// [I18N-EXEMPT: SSOT de claves-emoji con invariante de dev; los rotulos van en getSupplementLabels(t)]
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
//
// [P1-PLAN-LOTE-292 · 2026-09-25] Dos preguntas que antes iban mezcladas en un interruptor: «¿Tomas algún
// suplemento?» (también en modo contador: lo marcado se guarda en la Alacena y el plan lo incluye como SUYO) y, solo
// con el generador, «¿Quieres que te recomendemos alguno para tu meta?» (la IA recomienda solo lo que tiene respaldo;
// nunca quemadores, pre-entrenos ni BCAA). Campos `currentSupplements` + `recommendSupplements`; los viejos
// (`includeSupplements`/`selectedSupplements`) se siguen escribiendo en espejo para los lectores antiguos.
export const QSupplements = ({ onFinish, isSubmitting, finishLabel, modoContador = false }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const supplementLabels = getSupplementLabels(t);
    // Etiqueta visible: traducción si existe, y si no el label del SSOT (español).
    const labelOf = (val) => supplementLabels[val] ?? SUPPLEMENT_META[val]?.label ?? val;

    // [P1-SUPPLEMENT-CLINICAL-GATE · 2026-08-12] Chips vetados por el perfil clínico (espejo UI de la tabla backend):
    // el chip se ve, no se puede marcar, y el tap explica por qué.
    const blocked = blockedSupplementsFor(formData, t);

    const normal = normalizarSuplementos(formData);
    const toma = Array.isArray(formData.currentSupplements) ? formData.currentSupplements : normal.toma;
    const recomendar = typeof formData.recommendSupplements === 'boolean' ? formData.recommendSupplements : normal.recomendar;

    const fijar = (lista, rec) => {
        updateData('currentSupplements', lista);
        updateData('recommendSupplements', rec);
        updateData('includeSupplements', lista.length > 0 || rec);
        updateData('selectedSupplements', lista);
    };

    // Un formulario guardado con el paso viejo arranca con lo que ya había elegido.
    useEffect(() => {
        if (!Array.isArray(formData.currentSupplements)) fijar(normal.toma, normal.recomendar);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-limpieza: si una selección vieja quedó vetada, se retira con aviso (el estado no miente).
    useEffect(() => {
        const vetados = toma.filter((s) => blocked[s]);
        if (vetados.length) {
            fijar(toma.filter((s) => !blocked[s]), recomendar);
            toast.info(t('Quitamos suplementos no recomendados con tu perfil.'), {
                description: vetados.map((s) => labelOf(s) || s).join(', '),
                duration: 5000,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(Object.keys(blocked)), JSON.stringify(toma)]);

    const alternarRecomendar = () => fijar(toma, !recomendar);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Pill size={20} style={{ color: 'var(--supplement-accent)' }} />
                    {t('¿Tomas algún suplemento?')}
                </div>
                <p style={{ margin: '0.35rem 0 0.9rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {t('Márcalos y los guardamos en tu Alacena.')}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.75rem' }}>
                    {SUPPLEMENTS.map((val) => {
                        const meta = SUPPLEMENT_META[val];
                        if (!meta) return null;  // safety net — el invariante de arriba ya avisó
                        const isSelected = toma.includes(val);
                        const blockHint = blocked[val];
                        const toggleSupplement = () => {
                            if (blockHint) {
                                toast.info(t('No recomendado con tu perfil médico.'), { description: blockHint, duration: 4500 });
                                return;
                            }
                            fijar(isSelected ? toma.filter((s) => s !== val) : [...toma, val], recomendar);
                        };
                        return (
                            <div
                                key={val}
                                onClick={(e) => { e.stopPropagation(); toggleSupplement(); }}
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

            {!modoContador && (
                <div
                    onClick={alternarRecomendar}
                    onKeyDown={handleActivationKey(alternarRecomendar)}
                    role="switch"
                    aria-checked={!!recomendar}
                    aria-label={t('¿Quieres que te recomendemos alguno para tu meta?')}
                    tabIndex={0}
                    style={{
                        cursor: 'pointer', padding: '1rem 1.25rem', borderRadius: '1rem',
                        border: recomendar ? '2px solid var(--supplement-accent)' : '1px solid var(--border)',
                        backgroundColor: recomendar ? 'var(--supplement-tint)' : 'var(--bg-card)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: recomendar ? 'var(--supplement-accent)' : 'var(--text-main)' }}>
                            {t('¿Quieres que te recomendemos alguno para tu meta?')}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {t('Solo lo que tiene respaldo: proteína, creatina, omega 3, vitaminas y minerales.')}
                        </div>
                    </div>
                    <div style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: recomendar ? 'var(--supplement-accent)' : 'var(--toggle-track-off)', boxShadow: recomendar ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 1px 2px rgba(0,0,0,0.25)', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: 3, left: recomendar ? 23 : 3, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                    </div>
                </div>
            )}

            <NextButton onClick={onFinish} disabled={isSubmitting} label={isSubmitting ? t('Generando Plan…') : (finishLabel || t('Finalizar y Generar'))} icon={Zap} />
        </div>
    );
};
