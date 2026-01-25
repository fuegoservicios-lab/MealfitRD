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
    const [checkedItems, setCheckedItems] = useState({});

    // Protección de Ruta: Si no hay plan, volver al inicio
    if (!planData) {
        return <Navigate to="/" replace />;
    }

    const handlePrint = () => {
        window.print();
    };

    const toggleItem = (index) => {
        setCheckedItems(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
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
                    <div className="no-print" style={{
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

                {/* --- ESTADO DE PRECIO ESTIMADO (Automático) --- */}
                {currentList().length > 0 && (
                    <div style={{
                        maxWidth: '400px', margin: '0 auto 2rem',
                        background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
                        border: '1px solid #FED7AA', borderRadius: '1rem', padding: '1rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        boxShadow: '0 4px 6px -1px rgba(249, 115, 22, 0.1)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'white', padding: '0.5rem', borderRadius: '50%', color: '#F97316' }}>
                                {/* Icono de Wallet (importar si no existe, o usar lo que hay) */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                            </div>
                            <div style={{ lineHeight: 1.2 }}>
                                <div style={{ fontSize: '0.8rem', color: '#9A3412', fontWeight: 600 }}>Costo Estimado</div>
                                <div style={{ fontSize: '0.7rem', color: '#C2410C' }}>Aprox. Supermercado</div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9A3412' }}>
                                RD$ {currentList().reduce((acc, item) => {
                                    const lowerItem = item.toLowerCase();
                                    let price = 0;

                                    // Precios Base Aproximados en RD$ (Dominicana)
                                    if (lowerItem.includes('pollo') || lowerItem.includes('pechuga')) price = 145; // Libra
                                    else if (lowerItem.includes('arroz')) price = 45; // Libra
                                    else if (lowerItem.includes('huevo')) price = 8 * (parseInt(item.match(/\d+/)?.[0] || 1)); // Unidad
                                    else if (lowerItem.includes('guineo') || lowerItem.includes('banana')) price = 12 * (parseInt(item.match(/\d+/)?.[0] || 1)); // Unidad
                                    else if (lowerItem.includes('plátano') || lowerItem.includes('platano')) price = 25 * (parseInt(item.match(/\d+/)?.[0] || 1)); // Unidad
                                    else if (lowerItem.includes('leche')) price = 85; // Litro/Carton
                                    else if (lowerItem.includes('avena')) price = 60; // Paquete pq
                                    else if (lowerItem.includes('pan')) price = 100; // Paquete
                                    else if (lowerItem.includes('queso')) price = 180; // Libra/Paquete
                                    else if (lowerItem.includes('jamón') || lowerItem.includes('jamon') || lowerItem.includes('salami')) price = 150;
                                    else if (lowerItem.includes('aceite')) price = 350; // Botella
                                    else if (lowerItem.includes('frijol') || lowerItem.includes('habichuela')) price = 70; // Libra/Lata
                                    else if (lowerItem.includes('aguacate')) price = 60; // Unidad
                                    else if (lowerItem.includes('cebolla') || lowerItem.includes('ajo') || lowerItem.includes('verdura') || lowerItem.includes('tomate') || lowerItem.includes('ají') || lowerItem.includes('aji')) price = 40; // Porción
                                    else if (lowerItem.includes('tuna') || lowerItem.includes('atún')) price = 85;
                                    else if (lowerItem.includes('yogurt') || lowerItem.includes('yogur')) price = 65;
                                    else price = 100; // Default promedio

                                    // Ajuste por cantidad detectada si no es unidad específica (simple multiplicador si detecta número grande y no entra en reglas específicas)
                                    // Por seguridad, si el precio base es muy bajo y la cantidad alta, ajustamos, pero las reglas de huevos/guineos ya cubren unidades.

                                    return acc + price;
                                }, 0).toLocaleString()}
                            </div>
                        </div>
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
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
                            {currentList().map((item, index) => {
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
                                            {isChecked && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
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
                            <small>Prueba generando un <b>Nuevo Plan</b> para calcular esta lista.</small>
                        </div>
                    )}
                </div>

                {/* Nota al pie */}
                <div className="no-print" style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <p>💡 Tip: Compra frutas y verduras de temporada para ahorrar más.</p>
                </div>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    button { display: none !important; }
                    /* Asegurar que la tarjeta de precio se vea bien */
                    .price-card {
                        border: 1px solid #000 !important;
                        background: none !important;
                        box-shadow: none !important;
                        color: #000 !important;
                    }
                }
            `}</style>
        </DashboardLayout>
    );
};

export default ShoppingList;