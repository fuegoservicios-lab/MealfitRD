import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { Label } from '../common/FormUI';
import {
    ArrowLeft, ArrowRight,
    Utensils, Leaf, Beef, Wheat, Fish, Salad,
    Milk, Egg, Nut, AlertCircle, Activity, Heart,
    Check
} from 'lucide-react';
import PropTypes from 'prop-types';

// Helper for Lucide icons (handles component passing)
const IsNativeFn = (fn) => fn;

// Helper for Diet Cards - Extracted outside to prevent re-renders
const DietOption = ({ val, label, icon: Icon, desc, isSelected, onSelect }) => {
    return (
        <div
            onClick={() => onSelect(val)}
            style={{
                cursor: 'pointer',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.1)' : 'none',
                position: 'relative' // Added for correct checkmark positioning
            }}
        >
            <div style={{
                padding: '0.75rem',
                borderRadius: '50%',
                background: isSelected ? 'var(--primary)' : 'var(--bg-light)',
                color: isSelected ? 'white' : 'var(--text-muted)',
                transition: 'all 0.2s'
            }}>
                <Icon size={24} />
            </div>
            <div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
            </div>
            {isSelected && <div style={{ position: 'absolute', top: 8, right: 8, color: 'var(--primary)' }}><Check size={16} /></div>}
        </div>
    );
};

DietOption.propTypes = {
    val: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.elementType.isRequired,
    desc: PropTypes.string.isRequired,
    isSelected: PropTypes.bool.isRequired,
    onSelect: PropTypes.func.isRequired
};

// Helper for Chip Selection (Allergies/Conditions) - Extracted outside
const ChipOption = ({ val, label, icon: Icon, isSelected, onToggle }) => {
    return (
        <div
            onClick={() => onToggle(val)}
            style={{
                cursor: 'pointer',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-lg)',
                border: isSelected ? '1px solid var(--secondary)' : '1px solid var(--border)',
                backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.05)' : 'white', // Greenish tint for secondary
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                transition: 'all 0.2s ease'
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

ChipOption.propTypes = {
    val: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.elementType,
    isSelected: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired
};

const StepPreferences = () => {
    const { formData, updateData, nextStep, prevStep } = useAssessment();

    const handleCheckboxChange = (field, value) => {
        const current = formData[field] || [];
        const updated = current.includes(value)
            ? current.filter(item => item !== value)
            : [...current, value];
        updateData(field, updated);
    };

    const isFormValid = formData.dietType;

    return (
        <motion.div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                3. Preferencias Alimenticias
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1rem' }}>
                Personaliza tu plan según tus gustos y necesidades.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                {/* Diet Type Section */}
                <section>
                    <Label>Tipo de Dieta <span style={{ color: 'var(--primary)' }}>*</span></Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                        <DietOption
                            val="balanced"
                            label="Balanceada"
                            icon={Utensils}
                            desc="De todo un poco"
                            isSelected={formData.dietType === "balanced"}
                            onSelect={(val) => updateData('dietType', val)}
                        />
                        {/* Low Carb removed as per user request for strictly medically recommended diets */}
                        <DietOption
                            val="vegetarian"
                            label="Vegetariana"
                            icon={Leaf}
                            desc="Sin carne"
                            isSelected={formData.dietType === "vegetarian"}
                            onSelect={(val) => updateData('dietType', val)}
                        />
                        <DietOption
                            val="vegan"
                            label="Vegana"
                            icon={Salad}
                            desc="100% vegetal"
                            isSelected={formData.dietType === "vegan"}
                            onSelect={(val) => updateData('dietType', val)}
                        />
                    </div>
                </section>

                {/* Allergies Section */}
                <section>
                    <Label>Alergias o Intolerancias</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <ChipOption
                            val="Lacteos"
                            label="Lácteos"
                            icon={Milk}
                            isSelected={formData.allergies.includes("Lacteos")}
                            onToggle={(val) => handleCheckboxChange('allergies', val)}
                        />
                        <ChipOption
                            val="Gluten"
                            label="Gluten"
                            icon={Wheat}
                            isSelected={formData.allergies.includes("Gluten")}
                            onToggle={(val) => handleCheckboxChange('allergies', val)}
                        />
                        <ChipOption
                            val="Huevo"
                            label="Huevo"
                            icon={Egg}
                            isSelected={formData.allergies.includes("Huevo")}
                            onToggle={(val) => handleCheckboxChange('allergies', val)}
                        />
                        <ChipOption
                            val="Mariscos"
                            label="Mariscos"
                            icon={Fish}
                            isSelected={formData.allergies.includes("Mariscos")}
                            onToggle={(val) => handleCheckboxChange('allergies', val)}
                        />
                        <ChipOption
                            val="Frutos Secos"
                            label="Nueces"
                            icon={Nut}
                            isSelected={formData.allergies.includes("Frutos Secos")}
                            onToggle={(val) => handleCheckboxChange('allergies', val)}
                        />
                        <ChipOption
                            val="Soya"
                            label="Soya"
                            icon={Leaf}
                            isSelected={formData.allergies.includes("Soya")}
                            onToggle={(val) => handleCheckboxChange('allergies', val)}
                        />
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <input
                            type="text"
                            placeholder="¿Tienes alguna otra alergia? Escribe aquí..."
                            value={formData.otherAllergies || ''}
                            onChange={(e) => updateData('otherAllergies', e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                fontSize: '0.9rem',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                        />
                    </div>
                </section>

                {/* Medical Conditions Section */}
                <section>
                    <Label>Condiciones Médicas</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <ChipOption
                            val="Diabetes T2"
                            label="Diabetes T2"
                            icon={Activity}
                            isSelected={formData.medicalConditions.includes("Diabetes T2")}
                            onToggle={(val) => handleCheckboxChange('medicalConditions', val)}
                        />
                        <ChipOption
                            val="Hipertensión"
                            label="Hipertensión"
                            icon={Heart}
                            isSelected={formData.medicalConditions.includes("Hipertensión")}
                            onToggle={(val) => handleCheckboxChange('medicalConditions', val)}
                        />
                        <ChipOption
                            val="Colesterol Alto"
                            label="Colesterol Alto"
                            icon={AlertCircle}
                            isSelected={formData.medicalConditions.includes("Colesterol Alto")}
                            onToggle={(val) => handleCheckboxChange('medicalConditions', val)}
                        />
                        <ChipOption
                            val="Gastritis"
                            label="Gastritis"
                            icon={Activity}
                            isSelected={formData.medicalConditions.includes("Gastritis")}
                            onToggle={(val) => handleCheckboxChange('medicalConditions', val)}
                        />
                        <ChipOption
                            val="SOP (PCOS)"
                            label="SOP / PCOS"
                            icon={Activity}
                            isSelected={formData.medicalConditions.includes("SOP (PCOS)")}
                            onToggle={(val) => handleCheckboxChange('medicalConditions', val)}
                        />
                        <ChipOption
                            val="Hipotiroidismo"
                            label="Hipotiroidismo"
                            icon={Activity}
                            isSelected={formData.medicalConditions.includes("Hipotiroidismo")}
                            onToggle={(val) => handleCheckboxChange('medicalConditions', val)}
                        />
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <input
                            type="text"
                            placeholder="¿Tienes alguna otra condición médica? Escribe aquí..."
                            value={formData.otherConditions || ''}
                            onChange={(e) => updateData('otherConditions', e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                fontSize: '0.9rem',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                        />
                    </div>
                </section>

                {/* Meal Structure Section - ACTUALIZADA */}
                <section>
                    <Label>Estructura de Comidas</Label>
                    <div
                        onClick={() => updateData('skipLunch', !formData.skipLunch)}
                        style={{
                            cursor: 'pointer',
                            marginTop: '0.5rem',
                            padding: '1rem',
                            borderRadius: 'var(--radius-lg)',
                            border: formData.skipLunch ? '1px solid var(--primary)' : '1px solid var(--border)',
                            backgroundColor: formData.skipLunch ? 'var(--bg-light)' : 'white',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '1rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{
                            width: 24, height: 24,
                            borderRadius: '50%',
                            border: formData.skipLunch ? '6px solid var(--primary)' : '2px solid var(--text-muted)',
                            flexShrink: 0,
                            marginTop: 2
                        }} />
                        <div>
                            {/* Título cambiado para mayor claridad */}
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                Almuerzo Familiar / Ya resuelto
                            </div>
                            {/* Descripción explicativa sobre la reserva de calorías */}
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Marca esto si comes lo que cocinen en tu casa (La Bandera, etc).
                                La IA planificará desayunos y cenas más ligeros para dejar espacio a esas calorías.
                            </div>
                        </div>
                    </div>
                </section>

                {/* Navigation Buttons */}
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

export default StepPreferences;