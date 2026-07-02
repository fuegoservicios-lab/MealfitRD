import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    ArrowLeft, ArrowUpDown, BadgeCheck, ChevronDown, KeyRound, LockKeyhole, Pencil, Plus,
    RefreshCw, Search, ShoppingBasket, Store, Tags, Trash2, X,
} from 'lucide-react';
import styles from './Supermarket.module.css';
import { api } from '../config/api';

/* [P1-SUPERMARKET-DB · 2026-07-02 · fase 3 catálogo por alimento] Supermercado RD
   (/supermercado). El catálogo se agrupa por ALIMENTO: una tarjeta por alimento
   (no por SKU) con su rango de precios y conteo de variantes; clic → modal del
   alimento con TODAS sus variantes (genérico primero, luego por precio) → clic en
   una variante → ficha completa del producto. Es la misma estructura
   alimento→variantes que consumirá el selector de marcas de la lista de compras.

   Edición: modo admin en la misma página (token = CRON_SECRET, sessionStorage).
   TODAS las mutaciones van por el backend (/api/supermarket, gate
   `_verify_admin_token`) — el cliente jamás escribe directo a la DB (simétrica I6). */

const TOKEN_KEY = 'mf_market_admin_token';
const PAGE_SIZE = 48;

/* Emoji POR ALIMENTO (clave = nombre normalizado sin acentos, ver foodKeyOf).
   Cubre los 252 alimentos del catálogo a 2026-07-02; para alimentos futuros
   aplican los keywords de FOOD_EMOJI_KEYWORDS y, de último, el de categoría. */
const FOOD_EMOJI = {
    'aceite de coco': '🥥', 'aceite de oliva': '🫒', 'aceite de sesamo': '🍶', 'aceite vegetal': '🌻',
    'aceituna': '🫒', 'adamame': '🫛', 'aguacate': '🥑',
    'ajo': '🧄', 'ajo en pasta': '🧄', 'ajo en polvo': '🧄', 'ajo y perejil': '🧄', 'ajonjoli': '🌱',
    'aji cubanela': '🫑', 'aji morron': '🫑',
    'albahaca': '🌿', 'albahaca seca': '🌿', 'alcachofa': '🥬', 'algas marinas': '🌊',
    'almendras': '🌰', 'almendras fileteadas': '🌰', 'apio': '🥬', 'arenque': '🐟',
    'arroz arborio': '🍚', 'arroz basmati': '🍚', 'arroz blanco': '🍚', 'arroz integral': '🍚',
    'arroz jazmin': '🍚', 'arroz sazonado': '🍚', 'arroz valencia': '🍚', 'arandanos': '🫐',
    'atun en aceite': '🐟', 'atun en agua': '🐟', 'auyama': '🎃', 'avena': '🥣', 'bacalao': '🐟',
    'barra de granola': '🍪', 'batata': '🍠', 'berenjena': '🍆', 'berro': '🌿', 'bok choy': '🥬',
    'brocoli': '🥦', 'bulgur': '🌾', 'cacao en polvo': '🍫', 'calabacin': '🥒', 'calamar': '🦑',
    'camaron': '🦐', 'canela en polvo': '🟤', 'cangrejo': '🦀',
    'carne de res molida': '🥩', 'carne de res': '🥩', 'casabe': '🫓', 'casabe albahaca': '🫓',
    'cebada': '🌾', 'cebolla': '🧅', 'cebolla en polvo': '🧅', 'cebollin': '🧅', 'cerdo': '🥩',
    'cereza': '🍒', 'champinones': '🍄', 'chinola': '🥭', 'chivo': '🐐', 'chuleta costillas': '🥩',
    'cilantro': '🌿', 'cilantro ancho': '🌿', 'cilantro seco': '🌿', 'ciruela': '🍇', 'ciruela pasa': '🍇',
    'coco': '🥥', 'coles de bruselas': '🥬', 'coliflor': '🥦', 'comino': '🧂', 'conejo': '🐇',
    'crema de leche': '🥛', 'cundeamor': '🥒', 'curry en polvo': '🍛', 'curcuma': '🫚',
    'curcuma molida': '🫚', 'dumplings de cerdo': '🥟', 'durazno': '🍑', 'datiles': '🌴',
    'espaguetis': '🍝', 'espinaca': '🥬', 'esparragos': '🌱', 'filete arenque': '🐟',
    'filete de pescado blanco': '🐟', 'filete pechuga de pollo': '🍗', 'fresa': '🍓',
    'frijoles pintos': '🫘', 'galleta de soda': '🍪', 'galleta de soda integral': '🍪',
    'garbanzo': '🫘', 'granada': '🍎', 'granola': '🥣', 'guandules': '🫘', 'guanabana': '🍈',
    'guayaba': '🍈', 'guineo maduro': '🍌', 'guineo verde': '🍌', 'guisantes': '🫛',
    'guisantes secos': '🫛', 'habas': '🫘', 'habichuela negra': '🫘', 'habichuelas blancas': '🫘',
    'habichuelas rojas': '🫘', 'harina de negrito': '🌾', 'harina de arroz integral': '🌾',
    'harina de garbanzo': '🌾', 'harina de maiz precocida': '🌽', 'harina de trigo': '🌾',
    'harina de trigo integral': '🌾', 'huevos': '🥚', 'huevos de codorniz': '🥚',
    'higado de res': '🥩', 'jamon de cerdo': '🍖', 'jamon de pavo': '🍖', 'jengibre': '🫚',
    'jengibre molido': '🫚', 'kale picado': '🥬', 'kefir': '🥛', 'kiwi': '🥝', 'kombucha': '🍵',
    'laurel': '🍃', 'leche': '🥛', 'leche condensada': '🥛', 'leche de almendras': '🥛',
    'leche de avena': '🥛', 'leche de cabra en polvo': '🥛', 'leche de coco': '🥥',
    'leche de soya': '🥛', 'leche descremada': '🥛', 'leche en polvo': '🥛', 'leche evaporada': '🥛',
    'leche infantil y de crecimiento': '🍼', 'leche saborizada': '🥛', 'leche semidescremada': '🥛',
    'leche sin lactosa': '🥛', 'lechosa': '🍈', 'lechuga': '🥬', 'lechuga romana': '🥬',
    'lenteja': '🫘', 'limon': '🍋', 'linaza': '🌾', 'longaniza': '🌭', 'mandarina': '🍊',
    'mango': '🥭', 'manteca de cerdo': '🥓', 'mantequilla': '🧈', 'mantequilla de almendras': '🌰',
    'mantequilla de mani': '🥜', 'manzana': '🍎', 'mani': '🥜', 'mapuey': '🍠', 'margarina': '🧈',
    'maiz dulce': '🌽', 'mejillones': '🦪', 'melon': '🍈', 'mero': '🐟', 'miel': '🍯',
    'molondrones': '🫛', 'mostaza': '🫙', 'mostaza en polvo': '🫙', 'muslo de pollo': '🍗',
    'nabo': '🥔', 'naranja': '🍊', 'nueces mixtas': '🌰', 'nectar de chinola': '🧃',
    'nispero': '🍈', 'oregano': '🌿', 'oregano fresco': '🌿', 'palmito': '🌴',
    'pan blanco familiar': '🍞', 'pan blanco personal': '🍞', 'pan de semillas': '🍞',
    'pan integral familiar': '🍞', 'pan integral personal': '🍞', 'pan pita integral': '🫓',
    'papa': '🥔', 'pasas': '🍇', 'pasta de tomate': '🥫', 'pasta integral': '🍝',
    'pavo molido': '🦃', 'pepino': '🥒', 'pera': '🍐', 'perejil': '🌿', 'perejil seco': '🌿',
    'pimenton': '🌶️', 'pimienta negra': '🧂', 'pistachos': '🌰', 'pina': '🍍',
    'platano maduro': '🍌', 'platano verde': '🍌', 'puerro': '🧅', 'pulpo': '🐙',
    'queso blanco': '🧀', 'queso cheddar': '🧀', 'queso cottage': '🧀', 'queso crema': '🧀',
    'queso de hoja': '🧀', 'queso de oveja': '🧀', 'queso gouda': '🧀', 'queso mozzarella': '🧀',
    'queso parmesano': '🧀', 'queso ricotta': '🧀', 'quinoa': '🌾', 'remolacha': '🍠',
    'repollo': '🥬', 'repollo morado': '🥬', 'rabano': '🥕', 'rucula': '🥬',
    'sal': '🧂', 'sal de ajo': '🧂', 'sal de apio': '🧂', 'sal saborizada': '🧂',
    'salami': '🍖', 'salchichas': '🌭', 'salmon': '🐟', 'salsa de soya': '🍶',
    'salsa de tomate': '🥫', 'sandia': '🍉', 'sardina fresca': '🐟', 'sardinas en lata': '🐟',
    'semillas de cajuil': '🥜', 'semillas de calabaza': '🎃', 'semillas de chia': '🌱',
    'semillas de girasol': '🌻', 'soya texturizada': '🫘', 'tamarindo': '🌰', 'tayota': '🍐',
    'tilapia': '🐟', 'tofu': '🫘', 'tomate': '🍅', 'tomate enlatado': '🥫', 'tomillo': '🌿',
    'toronja': '🍊', 'tortilla de trigo': '🫓', 'tortilla integral': '🫓', 'uva': '🍇',
    'vainilla': '🍦', 'vainitas': '🫛', 'vinagre blanco': '🫙', 'vinagre balsamico': '🫙',
    'vinagre de manzana': '🫙', 'yautia': '🍠', 'yogur de coco griego': '🥥',
    'yogur de coco regular': '🥥', 'yogurt griego': '🥣', 'yogurt regular': '🥣',
    'yogurt de cabra': '🥣', 'yuca': '🍠', 'zanahoria': '🥕', 'name': '🍠',
};

/* Fallback por keyword para alimentos que aún no estén en FOOD_EMOJI.
   Orden importa (del más específico al más genérico); solo keywords sin
   falsos positivos conocidos ("sal" NO va aquí: matchearía salami/salsa). */
const FOOD_EMOJI_KEYWORDS = [
    ['queso', '🧀'], ['yogur', '🥣'], ['leche', '🥛'], ['arroz', '🍚'], ['harina', '🌾'],
    ['pollo', '🍗'], ['pavo', '🦃'], ['cerdo', '🥩'], ['pescado', '🐟'], ['atun', '🐟'],
    ['sardina', '🐟'], ['jamon', '🍖'], ['vinagre', '🫙'], ['semilla', '🌱'], ['aceite', '🌻'],
    ['huevo', '🥚'], ['pan ', '🍞'], ['tortilla', '🫓'], ['habichuela', '🫘'], ['frijol', '🫘'],
];

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

const emojiForFood = (foodName, category) => {
    const key = foodKeyOf(foodName);
    if (FOOD_EMOJI[key]) return FOOD_EMOJI[key];
    for (const [kw, emoji] of FOOD_EMOJI_KEYWORDS) {
        if (key.includes(kw)) return emoji;
    }
    return CATEGORY_EMOJI[category] || '🛒';
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

/* Clave normalizada del alimento: minúsculas + sin acentos. Une drifts de
   escritura ("Kefir" / "Kéfir") en una sola tarjeta sin tocar los datos. */
const foodKeyOf = (name) => (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normText = (s) => (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

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
            {emojiForFood(product.food_name, product.category)}
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

    // modal:
    //   { mode: 'food', foodKey }                        → alimento + variantes
    //   { mode: 'detail', product, fromFood? }           → ficha de un SKU
    //   { mode: 'edit', product, fromFood? }             → editar SKU
    //   { mode: 'create', initial?, fromFood? }          → crear SKU / variante
    const [modal, setModal] = useState(null);

    const isAdmin = !!adminToken;

    const load = useCallback(async (token) => {
        setLoading(true);
        setError(null);
        try {
            // El backend clampa a 1000 filas por request (_MAX_LIMIT) — paginamos
            // con offset hasta cubrir `total` para que el catálogo pueda crecer
            // sin tope visible en la página.
            const PAGE = 1000;
            const all = [];
            let offset = 0;
            let total = Infinity;
            while (offset < total) {
                const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
                if (token) params.set('include_inactive', 'true');
                const data = await requestJson(`/api/supermarket/products?${params.toString()}`, { token });
                const page = data?.products || [];
                all.push(...page);
                total = Number.isFinite(Number(data?.total)) ? Number(data.total) : all.length;
                offset += PAGE;
                if (page.length < PAGE) break;
            }
            setProducts(all);
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

    /* ── agrupación por alimento ── */

    const groups = useMemo(() => {
        const map = new Map();
        for (const p of products) {
            const key = foodKeyOf(p.food_name);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(p);
        }
        return [...map.entries()].map(([key, items]) => {
            const generic = items.find((i) => !i.brand) || null;
            const prices = items
                .map((i) => i.price_rd)
                .filter((v) => v !== null && v !== undefined);
            const brandSet = new Set(items.filter((i) => i.brand).map((i) => i.brand));
            const withImage = items.find((i) => i.image_url);
            return {
                key,
                items,
                generic,
                displayName: generic?.food_name || items[0].food_name,
                category: generic?.category || items[0].category || null,
                image: withImage?.image_url || null,
                minPrice: prices.length ? Math.min(...prices) : null,
                maxPrice: prices.length ? Math.max(...prices) : null,
                brandCount: brandSet.size,
                verified: items.some((i) => i.is_verified),
                allInactive: items.every((i) => !i.active),
                hiddenCount: items.filter((i) => !i.active).length,
            };
        });
    }, [products]);

    const groupByKey = useCallback(
        (key) => groups.find((g) => g.key === key) || null,
        [groups],
    );

    const matchesFilters = useCallback((p, needle) => {
        if (category && p.category !== category) return false;
        if (brand === '__generic__') { if (p.brand) return false; }
        else if (brand && p.brand !== brand) return false;
        if (!needle) return true;
        return [p.food_name, p.brand, p.category, p.presentation, p.description]
            .some((v) => normText(v).includes(needle));
    }, [category, brand]);

    const filteredGroups = useMemo(() => {
        const needle = normText(q.trim());
        let list = groups.filter((g) => g.items.some((p) => matchesFilters(p, needle)));
        if (sort === 'precio-asc') {
            list = [...list].sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
        } else if (sort === 'precio-desc') {
            list = [...list].sort((a, b) => (b.maxPrice ?? -Infinity) - (a.maxPrice ?? -Infinity));
        } else {
            list = [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
        }
        return list;
    }, [groups, q, sort, matchesFilters]);

    const filteredProductCount = useMemo(() => {
        const needle = normText(q.trim());
        return filteredGroups.reduce(
            (acc, g) => acc + g.items.filter((p) => matchesFilters(p, needle)).length,
            0,
        );
    }, [filteredGroups, q, matchesFilters]);

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [q, category, brand, sort]);

    const visible = filteredGroups.slice(0, visibleCount);

    /* Variantes ordenadas para el modal del alimento: genérico primero,
       luego por precio ascendente (sin precio al final), luego por marca. */
    const sortedVariants = useCallback((g) => [...g.items].sort((a, b) => {
        if (!a.brand !== !b.brand) return a.brand ? 1 : -1;
        const pa = a.price_rd ?? Infinity;
        const pb = b.price_rd ?? Infinity;
        if (pa !== pb) return pa - pb;
        return (a.brand || '').localeCompare(b.brand || '', 'es');
    }), []);

    const priceRangeLabel = (g) => {
        if (g.minPrice === null) return 'Precio relativo';
        if (g.minPrice === g.maxPrice) return formatPrice(g.minPrice);
        return `${formatPrice(g.minPrice)} – ${formatPrice(g.maxPrice)}`;
    };

    const variantCountLabel = (g) => {
        const variantes = `${g.items.length} variante${g.items.length === 1 ? '' : 's'}`;
        const marcas = g.brandCount > 0
            ? `${g.brandCount} marca${g.brandCount === 1 ? '' : 's'}`
            : 'genérico';
        return `${variantes} · ${marcas}`;
    };

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

    const createProduct = async (form, fromFood) => {
        setSaving(true);
        try {
            await requestJson('/api/supermarket/products', {
                method: 'POST', token: adminToken, body: JSON.stringify(toPayload(form)),
            });
            toast.success('Producto agregado.');
            setModal(fromFood ? { mode: 'food', foodKey: fromFood } : null);
            await load(adminToken);
        } catch (err) {
            toast.error(err.message || 'No se pudo crear el producto.');
        } finally {
            setSaving(false);
        }
    };

    const updateProduct = async (id, form, fromFood) => {
        setSaving(true);
        try {
            const data = await requestJson(`/api/supermarket/products/${id}`, {
                method: 'PATCH', token: adminToken, body: JSON.stringify(toPayload(form)),
            });
            toast.success('Producto actualizado.');
            setModal({ mode: 'detail', product: data.product, fromFood });
            await load(adminToken);
        } catch (err) {
            toast.error(err.message || 'No se pudo actualizar.');
        } finally {
            setSaving(false);
        }
    };

    const deleteProduct = async (p, fromFood) => {
        const label = [p.food_name, p.brand, p.presentation].filter(Boolean).join(' · ');
        // eslint-disable-next-line no-alert
        if (!window.confirm(`¿Eliminar "${label}" del supermercado? Esta acción no se puede deshacer.`)) return;
        try {
            await requestJson(`/api/supermarket/products/${p.id}`, { method: 'DELETE', token: adminToken });
            toast.success('Producto eliminado.');
            setModal(fromFood ? { mode: 'food', foodKey: fromFood } : null);
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
                        Supermercados RD
                    </span>
                    <h1 className={styles.pageTitle}>
                        Base de datos <span className={styles.titleAccent}>República Dominicana</span>
                    </h1>
                    <p className={styles.lead}>
                        Nuestra base de datos viva del mercado dominicano: alimentos verificados con sus
                        marcas, presentaciones y precios reales en RD$. Sobre esta base construimos la
                        lista de compras más completa posible — hasta la marca exacta que prefieras.
                    </p>
                    <div className={styles.stats}>
                        <span><strong>{groups.length}</strong> alimentos</span>
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
                    <label className={`${styles.selectWrap} ${category ? styles.selectActive : ''}`}>
                        <Tags size={15} strokeWidth={2.25} className={styles.selectIcon} aria-hidden="true" />
                        <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar por categoría">
                            <option value="">Todas las categorías</option>
                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown size={15} strokeWidth={2.25} className={styles.selectChevron} aria-hidden="true" />
                    </label>
                    <label className={`${styles.selectWrap} ${brand ? styles.selectActive : ''}`}>
                        <Store size={15} strokeWidth={2.25} className={styles.selectIcon} aria-hidden="true" />
                        <select className={styles.select} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Filtrar por marca">
                            <option value="">Todas las marcas</option>
                            <option value="__generic__">Genérico (sin marca)</option>
                            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <ChevronDown size={15} strokeWidth={2.25} className={styles.selectChevron} aria-hidden="true" />
                    </label>
                    <label className={styles.selectWrap}>
                        <ArrowUpDown size={15} strokeWidth={2.25} className={styles.selectIcon} aria-hidden="true" />
                        <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
                            <option value="nombre">A–Z</option>
                            <option value="precio-asc">Precio: menor a mayor</option>
                            <option value="precio-desc">Precio: mayor a menor</option>
                        </select>
                        <ChevronDown size={15} strokeWidth={2.25} className={styles.selectChevron} aria-hidden="true" />
                    </label>

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
                        Modo edición activo — abre un alimento y toca una variante para editarla. Los
                        productos ocultos aparecen atenuados y no son visibles al público.
                    </p>
                )}

                <div className={styles.resultBar} aria-live="polite">
                    {!loading && !error && (
                        <span>
                            {filteredGroups.length} alimento{filteredGroups.length === 1 ? '' : 's'}
                            {' · '}
                            {filteredProductCount} producto{filteredProductCount === 1 ? '' : 's'}
                        </span>
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
                {!loading && !error && filteredGroups.length === 0 && (
                    <p className={styles.empty}>No hay alimentos que coincidan con tu búsqueda.</p>
                )}

                {!loading && !error && (
                    <>
                        <div className={styles.grid}>
                            {visible.map((g) => (
                                <button
                                    key={g.key}
                                    type="button"
                                    className={`${styles.card} ${g.allInactive ? styles.cardInactive : ''}`}
                                    onClick={() => setModal({ mode: 'food', foodKey: g.key })}
                                    aria-label={`Ver variantes de ${g.displayName}`}
                                >
                                    <div className={styles.cardMedia}>
                                        <ProductImage product={{ image_url: g.image, category: g.category, food_name: g.displayName }} />
                                        {isAdmin && g.hiddenCount > 0 && (
                                            <span className={styles.hiddenTag}>
                                                {g.allInactive ? 'Oculto' : `${g.hiddenCount} oculto${g.hiddenCount === 1 ? '' : 's'}`}
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.cardBody}>
                                        <span className={styles.catTag}>{g.category || 'Sin categoría'}</span>
                                        <h3 className={styles.cardTitle}>{g.displayName}</h3>
                                        <p className={styles.cardSub}>{variantCountLabel(g)}</p>
                                        <div className={styles.cardPriceRow}>
                                            <span className={styles.price}>{priceRangeLabel(g)}</span>
                                            {g.verified && (
                                                <span className={styles.verified} title="Verificado por MealfitRD">
                                                    <BadgeCheck size={14} strokeWidth={2.25} aria-hidden="true" />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {visibleCount < filteredGroups.length && (
                            <div className={styles.moreWrap}>
                                <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                                >
                                    Mostrar más ({filteredGroups.length - visibleCount} restantes)
                                </button>
                            </div>
                        )}
                    </>
                )}

                <div className={styles.footNotes}>
                    <p className={styles.footnote}>
                        Precios de referencia del mercado dominicano, verificados por nuestro equipo.
                        Pueden variar por establecimiento y temporada.
                    </p>
                    <p className={styles.footnote}>
                        Los alimentos y precios de esta base provienen de los catálogos públicos de los
                        principales supermercados del país — <strong>La Sirena</strong> y{' '}
                        <strong>Supermercados Nacional</strong> — transcritos y curados familia por
                        familia por nuestro equipo, con actualizaciones continuas.
                    </p>
                </div>
            </div>

            {/* ─────────────────────── modal ─────────────────────── */}
            {modal && (
                <div className={styles.overlay} onClick={() => setModal(null)} role="presentation">
                    <div
                        className={styles.modal}
                        role="dialog"
                        aria-modal="true"
                        aria-label={
                            modal.mode === 'create'
                                ? 'Nuevo producto'
                                : modal.mode === 'food'
                                    ? (groupByKey(modal.foodKey)?.displayName || 'Alimento')
                                    : productTitle(modal.product || {})
                        }
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button type="button" className={styles.modalClose} onClick={() => setModal(null)} aria-label="Cerrar">
                            <X size={18} strokeWidth={2.25} />
                        </button>

                        {modal.mode === 'create' && (
                            <div className={styles.modalPad}>
                                <h3 className={styles.modalTitle}>
                                    {modal.initial?.food_name ? `Nueva variante de ${modal.initial.food_name}` : 'Nuevo producto'}
                                </h3>
                                <ProductForm
                                    initial={{ ...EMPTY_FORM, ...(modal.initial || {}) }}
                                    categories={categories}
                                    saving={saving}
                                    onCancel={() => setModal(modal.fromFood ? { mode: 'food', foodKey: modal.fromFood } : null)}
                                    onSubmit={(form) => createProduct(form, modal.fromFood)}
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
                                    onCancel={() => setModal({ mode: 'detail', product: modal.product, fromFood: modal.fromFood })}
                                    onSubmit={(form) => updateProduct(modal.product.id, form, modal.fromFood)}
                                />
                            </div>
                        )}

                        {modal.mode === 'food' && (() => {
                            const g = groupByKey(modal.foodKey);
                            if (!g) {
                                return (
                                    <div className={styles.modalPad}>
                                        <p className={styles.empty}>Este alimento ya no está en el catálogo.</p>
                                    </div>
                                );
                            }
                            const variants = sortedVariants(g);
                            const desc = g.generic?.description
                                || variants.find((v) => v.description)?.description
                                || null;
                            return (
                                <div className={styles.detail}>
                                    <div className={styles.detailMedia}>
                                        <ProductImage
                                            product={{ image_url: g.image, category: g.category, food_name: g.displayName }}
                                            large
                                        />
                                    </div>
                                    <div className={styles.detailInfo}>
                                        <span className={styles.catTag}>{g.category || 'Sin categoría'}</span>
                                        <h3 className={styles.detailTitle}>{g.displayName}</h3>
                                        {desc && <p className={styles.detailDesc}>{desc}</p>}
                                        <div className={styles.detailPriceRow}>
                                            <span className={styles.detailPrice}>{priceRangeLabel(g)}</span>
                                            {g.verified && (
                                                <span className={styles.verifiedLabel}>
                                                    <BadgeCheck size={15} strokeWidth={2.25} aria-hidden="true" /> Verificado
                                                </span>
                                            )}
                                        </div>
                                        <p className={styles.foodMeta}>{variantCountLabel(g)}</p>

                                        <div className={styles.variants}>
                                            <h4 className={styles.variantsTitle}>
                                                Marcas y presentaciones disponibles
                                            </h4>
                                            <ul className={styles.variantList}>
                                                {variants.map((v) => (
                                                    <li key={v.id}>
                                                        <button
                                                            type="button"
                                                            className={`${styles.variantRow} ${!v.active ? styles.variantRowInactive : ''}`}
                                                            onClick={() => setModal({ mode: 'detail', product: v, fromFood: g.key })}
                                                        >
                                                            <span className={styles.variantBrand}>{v.brand || 'Genérico'}</span>
                                                            <span className={styles.variantPres}>{v.presentation || '—'}</span>
                                                            {v.is_verified && (
                                                                <BadgeCheck size={13} strokeWidth={2.25} className={styles.variantCheck} aria-hidden="true" />
                                                            )}
                                                            <span className={styles.variantPrice}>{formatPrice(v.price_rd)}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        {isAdmin && (
                                            <div className={styles.detailActions}>
                                                <button
                                                    type="button"
                                                    className={styles.btnPrimary}
                                                    onClick={() => setModal({
                                                        mode: 'create',
                                                        fromFood: g.key,
                                                        initial: {
                                                            food_name: g.generic?.food_name || g.displayName,
                                                            category: g.category || '',
                                                            master_food_name: g.generic?.master_food_name || g.displayName,
                                                        },
                                                    })}
                                                >
                                                    <Plus size={14} strokeWidth={2.5} /> Variante
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {modal.mode === 'detail' && (() => {
                            const p = products.find((x) => x.id === modal.product.id) || modal.product;
                            const fromFood = modal.fromFood || foodKeyOf(p.food_name);
                            return (
                                <div className={styles.detail}>
                                    <div className={styles.detailMedia}>
                                        <ProductImage product={p} large />
                                    </div>
                                    <div className={styles.detailInfo}>
                                        <button
                                            type="button"
                                            className={styles.backBtn}
                                            onClick={() => setModal({ mode: 'food', foodKey: fromFood })}
                                        >
                                            <ArrowLeft size={14} strokeWidth={2.25} aria-hidden="true" />
                                            Todas las variantes de {p.food_name}
                                        </button>
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
                                                <button type="button" className={styles.btnPrimary} onClick={() => setModal({ mode: 'edit', product: p, fromFood })}>
                                                    <Pencil size={14} strokeWidth={2.25} /> Editar
                                                </button>
                                                <button type="button" className={`${styles.btnGhost} ${styles.btnDanger}`} onClick={() => deleteProduct(p, fromFood)}>
                                                    <Trash2 size={14} strokeWidth={2.25} /> Eliminar
                                                </button>
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
