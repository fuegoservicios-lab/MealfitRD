import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import { Label, Input, RadioCard } from '../common/FormUI';
import { ArrowRight } from 'lucide-react';

const StepBiometrics = () => {
    const { formData, updateData, nextStep } = useAssessment();

    const handleChange = (e) => {
        updateData(e.target.name, e.target.value);
    };

    const [unit, setUnit] = useState('cm'); // 'cm' | 'ft'
    const [feet, setFeet] = useState('');
    const [inches, setInches] = useState('');

    // --- HEIGHT LOGIC ---
    // (Existing height logic remains here)

    // --- WEIGHT LOGIC ---
    const [weightUnit, setWeightUnit] = useState('lb'); // 'lb' | 'kg'
    const [kgInput, setKgInput] = useState('');

    useEffect(() => {
        if (formData.weight && weightUnit === 'kg') {
            // Convert existing LB to KG for display
            const kgs = (parseFloat(formData.weight) / 2.20462);
            // Keep it simple with 1 decimal place, remove .0 if integer
            const formatted = Number.isInteger(kgs) ? kgs.toString() : kgs.toFixed(1);
            setKgInput(formatted);
        }
    }, [weightUnit]);

    const handleKgChange = (e) => {
        const val = e.target.value;
        setKgInput(val);

        const k = parseFloat(val);
        if (!isNaN(k) && k > 0) {
            // Convert KG input to LB for storage
            const lbs = Math.round(k * 2.20462);
            updateData('weight', lbs.toString());
        } else {
            updateData('weight', '');
        }
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
                                    onClick={() => setWeightUnit('lb')}
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
                                    onClick={() => setWeightUnit('kg')}
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

                        {weightUnit === 'lb' ? (
                            <Input
                                id="weight"
                                name="weight"
                                type="number"
                                placeholder="Ej. 150"
                                value={formData.weight}
                                onChange={handleChange}
                            />
                        ) : (
                            <Input
                                id="weight_kg"
                                type="number"
                                placeholder="Ej. 70"
                                value={kgInput}
                                onChange={handleKgChange}
                            />
                        )}
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

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={nextStep}
                        disabled={!isFormValid}
                        style={{
                            padding: '1rem 2rem',
                            backgroundColor: isFormValid ? 'var(--primary)' : 'var(--border)',
                            color: isFormValid ? 'white' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: 'var(--radius-lg)',
                            fontWeight: 600,
                            cursor: isFormValid ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        Siguiente: Estilo de Vida <ArrowRight size={20} />
                    </button>
                </div>

            </div>
        </motion.div>
    );
};

export default StepBiometrics;
