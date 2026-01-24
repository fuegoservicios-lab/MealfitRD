import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { Label } from '../common/FormUI';
import {
    ArrowLeft, Target, Zap, Frown, TrendingUp,
    Battery, Shield, AlertTriangle, Clock,
    Users, XCircle, HelpCircle, Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const StepGoals = () => {
    const { formData, updateData, prevStep } = useAssessment();
    const navigate = useNavigate();

    const handleCheckboxChange = (field, value) => {
        const current = formData[field] || [];
        const updated = current.includes(value)
            ? current.filter(item => item !== value)
            : [...current, value];
        updateData(field, updated);
    };

    const handleFinish = () => {
        navigate('/plan');
    };

    const isFormValid = formData.mainGoal && formData.motivation;

    // --- Components Helpers ---

    const GoalCard = ({ val, label, icon: Icon, color }) => {
        const isSelected = formData.mainGoal === val;
        return (
            <div
                onClick={() => updateData('mainGoal', val)}
                style={{
                    cursor: 'pointer',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-lg)',
                    border: isSelected ? `2px solid ${color}` : '1px solid var(--border)',
                    backgroundColor: isSelected ? `${color}10` : 'white', // 10 = alpha approx 6%
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

    const ObstacleChip = ({ val, label, icon: Icon }) => {
        const isSelected = formData.struggles.includes(val);
        return (
            <div
                onClick={() => handleCheckboxChange('struggles', val)}
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

    // --- Main Render ---

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
                            color="#ef4444" // Red
                        />
                        <GoalCard
                            val="gain_muscle"
                            label="Ganar Músculo"
                            icon={Zap}
                            color="#3b82f6" // Blue
                        />
                        <GoalCard
                            val="maintenance"
                            label="Mantenimiento"
                            icon={Shield}
                            color="#10b981" // Green
                        />
                        <GoalCard
                            val="performance"
                            label="Rendimiento"
                            icon={Target}
                            color="#8b5cf6" // Purple
                        />
                    </div>
                </section>

                {/* Struggles Section */}
                <section>
                    <Label>Mayores Obstáculos</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <ObstacleChip val="Ansiedad por dulces" label="Ansiedad / Dulces" icon={AlertTriangle} />
                        <ObstacleChip val="Atracones nocturnos" label="Atracones" icon={Frown} />
                        <ObstacleChip val="Falta de tiempo" label="Falta de tiempo" icon={Clock} />
                        <ObstacleChip val="Comida social/Salidas" label="Salidas Sociales" icon={Users} />
                        <ObstacleChip val="No sé cocinar" label="No sé cocinar" icon={XCircle} />
                        <ObstacleChip val="Me aburro rápido" label="Me aburro rápido" icon={HelpCircle} />
                    </div>
                </section>

                {/* Motivation Section */}
                <section>
                    <Label>Tu "Por Qué" (Motivación) <span style={{ color: 'var(--primary)' }}>*</span></Label>
                    <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                        <textarea
                            placeholder="Ej. Quiero tener más energía para jugar con mis hijos, mejorar mi salud a largo plazo..."
                            value={formData.motivation || ''}
                            onChange={(e) => updateData('motivation', e.target.value)}
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                paddingLeft: '3rem', // space for icon
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
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1rem' }}>
                    <button
                        onClick={prevStep}
                        style={{
                            padding: '1rem 2rem',
                            backgroundColor: 'white',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-lg)',
                            fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        <ArrowLeft size={20} /> Anterior
                    </button>

                    <button
                        onClick={handleFinish}
                        disabled={!isFormValid}
                        style={{
                            padding: '1rem 2.5rem',
                            backgroundColor: isFormValid ? 'var(--secondary)' : 'var(--bg-light)', // Green for finish
                            color: isFormValid ? 'white' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: 'var(--radius-lg)',
                            fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            cursor: isFormValid ? 'pointer' : 'not-allowed',
                            boxShadow: isFormValid ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
                            opacity: isFormValid ? 1 : 0.7,
                            transition: 'all 0.2s'
                        }}
                    >
                        <Zap size={20} /> Generar Rutina
                    </button>
                </div>

            </div>
        </motion.div>
    );
};

export default StepGoals;
