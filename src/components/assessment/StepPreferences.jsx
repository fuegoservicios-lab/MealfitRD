import { motion } from 'framer-motion';
import { useAssessment } from '../../context/AssessmentContext';
import { Label, Input } from '../common/FormUI';
import {
    ArrowLeft, ArrowRight,
    Utensils, Leaf, Beef, Wheat, Fish, Salad,
    Milk, Egg, Nut, AlertCircle, Activity, Heart,
    Check
} from 'lucide-react';

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

    // Helper for Diet Cards
    const DietOption = ({ val, label, icon: Icon, desc }) => {
        const isSelected = formData.dietType === val;
        return (
            <div
                onClick={() => updateData('dietType', val)}
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
                    boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.1)' : 'none'
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

    // Helper for Chip Selection (Allergies/Conditions)
    const ChipOption = ({ field, val, label, icon: Icon }) => {
        const isSelected = formData[field].includes(val);
        return (
            <div
                onClick={() => handleCheckboxChange(field, val)}
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
                        <DietOption val="balanced" label="Balanceada" icon={Utensils} desc="De todo un poco" />
                        <DietOption val="low_carb" label="Low Carb" icon={Beef} desc="Baja en carbohidratos" />
                        <DietOption val="keto" label="Keto" icon={Activity} desc="Alta en grasas saludables" />
                        <DietOption val="vegetarian" label="Vegetariana" icon={Leaf} desc="Sin carne" />
                        <DietOption val="vegan" label="Vegana" icon={Salad} desc="100% vegetal" />
                        <DietOption val="paleo" label="Paleo" icon={IsNativeFn(Fish)} desc="Comida real" />
                    </div>
                </section>

                {/* Allergies Section */}
                <section>
                    <Label>Alergias o Intolerancias</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <ChipOption field="allergies" val="Lacteos" label="Lácteos" icon={Milk} />
                        <ChipOption field="allergies" val="Gluten" label="Gluten" icon={Wheat} />
                        <ChipOption field="allergies" val="Huevo" label="Huevo" icon={Egg} />
                        <ChipOption field="allergies" val="Mariscos" label="Mariscos" icon={Fish} />
                        <ChipOption field="allergies" val="Frutos Secos" label="Nueces" icon={Nut} />
                        <ChipOption field="allergies" val="Soya" label="Soya" icon={Leaf} />
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
                        <ChipOption field="medicalConditions" val="Diabetes T2" label="Diabetes T2" icon={Activity} />
                        <ChipOption field="medicalConditions" val="Hipertensión" label="Hipertensión" icon={Heart} />
                        <ChipOption field="medicalConditions" val="Colesterol Alto" label="Colesterol Alto" icon={AlertCircle} />
                        <ChipOption field="medicalConditions" val="Gastritis" label="Gastritis" icon={Activity} />
                        <ChipOption field="medicalConditions" val="SOP (PCOS)" label="SOP / PCOS" icon={Activity} />
                        <ChipOption field="medicalConditions" val="Hipotiroidismo" label="Hipotiroidismo" icon={Activity} />
                    </div>
                </section>

                {/* Navigation Buttons */}
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
                        onClick={nextStep}
                        disabled={!isFormValid}
                        style={{
                            padding: '1rem 2.5rem',
                            backgroundColor: isFormValid ? 'var(--primary)' : 'var(--bg-light)',
                            color: isFormValid ? 'white' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: 'var(--radius-lg)',
                            fontWeight: 600,
                            cursor: isFormValid ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            transition: 'all 0.2s',
                            boxShadow: isFormValid ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none'
                        }}
                    >
                        Siguiente <ArrowRight size={20} />
                    </button>
                </div>

            </div>
        </motion.div>
    );
};

// Quick helper to safely handle icon types if needed (though lucide components are functions)
const IsNativeFn = (fn) => fn;

export default StepPreferences;
