import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { Label, Select, RadioCard } from '../common/FormUI';
import { ArrowLeft, ArrowRight, Clock, DollarSign, Battery, Moon } from 'lucide-react';

const StepLifestyle = () => {
    const { formData, updateData, nextStep, prevStep } = useAssessment();

    const handleChange = (e) => {
        updateData(e.target.name, e.target.value);
    };

    const isFormValid = formData.sleepHours && formData.stressLevel && formData.cookingTime && formData.budget;

    return (
        <motion.div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>2. Estilo de Vida</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Tu plan debe adaptarse a tu ritmo de vida, no al revés.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* Sleep & Stress Group */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                        <Label>Horas de Sueño Promedio</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {['< 6 horas', '6-7 horas', '7-8 horas', '> 8 horas'].map((opt) => (
                                <RadioCard
                                    key={opt}
                                    name="sleepHours"
                                    value={opt}
                                    label={opt}
                                    icon={Moon}
                                    checked={formData.sleepHours === opt}
                                    onChange={handleChange}
                                />
                            ))}
                        </div>
                    </div>
                    <div>
                        <Label>Nivel de Estrés Diario</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {['Bajo', 'Moderado', 'Alto', 'Muy Alto'].map((opt) => (
                                <RadioCard
                                    key={opt}
                                    name="stressLevel"
                                    value={opt}
                                    label={opt}
                                    icon={Battery}
                                    checked={formData.stressLevel === opt}
                                    onChange={handleChange}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Cooking Time */}
                <div>
                    <Label>¿Cuánto tiempo tienes para cocinar al día?</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {[
                            { val: 'none', label: 'Nada (Necesito opciones listas/recetas de 5min)' },
                            { val: '30min', label: 'Poco (Máximo 30 min)' },
                            { val: '1hour', label: 'Medio (45-60 min)' },
                            { val: 'plenty', label: 'Me gusta cocinar (Sin límite)' }
                        ].map((opt) => (
                            <label
                                key={opt.val}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    padding: '1rem',
                                    border: `1px solid ${formData.cookingTime === opt.val ? 'var(--primary)' : 'var(--border)'}`,
                                    borderRadius: 'var(--radius-md)',
                                    background: formData.cookingTime === opt.val ? 'rgba(37,99,235,0.05)' : 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                <input
                                    type="radio"
                                    name="cookingTime"
                                    value={opt.val}
                                    checked={formData.cookingTime === opt.val}
                                    onChange={handleChange}
                                />
                                <div>
                                    <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Clock size={16} /> {opt.label.split('(')[0]}
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                        ({opt.label.split('(')[1]}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Budget */}
                <div>
                    <Label>Presupuesto para alimentación</Label>
                    <Select name="budget" value={formData.budget} onChange={handleChange}>
                        <option value="">Selecciona un rango...</option>
                        <option value="low">Económico (Lo básico y esencial)</option>
                        <option value="medium">Moderado (Equilibrio calidad/precio)</option>
                        <option value="high">Premium (Ingredientes orgánicos/específicos)</option>
                        <option value="unlimited">Sin límite</option>
                    </Select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', paddingTop: '2rem', borderTop: '1px solid var(--border)', marginTop: '2rem' }}>
                    <button
                        onClick={prevStep}
                        style={{
                            padding: '1rem 2rem',
                            backgroundColor: 'white',
                            color: '#64748B',
                            border: '1px solid #E2E8F0',
                            borderRadius: '1rem',
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.color = '#0F172A';
                            e.currentTarget.style.borderColor = '#CBD5E1';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.color = '#64748B';
                            e.currentTarget.style.borderColor = '#E2E8F0';
                        }}
                    >
                        <ArrowLeft size={18} /> Anterior
                    </button>

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
                </div>

            </div>
        </motion.div>
    );
};

export default StepLifestyle;
