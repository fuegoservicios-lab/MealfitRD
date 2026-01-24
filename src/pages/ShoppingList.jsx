import { useState } from 'react';
import { useAssessment } from '../context/AssessmentContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, Printer, Calendar } from 'lucide-react';

const ShoppingList = () => {
    const { planData } = useAssessment();
    const navigate = useNavigate();
    
    // CAMBIO: Estado por defecto ahora es 'daily' (1 Día) ya que es la única opción
    const [duration, setDuration] = useState('daily'); 

    // Protección de Ruta: Si no hay plan, volver al inicio
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    const handlePrint = () => {
        window.print();
    };

    // Helper para obtener la lista actual basada en la selección
    const currentList = () => {
        if (!planData.shoppingList) return [];
        
        // Soporte para planes antiguos (si eran array directo)
        if (Array.isArray(planData.shoppingList)) return planData.shoppingList;
        
        // Retornar la lista específica
        return planData.shoppingList[duration] || [];
    };

    // Configuración de los botones (Tabs) - SOLO 1 DÍA
    const tabs = [
        { id: 'daily', label: '1 Día' },      
    ];

    return (
        <DashboardLayout>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Header de Navegación */}
                <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                            color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600
                        }}
                    >
                        <Printer size={18} /> Imprimir
                    </button>
                </div>

                {/* Título Principal */}
                <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
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
                        Ingredientes exactos para el menú de hoy.
                    </p>
                </div>

                {/* Selector de Duración (Tabs) */}
                {!Array.isArray(planData.shoppingList) && (
                    <div style={{
                        display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap'
                    }}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setDuration(tab.id)}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: '2rem',
                                    border: duration === tab.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: duration === tab.id ? '#EFF6FF' : 'white',
                                    color: duration === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                                    fontWeight: duration === tab.id ? 700 : 500,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s',
                                    minWidth: '100px',
                                    justifyContent: 'center'
                                }}
                            >
                                <Calendar size={16} /> {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Lista de Items */}
                <div
                    style={{
                        background: 'white',
                        padding: '2rem',
                        borderRadius: '1.5rem',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-lg)'
                    }}
                >
                    {currentList().length > 0 ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
                            {currentList().map((item, index) => (
                                <li key={index} style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    padding: '1rem',
                                    borderBottom: index < currentList().length - 1 ? '1px solid #F1F5F9' : 'none',
                                    transition: 'background 0.2s',
                                    cursor: 'pointer'
                                }}
                                    className="shopping-item"
                                >
                                    <div style={{
                                        minWidth: '24px', height: '24px',
                                        borderRadius: '50%', border: '2px solid #D1D5DB',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'transparent' }} />
                                    </div>

                                    <span style={{ fontSize: '1.1rem', color: 'var(--text-main)', fontWeight: 500 }}>
                                        {item}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No hay items disponibles.</p>
                            <small>Prueba generando un <b>Nuevo Plan</b> para calcular esta lista.</small>
                        </div>
                    )}
                </div>

                {/* Nota al pie */}
                <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <p>💡 Tip: Compra frutas y verduras de temporada para ahorrar más.</p>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default ShoppingList;