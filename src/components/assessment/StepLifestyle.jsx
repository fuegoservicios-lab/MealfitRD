import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { Label, RadioCard } from '../common/FormUI';
import { ArrowLeft, ArrowRight, Clock, DollarSign, Battery, Moon, ChefHat, Timer, CheckCircle, Wallet, Banknote, Landmark, Infinity } from 'lucide-react';
import stylesLayout from './AssessmentLayout.module.css';

const StepLifestyle = () => {
    const { formData, updateData, nextStep, prevStep } = useAssessment();

    const handleChange = (e) => {
        updateData(e.target.name, e.target.value);
    };

    const isFormValid = formData.sleepHours && formData.stressLevel && formData.cookingTime && formData.budget;

    return (
        <motion.div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', display: 'none' }}>2. Estilo de Vida</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', display: 'none' }}>
                Tu plan debe adaptarse a tu ritmo de vida, no al revés.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* Sleep & Stress Group */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                        <Label>Horas de Sueño</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                        <Label>Estrés Diario</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                    <Label>¿Tiempo para cocinar?</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {[
                            { val: 'none', label: 'Nada', desc: 'Opciones listas, rectas de 5 min', icon: Timer },
                            { val: '30min', label: 'Poco', desc: 'Máximo 30 min', icon: Clock },
                            { val: '1hour', label: 'Medio', desc: '45-60 min', icon: CheckCircle },
                            { val: 'plenty', label: 'Sin límite', desc: 'Me gusta cocinar', icon: ChefHat }
                        ].map((opt) => (
                            <RadioCard
                                key={opt.val}
                                name="cookingTime"
                                value={opt.val}
                                label={opt.label}
                                desc={opt.desc}
                                icon={opt.icon}
                                checked={formData.cookingTime === opt.val}
                                onChange={handleChange}
                            />
                        ))}
                    </div>
                </div>

                {/* Budget */}
                <div>
                    <Label>Presupuesto</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {[
                            { val: 'low', label: 'Económico', desc: 'Lo básico y esencial', icon: Wallet },
                            { val: 'medium', label: 'Moderado', desc: 'Equilibrio calidad/precio', icon: Banknote },
                            { val: 'high', label: 'Premium', desc: 'Ingredientes orgánicos', icon: Landmark },
                            { val: 'unlimited', label: 'Sin límite', desc: 'Sin restricciones', icon: Infinity }
                        ].map((opt) => (
                            <RadioCard
                                key={opt.val}
                                name="budget"
                                value={opt.val}
                                label={opt.label}
                                desc={opt.desc}
                                icon={opt.icon}
                                checked={formData.budget === opt.val}
                                onChange={handleChange}
                            />
                        ))}
                    </div>
                </div>

                <div className={stylesLayout.stickyActionBar}>
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
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
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
                            letterSpacing: '0.02em',
                            flex: 1,
                            justifyContent: 'center',
                            minWidth: '150px'
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

export default StepLifestyle;
