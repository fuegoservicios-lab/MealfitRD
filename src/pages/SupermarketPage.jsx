import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    KeyRound, LockKeyhole, Pencil, Plus, RefreshCw, Search,
    ShoppingBasket, Trash2, X,
} from 'lucide-react';
import styles from './Supermarket.module.css';
import { api } from '../config/api';

/* [P1-SUPERMARKET-DB · 2026-07-02] Supermercado RD artificial (/supermercado).
   Vitrina pública de la base de datos `supermarket_products` (Neon): los +200
   alimentos verificados con sus presentaciones, porciones, duración y precio RD$,
   más variantes de MARCA por alimento. Esta base alimentará el sistema de lista
   de compras (el cliente podrá elegir hasta la marca de su yogurt).

   Edición: modo admin desbloqueable en la misma página (token = CRON_SECRET,
   sessionStorage). TODAS las mutaciones van por el backend
   (/api/supermarket/products, gate `_verify_admin_token`) — el cliente jamás
   escribe directo a la DB (invariante I6). */

const TOKEN_KEY = 'mf_market_admin_token';

const EMPTY_FORM = {
    food_name: '', brand: '', presentation: '', portion_label: '',
    duration_label: '', price_rd: '', notes: '', category: '',
    master_food_name: '', active: true,
};

const readToken = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};

const formatPrice = (value) => {
    if (value === null || value === undefined) return '—';
    return `RD$${Number(value).toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;
};

async function requestJson(path, { token, ...options } = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(api(path), { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch { /* body vacío */ }
    if (!res.ok) {
        const detail = data?.detail || `Error ${res.status}`;
        const err = new Error(typeof detail === 'string' ? detail : `Error ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

/* ─────────────────────── formulario crear/editar ─────────────────────── */

const ProductForm = ({ initial, categories, onCancel, onSubmit, saving }) => {
    const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
    const set = (key) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm((f) => ({ ...f, [key]: value }));
    };

    const submit = (e) => {
        e.preventDefault();
        if (!form.food_name.trim()) { toast.error('El alimento es obligatorio.'); return; }
        if (form.price_rd !== '' && (isNaN(Number(form.price_rd)) || Number(form.price_rd) < 0)) {
            toast.error('Precio inválido.');
            return;
        }
        onSubmit(form);
    };

    return (
        <form className={styles.form} onSubmit={submit}>
            <div className={styles.formGrid}>
                <label className={styles.field}>
                    <span>Alimento *</span>
                    <input value={form.food_name} onChange={set('food_name')} maxLength={120} required />
                </label>
                <label className={styles.field}>
                    <span>Marca <em>(vacío = genérico)</em></span>
                    <input value={form.brand || ''} onChange={set('brand')} maxLength={120} placeholder="Ej. Rica, La Famosa…" />
                </label>
                <label className={styles.field}>
                    <span>Presentación</span>
                    <input value={form.presentation || ''} onChange={set('presentation')} maxLength={120} placeholder="Ej. Pote 16 Oz" />
                </label>
                <label className={styles.field}>
                    <span>Porción</span>
                    <input value={form.portion_label || ''} onChange={set('portion_label')} maxLength={60} placeholder="Mínima / Mediana / Mayor / Única" />
                </label>
                <label className={styles.field}>
                    <span>Duración</span>
                    <input value={form.duration_label || ''} onChange={set('duration_label')} maxLength={60} placeholder="7 días / 15 días / 30 días / Relativo" />
                </label>
                <label className={styles.field}>
                    <span>Precio (RD$)</span>
                    <input value={form.price_rd ?? ''} onChange={set('price_rd')} inputMode="decimal" placeholder="0.00" />
                </label>
                <label className={styles.field}>
                    <span>Categoría</span>
                    <input value={form.category || ''} onChange={set('category')} maxLength={80} list="mf-market-categories" />
                    <datalist id="mf-market-categories">
                        {categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                </label>
                <label className={styles.field}>
                    <span>Alimento del catálogo <em>(link lista de compras)</em></span>
                    <input value={form.master_food_name || ''} onChange={set('master_food_name')} maxLength={120} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                    <span>Notas</span>
                    <input value={form.notes || ''} onChange={set('notes')} maxLength={500} placeholder="Ej. Rinde para todos los planes" />
                </label>
                <label className={styles.checkField}>
                    <input type="checkbox" checked={!!form.active} onChange={set('active')} />
                    <span>Visible al público</span>
                </label>
            </div>
            <div className={styles.formActions}>
                <button type="button" className={styles.btnGhost} onClick={onCancel} disabled={saving}>
                    Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>
        </form>
    );
};

/* ─────────────────────────────── página ─────────────────────────────── */

const SupermarketPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [q, setQ] = useState('');
    const [category, setCategory] = useState('');

    const [adminToken, setAdminToken] = useState(readToken);
    const [showUnlock, setShowUnlock] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const isAdmin = !!adminToken;

    const load = useCallback(async (token) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ limit: '1000' });
            if (token) params.set('include_inactive', 'true');
            const data = await requestJson(`/api/supermarket/products?${params.toString()}`, { token });
            setProducts(data?.products || []);
        } catch (err) {
            if (token && (err.status === 401 || err.status === 403)) {
                // Token stale/incorrecto → salir del modo admin y recargar público.
                try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
                setAdminToken('');
                toast.error('Token de administración inválido.');
                return;
            }
            console.error('[supermercado] carga falló:', err);
            setError('No se pudo cargar el supermercado. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(adminToken); }, [adminToken, load]);

    const categories = useMemo(() => {
        const set = new Set(products.map((p) => p.category).filter(Boolean));
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [products]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return products.filter((p) => {
            if (category && p.category !== category) return false;
            if (!needle) return true;
            return [p.food_name, p.brand, p.category, p.presentation]
                .some((v) => (v || '').toLowerCase().includes(needle));
        });
    }, [products, q, category]);

    // Agrupar: categoría → alimento → variantes (el orden ya viene del backend).
    const grouped = useMemo(() => {
        const byCategory = new Map();
        for (const p of filtered) {
            const cat = p.category || 'Sin categoría';
            if (!byCategory.has(cat)) byCategory.set(cat, new Map());
            const foods = byCategory.get(cat);
            const key = p.food_name;
            if (!foods.has(key)) foods.set(key, []);
            foods.get(key).push(p);
        }
        return [...byCategory.entries()].map(([cat, foods]) => ({
            category: cat,
            foods: [...foods.entries()].map(([food, variants]) => ({ food, variants })),
        }));
    }, [filtered]);

    const foodCount = useMemo(() => new Set(products.map((p) => p.food_name.toLowerCase())).size, [products]);

    /* ── admin ── */

    const unlock = (e) => {
        e.preventDefault();
        const token = tokenInput.trim();
        if (!token) return;
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* noop */ }
        setTokenInput('');
        setShowUnlock(false);
        setAdminToken(token); // dispara refetch con include_inactive; 403 → se limpia solo
    };

    const lock = () => {
        try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
        setAdminToken('');
        setCreating(false);
        setEditingId(null);
    };

    const toPayload = (form) => ({
        food_name: form.food_name.trim(),
        brand: form.brand?.trim() || null,
        presentation: form.presentation?.trim() || null,
        portion_label: form.portion_label?.trim() || null,
        duration_label: form.duration_label?.trim() || null,
        price_rd: form.price_rd === '' || form.price_rd === null ? null : Number(form.price_rd),
        notes: form.notes?.trim() || null,
        category: form.category?.trim() || null,
        master_food_name: form.master_food_name?.trim() || null,
        active: !!form.active,
    });

    const createProduct = async (form) => {
        setSaving(true);
        try {
            await requestJson('/api/supermarket/products', {
                method: 'POST', token: adminToken, body: JSON.stringify(toPayload(form)),
            });
            toast.success('Producto agregado.');
            setCreating(false);
            await load(adminToken);
        } catch (err) {
            toast.error(err.message || 'No se pudo crear el producto.');
        } finally {
            setSaving(false);
        }
    };

    const updateProduct = async (id, form) => {
        setSaving(true);
        try {
            await requestJson(`/api/supermarket/products/${id}`, {
                method: 'PATCH', token: adminToken, body: JSON.stringify(toPayload(form)),
            });
            toast.success('Producto actualizado.');
            setEditingId(null);
            await load(adminToken);
        } catch (err) {
            toast.error(err.message || 'No se pudo actualizar.');
        } finally {
            setSaving(false);
        }
    };

    const deleteProduct = async (p) => {
        const label = [p.food_name, p.brand, p.presentation].filter(Boolean).join(' · ');
        // eslint-disable-next-line no-alert
        if (!window.confirm(`¿Eliminar "${label}" del supermercado? Esta acción no se puede deshacer.`)) return;
        try {
            await requestJson(`/api/supermarket/products/${p.id}`, { method: 'DELETE', token: adminToken });
            toast.success('Producto eliminado.');
            await load(adminToken);
        } catch (err) {
            toast.error(err.message || 'No se pudo eliminar.');
        }
    };

    /* ── render ── */

    return (
        <div className={styles.page}>
            <div className={styles.inner}>
                <header className={styles.pageHead}>
                    <span className={styles.eyebrow}>
                        <ShoppingBasket size={15} strokeWidth={2.5} aria-hidden="true" />
                        Supermercado RD
                    </span>
                    <h1 className={styles.pageTitle}>
                        El supermercado <span className={styles.titleAccent}>dominicano</span> de MealfitRD
                    </h1>
                    <p className={styles.lead}>
                        Nuestra base de datos viva de alimentos verificados en República Dominicana:
                        presentaciones reales, porciones, duración y precios en RD$. Sobre esta base
                        construimos la lista de compras más completa posible — incluyendo, muy pronto,
                        la marca exacta de cada producto que prefieras.
                    </p>
                    <div className={styles.stats}>
                        <span><strong>{foodCount}</strong> alimentos</span>
                        <span className={styles.statSep} aria-hidden="true" />
                        <span><strong>{products.length}</strong> presentaciones</span>
                        <span className={styles.statSep} aria-hidden="true" />
                        <span><strong>{categories.length}</strong> categorías</span>
                    </div>
                </header>

                <div className={styles.controls}>
                    <div className={styles.searchBox}>
                        <Search size={16} strokeWidth={2.25} aria-hidden="true" />
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Buscar alimento, marca o categoría…"
                            aria-label="Buscar en el supermercado"
                        />
                    </div>
                    <select
                        className={styles.categorySelect}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        aria-label="Filtrar por categoría"
                    >
                        <option value="">Todas las categorías</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>

                    {isAdmin ? (
                        <div className={styles.adminBar}>
                            <button type="button" className={styles.btnPrimary} onClick={() => { setCreating(true); setEditingId(null); }}>
                                <Plus size={15} strokeWidth={2.5} /> Producto
                            </button>
                            <button type="button" className={styles.btnGhost} onClick={() => load(adminToken)} title="Recargar">
                                <RefreshCw size={15} strokeWidth={2.25} />
                            </button>
                            <button type="button" className={styles.btnGhost} onClick={lock} title="Salir del modo edición">
                                <LockKeyhole size={15} strokeWidth={2.25} /> Salir
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className={styles.unlockBtn}
                            onClick={() => setShowUnlock((v) => !v)}
                            title="Modo edición (solo administración)"
                            aria-label="Modo edición (solo administración)"
                        >
                            <KeyRound size={15} strokeWidth={2.25} />
                        </button>
                    )}
                </div>

                {showUnlock && !isAdmin && (
                    <form className={styles.unlockForm} onSubmit={unlock}>
                        <input
                            type="password"
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            placeholder="Token de administración"
                            aria-label="Token de administración"
                            autoFocus
                        />
                        <button type="submit" className={styles.btnPrimary}>Entrar</button>
                        <button type="button" className={styles.btnGhost} onClick={() => setShowUnlock(false)} aria-label="Cerrar">
                            <X size={15} strokeWidth={2.25} />
                        </button>
                    </form>
                )}

                {isAdmin && (
                    <p className={styles.adminNotice}>
                        Modo edición activo — los cambios se guardan directo en la base de datos
                        y los productos ocultos (no visibles al público) aparecen atenuados.
                    </p>
                )}

                {creating && isAdmin && (
                    <section className={styles.editorCard}>
                        <h3 className={styles.editorTitle}>Nuevo producto</h3>
                        <ProductForm
                            initial={EMPTY_FORM}
                            categories={categories}
                            saving={saving}
                            onCancel={() => setCreating(false)}
                            onSubmit={createProduct}
                        />
                    </section>
                )}

                {loading && <p className={styles.empty}>Cargando el supermercado…</p>}
                {!loading && error && (
                    <div className={styles.errorBox}>
                        <p>{error}</p>
                        <button type="button" className={styles.btnPrimary} onClick={() => load(adminToken)}>
                            Reintentar
                        </button>
                    </div>
                )}
                {!loading && !error && filtered.length === 0 && (
                    <p className={styles.empty}>No hay productos que coincidan con tu búsqueda.</p>
                )}

                {!loading && !error && grouped.map(({ category: cat, foods }) => (
                    <section key={cat} className={styles.categorySection}>
                        <h2 className={styles.categoryTitle}>{cat}</h2>
                        <div className={styles.foodGrid}>
                            {foods.map(({ food, variants }) => (
                                <article key={food} className={styles.foodCard}>
                                    <h3 className={styles.foodName}>{food}</h3>
                                    <ul className={styles.variantList}>
                                        {variants.map((p) => (
                                            <li
                                                key={p.id}
                                                className={`${styles.variant} ${!p.active ? styles.variantInactive : ''}`}
                                            >
                                                {editingId === p.id && isAdmin ? (
                                                    <ProductForm
                                                        initial={{
                                                            ...p,
                                                            price_rd: p.price_rd ?? '',
                                                            brand: p.brand || '',
                                                            presentation: p.presentation || '',
                                                            portion_label: p.portion_label || '',
                                                            duration_label: p.duration_label || '',
                                                            notes: p.notes || '',
                                                            category: p.category || '',
                                                            master_food_name: p.master_food_name || '',
                                                        }}
                                                        categories={categories}
                                                        saving={saving}
                                                        onCancel={() => setEditingId(null)}
                                                        onSubmit={(form) => updateProduct(p.id, form)}
                                                    />
                                                ) : (
                                                    <>
                                                        <div className={styles.variantMain}>
                                                            {p.brand && <span className={styles.brandTag}>{p.brand}</span>}
                                                            <span className={styles.presentation}>
                                                                {p.presentation || 'Presentación única'}
                                                            </span>
                                                            <span className={styles.price}>{formatPrice(p.price_rd)}</span>
                                                        </div>
                                                        <div className={styles.variantMeta}>
                                                            {p.portion_label && <span>Porción: {p.portion_label}</span>}
                                                            {p.duration_label && <span>Duración: {p.duration_label}</span>}
                                                            {p.notes && <span className={styles.notes}>{p.notes}</span>}
                                                            {!p.active && <span className={styles.hiddenTag}>Oculto</span>}
                                                        </div>
                                                        {isAdmin && (
                                                            <div className={styles.variantActions}>
                                                                <button
                                                                    type="button"
                                                                    className={styles.iconBtn}
                                                                    onClick={() => { setEditingId(p.id); setCreating(false); }}
                                                                    title="Editar"
                                                                    aria-label={`Editar ${food}`}
                                                                >
                                                                    <Pencil size={14} strokeWidth={2.25} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                                    onClick={() => deleteProduct(p)}
                                                                    title="Eliminar"
                                                                    aria-label={`Eliminar ${food}`}
                                                                >
                                                                    <Trash2 size={14} strokeWidth={2.25} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    </section>
                ))}

                <p className={styles.footnote}>
                    Precios de referencia del mercado dominicano, verificados por nuestro equipo.
                    Pueden variar por establecimiento y temporada.
                </p>
            </div>
        </div>
    );
};

export default SupermarketPage;
