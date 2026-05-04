import { useEffect, useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard, Input, Label } from '../../common/FormUI';
// [P1-3] Rangos biométricos compartidos con el backend (`_BIO_RANGES` en
// `backend/routers/plans.py`). Backend es source of truth; este import es
// solo para gating UX inmediato — bloquea "Siguiente" y aplica `min`/`max`
// nativo a los inputs.
// [P1-FORM-8] `DIET_TYPES` es el SSOT del enum de tipos de dieta — espejo de
// `_DIET_TYPE_ENUM` en `backend/routers/plans.py`. QDietType consume esta
// lista para renderizar los chips, evitando hardcodear los strings en cada
// `<DietOption val=...>`. Una invariant runtime más abajo verifica que la
// metadata UI (`DIET_TYPE_META`) cubre exactamente la misma lista — si un
// futuro PR añade un tipo a `DIET_TYPES` sin actualizar la metadata, el
// componente avisa explícitamente en consola.
import { BIO_RANGES, DIET_TYPES, isBiometricInRange } from '../../../config/formValidation';
// [P1-FORM-2] SSOT de sentinels exclusivos. Antes cada Q* declaraba su
// `const SENTINEL = "Ninguna"` o `"Ninguno"` localmente; cambiar el copy en
// uno y olvidar los demás rompía la detección de exclusividad y la
// contradicción reaparecía en backend (P0-FORM-1). Ver
// `frontend/src/config/sentinels.js` para el contrato con backend
// (`_SENTINEL_NONE_VALUES` en `graph_orchestrator.py`).
import { SENTINELS } from '../../../config/sentinels';
import {
    User, UserCircle, Sun, Moon, RefreshCw,
    Battery, Target, Clock, CheckCircle, ChefHat,
    Wallet, Banknote, Landmark, Infinity, Utensils, UtensilsCrossed,
    Leaf, Salad, TrendingUp, Zap, Shield,
    AlertTriangle, Frown, Users, XCircle, HelpCircle,
    Check, Pill, ArrowRight, Ban, Milk, Wheat, Egg, Fish, Nut, Activity, Heart, AlertCircle, Timer
} from 'lucide-react';
import { motion } from 'framer-motion';

// --- Reusable Navigation Button for Manual Steps ---
export const NextButton = ({ onClick, disabled, label = "Siguiente", icon: Icon = ArrowRight }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={{
            padding: '1rem 3rem',
            background: disabled ? '#F1F5F9' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
            color: disabled ? '#94A3B8' : 'white',
            border: 'none',
            borderRadius: '1rem',
            fontWeight: 800,
            fontSize: '1.15rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            boxShadow: disabled ? 'none' : '0 10px 25px -5px rgba(37, 99, 235, 0.4)',
            opacity: disabled ? 0.8 : 1,
            transition: 'all 0.3s',
            marginTop: '2rem',
            justifyContent: 'center',
            width: '100%'
        }}
    >
        {label} <Icon size={20} />
    </button>
);

// --- Componentes Reutilizables Extraídos de los Steps Originales ---
const DietOption = ({ val, label, icon: Icon, desc, isSelected, onSelect }) => (
    <div
        onClick={() => onSelect(val)}
        style={{
            cursor: 'pointer', padding: '1rem', borderRadius: 'var(--radius-md)',
            border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
            backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'white',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.5rem',
            transition: 'all 0.2s ease', position: 'relative'
        }}
    >
        <div style={{ padding: '0.75rem', borderRadius: '50%', background: isSelected ? 'var(--primary)' : 'var(--bg-light)', color: isSelected ? 'white' : 'var(--text-muted)' }}>
            <Icon size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
        </div>
        {isSelected && <div style={{ position: 'absolute', top: 8, right: 8, color: 'var(--primary)' }}><Check size={16} /></div>}
    </div>
);

const ChipOption = ({ val, label, icon: Icon, isSelected, onToggle }) => (
    <div
        onClick={() => onToggle(val)}
        style={{
            cursor: 'pointer', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)',
            border: isSelected ? '1px solid var(--secondary)' : '1px solid var(--border)',
            backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.05)' : 'white',
            display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s ease'
        }}
    >
        {Icon && <Icon size={18} color={isSelected ? 'var(--secondary)' : 'var(--text-muted)'} />}
        <span style={{ fontSize: '0.9rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--secondary)' : 'var(--text-main)' }}>
            {label}
        </span>
    </div>
);

const GoalCard = ({ val, label, icon: Icon, color, isSelected, onSelect }) => (
    <div
        onClick={() => onSelect(val)}
        style={{
            cursor: 'pointer', padding: '1.25rem', borderRadius: 'var(--radius-lg)',
            border: isSelected ? `2px solid ${color}` : '1px solid var(--border)',
            backgroundColor: isSelected ? `${color}10` : 'white',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', textAlign: 'center',
            position: 'relative'
        }}
    >
        <div style={{ padding: '0.75rem', borderRadius: '50%', background: isSelected ? color : 'var(--bg-light)', color: isSelected ? 'white' : 'var(--text-muted)' }}>
            <Icon size={28} />
        </div>
        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</span>
        {isSelected && <div style={{ position: 'absolute', top: 10, right: 10, color: color }}><Check size={18} /></div>}
    </div>
);

// --- [P0-B1] Helper de toggle para multi-select con valor sentinel exclusivo ---
//
// Antes, `QAllergies`, `QMedical` y `QStruggles` cada uno tenía su propio
// `handleCheckboxChange` (toggle simple) más un `onToggle` inline para el chip
// "Ninguna"/"Ninguno". Cuando el usuario hacía:
//   1. Marcar "Ninguna" (lista pasa a `["Ninguna"]`)
//   2. Marcar "Lácteos" después
// el handler de Lácteos llamaba `handleCheckboxChange('allergies', 'Lácteos')`,
// que NO filtraba "Ninguna" — la lista quedaba `["Ninguna", "Lácteos"]`.
// El backend / RAG entonces inyectaba al prompt LITERAL "ALERGIA: Ninguna" Y
// "ALERGIA: Lácteos" simultáneamente — contradicción visible al revisor médico
// y ruido para el LLM.
//
// Este helper centraliza la regla:
//   - Item ya en la lista → toggle off (quita).
//   - Sentinel agregado → reemplaza la lista entera por `[sentinel]`.
//   - Item real agregado → push + filtra el sentinel si estaba.
// Resultado: marcar Ninguna → marcar Lácteos da exactamente `["Lácteos"]`.
const toggleArrayWithExclusiveSentinel = (currentArr, value, sentinel) => {
    const arr = Array.isArray(currentArr) ? currentArr : [];
    if (arr.includes(value)) {
        return arr.filter(item => item !== value);
    }
    if (value === sentinel) {
        return [sentinel];
    }
    return [...arr.filter(item => item !== sentinel), value];
};


// --- PREGUNTAS INDIVIDUALES ---

export const QGender = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <RadioCard
                name="gender" value="female" label="Mujer" icon={UserCircle}
                checked={formData.gender === 'female'}
                onChange={(e) => { updateData('gender', e.target.value); onAutoAdvance(); }}
            />
            <RadioCard
                name="gender" value="male" label="Hombre" icon={User}
                checked={formData.gender === 'male'}
                onChange={(e) => { updateData('gender', e.target.value); onAutoAdvance(); }}
            />
        </div>
    );
};

export const QMeasurements = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const [unit, setUnit] = useState('cm'); 
    const [feet, setFeet] = useState('');
    const [inches, setInches] = useState('');
    const [weightUnit, setWeightUnit] = useState(formData.weightUnit || 'lb');

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
        setFeet(ft); 
        setInches(inc);
        const f = parseFloat(ft) || 0; 
        const i = parseFloat(inc) || 0;
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
        // valor stale del DB. Patrón análogo al P0-FORM-2 (`_skipLunchTouched`).
        setWeightUnit(newUnit);
        updateData('weightUnit', newUnit);
        updateData('_weightUnitTouched', true);
        updateData('weight', '');
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
    const isFormValid = ageOK && heightOK && weightOK && bodyFatOK;

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <div>
                    <Label htmlFor="age">Edad (años)&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                    <Input
                        id="age" type="number" placeholder="Ej. 28"
                        min={BIO_RANGES.age.min} max={BIO_RANGES.age.max} step={BIO_RANGES.age.step}
                        value={formData.age} onChange={e => updateData('age', e.target.value)}
                    />
                </div>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <Label htmlFor="height" style={{ margin: 0 }}>Altura&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '0.5rem', padding: '3px' }}>
                            <button onClick={() => setUnit('cm')} style={{ border: 'none', background: unit === 'cm' ? 'white' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: unit === 'cm' ? 'var(--primary)' : '#64748B' }}>CM</button>
                            <button onClick={() => setUnit('ft')} style={{ border: 'none', background: unit === 'ft' ? 'white' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: unit === 'ft' ? 'var(--primary)' : '#64748B' }}>FT</button>
                        </div>
                    </div>
                    {unit === 'cm' ? (
                        <Input
                            id="height" type="number" placeholder="Ej. 170"
                            min={BIO_RANGES.heightCm.min} max={BIO_RANGES.heightCm.max} step={BIO_RANGES.heightCm.step}
                            value={formData.height} onChange={e => updateData('height', e.target.value)}
                        />
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Input
                                type="number" placeholder="Pies"
                                min={BIO_RANGES.heightFt.min} max={BIO_RANGES.heightFt.max} step={BIO_RANGES.heightFt.step}
                                value={feet} onChange={(e) => handleFtChange(e.target.value, inches)}
                            />
                            <Input
                                type="number" placeholder="Pulg"
                                min={BIO_RANGES.heightIn.min} max={BIO_RANGES.heightIn.max} step={BIO_RANGES.heightIn.step}
                                value={inches} onChange={(e) => handleFtChange(feet, e.target.value)}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <Label htmlFor="weight" style={{ margin: 0 }}>Peso&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                        {/* [P1-FORM-3] Border ámbar destacado cuando el usuario aún no
                            confirmó la unidad explícitamente. Antes el toggle pasaba
                            desapercibido y usuarios métricos tipeaban "70" como kg
                            pero se almacenaba como lb (≈31.7 kg) → BMR completamente
                            errado. El border desaparece cuando el usuario tapea
                            cualquiera de los dos botones (LB o KG), confirmando su
                            intención. El default ahora es locale-based en
                            AssessmentContext, así que para 99% de usuarios el border
                            es un confirm-prompt; el otro 1% lo usa para corregir. */}
                        <div style={{
                            display: 'flex',
                            background: '#F1F5F9',
                            borderRadius: '0.5rem',
                            padding: '3px',
                            border: formData._weightUnitTouched ? 'none' : '2px solid #F59E0B',
                            boxShadow: formData._weightUnitTouched ? 'none' : '0 0 0 3px rgba(245, 158, 11, 0.15)',
                            transition: 'all 0.2s ease',
                        }}>
                            <button onClick={() => handleWeightUnitChange('lb')} style={{ border: 'none', background: weightUnit === 'lb' ? 'white' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: weightUnit === 'lb' ? 'var(--primary)' : '#64748B' }}>LB</button>
                            <button onClick={() => handleWeightUnitChange('kg')} style={{ border: 'none', background: weightUnit === 'kg' ? 'white' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: weightUnit === 'kg' ? 'var(--primary)' : '#64748B' }}>KG</button>
                        </div>
                    </div>
                    <Input
                        id="weight" type="number" placeholder={weightUnit === 'lb' ? 'Ej. 150' : 'Ej. 70'}
                        min={weightRange.min} max={weightRange.max} step={weightRange.step}
                        value={formData.weight} onChange={e => updateData('weight', e.target.value)}
                    />
                    {!formData._weightUnitTouched && (
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#B45309',
                            marginTop: '0.35rem',
                            fontWeight: 500,
                        }}>
                            ⚠️ Confirma tu unidad de peso ({weightUnit.toUpperCase()} por defecto). Toca LB o KG para confirmar.
                        </div>
                    )}
                </div>
                <div>
                    <Label htmlFor="bodyFat">% Grasa (Opcional)</Label>
                    <Input
                        id="bodyFat" type="number" placeholder="Ej. 20"
                        min={BIO_RANGES.bodyFat.min} max={BIO_RANGES.bodyFat.max} step={BIO_RANGES.bodyFat.step}
                        value={formData.bodyFat} onChange={e => updateData('bodyFat', e.target.value)}
                    />
                </div>
            </div>

            <NextButton onClick={onManualAdvance} disabled={!isFormValid} />
        </div>
    );
};

export const QActivityLevel = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
                { val: 'sedentary', label: 'Sedentario', desc: 'Trabajo de escritorio, poco o ningún ejercicio.', icon: User },
                { val: 'light', label: 'Ligero', desc: 'Ejercicio suave de 1 a 3 días por semana.', icon: Activity },
                { val: 'moderate', label: 'Moderado', desc: 'Ejercicio moderado de 3 a 5 días por semana.', icon: Activity },
                { val: 'active', label: 'Activo', desc: 'Deportes fuertes o ejercicio 6 a 7 días por semana.', icon: TrendingUp },
                { val: 'athlete', label: 'Atleta', desc: 'Entrenamientos dobles, trabajo físico demandante.', icon: Target }
            ].map(opt => (
                <RadioCard
                    key={opt.val} name="activityLevel" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.activityLevel === opt.val}
                    onChange={(e) => { updateData('activityLevel', e.target.value); onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};

export const QSchedule = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {[
                { val: 'standard', label: 'Día (Tradicional)', desc: 'Duermo de noche, activo de día', icon: Sun },
                { val: 'night_shift', label: 'Turno Nocturno', desc: 'Duermo de día, trabajo de noche', icon: Moon },
                { val: 'variable', label: 'Rotativo / Variable', desc: 'Mi horario cambia constantemente', icon: RefreshCw }
            ].map((opt) => (
                <RadioCard
                    key={opt.val} name="scheduleType" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.scheduleType === opt.val}
                    onChange={(e) => { updateData('scheduleType', e.target.value); onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};

export const QSleep = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {['< 6 horas', '6-7 horas', '7-8 horas', '> 8 horas'].map(opt => (
                <RadioCard 
                    key={opt} name="sleepHours" value={opt} label={opt} icon={Moon} 
                    checked={formData.sleepHours === opt} 
                    onChange={(e) => { updateData('sleepHours', e.target.value); onAutoAdvance(); }} 
                />
            ))}
        </div>
    );
};

export const QStress = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {['Bajo', 'Moderado', 'Alto', 'Muy Alto'].map(opt => (
                <RadioCard 
                    key={opt} name="stressLevel" value={opt} label={opt} icon={Battery} 
                    checked={formData.stressLevel === opt} 
                    onChange={(e) => { updateData('stressLevel', e.target.value); onAutoAdvance(); }} 
                />
            ))}
        </div>
    );
};

export const QCookingTime = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {[
                { val: 'none', label: 'Nada', desc: 'Opciones directas, de 5 mins', icon: Timer },
                { val: '30min', label: 'Poco', desc: 'Máximo 30 min', icon: Clock },
                { val: '1hour', label: 'Medio', desc: '45-60 min', icon: CheckCircle },
                { val: 'plenty', label: 'Sin límite', desc: 'Me gusta cocinar', icon: ChefHat }
            ].map(opt => (
                <RadioCard
                    key={opt.val} name="cookingTime" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.cookingTime === opt.val}
                    onChange={(e) => { updateData('cookingTime', e.target.value); onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};

export const QBudget = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {[
                { val: 'low', label: 'Económico', desc: 'Lo básico y esencial', icon: Wallet },
                { val: 'medium', label: 'Moderado', desc: 'Equilibrio calidad/precio', icon: Banknote },
                { val: 'high', label: 'Alto', desc: 'Mayor variedad', icon: Landmark },
                { val: 'unlimited', label: 'Sin límite', desc: 'Sin restricciones', icon: Infinity }
            ].map(opt => (
                <RadioCard
                    key={opt.val} name="budget" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.budget === opt.val}
                    onChange={(e) => { updateData('budget', e.target.value); onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};

// [P1-FORM-8] Metadata UI por cada tipo de dieta. Las claves DEBEN coincidir
// EXACTAMENTE con `DIET_TYPES` (SSOT de validación). El check de invariante
// debajo del componente avisa si hay drift.
const DIET_TYPE_META = {
    balanced:   { label: 'Balanceada',   icon: Utensils, desc: 'De todo un poco' },
    vegetarian: { label: 'Vegetariana',  icon: Leaf,     desc: 'Sin carne' },
    vegan:      { label: 'Vegana',       icon: Salad,    desc: '100% vegetal' },
};

// [P1-FORM-8] Invariante de desarrollo: `DIET_TYPE_META` debe cubrir
// exactamente las mismas claves que `DIET_TYPES`. Si un PR futuro añade
// "keto" al SSOT pero olvida la metadata UI, este aviso lo detecta en el
// primer mount durante dev. En prod (`import.meta.env.MODE !== 'development'`)
// el chequeo se omite — el render igual fallaría visualmente pero sin spam de
// consola. Vite reemplaza `import.meta.env.MODE` en build time, así que el
// bloque se elimina por dead-code elimination en producción.
if (import.meta.env?.MODE === 'development') {
    const metaKeys = Object.keys(DIET_TYPE_META);
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
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            {DIET_TYPES.map((diet) => {
                const meta = DIET_TYPE_META[diet];
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

export const QAllergies = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P0-B1] sentinel mutuamente exclusivo con cualquier alergia real.
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.allergies;
    const handleToggle = (value) => {
        const next = toggleArrayWithExclusiveSentinel(formData.allergies, value, SENTINEL);
        updateData('allergies', next);
        // [P0-FORM-1] Si el usuario acaba de activar el sentinel, limpia el textbox
        // libre `otherAllergies`. Sin esto, escribir "Maní" y luego marcar "Ninguna"
        // dejaba ambos campos en el payload — el backend mergeaba a
        // `["Ninguna","Maní"]` (contradicción de seguridad médica). El backend
        // tiene defensa en profundidad pero la fuente de verdad debe ser el form.
        if (next.length === 1 && next[0] === SENTINEL && (formData.otherAllergies || '').trim()) {
            updateData('otherAllergies', '');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                {[
                    { val: "Lacteos", label: "Lácteos", icon: Milk },
                    { val: "Gluten", label: "Gluten", icon: Wheat },
                    { val: "Huevo", label: "Huevo", icon: Egg },
                    { val: "Mariscos", label: "Mariscos", icon: Fish },
                    { val: "Frutos Secos", label: "Nueces", icon: Nut },
                    { val: "Soya", label: "Soya", icon: Leaf },
                ].map(opt => (
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={formData.allergies.includes(opt.val)} onToggle={handleToggle} />
                ))}
                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={formData.allergies.includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            <Input
                type="text" placeholder="Otra (Ej. Maní, Fresa...)" value={formData.otherAllergies || ''}
                onChange={(e) => updateData('otherAllergies', e.target.value)}
            />
            {/* [P1-2] Mismo patrón de enforcement explícito que QDislikes
                (P0-FORM-4), QMedical y QStruggles (P1-FORM-7). ANTES este
                NextButton no tenía `disabled`, así que el usuario podía
                avanzar con `allergies=[]` Y `otherAllergies=''` aún teniendo
                el title con asterisco rojo. El backend interpretaba `[]`
                como "sin alergias declaradas" → el LLM podía incluir maní /
                gluten / mariscos en el plan a un usuario que en realidad
                nunca respondió. ESTE es el chip más sensible de los cuatro
                porque el riesgo es de SAFETY MÉDICA directa, no de UX.
                Forzar señal explícita ("Ninguna" si no aplica) convierte la
                ambigüedad en consentimiento informado. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={
                    (formData.allergies || []).length === 0 &&
                    (formData.otherAllergies || '').trim() === ''
                }
            />
        </div>
    );
};

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
    const COMMON_DISLIKES = [
        { val: "Cilantro", label: "Cilantro", icon: Leaf },
        { val: "Hígado", label: "Hígado", icon: AlertTriangle },
        { val: "Berenjena", label: "Berenjena", icon: Salad },
        { val: "Pescado", label: "Pescado", icon: Fish },
        { val: "Mariscos", label: "Mariscos", icon: Fish },
        { val: "Brócoli", label: "Brócoli", icon: Salad },
        { val: "Coliflor", label: "Coliflor", icon: Salad },
        { val: "Hongos", label: "Hongos", icon: Salad },
        { val: "Cebolla", label: "Cebolla", icon: Salad },
        { val: "Aguacate", label: "Aguacate", icon: Salad },
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
            <Input
                type="text" placeholder="Otros (Ej. Apio, Curry, Picante...)"
                value={formData.otherDislikes || ''}
                onChange={(e) => updateData('otherDislikes', e.target.value)}
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

export const QMedical = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P0-B1] sentinel exclusivo con cualquier condición médica real.
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.medicalConditions;
    const handleToggle = (value) => {
        const next = toggleArrayWithExclusiveSentinel(formData.medicalConditions, value, SENTINEL);
        updateData('medicalConditions', next);
        // [P0-FORM-1] ver QAllergies. Mismo patrón: contradicción "Ninguna" +
        // texto libre con condición real es un riesgo médico (hipertensión,
        // diabetes); el LLM podría descartar la condición real al ver el sentinel.
        if (next.length === 1 && next[0] === SENTINEL && (formData.otherConditions || '').trim()) {
            updateData('otherConditions', '');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {['Diabetes T2', 'Hipertensión', 'Colesterol Alto', 'Gastritis', 'SOP (PCOS)', 'Hipotiroidismo'].map(opt => (
                    <ChipOption key={opt} val={opt} label={opt} icon={opt === 'Hipertensión' ? Heart : (opt === 'Colesterol Alto' ? AlertCircle : Activity)} isSelected={formData.medicalConditions.includes(opt)} onToggle={handleToggle} />
                ))}
                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={formData.medicalConditions.includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            <Input
                type="text" placeholder="Otra condición médica..." value={formData.otherConditions || ''}
                onChange={(e) => updateData('otherConditions', e.target.value)}
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

export const QMainGoal = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            {[
                { val: "lose_fat", label: "Perder Grasa", icon: TrendingUp, color: "#ef4444" },
                { val: "gain_muscle", label: "Ganar Músculo", icon: Zap, color: "#3b82f6" },
                { val: "maintenance", label: "Mantenimiento", icon: Shield, color: "#10b981" },
                { val: "performance", label: "Rendimiento", icon: Target, color: "#8b5cf6" }
            ].map(opt => (
                <GoalCard 
                    key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} color={opt.color} 
                    isSelected={formData.mainGoal === opt.val} 
                    onSelect={(val) => { updateData('mainGoal', val); onAutoAdvance(); }} 
                />
            ))}
        </div>
    );
};

export const QStruggles = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P0-B1] sentinel exclusivo con cualquier struggle real (masculino,
    // distinto de QAllergies/QMedical que usan femenino).
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.struggles;
    const handleToggle = (value) => {
        const next = toggleArrayWithExclusiveSentinel(formData.struggles, value, SENTINEL);
        updateData('struggles', next);
        // [P0-FORM-1] ver QAllergies. Aunque struggles es UX/calidad, no safety,
        // mantener el patrón consistente evita drift y deja el contrato de
        // exclusividad uniforme en los 4 multi-select con sentinel.
        if (next.length === 1 && next[0] === SENTINEL && (formData.otherStruggles || '').trim()) {
            updateData('otherStruggles', '');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                {[
                    { val: "Ansiedad por dulces", label: "Ansiedad / Dulces", icon: AlertTriangle },
                    { val: "Atracones nocturnos", label: "Atracones", icon: Frown },
                    { val: "Falta de tiempo", label: "Falta de tiempo", icon: Clock },
                    { val: "Comida social/Salidas", label: "Salidas Sociales", icon: Users },
                    { val: "No sé cocinar", label: "No sé cocinar", icon: XCircle },
                    { val: "Me aburro rápido", label: "Me aburro rápido", icon: HelpCircle }
                ].map(opt => (
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={formData.struggles.includes(opt.val)} onToggle={handleToggle} />
                ))}

                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={formData.struggles.includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            <Input
                type="text" placeholder="Ej. Viajes frecuentes..." value={formData.otherStruggles || ''}
                onChange={(e) => updateData('otherStruggles', e.target.value)}
            />
            {/* [P1-FORM-7] Mismo patrón que QDislikes/QMedical: requiere
                señal explícita antes de avanzar. ANTES, "Mayores Obstáculos"
                permitía avanzar con `struggles=[]` y `otherStruggles=''` —
                LLM no recibía contexto de coaching personalizado. Si el
                usuario no tiene obstáculos, marca "Ninguno" (1 click) y
                el LLM sabe que el contexto está confirmado vacío, no
                "no respondió". `struggles` alimenta el RAG dynamic_query
                (graph_orchestrator.py:8662) y el prompt JSON dump del
                planner. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={
                    (formData.struggles || []).length === 0 &&
                    (formData.otherStruggles || '').trim() === ''
                }
            />
        </div>
    );
};

export const QMotivation = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
                <textarea
                    placeholder="Ej: Quiero recuperar mi energía diaria, prepararme para mi primera carrera..."
                    value={formData.motivation || ''}
                    onChange={(e) => updateData('motivation', e.target.value)}
                    rows={4}
                    style={{
                        width: '100%', padding: '1.25rem', paddingLeft: '3rem', borderRadius: '1rem',
                        border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit',
                        resize: 'vertical', outline: 'none', transition: 'all 0.25s ease', background: 'white'
                    }}
                />
                <div style={{ position: 'absolute', top: '1.25rem', left: '1rem', color: 'var(--text-muted)' }}>
                    <Battery size={20} />
                </div>
            </div>
            {/* [P0-FORM-3] `disabled` ahora trim-aware. Antes `!formData.motivation`
                trataba "   " (whitespace) como truthy → el usuario podía teclear
                espacios y avanzar. Backend ahora también rechaza con 422 vía
                `value.strip() == ""` en `_validate_form_data_min`, pero el gate
                frontend evita quemar quota y entrega feedback inmediato.
                `motivation` es consumido por `build_motivation_context` →
                planner + day generator del LLM. */}
            <NextButton
                onClick={onManualAdvance}
                disabled={!formData.motivation || formData.motivation.trim() === ''}
            />
        </div>
    );
};

export const QHousehold = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    
    // Initialize householdSize if not set so default visual "1" matches actual state
    useEffect(() => {
        if (!formData.householdSize) updateData('householdSize', 1);
    }, []);

    const handlePersonSelect = (num) => {
        updateData('householdSize', num);
    };

    const handleDurationSelect = (val) => {
        updateData('groceryDuration', val);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* --- Personas --- */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Users size={18} color="#7C3AED" />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>¿Cuántas personas comen?</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                    {[1, 2, 3, 4, 5, 6].map(num => {
                        const isSelected = (formData.householdSize || 1) === num;
                        return (
                            <div
                                key={num}
                                onClick={() => handlePersonSelect(num)}
                                style={{
                                    cursor: 'pointer',
                                    padding: '0.85rem 0.5rem',
                                    borderRadius: '0.75rem',
                                    border: isSelected ? '2px solid #7C3AED' : '1.5px solid #E2E8F0',
                                    backgroundColor: isSelected ? '#F5F3FF' : 'white',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    boxShadow: isSelected ? '0 4px 12px rgba(124, 58, 237, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)'
                                }}
                            >
                                <span style={{ fontSize: '1.3rem' }}>
                                    {num === 1 ? '👤' : num <= 3 ? '👥' : '👨‍👩‍👧‍👦'}
                                </span>
                                <span style={{
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    color: isSelected ? '#7C3AED' : '#334155'
                                }}>
                                    {num}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 500 }}>
                                    {num === 1 ? 'Individual' : `×${num}`}
                                </span>
                                {isSelected && (
                                    <div style={{ position: 'absolute', top: 6, right: 6, color: '#7C3AED' }}>
                                        <Check size={14} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- Ciclo de Despensa --- */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Clock size={18} color="#059669" />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>¿Cada cuánto haces compras?</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                    {[
                        { val: 'weekly', label: '7 Días', sub: 'Semanal', emoji: '📅' },
                        { val: 'biweekly', label: '15 Días', sub: 'Quincenal', emoji: '📆' },
                        { val: 'monthly', label: '1 Mes', sub: 'Mensual', emoji: '🗓️' }
                    ].map(opt => {
                        const isSelected = formData.groceryDuration === opt.val;
                        return (
                            <div
                                key={opt.val}
                                onClick={() => handleDurationSelect(opt.val)}
                                style={{
                                    cursor: 'pointer',
                                    padding: '1rem 0.75rem',
                                    borderRadius: '0.75rem',
                                    border: isSelected ? '2px solid #10B981' : '1.5px solid #E2E8F0',
                                    backgroundColor: isSelected ? '#ECFDF5' : 'white',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    boxShadow: isSelected ? '0 4px 12px rgba(16, 185, 129, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)'
                                }}
                            >
                                <span style={{ fontSize: '1.3rem' }}>{opt.emoji}</span>
                                <span style={{
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    color: isSelected ? '#059669' : '#334155'
                                }}>
                                    {opt.label}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 500 }}>
                                    {opt.sub}
                                </span>
                                {isSelected && (
                                    <div style={{ position: 'absolute', top: 6, right: 6, color: '#10B981' }}>
                                        <Check size={14} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* [P1-B5] Toggle `skipLunch` — el backend ya consume este campo para
                redistribuir macros (ai_helpers.py:282-286), saltar validación de
                legumbre y cambiar comportamiento del agente. Antes el campo siempre
                llegaba como `false` porque el formulario no lo capturaba.
                Ubicado dentro de QHousehold porque la decisión de saltar almuerzo
                afecta directamente las cantidades de la lista de compras. */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <UtensilsCrossed size={18} color="#EA580C" />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>¿Sueles saltarte el almuerzo?</span>
                </div>
                <div
                    onClick={() => {
                        // [P0-FORM-2] Marca el toggle como tocado explícitamente.
                        // `_skipLunchTouched` persiste a localStorage junto con
                        // `skipLunch`, y un useEffect mount-only en
                        // `AssessmentContext` re-arma `editedFieldsRef` para que
                        // la hidratación async post-login (fetchProfile,
                        // secureLoadFormData) NO sobreescriba la decisión del
                        // usuario con un valor stale del DB. Sin esto, un usuario
                        // que toggleaba `skipLunch=true` perdía la decisión tras
                        // refresh → backend generaba 4 comidas en vez de 3 →
                        // distribución de macros rota.
                        updateData('skipLunch', !formData.skipLunch);
                        updateData('_skipLunchTouched', true);
                    }}
                    style={{
                        cursor: 'pointer',
                        padding: '1rem 1.25rem',
                        borderRadius: '0.75rem',
                        border: formData.skipLunch ? '2px solid #EA580C' : '1.5px solid #E2E8F0',
                        backgroundColor: formData.skipLunch ? '#FFF7ED' : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: formData.skipLunch ? '#C2410C' : '#334155' }}>
                            {formData.skipLunch ? 'Sí, suelo saltarlo' : 'No, almuerzo siempre'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#94A3B8', lineHeight: 1.3 }}>
                            Adaptaremos la distribución de macros y la lista de compras.
                        </span>
                    </div>
                    {/* Toggle UI */}
                    <div style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: formData.skipLunch ? '#EA580C' : '#CBD5E1', position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 3, left: formData.skipLunch ? 23 : 3, transition: 'all 0.2s' }} />
                    </div>
                </div>
            </div>

            {/* Nota informativa */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                padding: '0.75rem 1rem', borderRadius: '0.75rem',
                background: 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
                border: '1px solid #E2E8F0'
            }}>
                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: '0.75rem', color: '#64748B', lineHeight: 1.4 }}>
                    Podrás ajustar esto rápidamente desde tu panel sin regenerar el plan.
                </span>
            </div>
            <NextButton onClick={onManualAdvance} disabled={!formData.householdSize || !formData.groceryDuration} />
        </div>
    );
};

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
                style={{
                    cursor: 'pointer', padding: '1.25rem 1.5rem',
                    borderRadius: formData.includeSupplements ? '1rem 1rem 0 0' : '1rem',
                    border: formData.includeSupplements ? '2px solid #8b5cf6' : '1px solid var(--border)',
                    backgroundColor: formData.includeSupplements ? 'rgba(139, 92, 246, 0.03)' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem'
                }}
            >
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: formData.includeSupplements ? '#8b5cf6' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Pill size={20} color={formData.includeSupplements ? '#8b5cf6' : 'var(--text-muted)'} />
                        Incluir Suplementos 
                    </div>
                </div>
                {/* Toggle UI */}
                <div style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: formData.includeSupplements ? '#8b5cf6' : '#CBD5E1', position: 'relative' }}>
                     <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 3, left: formData.includeSupplements ? 23 : 3, transition: 'all 0.2s' }} />
                </div>
            </div>

            {formData.includeSupplements && (
                <div style={{ padding: '1.5rem 1rem', border: '2px solid #8b5cf6', borderTop: 'none', borderRadius: '0 0 1rem 1rem', marginTop: '-1.5rem', backgroundColor: 'rgba(139, 92, 246, 0.02)' }}>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        * Si no marcas ninguno, la IA sugerirá los más adecuados para tu meta.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.75rem' }}>
                        {[
                            { val: 'whey_protein', label: 'Proteína Whey', emoji: '🥛' },
                            { val: 'vegan_protein', label: 'Prot. Vegana', emoji: '🌱' },
                            { val: 'creatine', label: 'Creatina', emoji: '⚡' },
                            { val: 'bcaa', label: 'BCAA / EAA', emoji: '💪' },
                            { val: 'pre_workout', label: 'Pre-Entreno', emoji: '🔥' },
                            { val: 'fat_burner', label: 'Quemador Grasa', emoji: '🌶️' },
                            { val: 'collagen', label: 'Colágeno', emoji: '✨' },
                            { val: 'multivitamin', label: 'Multivitamínico', emoji: '💊' },
                            { val: 'omega3', label: 'Omega-3', emoji: '🐟' },
                            { val: 'magnesium', label: 'Magnesio', emoji: '🌙' },
                            { val: 'probiotics', label: 'Probióticos', emoji: '🦠' },
                            { val: 'electrolytes', label: 'Electrolitos', emoji: '💧' },
                        ].map(supp => {
                            const isSelected = (formData.selectedSupplements || []).includes(supp.val);
                            return (
                                <div
                                    key={supp.val}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const current = formData.selectedSupplements || [];
                                        const updated = current.includes(supp.val) ? current.filter(s => s !== supp.val) : [...current, supp.val];
                                        updateData('selectedSupplements', updated);
                                    }}
                                    style={{
                                        cursor: 'pointer', padding: '0.75rem', borderRadius: '0.75rem',
                                        border: isSelected ? '1.5px solid #8b5cf6' : '1px solid #e2e8f0',
                                        backgroundColor: isSelected ? 'white' : 'white', display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}
                                >
                                    <span>{supp.emoji}</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#7c3aed' : 'var(--text-main)' }}>{supp.label}</span>
                                    {isSelected && <Check size={14} color="#8b5cf6" style={{ marginLeft: 'auto' }} />}
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
