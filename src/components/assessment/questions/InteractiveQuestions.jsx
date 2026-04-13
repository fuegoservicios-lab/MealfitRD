import { useEffect, useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard, Input, Label } from '../../common/FormUI';
import { 
    User, UserCircle, Sun, Moon, RefreshCw, 
    Battery, Target, Clock, CheckCircle, ChefHat, 
    Wallet, Banknote, Landmark, Infinity, Utensils, 
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
        setWeightUnit(newUnit); updateData('weightUnit', newUnit); updateData('weight', '');
    };

    const isFormValid = formData.age && formData.weight && formData.height;

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <div>
                    <Label htmlFor="age">Edad (años)&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                    <Input id="age" type="number" placeholder="Ej. 28" value={formData.age} onChange={e => updateData('age', e.target.value)} />
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
                        <Input id="height" type="number" placeholder="Ej. 170" value={formData.height} onChange={e => updateData('height', e.target.value)} />
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Input type="number" placeholder="Pies" value={feet} onChange={(e) => handleFtChange(e.target.value, inches)} />
                            <Input type="number" placeholder="Pulg" value={inches} onChange={(e) => handleFtChange(feet, e.target.value)} />
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <Label htmlFor="weight" style={{ margin: 0 }}>Peso&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '0.5rem', padding: '3px' }}>
                            <button onClick={() => handleWeightUnitChange('lb')} style={{ border: 'none', background: weightUnit === 'lb' ? 'white' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: weightUnit === 'lb' ? 'var(--primary)' : '#64748B' }}>LB</button>
                            <button onClick={() => handleWeightUnitChange('kg')} style={{ border: 'none', background: weightUnit === 'kg' ? 'white' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: weightUnit === 'kg' ? 'var(--primary)' : '#64748B' }}>KG</button>
                        </div>
                    </div>
                    <Input id="weight" type="number" placeholder={weightUnit === 'lb' ? 'Ej. 150' : 'Ej. 70'} value={formData.weight} onChange={e => updateData('weight', e.target.value)} />
                </div>
                <div>
                    <Label htmlFor="bodyFat">% Grasa (Opcional)</Label>
                    <Input id="bodyFat" type="number" placeholder="Ej. 20" value={formData.bodyFat} onChange={e => updateData('bodyFat', e.target.value)} />
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

export const QDietType = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            <DietOption val="balanced" label="Balanceada" icon={Utensils} desc="De todo un poco" isSelected={formData.dietType === "balanced"} onSelect={(val) => { updateData('dietType', val); onAutoAdvance(); }} />
            <DietOption val="vegetarian" label="Vegetariana" icon={Leaf} desc="Sin carne" isSelected={formData.dietType === "vegetarian"} onSelect={(val) => { updateData('dietType', val); onAutoAdvance(); }} />
            <DietOption val="vegan" label="Vegana" icon={Salad} desc="100% vegetal" isSelected={formData.dietType === "vegan"} onSelect={(val) => { updateData('dietType', val); onAutoAdvance(); }} />
        </div>
    );
};

export const QAllergies = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const handleCheckboxChange = (field, value) => {
        const current = formData[field] || [];
        const updated = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
        updateData(field, updated);
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
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={formData.allergies.includes(opt.val)} onToggle={(val) => handleCheckboxChange('allergies', val)} />
                ))}
                <ChipOption 
                    val="Ninguna" label="Ninguna" icon={Ban} isSelected={formData.allergies.includes("Ninguna")} 
                    onToggle={() => {
                        if (formData.allergies.includes("Ninguna")) handleCheckboxChange('allergies', "Ninguna");
                        else updateData('allergies', ["Ninguna"]);
                    }} 
                />
            </div>
            <Input 
                type="text" placeholder="Otra (Ej. Maní, Fresa...)" value={formData.otherAllergies || ''} 
                onChange={(e) => updateData('otherAllergies', e.target.value)} 
            />
            <NextButton onClick={onManualAdvance} />
        </div>
    );
};

export const QMedical = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const handleCheckboxChange = (field, value) => {
        const current = formData[field] || [];
        const updated = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
        updateData(field, updated);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                {['Diabetes T2', 'Hipertensión', 'Colesterol Alto', 'Gastritis', 'SOP (PCOS)', 'Hipotiroidismo'].map(opt => (
                    <ChipOption key={opt} val={opt} label={opt} icon={opt === 'Hipertensión' ? Heart : (opt === 'Colesterol Alto' ? AlertCircle : Activity)} isSelected={formData.medicalConditions.includes(opt)} onToggle={(val) => handleCheckboxChange('medicalConditions', val)} />
                ))}
                <ChipOption 
                    val="Ninguna" label="Ninguna" icon={Ban} isSelected={formData.medicalConditions.includes("Ninguna")} 
                    onToggle={() => {
                        if (formData.medicalConditions.includes("Ninguna")) handleCheckboxChange('medicalConditions', "Ninguna");
                        else updateData('medicalConditions', ["Ninguna"]);
                    }} 
                />
            </div>
            <Input 
                type="text" placeholder="Otra condición médica..." value={formData.otherConditions || ''} 
                onChange={(e) => updateData('otherConditions', e.target.value)} 
            />
            <NextButton onClick={onManualAdvance} />
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
    const handleCheckboxChange = (field, value) => {
        const current = formData[field] || [];
        const updated = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
        updateData(field, updated);
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
                    <ChipOption key={opt.val} val={opt.val} label={opt.label} icon={opt.icon} isSelected={formData.struggles.includes(opt.val)} onToggle={(val) => handleCheckboxChange('struggles', val)} />
                ))}
                
                <ChipOption 
                    val="Ninguno" label="Ninguno" icon={Ban} isSelected={formData.struggles.includes("Ninguno")} 
                    onToggle={() => {
                        if (formData.struggles.includes("Ninguno")) handleCheckboxChange('struggles', "Ninguno");
                        else updateData('struggles', ["Ninguno"]);
                    }} 
                />
            </div>
            <Input 
                type="text" placeholder="Ej. Viajes frecuentes..." value={formData.otherStruggles || ''} 
                onChange={(e) => updateData('otherStruggles', e.target.value)} 
            />
            <NextButton onClick={onManualAdvance} />
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
            <NextButton onClick={onManualAdvance} disabled={!formData.motivation} />
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
