import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { Label } from '../common/FormUI';
import {
    ArrowLeft, Target, Zap, Frown, TrendingUp,
    Battery, Shield, AlertTriangle, Clock,
    Users, XCircle, HelpCircle, Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- CORRECCIÓN: Componentes definidos FUERA del componente principal ---

const GoalCard = ({ val, label, icon: Icon, color, isSelected, onSelect }) => {
    return (
        <div
            onClick={() => onSelect(val)}
            style={{
                cursor: 'pointer',
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                border: isSelected ? `2px solid ${color}` : '1px solid var(--border)',
                backgroundColor: isSelected ? `${color}10` : 'white', // 10 = approx 6% opacity
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
                textAlign: 'center',
                transition: 'all 0.2s',
                position: 'relative'
            }}
        >
            <div style={{
                padding: '0.75rem',
                borderRadius: '50%',
                background: isSelected ? color : 'var(--bg-light)',
                color: isSelected ? 'white' : 'var(--text-muted)',
                transition: 'all 0.2s'
            }}>
                <Icon size={28} />
            </div>
            <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</span>
            {isSelected && (
                <div style={{ position: 'absolute', top: 10, right: 10, color: color }}>
                    <Check size={18} />
                </div>
            )}
        </div>
    );
};

const ObstacleChip = ({ val, label, icon: Icon, isSelected, onToggle }) => {
    return (
        <div
            onClick={() => onToggle(val)}
            style={{
                cursor: 'pointer',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-lg)',
                border: isSelected ? '1px solid var(--secondary)' : '1px solid var(--border)',
                backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.05)' : 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                transition: 'all 0.2s'
            }}
        >
            {Icon && <Icon size={18} color={isSelected ? 'var(--secondary)' : 'var(--text-muted)'} />}
            <span style={{
                fontSize: '0.9rem',
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? 'var(--secondary)' : 'var(--text-main)'
            }}>
                {label}
            </span>
        </div>
    );
};

// --- Componente Principal ---

const StepGoals = () => {
    const { formData, updateData, prevStep } = useAssessment();
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCheckboxChange = (field, value) => {
        const current = formData[field] || [];
        const updated = current.includes(value)
            ? current.filter(item => item !== value)
            : [...current, value];
        updateData(field, updated);
    };

    const handleFinish = () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        navigate('/plan');
    };

    const isFormValid = formData.mainGoal && formData.motivation;

    return (
        <motion.div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                4. Objetivos y Mentalidad
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1rem' }}>
                La nutrición es 50% biología y 50% psicología.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                {/* Main Goal Section */}
                <section>
                    <Label>Objetivo Principal <span style={{ color: 'var(--primary)' }}>*</span></Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                        <GoalCard
                            val="lose_fat"
                            label="Perder Grasa"
                            icon={TrendingUp}
                            color="#ef4444"
                            isSelected={formData.mainGoal === 'lose_fat'}
                            onSelect={(val) => updateData('mainGoal', val)}
                        />
                        <GoalCard
                            val="gain_muscle"
                            label="Ganar Músculo"
                            icon={Zap}
                            color="#3b82f6"
                            isSelected={formData.mainGoal === 'gain_muscle'}
                            onSelect={(val) => updateData('mainGoal', val)}
                        />
                        <GoalCard
                            val="maintenance"
                            label="Mantenimiento"
                            icon={Shield}
                            color="#10b981"
                            isSelected={formData.mainGoal === 'maintenance'}
                            onSelect={(val) => updateData('mainGoal', val)}
                        />
                        <GoalCard
                            val="performance"
                            label="Rendimiento"
                            icon={Target}
                            color="#8b5cf6"
                            isSelected={formData.mainGoal === 'performance'}
                            onSelect={(val) => updateData('mainGoal', val)}
                        />
                    </div>
                </section>

                {/* Struggles Section */}
                <section>
                    <Label>Mayores Obstáculos</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <ObstacleChip
                            val="Ansiedad por dulces"
                            label="Ansiedad / Dulces"
                            icon={AlertTriangle}
                            isSelected={formData.struggles.includes("Ansiedad por dulces")}
                            onToggle={(val) => handleCheckboxChange('struggles', val)}
                        />
                        <ObstacleChip
                            val="Atracones nocturnos"
                            label="Atracones"
                            icon={Frown}
                            isSelected={formData.struggles.includes("Atracones nocturnos")}
                            onToggle={(val) => handleCheckboxChange('struggles', val)}
                        />
                        <ObstacleChip
                            val="Falta de tiempo"
                            label="Falta de tiempo"
                            icon={Clock}
                            isSelected={formData.struggles.includes("Falta de tiempo")}
                            onToggle={(val) => handleCheckboxChange('struggles', val)}
                        />
                        <ObstacleChip
                            val="Comida social/Salidas"
                            label="Salidas Sociales"
                            icon={Users}
                            isSelected={formData.struggles.includes("Comida social/Salidas")}
                            onToggle={(val) => handleCheckboxChange('struggles', val)}
                        />
                        <ObstacleChip
                            val="No sé cocinar"
                            label="No sé cocinar"
                            icon={XCircle}
                            isSelected={formData.struggles.includes("No sé cocinar")}
                            onToggle={(val) => handleCheckboxChange('struggles', val)}
                        />
                        <ObstacleChip
                            val="Me aburro rápido"
                            label="Me aburro rápido"
                            icon={HelpCircle}
                            isSelected={formData.struggles.includes("Me aburro rápido")}
                            onToggle={(val) => handleCheckboxChange('struggles', val)}
                        />
                    </div>
                </section>

                {/* Motivation Section */}
                <section>
                    <Label>¿Qué te motiva realmente? <span style={{ color: 'var(--primary)' }}>*</span></Label>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: '1.5' }}>
                        Esta información es clave para que nuestra IA entienda tus metas profundas y personalice el plan a tu estilo de vida.
                        Sé específico, ¡esto nos ayuda a ayudarte!
                    </p>
                    <div style={{ position: 'relative' }}>
                        <textarea
                            placeholder="Ej. Quiero tener energía para jugar con mis hijos sin cansarme, prepararme para mi primera carrera de 5K, o simplemente mejorar mi salud a largo plazo para evitar enfermedades..."
                            value={formData.motivation || ''}
                            onChange={(e) => updateData('motivation', e.target.value)}
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                paddingLeft: '3rem',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                                fontSize: '0.95rem',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                                minHeight: '100px'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                        />
                        <div style={{ position: 'absolute', top: '1.1rem', left: '1rem', color: 'var(--text-muted)' }}>
                            <Battery size={20} />
                        </div>
                    </div>
                </section>

                {/* Navigation */}
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
                        onClick={handleFinish}
                        disabled={!isFormValid || isSubmitting}
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
                            cursor: (isFormValid && !isSubmitting) ? 'pointer' : 'not-allowed',
                            boxShadow: isFormValid ? '0 10px 25px -5px rgba(37, 99, 235, 0.4)' : 'none',
                            opacity: (isFormValid && !isSubmitting) ? 1 : 0.8,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            pointerEvents: (isSubmitting) ? 'none' : 'auto',
                            letterSpacing: '0.02em'
                        }}
                        onMouseEnter={(e) => {
                            if (isFormValid && !isSubmitting) {
                                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                                e.currentTarget.style.boxShadow = '0 20px 30px -10px rgba(37, 99, 235, 0.5)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (isFormValid && !isSubmitting) {
                                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(37, 99, 235, 0.4)';
                            }
                        }}
                    >
                        <Zap size={20} fill={isFormValid ? "white" : "none"} />
                        {isSubmitting ? 'Generando...' : 'Generar Rutina'}
                    </button>
                </div>

            </div>
        </motion.div>
    );
};

export default StepGoals;