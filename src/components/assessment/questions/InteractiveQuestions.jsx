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
import { BIO_RANGES, DIET_TYPES, SUPPLEMENTS, isBiometricInRange, budgetCycleDays } from '../../../config/formValidation';
// [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Mínimo personalizado por las metas (backend).
import { useBudgetFloor } from '../../../hooks/useBudgetFloor';
// [P1-FORM-2] SSOT de sentinels exclusivos. Antes cada Q* declaraba su
// `const SENTINEL = "Ninguna"` o `"Ninguno"` localmente; cambiar el copy en
// uno y olvidar los demás rompía la detección de exclusividad y la
// contradicción reaparecía en backend (P0-FORM-1). Ver
// `frontend/src/config/sentinels.js` para el contrato con backend
// (`_SENTINEL_NONE_VALUES` en `graph_orchestrator.py`).
import { SENTINELS } from '../../../config/sentinels';
import {
    Sun, Moon, MoonStar, AlarmClock, BedDouble, RefreshCw,
    Mars, Venus,
    Battery, BatteryFull, BatteryMedium, BatteryLow, BatteryWarning,
    Clock, ChefHat,
    Wallet, Banknote, Landmark, Infinity as InfinityIcon, UtensilsCrossed, Vegan, SlidersHorizontal,
    Leaf, Salad, Zap,
    Flame, BicepsFlexed, Scale, Gauge,
    AlertTriangle, Frown, Users, XCircle, HelpCircle,
    Check, Pill, ArrowRight, Ban, Milk, Wheat, Egg, Fish, Nut, Activity, Timer,
    Droplet, Droplets, HeartPulse, TestTube, Slice, Baby, Syringe,
    Beef, LeafyGreen, Shrimp, TreeDeciduous, Cloud, Sprout, Layers, Bean,
    CalendarDays, CalendarRange, CalendarClock,
    Hourglass,
    Armchair, Footprints, Bike, Dumbbell, Medal,
} from 'lucide-react';

// [P2-A] Activación por teclado para `<div role="button|switch">`. Replica el
// comportamiento nativo de <button>: Enter dispara el callback, Space también
// (con preventDefault para evitar scroll de página). Sin esto, los selectores
// tipo card son alcanzables con Tab pero NO se pueden activar con teclado —
// usuarios de lectores de pantalla y de keyboard-only quedan bloqueados.
const handleActivationKey = (callback) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        callback();
    }
};

// --- Reusable Navigation Button for Manual Steps ---
// [FORM-CTA-UNIFY · 2026-07-02] `style` permite overrides puntuales (ej. el flow
// externo pasa marginTop:0 porque su contenedor ya aporta el espaciado). Este
// componente es el ÚNICO look válido para el CTA primario del formulario — el
// "Siguiente Paso" del flow lo reutiliza; no dupliques botones inline planos.
export const NextButton = ({ onClick, disabled, label = "Siguiente", icon: Icon = ArrowRight, style = {} }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        // [CTA-HOVER-GLOW · 2026-05-31 · calmado FORM-CTA-STATIC 2026-07-03] El
        // box-shadow (base/disabled/hover/active/focus) vive en la clase `.mf-cta-btn`
        // de index.css — NO inline — para que los estados puedan variarlo sin que la
        // especificidad del estilo inline lo gane. A pedido del usuario: sin
        // desplazamiento en hover/active y glow discreto (sombra tenue de un solo
        // color). El gradiente/padding siguen inline.
        className="mf-cta-btn"
        style={{
            padding: '1rem 3rem',
            background: disabled ? 'var(--bg-muted)' : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
            color: disabled ? '#94A3B8' : 'white',
            border: 'none',
            borderRadius: '1rem',
            fontWeight: 800,
            fontSize: '1.15rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.8 : 1,
            transition: 'all 0.3s',
            marginTop: '2rem',
            justifyContent: 'center',
            width: '100%',
            ...style
        }}
    >
        {label} <Icon size={20} />
    </button>
);

// --- Componentes Reutilizables Extraídos de los Steps Originales ---
const DietOption = ({ val, label, icon: Icon, desc, isSelected, onSelect }) => (
    <div
        onClick={() => onSelect(val)}
        onKeyDown={handleActivationKey(() => onSelect(val))}
        role="button"
        aria-pressed={isSelected}
        tabIndex={0}
        style={{
            cursor: 'pointer', padding: '1rem', borderRadius: 'var(--radius-md)',
            border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
            backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-card)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.5rem',
            transition: 'all 0.2s ease', position: 'relative'
        }}
    >
        {/* [FORM-ICON-CIRCLE-CENTER · 2026-07-03] display:flex + centrado: sin esto el
            SVG inline se asienta en la baseline de texto y el line-height agrega espacio
            fantasma debajo → el círculo se vuelve óvalo y el icono queda descentrado. */}
        <div style={{ padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--primary)' : 'var(--bg-muted)', color: isSelected ? 'white' : 'var(--text-muted)' }}>
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
        onKeyDown={handleActivationKey(() => onToggle(val))}
        role="button"
        aria-pressed={isSelected}
        tabIndex={0}
        style={{
            cursor: 'pointer', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)',
            border: isSelected ? '1px solid var(--secondary)' : '1px solid var(--border)',
            backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
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
        onKeyDown={handleActivationKey(() => onSelect(val))}
        role="button"
        aria-pressed={isSelected}
        tabIndex={0}
        style={{
            cursor: 'pointer', padding: '1.25rem', borderRadius: 'var(--radius-lg)',
            border: isSelected ? `2px solid ${color}` : '1px solid var(--border)',
            backgroundColor: isSelected ? `${color}22` : 'var(--bg-card)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', textAlign: 'center',
            position: 'relative'
        }}
    >
        {/* [FORM-ICON-CIRCLE-CENTER · 2026-07-03] mismo fix de centrado que DietOption. */}
        <div style={{ padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? color : 'var(--bg-muted)', color: isSelected ? 'white' : 'var(--text-muted)' }}>
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

// [P1-PREGNANCY-INTAKE-CAPTURE · 2026-06-19] SSOT de los labels de embarazo/lactancia (chips de QMedical,
// gender-gated). Compartido con QGender para limpiar el huérfano si el usuario vuelve atrás y cambia el
// género a hombre tras haber marcado embarazo (evita un override silencioso e irrecuperable-vía-UI: el
// chip se oculta pero el valor seguía vivo en medicalConditions → forzaba maintenance + FS9 a un varón).
const PREGNANCY_CHIP_LABELS = ['Embarazo', 'Lactancia'];

export const QGender = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    // [P1-PREGNANCY-INTAKE-CAPTURE · 2026-06-19] Al fijar el género, limpia los chips de embarazo/lactancia
    // si el nuevo valor NO es mujer (los chips solo existen para mujeres; sin esto quedan huérfanos sin
    // chip visible para deseleccionarlos). Idempotente para 'female' (filter no-op si no hay valores).
    const setGender = (value) => {
        if (value !== 'female') {
            const cleaned = (formData.medicalConditions || []).filter(c => !PREGNANCY_CHIP_LABELS.includes(c));
            if (cleaned.length !== (formData.medicalConditions || []).length) updateData('medicalConditions', cleaned);
        }
        updateData('gender', value);
    };
    // [P6-FORM-RADIO-CLICK-FIX] Híbrido: `onChange` mantiene la persistencia
    // del valor en formData (necesario para back-navigation), `onClick`
    // SOLO dispara auto-advance cuando el valor YA estaba seleccionado
    // (caso donde onChange no fire por no haber cambio). Si los dos
    // dispararían advance, daría doble-trigger en cambio de opción.
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Símbolos biológicos universales (♀ ♂) — coherentes con
                el subtítulo "sexo biológico". Antes ambos chips usaban
                User/UserCircle (personas genéricas) y no se distinguían
                visualmente entre sí. */}
            <RadioCard
                name="gender" value="female" label="Mujer" icon={Venus}
                checked={formData.gender === 'female'}
                onChange={(e) => { setGender(e.target.value); onAutoAdvance(); }}
                onClick={() => { if (formData.gender === 'female') onAutoAdvance(); }}
            />
            <RadioCard
                name="gender" value="male" label="Hombre" icon={Mars}
                checked={formData.gender === 'male'}
                onChange={(e) => { setGender(e.target.value); onAutoAdvance(); }}
                onClick={() => { if (formData.gender === 'male') onAutoAdvance(); }}
            />
        </div>
    );
};

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
                // Progresión visual de actividad física: cada icono
                // representa el TIPO de movimiento del nivel.
                //   - Armchair (Sedentario): silla = trabajo de escritorio.
                //   - Footprints (Ligero): pasos = caminar / actividad suave.
                //   - Bike (Moderado): bicicleta = cardio moderado.
                //   - Dumbbell (Activo): pesas = entrenamiento de fuerza.
                //   - Medal (Atleta): medalla = nivel competitivo.
                // Antes Ligero y Moderado compartían `Activity` (no se
                // distinguían) y User/TrendingUp/Target eran abstractos.
                { val: 'sedentary', label: 'Sedentario', desc: 'Trabajo de escritorio, poco o ningún ejercicio.', icon: Armchair },
                { val: 'light', label: 'Ligero', desc: 'Ejercicio suave de 1 a 3 días por semana.', icon: Footprints },
                { val: 'moderate', label: 'Moderado', desc: 'Ejercicio moderado de 3 a 5 días por semana.', icon: Bike },
                { val: 'active', label: 'Activo', desc: 'Deportes fuertes o ejercicio 6 a 7 días por semana.', icon: Dumbbell },
                { val: 'athlete', label: 'Atleta', desc: 'Entrenamientos dobles, trabajo físico demandante.', icon: Medal }
            ].map(opt => (
                <RadioCard
                    key={opt.val} name="activityLevel" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.activityLevel === opt.val}
                    onChange={(e) => { updateData('activityLevel', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.activityLevel === opt.val) onAutoAdvance(); }}
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
                    onClick={() => { if (formData.scheduleType === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};

export const QSleep = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    // Progresión visual de calidad/cantidad de descanso:
    //   AlarmClock → Moon → MoonStar → BedDouble
    // Cada icono representa el estado de sueño del usuario:
    //   - AlarmClock (<6h): la alarma te despierta antes de descansar.
    //   - Moon (6-7h): sueño regular pero corto.
    //   - MoonStar (7-8h): sueño con estrella = calidad óptima.
    //   - BedDouble (>8h): cama = sueño abundante / dormilón.
    // Antes los 4 niveles usaban el mismo Moon → no se distinguían
    // visualmente y la card no comunicaba la calidad/cantidad.
    const _SLEEP_OPTIONS = [
        { val: '< 6 horas', icon: AlarmClock },
        { val: '6-7 horas', icon: Moon },
        { val: '7-8 horas', icon: MoonStar },
        { val: '> 8 horas', icon: BedDouble },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {_SLEEP_OPTIONS.map(opt => (
                <RadioCard
                    key={opt.val} name="sleepHours" value={opt.val} label={opt.val} icon={opt.icon}
                    checked={formData.sleepHours === opt.val}
                    onChange={(e) => { updateData('sleepHours', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.sleepHours === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};

export const QStress = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    // Progresión visual: la barra REPRESENTA el nivel de estrés —
    // a más estrés, más llena la barra (como un medidor que se
    // satura). El icono crece visualmente con la respuesta:
    //   Bajo      → BatteryLow (apenas marcada, calma)
    //   Moderado  → BatteryMedium (mitad)
    //   Alto      → BatteryFull (llena, mucho estrés acumulado)
    //   Muy Alto  → BatteryWarning (sobrecarga, alerta crítica)
    // Antes los 4 niveles usaban el mismo Battery → no se distinguían
    // visualmente y el chip seleccionado no comunicaba la severidad
    // de la respuesta del usuario.
    const _STRESS_OPTIONS = [
        { val: 'Bajo', icon: BatteryLow },
        { val: 'Moderado', icon: BatteryMedium },
        { val: 'Alto', icon: BatteryFull },
        { val: 'Muy Alto', icon: BatteryWarning },
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {_STRESS_OPTIONS.map(opt => (
                <RadioCard
                    key={opt.val} name="stressLevel" value={opt.val} label={opt.val} icon={opt.icon}
                    checked={formData.stressLevel === opt.val}
                    onChange={(e) => { updateData('stressLevel', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.stressLevel === opt.val) onAutoAdvance(); }}
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
                // Progresión literal de DURACIÓN de tiempo:
                //   Hourglass → Timer → Clock → Infinity
                // Cada icono representa exactamente el texto del label:
                //   - Hourglass (Nada): reloj de arena = "poco/nada de tiempo"
                //   - Timer (Poco): cronómetro corto = "30 min"
                //   - Clock (Medio): reloj completo = "ciclo de 45-60 min"
                //   - Infinity (Sin límite): ∞ = "sin restricción de tiempo"
                // Iteraciones previas con iconos de comida (Sandwich/Soup) o
                // energía (Zap) eran ambiguos — no comunicaban DURACIÓN
                // que es lo que el campo realmente mide.
                { val: 'none', label: 'Nada', desc: 'Opciones directas, de 5 mins', icon: Hourglass },
                { val: '30min', label: 'Poco', desc: 'Máximo 30 min', icon: Timer },
                { val: '1hour', label: 'Medio', desc: '45-60 min', icon: Clock },
                { val: 'plenty', label: 'Sin límite', desc: 'Me gusta cocinar', icon: InfinityIcon }
            ].map(opt => (
                <RadioCard
                    key={opt.val} name="cookingTime" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                    checked={formData.cookingTime === opt.val}
                    onChange={(e) => { updateData('cookingTime', e.target.value); onAutoAdvance(); }}
                    onClick={() => { if (formData.cookingTime === opt.val) onAutoAdvance(); }}
                />
            ))}
        </div>
    );
};

export const QBudget = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const isCustom = formData.budget === 'custom';
    // [BUDGET-CURRENCY · 2026-05-31] Moneda del monto custom. Default 'DOP'
    // (peso dominicano, RD$) — el usuario puede cambiar a 'USD' (US$). Se envía
    // al backend y `build_budget_context` la usa para el símbolo + escala.
    const budgetCurrency = formData.budgetCurrency || 'DOP';
    const currencySymbol = budgetCurrency === 'USD' ? 'US$' : 'RD$';
    // [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Mínimo PERSONALIZADO por las metas (calorías ×
    // hogar × ciclo) vía backend — el MISMO número que exige el gate de generación; fail-open al
    // estático mientras carga / si falla. Lo sincronizamos a `_budgetFloorMin` para que el gate
    // "Siguiente Paso" (validateExtra del flow) use EXACTAMENTE el mismo piso que mostramos
    // (evita "warning pero puede avanzar" → luego 422 del backend).
    const { min: minBudget, isPersonalized: budgetIsPersonalized } = useBudgetFloor(formData);
    const cycleDays = budgetCycleDays(formData.groceryDuration);
    useEffect(() => {
        if (Number(formData._budgetFloorMin) !== Number(minBudget)) {
            updateData('_budgetFloorMin', minBudget);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minBudget]);
    const _amountNum = Number(formData.budgetAmount);
    const belowMin = isCustom && formData.budgetAmount !== '' && formData.budgetAmount != null
        && _amountNum > 0 && _amountNum < minBudget;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                    { val: 'low', label: 'Económico', desc: 'Lo básico y esencial', icon: Wallet },
                    { val: 'medium', label: 'Moderado', desc: 'Equilibrio calidad/precio', icon: Banknote },
                    { val: 'high', label: 'Alto', desc: 'Mayor variedad', icon: Landmark },
                    { val: 'unlimited', label: 'Sin límite', desc: 'Sin restricciones', icon: InfinityIcon }
                ].map(opt => (
                    <RadioCard
                        key={opt.val} name="budget" value={opt.val} label={opt.label} desc={opt.desc} icon={opt.icon}
                        checked={formData.budget === opt.val}
                        onChange={(e) => { updateData('budget', e.target.value); onAutoAdvance(); }}
                        onClick={() => { if (formData.budget === opt.val) onAutoAdvance(); }}
                    />
                ))}
            </div>
            {/* [BUDGET-CUSTOM · 2026-05-31] "Personalizar": el usuario define su
                monto total de compras (RD$). NO auto-avanza — escribe el monto y
                avanza con el botón externo "Siguiente Paso" (gateado por
                `validateExtra` en InteractiveAssessmentFlow). `budget='custom'` +
                `budgetAmount` se envían al backend, que los inyecta al prompt del
                LLM (`build_budget_context`) para ajustar ingredientes al presupuesto. */}
            <RadioCard
                name="budget" value="custom" label="Personalizar"
                desc="Define tu monto total de compras"
                icon={SlidersHorizontal}
                checked={isCustom}
                onChange={() => updateData('budget', 'custom')}
                onClick={() => updateData('budget', 'custom')}
            />
            {isCustom && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Label htmlFor="budgetAmount" style={{ margin: 0 }}>Tu presupuesto total por ciclo de compras</Label>
                        {/* [BUDGET-CURRENCY · 2026-05-31] Toggle RD$ (peso dominicano,
                            default) / US$ (dólar). Mismo patrón visual que LB/KG. */}
                        <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '0.5rem', padding: '3px', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => updateData('budgetCurrency', 'DOP')}
                                aria-pressed={budgetCurrency !== 'USD'}
                                style={{ border: 'none', background: budgetCurrency !== 'USD' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: budgetCurrency !== 'USD' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                            >RD$</button>
                            <button
                                type="button"
                                onClick={() => updateData('budgetCurrency', 'USD')}
                                aria-pressed={budgetCurrency === 'USD'}
                                style={{ border: 'none', background: budgetCurrency === 'USD' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: budgetCurrency === 'USD' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                            >US$</button>
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <span style={{
                            position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.95rem', pointerEvents: 'none'
                        }}>{currencySymbol}</span>
                        <Input
                            id="budgetAmount" type="number" inputMode="decimal"
                            placeholder={budgetCurrency === 'USD' ? 'Ej. 100' : 'Ej. 5000'} min={minBudget} step="1"
                            value={formData.budgetAmount || ''}
                            onChange={(e) => updateData('budgetAmount', e.target.value)}
                            aria-label={`Presupuesto total en ${budgetCurrency === 'USD' ? 'dólares' : 'pesos dominicanos'}`}
                            aria-required="true"
                            style={{ paddingLeft: '3.25rem' }}
                        />
                    </div>
                    {belowMin ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600, lineHeight: 1.4 }}>
                            ⚠️ El mínimo para {cycleDays} días es {currencySymbol}{minBudget.toLocaleString('en-US')}. Súbelo para poder crear un plan viable.
                        </span>
                    ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            La IA ajustará los ingredientes para acercarse a este monto. Mínimo {currencySymbol}{minBudget.toLocaleString('en-US')} para {cycleDays} días{budgetIsPersonalized ? ' (según tus calorías y metas)' : ''}.
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// [P1-FORM-8] Metadata UI por cada tipo de dieta. Las claves DEBEN coincidir
// EXACTAMENTE con `DIET_TYPES` (SSOT de validación). El check de invariante
// debajo del componente avisa si hay drift.
// [FORM-DIET-ICONS · 2026-07-03] Escalera semántica: cubiertos cruzados (come de
// todo) → bowl de ensalada (sin carne, pero variado) → sello vegano de lucide
// (el marcador estándar de etiquetado 100% vegetal). Antes Utensils (tenedor
// solitario que se leía como tridente) / Leaf genérica / Salad.
const DIET_TYPE_META = {
    balanced:   { label: 'Balanceada',   icon: UtensilsCrossed, desc: 'De todo un poco' },
    vegetarian: { label: 'Vegetariana',  icon: Salad,           desc: 'Sin carne' },
    vegan:      { label: 'Vegana',       icon: Vegan,           desc: '100% vegetal' },
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
    // [P2-FORM-ALLERGY-SEVERITY · 2026-06-22] (audit fresco P2-25) DECISIÓN DE PRODUCTO documentada (el
    // audit permite "implementar toggle de severidad O documentar la decisión fail-safe"): este step NO
    // distingue alergia severa (IgE) de intolerancia leve — ambas se tratan como exclusión DURA. La dirección
    // es FAIL-SAFE (sobre-restrictivo: nunca se sirve el alérgeno → cero riesgo de seguridad); lo único que
    // se pierde es flexibilidad para una intolerancia leve (el usuario puede usar el free-text/Dislikes para
    // matices). Un toggle de severidad requiere diseño de producto + cambia el contrato del form (tests de
    // sentinel-drift); se difiere hasta que el owner lo priorice. NO añadir `allergySeverity` sin revisitar.
    const { formData, updateData } = useAssessment();
    // [P0-B1] sentinel mutuamente exclusivo con cualquier alergia real.
    // [P1-FORM-2] valor desde SSOT (sentinels.js).
    const SENTINEL = SENTINELS.allergies;
    const noneSelected = (formData.allergies || []).includes(SENTINEL);
    const handleToggle = (value) => {
        // [P2-QCHIPS-INCLUDES-GUARD · 2026-06-01] `|| []`: si health_profile hidrata
        // allergies como null/string (dato legacy / write parcial), .includes() lanza
        // TypeError y crashea el render del step (pantalla en blanco). Alinea con QDislikes.
        const next = toggleArrayWithExclusiveSentinel(formData.allergies || [], value, SENTINEL);
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
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={(formData.allergies || []).includes(opt.val)} onToggle={handleToggle} />
                ))}
                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={(formData.allergies || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P3-FORM-SENTINEL-LOCKS-FREETEXT · 2026-07-01] "Ninguna" bloquea el
                free-text (contradicción de safety médica: sin alergias + escribir una). */}
            <Input
                type="text" placeholder={noneSelected ? 'Marcaste «Ninguna»' : 'Otra (Ej. Maní, Fresa...)'}
                value={noneSelected ? '' : (formData.otherAllergies || '')}
                onChange={(e) => updateData('otherAllergies', e.target.value)}
                disabled={noneSelected}
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
    const noneSelected = (formData.dislikes || []).includes(SENTINEL);
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
    // [FORM-DISLIKE-ICONS · 2026-07-03] Icono temático por alimento — antes 6 de 10
    // compartían Salad, Mariscos repetía Fish y Hígado usaba AlertTriangle (señal de
    // peligro, ni siquiera comida). El label siempre acompaña al icono, así que las
    // metáforas de forma funcionan como refuerzo visual:
    //   - Beef (Hígado): corte de carne/víscera.
    //   - Shrimp (Mariscos): camarón, distinto del pez.
    //   - TreeDeciduous (Brócoli): el "arbolito".
    //   - Cloud (Coliflor): forma de nube.
    //   - Sprout (Hongos): brota del suelo.
    //   - Layers (Cebolla): capas.
    //   - Bean (Aguacate): silueta ovalada con "pepa".
    const COMMON_DISLIKES = [
        { val: "Cilantro", label: "Cilantro", icon: Leaf },
        { val: "Hígado", label: "Hígado", icon: Beef },
        { val: "Berenjena", label: "Berenjena", icon: LeafyGreen },
        { val: "Pescado", label: "Pescado", icon: Fish },
        { val: "Mariscos", label: "Mariscos", icon: Shrimp },
        { val: "Brócoli", label: "Brócoli", icon: TreeDeciduous },
        { val: "Coliflor", label: "Coliflor", icon: Cloud },
        { val: "Hongos", label: "Hongos", icon: Sprout },
        { val: "Cebolla", label: "Cebolla", icon: Layers },
        { val: "Aguacate", label: "Aguacate", icon: Bean },
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
            {/* [P3-FORM-SENTINEL-LOCKS-FREETEXT · 2026-07-01] Si el usuario marca
                "Ninguno", el free-text queda bloqueado (contradicción "no rechazo
                nada" + escribir un rechazo). handleToggle ya limpia otherDislikes al
                marcar el sentinel; aquí lo hacemos no-editable para dejarlo claro. */}
            <Input
                type="text"
                placeholder={noneSelected ? 'Marcaste «Ninguno»' : 'Otros (Ej. Apio, Curry, Picante...)'}
                value={noneSelected ? '' : (formData.otherDislikes || '')}
                onChange={(e) => updateData('otherDislikes', e.target.value)}
                disabled={noneSelected}
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

export const QMainGoal = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            {[
                // Cada icono representa LITERALMENTE el objetivo:
                //   - Flame (Perder Grasa): llama = quemar grasa (rojo).
                //   - BicepsFlexed (Ganar Músculo): bíceps flexionado (azul).
                //   - Scale (Mantenimiento): balanza = equilibrio/mantener (verde).
                //   - Gauge (Rendimiento): velocímetro = performance (morado).
                // Antes TrendingUp/Zap/Shield/Target eran abstractos — y TrendingUp
                // (flecha SUBIENDO) contradecía "Perder Grasa".
                { val: "lose_fat", label: "Perder Grasa", icon: Flame, color: "#ef4444" },
                { val: "gain_muscle", label: "Ganar Músculo", icon: BicepsFlexed, color: "#3b82f6" },
                { val: "maintenance", label: "Mantenimiento", icon: Scale, color: "#10b981" },
                { val: "performance", label: "Rendimiento", icon: Gauge, color: "#8b5cf6" }
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
    const noneSelected = (formData.struggles || []).includes(SENTINEL);
    const handleToggle = (value) => {
        // [P2-QCHIPS-INCLUDES-GUARD · 2026-06-01] `|| []` (ver QAllergies).
        const next = toggleArrayWithExclusiveSentinel(formData.struggles || [], value, SENTINEL);
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
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={(formData.struggles || []).includes(opt.val)} onToggle={handleToggle} />
                ))}

                <ChipOption
                    val={SENTINEL} label={SENTINEL} icon={Ban}
                    isSelected={(formData.struggles || []).includes(SENTINEL)}
                    onToggle={handleToggle}
                />
            </div>
            {/* [P3-FORM-SENTINEL-LOCKS-FREETEXT · 2026-07-01] "Ninguno" bloquea el free-text. */}
            <Input
                type="text" placeholder={noneSelected ? 'Marcaste «Ninguno»' : 'Ej. Viajes frecuentes...'}
                value={noneSelected ? '' : (formData.otherStruggles || '')}
                onChange={(e) => updateData('otherStruggles', e.target.value)}
                disabled={noneSelected}
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
                    aria-required="true"
                    aria-label="Tu motivación"
                    style={{
                        width: '100%', padding: '1.25rem', paddingLeft: '3rem', borderRadius: '1rem',
                        border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit',
                        resize: 'vertical', outline: 'none', transition: 'all 0.25s ease', background: 'var(--bg-card)', color: 'var(--text-main)'
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

    const handleDurationSelect = (val) => {
        updateData('groceryDuration', val);
        // [P1-12] Mismo patrón: el ciclo de compras es safety-relevante para
        // el escalado de la lista de compras (×2 quincenal, ×4 mensual).
        // Sin este flag, una mudanza/cambio de horario que el usuario tipea
        // en una pestaña podía ser revertida por sync de otra sesión.
        updateData('_groceryDurationTouched', true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* --- Ciclo de Despensa --- */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Clock size={18} color="#059669" />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>¿Cada cuántos días vas al supermercado?</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                    {[
                        // Cada duración usa un icono lucide-react que
                        // comunica visualmente su rango temporal:
                        //   - CalendarDays (semanal): días de la semana
                        //     visibles como filas — sugiere granularidad
                        //     diaria.
                        //   - CalendarRange (quincenal): rango con dos
                        //     extremos marcados — sugiere "2 semanas".
                        //   - CalendarClock (mensual): calendario + reloj —
                        //     sugiere "más tiempo entre compras".
                        { val: 'weekly', label: '7 Días', sub: 'Semanal', Icon: CalendarDays },
                        { val: 'biweekly', label: '15 Días', sub: 'Quincenal', Icon: CalendarRange },
                        { val: 'monthly', label: '30 Días', sub: 'Mensual', Icon: CalendarClock },
                    ].map(opt => {
                        const isSelected = formData.groceryDuration === opt.val;
                        const IconCmp = opt.Icon;
                        return (
                            <div
                                key={opt.val}
                                onClick={() => handleDurationSelect(opt.val)}
                                onKeyDown={handleActivationKey(() => handleDurationSelect(opt.val))}
                                role="button"
                                aria-pressed={isSelected}
                                tabIndex={0}
                                style={{
                                    cursor: 'pointer',
                                    padding: '1rem 0.75rem',
                                    borderRadius: '0.75rem',
                                    border: isSelected ? '2px solid #10B981' : '1.5px solid var(--border)',
                                    backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    boxShadow: isSelected ? '0 4px 12px rgba(16, 185, 129, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)'
                                }}
                            >
                                <IconCmp
                                    size={26}
                                    strokeWidth={1.75}
                                    color={isSelected ? '#10B981' : 'var(--text-muted)'}
                                />
                                <span style={{
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    color: isSelected ? '#10B981' : 'var(--text-main)'
                                }}>
                                    {opt.label}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
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

            {/* Nota informativa */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                padding: '0.75rem 1rem', borderRadius: '0.75rem',
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)'
            }}>
                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Si cambia tu rutina, lo ajustas en tu panel sin regenerar el plan.
                </span>
            </div>
            <NextButton onClick={onManualAdvance} disabled={!formData.groceryDuration} />
        </div>
    );
};

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
