// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
// [P1-FORM-2] SSOT de sentinels exclusivos — rationale completo en QAllergies.jsx y config/sentinels.js.
import { SENTINELS } from '../../../config/sentinels';
// [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] cap espejo del knob backend
// `MEALFIT_MAX_MEDICAL_CONDITIONS` — ver comentario SSOT en formValidation.js.
import { MAX_MEDICAL_CONDITIONS } from '../../../config/formValidation';
import {
    Activity, AlertTriangle, Baby, Ban, BatteryLow, Bone, Brain, CircleHelp, Croissant,
    Droplet, Droplets, Filter, Flame, HeartPulse, Milk, Pill, Slice, Syringe, TestTube, Venus,
} from 'lucide-react';
import { ChipOption, PREGNANCY_CHIP_LABELS, toggleArrayWithExclusiveSentinel } from './_shared';
import { NextButton } from './NextButton';
import { useT } from '../../../i18n';

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
    // [P1-MEDICAL-SCOPE-GATE · 2026-08-09] Los 4 chips nuevos.
    'Enfermedad Renal': Filter,      // el riñón filtra
    'Anemia': Droplets,              // hierro / sangre
    'Gota / Ácido Úrico': Bone,      // afecta articulaciones
    'Hígado Graso': Croissant,       // hígado / grasa hepática
};

/* [P1-MEDICAL-SCOPE-GATE · 2026-08-09] EL FORMULARIO PREGUNTABA MENOS DE LO QUE
   EL MOTOR SABE. `condition_rules.CONDITION_RULES` tiene 12 reglas clínicas
   completas y este paso ofrecía 7 chips: enfermedad renal, anemia ferropénica,
   gota e hígado graso tenían regla escrita y eran INDECLARABLES desde aquí.
   Quien las tenía recibía un plan sin ninguna de sus reglas aplicadas y sin
   ningún aviso — el motor nunca se enteraba.

   Los labels no son decorativos: cada uno CONTIENE un `term` de su regla, que
   es como `detect_active_rules` los reconoce (`any(t in c for t in r.terms)`
   sobre el string en minúsculas y sin acentos). Verificado uno a uno que cada
   chip dispara EXACTAMENTE una regla y ninguno colisiona con otra — esa
   comprobación es obligatoria al tocar esta lista, porque el matcher es por
   SUBCADENA y este repo lleva 16 incidentes de esa clase. El test ancla la
   correspondencia chip→regla para que un renombre no la rompa en silencio. */

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
    // [P1-MEDICAL-SCOPE-GATE · 2026-08-09] IMAO — Brain (antidepresivo).
    'Antidepresivo IMAO': Brain,
};

/* [P1-MEDICAL-SCOPE-GATE · 2026-08-09] LAS DOS SEÑALES DE «FUERA DE ALCANCE».

   El motor aplica reglas clínicas de un registry ACOTADO (12 condiciones, 13
   familias de fármaco). Lo que cae fuera no producía ni regla ni aviso: se
   generaba un plan como si el usuario no hubiera declarado nada. Estos dos
   chips convierten ese silencio en una señal explícita que bloquea.

   POR QUÉ UN CHIP Y NO TEXTO LIBRE. La decisión la toma un valor EXACTO, no
   una cadena que haya que interpretar. Un blocklist de palabras sobre prosa
   sería la 17ª subcadena de este repo, y aquí las dos direcciones del error
   son graves: un falso positivo DENIEGA el servicio, un falso negativo
   ENTREGA un plan inseguro.

   Los literales se espejan en el backend (`_OUT_OF_SCOPE_*` en routers/plans.py)
   y un test ancla que no drifteen — si dejan de coincidir, el gate del
   servidor deja de reconocer lo que este formulario emite y el bloqueo se
   evapora en silencio. */
export const OUT_OF_SCOPE_CONDITION = 'Otra condición (no listada)';
export const OUT_OF_SCOPE_MEDICATION = 'Otro medicamento (no listado)';

// [P1-OUTSCOPE-SKIP-GATE · 2026-08-12] SSOT del gate «fuera de alcance» para
// las TRES puertas que pueden dejar atrás este paso (botón del paso, salto,
// submit) — el patrón exacto de P1-SKIP-RESPECTS-BUDGET: la regla vivía SOLO
// en el disabled del NextButton, y saltar es precisamente no pasar por el
// paso. Aquí lo que se puenteaba no era un piso económico sino un gate de
// seguridad clínica (el backend lo rechaza igual, pero tras quemar el
// roundtrip y con un 422 genérico en la cara del usuario).
export const hasOutOfScopeMedical = (fd) =>
    (fd?.medicalConditions || []).includes(OUT_OF_SCOPE_CONDITION)
    || (fd?.medications || []).includes(OUT_OF_SCOPE_MEDICATION);

export const QMedical = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const t = useT();
    // [P0-B1] sentinel exclusivo con cualquier condición médica real.
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.medicalConditions;
    // [P1-I18N-DASHBOARD · 2026-08-15] Etiqueta derivada del sentinel con clave
    // estática — mismo patrón y mismo porqué que en QAllergies.jsx.
    const sentinelLabel = SENTINEL === 'Ninguna' ? t('Ninguna') : SENTINEL;
    /* [P1-I18N-DASHBOARD · 2026-08-15] SOLO ETIQUETAS. Los `val` —los arrays
       literales que se renderizan más abajo— NO se traducen NUNCA: cada literal
       CONTIENE el `term` con el que `detect_active_rules` / `medication_rules`
       reconocen la regla clínica por SUBCADENA (ver P1-MEDICAL-SCOPE-GATE arriba),
       y los dos `OUT_OF_SCOPE_*` se espejan literal en `routers/plans.py`; traducir
       un valor apagaría la regla en silencio. Esos arrays siguen siendo la lista
       SSOT (y lo que ancla `test_p1_medical_scope_gate.py`).

       Por qué la tabla repite los literales en vez de `t(opt)`: una clave dinámica
       no la ve `npm run i18n:check`, así que ningún catálogo llegaría a tenerla y
       el chip quedaría sin traducir para siempre y sin aviso. Con el `?? opt` de
       abajo, un chip nuevo que se olvide aquí se pinta en español —degradación
       honesta— y jamás con un valor distinto. */
    const conditionLabels = {
        'Diabetes T2': t('Diabetes T2'),
        'Hipertensión': t('Hipertensión'),
        'Colesterol Alto': t('Colesterol Alto'),
        'Gastritis': t('Gastritis'),
        'SOP (PCOS)': t('SOP (PCOS)'),
        'Hipotiroidismo': t('Hipotiroidismo'),
        'Cirugía Bariátrica': t('Cirugía Bariátrica'),
        'Enfermedad Renal': t('Enfermedad Renal'),
        'Anemia': t('Anemia'),
        'Gota / Ácido Úrico': t('Gota / Ácido Úrico'),
        'Hígado Graso': t('Hígado Graso'),
    };
    const pregnancyLabels = { 'Embarazo': t('Embarazo'), 'Lactancia': t('Lactancia') };
    const medicationLabels = {
        'Metformina': t('Metformina'),
        'Insulina': t('Insulina'),
        'Glibenclamida': t('Glibenclamida'),
        'Lisinopril': t('Lisinopril'),
        'Losartán': t('Losartán'),
        'Amlodipina': t('Amlodipina'),
        'Hidroclorotiazida': t('Hidroclorotiazida'),
        'Espironolactona': t('Espironolactona'),
        'Atorvastatina': t('Atorvastatina'),
        'Levotiroxina': t('Levotiroxina'),
        'Omeprazol': t('Omeprazol'),
        'Prednisona': t('Prednisona'),
        'Warfarina': t('Warfarina'),
        'Alopurinol': t('Alopurinol'),
        'Antidepresivo IMAO': t('Antidepresivo IMAO'),
    };
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
                t('Máximo {n} condiciones para garantizar la calidad clínica del plan. Deselecciona una para cambiar.', { n: MAX_MEDICAL_CONDITIONS })
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

    // [P1-MEDICAL-SCOPE-GATE · 2026-08-09] ¿Declaró algo fuera del registry
    // clínico? Cualquiera de las dos señales basta: una condición no listada y
    // un fármaco no listado son el mismo problema (el motor no tiene regla que
    // aplicar) aunque medicamentos sea un campo opcional.
    // [P1-OUTSCOPE-SKIP-GATE] Mismo SSOT que consumen salto y submit.
    const outOfScopeSelected = hasOutOfScopeMedical(formData);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {['Diabetes T2', 'Hipertensión', 'Colesterol Alto', 'Gastritis', 'SOP (PCOS)', 'Hipotiroidismo', 'Cirugía Bariátrica', 'Enfermedad Renal', 'Anemia', 'Gota / Ácido Úrico', 'Hígado Graso'].map(opt => (
                    <ChipOption
                        key={opt} val={opt} label={conditionLabels[opt] ?? opt} icon={CONDITION_ICONS[opt] || Activity}
                        isSelected={(formData.medicalConditions || []).includes(opt)}
                        onToggle={handleToggle}
                        disabled={isConditionChipDisabled(opt)}
                    />
                ))}
                {/* [P1-MEDICAL-SCOPE-GATE · 2026-08-09] Fuera del cap a propósito
                    (igual que Embarazo/Lactancia): declarar «tengo algo que no está
                    aquí» nunca debe quedar impedido por haber marcado ya 3. */}
                <ChipOption
                    val={OUT_OF_SCOPE_CONDITION} label={t('Otra condición')} icon={CircleHelp}
                    isSelected={(formData.medicalConditions || []).includes(OUT_OF_SCOPE_CONDITION)}
                    onToggle={handleToggle}
                />
                <ChipOption
                    val={SENTINEL} label={sentinelLabel} icon={Ban}
                    isSelected={(formData.medicalConditions || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P1-MEDICAL-SCOPE-GATE · 2026-08-09] El aviso de alcance. Se dice
                AQUÍ y no al generar: hacerle rellenar cinco pasos más para
                bloquearlo al final sería faltarle el respeto a su tiempo.

                El tono importa y es una decisión, no adorno: un gate que
                castiga la declaración enseña a ocultar. Si esto se leyera como
                un castigo, quien quiere su plan desmarca el chip y su condición
                pasa de DECLARADA a INVISIBLE — estrictamente peor que antes.
                Por eso nombra el límite como nuestro, no como suyo. */}
            {outOfScopeSelected && (
                <div
                    role="alert"
                    style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                        padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem', lineHeight: 1.5,
                        color: 'var(--warning-text)', backgroundColor: 'var(--warning-bg)',
                        border: '1px solid var(--warning-border)',
                    }}
                >
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>
                        <strong>{t('Todavía no podemos calcular un plan seguro para esa condición.')}</strong>
                        <br />
                        {t('Nuestro motor aplica reglas clínicas verificadas solo para las condiciones y medicamentos de esta lista. Fuera de ellas no podemos garantizar que el plan sea adecuado para ti, y preferimos decírtelo antes que entregarte algo que parezca calculado y no lo esté.')}
                        <br /><br />
                        {/* El énfasis obliga a partir la frase en tres claves; el «sí» va
                            aparte porque es justo la palabra que el <em> resalta. */}
                        {t('Si la que tienes')} <em>{t('sí')}</em> {t('está en la lista, desmárcala de aquí y márcala arriba. Si no, escríbenos: estamos ampliando la cobertura clínica y queremos saber cuál te falta.')}
                    </span>
                </div>
            )}
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
                        {t('¿Estás embarazada o lactando? (opcional)')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                        {/* [FORM-MEDICAL-ICONS · 2026-07-03] Baby (Embarazo) / Milk (Lactancia)
                            — antes ambos compartían Heart (genérico). */}
                        {PREGNANCY_CHIP_LABELS.map(opt => (
                            <ChipOption
                                key={opt} val={opt} label={pregnancyLabels[opt] ?? opt} icon={opt === 'Embarazo' ? Baby : Milk}
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
                {t('Medicamentos actuales (opcional)')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {/* [P1-MEDICAL-SCOPE-GATE · 2026-08-09] «Antidepresivo IMAO» es el
                    chip URGENTE de esta tanda: `medication_rules` tiene una regla
                    `maoi` (tiramina — quesos curados, embutidos, fermentados) y NO
                    había forma de dispararla desde el formulario. Tiramina + IMAO es
                    crisis hipertensiva: el motor sabía protegerte y el wizard no
                    dejaba decirlo. El label contiene «imao», que es el `term` que la
                    regla reconoce. */}
                {['Metformina', 'Insulina', 'Glibenclamida', 'Lisinopril', 'Losartán', 'Amlodipina', 'Hidroclorotiazida', 'Espironolactona', 'Atorvastatina', 'Levotiroxina', 'Omeprazol', 'Prednisona', 'Warfarina', 'Alopurinol', 'Antidepresivo IMAO'].map(med => (
                    <ChipOption
                        key={med} val={med} label={medicationLabels[med] ?? med} icon={MED_ICONS[med] || Pill}
                        isSelected={(formData.medications || []).includes(med)}
                        onToggle={handleMedToggle}
                    />
                ))}
                {/* [P1-MEDICAL-SCOPE-GATE · 2026-08-09] Simétrico al de condiciones.
                    Un fármaco fuera del registry es interacción no modelada — y aquí
                    el riesgo es más agudo que en condiciones, porque una interacción
                    fármaco-alimento no avisa antes de ocurrir. */}
                <ChipOption
                    val={OUT_OF_SCOPE_MEDICATION} label={t('Otro medicamento')} icon={CircleHelp}
                    isSelected={(formData.medications || []).includes(OUT_OF_SCOPE_MEDICATION)}
                    onToggle={handleMedToggle}
                />
                {/* [P3-MED-NONE-CHIP · 2026-07-01] Sentinel "Ninguno" exclusivo: al
                    marcarlo se deseleccionan los demás medicamentos. */}
                <ChipOption
                    val={MED_SENTINEL} label={MED_SENTINEL === 'Ninguno' ? t('Ninguno') : MED_SENTINEL} icon={Ban}
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
            {/* [P1-MEDICAL-SCOPE-GATE · 2026-08-09] `outOfScopeSelected` bloquea el
                avance. Es la PRIMERA de dos capas: el backend rechaza el mismo
                literal en `/api/plans` (`_OUT_OF_SCOPE_*`), porque una guarda solo
                de cliente es puenteable y aquí el punto entero es la seguridad. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={(formData.medicalConditions || []).length === 0 || outOfScopeSelected}
            />
        </div>
    );
};
