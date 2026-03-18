import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import { Label, Input, RadioCard } from '../common/FormUI';
import { ArrowRight, FastForward } from 'lucide-react';

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

    // --- HEIGHT LOGIC ---
    // (Existing height logic remains here)

    // --- WEIGHT LOGIC ---
    const [weightUnit, setWeightUnit] = useState(formData.weightUnit || 'lb'); // 'lb' | 'kg'

    const handleWeightUnitChange = (newUnit) => {
        setWeightUnit(newUnit);
        updateData('weightUnit', newUnit);
        // Limpiar el peso al cambiar de unidad para evitar confusión
        updateData('weight', '');
    };

    // --- HEIGHT LOGIC (Existing) ---
    // Sincronizar inputs cuando cambiamos de unidad o cargamos datos
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
    }, [unit]); // Solo cuando cambia la unidad (o al montar si quisiéramos)

    const handleFtChange = (ft, inc) => {
        setFeet(ft);
        setInches(inc);

        // Calcular CM y guardar
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
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>1. Biometría y Metabolismo</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Para calcular tus macronutrientes exactos, necesitamos conocer tu punto de partida.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Gender Selection */}
                <div>
                    <Label>Género Biológico</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <RadioCard
                            name="gender"
                            value="female"
                            label="Mujer"
                            checked={formData.gender === 'female'}
                            onChange={handleChange}
                        />
                        <RadioCard
                            name="gender"
                            value="male"
                            label="Hombre"
                            checked={formData.gender === 'male'}
                            onChange={handleChange}
                        />
                    </div>
                </div>

                {/* Basic Metrics Group */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <Label htmlFor="age">Edad (años)</Label>
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
                            <Label htmlFor="height" style={{ marginBottom: 0 }}>Altura</Label>
                            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '0.5rem', padding: '2px' }}>
                                <button
                                    onClick={() => setUnit('cm')}
                                    style={{
                                        border: 'none', background: unit === 'cm' ? 'white' : 'transparent',
                                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: unit === 'cm' ? 'var(--primary)' : '#64748B',
                                        boxShadow: unit === 'cm' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    CM
                                </button>
                                <button
                                    onClick={() => setUnit('ft')}
                                    style={{
                                        border: 'none', background: unit === 'ft' ? 'white' : 'transparent',
                                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: unit === 'ft' ? 'var(--primary)' : '#64748B',
                                        boxShadow: unit === 'ft' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer'
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
                            <Label htmlFor="weight" style={{ marginBottom: 0 }}>Peso Actual</Label>
                            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '0.5rem', padding: '2px' }}>
                                <button
                                    onClick={() => handleWeightUnitChange('lb')}
                                    style={{
                                        border: 'none', background: weightUnit === 'lb' ? 'white' : 'transparent',
                                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: weightUnit === 'lb' ? 'var(--primary)' : '#64748B',
                                        boxShadow: weightUnit === 'lb' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    LB
                                </button>
                                <button
                                    onClick={() => handleWeightUnitChange('kg')}
                                    style={{
                                        border: 'none', background: weightUnit === 'kg' ? 'white' : 'transparent',
                                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem',
                                        fontWeight: 600, color: weightUnit === 'kg' ? 'var(--primary)' : '#64748B',
                                        boxShadow: weightUnit === 'kg' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                        cursor: 'pointer'
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
                    <Label>Nivel de Actividad</Label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[
                            { val: 'sedentary', label: 'Sedentario (Oficina, poco ejercicio)' },
                            { val: 'light', label: 'Ligero (Ejercicio 1-3 días/sem)' },
                            { val: 'moderate', label: 'Moderado (Ejercicio 3-5 días/sem)' },
                            { val: 'active', label: 'Activo (Deporte 6-7 días/sem)' },
                            { val: 'athlete', label: 'Atleta (Entrenamientos dobles/físico)' }
                        ].map((opt) => (
                            <label
                                key={opt.val}
                                style={{
                                    padding: '1rem',
                                    border: `1px solid ${formData.activityLevel === opt.val ? 'var(--primary)' : 'var(--border)'}`,
                                    borderRadius: 'var(--radius-md)',
                                    background: formData.activityLevel === opt.val ? 'rgba(37,99,235,0.05)' : 'white',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <input
                                    type="radio"
                                    name="activityLevel"
                                    value={opt.val}
                                    checked={formData.activityLevel === opt.val}
                                    onChange={handleChange}
                                    style={{ marginRight: '0.75rem' }}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                            fontWeight: 700,
                            fontSize: '1rem',
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            cursor: isFormValid ? 'pointer' : 'not-allowed',
                            boxShadow: isFormValid ? '0 10px 25px -5px rgba(37, 99, 235, 0.4)' : 'none',
                            opacity: isFormValid ? 1 : 0.8,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            letterSpacing: '0.02em'
                        }}
                        onMouseEnter={(e) => {
                            if (isFormValid) {
                                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                                e.currentTarget.style.boxShadow = '0 20px 30px -10px rgba(37, 99, 235, 0.5)';
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
                                border: '1.5px solid var(--primary)',
                                borderRadius: '1rem',
                                fontWeight: 600,
                                fontSize: '0.9rem',
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
                            <FastForward size={16} />
                            Skip
                        </motion.button>
                    )}
                </div>

            </div>
        </motion.div>
    );
};

export default StepBiometrics;
