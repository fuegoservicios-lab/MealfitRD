// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useEffect, useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { Input, Label } from '../../common/FormUI';
// [P1-3] Rangos biométricos compartidos con el backend (`_BIO_RANGES` en
// `backend/routers/plans.py`). Backend es source of truth; este import es
// solo para gating UX inmediato — bloquea "Siguiente" y aplica `min`/`max`
// nativo a los inputs.
import { BIO_RANGES, isBiometricInRange } from '../../../config/formValidation';
import { NextButton } from './NextButton';

export const QMeasurements = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P1-13] `unit` derivado de formData (no `useState` local) para que
    // sobreviva al remount del componente cuando el usuario navega con
    // prevStep entre QMeasurements y QActivityLevel. ANTES, `useState('cm')`
    // re-arrancaba 'cm' por default al remontar, perdiendo la elección
    // explícita del usuario que había tipeado en ft/in. AHORA persiste a
    // localStorage vía `_heightInputUnit` en `initialFormData`.
    // [P3-DEFAULT-IMPERIAL · 2026-05-20] Default 'ft' (imperial) en lugar
    // de 'cm'. El user puede cambiar a cm via el toggle si prefiere métrico.
    // Solo aplica al PRIMER visit (cuando no hay `_heightInputUnit` aún en
    // formData/localStorage). Si el user ya guardó 'cm' explícitamente,
    // ese valor persiste por el || left-side.
    const unit = formData._heightInputUnit || 'ft';
    const setUnit = (newUnit) => updateData('_heightInputUnit', newUnit);
    const [feet, setFeet] = useState('');
    const [inches, setInches] = useState('');
    // [P3-QMEAS-WEIGHTUNIT-DERIVED · 2026-06-01] Derivado de formData (NO espejado en
    // local state). Antes era `useState(formData.weightUnit||'lb')`: en dispositivo
    // nuevo el local arrancaba 'lb' y, si el usuario había guardado 'kg' sin re-tocar
    // el toggle (_weightUnitTouched=false → no en editedFieldsRef), la hidratación
    // async ponía formData.weightUnit='kg' DESPUÉS del mount pero el local seguía 'lb'
    // (ningún effect observaba formData.weightUnit) → validaba rango lb + placeholder
    // + toggle stale. Espeja el patrón del hermano `unit` de altura (L228, fuente única).
    const weightUnit = formData.weightUnit || 'lb';

    // [P1-9] Normaliza coma decimal a punto antes de persistir el valor.
    // En locales `es-DO`/`es-ES` los usuarios tipean "70,5" naturalmente,
    // y el navegador puede aceptarlo en `<input type="number">`. Sin esta
    // normalización, el state guardaba `"70,5"`:
    //   - `isBiometricInRange` (validation.js) sí lo normaliza para gating
    //     local, pero el envío al backend mandaba `weight: "70,5"`.
    //   - `_coerce_numeric` en backend `plans.py` también lo normaliza —
    //     entonces el plan se genera correctamente.
    //   - PERO la persistencia en `health_profile` y `mealfit_form` quedaba
    //     con la coma literal. Comparaciones de igualdad en
    //     `update_user_health_profile` (`old_w = float(...)`) podían fallar
    //     o producir drift entre sesiones (refresh → "70,5" stale en DB →
    //     re-hidrata distinto a lo que el usuario tipeó esta sesión).
    // Fix: normalizar AQUÍ, en el límite de persistencia (onChange),
    // garantizando que el state SIEMPRE tenga `.` decimal. Idempotente para
    // valores que ya tienen `.` o no son numéricos.
    const _normalizeDecimal = (raw) => {
        if (typeof raw !== 'string') return raw;
        return raw.replace(',', '.');
    };

    useEffect(() => {
        // Solo sincronizamos ft/in desde cm cuando el usuario cambia DE cm A ft
        // No queremos entrar en un ciclo infinito de redondeos mientras escribe
        if (unit === 'ft' && formData.height && !feet && !inches) {
            const totalInches = formData.height / 2.54;
            setFeet(Math.floor(totalInches / 12).toString());
            setInches(Math.round(totalInches % 12).toString());
        }
    }, [unit]); // Removed formData.height from dependency array so it doesn't overwrite while typing

    const handleFtChange = (ft, inc) => {
        // [P1-9] Normalizar coma decimal antes de persistir local + propagar.
        const ftN = _normalizeDecimal(ft);
        const incN = _normalizeDecimal(inc);
        setFeet(ftN);
        setInches(incN);
        const f = parseFloat(ftN) || 0;
        const i = parseFloat(incN) || 0;
        if (f > 0 || i > 0) {
            updateData('height', Math.round((f * 30.48) + (i * 2.54)).toString());
        } else {
            updateData('height', '');
        }
    };

    const handleWeightUnitChange = (newUnit) => {
        // [P1-FORM-3] Marca el toggle como tocado explícitamente.
        // `_weightUnitTouched` persiste a localStorage junto con `weightUnit`,
        // y el useEffect mount-only en AssessmentContext re-arma editedFieldsRef
        // para que la hidratación async post-login (fetchProfile,
        // secureLoadFormData) NO sobreescriba la elección del usuario con un
        // valor stale del DB. Mismo patrón que otros toggles "touched" del wizard.
        // [P3-QMEAS-WEIGHTUNIT-DERIVED · 2026-06-01] Sin setWeightUnit: weightUnit es
        // derivado de formData → updateData re-renderiza y el derivado refleja al instante.
        updateData('weightUnit', newUnit);
        updateData('_weightUnitTouched', true);
        updateData('weight', '');
        // [P1-CLINICAL-INTAKE · 2026-07-03] La meta de peso (QGoalTarget) vive en la
        // MISMA unidad que weight — cambiar la unidad sin limpiarla dejaría "140"
        // interpretado como kg. Mismo tratamiento que weight.
        if ((formData.targetWeight || '') !== '') updateData('targetWeight', '');
    };

    // [P1-3] Validación de rangos biométricos antes de habilitar "Siguiente".
    // Espejo de `_validate_form_data_ranges` en `backend/routers/plans.py`. La
    // altura se almacena SIEMPRE en cm (la UI ft/in convierte localmente vía
    // `handleFtChange`), así que validamos contra `heightCm` aunque el usuario
    // esté tipeando en ft/in. El peso se valida en su unidad seleccionada.
    const weightRange = weightUnit === 'kg' ? BIO_RANGES.weightKg : BIO_RANGES.weightLb;
    const ageOK = isBiometricInRange(formData.age, BIO_RANGES.age);
    const heightOK = isBiometricInRange(formData.height, BIO_RANGES.heightCm);
    const weightOK = isBiometricInRange(formData.weight, weightRange);
    // bodyFat es opcional — si está vacío, OK; si está, debe estar en rango.
    const bodyFatOK = isBiometricInRange(formData.bodyFat, BIO_RANGES.bodyFat, { optional: true });
    // [P1-CLINICAL-INTAKE · 2026-07-03] Cintura opcional (mismo contrato que bodyFat).
    const waistOK = isBiometricInRange(formData.waistCm, BIO_RANGES.waistCm, { optional: true });
    const isFormValid = ageOK && heightOK && weightOK && bodyFatOK && waistOK;

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <div>
                    <Label htmlFor="age">Edad (años)&nbsp;<span style={{ color: '#EF4444' }} aria-hidden="true">*</span></Label>
                    <Input
                        id="age" type="number" placeholder="Ej. 28"
                        min={BIO_RANGES.age.min} max={BIO_RANGES.age.max} step={BIO_RANGES.age.step}
                        value={formData.age} onChange={e => updateData('age', e.target.value)}
                        aria-required="true"
                    />
                </div>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <Label htmlFor="height" style={{ margin: 0 }}>Altura&nbsp;<span style={{ color: '#EF4444' }} aria-hidden="true">*</span></Label>
                        <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '0.5rem', padding: '3px' }}>
                            <button onClick={() => setUnit('cm')} style={{ border: 'none', background: unit === 'cm' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: unit === 'cm' ? 'var(--primary)' : 'var(--text-muted)' }}>CM</button>
                            <button onClick={() => setUnit('ft')} style={{ border: 'none', background: unit === 'ft' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: unit === 'ft' ? 'var(--primary)' : 'var(--text-muted)' }}>FT</button>
                        </div>
                    </div>
                    {unit === 'cm' ? (
                        <Input
                            id="height" type="number" inputMode="decimal" placeholder="Ej. 170"
                            min={BIO_RANGES.heightCm.min} max={BIO_RANGES.heightCm.max} step={BIO_RANGES.heightCm.step}
                            value={formData.height} onChange={e => updateData('height', _normalizeDecimal(e.target.value))}
                            aria-required="true"
                        />
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Input
                                type="number" placeholder="Pies" aria-label="Altura en pies"
                                min={BIO_RANGES.heightFt.min} max={BIO_RANGES.heightFt.max} step={BIO_RANGES.heightFt.step}
                                value={feet} onChange={(e) => handleFtChange(e.target.value, inches)}
                                aria-required="true"
                            />
                            <Input
                                type="number" placeholder="Pulg" aria-label="Altura en pulgadas"
                                min={BIO_RANGES.heightIn.min} max={BIO_RANGES.heightIn.max} step={BIO_RANGES.heightIn.step}
                                value={inches} onChange={(e) => handleFtChange(feet, e.target.value)}
                                aria-required="true"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <Label htmlFor="weight" style={{ margin: 0 }}>Peso&nbsp;<span style={{ color: '#EF4444' }} aria-hidden="true">*</span></Label>
                        {/* [LB-DEFAULT-PRESELECT · 2026-05-31] LB es la unidad de peso
                            por defecto predeterminada (decisión de producto: el mercado
                            es-DO usa libras). Pre-fix (P1-FORM-3) el toggle mostraba un
                            border ámbar + un warning "⚠️ Confirma tu unidad" que EXIGÍA
                            tocar LB/KG antes de continuar — fricción innecesaria para el
                            ~99% de usuarios que usan lb. Quitado: el toggle queda neutro
                            con LB ya seleccionado. El toggle SIGUE visible para que quien
                            use kg pueda cambiar, y al tocarlo `handleWeightUnitChange`
                            marca `_weightUnitTouched=true` (protege la elección explícita
                            de la hidratación async). `weightUnit='lb'` ya se envía al
                            backend por defecto (initialFormData), así que el contrato
                            P0-FORM-4 (weightUnit required + válido) se sigue cumpliendo. */}
                        <div style={{
                            display: 'flex',
                            background: 'var(--bg-muted)',
                            borderRadius: '0.5rem',
                            padding: '3px',
                            border: 'none',
                            transition: 'all 0.2s ease',
                        }}>
                            <button onClick={() => handleWeightUnitChange('lb')} style={{ border: 'none', background: weightUnit === 'lb' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: weightUnit === 'lb' ? 'var(--primary)' : 'var(--text-muted)' }}>LB</button>
                            <button onClick={() => handleWeightUnitChange('kg')} style={{ border: 'none', background: weightUnit === 'kg' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: weightUnit === 'kg' ? 'var(--primary)' : 'var(--text-muted)' }}>KG</button>
                        </div>
                    </div>
                    <Input
                        id="weight" type="number" inputMode="decimal" placeholder={weightUnit === 'lb' ? 'Ej. 150' : 'Ej. 70'}
                        min={weightRange.min} max={weightRange.max} step={weightRange.step}
                        value={formData.weight} onChange={e => updateData('weight', _normalizeDecimal(e.target.value))}
                        aria-required="true"
                    />
                </div>
                <div>
                    <Label htmlFor="bodyFat">% Grasa (Opcional)</Label>
                    <Input
                        id="bodyFat" type="number" inputMode="decimal" placeholder="Ej. 20"
                        min={BIO_RANGES.bodyFat.min} max={BIO_RANGES.bodyFat.max} step={BIO_RANGES.bodyFat.step}
                        value={formData.bodyFat} onChange={e => updateData('bodyFat', _normalizeDecimal(e.target.value))}
                    />
                </div>
                {/* [P1-CLINICAL-INTAKE · 2026-07-03] Cintura opcional: criterio de riesgo
                    cardiometabólico + señal de composición corporal que el peso solo no da.
                    Siempre en cm (una sola unidad — es como se mide con cinta en RD). */}
                <div>
                    <Label htmlFor="waistCm">Cintura en cm (Opcional)</Label>
                    <Input
                        id="waistCm" type="number" inputMode="decimal" placeholder="Ej. 85"
                        min={BIO_RANGES.waistCm.min} max={BIO_RANGES.waistCm.max} step={BIO_RANGES.waistCm.step}
                        value={formData.waistCm || ''} onChange={e => updateData('waistCm', _normalizeDecimal(e.target.value))}
                    />
                </div>
            </div>

            <NextButton onClick={onManualAdvance} disabled={!isFormValid} />
        </div>
    );
};
