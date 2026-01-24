import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { Label, Input, RadioCard } from '../common/FormUI';
import { ArrowRight } from 'lucide-react';

const StepBiometrics = () => {
    const { formData, updateData, nextStep } = useAssessment();

    const handleChange = (e) => {
        updateData(e.target.name, e.target.value);
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
                        <Label htmlFor="height">Altura (cm)</Label>
                        <Input
                            id="height"
                            name="height"
                            type="number"
                            placeholder="Ej. 170"
                            value={formData.height}
                            onChange={handleChange}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <Label htmlFor="weight">Peso Actual (lb)</Label>
                        <Input
                            id="weight"
                            name="weight"
                            type="number"
                            placeholder="Ej. 150"
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
