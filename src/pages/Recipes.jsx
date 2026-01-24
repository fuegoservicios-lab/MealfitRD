import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import { Utensils, ArrowLeft, Clock, ChefHat } from 'lucide-react';

const Recipes = () => {
    const { planData } = useAssessment();
    const navigate = useNavigate();

    // Protección de Ruta
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    return (
        <DashboardLayout>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Header de Navegación */}
                <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center' }}>
                    <button 
                        onClick={() => navigate('/dashboard')}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'transparent', border: 'none',
                            color: 'var(--text-muted)', fontWeight: 600,
                            cursor: 'pointer', fontSize: '0.9rem'
                        }}
                    >
                        <ArrowLeft size={18} /> Volver al Panel
                    </button>
                </div>

                {/* Título Principal */}
                <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
                    <div style={{ 
                        width: 60, height: 60, background: '#EFF6FF', borderRadius: '50%', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--primary)', margin: '0 auto 1rem'
                    }}>
                        <Utensils size={30} />
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Tus Recetas del Día
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Paso a paso para preparar tus comidas personalizadas.
                    </p>
                </div>

                {/* Lista de Recetas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {planData.perfectDay?.map((meal, index) => (
                        <div key={index} style={{ 
                            background: 'white', 
                            borderRadius: '1.5rem', 
                            border: '1px solid var(--border)',
                            overflow: 'hidden',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            {/* Header de la Receta */}
                            <div style={{ 
                                padding: '1.5rem', 
                                background: 'linear-gradient(to right, #F8FAFC, white)',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                flexWrap: 'wrap', gap: '1rem'
                            }}>
                                <div>
                                    <div style={{ 
                                        textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, 
                                        color: 'var(--primary)', marginBottom: '0.25rem' 
                                    }}>
                                        {meal.meal}
                                    </div>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                                        {meal.name}
                                    </h2>
                                </div>
                                <div style={{ 
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', 
                                    padding: '0.5rem 1rem', background: 'white', 
                                    borderRadius: '2rem', border: '1px solid var(--border)',
                                    fontSize: '0.9rem', fontWeight: 600, color: '#64748B'
                                }}>
                                    <ChefHat size={16} /> 
                                    {meal.cals} kcal
                                </div>
                            </div>

                            {/* Contenido (Pasos) */}
                            <div style={{ padding: '2rem' }}>
                                {/* Descripción Corta */}
                                <p style={{ 
                                    color: 'var(--text-muted)', marginBottom: '2rem', 
                                    fontStyle: 'italic', background: '#F1F5F9', padding: '1rem', borderRadius: '0.5rem' 
                                }}>
                                    "{meal.desc}"
                                </p>

                                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Clock size={18} /> Preparación:
                                </h3>

                                {meal.recipe && meal.recipe.length > 0 ? (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {meal.recipe.map((step, i) => (
                                            <li key={i} style={{ display: 'flex', gap: '1rem' }}>
                                                <div style={{ 
                                                    minWidth: '24px', height: '24px', 
                                                    background: 'var(--primary)', color: 'white', 
                                                    borderRadius: '50%', fontWeight: 700, fontSize: '0.8rem',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    marginTop: '2px'
                                                }}>
                                                    {i + 1}
                                                </div>
                                                <p style={{ margin: 0, color: 'var(--text-main)', lineHeight: 1.6 }}>
                                                    {step}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p style={{ color: 'var(--text-muted)' }}>
                                        No hay pasos detallados disponibles para esta receta. Guíate de la descripción.
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </DashboardLayout>
    );
};

export default Recipes;
