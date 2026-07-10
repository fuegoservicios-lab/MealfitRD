// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useAssessment } from '../../../context/AssessmentContext';
import { Input } from '../../common/FormUI';
// [P1-FORM-2] SSOT de sentinels exclusivos — rationale completo en QAllergies.jsx y config/sentinels.js.
import { SENTINELS } from '../../../config/sentinels';
import {
    Activity, Baby, Ban, BatteryLow, Droplet, Droplets, Flame, HeartPulse,
    Milk, Pill, Slice, Syringe, TestTube, Venus,
} from 'lucide-react';
import { ChipOption, PREGNANCY_CHIP_LABELS, toggleArrayWithExclusiveSentinel } from './_shared';
import { NextButton } from './NextButton';

// [FORM-MEDICAL-ICONS · 2026-07-03] Icono temático por condición — antes 5 de las 7
// compartían `Activity` (indistinguibles) y las otras dos eran genéricas. Mapping literal:
//   - Droplet (Diabetes T2): gota de sangre = glucosa.
//   - HeartPulse (Hipertensión): latido = presión arterial.
//   - TestTube (Colesterol Alto): perfil lipídico de laboratorio.
//   - Flame (Gastritis): ardor/acidez.
//   - Venus (SOP): condición hormonal femenina.
//   - BatteryLow (Hipotiroidismo): metabolismo/energía lenta (no hay Butterfly en lucide).
//   - Slice (Cirugía Bariátrica): bisturí = quirúrgico.
// Fallback `Activity` si un futuro chip no se mapea (defensivo, hoy cubre las 7).
const CONDITION_ICONS = {
    'Diabetes T2': Droplet,
    'Hipertensión': HeartPulse,
    'Colesterol Alto': TestTube,
    'Gastritis': Flame,
    'SOP (PCOS)': Venus,
    'Hipotiroidismo': BatteryLow,
    'Cirugía Bariátrica': Slice,
};

// [FORM-MEDICAL-ICONS · 2026-07-03] Medicamentos: icono = lo que TRATA (espeja
// CONDITION_ICONS para coherencia visual dentro del step — quien marcó Diabetes T2
// con la gota reconoce la misma gota en Metformina). Insulina → Syringe (inyectable);
// diuréticos → Droplets (líquidos). Los sin metáfora clara (Prednisona, Warfarina,
// Alopurinol) conservan el fallback `Pill`.
const MED_ICONS = {
    'Metformina': Droplet,
    'Insulina': Syringe,
    'Glibenclamida': Droplet,
    'Lisinopril': HeartPulse,
    'Losartán': HeartPulse,
    'Amlodipina': HeartPulse,
    'Hidroclorotiazida': Droplets,
    'Espironolactona': Droplets,
    'Atorvastatina': TestTube,
    'Levotiroxina': BatteryLow,
    'Omeprazol': Flame,
};

export const QMedical = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P0-B1] sentinel exclusivo con cualquier condición médica real.
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.medicalConditions;
    const noneSelected = (formData.medicalConditions || []).includes(SENTINEL);
    const handleToggle = (value) => {
        // [P2-QCHIPS-INCLUDES-GUARD · 2026-06-01] `|| []` (ver QAllergies).
        const next = toggleArrayWithExclusiveSentinel(formData.medicalConditions || [], value, SENTINEL);
        updateData('medicalConditions', next);
        // [P0-FORM-1] ver QAllergies. Mismo patrón: contradicción "Ninguna" +
        // texto libre con condición real es un riesgo médico (hipertensión,
        // diabetes); el LLM podría descartar la condición real al ver el sentinel.
        if (next.length === 1 && next[0] === SENTINEL && (formData.otherConditions || '').trim()) {
            updateData('otherConditions', '');
        }
    };

    // [P3-MED-NONE-CHIP · 2026-07-01] Sentinel LOCAL para medicamentos (a pedido: chip "Ninguno").
    // NO va al SSOT `SENTINELS` porque ese contrato cubre los 4 multi-select REQUERIDOS vía
    // `_SENTINEL_NONE_VALUES`/`_merge_other_text_fields` (y el drift test fija exactamente esos 4).
    // Medicamentos es OPCIONAL y su "sin medicamentos" lo gobierna el frozenset backend
    // `_MED_NONE_SENTINELS` (medication_rules.py), que YA incluye "ninguno" y está regresión-testeado:
    // test_p1_medication_rules.py → detect_active_medications({"medications":["Ninguno"]}) == [].
    const MED_SENTINEL = 'Ninguno';
    const noMedications = (formData.medications || []).includes(MED_SENTINEL);
    const handleMedToggle = (value) => {
        const next = toggleArrayWithExclusiveSentinel(formData.medications || [], value, MED_SENTINEL);
        updateData('medications', next);
        // Si activa "Ninguno", limpia el texto libre (contradicción "sin medicamentos" + escribir uno).
        if (next.length === 1 && next[0] === MED_SENTINEL && (formData.otherMedications || '').trim()) {
            updateData('otherMedications', '');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {['Diabetes T2', 'Hipertensión', 'Colesterol Alto', 'Gastritis', 'SOP (PCOS)', 'Hipotiroidismo', 'Cirugía Bariátrica'].map(opt => (
                    <ChipOption key={opt} val={opt} label={opt} icon={CONDITION_ICONS[opt] || Activity} isSelected={(formData.medicalConditions || []).includes(opt)} onToggle={handleToggle} />
                ))}
                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={(formData.medicalConditions || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P3-FORM-SENTINEL-LOCKS-FREETEXT · 2026-07-01] "Ninguna" bloquea el
                free-text de condiciones (el de medicamentos abajo es independiente). */}
            <Input
                type="text" placeholder={noneSelected ? 'Marcaste «Ninguna»' : 'Otra condición médica...'}
                value={noneSelected ? '' : (formData.otherConditions || '')}
                onChange={(e) => updateData('otherConditions', e.target.value)}
                disabled={noneSelected}
            />
            {/* [P1-PREGNANCY-INTAKE-CAPTURE · 2026-06-19] (audit fresco P1-1) Captura explícita de
                embarazo/lactancia — solo para mujeres (gender==='female'; QGender va antes que QMedical en el
                flujo). ANTES el gate de seguridad (P1-PREGNANCY-DEFICIT-GATE, que bloquea el déficit calórico
                en embarazo) dependía 100% de que la usuaria ESCRIBIERA "embarazo" en el texto libre — punto
                ciego de alto riesgo/prevalencia, la simétrica faltante del campo `medications`. Los chips
                escriben a `medicalConditions` con labels que matchean PREGNANCY_CONDITION_TERMS → disparan a la
                vez el gate de déficit, la ConditionRule de embarazo (folato/hierro/listeria) y el reviewer
                médico/FS9. Cero cambio backend. Reusa `handleToggle` (sentinel "Ninguna" exclusivo). */}
            {formData.gender === 'female' && (
                <>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '-0.75rem' }}>
                        ¿Estás embarazada o lactando? (opcional)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                        {/* [FORM-MEDICAL-ICONS · 2026-07-03] Baby (Embarazo) / Milk (Lactancia)
                            — antes ambos compartían Heart (genérico). */}
                        {PREGNANCY_CHIP_LABELS.map(opt => (
                            <ChipOption
                                key={opt} val={opt} label={opt} icon={opt === 'Embarazo' ? Baby : Milk}
                                isSelected={(formData.medicalConditions || []).includes(opt)}
                                onToggle={handleToggle}
                            />
                        ))}
                    </div>
                </>
            )}
            {/* [P1-MEDICATION-RULES · 2026-06-18 · sentinel P3-MED-NONE-CHIP 2026-07-01] Medicamentos
                actuales (OPCIONAL; array vacío = no respondió, chip "Ninguno" = confirmó sin medicamentos —
                el backend `_MED_NONE_SENTINELS` lo neutraliza). Alimenta el motor de interacciones fármaco-alimento del backend
                (warfarina↔vit K, metformina↔B12, IECA/ARA-II↔potasio, levotiroxina↔Ca/Fe) + el gate de
                revisión profesional (FS9). NO gatea el botón (es opcional); un medicamento no listado se
                escribe en el campo "Otro medicamento..." de abajo (P1-MEDICATION-FREETEXT; el backend
                lo escanea vía medication_rules._norm_medications, mismo backstop de texto libre). */}
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '-0.75rem' }}>
                Medicamentos actuales (opcional)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {['Metformina', 'Insulina', 'Glibenclamida', 'Lisinopril', 'Losartán', 'Amlodipina', 'Hidroclorotiazida', 'Espironolactona', 'Atorvastatina', 'Levotiroxina', 'Omeprazol', 'Prednisona', 'Warfarina', 'Alopurinol'].map(med => (
                    <ChipOption
                        key={med} val={med} label={med} icon={MED_ICONS[med] || Pill}
                        isSelected={(formData.medications || []).includes(med)}
                        onToggle={handleMedToggle}
                    />
                ))}
                {/* [P3-MED-NONE-CHIP · 2026-07-01] Sentinel "Ninguno" exclusivo: al marcarlo se
                    deseleccionan los demás medicamentos y se bloquea el free-text de abajo. */}
                <ChipOption
                    val={MED_SENTINEL} label={MED_SENTINEL} icon={Ban}
                    isSelected={noMedications}
                    onToggle={handleMedToggle}
                />
            </div>
            {/* [P1-MEDICATION-FREETEXT · 2026-06-19] Medicamento no listado en los chips.
                Mirror de "Otra condición médica" (otherConditions). El texto llega al prompt
                (JSON dump de form_data: _sanitize_form_data_for_prompt preserva toda key sin `_`)
                Y al motor de interacciones fármaco-alimento (medication_rules._norm_medications lo
                escanea como backstop) → dispara las directivas de interacción + el gate de revisión
                profesional (FS9). OPCIONAL: NO gatea el NextButton (igual que los chips de medications). */}
            <Input
                type="text"
                placeholder={noMedications ? 'Marcaste «Ninguno»' : 'Otro medicamento...'}
                value={noMedications ? '' : (formData.otherMedications || '')}
                onChange={(e) => updateData('otherMedications', e.target.value)}
                disabled={noMedications}
            />
            {/* [P1-FORM-7] Mismo patrón que QDislikes (P0-FORM-4): requiere
                señal explícita (chip / "Ninguna" / free-text) antes de
                avanzar. ANTES, el step se titulaba "Condiciones Médicas
                (Opcional)" y el botón siempre estaba habilitado. Usuarios
                con hipertensión / diabetes podían avanzar sin marcar nada
                (asumiendo que era opcional) → LLM no recibía esa señal de
                seguridad → plan podía incluir comidas inadecuadas para su
                condición. Convertir la ambigüedad en señal explícita: si
                no tienen condición, marcan "Ninguna" — un click cuesta
                menos que un mal plan médico. `medicalConditions` alimenta
                el reviewer médico (`graph_orchestrator.review_node`),
                el filtro de catálogo, y el prompt LLM principal. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={
                    (formData.medicalConditions || []).length === 0 &&
                    (formData.otherConditions || '').trim() === ''
                }
            />
        </div>
    );
};
