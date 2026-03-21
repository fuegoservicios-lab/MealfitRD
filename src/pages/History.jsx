import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useAssessment } from '../context/AssessmentContext';
import { Utensils, Calendar, ChevronRight, Flame, Dumbbell, Wheat, Droplet, RotateCcw, X, Edit2, Check, Trash2, Wand2, BookOpen, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './History.module.css';

const History = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [selectedDay, setSelectedDay] = useState(0);
    const [confirmRestore, setConfirmRestore] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    
    // Edit name state
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

    const handleRestoreRequest = () => {
        setConfirmRestore(selectedPlan);
    };

    const handleRestoreConfirm = async () => {
        const planData = confirmRestore?.plan_data;
        setConfirmRestore(null);
        setSelectedPlan(null);
        const toastId = toast.loading('Restaurando plan...');
        
        try {
            await restorePlan(planData);
            toast.success('¡Plan reactivado!', { 
                id: toastId,
                description: 'Tu dashboard se ha actualizado.' 
            });
            navigate('/dashboard');
        } catch (err) {
            console.error('Error restoring plan:', err);
            toast.error('Error al restaurar el plan', { id: toastId });
        }
    };

    const handleDeleteRequest = (e, plan) => {
        e.stopPropagation();
        setConfirmDelete(plan);
    };

    const handleDeleteConfirm = async () => {
        const plan = confirmDelete;
        setConfirmDelete(null);
        const toastId = toast.loading('Eliminando plan...');

        try {
            const { error } = await supabase
                .from('meal_plans')
                .delete()
                .eq('id', plan.id);
            if (error) throw error;
            
            setPlans(prev => prev.filter(p => p.id !== plan.id));
            if (selectedPlan?.id === plan.id) setSelectedPlan(null);
            
            toast.success('Plan eliminado exitosamente', { id: toastId });
        } catch (err) {
            console.error('Error deleting plan:', err);
            toast.error('No se pudo eliminar el plan', { id: toastId });
        }
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

        return tags.slice(0, 3);
    };

    // Meal preview helper
    const renderMealPreview = (plan) => {
        const meals = plan.plan_data?.days?.[0]?.meals || plan.plan_data?.meals || plan.plan_data?.perfectDay || [];
        const emojis = ['🍳', '🍲', '🥗', '🍎'];
        const activeMeals = meals.filter(m => m.name && !m.isSkipped);
        
        return (
            <div className={styles.mealPreviewContainer}>
                {activeMeals.slice(0, 3).map((m, i) => {
                    const shortName = m.name.length > 20 ? m.name.substring(0, 18) + '…' : m.name;
                    return (
                        <div key={i} className={styles.mealPreviewBadge}>
                            <span>{emojis[i] || '🍽️'}</span>
                            <span className={styles.mealPreviewText}>{shortName}</span>
                        </div>
                    );
                })}
                {activeMeals.length > 3 && (
                    <div className={styles.mealPreviewBadgeMore}>
                        +{activeMeals.length - 3}
                    </div>
                )}
            </div>
        );
    };

    // Animation Variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.06 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: 'spring', stiffness: 120, damping: 14 }
        }
    };

    // Skeleton Loader
    const SkeletonLoader = () => (
        <div className={styles.skeletonGrid}>
            {[1, 2, 3].map(i => (
                <div key={i} className={styles.skeletonCard}>
                    <div className={styles.skeletonIcon} />
                    <div className={styles.skeletonLines}>
                        <div className={`${styles.skeletonLine} ${styles.skeletonLineLong}`} />
                        <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                    </div>
                    <div className={styles.skeletonBadge} />
                </div>
            ))}
        </div>
    );

    // Empty State
    const EmptyState = () => (
        <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
                <BookOpen size={36} />
            </div>
            <h3 className={styles.emptyTitle}>Tu historial está vacío</h3>
            <p className={styles.emptyText}>
                Genera tu primer plan nutricional y lo encontrarás aquí.
            </p>
            <button className={styles.emptyCta} onClick={() => navigate('/assessment')}>
                <Wand2 size={18} />
                Crear mi primer plan
            </button>
        </div>
    );

    return (
        <DashboardLayout>
            <div className={styles.container}>
                <div className={styles.headerRow}>
                    <div>
                        <h1 className={styles.title}>
                            Librería de Planes
                        </h1>
                        <p className={styles.subtitle}>
                            Revisa en detalle, renombra o reactiva tus planes anteriores.
                        </p>
                    </div>
                    {!loading && plans.length > 0 && (
                        <span className={styles.planCount}>
                            {plans.length} {plans.length === 1 ? 'plan guardado' : 'planes guardados'}
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <SkeletonLoader />
            ) : plans.length === 0 ? (
                <EmptyState />
            ) : (
                <motion.div
                    className={styles.cardGrid}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    <AnimatePresence>
                        {plans.map((plan) => (
                            <motion.div
                                key={plan.id}
                                variants={itemVariants}
                                layout
                                exit={{ opacity: 0, x: -100, transition: { duration: 0.25 } }}
                                className={styles.card}
                                onClick={() => {
                                    if (isEditing !== plan.id) {
                                        setSelectedDay(0);
                                        setSelectedPlan(plan);
                                    }
                                }}
                            >
                                <div className={styles.cardContent}>
                                    <div className={styles.iconWrapper}>
                                        <Utensils size={24} />
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
                                                <h3 className={styles.planName} title={plan.name || 'Plan Generado'}>
                                                    {plan.name || 'Plan Generado'}
                                                </h3>
                                                <button 
                                                    onClick={(e) => handleEditStart(e, plan)}
                                                    className={styles.renameButton}
                                                    title="Renombrar"
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                            </div>
                                        )}
                                        <span className={styles.dateText}>
                                            {new Date(plan.created_at).toLocaleDateString('es-DO', {
                                                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </span>
                                        {plan.plan_data && (
                                            <div className={styles.mealPreviewWrapper}>
                                                {renderMealPreview(plan)}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.cardActions}>
                                    {/* Calories Badge */}
                                    <div className={styles.caloriesBadge}>
                                        <Flame size={13} fill="#F97316" strokeWidth={0} />
                                        {plan.calories}
                                    </div>

                                    {/* Smart Tags */}
                                    <div className={styles.tagsContainer}>
                                        {getSmartTags(plan).map((tag, idx) => (
                                            <span key={idx} className={styles.tag}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Delete */}
                                    <button
                                        className={styles.deleteButton}
                                        onClick={(e) => handleDeleteRequest(e, plan)}
                                        title="Eliminar plan"
                                    >
                                        <Trash2 size={16} />
                                    </button>

                                    {/* Chevron */}
                                    <div className={styles.chevronWrapper}>
                                        <ChevronRight size={18} color="#94A3B8" />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* --- MODAL DE DETALLES --- */}
            <AnimatePresence>
                {selectedPlan && (
                    <motion.div
                        className={styles.modalOverlay}
                        onClick={() => setSelectedPlan(null)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className={styles.modalContent}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.9, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 30 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        >
                            {/* Header */}
                            <div className={styles.modalHeader}>
                                <div>
                                    <h2 className={styles.modalTitle}>{selectedPlan.name || 'Detalles del Plan'}</h2>
                                    <span className={styles.modalDate}>
                                        {new Date(selectedPlan.created_at).toLocaleDateString('es-DO', {
                                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                        })}
                                    </span>
                                </div>
                                <button onClick={() => setSelectedPlan(null)} className={styles.closeButton}>
                                    <X size={24} color="#64748B" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className={styles.modalBody}>

                                {/* 4-column Macros */}
                                <div className={styles.macrosGrid}>
                                    <div className={`${styles.macroCard} ${styles.macroCardOrange}`}>
                                        <Flame size={18} color="#EA580C" style={{ marginBottom: '0.4rem' }} />
                                        <div className={styles.macroValueOrange}>{selectedPlan.calories}</div>
                                        <div className={styles.macroLabelOrange}>kcal</div>
                                    </div>
                                    <div className={`${styles.macroCard} ${styles.macroCardBlue}`}>
                                        <Dumbbell size={18} color="#2563EB" style={{ marginBottom: '0.4rem' }} />
                                        <div className={styles.macroValueBlue}>{selectedPlan.macros?.protein || '—'}</div>
                                        <div className={styles.macroLabelBlue}>Proteína</div>
                                    </div>
                                    <div className={`${styles.macroCard} ${styles.macroCardGreen}`}>
                                        <Wheat size={18} color="#059669" style={{ marginBottom: '0.4rem' }} />
                                        <div className={styles.macroValueGreen}>{selectedPlan.macros?.carbs || '—'}</div>
                                        <div className={styles.macroLabelGreen}>Carbos</div>
                                    </div>
                                    <div className={`${styles.macroCard} ${styles.macroCardPink}`}>
                                        <Droplet size={18} color="#EC4899" style={{ marginBottom: '0.4rem' }} />
                                        <div className={styles.macroValuePink}>{selectedPlan.macros?.fats || '—'}</div>
                                        <div className={styles.macroLabelPink}>Grasas</div>
                                    </div>
                                </div>

                                {/* Day Tabs */}
                                {selectedPlan.plan_data?.days?.length > 1 && (
                                    <div className={styles.dayTabs}>
                                        {selectedPlan.plan_data.days.map((_, idx) => (
                                            <button
                                                key={idx}
                                                className={`${styles.dayTab} ${selectedDay === idx ? styles.dayTabActive : ''}`}
                                                onClick={() => setSelectedDay(idx)}
                                            >
                                                Opción {String.fromCharCode(65 + idx)}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Meals List */}
                                <h3 className={styles.menuTitle}>
                                    {selectedPlan.plan_data?.days?.length > 1
                                        ? `Menú — Opción ${String.fromCharCode(65 + selectedDay)}`
                                        : 'Menú del Plan'}
                                </h3>
                                <div className={styles.menuList}>
                                    {(selectedPlan.plan_data?.days?.[selectedDay]?.meals || selectedPlan.plan_data?.meals || selectedPlan.plan_data?.perfectDay)?.map((meal, idx) => (
                                        <div key={idx} className={styles.menuItem}>
                                            <div className={styles.menuIcon}>
                                                {idx === 0 ? '🍳' : idx === 1 ? '🍲' : idx === 2 ? '🥗' : '🍎'}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div className={styles.menuMealType}>{meal.meal}</div>
                                                <div className={styles.menuMealName}>{meal.name}</div>
                                            </div>
                                            {meal.cals && (
                                                <span style={{
                                                    fontSize: '0.78rem', fontWeight: 700,
                                                    color: '#EA580C', background: '#FFF7ED',
                                                    padding: '0.2rem 0.5rem', borderRadius: '99px',
                                                    border: '1px solid #FFEDD5', whiteSpace: 'nowrap'
                                                }}>
                                                    {meal.cals} kcal
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className={styles.modalFooter}>
                                <button
                                    onClick={() => setSelectedPlan(null)}
                                    className={styles.modalCloseBtn}
                                >
                                    Cerrar
                                </button>
                                <button
                                    onClick={handleRestoreRequest}
                                    className={styles.modalActionBtn}
                                >
                                    <RotateCcw size={18} /> Reactivar este Plan
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- CONFIRM RESTORE MODAL --- */}
            <AnimatePresence>
                {confirmRestore && (
                    <motion.div
                        className={styles.confirmOverlay}
                        onClick={() => setConfirmRestore(null)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className={styles.confirmBox}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.85, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.85, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        >
                            <div className={styles.confirmIconWrapper}>
                                <AlertTriangle size={28} color="#D97706" />
                            </div>
                            <h3 className={styles.confirmTitle}>¿Reactivar este plan?</h3>
                            <p className={styles.confirmText}>
                                Tu plan actual será reemplazado por <strong>{confirmRestore.name || 'este plan'}</strong>. Esta acción no se puede deshacer.
                            </p>
                            <div className={styles.confirmActions}>
                                <button
                                    className={styles.confirmCancelBtn}
                                    onClick={() => setConfirmRestore(null)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className={styles.confirmAcceptBtn}
                                    onClick={handleRestoreConfirm}
                                >
                                    <RotateCcw size={16} /> Sí, reactivar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- CONFIRM DELETE MODAL --- */}
            <AnimatePresence>
                {confirmDelete && (
                    <motion.div
                        className={styles.confirmOverlay}
                        onClick={() => setConfirmDelete(null)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className={styles.confirmBox}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.85, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.85, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        >
                            <div className={styles.confirmIconWrapper} style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
                                <Trash2 size={28} color="#DC2626" />
                            </div>
                            <h3 className={styles.confirmTitle}>¿Eliminar este plan?</h3>
                            <p className={styles.confirmText}>
                                El plan <strong>{confirmDelete.name || 'Seleccionado'}</strong> será borrado permanentemente de tu historial. Esta acción no se puede deshacer.
                            </p>
                            <div className={styles.confirmActions}>
                                <button
                                    className={styles.confirmCancelBtn}
                                    onClick={() => setConfirmDelete(null)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className={styles.confirmAcceptBtn}
                                    style={{ background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', boxShadow: '0 4px 12px -2px rgba(220, 38, 38, 0.35)' }}
                                    onClick={handleDeleteConfirm}
                                >
                                    <Trash2 size={16} /> Eliminar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
};

export default History;
