// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
// [P1-FORM-2] SSOT de sentinels exclusivos — rationale completo en QAllergies.jsx y config/sentinels.js.
import { SENTINELS } from '../../../config/sentinels';
// [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] cap espejo del knob backend
// `MEALFIT_MAX_MEDICAL_CONDITIONS` — ver comentario SSOT en formValidation.js.
import { MAX_MEDICAL_CONDITIONS } from '../../../config/formValidation';
import {
    Activity, AlertTriangle, Baby, Ban, BatteryLow, Droplet, Droplets, Flame, HeartPulse,
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
    // [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] `noneSelected` (usado antes
    // para el placeholder/disabled del input "Otra condición médica...")
    // se ELIMINÓ junto con el input — la sentinel "Ninguna" sigue siendo
    // exclusiva vía `toggleArrayWithExclusiveSentinel` en `handleToggle`,
    // solo dejó de necesitar esta variable derivada.

    // [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] Cuenta condiciones REALES
    // seleccionadas: excluye "Ninguna" (sentinel) Y los chips de Embarazo/
    // Lactancia — mismo exemption que el backend
    // `_validate_medical_conditions_cap` (routers/plans.py): Embarazo/
    // Lactancia activan un gate de seguridad aparte (déficit calórico
    // fail-hard), no son la complejidad clínica combinatoria que el cap
    // busca acotar. Si se contaran, una usuaria embarazada con 3 condiciones
    // reales quedaría bloqueada de marcar también "Embarazo" — inaceptable.
    const realConditionsCount = (formData.medicalConditions || []).filter(
        (c) => c !== SENTINEL && !PREGNANCY_CHIP_LABELS.includes(c)
    ).length;
    const atCap = realConditionsCount >= MAX_MEDICAL_CONDITIONS;
    // Mensaje inline mostrado solo cuando el usuario INTENTA marcar una 4ª
    // condición real estando en el cap. Se limpia en cualquier toggle exitoso.
    const [capMessage, setCapMessage] = useState('');

    const handleToggle = (value) => {
        const list = formData.medicalConditions || [];
        const already = list.includes(value);
        const isPregnancyChip = PREGNANCY_CHIP_LABELS.includes(value);
        // Bloquea SOLO el intento de AÑADIR una condición real nueva estando
        // en el cap. Deseleccionar (already=true) SIEMPRE libera un slot;
        // "Ninguna" y Embarazo/Lactancia SIEMPRE pasan (el cap nunca debe
        // impedir declarar "sin condiciones" ni el estado de embarazo).
        if (!already && value !== SENTINEL && !isPregnancyChip && atCap) {
            setCapMessage(
                `Máximo ${MAX_MEDICAL_CONDITIONS} condiciones para garantizar la calidad clínica del plan. Deselecciona una para cambiar.`
            );
            return;
        }
        if (capMessage) setCapMessage('');
        // [P2-QCHIPS-INCLUDES-GUARD · 2026-06-01] `|| []` (ver QAllergies).
        const next = toggleArrayWithExclusiveSentinel(list, value, SENTINEL);
        updateData('medicalConditions', next);
        // [P0-FORM-1] ver QAllergies. Mismo patrón: contradicción "Ninguna" +
        // texto libre con condición real es un riesgo médico (hipertensión,
        // diabetes); el LLM podría descartar la condición real al ver el
        // sentinel. [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] el input que
        // escribía `otherConditions` fue ELIMINADO del wizard (decisión de
        // producto: alcance clínico acotado al checklist) — este clear queda
        // como backstop defensivo puro para `formData.otherConditions` legacy
        // (sesión en curso o localStorage restaurado de ANTES del deploy).
        // Ver el comentario de `FREE_TEXT_COMPANION` en formValidation.js
        // para el rationale de compat completo.
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
    // [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] Medicamentos NO llevan cap —
    // decisión explícita del owner: quedan acotados por el checklist mismo
    // (14 opciones), sin el riesgo combinatorio de interacciones que motiva
    // el cap de condiciones.
    const MED_SENTINEL = 'Ninguno';
    const noMedications = (formData.medications || []).includes(MED_SENTINEL);
    const handleMedToggle = (value) => {
        const next = toggleArrayWithExclusiveSentinel(formData.medications || [], value, MED_SENTINEL);
        updateData('medications', next);
        // Si activa "Ninguno", limpia el texto libre legacy (backstop defensivo,
        // mismo rationale que `otherConditions` arriba — el input fue eliminado).
        if (next.length === 1 && next[0] === MED_SENTINEL && (formData.otherMedications || '').trim()) {
            updateData('otherMedications', '');
        }
    };

    // [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] chip deshabilitado SOLO si:
    // no está ya seleccionado (deseleccionar siempre debe poder liberarse) Y
    // estamos en el cap. La sentinel "Ninguna" nunca se pasa a esta función
    // (se renderiza aparte, siempre habilitada).
    const isConditionChipDisabled = (opt) => atCap && !(formData.medicalConditions || []).includes(opt);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {['Diabetes T2', 'Hipertensión', 'Colesterol Alto', 'Gastritis', 'SOP (PCOS)', 'Hipotiroidismo', 'Cirugía Bariátrica'].map(opt => (
                    <ChipOption
                        key={opt} val={opt} label={opt} icon={CONDITION_ICONS[opt] || Activity}
                        isSelected={(formData.medicalConditions || []).includes(opt)}
                        onToggle={handleToggle}
                        disabled={isConditionChipDisabled(opt)}
                    />
                ))}
                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={(formData.medicalConditions || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] Mensaje inline: solo
                aparece cuando el usuario INTENTA marcar una 4ª condición real
                estando en el cap (ver `handleToggle`). Mismo lenguaje que el
                422 backend (`too_many_medical_conditions`) para que la UX y
                el mensaje de error del backend cuenten la misma historia si
                un cliente no oficial bypassea este gate. */}
            {capMessage && (
                <div
                    role="alert"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem', fontWeight: 500,
                        color: 'var(--warning-text)', backgroundColor: 'var(--warning-bg)',
                        border: '1px solid var(--warning-border)', marginTop: '-0.75rem',
                    }}
                >
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <span>{capMessage}</span>
                </div>
            )}
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
            {/* [P1-MEDICATION-RULES · 2026-06-18 · sentinel P3-MED-NONE-CHIP 2026-07-01
                · texto libre ELIMINADO P1-MEDICAL-CONDITIONS-CAP 2026-08-01] Medicamentos
                actuales (OPCIONAL; array vacío = no respondió, chip "Ninguno" = confirmó sin medicamentos —
                el backend `_MED_NONE_SENTINELS` lo neutraliza). Alimenta el motor de interacciones fármaco-alimento del backend
                (warfarina↔vit K, metformina↔B12, IECA/ARA-II↔potasio, levotiroxina↔Ca/Fe) + el gate de
                revisión profesional (FS9). NO gatea el botón (es opcional). Un medicamento no listado en
                los 14 chips simplemente no se captura — el input "Otro medicamento..." fue retirado
                (decisión de producto, alcance acotado al checklist). */}
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
                {/* [P3-MED-NONE-CHIP · 2026-07-01] Sentinel "Ninguno" exclusivo: al
                    marcarlo se deseleccionan los demás medicamentos. */}
                <ChipOption
                    val={MED_SENTINEL} label={MED_SENTINEL} icon={Ban}
                    isSelected={noMedications}
                    onToggle={handleMedToggle}
                />
            </div>
            {/* [P1-MEDICATION-FREETEXT · 2026-06-19 · ELIMINADO P1-MEDICAL-CONDITIONS-CAP · 2026-08-01]
                El input "Otro medicamento..." se retiró del wizard (decisión de producto: alcance
                clínico acotado al checklist de 14 medicamentos + sentinel "Ninguno"). Medicamentos NO
                listados simplemente no se capturan — el motor de interacciones fármaco-alimento
                (medication_rules._norm_medications) sigue operando sobre los chips seleccionados; el
                backend conserva `otherMedications` como campo de LECTURA para perfiles legacy
                (compat, ver _FREE_TEXT_COMPANION_FIELDS en routers/plans.py) pero el wizard ya no
                escribe en él. */}
            {/* [P1-FORM-7] Mismo patrón que QDislikes (P0-FORM-4): requiere
                señal explícita (chip / "Ninguna") antes de avanzar. ANTES, el
                step se titulaba "Condiciones Médicas (Opcional)" y el botón
                siempre estaba habilitado. Usuarios con hipertensión /
                diabetes podían avanzar sin marcar nada (asumiendo que era
                opcional) → LLM no recibía esa señal de seguridad → plan
                podía incluir comidas inadecuadas para su condición.
                Convertir la ambigüedad en señal explícita: si no tienen
                condición, marcan "Ninguna" — un click cuesta menos que un
                mal plan médico. `medicalConditions` alimenta el reviewer
                médico (`graph_orchestrator.review_node`), el filtro de
                catálogo, y el prompt LLM principal.
                [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] el OR-clause con
                `otherConditions` se retiró del gate: el input que lo
                escribía ya no existe, así que un usuario NUEVO nunca puede
                satisfacer el requisito solo con texto libre — debe marcar
                un chip o "Ninguna". `formData.otherConditions` legacy (si
                sobrevive de una sesión/localStorage pre-deploy) sigue
                viajando en el submit y el backend lo sigue aceptando como
                companion (compat), pero ya no gatea este botón. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={(formData.medicalConditions || []).length === 0}
            />
        </div>
    );
};
