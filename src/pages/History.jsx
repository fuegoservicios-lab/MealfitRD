import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useAssessment } from '../context/AssessmentContext';
import { Calendar, ChevronRight, Flame, Dumbbell, Wheat, RotateCcw, X, Edit2, Check, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import styles from './History.module.css';

const History = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null);
    
    // Estados para edición de nombre
    const [isEditing, setIsEditing] = useState(null);
    const [tempName, setTempName] = useState('');
    
    const navigate = useNavigate();
    const { restorePlan } = useAssessment();

    useEffect(() => {
        fetchHistory();
    },[]);

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

    const handleEditStart = (e, plan) => {
        e.stopPropagation();
        setIsEditing(plan.id);
        setTempName(plan.name || 'Plan Generado');
    };

    const handleEditCancel = (e) => {
        e.stopPropagation();
        setIsEditing(null);
        setTempName('');
    };

    const handleEditSave = async (e, plan) => {
        e.stopPropagation();
        if (!tempName.trim()) {
            setIsEditing(null);
            return;
        }

        try {
            const { error } = await supabase
                .from('meal_plans')
                .update({ name: tempName.trim() })
                .eq('id', plan.id);

            if (error) throw error;

            setPlans(plans.map(p => p.id === plan.id ? { ...p, name: tempName.trim() } : p));
            if (selectedPlan && selectedPlan.id === plan.id) {
                setSelectedPlan({ ...selectedPlan, name: tempName.trim() });
            }
            toast.success('Nombre actualizado');
        } catch (err) {
            console.error('Error al actualizar nombre', err);
            toast.error('Error al actualizar nombre');
        } finally {
            setIsEditing(null);
        }
    };

    const getSmartTags = (plan) => {
        const data = plan.plan_data || {};
        const assessment = data.assessment || {};
        const tags = [];
        
        const goal = data.goal || assessment.mainGoal;
        if (goal === 'lose_weight') tags.push('Pérdida de Grasa');
        else if (goal === 'build_muscle') tags.push('Masa Muscular');
        else if (goal === 'maintain') tags.push('Mantener');
        else if (goal === 'health') tags.push('Salud General');

        const diet = data.diet_preference || assessment.diet_preference || assessment.dietPreference || assessment.dietType;
        if (diet && diet !== 'none' && diet !== 'Omnívoro' && diet !== 'omnivorous') {
            const dietMap = { 'vegetarian': 'Vegetariano', 'vegan': 'Vegano', 'pescatarian': 'Pescatariano', 'keto': 'Keto', 'paleo': 'Paleo' };
            tags.push(dietMap[diet] || (diet.charAt(0).toUpperCase() + diet.slice(1)));
        }

        const allergies = data.allergies || assessment.allergies || assessment.intolerances || [];
        if (Array.isArray(allergies)) {
            if (allergies.includes('lactose') || allergies.includes('dairy')) tags.push('Sin Lácteos');
            if (allergies.includes('gluten')) tags.push('Sin Gluten');
            if (allergies.includes('nuts')) tags.push('Sin Nueces');
            if (allergies.includes('shellfish')) tags.push('Sin Mariscos');
            if (allergies.includes('soy')) tags.push('Sin Soya');
        }

        if (tags.length === 0 && plan.plan_data) tags.push('Personalizado');

        return tags.slice(0, 3);
    };

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <h1 className={styles.title}>
                    Librería de Planes Guardados
                </h1>
                <p className={styles.subtitle}>
                    Revisa en detalle, renombra o reactiva tus planes anteriores.
                </p>
            </div>

            {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Cargando historial...
                </div>
            ) : plans.length === 0 ? (
                <div className={styles.emptyState}>
                    <p className={styles.emptyText}>
                        Aún no tienes planes guardados en el historial.
                    </p>
                </div>
            ) : (
                <div className={styles.cardGrid}>
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            className={styles.card}
                            onClick={() => {
                                if (isEditing !== plan.id) setSelectedPlan(plan);
                            }}
                        >
                            <div className={styles.cardContent}>
                                <div className={styles.iconWrapper}>
                                    <Calendar size={24} />
                                </div>
                                <div className={styles.planInfo}>
                                    {isEditing === plan.id ? (
                                        <div className={styles.planNameRow}>
                                            <input
                                                type="text"
                                                autoFocus
                                                value={tempName}
                                                onChange={(e) => setTempName(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleEditSave(e, plan);
                                                    if (e.key === 'Escape') handleEditCancel(e);
                                                }}
                                                className={styles.editInput}
                                            />
                                            <button onClick={(e) => handleEditSave(e, plan)} className={styles.editButton}>
                                                <Check size={16} />
                                            </button>
                                            <button onClick={(e) => handleEditCancel(e)} className={styles.cancelButton}>
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={styles.planNameRow}>
                                            <h3 className={styles.planName}>
                                                {plan.name || 'Plan Generado'}
                                                <button 
                                                    onClick={(e) => handleEditStart(e, plan)}
                                                    className={styles.renameButton}
                                                    title="Renombrar"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            </h3>
                                        </div>
                                    )}
                                    <span className={styles.dateText}>
                                        {new Date(plan.created_at).toLocaleDateString('es-DO', {
                                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.cardActions}>
                                {/* Etiquetas Inteligentes (Tags) */}
                                <div className={`${styles.tagsContainer} ${styles.hideOnMobile}`}>
                                    {getSmartTags(plan).map((tag, idx) => (
                                        <span key={idx} className={styles.tag}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                                <div className={styles.chevronWrapper}>
                                    <ChevronRight size={20} color="#94A3B8" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* --- MODAL DE DETALLES --- */}
            {selectedPlan && (
                <div className={styles.modalOverlay} onClick={() => setSelectedPlan(null)}>

                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>

                        {/* Header Modal */}
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.modalTitle}>{selectedPlan.name || 'Detalles del Plan'}</h2>
                                <span className={styles.modalDate}>
                                    {new Date(selectedPlan.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <button onClick={() => setSelectedPlan(null)} className={styles.closeButton}>
                                <X size={24} color="#64748B" />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className={styles.modalBody}>

                            {/* Macros Summary */}
                            <div className={styles.macrosGrid}>
                                <div className={`${styles.macroCard} ${styles.macroCardOrange}`}>
                                    <Flame size={20} color="#EA580C" style={{ marginBottom: '0.5rem' }} />
                                    <div className={styles.macroValueOrange}>{selectedPlan.calories}</div>
                                    <div className={styles.macroLabelOrange}>Calorías</div>
                                </div>
                                <div className={`${styles.macroCard} ${styles.macroCardBlue}`}>
                                    <Dumbbell size={20} color="#2563EB" style={{ marginBottom: '0.5rem' }} />
                                    <div className={styles.macroValueBlue}>{selectedPlan.macros?.protein}</div>
                                    <div className={styles.macroLabelBlue}>Proteína</div>
                                </div>
                                <div className={`${styles.macroCard} ${styles.macroCardGreen}`}>
                                    <Wheat size={20} color="#059669" style={{ marginBottom: '0.5rem' }} />
                                    <div className={styles.macroValueGreen}>{selectedPlan.macros?.carbs}</div>
                                    <div className={styles.macroLabelGreen}>Carbos</div>
                                </div>
                            </div>

                            {/* Meals List */}
                            <h3 className={styles.menuTitle}>Menú de la Opción</h3>
                            <div className={styles.menuList}>
                                {(selectedPlan.plan_data?.meals || selectedPlan.plan_data?.perfectDay)?.map((meal, idx) => (
                                    <div key={idx} className={styles.menuItem}>
                                        <div className={styles.menuIcon}>
                                            {idx === 0 ? '🍳' : idx === 1 ? '🍲' : idx === 2 ? '🥗' : '🍎'}
                                        </div>
                                        <div>
                                            <div className={styles.menuMealType}>{meal.meal}</div>
                                            <div className={styles.menuMealName}>{meal.name}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>

                        {/* Footer Actions */}
                        <div className={styles.modalFooter}>
                            <button
                                onClick={() => setSelectedPlan(null)}
                                className={styles.modalCloseBtn}
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={() => handleRestore(selectedPlan.plan_data)}
                                className={styles.modalActionBtn}
                            >
                                <RotateCcw size={18} /> Reactivar este Plan
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default History;
