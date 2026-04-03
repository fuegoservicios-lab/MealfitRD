import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import { Label, Input, RadioCard } from '../common/FormUI';
import { ArrowRight, FastForward, User, UserCircle, Monitor, Footprints, Activity, Dumbbell, Trophy } from 'lucide-react';
import stylesLayout from './AssessmentLayout.module.css';

const StepBiometrics = () => {
    const { formData, updateData, nextStep, setCurrentStep } = useAssessment();

    // Si el formulario ya fue llenado previamente, mostrar botón para saltar al último paso
    const isFormPreviouslyFilled = !!(formData.mainGoal && formData.age && formData.activityLevel && formData.dietType);

    const handleChange = (e) => {
        updateData(e.target.name, e.target.value);
    };

    const [unit, setUnit] = useState('cm'); // 'cm' | 'ft'
    const [feet, setFeet] = useState('');
    const [inches, setInches] = useState('');

    const [weightUnit, setWeightUnit] = useState(formData.weightUnit || 'lb'); // 'lb' | 'kg'

    const handleWeightUnitChange = (newUnit) => {
        setWeightUnit(newUnit);
        updateData('weightUnit', newUnit);
        updateData('weight', '');
    };

    useEffect(() => {
        if (formData.height) {
            if (unit === 'ft') {
                const totalInches = formData.height / 2.54;
                const ft = Math.floor(totalInches / 12);
                const inc = Math.round(totalInches % 12);
                setFeet(ft.toString());
                setInches(inc.toString());
            }
        }
    }, [unit]);

    const handleFtChange = (ft, inc) => {
        setFeet(ft);
        setInches(inc);

        const f = parseFloat(ft) || 0;
        const i = parseFloat(inc) || 0;
        if (f > 0 || i > 0) {
            const totalCm = Math.round((f * 30.48) + (i * 2.54));
            updateData('height', totalCm.toString());
        } else {
            updateData('height', '');
        }
    };

    const isFormValid = formData.age && formData.weight && formData.height && formData.gender;

    return (
        <motion.div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', display: 'none' }}>1. Biometría y Metabolismo</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', display: 'none' }}>
                Para calcular tus macronutrientes exactos, necesitamos conocer tu punto de partida.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '2rem' }}>

                {/* Gender Selection */}
                <div>
                    <Label>Género Biológico&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <RadioCard
                            name="gender"
                            value="female"
                            label="Mujer"
                            icon={UserCircle}
                            checked={formData.gender === 'female'}
                            onChange={handleChange}
                        />
                        <RadioCard
                            name="gender"
                            value="male"
                            label="Hombre"
                            icon={User}
                            checked={formData.gender === 'male'}
                            onChange={handleChange}
                        />
                    </div>
                </div>

                {/* Basic Metrics Group */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <Label htmlFor="age">Edad (años)&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                        <Input
                            id="age"
                            name="age"
                            type="number"
                            placeholder="Ej. 28"
                            value={formData.age}
                            onChange={handleChange}
                        />
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <Label htmlFor="height" style={{ marginBottom: 0 }}>Altura&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '0.5rem', padding: '3px' }}>
                                <button
                                    onClick={() => setUnit('cm')}
                                    style={{
                                        border: 'none', background: unit === 'cm' ? 'white' : 'transparent',
                                        padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: unit === 'cm' ? 'var(--primary)' : '#64748B',
                                        boxShadow: unit === 'cm' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    CM
                                </button>
                                <button
                                    onClick={() => setUnit('ft')}
                                    style={{
                                        border: 'none', background: unit === 'ft' ? 'white' : 'transparent',
                                        padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: unit === 'ft' ? 'var(--primary)' : '#64748B',
                                        boxShadow: unit === 'ft' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    FT
                                </button>
                            </div>
                        </div>

                        {unit === 'cm' ? (
                            <Input
                                id="height"
                                name="height"
                                type="number"
                                placeholder="Ej. 170"
                                value={formData.height}
                                onChange={handleChange}
                            />
                        ) : (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Input
                                    type="number"
                                    placeholder="Pies"
                                    value={feet}
                                    onChange={(e) => handleFtChange(e.target.value, inches)}
                                    style={{ flex: 1 }}
                                />
                                <Input
                                    type="number"
                                    placeholder="Pulg"
                                    value={inches}
                                    onChange={(e) => handleFtChange(feet, e.target.value)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <Label htmlFor="weight" style={{ marginBottom: 0 }}>Peso Actual&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '0.5rem', padding: '3px' }}>
                                <button
                                    onClick={() => handleWeightUnitChange('lb')}
                                    style={{
                                        border: 'none', background: weightUnit === 'lb' ? 'white' : 'transparent',
                                        padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: weightUnit === 'lb' ? 'var(--primary)' : '#64748B',
                                        boxShadow: weightUnit === 'lb' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    LB
                                </button>
                                <button
                                    onClick={() => handleWeightUnitChange('kg')}
                                    style={{
                                        border: 'none', background: weightUnit === 'kg' ? 'white' : 'transparent',
                                        padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: weightUnit === 'kg' ? 'var(--primary)' : '#64748B',
                                        boxShadow: weightUnit === 'kg' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    KG
                                </button>
                            </div>
                        </div>

                        <Input
                            id="weight"
                            name="weight"
                            type="number"
                            placeholder={weightUnit === 'lb' ? 'Ej. 150' : 'Ej. 70'}
                            value={formData.weight}
                            onChange={handleChange}
                        />
                    </div>
                    <div>
                        <Label htmlFor="bodyFat">% Grasa (Opcional)</Label>
                        <Input
                            id="bodyFat"
                            name="bodyFat"
                            type="number"
                            placeholder="Ej. 20"
                            value={formData.bodyFat}
                            onChange={handleChange}
                        />
                    </div>
                </div>

                {/* Activity Level */}
                <div>
                    <Label>Nivel de Actividad General&nbsp;<span style={{ color: '#EF4444' }}>*</span></Label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {[
                            { val: 'sedentary', label: 'Sedentario', desc: 'Trabajo de escritorio, poco o ningún ejercicio.', icon: Monitor },
                            { val: 'light', label: 'Ligero', desc: 'Ejercicio suave de 1 a 3 días por semana.', icon: Footprints },
                            { val: 'moderate', label: 'Moderado', desc: 'Ejercicio moderado de 3 a 5 días por semana.', icon: Activity },
                            { val: 'active', label: 'Activo', desc: 'Deportes fuertes o ejercicio 6 a 7 días por semana.', icon: Dumbbell },
                            { val: 'athlete', label: 'Atleta', desc: 'Entrenamientos dobles, trabajo físico demandante.', icon: Trophy }
                        ].map((opt) => (
                            <RadioCard
                                key={opt.val}
                                name="activityLevel"
                                value={opt.val}
                                label={opt.label}
                                desc={opt.desc}
                                icon={opt.icon}
                                checked={formData.activityLevel === opt.val}
                                onChange={handleChange}
                            />
                        ))}
                    </div>
                </div>

                <div className={stylesLayout.stickyActionBar}>
                    {isFormPreviouslyFilled && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.2 }}
                            onClick={() => setCurrentStep(4)}
                            id="skip-to-generate"
                            style={{
                                padding: '1rem 1.5rem',
                                background: 'transparent',
                                color: 'var(--primary)',
                                border: '2px solid var(--primary)',
                                borderRadius: '1rem',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                cursor: 'pointer',
                                transition: 'all 0.25s ease',
                                fontFamily: 'inherit',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.06)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <FastForward size={18} />
                            Saltar al Final
                        </motion.button>
                    )}

                    <button
                        onClick={nextStep}
                        disabled={!isFormValid}
                        style={{
                            padding: '1rem 3rem',
                            background: isFormValid
                                ? 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)'
                                : '#F1F5F9',
                            color: isFormValid ? 'white' : '#94A3B8',
                            border: 'none',
                            borderRadius: '1rem',
                            fontWeight: 800,
                            fontSize: '1.15rem',
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            cursor: isFormValid ? 'pointer' : 'not-allowed',
                            boxShadow: isFormValid ? '0 10px 25px -5px rgba(37, 99, 235, 0.4)' : 'none',
                            opacity: isFormValid ? 1 : 0.8,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            letterSpacing: '0.02em',
                            flex: 1,
                            justifyContent: 'center',
                            minWidth: '200px'
                        }}
                        onMouseEnter={(e) => {
                            if (isFormValid) {
                                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                                e.currentTarget.style.boxShadow = '0 15px 30px -10px rgba(37, 99, 235, 0.5)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (isFormValid) {
                                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(37, 99, 235, 0.4)';
                            }
                        }}
                    >
                        Siguiente <ArrowRight size={20} />
                    </button>
                </div>

            </div>
        </motion.div>
    );
};

export default StepBiometrics;
