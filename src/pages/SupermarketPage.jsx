import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    BadgeCheck, KeyRound, LockKeyhole, Pencil, Plus, RefreshCw, Search,
    ShoppingBasket, Trash2, X,
} from 'lucide-react';
import styles from './Supermarket.module.css';
import { api } from '../config/api';

/* [P1-SUPERMARKET-DB · 2026-07-02 · fase 2 catálogo] Supermercado RD (/supermercado).
   Catálogo profesional estilo supermercado online (patrón La Sirena): una tarjeta por
   SKU (alimento + marca + presentación + precio RD$); clic → modal de detalle con
   imagen (o placeholder por categoría), especificaciones y las demás variantes del
   mismo alimento. Base del futuro selector de marcas en la lista de compras.

   Edición: modo admin en la misma página (token = CRON_SECRET, sessionStorage).
   TODAS las mutaciones van por el backend (/api/supermarket, gate
   `_verify_admin_token`) — el cliente jamás escribe directo a la DB (simétrica I6). */

const TOKEN_KEY = 'mf_market_admin_token';
const PAGE_SIZE = 48;

const CATEGORY_EMOJI = {
    'Lácteos y huevos': '🥛',
    'Carnes, pescados y mariscos': '🥩',
    'Vegetales y verduras': '🥦',
    'Frutas': '🍎',
    'Granos y cereales': '🌾',
    'Legumbres y proteína vegetal': '🫘',
    'Condimentos y especias': '🧂',
    'Aceites y grasas': '🫒',
    'Semillas y frutos secos': '🥜',
    'Panadería y harinas': '🍞',
    'Bebidas y alternativas vegetales': '🥥',
    'Víveres y tubérculos': '🍠',
    'Salsas y aderezos': '🥫',
    'Otros': '🛒',
};

const EMPTY_FORM = {
    food_name: '', brand: '', presentation: '', portion_label: '',
    duration_label: '', price_rd: '', notes: '', category: '',
    master_food_name: '', image_url: '', description: '', active: true,
};

const readToken = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};

const formatPrice = (value) => {
    if (value === null || value === undefined) return 'Precio relativo';
    return `RD$${Number(value).toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;
};

const productTitle = (p) => [p.food_name, p.brand].filter(Boolean).join(' · ');

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

/* ─────────────────────── imagen / placeholder ─────────────────────── */

const ProductImage = ({ product, large = false }) => {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [product.image_url]);
    if (product.image_url && !broken) {
        return (
            <img
                src={product.image_url}
                alt={productTitle(product)}
                className={large ? styles.detailImg : styles.cardImg}
                loading="lazy"
                onError={() => setBroken(true)}
            />
        );
    }
    return (
        <span className={large ? styles.detailEmoji : styles.cardEmoji} aria-hidden="true">
            {CATEGORY_EMOJI[product.category] || '🛒'}
        </span>
    );
};

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
                    <input value={form.brand || ''} onChange={set('brand')} maxLength={120} placeholder="Ej. Rica, Wala, Milex…" />
                </label>
                <label className={styles.field}>
                    <span>Presentación</span>
                    <input value={form.presentation || ''} onChange={set('presentation')} maxLength={120} placeholder="Ej. Cartón 1 Lt" />
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
                    <span>Porción</span>
                    <input value={form.portion_label || ''} onChange={set('portion_label')} maxLength={60} placeholder="Mínima / Mediana / Mayor / Única" />
                </label>
                <label className={styles.field}>
                    <span>Duración</span>
                    <input value={form.duration_label || ''} onChange={set('duration_label')} maxLength={60} placeholder="7 días / 30 días / Relativo" />
                </label>
                <label className={styles.field}>
                    <span>Alimento del catálogo <em>(link lista de compras)</em></span>
                    <input value={form.master_food_name || ''} onChange={set('master_food_name')} maxLength={120} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                    <span>Descripción / especificaciones</span>
                    <input value={form.description || ''} onChange={set('description')} maxLength={800} placeholder="Ej. Leche entera UHT 3.1% grasa" />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                    <span>Imagen (URL)</span>
                    <input value={form.image_url || ''} onChange={set('image_url')} maxLength={800} placeholder="https://…" />
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
    const [brand, setBrand] = useState('');
    const [sort, setSort] = useState('nombre');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const [adminToken, setAdminToken] = useState(readToken);
    const [showUnlock, setShowUnlock] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [saving, setSaving] = useState(false);

    // modal: { mode: 'detail' | 'edit' | 'create', product? }
    const [modal, setModal] = useState(null);

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

    // Bloquear scroll del body mientras el modal está abierto + cerrar con Esc.
    useEffect(() => {
        if (!modal) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => { if (e.key === 'Escape') setModal(null); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [modal]);

    const categories = useMemo(() => {
        const set = new Set(products.map((p) => p.category).filter(Boolean));
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [products]);

    const brands = useMemo(() => {
        const set = new Set(products.map((p) => p.brand).filter(Boolean));
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [products]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        let list = products.filter((p) => {
            if (category && p.category !== category) return false;
            if (brand === '__generic__') { if (p.brand) return false; }
            else if (brand && p.brand !== brand) return false;
            if (!needle) return true;
            return [p.food_name, p.brand, p.category, p.presentation, p.description]
                .some((v) => (v || '').toLowerCase().includes(needle));
        });
        if (sort === 'precio-asc') {
            list = [...list].sort((a, b) => (a.price_rd ?? Infinity) - (b.price_rd ?? Infinity));
        } else if (sort === 'precio-desc') {
            list = [...list].sort((a, b) => (b.price_rd ?? -Infinity) - (a.price_rd ?? -Infinity));
        }
        // 'nombre': orden del backend (categoría → alimento → marca → presentación)
        return list;
    }, [products, q, category, brand, sort]);

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [q, category, brand, sort]);

    const visible = filtered.slice(0, visibleCount);
    const foodCount = useMemo(() => new Set(products.map((p) => p.food_name.toLowerCase())).size, [products]);

    const variantsOf = useCallback((p) => (
        products.filter((v) => v.food_name === p.food_name && v.id !== p.id)
    ), [products]);

    /* ── admin ── */

    const unlock = (e) => {
        e.preventDefault();
        const token = tokenInput.trim();
        if (!token) return;
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* noop */ }
        setTokenInput('');
        setShowUnlock(false);
        setAdminToken(token);
    };

    const lock = () => {
        try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
        setAdminToken('');
        setModal(null);
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
        image_url: form.image_url?.trim() || null,
        description: form.description?.trim() || null,
        active: !!form.active,
    });

    const createProduct = async (form) => {
        setSaving(true);
        try {
            await requestJson('/api/supermarket/products', {
                method: 'POST', token: adminToken, body: JSON.stringify(toPayload(form)),
            });
            toast.success('Producto agregado.');
            setModal(null);
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
            const data = await requestJson(`/api/supermarket/products/${id}`, {
                method: 'PATCH', token: adminToken, body: JSON.stringify(toPayload(form)),
            });
            toast.success('Producto actualizado.');
            setModal({ mode: 'detail', product: data.product });
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
            setModal(null);
            await load(adminToken);
        } catch (err) {
            toast.error(err.message || 'No se pudo eliminar.');
        }
    };

    const toFormInitial = (p) => ({
        ...p,
        price_rd: p.price_rd ?? '',
        brand: p.brand || '',
        presentation: p.presentation || '',
        portion_label: p.portion_label || '',
        duration_label: p.duration_label || '',
        notes: p.notes || '',
        category: p.category || '',
        master_food_name: p.master_food_name || '',
        image_url: p.image_url || '',
        description: p.description || '',
    });

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
                        Nuestra base de datos viva del mercado dominicano: alimentos verificados con sus
                        marcas, presentaciones y precios reales en RD$. Sobre esta base construimos la
                        lista de compras más completa posible — hasta la marca exacta que prefieras.
                    </p>
                    <div className={styles.stats}>
                        <span><strong>{foodCount}</strong> alimentos</span>
                        <span className={styles.statSep} aria-hidden="true" />
                        <span><strong>{products.length}</strong> productos</span>
                        <span className={styles.statSep} aria-hidden="true" />
                        <span><strong>{brands.length}</strong> marcas</span>
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
                            placeholder="Buscar alimento, marca o presentación…"
                            aria-label="Buscar en el supermercado"
                        />
                    </div>
                    <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar por categoría">
                        <option value="">Todas las categorías</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className={styles.select} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Filtrar por marca">
                        <option value="">Todas las marcas</option>
                        <option value="__generic__">Genérico (sin marca)</option>
                        {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
                        <option value="nombre">Ordenar: A–Z</option>
                        <option value="precio-asc">Precio: menor a mayor</option>
                        <option value="precio-desc">Precio: mayor a menor</option>
                    </select>

                    {isAdmin ? (
                        <div className={styles.adminBar}>
                            <button type="button" className={styles.btnPrimary} onClick={() => setModal({ mode: 'create' })}>
                                <Plus size={15} strokeWidth={2.5} /> Producto
                            </button>
                            <button type="button" className={styles.btnGhost} onClick={() => load(adminToken)} title="Recargar" aria-label="Recargar">
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
                        Modo edición activo — clic en un producto para editarlo. Los productos ocultos
                        aparecen atenuados y no son visibles al público.
                    </p>
                )}

                <div className={styles.resultBar} aria-live="polite">
                    {!loading && !error && (
                        <span>{filtered.length} producto{filtered.length === 1 ? '' : 's'}</span>
                    )}
                </div>

                {loading && (
                    <div className={styles.skeletonGrid} aria-hidden="true">
                        {Array.from({ length: 8 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
                    </div>
                )}
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

                {!loading && !error && (
                    <>
                        <div className={styles.grid}>
                            {visible.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`${styles.card} ${!p.active ? styles.cardInactive : ''}`}
                                    onClick={() => setModal({ mode: 'detail', product: p })}
                                    aria-label={`Ver detalles de ${productTitle(p)}`}
                                >
                                    <div className={styles.cardMedia}>
                                        <ProductImage product={p} />
                                        {!p.active && <span className={styles.hiddenTag}>Oculto</span>}
                                    </div>
                                    <div className={styles.cardBody}>
                                        <span className={styles.brandTag}>{p.brand || 'Genérico'}</span>
                                        <h3 className={styles.cardTitle}>{p.food_name}</h3>
                                        <p className={styles.cardSub}>{p.presentation || 'Presentación única'}</p>
                                        <div className={styles.cardPriceRow}>
                                            <span className={styles.price}>{formatPrice(p.price_rd)}</span>
                                            {p.is_verified && (
                                                <span className={styles.verified} title="Verificado por MealfitRD">
                                                    <BadgeCheck size={14} strokeWidth={2.25} aria-hidden="true" />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {visibleCount < filtered.length && (
                            <div className={styles.moreWrap}>
                                <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                                >
                                    Mostrar más ({filtered.length - visibleCount} restantes)
                                </button>
                            </div>
                        )}
                    </>
                )}

                <p className={styles.footnote}>
                    Precios de referencia del mercado dominicano, verificados por nuestro equipo.
                    Pueden variar por establecimiento y temporada.
                </p>
            </div>

            {/* ─────────────────────── modal ─────────────────────── */}
            {modal && (
                <div className={styles.overlay} onClick={() => setModal(null)} role="presentation">
                    <div
                        className={styles.modal}
                        role="dialog"
                        aria-modal="true"
                        aria-label={modal.mode === 'create' ? 'Nuevo producto' : productTitle(modal.product || {})}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button type="button" className={styles.modalClose} onClick={() => setModal(null)} aria-label="Cerrar">
                            <X size={18} strokeWidth={2.25} />
                        </button>

                        {modal.mode === 'create' && (
                            <div className={styles.modalPad}>
                                <h3 className={styles.modalTitle}>Nuevo producto</h3>
                                <ProductForm
                                    initial={EMPTY_FORM}
                                    categories={categories}
                                    saving={saving}
                                    onCancel={() => setModal(null)}
                                    onSubmit={createProduct}
                                />
                            </div>
                        )}

                        {modal.mode === 'edit' && (
                            <div className={styles.modalPad}>
                                <h3 className={styles.modalTitle}>Editar producto</h3>
                                <ProductForm
                                    initial={toFormInitial(modal.product)}
                                    categories={categories}
                                    saving={saving}
                                    onCancel={() => setModal({ mode: 'detail', product: modal.product })}
                                    onSubmit={(form) => updateProduct(modal.product.id, form)}
                                />
                            </div>
                        )}

                        {modal.mode === 'detail' && (() => {
                            const p = modal.product;
                            const variants = variantsOf(p);
                            return (
                                <div className={styles.detail}>
                                    <div className={styles.detailMedia}>
                                        <ProductImage product={p} large />
                                    </div>
                                    <div className={styles.detailInfo}>
                                        <span className={styles.brandTag}>{p.brand || 'Genérico'}</span>
                                        <h3 className={styles.detailTitle}>{p.food_name}</h3>
                                        {p.description && <p className={styles.detailDesc}>{p.description}</p>}
                                        <div className={styles.detailPriceRow}>
                                            <span className={styles.detailPrice}>{formatPrice(p.price_rd)}</span>
                                            {p.is_verified && (
                                                <span className={styles.verifiedLabel}>
                                                    <BadgeCheck size={15} strokeWidth={2.25} aria-hidden="true" /> Verificado
                                                </span>
                                            )}
                                            {!p.active && <span className={styles.hiddenTag}>Oculto</span>}
                                        </div>

                                        <dl className={styles.specs}>
                                            {p.presentation && (<><dt>Presentación</dt><dd>{p.presentation}</dd></>)}
                                            {p.category && (<><dt>Categoría</dt><dd>{p.category}</dd></>)}
                                            {p.portion_label && (<><dt>Porción</dt><dd>{p.portion_label}</dd></>)}
                                            {p.duration_label && (<><dt>Duración</dt><dd>{p.duration_label}</dd></>)}
                                            {p.notes && (<><dt>Notas</dt><dd>{p.notes}</dd></>)}
                                        </dl>

                                        {isAdmin && (
                                            <div className={styles.detailActions}>
                                                <button type="button" className={styles.btnPrimary} onClick={() => setModal({ mode: 'edit', product: p })}>
                                                    <Pencil size={14} strokeWidth={2.25} /> Editar
                                                </button>
                                                <button type="button" className={`${styles.btnGhost} ${styles.btnDanger}`} onClick={() => deleteProduct(p)}>
                                                    <Trash2 size={14} strokeWidth={2.25} /> Eliminar
                                                </button>
                                            </div>
                                        )}

                                        {variants.length > 0 && (
                                            <div className={styles.variants}>
                                                <h4 className={styles.variantsTitle}>
                                                    Otras presentaciones y marcas de {p.food_name}
                                                </h4>
                                                <ul className={styles.variantList}>
                                                    {variants.map((v) => (
                                                        <li key={v.id}>
                                                            <button
                                                                type="button"
                                                                className={styles.variantRow}
                                                                onClick={() => setModal({ mode: 'detail', product: v })}
                                                            >
                                                                <span className={styles.variantBrand}>{v.brand || 'Genérico'}</span>
                                                                <span className={styles.variantPres}>{v.presentation || '—'}</span>
                                                                <span className={styles.variantPrice}>{formatPrice(v.price_rd)}</span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupermarketPage;
