import { useState, useMemo } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, Printer } from 'lucide-react';

// IMPORTAMOS EL NUEVO SERVICIO GENERADOR
import { generateShoppingListFromPlan } from '../services/shoppingGenerator';

const ShoppingList = () => {
    const { planData } = useAssessment();
    const navigate = useNavigate();

    // 1. TODOS LOS HOOKS PRIMERO (Antes de cualquier return)

    // Estado para los items marcados
    const [checkedItems, setCheckedItems] = useState({});

    // Generamos la lista usando el servicio
    // Nota: El servicio maneja internamente si planData es null devolviendo []
    const shoppingListItems = useMemo(() => {
        if (!planData) return [];
        return generateShoppingListFromPlan(planData);
    }, [planData]);



    // 2. AHORA SÍ PODEMOS HACER EL RETURN CONDICIONAL
    // Protección de Ruta: Si no hay plan, volver al inicio
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    // --- MANEJADORES DE EVENTOS ---
    const handlePrint = () => {
        window.print();
    };

    const toggleItem = (index) => {
        setCheckedItems(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    return (
        <DashboardLayout>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>

                {/* --- HEADER DE NAVEGACIÓN --- */}
                <div className="no-print" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

                    <button
                        onClick={handlePrint}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'white', border: '1px solid var(--border)',
                            padding: '0.5rem 1rem', borderRadius: '0.5rem',
                            color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Printer size={18} /> Imprimir
                    </button>
                </div>

                {/* --- TÍTULO PRINCIPAL --- */}
                <div className="no-print" style={{ marginBottom: '2rem', textAlign: 'center' }}>
                    <div style={{
                        width: 60, height: 60, background: '#DCFCE7', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#166534', margin: '0 auto 1rem'
                    }}>
                        <ShoppingCart size={30} />
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Tu Lista de Compras
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Ingredientes exactos extraídos de tus recetas de hoy.
                    </p>

                    <div style={{
                        marginTop: '1rem',
                        display: 'inline-block',
                        padding: '0.25rem 1rem',
                        borderRadius: '2rem',
                        border: '1px solid var(--primary)',
                        color: 'var(--primary)',
                        fontSize: '0.85rem', fontWeight: 600
                    }}>
                        📅 Plan de 1 Día
                    </div>
                </div>

                {/* --- ESTIMACIÓN DE COSTO --- */}


                {/* --- LISTA DE ITEMS --- */}
                <div
                    style={{
                        background: 'white',
                        padding: '2rem',
                        borderRadius: '1.5rem',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-sm)'
                    }}
                >
                    {shoppingListItems.length > 0 ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
                            {shoppingListItems.map((item, index) => {
                                const isChecked = !!checkedItems[index];
                                return (
                                    <li
                                        key={index}
                                        onClick={() => toggleItem(index)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '1rem',
                                            padding: '1rem',
                                            borderRadius: '1rem',
                                            background: isChecked ? '#F8FAFC' : 'white',
                                            border: isChecked ? '1px solid transparent' : '1px solid #F1F5F9',
                                            transition: 'all 0.2s ease',
                                            cursor: 'pointer',
                                            opacity: isChecked ? 0.6 : 1
                                        }}
                                        className="shopping-item"
                                    >
                                        <div style={{
                                            minWidth: '24px', height: '24px',
                                            borderRadius: '50%',
                                            border: isChecked ? 'none' : '2px solid #D1D5DB',
                                            background: isChecked ? 'var(--primary)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white',
                                            transition: 'all 0.2s'
                                        }}>
                                            {isChecked && (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            )}
                                        </div>

                                        <span style={{
                                            fontSize: '1.05rem',
                                            color: isChecked ? 'var(--text-muted)' : 'var(--text-main)',
                                            fontWeight: isChecked ? 400 : 500,
                                            textDecoration: isChecked ? 'line-through' : 'none',
                                            transition: 'all 0.2s'
                                        }}>
                                            {item}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No hay items disponibles.</p>
                            <small>
                                Prueba generando un <b>Nuevo Plan</b>. <br />
                                (Si acabas de actualizar la app, regenera tu plan para ver los ingredientes).
                            </small>
                        </div>
                    )}
                </div>

                {/* --- HEADER DE IMPRESIÓN (Invisible en pantalla) --- */}
                <div className="print-only" style={{ display: 'none', marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1 style={{ fontSize: '24pt', color: '#000', margin: 0 }}>MealfitRD<span style={{ color: '#4F46E5' }}>.</span></h1>
                        <span style={{ fontSize: '10pt', color: '#666' }}>{new Date().toLocaleDateString()}</span>
                    </div>
                </div>

                {/* --- NOTA AL PIE --- */}

            </div>

            {/* --- ESTILOS DE IMPRESIÓN --- */}
            <style>{`
                @media print {
                    @page { margin: 1.5cm; }
                    body {
                        background: white !important;
                        color: black !important;
                        font-size: 12pt;
                    }
                    /* Ocultar UI del Dashboard */
                    aside, nav, header, .no-print, button { display: none !important; }
                    
                    /* Resetear Layout */
                    .container, .main-content, div[class*="DashboardLayout"] {
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        max-width: none !important;
                        display: block !important;
                    }
                    
                    /* Mostrar Header de Impresión */
                    .print-only {
                        display: block !important;
                    }

                    /* Estilos de Lista para Impresión */
                    .shopping-item { 
                        border-bottom: 1px solid #eee !important;
                        padding: 0.5rem 0 !important;
                        break-inside: avoid;
                        background: transparent !important;
                        border-radius: 0 !important;
                        display: flex !important;
                        align-items: center !important;
                    }
                    
                    .shopping-item span {
                        color: black !important;
                        font-size: 11pt !important;
                        text-decoration: none !important;
                    }

                    /* Checkbox visual para imprimir (círculo vacío) */
                    .shopping-item div:first-child {
                        border: 1px solid #000 !important;
                        background: transparent !important;
                        color: transparent !important;
                        width: 16px !important;
                        height: 16px !important;
                        margin-right: 10px !important;
                    }
                }
            `}</style>
        </DashboardLayout>
    );
};

export default ShoppingList;