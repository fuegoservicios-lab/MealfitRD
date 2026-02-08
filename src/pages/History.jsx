import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useAssessment } from '../context/AssessmentContext';
import { Calendar, ChevronRight, Flame, Dumbbell, Wheat, Droplet, RotateCcw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const History = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null); // Para el Modal
    const navigate = useNavigate();
    const { restorePlan } = useAssessment();

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('meal_plans')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Filter out incomplete plans (likely from n8n duplicates without metadata)
            const validPlans = (data || []).filter(plan => plan.name && plan.calories > 0);
            setPlans(validPlans);
        } catch (error) {
            console.error('Error fetching history:', error);
            toast.error('No se pudo cargar el historial.');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = (planData) => {
        restorePlan(planData);
        navigate('/dashboard');
    };

    return (
        <DashboardLayout>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                    Historial de Planes
                </h1>
                <p style={{ color: 'var(--text-muted)' }}>
                    Revisa en detalle o reactiva tus planes anteriores.
                </p>
            </div>

            {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Cargando historial...
                </div>
            ) : plans.length === 0 ? (
                <div style={{
                    padding: '3rem',
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.5)',
                    borderRadius: '1rem',
                    border: '1px dashed #cbd5e1'
                }}>
                    <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
                        Aún no tienes planes guardados en el historial.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            style={{
                                background: 'white',
                                padding: '1.5rem',
                                borderRadius: '1rem',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                border: '1px solid #f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s',
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            className="history-card"
                            onClick={() => setSelectedPlan(plan)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                            }}
                        >
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{
                                    background: '#EFF6FF',
                                    color: '#3B82F6',
                                    padding: '0.75rem',
                                    borderRadius: '0.75rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Calendar size={24} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                        {plan.name || 'Plan Generado'}
                                    </h3>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        {new Date(plan.created_at).toLocaleDateString('es-DO', {
                                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                                {/* Macros Mini Check (Solo Desktop/Tablet) */}
                                <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }} className="hide-mobile">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Flame size={16} className="text-orange-500" fill="#f97316" color="#f97316" />
                                        <strong>{plan.calories}</strong> kcal
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Dumbbell size={16} className="text-blue-500" fill="#3b82f6" color="#3b82f6" />
                                        <strong>{plan.macros?.protein || '-'}</strong> prot
                                    </div>
                                </div>
                                <div style={{
                                    background: '#F8FAFC', padding: '0.5rem', borderRadius: '50%'
                                }}>
                                    <ChevronRight size={20} color="#94A3B8" />
                                </div>

                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* --- MODAL DE DETALLES --- */}
            {selectedPlan && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem'
                }} onClick={() => setSelectedPlan(null)}>

                    <div style={{
                        background: 'white', width: '100%', maxWidth: '600px', maxHeight: '90vh',
                        borderRadius: '1.5rem', padding: '0', overflow: 'hidden',
                        display: 'flex', flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }} onClick={e => e.stopPropagation()}>

                        {/* Header Modal */}
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>Detalles del Plan</h2>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {new Date(selectedPlan.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <button onClick={() => setSelectedPlan(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                                <X size={24} color="#64748B" />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>

                            {/* Macros Summary */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                                <div style={{ background: '#FFF7ED', padding: '1rem', borderRadius: '1rem', textAlign: 'center', border: '1px solid #FFEDD5' }}>
                                    <Flame size={20} color="#EA580C" style={{ marginBottom: '0.5rem' }} />
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#9A3412' }}>{selectedPlan.calories}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#EA580C', fontWeight: 600 }}>Calorías</div>
                                </div>
                                <div style={{ background: '#EFF6FF', padding: '1rem', borderRadius: '1rem', textAlign: 'center', border: '1px solid #DBEAFE' }}>
                                    <Dumbbell size={20} color="#2563EB" style={{ marginBottom: '0.5rem' }} />
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E40AF' }}>{selectedPlan.macros?.protein}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600 }}>Proteína</div>
                                </div>
                                <div style={{ background: '#ECFDF5', padding: '1rem', borderRadius: '1rem', textAlign: 'center', border: '1px solid #D1FAE5' }}>
                                    <Wheat size={20} color="#059669" style={{ marginBottom: '0.5rem' }} />
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#065F46' }}>{selectedPlan.macros?.carbs}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>Carbos</div>
                                </div>
                            </div>

                            {/* Meals List */}
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#334155' }}>Menú del Día</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {selectedPlan.plan_data?.perfectDay?.map((meal, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                        padding: '1rem', background: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #F1F5F9'
                                    }}>
                                        <div style={{
                                            background: '#E2E8F0', width: '40px', height: '40px', borderRadius: '0.5rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
                                        }}>
                                            {idx === 0 ? '🍳' : idx === 1 ? '🍲' : idx === 2 ? '🥗' : '🍎'}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{meal.meal}</div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A' }}>{meal.name}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>

                        {/* Footer Actions */}
                        <div style={{ padding: '1.5rem', borderTop: '1px solid #E2E8F0', background: 'white', display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedPlan(null)}
                                style={{
                                    flex: 1, padding: '0.85rem', borderRadius: '0.75rem',
                                    border: '1px solid #E2E8F0', background: 'white',
                                    color: '#64748B', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={() => handleRestore(selectedPlan.plan_data)}
                                style={{
                                    flex: 2, padding: '0.85rem', borderRadius: '0.75rem',
                                    border: 'none', background: 'var(--primary)',
                                    color: 'white', fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                                }}
                            >
                                <RotateCcw size={18} /> Reactivar este Plan
                            </button>
                        </div>

                    </div>
                </div>
            )}

            <style>{`
                @media (max-width: 640px) {
                    .hide-mobile { display: none !important; }
                }
            `}</style>
        </DashboardLayout>
    );
};

export default History;
