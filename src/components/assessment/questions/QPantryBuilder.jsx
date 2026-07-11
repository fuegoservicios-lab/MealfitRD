// [P1-PANTRY-WIZARD-STEP · 2026-07-11] Paso final del wizard SOLO en modo
// planSource='pantry' (feedback owner: "mejor hacerlo directo en el formulario,
// como la pregunta 21"). Reemplaza el desvío a /dashboard/pantry del modo
// constructor: el usuario prepara su Nevera SIN salir del formulario — buscador
// del catálogo verificado, agregar/quitar/ajustar (mismos endpoints que la página
// Nevera: /api/inventory*, el servidor es la fuente de verdad), medidor de
// factibilidad en vivo (POST /api/plans/pantry-feasibility con debounce) y CTA
// final que dispara la generación — deshabilitado con Nevera vacía.
import { useState, useEffect, useRef } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { fetchWithAuth } from '../../../config/api';
import { Plus, Minus, Trash2, Search, Zap, Refrigerator } from 'lucide-react';
import { toast } from 'sonner';
import { NextButton } from './NextButton';
// Cache singleton compartido con la página Nevera: el catálogo es cuasi-inmutable
// (TTL 24h) y las mutaciones de acá deben invalidar el inventario cacheado para
// que /dashboard/pantry no muestre estado stale al abrirse después.
import {
    getCachedMasterList, setCachedMasterList,
    getCachedInventory, setCachedInventory, invalidateInventoryCache,
} from '../../../utils/pantryCache';

// Helper de transporte (mismo contrato que Pantry.jsx::_apiJson — duplicado a
// propósito: importar desde pages/Pantry.jsx metería las 3200 líneas de la página
// en el chunk del wizard).
const _apiJson = async (path, options = {}) => {
    const resp = await fetchWithAuth(path, options);
    let json = null;
    try { json = await resp.json(); } catch { /* body vacío / no-JSON */ }
    if (!resp.ok) {
        const err = new Error((json && json.detail) ? String(json.detail) : `HTTP ${resp.status}`);
        err.status = resp.status;
        err.detail = json?.detail;
        throw err;
    }
    return json;
};

const _daysFor = (groceryDuration) => {
    const g = groceryDuration || 'weekly';
    return g === 'monthly' ? 30 : (g === 'biweekly' ? 15 : 7);
};

export const QPantryBuilder = ({ onFinish, isSubmitting }) => {
    const { formData } = useAssessment();
    const [inventory, setInventory] = useState(() => getCachedInventory() || []);
    const [masterList, setMasterList] = useState(() => getCachedMasterList() || []);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [feas, setFeas] = useState(null);
    const busyRef = useRef(false);

    const days = _daysFor(formData?.groceryDuration);

    const refetch = async () => {
        const invJson = await _apiJson('/api/inventory');
        const rows = invJson?.items || [];
        setInventory(rows);
        setCachedInventory(rows);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const needMaster = (getCachedMasterList() || []).length === 0;
                const [invJson, masterJson] = await Promise.all([
                    _apiJson('/api/inventory'),
                    needMaster ? _apiJson('/api/catalog') : null,
                ]);
                if (cancelled) return;
                const rows = invJson?.items || [];
                setInventory(rows);
                setCachedInventory(rows);
                if (masterJson) {
                    const master = masterJson?.items || [];
                    setMasterList(master);
                    setCachedMasterList(master);
                }
            } catch (e) {
                console.error('QPantryBuilder fetch:', e);
                if (!cancelled) toast.error('No pudimos cargar tu Nevera. Reintenta en unos segundos.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Medidor de factibilidad en vivo: mismo pre-flight determinista del backend
    // (cero costo LLM, RateLimiter server-side), con debounce para que el
    // add/delete persista antes de re-contar.
    useEffect(() => {
        if (loading) return undefined;
        if (!formData?.age || !formData?.weight) return undefined;
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const resp = await fetchWithAuth('/api/plans/pantry-feasibility', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        days,
                        age: formData.age, weight: formData.weight,
                        weightUnit: formData.weightUnit || 'lb',
                        height: formData.height, gender: formData.gender,
                        activityLevel: formData.activityLevel,
                        mainGoal: formData.mainGoal,
                    }),
                });
                if (resp?.ok) {
                    const data = await resp.json();
                    if (!cancelled) setFeas(data);
                }
            } catch { /* fail-soft: el CTA no depende del medidor */ }
        }, 900);
        return () => { cancelled = true; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inventory, loading, days]);

    const norm = (s) => String(s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm(query.trim());
    const inInventory = new Set(inventory.map(i => i.master_ingredient_id).filter(Boolean));
    const results = q.length >= 2
        ? masterList.filter(m => norm(m.name).includes(q)).slice(0, 8)
        : [];

    const addItem = async (master) => {
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            const unit = master.market_container || master.default_unit || 'unidad';
            try {
                await _apiJson('/api/inventory/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ingredient_name: master.name,
                        master_ingredient_id: master.id,
                        quantity: 1,
                        unit,
                        brand: null,
                    }),
                });
            } catch (err) {
                // 409 = ya estaba (UNIQUE user+nombre+unidad) → +1 al existente.
                if (err?.status === 409) {
                    const dup = inventory.find(i => i.master_ingredient_id === master.id);
                    if (dup) {
                        await _apiJson('/api/inventory/increment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ item_id: dup.id, delta: 1 }),
                        });
                    }
                } else {
                    throw err;
                }
            }
            invalidateInventoryCache();
            await refetch();
            setQuery('');
        } catch (e) {
            console.error('QPantryBuilder add:', e);
            toast.error('No se pudo agregar el alimento.');
        } finally {
            busyRef.current = false;
        }
    };

    const changeQty = async (item, delta) => {
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            await _apiJson('/api/inventory/increment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id: item.id, delta }),
            });
            invalidateInventoryCache();
            await refetch();
        } catch (e) {
            console.error('QPantryBuilder qty:', e);
            toast.error('No se pudo ajustar la cantidad.');
        } finally {
            busyRef.current = false;
        }
    };

    const removeItem = async (item) => {
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            await _apiJson(`/api/inventory/items/${item.id}`, { method: 'DELETE' });
            invalidateInventoryCache();
            setInventory(prev => prev.filter(i => i.id !== item.id));
        } catch (e) {
            if (e?.status !== 404) {
                console.error('QPantryBuilder delete:', e);
                toast.error('No se pudo quitar el alimento.');
            } else {
                setInventory(prev => prev.filter(i => i.id !== item.id));
            }
        } finally {
            busyRef.current = false;
        }
    };

    const count = inventory.length;
    const pct = feas ? Math.min(100, Math.round(((feas.days_supported || 0) / days) * 100)) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Buscador del catálogo verificado */}
            <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Busca un alimento (pollo, arroz, plátano…)"
                    aria-label="Buscar alimento para agregar a tu Nevera"
                    style={{
                        width: '100%', padding: '0.85rem 1rem 0.85rem 2.4rem',
                        borderRadius: '0.9rem', border: '1px solid var(--border)',
                        background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.95rem',
                    }}
                />
                {results.length > 0 && (
                    <div role="listbox" aria-label="Resultados del catálogo" style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: '0.9rem', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                    }}>
                        {results.map(m => (
                            <button key={m.id} type="button" role="option" aria-selected="false"
                                onClick={() => addItem(m)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    width: '100%', padding: '0.65rem 0.9rem', background: 'none',
                                    border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem',
                                }}>
                                <span>{m.name}{inInventory.has(m.id) ? ' · ya en tu Nevera' : ''}</span>
                                <Plus size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Lista de lo agregado */}
            {loading ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cargando tu Nevera…</p>
            ) : count === 0 ? (
                <div style={{
                    padding: '1.25rem', borderRadius: '0.9rem', border: '1px dashed var(--border)',
                    color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
                }}>
                    <Refrigerator size={22} />
                    Tu Nevera está vacía — busca arriba y agrega lo que tienes en casa.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto' }}>
                    {inventory.map(item => (
                        <div key={item.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                            padding: '0.55rem 0.8rem', borderRadius: '0.75rem',
                            border: '1px solid var(--border)', background: 'var(--bg-card)',
                        }}>
                            <span style={{ flex: 1, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                {item.ingredient_name}
                            </span>
                            <button type="button" aria-label={`Quitar 1 de ${item.ingredient_name}`}
                                onClick={() => changeQty(item, -1)} disabled={(item.quantity || 0) <= 1}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: (item.quantity || 0) <= 1 ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', padding: '2px 6px' }}>
                                <Minus size={13} />
                            </button>
                            <span style={{ minWidth: '68px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                {item.quantity} {item.unit || ''}
                            </span>
                            <button type="button" aria-label={`Agregar 1 de ${item.ingredient_name}`}
                                onClick={() => changeQty(item, 1)}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 6px' }}>
                                <Plus size={13} />
                            </button>
                            <button type="button" aria-label={`Eliminar ${item.ingredient_name}`}
                                onClick={() => removeItem(item)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-text, #ef4444)', padding: '2px 4px' }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Medidor de factibilidad en vivo */}
            {count > 0 && feas && (
                <div>
                    <div aria-hidden="true" style={{ height: '8px', borderRadius: '99px', background: 'var(--bg-muted)', overflow: 'hidden' }}>
                        <div style={{
                            width: `${pct}%`, height: '100%', borderRadius: '99px',
                            background: feas.feasible ? 'var(--primary)' : '#F59E0B',
                            transition: 'width 0.4s ease',
                        }} />
                    </div>
                    <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                        {feas.feasible
                            ? `Tu Nevera cubre ≈${feas.days_supported} de ${days} días de tu objetivo ✓`
                            : `Tu Nevera cubre ≈${feas.days_supported || 0} de ${days} días — puedes crear el plan igual: la lista de compras te dirá lo que falte.`}
                    </p>
                </div>
            )}

            <NextButton
                onClick={onFinish}
                disabled={isSubmitting || count === 0}
                label={isSubmitting
                    ? 'Generando Plan...'
                    : (count === 0
                        ? 'Agrega al menos un alimento'
                        : `Crear mi plan con esta Nevera (${count})`)}
                icon={Zap}
            />
        </div>
    );
};
