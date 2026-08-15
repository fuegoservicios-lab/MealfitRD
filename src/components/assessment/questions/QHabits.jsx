// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { Cigarette, Coffee, GlassWater, Wine } from 'lucide-react';
import { ChipOption } from './_shared';
import { NextButton } from './NextButton';
import { useT } from '../../../i18n';

// [P1-CLINICAL-INTAKE · 2026-07-03] Hábitos de consumo — parte de la anamnesis
// estándar de nutrición que el wizard no capturaba. Cada señal tiene consumidor
// real aguas abajo (llegan al prompt vía el JSON dump de form_data):
//   - Alcohol: calorías líquidas + interactúa con metformina/warfarina (el motor
//     de interacciones medication_rules ya existe; esta era su señal faltante).
//   - Tabaco: modula apetito y vitamina C.
//   - Cafeína: cruza con sleepHours (ya capturado) y horarios de comidas.
//   - Agua: baseline de hidratación (el WaterTracker del dashboard mide DESPUÉS;
//     esto captura el punto de partida).
// 4 sub-preguntas single-select en un solo step (patrón QMedical: varias
// secciones + manual advance). Valores en es-DO legibles — van directo al prompt.
//
// [P1-I18N-DASHBOARD · 2026-08-15] FUNCIÓN, no constante: una tabla de copy en
// ámbito de módulo se evalúa al importar —antes de que exista catálogo— y queda
// congelada en español para siempre (ver src/i18n/index.js). Los `val` son lo que
// viaja al backend y al prompt: NO se traducen, solo el `label` que se pinta.
const getHabitRows = (t) => [
    {
        key: 'habitAlcohol', label: t('Alcohol'), icon: Wine,
        options: [
            { val: 'nunca', label: t('Nunca') },
            { val: 'ocasional', label: t('Ocasional (social)') },
            { val: 'semanal', label: t('Cada semana') },
            { val: 'diario', label: t('A diario') },
        ],
    },
    {
        key: 'habitSmoking', label: t('Tabaco / vape'), icon: Cigarette,
        options: [
            { val: 'no', label: t('No fumo') },
            { val: 'ocasional', label: t('A veces') },
            { val: 'diario', label: t('A diario') },
        ],
    },
    {
        key: 'habitCaffeine', label: t('Cafeína (café, té, energizantes)'), icon: Coffee,
        options: [
            { val: 'ninguna', label: t('No tomo') },
            { val: '1-2 tazas/día', label: t('1–2 tazas/día') },
            { val: '3-4 tazas/día', label: t('3–4 tazas/día') },
            { val: '5+ tazas/día', label: t('5 o más') },
        ],
    },
    {
        key: 'habitWater', label: t('Agua al día'), icon: GlassWater,
        options: [
            { val: 'menos de 1L', label: t('Menos de 1 litro') },
            { val: '1-2L', label: t('1–2 litros') },
            { val: '2-3L', label: t('2–3 litros') },
            { val: 'más de 3L', label: t('Más de 3 litros') },
        ],
    },
];

export const QHabits = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    const habitRows = getHabitRows(t);
    const allAnswered = habitRows.every(row => (formData[row.key] || '') !== '');
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {habitRows.map(({ key, label, icon: Icon, options }) => (
                <div key={key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                        <Icon size={16} aria-hidden="true" />
                        {label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
                        {options.map(opt => (
                            <ChipOption
                                key={opt.val} val={opt.val} label={opt.label}
                                isSelected={formData[key] === opt.val}
                                onToggle={(val) => updateData(key, val)}
                            />
                        ))}
                    </div>
                </div>
            ))}
            {/* Señal explícita en las 4 filas antes de avanzar (patrón P1-FORM-7:
                cada fila tiene opción "Nunca/No tomo" — 1 click si no aplica). */}
            <NextButton onClick={onManualAdvance} disabled={!allAnswered} />
        </div>
    );
};
