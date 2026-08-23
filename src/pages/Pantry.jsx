import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
// [P2-PANTRY-MODALS-A11Y · 2026-05-30] Los 3 modales custom de Pantry
// (añadir / ajustar cantidad / vaciar nevera destructivo) eran divs fixed sin
// role=dialog/focus-trap/ESC/restore-focus. SSOT P2-CUSTOM-MODALS-A11Y.
import { useModalAccessibility } from '../hooks/useModalAccessibility';
// [P2-14 · 2026-07-09] Hook SSOT de media queries (antes copia local del mismo hook).
import { useMediaQuery } from '../hooks/useMediaQuery';
// [P2-15 · 2026-07-09] Store single-source de la Nevera Virtual (compartido con Dashboard).
import { useDisabledIngredients } from '../hooks/useDisabledIngredients';
import { motion, AnimatePresence } from 'framer-motion';
import { useAssessment } from '../context/AssessmentContext';
import { isTrackingMode } from '../config/dashboardNav';
import { textoNeveraBaja, tooltipCaducidad } from './pantryLowBannerCopy';
// [P1-I18N-DASHBOARD · 2026-08-15] Motor de idioma. El hook es lo que suscribe el
// componente al cambio de catálogo; las tablas de copy de abajo son FUNCIONES por
// eso mismo (una constante con `t()` se congelaría en español al importar).
import { formatNumber, t, useT, useTn } from '../i18n';
// [P1-NEON-DB-MIGRATION · 2026-06-12] el SDK anterior eliminado de Pantry: los
// datos viven en Neon (PostgREST/Realtime apuntan al Postgres stale de
// el backend anterior). Todo el acceso a datos va por los endpoints backend vía
// fetchWithAuth; el cliente anterior queda solo para Auth (otros archivos).
import { Search, Plus, Minus, Trash2, Tag, Loader2, Save, X, Search as SearchIcon, AlertCircle, Snowflake, Beef, Drumstick, Fish, Egg, Apple, Carrot, Salad, Milk, Wheat, Croissant, Cookie, Nut, GlassWater, Package, Leaf, Droplets, Flame, ShoppingBasket, RotateCcw, PackageX } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, API_BASE } from '../config/api';
import { getShelfLifeBadge, getShelfLifeBadgeStyle } from '../utils/shelfLife';
import { safeJSONParseObject } from '../utils/safeJSONParse';
// [P2-LOCALSTORAGE-GETITEM-DEFENSIVE · 2026-05-15] read defensivo para
// `mealfit_disabled_ingredients` en el useEffect mount (línea 88+).
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
import { emitCoherenceToast } from '../utils/renderCoherenceWarnings';
// [P3-PANTRY-CACHE · 2026-05-19] Stale-while-revalidate del mount de Pantry
import { getCachedInventory, setCachedInventory, getCachedMasterList, setCachedMasterList, invalidateInventoryCache, getCachedBrands, setCachedBrands, getCachedPantryStatus, setCachedPantryStatus } from '../utils/pantryCache';
// [P1-PANTRY-DASH-PARITY - 2026-07-11] Escaner por foto compartido con el paso 21.
import { PantryScanButton } from '../components/pantry/PantryScanButton';
import { BrandSelect } from '../components/pantry/BrandSelect';
// [P3-PANTRY-FRIDGE-REDESIGN · 2026-06-24] Rediseño del apartado para
// escritorio: sidebar de zonas (Nevera/Alacena) + lista densa. CSS scoped
// (los tokens var(--*) ya existen en index.css). Sustituye la metáfora de
// "electrodoméstico físico" anterior; misma lógica/handlers/datos reales.
import fstyles from './Pantry.fridge.module.css';
// [P3-PANTRY-FRIDGE-REDESIGN · 2026-06-24] Layout móvil dedicado (tarjeta por
// alimento) — se elige por breakpoint JS, no por container query.
import mstyles from './Pantry.mobileFridge.module.css';
// [P1-I18N-BACKEND-DETAIL · 2026-08-21] El `detail` del servidor viene
// en español SIEMPRE; el `||` hacía que ganara sobre el fallback traducido.
import { mensajeDeError } from '../utils/errorCopy';

// [P1-NEON-DB-MIGRATION · 2026-06-12] Helper de transporte: fetchWithAuth +
// parse JSON + throw en non-2xx con `status`/`detail` del backend. Los
// handlers detectan el 409 de duplicado (UNIQUE user_id+ingredient_name+unit)
// vía `err.status` — misma semántica que el error 23505 legacy de PostgREST.
const _apiJson = async (path, options = {}) => {
    const resp = await fetchWithAuth(path, options);
    let json = null;
    try { json = await resp.json(); } catch (_e) { /* body vacío / no-JSON */ }
    if (!resp.ok) {
        const err = new Error(
            (json && json.detail) ? String(json.detail) : `HTTP ${resp.status}`
        );
        err.status = resp.status;
        err.detail = json?.detail;
        throw err;
    }
    return json;
};

const CATEGORY_ICONS = {
    'PROTEÍNAS': Beef,
    'PROTEINAS': Beef,
    'CARNES': Beef,
    'CARNES ROJAS': Beef,
    'POLLO': Drumstick,
    'AVES': Drumstick,
    'PESCADO': Fish,
    'PESCADOS': Fish,
    'PESCADOS Y MARISCOS': Fish,
    'MARISCOS': Fish,
    'HUEVOS': Egg,
    'VEGETALES': Salad,
    'VERDURAS': Salad,
    'HORTALIZAS': Carrot,
    'FRUTAS': Apple,
    'LÁCTEOS': Milk,
    'LACTEOS': Milk,
    'QUESOS': Milk,
    'CEREALES Y GRANOS': Wheat,
    'CEREALES': Wheat,
    'GRANOS': Wheat,
    'DESPENSA Y GRANOS': Wheat,
    'DESPENSA': Package,
    'LEGUMBRES': Wheat,
    'VÍVERES': ShoppingBasket,
    'VIVERES': ShoppingBasket,
    'ESPECIAS': Flame,
    'CONDIMENTOS': Flame,
    'HIERBAS': Leaf,
    'GRASAS': Droplets,
    'ACEITES': Droplets,
    'BEBIDAS': GlassWater,
    'PANADERIA': Croissant,
    'PANADERÍA': Croissant,
    'PANES': Croissant,
    'DULCES': Cookie,
    'AZÚCARES': Cookie,
    'AZUCARES': Cookie,
    'FRUTOS SECOS': Nut,
    'OTROS': Package,
};

// [P3-PANTRY-FRIDGE-LAYOUT · 2026-05-19] Mapping categoría master_ingredients
// → zona física de la nevera real. Las 25 variantes de `master_ingredients.category`
// caen en 7 zonas: 3 estantes interiores + 2 gavetas (crispers) + puerta + alacena
// externa. Cierra el bucket "OTROS" como pantry (no nevera) — granos secos,
// especias, conservas no se refrigeran en RD.
const CATEGORY_TO_ZONE = {
    // Estante 1 — Lácteos & Huevos (alto, productos delicados)
    'LÁCTEOS': 'shelf_dairy',
    'LACTEOS': 'shelf_dairy',
    'QUESOS': 'shelf_dairy',
    'HUEVOS': 'shelf_dairy',

    // Estante 2 — Proteínas crudas (medio, evita drip sobre lácteos)
    'PROTEÍNAS': 'shelf_proteins',
    'PROTEINAS': 'shelf_proteins',
    'CARNES': 'shelf_proteins',
    'CARNES ROJAS': 'shelf_proteins',
    'POLLO': 'shelf_proteins',
    'AVES': 'shelf_proteins',
    'PESCADO': 'shelf_proteins',
    'PESCADOS': 'shelf_proteins',
    'PESCADOS Y MARISCOS': 'shelf_proteins',
    'MARISCOS': 'shelf_proteins',

    // Estante 3 — Listos para comer (panadería, dulces, frutos secos)
    'PANADERIA': 'shelf_ready',
    'PANADERÍA': 'shelf_ready',
    'PANES': 'shelf_ready',
    'DULCES': 'shelf_ready',
    'AZÚCARES': 'shelf_ready',
    'AZUCARES': 'shelf_ready',
    'FRUTOS SECOS': 'shelf_ready',

    // Gavetas (crispers) inferiores
    'FRUTAS': 'drawer_fruits',
    'VEGETALES': 'drawer_veggies',
    'VERDURAS': 'drawer_veggies',
    'HORTALIZAS': 'drawer_veggies',
    'HIERBAS': 'drawer_veggies',

    // Puerta lateral — botellas y frasquitos
    'BEBIDAS': 'door',
    'GRASAS': 'door',
    'ACEITES': 'door',
    'CONDIMENTOS': 'door',

    // Alacena externa (no se refrigera)
    'CEREALES Y GRANOS': 'pantry',
    'CEREALES': 'pantry',
    'GRANOS': 'pantry',
    'DESPENSA Y GRANOS': 'pantry',
    'DESPENSA': 'pantry',
    'LEGUMBRES': 'pantry',
    'ESPECIAS': 'pantry',
    'VÍVERES': 'pantry',
    'VIVERES': 'pantry',
    'OTROS': 'pantry',
};

const getZoneForCategory = (cat) => {
    if (!cat) return 'pantry';
    return CATEGORY_TO_ZONE[cat.toUpperCase().trim()] || 'pantry';
};

// [P3-PANTRY-FRIDGE-REDESIGN · 2026-06-24] El rediseño agrupa las 7 zonas
// físicas en 2 "muebles": NEVERA (frío — estantes/puerta/gavetas) y ALACENA
// (seco — granos/especias/conservas). Reusa ZONE_DEFINITIONS como SSOT de
// label/icon; solo añade el split de temperatura + un color vivo por zona
// (mejor contraste sobre el tema oscuro que los colores "físicos").
const tempOfZone = (zoneDef) => (zoneDef && zoneDef.kind === 'pantry' ? 'seco' : 'frio');

// [P1-I18N-DASHBOARD · 2026-08-15] Función, no constante: `t()` en ámbito de módulo
// se evalúa al importar —antes de que exista catálogo— y queda en español para
// siempre, con el agravante de que en es-DO se ve perfecto.
const getTempZones = () => [
    { id: 'frio', label: t('Nevera') },
    { id: 'seco', label: t('Alacena') },
];

const ZONE_DISPLAY_COLOR = {
    shelf_dairy:    '#38BDF8',
    shelf_proteins: '#FB7185',
    shelf_ready:    '#C084FC',
    door:           '#22D3EE',
    drawer_fruits:  '#FB923C',
    drawer_veggies: '#34D399',
    pantry:         '#FBBF24',
};
const zoneColor = (zoneKey) => ZONE_DISPLAY_COLOR[zoneKey] || '#94A3B8';

/* [P1-LIGHT-INK-CONTRACT · 2026-08-10] La capa de TINTA de cada zona.
   `ZONE_DISPLAY_COLOR` de arriba se eligió —lo dice su propio comentario— por
   «mejor contraste sobre el tema oscuro». Como TEXTO sobre claro esos siete
   miden entre 1,56:1 y 2,38:1, contra un mínimo de 4,5. Aquí NO se cambian:
   siguen siendo el punto, el icono y la barra, que es donde funcionan. Lo que
   se añade es el color con el que se ESCRIBE.

   ⚠️ Existe una tercera paleta en ZONE_DEFINITIONS.color que nadie lee y que
   parece la solución obvia. No lo es: 6 de sus 7 colores también fallan como
   texto (1,95:1 a 3,94:1). No migrar a ella. */
const ZONE_INK = {
    shelf_dairy:    'var(--ink-dairy)',
    shelf_proteins: 'var(--ink-proteins)',
    shelf_ready:    'var(--ink-ready)',
    door:           'var(--ink-door)',
    drawer_fruits:  'var(--ink-fruits)',
    drawer_veggies: 'var(--ink-veggies)',
    pantry:         'var(--ink-pantry)',
};
const zoneInk = (zoneKey) => ZONE_INK[zoneKey] || 'var(--text-muted)';

/* [P1-PANTRY-LOW-IS-A-LIE · 2026-08-09] AQUÍ VIVÍA EL UMBRAL DE STOCK BAJO: una
   constante de 0,5 contra la que se comparaba `quantity`. Por debajo se teñía
   la fila, se pintaba un chip vago y se sumaba al contador del sidebar.

   (El nombre exacto de la constante y el del chip NO se citan a propósito: el
   guard parser-based escanea este fichero ENTERO, comentarios incluidos, así
   que escribirlos aquí haría fallar el test contra su propio arreglo. Misma
   regla que la cabecera de `Hero.jsx` para las APIs de vídeo borradas.)

   Comparaba `quantity` —un número cuyo significado depende ENTERAMENTE de
   `unit`— contra una constante sin unidad. FORENSE sobre las 63 filas reales
   del owner:

     · Solo alcanzaba a las filas de PESO. Las 50 discretas (paquete, pote,
       unidad, lata, mazo, cabeza…) tienen cantidad mínima 1, así que 0,5 les
       era estructuralmente inalcanzable — incluidas 44 con EXACTAMENTE 1
       unidad, que sí se agotan al usarse. El detector era ciego justo donde
       "me queda uno" significa algo.
     · De las 13 de peso marcaba 9, partiendo por la mitad el rango normal de
       compra (0,2167 .. 1,75 lb). Yuca 0,87 lb pasaba; Cebolla 0,5 lb no.
     · 6 de las 9 traían `source='shopping_list'`: eran las cantidades que la
       propia app dijo que compraras.

   Y lo que lo cierra: tras "exportar la lista de compras a la nevera" la
   nevera contiene EXACTAMENTE lo que el plan pide, así que "por reponer" tiene
   que valer 0 en ese instante. Cualquier número ahí es falso por construcción
   — el owner lo reportó justo después de importar.

   "Poco" no es una propiedad de un número: es una RELACIÓN entre lo que tienes
   y lo que necesitas. Ningún umbral constante puede expresarla, y menos sobre
   una columna cuya unidad cambia fila a fila.

   NO lo reintroduzcas, ni con este número ni con otro. Si quieres un estado de stock de
   verdad, tiene que compararse contra lo que el plan pide, y el emparejamiento
   nombre↔fila de nevera está fijado en `constants.pantry_names_match`
   (backend, P1-PANTRY-NAME-RESOLUTION) — no se reimplementa en el cliente.

   Lo que ocupa su lugar: la caducidad (`utils/shelfLife.js`), la única
   afirmación que esta página puede sostener con lo que ya tiene cargado, y
   cuyo fallback es CALLARSE (sin `shelf_life_days` o sin `created_at`, no
   pinta nada). */

// Glyphs inline para el brand/nav del sidebar (sin depender de iconos lucide
// adicionales; mismo trazo que el resto de la UI).
const FridgeGlyph = ({ size = 22 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="2" width="12" height="20" rx="3" /><path d="M6 11h12M9 6v2M9 14v3" />
    </svg>
);
const GridGlyph = ({ size = 16 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
);
const CheckGlyph = ({ size = 16 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
    </svg>
);

// Definiciones de zonas: orden de render + metadata visual. Cada zona se
// muestra solo si tiene items (zonas vacías se ocultan automáticamente).
// [P3-PANTRY-FRIDGE-POLISH · 2026-05-19] Drawers: labels sin "Gaveta de"
// (la metáfora visual de crisper + asita + radius pronunciado ya comunica
// que es una gaveta — el prefijo era ruido). Color per-zone añadido para
// que cada categoría tenga identidad visual propia y rompa la monotonía
// cyan que hacía sentir el rediseño homogéneo.
// [P1-I18N-DASHBOARD · 2026-08-15] La tabla se parte en DOS: aquí queda lo que es
// DATO (key/icon/kind/color) y las etiquetas se van a `getZoneLabels()`. Un `t()`
// aquí se evaluaría al importar —antes de que exista catálogo— y quedaría en
// español para siempre; y en es-DO se vería perfecto, que es lo que lo hace
// difícil de ver. La constante conserva su nombre porque un guard parser-based
// (`test_p3_pantry_redesign_anchors`) lee sus `color:` para que no vuelva el
// monocromo cyan.
const ZONE_DEFINITIONS = [
    { key: 'shelf_dairy',    icon: Milk,       kind: 'shelf',  color: '#0EA5E9' },
    { key: 'shelf_proteins', icon: Beef,       kind: 'shelf',  color: '#DC2626' },
    { key: 'shelf_ready',    icon: Croissant,  kind: 'shelf',  color: '#F59E0B' },
    { key: 'door',           icon: GlassWater, kind: 'door',   color: '#0891B2' },
    { key: 'drawer_fruits',  icon: Apple,      kind: 'drawer', color: '#EC4899' },
    { key: 'drawer_veggies', icon: Salad,      kind: 'drawer', color: '#16A34A' },
    { key: 'pantry',         icon: Package,    kind: 'pantry', color: '#92400E' },
];

// Las claves del catálogo tienen que ser literales estáticos: un `t(mapa[key])`
// es invisible para el extractor de `i18n:check` y nacería sin traducción.
const getZoneLabels = () => ({
    shelf_dairy:    t('Lácteos & Huevos'),
    shelf_proteins: t('Proteínas'),
    shelf_ready:    t('Listos para comer'),
    door:           t('Puerta · Bebidas & Condimentos'),
    drawer_fruits:  t('Frutas'),
    drawer_veggies: t('Verduras'),
    pantry:         t('Alacena · Granos y secos'),
});

const getZoneDefinitions = () => {
    const labels = getZoneLabels();
    return ZONE_DEFINITIONS.map((z) => ({ ...z, label: labels[z.key] }));
};

// [P2-CODIGO-MUERTO · 2026-08-18] Aqui habia un puntero a
// `utils/pantryConsumption.js`, extraido en P3-C «para que sea testeable». Se
// extrajo, se dejo de usar, y quedo un modulo que SOLO importaba su propio test:
// una prueba verde vigilando codigo que produccion no ejecutaba. Borrados los
// dos. Si vuelve a hacer falta estimar consumo diario, se escribe donde se use.

// [P4-PANTRY-UNITS-HOIST] Unidades de envase/medida (estáticas) a module-scope —
// definirlas en el render las re-alocaba en cada keystroke de búsqueda.
// [P3-PANTRY-MARKET-CONTAINER · 2026-05-19] 'cartón' alinea con master_ingredients.market_container.
const COMMON_PURCHASE_UNITS = [
    'unidad', 'libra', 'kg', 'botella', 'paquete',
    'lata', 'caja', 'cartón', 'bolsa', 'galón', 'sobre',
];

// [P3-PANTRY-ADD-RESPONSIVE · 2026-07-07] Chips staple del estado vacío del modal
// "Añade a tu Nevera". [P3-PANTRY-RECENT-ADDS · 2026-07-07] 1-toque: si la palabra
// resuelve a un master item ÚNICO se añade directo (unidad recomendada); si es
// ambigua (varios "aceite"/"pollo") siembra la búsqueda — nunca adivina cuál.
const QUICK_ADD_SUGGESTIONS = ['Pollo', 'Arroz', 'Huevos', 'Leche', 'Aceite', 'Cebolla'];

// [P3-PANTRY-RECENT-ADDS · 2026-07-07] Estilo compartido de los chips (recientes +
// sugerencias). Módulo-scope: valores estáticos, evita re-alocar por keystroke.
const ADD_CHIP_STYLE = {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.5rem 0.95rem', borderRadius: '99px',
    border: '1px solid var(--border)', background: 'var(--bg-page)',
    color: 'var(--text-main)', fontWeight: 600, fontSize: '0.9rem',
    cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
};

// [P2-NEVERA-BRANDS-MANUAL · 2026-07-07] Normalización simétrica a `_norm_food`
// del backend (minúsculas + sin acentos + espacios colapsados) para cachear el
// match contra supermarket_products al elegir marca en el add manual.
const _normFood = (s) => (s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

// [P2-NEVERA-BRANDS-MANUAL · 2026-07-07] Pill de marca (índigo para diferenciarla
// del azul de las unidades — misma identidad visual que el chip de marca de la Nevera).
const brandPillStyle = (isActive) => ({
    padding: '0.45rem 0.9rem', borderRadius: '99px',
    // [P2-DESIGN-CONSISTENCY · 2026-07-07] índigo por token --primary (antes #6366F1/
    // #4F46E5 hardcoded; #4F46E5 era el primary de light-theme → se veía mal en oscuro).
    border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
    background: isActive ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--bg-card)',
    color: isActive ? 'var(--primary)' : 'var(--text-main)',
    fontWeight: isActive ? 700 : 500, fontSize: '0.85rem',
    cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
});

// [P5-SPEED-CATEGORY-NORMALIZE-HOIST · 2026-06-01] Mapa estático de normalización
// de categorías izado a module-scope (antes vivía DENTRO del useMemo
// `filteredInventory`, deps [inventory, searchQuery] → se re-alocaba en cada
// keystroke de la búsqueda). Mismo patrón que CATEGORY_ICONS / CATEGORY_TO_ZONE /
// COMMON_PURCHASE_UNITS (ya izados en P4-PANTRY-UNITS-HOIST por la misma razón);
// CATEGORY_NORMALIZE simplemente quedó fuera de aquella pasada.
const CATEGORY_NORMALIZE = {
    'Despensa': 'Despensa y Granos',
    'Granos': 'Despensa y Granos',
    'Cereales': 'Cereales y Granos',
    'Carbohidratos': 'Cereales y Granos',
};

const Pantry = () => {
    // [P1-I18N-DASHBOARD] Sombrea al `t` de módulo a propósito: es la MISMA
    // función, pero pasar por el hook es lo que suscribe este componente al
    // cambio de idioma. Las tablas de copy de arriba usan el de módulo porque
    // se declaran fuera de todo componente.
    const t = useT();
    const tn = useTn();
    // [P1-BETA-PRICE-LEAKS fix · 2026-08-21] `formData` faltaba en la desestructuración
    // y los dos POST a `/api/supermarket/match` de este fichero ya lo usaban
    // (`country: formData?.country`). Un identificador NO DECLARADO lanza
    // ReferenceError: el `?.` protege contra `null`/`undefined`, no contra un símbolo
    // que no existe. Así que la ruta de marcas de la Nevera reventaba, no degradaba.
    const { session, setPlanData, userProfile, planData, formData } = useAssessment();
    // [P1-PANTRY-LOW-BANNER-TRACKING · 2026-08-14] Mismo SSOT que la nav y el
    // Historial: el modo NO se reimplementa aqui.
    const enModoContador = isTrackingMode(userProfile, planData);
    // [P3-PANTRY-CACHE · 2026-05-19] Stale-while-revalidate lazy-init.
    // Si hay cache vigente (inventory TTL 30s, masterList TTL 24h), el
    // primer render tiene rows visibles y skeleton oculto. El fetchData
    // del useEffect mount sigue corriendo para pisar con datos frescos.
    // Pre-fix: dos queries el backend anterior serializadas bloqueaban render con
    // skeleton 300-1500ms cada entrada al apartado.
    const [inventory, setInventory] = useState(() => getCachedInventory() || []);

    // [P1-PANTRY-RECONCILIATION · 2026-08-07] "Esto no se ha movido en N días:
    // ¿lo usaste, se dañó, o sigue ahí?".
    //
    // Por qué preguntar y no descontar solo: la regla del producto es que la
    // Nevera baja SOLO por lo que el usuario registra. Descontar automático la
    // rompería y repetiría el pecado que P1-PANTRY-NAME-RESOLUTION cerró —
    // mover la Nevera por algo que el usuario no puede auditar. Aquí la
    // reducción sigue exigiendo una acción suya; lo único que hacemos es que
    // cueste un tap.
    //
    // El backend ya capea el lote (8 por defecto): una lista de 40 preguntas
    // no se contesta, se ignora.
    const [reconcileItems, setReconcileItems] = useState([]);
    const [reconcileBusyId, setReconcileBusyId] = useState(null);
    const [masterList, setMasterList] = useState(() => getCachedMasterList() || []);
    const [loading, setLoading] = useState(() => !getCachedInventory());
    const [searchQuery, setSearchQuery] = useState('');
    // [P3-PANTRY-FRIDGE-REDESIGN · 2026-06-24] Mueble activo (Nevera/Alacena)
    // + filtro de categoría (zona física) del sidebar. 'todos' = todas las
    // zonas del mueble activo.
    const [tempZone, setTempZone] = useState('frio');
    const [catFilter, setCatFilter] = useState('todos');
    // Layout móvil dedicado bajo 760px (en vez de colapsar el desktop).
    const isMobileLayout = useMediaQuery('(max-width: 760px)');
    // [P2-PANTRY-LOW-BANNER · 2026-06-21] Estado + fetch del mínimo de nevera. El servidor es la
    // FUENTE DE VERDAD (GET /api/plans/pantry-status expone el MISMO conteo que el guard de
    // mantenimiento: _count_meaningful_pantry_items(get_user_inventory_net) vs
    // CHUNK_MIN_FRESH_PANTRY_ITEMS) → cero drift. Debounce 700ms tras cada cambio de inventario
    // para que el delete/add persista server-side antes de re-consultar (evita conteo stale).
    // Cero costo LLM; fail-soft (sin aviso si falla). Guests → safe defaults (sin aviso).
    // [P2-SCAN-BTN-STABLE · 2026-07-12] Bootstrap del último `photo_scan_enabled`
    // conocido (patrón P3-RESTOCK-BTN-STABLE): el fetch de pantry-status se difiere
    // 700ms a propósito → el botón "Escanear mi nevera" desaparecía ~1s en cada
    // mount/refresh (feedback owner). Primer paint desde cache; el resto de keys
    // (is_below, meaningful_count) siguen esperando al fetch real — sus banners ya
    // eran fetch-gated y no parpadean como CTA.
    // [P1-PANTRY-STATUS-PERSIST · 2026-08-14] Hidratar el payload ENTERO, no
    // solo photo_scan_enabled. El defer de 700 ms de abajo dejaba `is_below`
    // sin valor ~1 s en cada refresh y el banner ámbar de nevera baja
    // parpadeaba (reporte del dueño) — la key suelta del scan solo protegía al
    // CTA. Queda como fallback de transición para el primer refresh tras el
    // deploy, cuando el cache nuevo aún no existe.
    const [pantryStatus, setPantryStatus] = useState(() => {
        const cached = getCachedPantryStatus();
        if (cached) return cached;
        const v = safeLocalStorageGet('mealfit_scan_btn', null);
        return v === '1' ? { photo_scan_enabled: true } : null;
    });
    // [P2-PANTRY-BANNER-GAP · 2026-08-15] El defer de 700 ms solo se paga cuando
    // YA hay algo en pantalla.
    //
    // El defer existe para no competir con el render inicial, y con el caché
    // caliente es gratis: el banner ya se está pintando con el valor cacheado y
    // la red solo lo confirma. Pero con el caché FRÍO —primer refresh tras un
    // «Clear site data», o pasados los 10 min de TTL— esperar 700 ms es esperar
    // teniendo NADA que enseñar: el banner ámbar falta ese rato y luego aparece
    // de golpe. Es justo el hueco que el dueño describe.
    //
    // Peor aún: las deps son `[inventory.length]`, así que cuando el inventario
    // aterriza (0 → N) el cleanup CANCELA el temporizador y arranca otro de
    // 700 ms. Con el caché frío el hueco real es de ~1,4 s, no de 0,7.
    //
    // No se re-deriva `is_below` en el cliente a propósito: lo calcula
    // `_count_meaningful_pantry_items` server-side contra `min_required`, y
    // duplicar esa cuenta aquí sería una segunda fuente de verdad sobre cuándo la
    // Nevera está baja — la clase de drift que P1-DIET-CANON-SSOT documenta.
    const _statusDelayMs = pantryStatus ? 700 : 0;
    useEffect(() => {
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const resp = await fetchWithAuth('/api/plans/pantry-status');
                if (resp?.ok) {
                    const data = await resp.json();
                    if (!cancelled) {
                        setPantryStatus(data);
                        // [P2-SCAN-BTN-STABLE] persistir para el próximo primer paint.
                        // [P1-PANTRY-STATUS-PERSIST · 2026-08-14] ahora el payload
                        // entero — el banner de nevera baja también es primer paint.
                        setCachedPantryStatus(data);
                        safeLocalStorageSet('mealfit_scan_btn', data?.photo_scan_enabled ? '1' : '0');
                    }
                }
            } catch { /* fail-soft: sin aviso */ }
        }, _statusDelayMs);
        return () => { cancelled = true; clearTimeout(t); };
        // `_statusDelayMs` NO va en las deps a propósito: se deriva de
        // `pantryStatus`, que este mismo efecto escribe. Incluirlo crearía la
        // realimentación que costó 16.105 peticiones en el panel de marcas
        // (P0-BRANDS-RETRY-STORM) — la variable que decide cómo corre un efecto no
        // puede ser algo que el efecto cambia. Solo se lee en el primer arranque,
        // que es cuando importa.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inventory.length]);
    // [P6-SPEED-PANTRY-DEFER · 2026-06-01] El <input> sigue controlado por
    // `searchQuery` (caret instantáneo), pero las vistas pesadas
    // (filteredInventory/visibleDepletedItems → re-filtra+agrupa+mapea todas las
    // tarjetas) se calculan sobre `deferredSearchQuery`. React 19 deja que el
    // re-render caro de la lista se retrase un frame y sea interrumpible por
    // tecleo más rápido → cero lag de tipeo en despensas grandes (Android gama
    // media del público es-DO). Aditivo: no requiere estabilizar handlers.
    const deferredSearchQuery = useDeferredValue(searchQuery);
    
    // Auto-complete (Add Item) state
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [addItemSearch, setAddItemSearch] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeletingAll, setIsDeletingAll] = useState(false);

    // [P3-PANTRY-ADD-UX · 2026-05-18] Customizar cantidad + unidad antes de añadir.
    // Reemplaza el flujo "click → +1 con default_unit" por un mini-form inline
    // que permite "1 botella de vinagre", "2 libras de pollo", etc.
    const [pickerForId, setPickerForId] = useState(null);   // master_ingredient_id en config
    const [pickerQty, setPickerQty] = useState(1);
    const [pickerUnit, setPickerUnit] = useState('');
    // [P2-NEVERA-BRANDS-MANUAL · 2026-07-07] Marca elegida en el picker (null = sin
    // marca, no pinta chip) + cache de variantes del súper por norm(name). El ref
    // dedup evita re-fetchear el /match al reabrir el mismo alimento.
    const [pickerBrand, setPickerBrand] = useState(null);
    // [P1-BRAND-CHIP-PERSIST · 2026-08-14] Hidratado desde el cache: arrancar en
    // `{}` hacía que cada fila leyera «no hay marcas» durante el vuelo del POST
    // en lote, así que el chip «Genérico» no se pintaba y aparecía de golpe al
    // volver la respuesta (el parpadeo que reportó el dueño). El catálogo del
    // súper no cambia entre dos refrescos: con el mapa en disco, el chip está
    // desde el primer frame.
    const [brandCache, setBrandCache] = useState(() => getCachedBrands() || {});
    const brandLoadingRef = useRef(new Set());

    // [P3-PANTRY-RECENT-ADDS · 2026-07-07] Últimos alimentos añadidos (id+name+unit),
    // mostrados como chips de 1-toque en el estado vacío del modal Añadir → re-añadir
    // lo que compras seguido sin re-buscar. Cache local puro (no toca BD), mismo
    // patrón lazy-init que depletedItems. Cap 8, más recientes primero, dedup por id.
    const [recentAdds, setRecentAdds] = useState(() => {
        try {
            const saved = safeLocalStorageGet('mealfit_recent_pantry_adds', null);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed.slice(0, 8);
            }
        } catch (e) {}
        return [];
    });
    const _recordRecentAdd = useCallback((masterItem, unit) => {
        if (!masterItem || (!masterItem.id && !masterItem.name)) return;
        const entry = {
            id: masterItem.id || null,
            name: masterItem.name || '',
            unit: unit || 'unidad',
        };
        const keyOf = (e) => (e.id ? `m:${e.id}` : `n:${(e.name || '').toLowerCase()}`);
        setRecentAdds(prev => {
            const k = keyOf(entry);
            const next = [entry, ...prev.filter(e => keyOf(e) !== k)].slice(0, 8);
            try { safeLocalStorageSet('mealfit_recent_pantry_adds', JSON.stringify(next)); } catch (e) {}
            return next;
        });
    }, []);

    // [P2-NEVERA-BRANDS-MANUAL · 2026-07-07] Al abrir el picker de un alimento NUEVO,
    // consulta el súper (POST /api/supermarket/match) por sus variantes y arma la lista
    // de marcas distintas con precio mínimo. Cache por norm(name) vía ref (fetch una vez
    // por sesión). Fail-soft: sin catálogo/red/marcas → no se muestra la sección de marca.
    const _loadBrandsForItem = useCallback(async (item) => {
        const key = _normFood(item?.name);
        if (!key || brandLoadingRef.current.has(key)) return;
        brandLoadingRef.current.add(key);
        setBrandCache(prev => (prev[key] ? prev : { ...prev, [key]: { loading: true, brands: [] } }));
        try {
            const res = await fetchWithAuth('/api/supermarket/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // [P1-BETA-PRICE-LEAKS · 2026-08-21] el país viaja para que el servidor
                // decida si los precios en RD$ deben salir: esta pantalla los pintaba con
                // «RD$» sin condición alguna a un usuario de país beta.
                body: JSON.stringify({ names: [item.name], country: formData?.country }),
            });
            const data = res.ok ? await res.json() : null;
            const groups = (data?.matches && data.matches[item.name]) || [];
            const byBrand = new Map();
            groups.forEach(g => (g.variants || []).forEach(v => {
                const b = (v.brand && String(v.brand).trim()) ? String(v.brand).trim() : 'Genérico';
                const price = (typeof v.price_rd === 'number') ? v.price_rd : null;
                const cur = byBrand.get(b);
                if (!cur || (price != null && (cur.price == null || price < cur.price))) {
                    // [P1-PANTRY-DASH-PARITY] productId de la variante más barata de la
                    // marca — necesario para persistir la preferencia global al elegirla.
                    byBrand.set(b, { brand: b, price, productId: v.id });
                }
            }));
            const brands = [...byBrand.values()].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
            setBrandCache(prev => ({ ...prev, [key]: { loading: false, brands } }));
        } catch {
            setBrandCache(prev => ({ ...prev, [key]: { loading: false, brands: [] } }));
        }
        // [P1-BETA-PRICE-LEAKS fix · 2026-08-21] `formData?.country` es dependencia
        // REAL desde que el POST lo envia: si el usuario cambia de pais, el match de
        // marcas debe rehacerse o seguiria pintando los precios del pais viejo.
    }, [formData?.country]);

    // [P1-PANTRY-DASH-PARITY · 2026-07-11] Cambiar la marca de un item EXISTENTE
    // (paridad con el paso 21 del wizard): PATCH etiqueta el item Y la elección
    // manual persiste la preferencia GLOBAL (user_brand_preferences — la lista de
    // compras y los planes futuros la usan). 'Genérico' limpia ambas. Fail-soft en
    // la preferencia (el item ya quedó etiquetado).
    // Función plana (NO useCallback): cierra sobre fetchData/brandCache frescos
    // de cada render — un useCallback([]) capturaría instancias stale.
    const changeItemBrand = async (item, newBrand) => {
        const _clean = (newBrand === 'Genérico' ? '' : (newBrand || ''));  // BrandSelect manda '' para Genérico
        try {
            await _apiJson(`/api/inventory/items/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brand: _clean }),
            });
            invalidateInventoryCache();
            fetchData(false);
        } catch (e) {
            console.error('Pantry changeItemBrand:', e);
            toast.error(t('No se pudo cambiar la marca.'));
            return;
        }
        try {
            const key = _normFood(item.ingredient_name);
            const entry = (brandCache[key]?.brands || []).find(b => b.brand === newBrand);
            await fetchWithAuth('/api/supermarket/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    food_key: item.ingredient_name,
                    product_id: _clean && entry?.productId ? entry.productId : null,
                }),
            });
        } catch { /* fail-soft */ }
    };

    // [P1-PANTRY-DASH-PARITY · 2026-07-11] Prefetch de marcas en LOTE para las filas
    // existentes (un solo POST con todos los nombres no cacheados, debounced): las
    // filas SIN marcas disponibles no muestran selector (un menú con solo "Genérico"
    // confunde — mismo contrato que el paso 21 del wizard).
    useEffect(() => {
        if (!inventory.length) return undefined;
        const _names = inventory.map(i => i.ingredient_name)
            .filter(n => n && !brandCache[_normFood(n)] && !brandLoadingRef.current.has(_normFood(n)));
        if (!_names.length) return undefined;
        let cancelled = false;
        const t = setTimeout(async () => {
            _names.forEach(n => brandLoadingRef.current.add(_normFood(n)));
            try {
                const res = await fetchWithAuth('/api/supermarket/match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // [P1-BETA-PRICE-LEAKS · 2026-08-21] ver el otro call site de este archivo.
                    body: JSON.stringify({ names: _names, country: formData?.country }),
                });
                const data = res.ok ? await res.json() : null;
                if (cancelled) return;
                setBrandCache(prev => {
                    const p = { ...prev };
                    for (const n of _names) {
                        const groups = (data?.matches && data.matches[n]) || [];
                        const byBrand = new Map();
                        groups.forEach(g => (g.variants || []).forEach(v => {
                            const b = (v.brand && String(v.brand).trim()) ? String(v.brand).trim() : null;
                            if (!b) return;
                            const price = (typeof v.price_rd === 'number') ? v.price_rd : null;
                            const cur = byBrand.get(b);
                            if (!cur || (price != null && (cur.price == null || price < cur.price))) {
                                byBrand.set(b, { brand: b, price, productId: v.id });
                            }
                        }));
                        p[_normFood(n)] = {
                            loading: false,
                            brands: [...byBrand.values()].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
                        };
                    }
                    // [P1-BRAND-CHIP-PERSIST · 2026-08-14] Persistir para el
                    // próximo refresh. Va DENTRO del updater para guardar el
                    // mapa ya fusionado (`p`), no el `prev` de antes de este
                    // lote: guardar fuera dejaría siempre una tanda atrás.
                    setCachedBrands(p);
                    return p;
                });
            } catch {
                if (!cancelled) {
                    setBrandCache(prev => {
                        const p = { ...prev };
                        _names.forEach(n => { if (!p[_normFood(n)]) p[_normFood(n)] = { loading: false, brands: [] }; });
                        return p;
                    });
                }
            } finally {
                _names.forEach(n => brandLoadingRef.current.delete(_normFood(n)));
            }
        }, 600);
        return () => { cancelled = true; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inventory]);

    // [P3-PANTRY-ADD-MOBILE · 2026-06-19] El add-sheet es bottom-anchored + autoFocus,
    // así que en MÓVIL el teclado virtual TAPABA el buscador y los resultados (incómodo).
    // Con la VisualViewport API levantamos el sheet por ENCIMA del teclado (`bottom` =
    // alto del teclado) y limitamos su alto al espacio visible → buscador + resultados
    // siempre visibles, sin saltos. Fallback seguro: sin visualViewport (desktop viejo)
    // → inset 0 y alto basado en innerHeight (idéntico al comportamiento previo).
    const [kbInset, setKbInset] = useState(0);
    const [vvHeight, setVvHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
    useEffect(() => {
        if (!showAddMenu) { setKbInset(0); return undefined; }
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return undefined;
        const update = () => {
            setKbInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
            setVvHeight(vv.height);
        };
        update();
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        return () => {
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
        };
    }, [showAddMenu]);

    // [P3-PANTRY-QTY-EDIT · 2026-05-18] Editor de cantidad exacta para items
    // ya en la nevera. Cierra el gap UX "tengo 5 cartones, no quiero clickear
    // + cinco veces ni mantener turbo presionado contando". Click en el número
    // del counter abre este editor; `+` / `-` siguen siendo +1/-1 turbo
    // (gestos rápidos para el caso común).
    const [qtyEditItem, setQtyEditItem] = useState(null);   // row completo del inventory
    const [qtyEditValue, setQtyEditValue] = useState(1);
    const [qtyEditSaving, setQtyEditSaving] = useState(false);

    // [P2-PANTRY-MODALS-A11Y · 2026-05-30] role=dialog + focus-trap + ESC +
    // restore-focus para los 3 modales custom. `disableClose` evita cerrar
    // durante una operación en vuelo (añadir / guardar cantidad). El destructivo
    // "Vaciar Nevera" NO usa disableClose (confirmDeleteAll cierra síncrono).
    // [P5-SPEED-PANTRY-MODAL-ONCLOSE · 2026-06-01] onClose estables vía useCallback
    // (setters de React son estables → deps []). Antes eran arrows inline: su
    // identidad cambiaba en cada render de Pantry, y el effect de useModalAccessibility
    // (deps [isOpen, onClose, disableClose]) re-corría cada vez → re-armaba el
    // focus-trap y el scroll-lock MIENTRAS el modal estaba abierto. Pantry re-renderiza
    // muy seguido con un modal abierto (typeahead del add-menu, hold-increment a 80ms).
    const _closeAddMenu = useCallback(() => { setShowAddMenu(false); setAddItemSearch(''); }, []);
    const _closeQtyEdit = useCallback(() => setQtyEditItem(null), []);
    const _closeDeleteConfirm = useCallback(() => setShowDeleteConfirm(false), []);
    const { containerRef: addMenuModalRef } = useModalAccessibility({
        isOpen: showAddMenu,
        onClose: _closeAddMenu,
        disableClose: isAdding,
    });
    const { containerRef: qtyEditModalRef } = useModalAccessibility({
        isOpen: !!qtyEditItem,
        onClose: _closeQtyEdit,
        disableClose: qtyEditSaving,
    });
    const { containerRef: deleteConfirmModalRef } = useModalAccessibility({
        isOpen: showDeleteConfirm,
        onClose: _closeDeleteConfirm,
    });

    // [P4-PANTRY-UNITS-HOIST] COMMON_PURCHASE_UNITS movido a module-scope (arriba de Pantry).

    // Resetear focus activo al cambiar búsqueda o cerrar modal
    useEffect(() => {
        setSelectedIndex(-1);
    }, [addItemSearch, showAddMenu]);

    // Reset del picker inline al cerrar el modal o cambiar la búsqueda.
    useEffect(() => {
        setPickerForId(null);
        setPickerQty(1);
        setPickerUnit('');
        setPickerBrand(null);
    }, [addItemSearch, showAddMenu]);

    // [P2-15 · 2026-07-09] Single-source: el store compartido (hidratación
    // lazy P3-PANTRY-LOCALSTORAGE-LAZY, guard array-de-strings
    // P4-PANTRY-ARRAY-GUARD y sync cross-tab por 'storage' viven dentro del
    // hook). Fix del drift same-tab: los cambios hechos en Dashboard ahora se
    // ven aquí al instante — el evento 'storage' solo disparaba cross-tab.
    const [disabledIngredients] = useDisabledIngredients();

    // Estado "Agotados": items que el usuario marcó como agotados o eliminó
    // manualmente. Se guarda en localStorage (mismo patrón que disabledIngredients)
    // y NO toca la DB — semánticamente "agotado" === "ya no lo tengo", que es
    // idéntico para el backend a "eliminado". El visual es puramente client-side.
    // [P3-PANTRY-LOCALSTORAGE-LAZY · 2026-05-19] Mismo patrón que
    // disabledIngredients — lazy init evita re-render post-mount.
    const [depletedItems, setDepletedItems] = useState(() => {
        try {
            const saved = safeLocalStorageGet('mealfit_depleted_items', null);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch(e) {}
        return [];
    });

    const _depletedKey = (entryOrItem) => {
        const masterId = entryOrItem?.master_ingredient_id;
        if (masterId) return `m:${masterId}`;
        const name = entryOrItem?.ingredient_name || entryOrItem?.name || '';
        return `n:${String(name).toLowerCase().trim()}`;
    };

    // [P3-DEPLETED-BD · 2026-05-22] persist a localStorage como CACHE local.
    // La fuente de verdad es la tabla `user_depleted_items` en BD (cross-device).
    // Los wrappers `_addDepleted` / `_removeDepleted` hacen API calls + caen
    // al localStorage si el API falla (degradación graceful, no rompe UX).
    const _persistDepleted = (next) => {
        setDepletedItems(next);
        if (next.length === 0) {
            safeLocalStorageRemove('mealfit_depleted_items');
        } else {
            safeLocalStorageSet('mealfit_depleted_items', JSON.stringify(next));
        }
    };

    const _addDepleted = (item) => {
        // Capturamos la cantidad en el momento de agotar para que Reponer
        // devuelva el mismo número (ej: 2 limones → agotar → reponer → 2).
        // Fallback a 1 si el item llega sin quantity (defensive).
        const snapshotQty = (typeof item.quantity === 'number' && item.quantity > 0)
            ? item.quantity
            : 1;
        const entry = {
            master_ingredient_id: item.master_ingredient_id || null,
            ingredient_name: item.ingredient_name,
            quantity: snapshotQty,
            unit: item.unit,
            category: item.master_ingredients?.category || 'OTROS',
            shelf_life_days: item.master_ingredients?.shelf_life_days || null,
            depleted_at: new Date().toISOString(),
        };
        const k = _depletedKey(entry);
        const next = [...depletedItems.filter(e => _depletedKey(e) !== k), entry];
        _persistDepleted(next);
        // [P3-DEPLETED-BD · 2026-05-22] Persist a BD (cross-device). Best-effort:
        // si el endpoint falla, el state local + localStorage queda como
        // fallback. El refetch on visibilitychange/focus reconciliará si el
        // POST eventualmente ocurre (e.g., reintento manual del user).
        (async () => {
            try {
                await fetchWithAuth('/api/plans/depleted-items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: [entry] }),
                });
            } catch (e) {
                console.warn('[P3-DEPLETED-BD] POST depleted-items falló (cache local persiste):', e);
            }
        })();
    };

    const _removeDepleted = (entryOrItem) => {
        const k = _depletedKey(entryOrItem);
        // [P2-DEPLETED-DELETE-ID · 2026-05-30] Resolver la fila objetivo por
        // IDENTIDAD ESTABLE (_depletedKey) contra el state `depletedItems`, NO
        // por `entryOrItem?.id`. Razón: los callers pasan objetos con id
        // equivocado o ausente —
        //   · Deshacer (handleDeleteItem) pasa el row de `inventory`, cuyo `.id`
        //     es un `user_inventory.id`, NO un `user_depleted_items.id` (son
        //     secuencias bigint independientes) → el DELETE pegaba a un id que
        //     no matchea fila agotada alguna (o, cuando los rangos colisionen,
        //     borraría la fila agotada de OTRO ingrediente del mismo user).
        //   · handleAddNewItem pasa {master_ingredient_id, ingredient_name}
        //     sintético SIN id → el DELETE se saltaba → la fila agotada sobrevivía
        //     en BD y resurgía en el próximo _fetchAndApply/mount.
        // El state `depletedItems` SÍ trae el `user_depleted_items.id` correcto
        // (vía `_normalizeForState`); usamos el id de la entry matcheada.
        const matched = depletedItems.find(e => _depletedKey(e) === k);
        const next = depletedItems.filter(e => _depletedKey(e) !== k);
        if (next.length === depletedItems.length) return;
        _persistDepleted(next);
        const realId = matched?.id;
        if (realId != null) {
            (async () => {
                try {
                    await fetchWithAuth(`/api/plans/depleted-items/${realId}`, { method: 'DELETE' });
                } catch (e) {
                    console.warn('[P3-DEPLETED-BD] DELETE depleted-items falló:', e);
                }
            })();
        }
        // Sin `realId` confiable (la entry no estaba en BD aún — POST optimista
        // in-flight) se omite el DELETE: el upsert/realtime reconcilia, o no
        // existe fila que borrar.
    };

    // [P3-PANTRY-LOCALSTORAGE-LAZY · 2026-05-19] La hidratación inicial
    // se hizo en el lazy-init de useState. Solo mantenemos el listener
    // cross-tab para sincronizar si OTRA tab modifica el key (cache local).
    useEffect(() => {
        const hydrate = () => {
            const saved = safeLocalStorageGet('mealfit_depleted_items', null);
            if (!saved) { setDepletedItems([]); return; }
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) setDepletedItems(parsed);
            } catch (e) { setDepletedItems([]); }
        };
        window.addEventListener('storage', hydrate);
        return () => window.removeEventListener('storage', hydrate);
    }, []);

    // [P3-DEPLETED-BD · 2026-05-22] Cross-device sync: la fuente de verdad
    // es la tabla `user_depleted_items` en BD. Flow al mount:
    //   1. One-shot migration: si hay items en localStorage + flag
    //      `mealfit_depleted_items_migrated_at` NO existe → POST batch a BD
    //      para que items pre-existentes (single-device legacy) entren a la
    //      tabla cross-device. Set el flag para que solo corra una vez.
    //   2. Fetch desde BD → mergear con state actual (BD gana en conflictos).
    //   3. [P1-NEON-DB-MIGRATION · 2026-06-12] Canal Realtime eliminado (la
    //      publicación muere con el cutover a Neon). El caso multi-tab/device
    //      se cubre con refetch de `_fetchAndApply` on visibilitychange/focus
    //      (mismo patrón que el Dashboard).
    useEffect(() => {
        const uid = session?.user?.id;
        if (!uid) return;
        let cancelled = false;

        const _normalizeForState = (rows) => (Array.isArray(rows) ? rows : []).map(r => ({
            id: r.id,
            master_ingredient_id: r.master_ingredient_id || null,
            ingredient_name: r.ingredient_name,
            quantity: typeof r.quantity === 'number' ? r.quantity : Number(r.quantity || 1),
            unit: r.unit || 'unidad',
            category: r.category || 'OTROS',
            shelf_life_days: r.shelf_life_days || null,
            depleted_at: r.depleted_at || new Date().toISOString(),
        }));

        const _fetchAndApply = async () => {
            try {
                const resp = await fetchWithAuth('/api/plans/depleted-items');
                if (!resp?.ok) return;
                const json = await resp.json();
                const items = _normalizeForState(json?.items);
                if (cancelled) return;
                // [P3-DEPLETED-REALTIME-MERGE · 2026-05-30] No reemplazar a ciegas
                // con solo las filas de BD: preservar los entries OPTIMISTAS aún
                // sin `id` (POST de _addDepleted in-flight) cuyo key no esté ya en
                // BD. Pre-fix, un eco realtime (de otro item/tab/device) que
                // disparaba _fetchAndApply mientras el POST de A estaba in-flight
                // borraba A del state+localStorage (flicker self-healing hasta que
                // el INSERT de A round-trip-eaba). BD sigue ganando para entries
                // con id (cross-device correcto).
                setDepletedItems(prev => {
                    const dbKeys = new Set(items.map(_depletedKey));
                    const pendingOptimistic = (Array.isArray(prev) ? prev : [])
                        .filter(e => e && e.id == null && !dbKeys.has(_depletedKey(e)));
                    const merged = pendingOptimistic.length ? [...items, ...pendingOptimistic] : items;
                    if (merged.length === 0) {
                        safeLocalStorageRemove('mealfit_depleted_items');
                    } else {
                        safeLocalStorageSet('mealfit_depleted_items', JSON.stringify(merged));
                    }
                    return merged;
                });
            } catch (e) {
                console.warn('[P3-DEPLETED-BD] fetch /depleted-items falló (cache local sigue activo):', e);
            }
        };

        const _runOneShotMigration = async () => {
            const flagKey = 'mealfit_depleted_items_migrated_at';
            const flag = safeLocalStorageGet(flagKey, null);
            if (flag) return; // ya migrado
            const saved = safeLocalStorageGet('mealfit_depleted_items', null);
            if (!saved) {
                // Nada que migrar — set flag para no re-evaluar.
                try { safeLocalStorageSet(flagKey, String(Date.now())); } catch (e) {}
                return;
            }
            let legacy;
            try {
                legacy = JSON.parse(saved);
                if (!Array.isArray(legacy) || legacy.length === 0) {
                    try { safeLocalStorageSet(flagKey, String(Date.now())); } catch (e) {}
                    return;
                }
            } catch (e) {
                try { safeLocalStorageSet(flagKey, String(Date.now())); } catch (_) {}
                return;
            }
            try {
                const resp = await fetchWithAuth('/api/plans/depleted-items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: legacy }),
                });
                if (resp?.ok) {
                    try { safeLocalStorageSet(flagKey, String(Date.now())); } catch (e) {}
                    console.log(`[P3-DEPLETED-BD] migration one-shot: ${legacy.length} items migrados desde localStorage a BD.`);
                }
            } catch (e) {
                console.warn('[P3-DEPLETED-BD] migration one-shot falló (reintentará al próximo mount):', e);
            }
        };

        (async () => {
            await _runOneShotMigration();
            await _fetchAndApply();
        })();

        // [P1-NEON-DB-MIGRATION · 2026-06-12] Reemplazo del canal Realtime:
        // refetch al volver al tab/window (cubre cambios hechos desde otro
        // tab o device mientras este estaba en background).
        const _refetchDepletedOnFocus = () => {
            if (!cancelled) _fetchAndApply();
        };
        const _onVisibleDepleted = () => {
            if (document.visibilityState === 'visible') _refetchDepletedOnFocus();
        };
        document.addEventListener('visibilitychange', _onVisibleDepleted);
        window.addEventListener('focus', _refetchDepletedOnFocus);

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', _onVisibleDepleted);
            window.removeEventListener('focus', _refetchDepletedOnFocus);
        };
    }, [session?.user?.id]);

    // Lock/Debounce por item para el guardado 
    const pendingOps = useRef(new Map()); // id -> { baselineQty, targetQty, timeout }
    // [P3-PANTRY-CACHE · 2026-05-19] Si el cache singleton tiene masterList
    // vigente (TTL 24h, casi-inmutable), arrancamos el ref en `true` para
    // skipear el fetch redundante. Lazy useRef init via callback no existe
    // como `useState(() => ...)`, así que evaluamos directo.
    // [P1-PANTRY-CATALOG-EMPTY-CACHE · 2026-08-22] «Cargado» = con filas. `Boolean([])`
    // era true y un catálogo vacío quedaba como definitivo para toda la vida de la PWA.
    const masterListLoaded = useRef((getCachedMasterList() || []).length > 0);
    const catalogInFlight = useRef(false);
    const [catalogLoading, setCatalogLoading] = useState(false);
    // Pide el catálogo si aún no hay filas (al abrir el buscador o al teclear): no
    // depende de que fetchData haya tenido éxito en su Promise.all con el inventario.
    const ensureCatalog = useCallback(async () => {
        if (masterListLoaded.current || catalogInFlight.current) return;
        catalogInFlight.current = true;
        setCatalogLoading(true);
        try {
            const json = await _apiJson('/api/catalog');
            const rows = json?.items || [];
            if (rows.length > 0) {
                setMasterList(rows);
                setCachedMasterList(rows);
                masterListLoaded.current = true;
            }
        } catch (e) {
            console.error('[pantry] catalog fetch failed', e);
        } finally {
            catalogInFlight.current = false;
            setCatalogLoading(false);
        }
    }, []);
    useEffect(() => { if (showAddMenu) ensureCatalog(); }, [showAddMenu, ensureCatalog]);
    useEffect(() => { if (addItemSearch.trim()) ensureCatalog(); }, [addItemSearch, ensureCatalog]);

    // Refs para modo sostenido (velocímetro)
    const holdIntervalRef = useRef({});
    const holdTimeoutRef = useRef({});
    const inventoryRef = useRef([]);

    // [P2-NEW-12 · 2026-05-11] Debounce coalescente trailing para
    // `_recalcShoppingListAfterPantryChange`. Refs vs state porque NO
    // queremos re-render por cada burst de add/delete.
    const _recalcDebounceTimer = useRef(null);
    const _recalcInFlight = useRef(false);
    const _recalcPendingAfterFlight = useRef(false);
    const _RECALC_DEBOUNCE_MS = 500; // P2-NEW-12: ventana coalescente

    // Mantener inventoryRef fresco para los intervalos asíncronos y fallbacks
    useEffect(() => {
        inventoryRef.current = inventory;
    }, [inventory]);

    // [P2-PANTRY-TURBO-HOLD-CLEANUP · 2026-05-23] Unmount cleanup para los
    // refs del turbo de cantidad (+ / -). Cierra el edge case donde
    // `stopHolding(id)` solo limpia el id específico (line ~727), así que si
    // el componente desmonta mientras (a) un setTimeout(400ms) de delay
    // sigue pending, o (b) un setInterval(80ms) está firing, los handlers
    // sobreviven al unmount e invocan handleUpdateQuantity sobre estado
    // stale → React warning + posible mutation post-unmount. El cleanup
    // itera AMBOS objetos ref y clears each entry independientemente del id
    // que invocó stopHolding (que solo cubre los pointer events del item).
    useEffect(() => {
        return () => {
            try {
                const _timeouts = holdTimeoutRef.current || {};
                Object.values(_timeouts).forEach((tid) => {
                    if (tid) { try { clearTimeout(tid); } catch { /* noop */ } }
                });
                holdTimeoutRef.current = {};
                const _intervals = holdIntervalRef.current || {};
                Object.values(_intervals).forEach((iid) => {
                    if (iid) { try { clearInterval(iid); } catch { /* noop */ } }
                });
                holdIntervalRef.current = {};
            } catch { /* noop — el cleanup es best-effort */ }
        };
    }, []);

    // [P3-PANTRY-INVALIDATE-FROM-CHAT · 2026-05-22] Consumir la key
    // `mealfit_pantry_dirty_at` que AgentPage.jsx escribe cuando el chat
    // agent ejecuta `modify_pantry_inventory` o `log_consumed_meal` con
    // ingredients. Cierra el gap "user chatea → cambia nevera vía agente
    // → navega a /pantry y ve stale data" causado por (a) cache TTL=10min
    // que pisa el primer paint, (b) Realtime channel puede tener lag o
    // estar cerrado mientras el componente Pantry NO está montado.
    //
    // Pattern: mount + storage event listener. El `storage` event NO
    // dispara en el mismo tab que escribió la key — eso lo cubre el check
    // al mount cuando el user navega de /agent a /pantry. Cross-tab
    // (usuario con Pantry abierta en otro tab mientras chatea) sí dispara
    // storage event y la rama lo refetcheá inline.
    //
    // One-shot: tras consumir el dirty, `removeItem` la key para no
    // re-invalidar perpetuamente en próximos mounts.
    const _consumePantryDirtyFromChat = (source) => {
        // [P1-FRONTEND-HARDEN · 2026-05-23] Migrado de window.localStorage raw
        // a safeLocalStorageGet/Remove. El try/catch externo cubría el get
        // pero los dos removeItem internos seguían siendo raw → en iOS Private
        // Mode el throw del primer removeItem deja la key envenenada y los
        // siguientes mounts re-invalidaban perpetuamente la cache.
        const raw = safeLocalStorageGet('mealfit_pantry_dirty_at', null);
        if (!raw) return false;
        const dirtyAt = Number(raw);
        if (!Number.isFinite(dirtyAt) || dirtyAt <= 0) {
            safeLocalStorageRemove('mealfit_pantry_dirty_at');
            return false;
        }
        safeLocalStorageRemove('mealfit_pantry_dirty_at');
        console.log(`[P3-PANTRY-INVALIDATE-FROM-CHAT] dirty_at=${dirtyAt} source=${source}`);
        invalidateInventoryCache();
        return true;
    };

    useEffect(() => {
        if (!session?.user?.id) return;
        const onStorage = (e) => {
            if (e.key !== 'mealfit_pantry_dirty_at') return;
            if (_consumePantryDirtyFromChat('storage_event')) {
                fetchData(false);
            }
        };
        // [P3-PANTRY-INVALIDATE-MISMO-TAB · 2026-05-22] Custom event para
        // cobertura intra-tab. El `storage` event NO se dispara en el mismo
        // tab que escribió la key — solo cross-tab. Si user está en Pantry
        // y abre el chat en el mismo tab (modal, widget, SPA navigation
        // sin destruir Pantry), AgentPage dispara este evento que SÍ se
        // captura en mismo tab.
        const onPantryDirty = (_e) => {
            if (_consumePantryDirtyFromChat('custom_event')) {
                fetchData(false);
            }
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener('mealfit:pantry-dirty', onPantryDirty);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('mealfit:pantry-dirty', onPantryDirty);
        };
    }, [session?.user?.id]);

    // 1. Fetch data on mount
    // [P3-PANTRY-CACHE-SKIP-REFETCH · 2026-05-19] Si hay cache vigente
    // (TTL 30s no expirado), SKIP el fetch background completo. Antes
    // hacíamos fetch silencioso "para refrescar", pero ese fetch
    // disparaba `setInventory(rows)` con array nuevo aunque el contenido
    // fuera idéntico — React re-renderizaba el componente entero
    // (1100 líneas + N item cards) ~200-500ms después del primer paint,
    // sumado a los re-renders de `setDisabledIngredients` y
    // `setDepletedItems` desde localStorage, daba una cascada de 3-5
    // re-renders que el usuario percibía como "delay raro post-paint":
    // contenido visible pero algo seguía "cargando" 300ms más.
    //
    // Trade-off: si el cache tiene data 25s vieja, vas a ver eso 25s
    // viejo. Aceptable porque:
    //   (a) [P1-NEON-DB-MIGRATION · 2026-06-12] El refetch on
    //       visibilitychange/focus (reemplazo del canal Realtime,
    //       muerto con el cutover a Neon) reconcilia cambios externos
    //       al volver al tab; el cache fresh + refetch-on-focus es
    //       suficiente para mantener consistency.
    //   (b) Mutaciones del propio user (delete, increment, restock)
    //       invocan `fetchData(false)` o `setInventory` directo y
    //       pisan el cache.
    //   (c) TTL 30s significa peor caso 30s de staleness antes del
    //       próximo cache miss → fetch normal.
    //   (d) [P3-PANTRY-INVALIDATE-FROM-CHAT · 2026-05-22] La key
    //       `mealfit_pantry_dirty_at` que AgentPage.jsx setea tras
    //       tool calls del agente fuerza invalidación al mount.
    useEffect(() => {
        if (!session?.user?.id) return;
        // [P3-PANTRY-INVALIDATE-FROM-CHAT · 2026-05-22] Si el agente mutó
        // pantry mientras Pantry NO estaba montado (caso común: user
        // navega de /agent a /pantry tras una conversación), invalidar
        // antes de leer cache para que el `getCachedInventory()` no
        // devuelva el snapshot viejo.
        const _chatDirty = _consumePantryDirtyFromChat('mount');
        const _hasFreshCache = !_chatDirty && Boolean(getCachedInventory());
        if (_hasFreshCache) {
            // Cache fresh → trust it + refetch-on-focus. Cero re-render
            // adicional al mount. Datos cacheados quedan visibles snap.
            return;
        }
        fetchData(true);
    }, [session?.user?.id]);

    // [P3-PANTRY-SYNC-CACHE · 2026-05-27] Sincronizar el estado local `inventory`
    // con el cache singleton (in-memory + localStorage) de forma proactiva.
    // Evita inconsistencias y el bug donde vaciar la despensa ("Borrar Todos")
    // o mutaciones individuales dejaban el cache viejo activo, lo que volvía
    // a llenar la nevera al navegar o refrescar la página.
    useEffect(() => {
        if (!loading && Array.isArray(inventory)) {
            setCachedInventory(inventory);
        }
    }, [inventory, loading]);

    // 1b. Sync multi-tab/device: refetch al volver al tab/window.
    // [P1-NEON-DB-MIGRATION · 2026-06-12] El canal Realtime `pantry-realtime`
    // (consumía payload INSERT/UPDATE/DELETE de `user_inventory`) y su helper
    // `fetchAndAddSingleItem` fueron eliminados — la publicación Realtime
    // muere con el cutover a Neon. Reemplazo: el patrón del Dashboard
    // (refresh on visibilitychange/focus) + el refetch post-mutación que ya
    // hacen los handlers. `fetchData(false)` es silencioso (sin skeleton) y
    // pisa el cache singleton. NO añadimos polling permanente: el caso
    // multi-tab/device queda cubierto por el retorno al tab.
    useEffect(() => {
        if (!session?.user?.id) return;
        const refreshInventoryOnFocus = () => { fetchData(false); };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshInventoryOnFocus();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', refreshInventoryOnFocus);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', refreshInventoryOnFocus);
        };
    }, [session?.user?.id]);

    // Se recarga tras cada respuesta y en cada fetch de inventario: si el
    // usuario resuelve un item, el banner debe encogerse solo.
    const loadReconcileCandidates = useCallback(async () => {
        if (!session?.user?.id) return;
        try {
            const res = await fetchWithAuth(`${API_BASE}/api/plans/inventory/reconcile`);
            if (!res.ok) return;               // silencioso: es un extra, no bloquea la Nevera
            const data = await res.json();
            setReconcileItems(Array.isArray(data?.items) ? data.items : []);
        } catch (_e) { /* idem: nunca romper la página por el banner */ }
    }, [session?.user?.id]);

    useEffect(() => { loadReconcileCandidates(); }, [loadReconcileCandidates]);

    // Función plana a propósito, NO `useCallback`. Sus tres usos son onClick
    // inline del render: no la recibe ningún hijo memoizado ni ningún array de
    // dependencias, así que memoizarla no ahorra un solo render. Lo que sí hacía
    // era capturar `fetchData` —que se redefine en cada render (línea de abajo)—
    // dentro de un closure congelado: la llamada de `used`/`spoiled` habría
    // recargado el inventario con un `fetchData` viejo. El guard de doble-tap es
    // el estado `reconcileBusyId`, no la identidad de esta función.
    const handleReconcile = async (item, action) => {
        if (reconcileBusyId !== null) return;
        setReconcileBusyId(item.id);
        try {
            const res = await fetchWithAuth(`${API_BASE}/api/plans/inventory/reconcile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id: item.id, action }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) {
                toast.error(t('No se pudo actualizar'), {
                    description: mensajeDeError(data, t('Inténtalo de nuevo en un momento.'), t),
                });
                return;
            }
            // Quitar del banner al instante; el refetch reconcilia.
            setReconcileItems((prev) => prev.filter((x) => x.id !== item.id));
            if (action === 'keep') {
                toast.success(t('{alimento}: anotado, sigue en tu Nevera.', { alimento: item.ingredient_name }));
            } else {
                toast.success(
                    action === 'spoiled'
                        ? t('{alimento} fuera de la Nevera (se dañó).', { alimento: item.ingredient_name })
                        : t('{alimento} fuera de la Nevera.', { alimento: item.ingredient_name })
                );
                // used/spoiled SÍ cambian el inventario → recargar la lista.
                invalidateInventoryCache();
                fetchData(false);
            }
            loadReconcileCandidates();
        } catch (err) {
            console.error('Error resolviendo reconciliación:', err);
            toast.error(t('No se pudo actualizar'), { description: t('Revisa tu conexión.') });
        } finally {
            setReconcileBusyId(null);
        }
    };

    const fetchData = async (isInitial = true) => {
        if (isInitial) setLoading(true);
        try {
            // [P5-SPEED-PANTRY-MOUNT-PARALLEL · 2026-06-01] inventario y
            // catálogo son fuentes independientes (el catálogo es
            // cuasi-inmutable y no depende del inventario) — Promise.all
            // las corre concurrentes. El catálogo solo se pide cuando aún
            // no está cargado (igual que antes).
            // [P1-NEON-DB-MIGRATION · 2026-06-12] Transporte migrado a los
            // endpoints backend: GET /api/inventory devuelve {items} con el
            // embed master_ingredients anidado (shape idéntico al select
            // PostgREST legacy, solo quantity>0, orden ingredient_name ASC);
            // GET /api/catalog devuelve {items} con master_ingredients
            // completo. el SDK anterior ya no habla con la DB post-cutover.
            const needMaster = !masterListLoaded.current;
            const invPromise = _apiJson('/api/inventory');
            const masterPromise = needMaster ? _apiJson('/api/catalog') : null;

            const [invJson, masterJson] = await Promise.all([
                invPromise,
                masterPromise,
            ]);

            const _invRows = invJson?.items || [];
            setInventory(_invRows);
            // [P3-PANTRY-CACHE · 2026-05-19] Persiste al singleton tras
            // éxito. Próximo mount renderiza con cache vigente sin
            // skeleton. Mutaciones (delete/increment/restock) siguen
            // llamando fetchData → pisan el cache acá mismo.
            setCachedInventory(_invRows);

            // Fetch Master List (solo una vez; cambios son rarísimos)
            if (needMaster && (masterJson?.items || []).length > 0) {
                const _masterRows = masterJson.items;
                setMasterList(_masterRows);
                // [P3-PANTRY-CACHE · 2026-05-19] Catálogo cuasi-inmutable.
                // Cache 24h cross-mount cubre toda la sesión típica del
                // user sin bajar 19.8KB cada entrada al apartado.
                setCachedMasterList(_masterRows);
                masterListLoaded.current = true;
            } else if (masterList.length === 0) {
                // [P3-PANTRY-CACHE · 2026-05-19] Edge: masterListLoaded
                // viene `true` del cache singleton pero el useState lazy
                // arrancó vacío (cache invalidado entre el render y este
                // punto). Releer del singleton; si sigue vigente lo
                // setearemos. Sin esto el render queda con master vacío.
                const _cachedMaster = getCachedMasterList();
                if (Array.isArray(_cachedMaster) && _cachedMaster.length > 0) {
                    setMasterList(_cachedMaster);
                }
            }
        } catch (error) {
            console.error('Error fetching pantry:', error);
            // [P2-PANTRY-401-GRACEFUL · 2026-06-21] _apiJson adjunta err.status. 401 =
            // sesión expirada → mensaje neutro e informativo (no el rojo alarmante "Error
            // al cargar la despensa"). El first-party session normalmente lo evita; esto
            // es defensa. Pantry está route-bloqueado para invitados, así que esto solo
            // ocurre en una sesión logueada-pero-expirada (raro).
            if (isInitial) {
                if (error?.status === 401) {
                    toast(t('Tu sesión expiró. Inicia sesión de nuevo para ver tu despensa.'));
                } else {
                    toast.error(t('Error al cargar la despensa.'));
                }
            }
        } finally {
            if (isInitial) setLoading(false);
        }
    };

    // Funciones Helper para tracking hiper-rápido antes de que React renderice
    const getLatestQuantity = (id) => {
        if (pendingOps.current.has(id)) {
            return pendingOps.current.get(id).targetQty;
        }
        const item = inventoryRef.current.find(i => i.id === id);
        return item ? item.quantity : 0;
    };

    const stopHolding = (e, id) => {
        if (e) e.preventDefault();
        clearTimeout(holdTimeoutRef.current[id]);
        clearInterval(holdIntervalRef.current[id]);
    };

    // 2. Real-time updates (Optimistic UI con Debounce Agresivo)
    // [P3-AUDIT-8 · 2026-05-10] Helper SSOT para recalcular la lista de
    // compras tras un cambio en el SET de items de la nevera (add/delete).
    //
    // ANTES, solo `confirmDeleteAll` ejecutaba este flow inline; añadir o
    // eliminar un item individual NO invalidaba el `mealfit_plan` cacheado
    // ni notificaba al Dashboard. El PDF (`Dashboard.jsx handleDownloadShoppingList`)
    // sí refresca con `fetchFreshInventoryWithTimeout` antes de renderizar,
    // pero el DISPLAY in-app del Dashboard usaba la lista del plan cacheada
    // hasta el siguiente full refresh → user veía un item recién comprado
    // todavía en la lista "por comprar".
    //
    // NO se invoca tras `handleUpdateQuantity` porque los cambios de
    // cantidad ya quedan persistidos via POST /api/inventory/increment
    // (incremento atómico server-side sobre user_inventory) + el render del
    // Dashboard recalcula sobre liveInventory. Llamar al recalc en cada qty
    // change dispararía N HTTP innecesarios por la ráfaga del velocímetro turbo.
    //
    // Best-effort: si el recálculo falla, NO bloquea al usuario — el
    // cambio en pantry ya se persistió y el PDF lo recoge en la próxima
    // generación.
    const _recalcShoppingListAfterPantryChange = async ({
        silentSuccess = true,
        clearRestockedFlag = false,
    } = {}) => {
        try {
            // [P2-PANTRY-PAUSED-SURFACES · 2026-08-15] En modo contador NO se recalcula
            // la lista del plan pausado. Cada alta/baja de la Nevera disparaba un POST
            // que reescribia `aggregated_shopping_list` de un plan que el usuario apago,
            // y lo celebraba con un toast sobre una lista que su modo no muestra en
            // ninguna pantalla.
            //
            // Se corta el RECALC entero, no solo el toast: silenciar el aviso dejaria el
            // efecto (escrituras a meal_plans) sin la senal, que es peor -- un efecto
            // invisible cuesta mas de diagnosticar que uno ruidoso. Al reanudar, el
            // propio resume recalcula: no se pierde nada.
            if (enModoContador) return;
            const savedPlan = safeLocalStorageGet('mealfit_plan', null);
            if (!savedPlan || !session?.user?.id) return;

            let planData = safeJSONParseObject(savedPlan);
            if (!planData.calc_household_size && !planData.calc_grocery_duration) {
                // Storage corrupto/vacío: skip silencioso. El flujo principal
                // (carga desde DB en próximo mount) lo restaurará.
                console.warn('[Pantry] mealfit_plan storage no parseable; skip recalc.');
                return;
            }

            // [P2-NEW-4 · 2026-05-11] Pre-check defensive: si el plan
            // cambió en background (shift_plan, regen, restore), el
            // cliente puede tener `calc_household_size`/`calc_grocery_duration`
            // de un plan viejo. Aplicarlos al recalc generaría una lista
            // con household incorrecto.
            //
            // Defensa: lectura barata del plan actual del usuario antes
            // del recalc. Si el `id` o `updated_at` cambiaron, recargamos
            // localStorage desde DB y usamos los valores frescos.
            //
            // Patrón best-effort: cualquier fallo del pre-check NO debe
            // abortar el recalc — caemos al comportamiento previo.
            // [P1-PLANDATA-ID-HYDRATE · 2026-08-05] El id del plan segun el
            // SERVIDOR, capturado del pre-check de abajo. No basta el id del
            // localStorage: un recalc anterior con este mismo bug pudo haberlo
            // persistido ya despojado, y entonces el "fallback local" repara
            // con null. Esto permite auto-repararse de estados ya rotos.
            let _serverKnownPlanId = null;
            try {
                // calc_household_size / calc_grocery_duration NO son columnas
                // top-level en meal_plans — viven dentro de plan_data jsonb.
                // [P1-NEON-DB-MIGRATION · 2026-06-12] Pre-check vía GET
                // /api/plans-data/latest (antes SELECT directo a meal_plans
                // con el SDK anterior). Mismo shape: {id, updated_at, plan_data}
                // con timestamps ISO-8601 — los consumers no cambian.
                const _latestJson = await _apiJson('/api/plans-data/latest?include_plan_data=true');
                const latest = _latestJson?.plan;
                if (latest && latest.id) {
                    _serverKnownPlanId = latest.id;
                    const localId = planData?.id;
                    const localUpdatedAt = planData?.updated_at;
                    if (
                        latest.id &&
                        localId &&
                        (latest.id !== localId ||
                         (latest.updated_at && localUpdatedAt && latest.updated_at !== localUpdatedAt))
                    ) {
                        console.warn(
                            '[P2-NEW-4] Plan drift detected pre-recalc: ' +
                            `local=${localId} (${localUpdatedAt}), ` +
                            `latest=${latest.id} (${latest.updated_at}). ` +
                            'Refrescando localStorage antes del recalc.'
                        );
                        // Refrescar planData con el plan real.
                        const fresh = latest.plan_data || {};
                        // Inyectar campos top-level que el recalc necesita.
                        // calc_household_size / calc_grocery_duration ya están
                        // dentro de plan_data jsonb (i.e. `fresh.calc_...`), no
                        // hace falta sobreescribirlas con columnas inexistentes.
                        fresh.id = latest.id;
                        fresh.updated_at = latest.updated_at;
                        // [P1-PROD-FINAL-3 · 2026-05-24] safeLocalStorageSet
                        // SSOT — el try/catch ad-hoc previo cubría el throw,
                        // pero homogenizar contra el helper SSOT es necesario
                        // para que el lint warn ESLint no marque este sitio.
                        safeLocalStorageSet('mealfit_plan', JSON.stringify(fresh));
                        planData = fresh;
                        try { setPlanData(fresh); } catch (_setErr) { /* setter best-effort */ }
                    }
                }
            } catch (_prefetchErr) {
                console.warn('[P2-NEW-4] Plan freshness prefetch falló (best-effort):', _prefetchErr);
            }

            const householdSize = planData?.calc_household_size || 1;
            const groceryDuration = planData?.calc_grocery_duration || 'weekly';

            // [P3-RECALC-503-CLASSIFICATION · 2026-05-16] Retry 1× en
            // 5xx/network. Backend escala transient (pool exhaustion,
            // RemoteProtocolError) → 503; este recalc post-pantry es
            // no-crítico (cambio ya persistido) pero el retry evita
            // toast "no se pudo recalcular" en blips.
            const recalcBody = JSON.stringify({
                user_id: session.user.id,
                householdSize,
                groceryDuration,
                // [P2-NEW-4] plan_id incluido para que el backend pueda
                // loggear/rechazar drift si recibe un id que ya no es el
                // último del usuario.
                // [P2-NEW-B · 2026-05-11] El backend ahora resuelve el
                // plan target con SELECT explícito `WHERE id=%s AND
                // user_id=%s` cuando el body lleva plan_id (en lugar de
                // fallback a `get_latest_meal_plan_with_id`). Cierra
                // race con _chunk_worker creando plan B en paralelo.
                plan_id: planData?.id,
            });
            const attemptRecalc = async () => {
                try {
                    const r = await fetchWithAuth(`${API_BASE}/api/plans/recalculate-shopping-list`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: recalcBody,
                    });
                    return { res: r, networkError: null };
                } catch (e) {
                    return { res: null, networkError: e };
                }
            };
            let { res: recalcRes, networkError } = await attemptRecalc();
            const isTransient = networkError || (recalcRes && recalcRes.status >= 500);
            if (isTransient) {
                await new Promise((r) => setTimeout(r, 500));
                ({ res: recalcRes, networkError } = await attemptRecalc());
            }
            if (networkError) throw networkError;
            const result = await recalcRes.json();
            if (result.success && result.plan_data) {
                if (clearRestockedFlag) {
                    // confirmDeleteAll limpia `is_restocked` porque la
                    // despensa fue vaciada por completo. Para add/delete
                    // individual no tocamos este flag (el restock parcial
                    // sigue siendo válido).
                    delete result.plan_data.is_restocked;
                }
                // [P1-PLANDATA-ID-HYDRATE · 2026-08-05] plan_data del recalc
                // llega SIN id (vive en la columna, no en el JSONB) — adoptarlo
                // pelado dejaba el contexto Y el localStorage sin plan_id, y el
                // siguiente regenerateDay moría con "No encontramos tu plan
                // activo" hasta refrescar (vivo 2026-08-05: vaciar la Nevera +
                // importar de la lista). Es el mismo contrato que los hydrates
                // del contexto (test ancla test_p1_plandata_id_hydrate.py) — y
                // la ironía que delató la clase: la rama de drift de arriba SÍ
                // adjuntaba (`fresh.id = latest.id`) mientras esta adopción no.
                if (result.plan_data.id == null) {
                    const _healId = planData?.id ?? _serverKnownPlanId;
                    if (_healId != null) result.plan_data.id = _healId;
                }
                // [P1-PROD-FINAL-3 · 2026-05-24] safeLocalStorageSet — raw
                // setItem post-recalc lanzaba en iOS Private Mode; el plan
                // recién recibido del backend no se persistía y el setPlanData
                // local divergía del próximo reload.
                safeLocalStorageSet('mealfit_plan', JSON.stringify(result.plan_data));
                setPlanData(result.plan_data);
                if (!silentSuccess) {
                    toast.success(t('Lista de compras actualizada'), { icon: '🛒', duration: 3000 });
                }
                // [P2-AUDIT-NEW-1 · 2026-05-12] Consumir `_coherence_warnings`
                // que el backend emite cuando el guard P2-COHERENCE-1 detecta
                // drift recetas↔lista durante el recalc. Toast no-bloqueante
                // (silencio si la key está ausente o lista vacía — endpoints
                // legacy que no emiten warnings siguen funcionando igual).
                emitCoherenceToast(toast, result._coherence_warnings);
            }
        } catch (recalcErr) {
            // No bloquear al usuario — el cambio en pantry ya se persistió.
            console.warn('⚠️ No se pudo recalcular la lista de compras:', recalcErr);
        }
    };

    // [P2-NEW-12 · 2026-05-11] Wrapper coalescente para los callsites
    // add/delete INDIVIDUALES (no para `confirmDeleteAll` que mantiene
    // semántica await directa — toast post-éxito).
    //
    // Garantías:
    //   - Múltiples invocaciones dentro de `_RECALC_DEBOUNCE_MS` (500ms)
    //     producen UN solo HTTP a `/api/plans/recalculate-shopping-list`.
    //   - Si una invocación llega mientras OTRO recalc está en flight,
    //     se marca `_recalcPendingAfterFlight=true` y al terminar el
    //     en-flight se dispara UN recalc adicional (preserva el último
    //     estado de la nevera).
    //   - El timer se cancela en unmount via efecto de cleanup más abajo.
    //
    // Trade-off consciente: descarta args (`silentSuccess`/`clearRestockedFlag`)
    // — los 3 callsites debounced no los pasaban en su forma original
    // (línea 473, 485, 567 invocaban sin args). El path `confirmDeleteAll`
    // (línea 510, que SÍ pasa args) sigue inline sin debounce.
    const _scheduleRecalcShoppingList = () => {
        if (_recalcInFlight.current) {
            // Hay un recalc corriendo — marcamos pendiente y volveremos
            // a schedule al terminar.
            _recalcPendingAfterFlight.current = true;
            return;
        }
        if (_recalcDebounceTimer.current) {
            clearTimeout(_recalcDebounceTimer.current);
        }
        _recalcDebounceTimer.current = setTimeout(async () => {
            _recalcDebounceTimer.current = null;
            _recalcInFlight.current = true;
            try {
                await _recalcShoppingListAfterPantryChange();
            } finally {
                _recalcInFlight.current = false;
                if (_recalcPendingAfterFlight.current) {
                    _recalcPendingAfterFlight.current = false;
                    // Re-schedule trailing: respeta debounce window.
                    _scheduleRecalcShoppingList();
                }
            }
        }, _RECALC_DEBOUNCE_MS);
    };

    // Cleanup del timer si el componente se desmonta mid-debounce —
    // evita warning "state update on unmounted component" si el recalc
    // resolve después del unmount y modifica state.
    useEffect(() => {
        return () => {
            if (_recalcDebounceTimer.current) {
                clearTimeout(_recalcDebounceTimer.current);
                _recalcDebounceTimer.current = null;
            }
        };
    }, []);

    // [P3-PANTRY-PENDINGOPS-CLEANUP · 2026-05-30] Unmount cleanup de la cola
    // `pendingOps` (timeouts de guardado de cantidad de handleUpdateQuantity).
    // Hermano omitido de P2-PANTRY-TURBO-HOLD-CLEANUP (que solo barría los refs
    // del turbo holdTimeout/holdInterval, no pendingOps). Si el user cambia una
    // cantidad y navega fuera de /pantry dentro de los 500ms del debounce, el
    // setTimeout sobrevive al unmount: dispara el POST de increment (benigno)
    // y luego (en fallo) fetchData(false)/toast sobre
    // componente desmontado → fetch redundante + toast fantasma en página
    // abandonada. El cleanup cancela los timeouts pendientes. El fetch al
    // re-montar (+ refetch on focus) reconcilia el estado.
    useEffect(() => {
        return () => {
            try {
                const _ops = pendingOps.current;
                if (_ops) {
                    _ops.forEach((op) => {
                        if (op?.timeout) {
                            try { clearTimeout(op.timeout); } catch { /* noop */ }
                        }
                    });
                    _ops.clear();
                }
            } catch { /* noop — best-effort */ }
        };
    }, []);

    const handleUpdateQuantity = async (id, newQty) => {
        if (newQty < 0) return;
        const roundedQty = Math.round(newQty * 100) / 100;

        if (roundedQty === 0) {
            stopHolding(null, id); // Cancelamos si vienen como ráfaga del velocímetro
            if (pendingOps.current.has(id)) {
                const op = pendingOps.current.get(id);
                if (op.timeout) clearTimeout(op.timeout);
                pendingOps.current.delete(id);
            }
            await handleDeleteItem(id);
            return;
        }

        // 1. Capturar el estado BASELINE solo si no había una ráfaga activa
        if (!pendingOps.current.has(id)) {
            const currentItem = inventoryRef.current.find(i => i.id === id);
            const baselineQty = currentItem ? currentItem.quantity : 0;
            pendingOps.current.set(id, { baselineQty, targetQty: roundedQty, timeout: null });
        } else {
            pendingOps.current.get(id).targetQty = roundedQty; // Actualizar objetivo de la ráfaga
        }

        const op = pendingOps.current.get(id);

        // 2. UI Updates visuales instantáneos
        setInventory(prev => prev.map(item => item.id === id ? { ...item, quantity: roundedQty } : item));

        // 3. Limpiar guardado pendiente (Debounce re-trigger)
        if (op.timeout) clearTimeout(op.timeout);

        // 4. Disparar el guardado cuando pasen 500ms SIN recibir otra actualización
        op.timeout = setTimeout(async () => {
            try {
                // El delta es la diferencia total desde que empezó la ráfaga
                const finalTarget = pendingOps.current.get(id).targetQty;
                const delta = finalTarget - op.baselineQty;

                if (delta !== 0) {
                    // [P1-NEON-DB-MIGRATION · 2026-06-12] Reemplaza la RPC
                    // `increment_inventory_quantity` (SECURITY DEFINER +
                    // auth.uid()). Mismo incremento atómico server-side
                    // (UPDATE ... SET quantity = quantity + delta), ahora
                    // vía backend con filtro user_id explícito (I2).
                    await _apiJson('/api/inventory/increment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ item_id: id, delta }),
                    });
                }
            } catch (error) {
                console.error("Error updating quantity:", error);
                // [P2-401-CENTRAL · 2026-07-12] En 401 el handler global
                // (AssessmentContext) ya muestra el toast de sesión expirada + teardown;
                // NO mostrar el error local (confuso: "Error al actualizar alimento"
                // cuando en realidad expiró la sesión) ni fetchData (que también 401ea →
                // parecía vaciar la Nevera).
                if (error?.status !== 401) {
                    toast.error(t('Error al actualizar alimento.'));
                    fetchData(false); // rollback visual si falla
                }
            } finally {
                pendingOps.current.delete(id); // Liberamos la ráfaga
            }
        }, 500); 
    };

    // Activación del "Velocímetro"
    //
    // Reglas de floor (P-FIX agotar-vs-decrement):
    //   - El botón "-" SOLO decrementa cantidad. Tiene piso en qty=1.
    //     Para eliminar/agotar el usuario tiene los botones explícitos
    //     (trash al llegar a qty=1, o "Agotar" siempre visible).
    //   - Sin este floor, mantener "-" presionado >400ms hacía que el
    //     turbo decrementara 2→1→0 en ~480ms, eliminando + marcando
    //     como agotado sin intención del usuario.
    const startHolding = (e, id, step) => {
        if (e) e.preventDefault(); // prevenir double click zoom
        const item = inventoryRef.current.find(i => i.id === id);
        if (!item) return;

        const _floor = step < 0 ? 1 : -Infinity; // "-" no baja de 1; "+" sin tope
        let currentQty = getLatestQuantity(id) + step;
        if (currentQty < _floor) return; // primera pulsación bajo el floor: no-op
        handleUpdateQuantity(id, currentQty);

        holdTimeoutRef.current[id] = setTimeout(() => {
            holdIntervalRef.current[id] = setInterval(() => {
                currentQty += step;
                if (step < 0 && currentQty < _floor) {
                    // El turbo llegó al piso (qty=1). Detener el interval —
                    // el usuario deberá soltar y dar click explícito en el
                    // botón trash o "Agotar" para eliminar.
                    stopHolding(null, id);
                    return;
                }
                if (currentQty < 0) currentQty = 0;
                handleUpdateQuantity(id, currentQty);
            }, 80); // <--- Velocidad supersónica (80ms = turbo)
        }, 400);
    };

    const handleDeleteItem = async (id, opts = {}) => {
        const { markAsDepleted = true } = opts;
        // Capturar snapshot del item antes de eliminarlo de la UI
        const deletedItem = inventory.find(item => item.id === id);
        if (!deletedItem) return;

        // Eliminación optimista inmediata de la UI
        setInventory(prev => prev.filter(item => item.id !== id));

        // Delete inmediato de la DB para evitar "fantasmas"
        try {
            // [P1-NEON-DB-MIGRATION · 2026-06-12] DELETE /api/inventory/items/{id}
            // (antes el cliente de DB anterior). El backend filtra
            // user_id explícito (I2). 404 = el row ya no existía (otro tab/device
            // lo borró) — objetivo cumplido, NO revertimos: el delete legacy de
            // PostgREST con 0 rows afectadas también era éxito silencioso.
            await _apiJson(`/api/inventory/items/${id}`, { method: 'DELETE' });
        } catch (error) {
            if (error?.status !== 404) {
                console.error("Error deleting:", error);
                // Revertir en la UI si falla
                setInventory(prev => [...prev, deletedItem].sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)));
                toast.error(t('Error al eliminar {alimento}', { alimento: deletedItem.ingredient_name }));
                return;
            }
        }

        // Marcar como "agotado" para que siga visible en el listado con la
        // etiqueta AGOTADO. Si el caller no quiere ese visual (delete duro
        // desde la sección de agotados), pasa markAsDepleted=false.
        if (markAsDepleted) _addDepleted(deletedItem);

        // Toast con opción de deshacer real (insert)
        toast.success(t('{alimento} eliminado', { alimento: deletedItem.ingredient_name }), {
            icon: '🗑️',
            duration: 5000,
            action: {
                label: t('Deshacer'),
                onClick: async () => {
                    // Re-insertar en la DB
                    // [P1-NEON-DB-MIGRATION · 2026-06-12] POST /api/inventory/items
                    // — la respuesta {item} ya trae el embed master_ingredients
                    // (paridad con el .select() del insert legacy).
                    try {
                        const oldId = deletedItem.id;
                        const _json = await _apiJson('/api/inventory/items', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ingredient_name: deletedItem.ingredient_name,
                                quantity: deletedItem.quantity,
                                unit: deletedItem.unit,
                                master_ingredient_id: deletedItem.master_ingredient_id || null,
                                source: deletedItem.source || null,
                                category: deletedItem.category || null,
                            }),
                        });
                        const data = _json?.item;
                        if (!data) throw new Error('INSERT sin item en la respuesta.');

                        // Insertar nueva data devuelta por DB
                        setInventory(prev =>
                            [...prev.filter(i => i.id !== oldId), data].sort((a, b) =>
                                a.ingredient_name.localeCompare(b.ingredient_name)
                            )
                        );
                        // Salió del estado "agotado" porque el usuario lo recuperó.
                        _removeDepleted(deletedItem);
                        toast.success(t('{alimento} restaurado', { alimento: deletedItem.ingredient_name }), { icon: '↩️', duration: 2000 });
                        // [P3-AUDIT-8] Revertir el delta: el item está de
                        // vuelta, la lista de compras debe excluirlo otra vez.
                        // [P2-NEW-12 · 2026-05-11] Debounced — undo masivo no
                        // genera N recalcs paralelos.
                        _scheduleRecalcShoppingList();
                    } catch (err) {
                        console.error('Error restaurando item:', err);
                        toast.error(t('No se pudo restaurar el alimento.'));
                    }
                }
            }
        });

        // [P3-AUDIT-8 · 2026-05-10] Recalcular lista tras delete individual.
        // Sin esto el Dashboard mostraría el item recién eliminado todavía
        // como "ya en nevera" en su display in-app.
        // [P2-NEW-12 · 2026-05-11] Debounced — delete masivo no genera N
        // recalcs paralelos al backend.
        _scheduleRecalcShoppingList();
    };

    const confirmDeleteAll = async () => {
        if (isDeletingAll) return;
        setIsDeletingAll(true);
        setShowDeleteConfirm(false);
        const loadingToast = toast.loading(t('Borrando todos los alimentos...'));
        try {
            // [P1-NEON-DB-MIGRATION · 2026-06-12] DELETE /api/inventory/items
            // (sin id = vaciar nevera completa) → {deleted_count}. El backend
            // filtra user_id server-side (I2) — el delete legacy confiaba en RLS.
            await _apiJson('/api/inventory/items', { method: 'DELETE' });

            setInventory([]);
            // Vaciar también la lista de "agotados" — el usuario está empezando
            // desde cero, no tiene sentido conservar recordatorios viejos.
            // [P3-DELETEALL-DEPLETED · 2026-05-30] El clear local de
            // `_persistDepleted([])` es solo cosmético: la fuente de verdad es la
            // tabla `user_depleted_items` (cross-device), que `_fetchAndApply`
            // repoblaba al próximo mount → los agotados reaparecían. Borrarlos en
            // BD vía el endpoint dedicado (best-effort: si falla, el clear local
            // al menos da feedback inmediato; el refetch on focus de otros
            // tabs/devices recoge el DELETE).
            _persistDepleted([]);
            (async () => {
                try {
                    await fetchWithAuth('/api/plans/depleted-items', { method: 'DELETE' });
                } catch (e) {
                    console.warn('[P3-DELETEALL-DEPLETED] DELETE-all depleted-items falló (clear local persiste):', e);
                }
            })();
            toast.dismiss(loadingToast);
            toast.success(t('Todos los alimentos han sido borrados'));

            // [P3-AUDIT-8 · 2026-05-10] Delega al helper SSOT. Pasa
            // `clearRestockedFlag=true` porque vaciar la nevera invalida
            // cualquier restock previo; `silentSuccess=false` muestra el
            // toast "Lista actualizada" porque vaciar todo es operación
            // mayor (vs add/delete individual que es silencioso).
            //
            // Previamente este bloque vivía inline (~50 LOC duplicadas
            // contra el helper). Refactor cierra drift y simplifica el
            // cierre del gap P3-AUDIT-8 (un solo path de recálculo).
            await _recalcShoppingListAfterPantryChange({
                silentSuccess: false,
                clearRestockedFlag: true,
            });
        } catch (error) {
            console.error("Error deleting all:", error);
            toast.dismiss(loadingToast);
            toast.error(t('Error al borrar los alimentos'));
        } finally {
            setIsDeletingAll(false);
        }
    };

    // [P3-PANTRY-ADD-UX · 2026-05-18] Acepta qty y unit explícitos para que
    // el usuario pueda registrar "1 botella de vinagre", "2 libras de pollo",
    // etc. desde el inline picker. Pre-existente flujo "+1 con default_unit"
    // sigue funcionando si el caller no pasa overrides.
    //
    // [P3-PANTRY-ADD-UX-INSERT · 2026-05-18] INSERT plano (NO upsert) + manejo
    // de duplicado. El único UNIQUE real es (user_id, ingredient_name, unit).
    // El path "+1 al existing" cliente sigue siendo el camino feliz; el
    // INSERT+409 cubre legacy rows con master_id null y races de múltiples
    // pestañas. Mismo patrón que `handleRestoreDepleted` (más abajo).
    // [P1-NEON-DB-MIGRATION · 2026-06-12] El 409 del backend reemplaza al
    // 23505 de PostgREST con la misma semántica: refetch + increment.
    const handleAddNewItem = async (masterItem, customQty = 1, customUnit = null) => {
        setIsAdding(true);
        try {
            // Si estaba marcado como agotado, sale de la lista — el usuario
            // lo está reponiendo.
            _removeDepleted({ master_ingredient_id: masterItem.id, ingredient_name: masterItem.name });

            // Sanitizar qty: numero entero positivo, clamp [1, 999].
            const safeQty = Math.max(1, Math.min(999, Math.round(Number(customQty) || 1)));

            // Para items nuevos: usa la unidad del picker si el caller la
            // pasó, sino prioriza `market_container` (curado dominicano,
            // mismo que el PDF) sobre `default_unit` (genérico).
            // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19]
            const finalUnit = (typeof customUnit === 'string' && customUnit.trim())
                ? customUnit.trim()
                : (masterItem.market_container || masterItem.default_unit || 'unidad');

            // Detección de existing en 2 fases:
            //   1) Por `master_ingredient_id` (camino canónico).
            //   2) Por `(ingredient_name, unit)` case-insensitive — captura
            //      filas legacy con master_id NULL Y casos donde el catálogo
            //      maestro fue re-importado y los IDs cambiaron pero los
            //      nombres se preservaron.
            const nameLc = (masterItem.name || '').toLowerCase();
            let existing = inventory.find(i => i.master_ingredient_id === masterItem.id);
            if (!existing) {
                existing = inventory.find(i =>
                    (i.ingredient_name || '').toLowerCase() === nameLc
                    && (i.unit || '') === finalUnit
                );
            }
            if (existing) {
                await handleUpdateQuantity(existing.id, existing.quantity + safeQty);
                toast.success(t('+{cantidad} {unidad} a {alimento}', {
                    cantidad: safeQty, unidad: existing.unit || '', alimento: masterItem.name,
                }).trim());
                _recordRecentAdd(masterItem, existing.unit || finalUnit);
                setShowAddMenu(false);
                setAddItemSearch('');
                return;
            }

            // [P1-NEON-DB-MIGRATION · 2026-06-12] POST /api/inventory/items —
            // el user_id sale del Bearer token (no viaja en el body) y la
            // respuesta {item} ya trae el embed master_ingredients.
            let data;
            try {
                const _json = await _apiJson('/api/inventory/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ingredient_name: masterItem.name,
                        master_ingredient_id: masterItem.id,
                        quantity: safeQty,
                        unit: finalUnit,
                        // [P2-NEVERA-BRANDS-MANUAL · 2026-07-07] marca elegida en el
                        // picker (null = sin marca). Solo aplica a inserts nuevos.
                        brand: pickerBrand || null,
                    }),
                });
                data = _json?.item;
            } catch (insErr) {
                // 409 = duplicado UNIQUE (user_id, ingredient_name, unit) —
                // misma semántica que el 23505 legacy. Race contra otra
                // pestaña que ya insertó. Refetch y sumamos al row existente
                // — UX consistente con click→+1.
                if (insErr?.status === 409) {
                    await fetchData(false);
                    const dup = inventoryRef.current.find(i =>
                        i.master_ingredient_id === masterItem.id
                        || ((i.ingredient_name || '').toLowerCase() === nameLc
                            && (i.unit || '') === finalUnit)
                    );
                    if (dup) {
                        await handleUpdateQuantity(dup.id, dup.quantity + safeQty);
                        toast.success(t('+{cantidad} {unidad} a {alimento}', {
                            cantidad: safeQty, unidad: dup.unit || '', alimento: masterItem.name,
                        }).trim());
                    } else {
                        toast.success(t('{alimento} ya estaba en tu nevera', { alimento: masterItem.name }), { icon: '✅' });
                    }
                    _recordRecentAdd(masterItem, (dup && dup.unit) || finalUnit);
                    setShowAddMenu(false);
                    setAddItemSearch('');
                    _scheduleRecalcShoppingList();
                    return;
                }
                throw insErr;
            }
            if (!data) throw new Error('INSERT sin item en la respuesta.');

            toast.success(t('{cantidad} {unidad} de {alimento} en la nevera', {
                cantidad: safeQty, unidad: finalUnit, alimento: masterItem.name,
            }));
            setInventory(prev => [...prev, data].sort((a,b) => a.ingredient_name.localeCompare(b.ingredient_name)));
            _recordRecentAdd(masterItem, finalUnit);
            setShowAddMenu(false);
            setAddItemSearch('');
            // [P3-AUDIT-8 · 2026-05-10] Recalcular lista tras add individual.
            // Si el ítem que se acaba de añadir estaba en la lista de
            // compras, debe desaparecer; el Dashboard refleja el cambio
            // al instante. NOTA: el path "+1 a existing" arriba (línea ~424)
            // delega a `handleUpdateQuantity` que NO recalcula — qty
            // changes no alteran el set de items y el PDF live-fetch
            // ya cubre ese caso.
            // [P2-NEW-12 · 2026-05-11] Debounced — añadir N items rápido no
            // genera N recalcs.
            _scheduleRecalcShoppingList();
        } catch (error) {
            console.error("Add Error: ", error);
            toast.error(t('Error al añadir alimento.'));
        } finally {
            setIsAdding(false);
        }
    };

    // [P3-PANTRY-RECENT-ADDS · 2026-07-07] Chips de 1-toque del estado vacío.
    // `handleRecentAdd` re-añade un item concreto (id+unit guardados) al instante;
    // si el master ya no existe en el catálogo (re-import / cambio de IDs) cae a la
    // búsqueda por nombre en vez de arriesgar un INSERT con FK inválido.
    const handleRecentAdd = (recent) => {
        if (!recent) return;
        const full = recent.id ? masterList.find(m => m.id === recent.id) : null;
        if (full) {
            handleAddNewItem(full, 1, recent.unit || full.market_container || full.default_unit || 'unidad');
        } else {
            setAddItemSearch(recent.name || '');
        }
    };

    // `handleChipAdd` resuelve una palabra staple a un master item ÚNICO y lo añade
    // directo con la unidad recomendada. Si es ambigua (varios "aceite"/"pollo") o
    // no existe, siembra la búsqueda — nunca adivina cuál item quiso el usuario.
    const handleChipAdd = (word) => {
        const q = String(word || '').toLowerCase().trim();
        if (!q) return;
        const qs = q.replace(/s$/, ''); // tolerante a plural simple (huevos → huevo)
        let hit = masterList.find(m => (m.name || '').toLowerCase() === q)
            || masterList.find(m => (m.name || '').toLowerCase() === qs);
        if (!hit) {
            const matches = masterList.filter(m =>
                (m.name || '').toLowerCase().includes(q)
                || (m.aliases && m.aliases.some(a => (a || '').toLowerCase().includes(q)))
            );
            if (matches.length === 1) hit = matches[0];
        }
        if (hit) {
            handleAddNewItem(hit, 1, hit.market_container || hit.default_unit || 'unidad');
        } else {
            setAddItemSearch(word);
        }
    };

    // Reponer un item agotado: INSERT en user_inventory con quantity=1 + remover
    // de la lista de agotados. No requiere abrir el modal de búsqueda.
    //
    // Usa INSERT (no upsert) porque el row fue eliminado físicamente al
    // marcar agotado, no debería haber conflicto. El único UNIQUE en la
    // tabla es (user_id, ingredient_name, unit) — si por race condition
    // otra pestaña re-añadió el item, el backend devuelve 409 que tratamos
    // como "ya existe, todo bien" (misma semántica que el 23505 legacy).
    const handleRestoreDepleted = async (entry) => {
        // Restaurar con la cantidad snapshot al momento de agotar (entry.quantity).
        // Entradas legacy sin quantity caen al fallback 1.
        const restoreQty = (typeof entry.quantity === 'number' && entry.quantity > 0)
            ? entry.quantity
            : 1;
        try {
            // [P1-NEON-DB-MIGRATION · 2026-06-12] POST /api/inventory/items —
            // la respuesta {item} ya trae el embed master_ingredients.
            let data;
            try {
                const _json = await _apiJson('/api/inventory/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ingredient_name: entry.ingredient_name,
                        master_ingredient_id: entry.master_ingredient_id || null,
                        quantity: restoreQty,
                        unit: entry.unit || 'unidad',
                    }),
                });
                data = _json?.item;
            } catch (insErr) {
                // 409 = el item ya existe en DB (race con otra pestaña /
                // sync remoto). Refrescamos para que aparezca y tratamos
                // como éxito.
                if (insErr?.status === 409) {
                    await fetchData(false);
                    _removeDepleted(entry);
                    toast.success(t('{alimento} ya estaba en tu nevera', { alimento: entry.ingredient_name }), { icon: '✅', duration: 2000 });
                    return;
                }
                throw insErr;
            }
            if (!data) throw new Error('INSERT sin item en la respuesta.');
            setInventory(prev => [...prev.filter(i => i.id !== data.id), data].sort((a, b) =>
                a.ingredient_name.localeCompare(b.ingredient_name)
            ));
            _removeDepleted(entry);
            toast.success(t('{alimento} repuesto ({cantidad} {unidad})', {
                alimento: entry.ingredient_name, cantidad: restoreQty, unidad: entry.unit || '',
            }).trim(), { icon: '✅', duration: 2000 });
            _scheduleRecalcShoppingList();
        } catch (err) {
            console.error('Restore depleted error:', err);
            toast.error(t('No se pudo reponer {alimento}.', { alimento: entry.ingredient_name }));
        }
    };

    // Quitar definitivamente de la lista de agotados (no toca DB porque la fila
    // ya no existe; solo limpia el marcador localStorage).
    const handleDismissDepleted = (entry) => {
        _removeDepleted(entry);
        toast(t('{alimento} removido de la lista de agotados', { alimento: entry.ingredient_name }), { duration: 2000 });
    };

    // 3. Computed Views
    const filteredInventory = useMemo(() => {
        let textMatch = inventory;
        if (deferredSearchQuery.trim()) {
            const q = deferredSearchQuery.toLowerCase();
            textMatch = textMatch.filter(i =>
                (i.ingredient_name || i.master_ingredients?.name || '').toLowerCase().includes(q)
            );
        }

        // Agrupar por Categoría del Master (con normalización de duplicados).
        // [P5-SPEED-CATEGORY-NORMALIZE-HOIST · 2026-06-01] CATEGORY_NORMALIZE izado a
        // module-scope (arriba) — ya no se re-aloca en cada keystroke de búsqueda.
        const grouped = {};
        textMatch.forEach(item => {
            let cat = item.master_ingredients?.category || "OTROS";
            cat = CATEGORY_NORMALIZE[cat] || cat; // Normalizar
            if(!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        return grouped;
    }, [inventory, deferredSearchQuery]);

    // [P3-PANTRY-FRIDGE-LAYOUT · 2026-05-19] Proyección por zona física de
    // la nevera real. Mantenemos `filteredInventory` (por categoría) para
    // empty-state check y compatibilidad; este derivado agrupa items por
    // zona (shelf_dairy, shelf_proteins, …, pantry) según CATEGORY_TO_ZONE.
    const inventoryByZone = useMemo(() => {
        const byZone = {};
        Object.entries(filteredInventory).forEach(([category, items]) => {
            const zone = getZoneForCategory(category);
            if (!byZone[zone]) byZone[zone] = [];
            // Anotamos category para mostrarla como sub-label si el usuario
            // tiene varias categorías en la misma zona (ej. Lácteos + Huevos).
            items.forEach(it => byZone[zone].push({ ...it, _zoneCategory: category }));
        });
        return byZone;
    }, [filteredInventory]);

    // [P3-PANTRY-ACTIVEKEYS-DEDUP · 2026-05-31] Set de claves del inventario
    // activo construido UNA vez (deps [inventory]) y reusado por
    // visibleDepletedItems (antes lo reconstruía inline en cada memo).
    const activeInventoryKeys = useMemo(
        () => new Set(
            inventory.map(i => i.master_ingredient_id
                ? `m:${i.master_ingredient_id}`
                : `n:${(i.ingredient_name || '').toLowerCase().trim()}`)
        ),
        [inventory],
    );

    // Items agotados visibles: excluye los que actualmente existen en
    // inventory (defensive — un INSERT externo podría dejar el item activo
    // pese a estar en la lista de agotados; preferimos verdad DB).
    const visibleDepletedItems = useMemo(() => {
        let list = depletedItems.filter(e => !activeInventoryKeys.has(_depletedKey(e)));
        if (deferredSearchQuery.trim()) {
            const q = deferredSearchQuery.toLowerCase();
            list = list.filter(e => (e.ingredient_name || '').toLowerCase().includes(q));
        }
        return list.sort((a, b) =>
            // Más recientes arriba
            (b.depleted_at || '').localeCompare(a.depleted_at || '')
        );
    }, [depletedItems, activeInventoryKeys, deferredSearchQuery]);

    const suggestedMasterItems = useMemo(() => {
        if (!addItemSearch.trim()) return [];
        const q = addItemSearch.toLowerCase();
        return masterList.filter(m => 
            m.name.toLowerCase().includes(q) || 
            (m.aliases && m.aliases.some(a => a.toLowerCase().includes(q)))
        ).slice(0, 8); // Top 8 suggestions
    }, [addItemSearch, masterList]);

    const handleKeyDown = (e) => {
        if (!suggestedMasterItems.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestedMasterItems.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const targetItem = selectedIndex >= 0
                ? suggestedMasterItems[selectedIndex]
                : suggestedMasterItems[0];
            if (!targetItem) return;
            // [P3-PANTRY-ADD-UX · 2026-05-18] 1er Enter abre el picker;
            // 2do Enter (picker ya abierto para ese item) confirma con los
            // valores actuales del picker. Permite flujo rápido teclado-only.
            if (pickerForId === targetItem.id) {
                handleAddNewItem(targetItem, pickerQty, pickerUnit);
            } else {
                setPickerForId(targetItem.id);
                setPickerQty(1);
                // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19] prioriza
                // market_container (curado) sobre default_unit (genérico).
                setPickerUnit(targetItem.market_container || targetItem.default_unit || 'unidad');
                setPickerBrand(null);
                // [P2-NEVERA-BRANDS-MANUAL] carga marcas del súper solo para items nuevos
                if (!inventory.some(i => i.master_ingredient_id === targetItem.id)) _loadBrandsForItem(targetItem);
            }
        } else if (e.key === 'Escape' && pickerForId) {
            e.preventDefault();
            setPickerForId(null);
        }
    };


    // ESTILOS INLINE Y MASONRY (Reutilizando clases de Dashboard)
    if (loading) {
        return (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ padding: '0px', paddingBottom: '100px', backgroundColor: 'transparent', minHeight: '100vh' }}
            >
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: -1000px 0; }
                        100% { background-position: 1000px 0; }
                    }
                    .skeleton {
                        background: linear-gradient(90deg, var(--border) 25%, var(--bg-muted) 50%, var(--border) 75%);
                        background-size: 1000px 100%;
                        animation: shimmer 2s infinite linear;
                        border-radius: 0.5rem;
                    }
                `}</style>
                
                {/* Skeleton Header */}
                <header style={{
                     padding: '2rem',
                     background: 'var(--bg-glass)',
                     borderBottom: '1px solid var(--border-light)',
                     marginBottom: '1.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="skeleton" style={{ width: '54px', height: '54px', borderRadius: '1rem' }} />
                            <div>
                                <div className="skeleton" style={{ width: '150px', height: '2.2rem', marginBottom: '0.4rem' }} />
                                <div className="skeleton" style={{ width: '200px', height: '1rem' }} />
                            </div>
                        </div>
                        <div className="skeleton" style={{ width: '180px', height: '45px', borderRadius: '99px' }} />
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                        <div className="skeleton" style={{ width: '100%', height: '54px', borderRadius: '1rem' }} />
                    </div>
                </header>

                <div style={{ padding: '0 1.5rem' }}>
                    {/* Skeletons para categorías */}
                    {[1, 2].map((catIndex) => (
                        <div key={`cat-${catIndex}`} style={{ marginBottom: '2rem' }}>
                            <div className="skeleton" style={{ width: '180px', height: '1.5rem', marginBottom: '1rem', borderRadius: '0.5rem' }} />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                {[1, 2, 3, 4].map((itemIndex) => (
                                    <div key={`item-${catIndex}-${itemIndex}`} style={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.2rem', padding: '1.2rem',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{ flex: 1, marginRight: '1rem' }}>
                                            <div className="skeleton" style={{ width: '80%', height: '1.2rem', marginBottom: '0.6rem' }} />
                                            <div className="skeleton" style={{ width: '40%', height: '1.5rem', borderRadius: '0.5rem' }} />
                                        </div>
                                        <div className="skeleton" style={{ width: '110px', height: '36px', borderRadius: '99px' }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        );
    }

    // [P3-PANTRY-FRIDGE-REDESIGN · 2026-06-24] Helpers de render de la lista
    // densa. `renderRow` (item activo) y `renderDepletedRow` (agotado) cablean
    // el diseño nuevo a los handlers reales (turbo hold, qty-edit, agotar,
    // borrado, reponer). El badge shelf-life y los ingredientes deshabilitados
    // se preservan tal cual.
    const fmtQty = (n) => {
        const v = Number(n) || 0;
        return Number.isInteger(v) ? String(v) : formatNumber(v, { maximumFractionDigits: 2 });
    };

    const renderRow = (item) => {
        const normalizedName = item.ingredient_name.toLowerCase().trim();
        const isDisabled = disabledIngredients.includes(normalizedName);
        // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19] Display unit prefiere
        // master_ingredients.market_container (curado) sobre item.unit.
        const displayUnit = item.master_ingredients?.market_container || item.unit;
        const cat = zoneColor(getZoneForCategory(item.master_ingredients?.category));
        // [P1-LIGHT-INK-CONTRACT] el color vivo pinta el punto; la tinta, el texto.
        const catInk = zoneInk(getZoneForCategory(item.master_ingredients?.category));
        const atFloor = item.quantity <= 1;
        const badge = getShelfLifeBadge(item, t, tn);
        const badgeStyle = badge ? getShelfLifeBadgeStyle(badge.severity) : null;
        // [P1-PANTRY-LOW-IS-A-LIE · 2026-08-09] El estado de atención de la fila
        // cuelga de la CADUCIDAD, no de la cantidad (ver la nota larga donde
        // vivía el umbral). Misma tinta ámbar; ahora responde a algo cierto.
        const needsAttention = !isDisabled && !!badge;
        return (
            <div
                key={item.id}
                className={`${fstyles.row} ${needsAttention ? fstyles.low : ''}`}
                style={{ '--cat': cat, '--cat-ink': catInk, opacity: isDisabled ? 0.5 : 1 }}
            >
                <span className={fstyles.rdot} />
                <span className={fstyles.rname} style={{ textDecoration: isDisabled ? 'line-through' : 'none' }}>
                    {item.ingredient_name}
                </span>
                <span className={fstyles.unit} title={t('Medida: {unidad}', { unidad: displayUnit })}>{displayUnit}</span>
                {/* [P2-NEVERA-BRANDS · 2026-07-06 · P1-PANTRY-DASH-PARITY 2026-07-11] Chip de
                    marca EDITABLE (paridad con el paso 21): select disfrazado de chip con las
                    marcas reales del súper (prefetch en lote). Solo aparece si hay marcas
                    disponibles o el item ya trae una. Elegir persiste la preferencia global. */}
                {(() => {
                    const _bEntry = brandCache[_normFood(item.ingredient_name)];
                    const _brands = _bEntry?.brands?.filter(b => b.brand !== 'Genérico') || [];
                    if (!_brands.length && !item.brand) return null;
                    return (
                        <BrandSelect
                            value={item.brand}
                            brands={_brands}
                            onSelect={(b) => changeItemBrand(item, b)}
                            className={item.brand && item.brand !== 'Genérico' ? fstyles.brandChip : fstyles.brandChipGeneric}
                            ariaLabel={t('Marca de {alimento}', { alimento: item.ingredient_name })}
                        />
                    );
                })()}
                {/* [P1-PANTRY-LOW-IS-A-LIE · 2026-08-09] Aquí iba un chip de stock bajo
                    disparado por el umbral ciego. Lo sustituye el chip de caducidad de
                    justo debajo, que ya se pintaba al lado: dice «Caduca en 2 días», que
                    es una afirmación verificable, en vez de una vaga que no decía ni
                    cuánto ni respecto a qué. */}
                {badge && (
                    <span
                        className={fstyles.shelf}
                        style={{ background: badgeStyle.background, color: badgeStyle.color, border: `1px solid ${badgeStyle.borderColor}` }}
                        title={tooltipCaducidad(badge.label, enModoContador)}
                    >
                        ⚠ {badge.label}
                    </span>
                )}
                {isDisabled && (
                    <span className={fstyles.disabledTag}><Trash2 size={11} /> {t('Pendiente')}</span>
                )}
                <span className={fstyles.sp} />
                <div className={fstyles.stepper}>
                    {/* "-" con piso en 1: para eliminar se usa "Agotar" (P-FIX agotar-vs-decrement). */}
                    <button
                        type="button"
                        className={fstyles.stepBtn}
                        onPointerDown={(e) => item.quantity > 1 && startHolding(e, item.id, -1)}
                        onPointerUp={(e) => stopHolding(e, item.id)}
                        onPointerLeave={(e) => stopHolding(e, item.id)}
                        onContextMenu={(e) => e.preventDefault()}
                        disabled={atFloor}
                        aria-label={atFloor ? t('Cantidad mínima — usa "Agotar" para eliminar') : t('Disminuir {alimento}', { alimento: item.ingredient_name })}
                        title={atFloor ? t('Para eliminar, usa "Agotar"') : t('Mantener presionado para bajar rápido')}
                    >
                        <Minus size={15} strokeWidth={2.5} />
                    </button>
                    <button
                        type="button"
                        className={fstyles.qty}
                        onClick={() => { setQtyEditItem(item); setQtyEditValue(item.quantity); }}
                        title={t('Tocar para ajustar a cantidad exacta')}
                        aria-label={t('Ajustar cantidad de {alimento}', { alimento: item.ingredient_name })}
                    >
                        {fmtQty(item.quantity)}
                    </button>
                    <button
                        type="button"
                        className={fstyles.stepBtn}
                        onPointerDown={(e) => startHolding(e, item.id, 1)}
                        onPointerUp={(e) => stopHolding(e, item.id)}
                        onPointerLeave={(e) => stopHolding(e, item.id)}
                        onContextMenu={(e) => e.preventDefault()}
                        aria-label={t('Aumentar {alimento}', { alimento: item.ingredient_name })}
                        title={t('Mantener presionado para subir rápido')}
                    >
                        <Plus size={15} strokeWidth={3} />
                    </button>
                </div>
                <button
                    type="button"
                    className={fstyles.agotar}
                    onClick={() => handleDeleteItem(item.id)}
                    title={t('Marcar como agotado')}
                    aria-label={t('Marcar {alimento} como agotado', { alimento: item.ingredient_name })}
                >
                    {t('Agotar')}
                </button>
                <button
                    type="button"
                    className={fstyles.del}
                    onClick={() => handleDeleteItem(item.id, { markAsDepleted: false })}
                    title={t('Eliminar definitivamente')}
                    aria-label={t('Eliminar {alimento} definitivamente', { alimento: item.ingredient_name })}
                >
                    <X size={15} strokeWidth={2.5} />
                </button>
            </div>
        );
    };

    const renderDepletedRow = (entry) => (
        <div key={_depletedKey(entry)} className={fstyles.depRow}>
            <span className={fstyles.rdot} style={{ background: 'var(--text-light)' }} />
            <span className={fstyles.depName}>{entry.ingredient_name}</span>
            <span className={fstyles.depMeta}>{t('Tenías: {cantidad} {unidad}', { cantidad: fmtQty(entry.quantity || 1), unidad: entry.unit || 'unidad' })}</span>
            <span className={fstyles.sp} />
            <button
                type="button"
                className={fstyles.reponer}
                onClick={() => handleRestoreDepleted(entry)}
                title={t('Reponer este alimento')}
            >
                <RotateCcw size={14} strokeWidth={2.5} /> {t('Reponer')}
            </button>
            <button
                type="button"
                className={fstyles.dismiss}
                onClick={() => handleDismissDepleted(entry)}
                title={t('Quitar de agotados')}
                aria-label={t('Quitar {alimento} de agotados', { alimento: entry.ingredient_name })}
            >
                <X size={14} strokeWidth={2.5} />
            </button>
        </div>
    );

    // Tarjeta compacta para el layout móvil dedicado (mismos handlers).
    const renderMobileCard = (item) => {
        const normalizedName = item.ingredient_name.toLowerCase().trim();
        const isDisabled = disabledIngredients.includes(normalizedName);
        const displayUnit = item.master_ingredients?.market_container || item.unit;
        const cat = zoneColor(getZoneForCategory(item.master_ingredients?.category));
        // [P1-LIGHT-INK-CONTRACT] el color vivo pinta el punto; la tinta, el texto.
        const catInk = zoneInk(getZoneForCategory(item.master_ingredients?.category));
        const atFloor = item.quantity <= 1;
        const badge = getShelfLifeBadge(item, t, tn);
        const badgeStyle = badge ? getShelfLifeBadgeStyle(badge.severity) : null;
        // [P1-PANTRY-LOW-IS-A-LIE · 2026-08-09] El estado de atención de la fila
        // cuelga de la CADUCIDAD, no de la cantidad (ver la nota larga donde
        // vivía el umbral). Misma tinta ámbar; ahora responde a algo cierto.
        const needsAttention = !isDisabled && !!badge;
        return (
            <div
                key={item.id}
                className={`${mstyles.item} ${needsAttention ? mstyles.low : ''}`}
                style={{ '--cat': cat, '--cat-ink': catInk, opacity: isDisabled ? 0.5 : 1 }}
            >
                <div className={mstyles.itop}>
                    <span className={mstyles.iname} style={{ textDecoration: isDisabled ? 'line-through' : 'none' }}>
                        {item.ingredient_name}
                    </span>
                    <button
                        type="button"
                        className={mstyles.del}
                        onClick={() => handleDeleteItem(item.id, { markAsDepleted: false })}
                        title={t('Eliminar definitivamente')}
                        aria-label={t('Eliminar {alimento} definitivamente', { alimento: item.ingredient_name })}
                    >
                        <X size={14} strokeWidth={2.5} />
                    </button>
                </div>
                <div className={mstyles.imeta}>
                    <span className={mstyles.unit}>{displayUnit}</span>
                    {/* [P2-NEVERA-BRANDS · P1-PANTRY-DASH-PARITY] chip de marca EDITABLE —
                        espejo del renderRow desktop (select disfrazado de chip). */}
                    {(() => {
                        const _bEntry = brandCache[_normFood(item.ingredient_name)];
                        const _brands = _bEntry?.brands?.filter(b => b.brand !== 'Genérico') || [];
                        if (!_brands.length && !item.brand) return null;
                        return (
                            <BrandSelect
                                value={item.brand}
                                brands={_brands}
                                onSelect={(b) => changeItemBrand(item, b)}
                                className={item.brand && item.brand !== 'Genérico' ? mstyles.brandChip : mstyles.brandChipGeneric}
                                ariaLabel={t('Marca de {alimento}', { alimento: item.ingredient_name })}
                            />
                        );
                    })()}
                    {/* [P1-PANTRY-LOW-IS-A-LIE · 2026-08-09] Ídem que en la fila de
                        escritorio: el chip vago de stock lo sustituye el de caducidad. */}
                    {badge && (
                        <span
                            className={mstyles.shelf}
                            style={{ background: badgeStyle.background, color: badgeStyle.color, border: `1px solid ${badgeStyle.borderColor}` }}
                            title={tooltipCaducidad(badge.label, enModoContador)}
                        >
                            ⚠ {badge.label}
                        </span>
                    )}
                    {isDisabled && (
                        <span className={mstyles.disabledTag}><Trash2 size={11} /> {t('Pendiente')}</span>
                    )}
                </div>
                <div className={mstyles.irow}>
                    <div className={mstyles.stepper}>
                        <button
                            type="button"
                            className={mstyles.stepBtn}
                            onPointerDown={(e) => item.quantity > 1 && startHolding(e, item.id, -1)}
                            onPointerUp={(e) => stopHolding(e, item.id)}
                            onPointerLeave={(e) => stopHolding(e, item.id)}
                            onContextMenu={(e) => e.preventDefault()}
                            disabled={atFloor}
                            aria-label={atFloor ? t('Cantidad mínima — usa "Agotar" para eliminar') : t('Disminuir {alimento}', { alimento: item.ingredient_name })}
                            title={atFloor ? t('Para eliminar, usa "Agotar"') : t('Mantener presionado para bajar rápido')}
                        >
                            <Minus size={15} strokeWidth={2.5} />
                        </button>
                        <button
                            type="button"
                            className={mstyles.qty}
                            onClick={() => { setQtyEditItem(item); setQtyEditValue(item.quantity); }}
                            title={t('Tocar para ajustar a cantidad exacta')}
                            aria-label={t('Ajustar cantidad de {alimento}', { alimento: item.ingredient_name })}
                        >
                            {fmtQty(item.quantity)}
                        </button>
                        <button
                            type="button"
                            className={mstyles.stepBtn}
                            onPointerDown={(e) => startHolding(e, item.id, 1)}
                            onPointerUp={(e) => stopHolding(e, item.id)}
                            onPointerLeave={(e) => stopHolding(e, item.id)}
                            onContextMenu={(e) => e.preventDefault()}
                            aria-label={t('Aumentar {alimento}', { alimento: item.ingredient_name })}
                            title={t('Mantener presionado para subir rápido')}
                        >
                            <Plus size={15} strokeWidth={3} />
                        </button>
                    </div>
                    <button
                        type="button"
                        className={mstyles.agotar}
                        onClick={() => handleDeleteItem(item.id)}
                        title={t('Marcar como agotado')}
                        aria-label={t('Marcar {alimento} como agotado', { alimento: item.ingredient_name })}
                    >
                        {t('Agotar')}
                    </button>
                </div>
            </div>
        );
    };

    const renderMobileDepleted = (entry) => (
        <div key={_depletedKey(entry)} className={mstyles.depItem}>
            <span className={mstyles.depName}>{entry.ingredient_name}</span>
            <span className={mstyles.depMeta}>{t('Tenías: {cantidad} {unidad}', { cantidad: fmtQty(entry.quantity || 1), unidad: entry.unit || 'unidad' })}</span>
            <button
                type="button"
                className={mstyles.reponer}
                onClick={() => handleRestoreDepleted(entry)}
                title={t('Reponer este alimento')}
            >
                <RotateCcw size={14} strokeWidth={2.5} /> {t('Reponer')}
            </button>
            <button
                type="button"
                className={mstyles.dismiss}
                onClick={() => handleDismissDepleted(entry)}
                title={t('Quitar de agotados')}
                aria-label={t('Quitar {alimento} de agotados', { alimento: entry.ingredient_name })}
            >
                <X size={14} strokeWidth={2.5} />
            </button>
        </div>
    );

    // Derivados de presentación del mueble activo (Nevera/Alacena).
    const zoneDefsForTemp = getZoneDefinitions().filter((z) => tempOfZone(z) === tempZone);
    const tempZoneCount = zoneDefsForTemp.reduce((acc, z) => acc + (inventoryByZone[z.key]?.length || 0), 0);
    // [P1-PANTRY-LOW-IS-A-LIE · 2026-08-09] Contaba filas con `quantity <= 0.5`
    // y lo rotulaba «N por reponer». Es el número que acusó al owner de tener
    // poco stock justo después de importar la lista de compras — o sea, con la
    // nevera conteniendo EXACTAMENTE lo que el plan pide. Ahora cuenta lo que la
    // página puede afirmar de verdad: lo que se va a echar a perder.
    // `getShelfLifeBadge` sobre estos objetos funciona porque `inventoryByZone`
    // los construye con spread (conserva `created_at` y `master_ingredients`).
    const needsAttentionInTempZone = zoneDefsForTemp.reduce(
        (acc, z) => acc + (inventoryByZone[z.key] || []).filter((it) => !!getShelfLifeBadge(it)).length,
        0,
    );
    // Si el filtro de categoría no pertenece al mueble activo, cae a 'todos'.
    const effFilter = (catFilter !== 'todos' && !zoneDefsForTemp.some((z) => z.key === catFilter)) ? 'todos' : catFilter;
    const visibleZones = (effFilter === 'todos' ? zoneDefsForTemp : zoneDefsForTemp.filter((z) => z.key === effFilter))
        .map((z) => ({ z, list: inventoryByZone[z.key] || [] }))
        .filter((g) => g.list.length > 0);
    // Agotados del mueble activo (por la categoría guardada al agotar).
    const depletedForTemp = visibleDepletedItems.filter(
        (e) => tempOfZone(ZONE_DEFINITIONS.find((z) => z.key === getZoneForCategory(e.category))) === tempZone,
    );

    // [P3-PANTRY-FRIDGE-REDESIGN · 2026-06-24] Shell móvil dedicado (topbar
    // apilado + zonas + chips + tarjeta por alimento). Usa los MISMOS
    // derivados y handlers que el desktop; solo cambia la composición visual.
    const renderMobileShell = () => (
        <section className={mstyles.app} aria-label={t('Inventario de alimentos')}>
            {/* [P3-PANTRY-NO-TITLE · 2026-07-12] "Mi Cocina" eliminado a pedido del
                owner (sin sinónimo de reemplazo). Queda el conteo como status chip;
                el aria-label pasa a descriptor funcional (solo lector de pantalla). */}
            <div className={mstyles.top}>
                <div className={mstyles.toprow}>
                    <span className={mstyles.count}><b>{inventory.length}</b> {tn(inventory.length, 'alimento', 'alimentos')}</span>
                </div>
                <div className={mstyles.search}>
                    <Search size={17} />
                    <input
                        type="search"
                        placeholder={t('Buscar ingrediente…')}
                        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                        inputMode="search" enterKeyHint="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className={mstyles.actions}>
                    <button type="button" className={`${mstyles.btn} ${mstyles.clear}`} onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 size={16} />{t('Borrar todos')}
                    </button>
                    <button type="button" className={`${mstyles.btn} ${mstyles.add}`} onClick={() => { setShowAddMenu(true); setAddItemSearch(''); }}>
                        <Plus size={16} />{t('Añadir alimento')}
                    </button>
                </div>
                {/* [P1-PANTRY-DASH-PARITY] Escaner por foto — integrado al topbar movil.
                    [P1-PANTRY-SCAN-MOBILE-ONLY · 2026-07-28] SIN <div> wrapper: cuando el
                    gate de capacidad interno de PantryScanButton oculta la tarjeta
                    (desktop), un wrapper externo quedaría vacío-pero-presente con su
                    propio margen — hueco fantasma. El margen viaja con el componente vía
                    `style` (mismo <div> raíz que retorna null si está oculto). El flag
                    backend (`photo_scan_enabled`) ahora vive en `enabled`, igual que en
                    QPantryBuilder.jsx — un solo mecanismo de gate, no dos. */}
                <PantryScanButton
                    enabled={!!pantryStatus?.photo_scan_enabled}
                    style={{ marginTop: '0.6rem' }}
                    inventory={inventory}
                    onInventoryChanged={() => { invalidateInventoryCache(); fetchData(false); }}
                />
            </div>

            <div className={mstyles.bar}>
                <div className={mstyles.zones} role="tablist" aria-label={t('Mueble')}>
                    {getTempZones().map((z) => (
                        <button
                            key={z.id}
                            type="button"
                            role="tab"
                            aria-selected={tempZone === z.id}
                            className={mstyles.zone}
                            onClick={() => { setTempZone(z.id); setCatFilter('todos'); }}
                        >
                            {z.id === 'frio' ? <Snowflake size={15} /> : <Package size={15} />} {z.label}
                        </button>
                    ))}
                </div>
                {tempZone === 'frio' && (
                    <span className={mstyles.temp}><Snowflake size={15} />{t('3°C · Frío Max')} <span className={mstyles.dot} /></span>
                )}
            </div>

            <div className={mstyles.chips}>
                <button type="button" className={mstyles.fchip} aria-pressed={effFilter === 'todos'} onClick={() => setCatFilter('todos')}>
                    {t('Todos')} <b>{tempZoneCount}</b>
                </button>
                {zoneDefsForTemp.map((z) => {
                    const n = inventoryByZone[z.key]?.length || 0;
                    if (n === 0) return null;
                    return (
                        <button
                            key={z.key}
                            type="button"
                            className={mstyles.fchip}
                            aria-pressed={effFilter === z.key}
                            style={{ '--cat': zoneColor(z.key), '--cat-ink': zoneInk(z.key) }}
                            onClick={() => setCatFilter(z.key)}
                        >
                            <span className={mstyles.cdot} />{z.label} <b>{n}</b>
                        </button>
                    );
                })}
            </div>

            {pantryStatus?.is_below && (
                <div role="status" className={mstyles.lowBanner}>
                    <PackageX size={18} strokeWidth={2.5} />
                    <span>
                        {textoNeveraBaja(pantryStatus, enModoContador)}
                    </span>
                </div>
            )}

            <div className={mstyles.body}>
                {visibleZones.length === 0 && depletedForTemp.length === 0 && (
                    <div className={mstyles.empty}>
                        {searchQuery.trim() ? (
                            <>{t('No hay alimentos que coincidan con “{consulta}”.', { consulta: searchQuery.trim() })}</>
                        ) : tempZone === 'frio' ? (
                            <><b>{t('Tu nevera está vacía')}</b>{t('Añade tus ingredientes con el botón “Añadir alimento”.')}</>
                        ) : (
                            <><b>{t('Tu alacena está vacía')}</b>{t('Arroz, granos, especias y conservas viven aquí.')}</>
                        )}
                    </div>
                )}

                {visibleZones.map(({ z, list }) => {
                    const Icon = z.icon;
                    return (
                        <div key={z.key} className={mstyles.cat} style={{ '--cat': zoneColor(z.key), '--cat-ink': zoneInk(z.key) }}>
                            <h2 className={mstyles.cathead}>
                                <span className={mstyles.catico}><Icon size={15} /></span>
                                <span className={mstyles.catname}>{z.label}</span>
                                <span className={mstyles.catn}>{list.length}</span>
                            </h2>
                            <div className={mstyles.grid}>
                                {list.map(renderMobileCard)}
                            </div>
                        </div>
                    );
                })}

                {depletedForTemp.length > 0 && (
                    <div className={mstyles.depleted}>
                        <div className={mstyles.depHead}>
                            <PackageX size={16} strokeWidth={2.25} /> {t('Agotados')}
                            <span className={mstyles.depCount}>{depletedForTemp.length}</span>
                        </div>
                        <p className={mstyles.depSub}>{t('Ya no los tienes. Toca')} <strong>{t('Reponer')}</strong> {t('cuando vuelvas a comprarlos.')}</p>
                        {depletedForTemp.map(renderMobileDepleted)}
                    </div>
                )}
            </div>
        </section>
    );

    return (
        <div className={fstyles.page}>
            {isMobileLayout ? renderMobileShell() : (
            <section className={fstyles.app} aria-label={t('Inventario de alimentos')}>
                <div className={fstyles.shell}>
                    {/* ===== Sidebar (escritorio) ===== */}
                    <aside className={fstyles.side}>
                        {/* [P3-PANTRY-NO-TITLE · 2026-07-12] "Mi Cocina" eliminado a
                            pedido del owner (sin sinónimo). El bloque pasa a ser un
                            stat: conteo total prominente + etiqueta. */}
                        <div className={fstyles.brand}>
                            <b>{inventory.length}</b>
                            <small>{tn(inventory.length, 'alimento', 'alimentos')}</small>
                        </div>

                        <div className={fstyles.zones} role="tablist" aria-label={t('Mueble')}>
                            {getTempZones().map((z) => (
                                <button
                                    key={z.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tempZone === z.id}
                                    className={fstyles.zone}
                                    onClick={() => { setTempZone(z.id); setCatFilter('todos'); }}
                                >
                                    {z.id === 'frio' ? <Snowflake size={14} /> : <Package size={14} />} {z.label}
                                </button>
                            ))}
                        </div>

                        {/* [P1-PANTRY-TEMP-IS-INFO · 2026-08-14] La temperatura describe el
                            MUEBLE seleccionado, así que cuelga de su interruptor y no de la
                            fila de acciones, donde era lo único que no hacía nada al
                            pulsarlo (y donde parecía un botón, que fue el reporte). Por eso
                            mismo sigue apareciendo solo con la nevera: la alacena no tiene
                            temperatura que declarar. */}
                        {tempZone === 'frio' && (
                            <span className={fstyles.temp}>
                                <Snowflake size={13} /> {t('3°C · Frío Max')} <span className={fstyles.dot} />
                            </span>
                        )}

                        <nav className={fstyles.nav} aria-label={t('Categorías')}>
                            <button
                                type="button"
                                className={fstyles.navitem}
                                aria-current={effFilter === 'todos'}
                                onClick={() => setCatFilter('todos')}
                            >
                                <span className={fstyles.navico}><GridGlyph size={16} /></span>
                                <span className={fstyles.navlabel}>{t('Todos')}</span>
                                <span className={fstyles.navn}>{tempZoneCount}</span>
                            </button>
                            {zoneDefsForTemp.map((z) => {
                                const n = inventoryByZone[z.key]?.length || 0;
                                if (n === 0) return null;
                                const Icon = z.icon;
                                return (
                                    <button
                                        key={z.key}
                                        type="button"
                                        className={fstyles.navitem}
                                        aria-current={effFilter === z.key}
                                        style={{ '--cat': zoneColor(z.key), '--cat-ink': zoneInk(z.key) }}
                                        onClick={() => setCatFilter(z.key)}
                                    >
                                        <span className={fstyles.navico}><Icon size={16} /></span>
                                        <span className={fstyles.navlabel}>{z.label}</span>
                                        <span className={fstyles.navn}>{n}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        {/* [P1-PANTRY-LOW-IS-A-LIE · 2026-08-09] Decía «N por reponer /
                            Tienes poco stock» contando cantidades bajo un umbral ciego a
                            la unidad. Ahora nombra lo que cuenta de verdad: caducidad.
                            El caso "todo bien" también cambia de frase — «sin faltantes»
                            afirmaba cobertura del plan, que esta página no calcula. */}
                        <div className={`${fstyles.lowbox} ${needsAttentionInTempZone ? '' : fstyles.none}`}>
                            <span className={fstyles.lowico}>
                                {needsAttentionInTempZone ? <AlertCircle size={16} /> : <CheckGlyph size={16} />}
                            </span>
                            <span className={fstyles.lowtxt}>
                                <b>{needsAttentionInTempZone ? t('{n} por consumir', { n: needsAttentionInTempZone }) : t('Nada por vencer')}</b>
                                {needsAttentionInTempZone ? t('Caducan pronto') : t('Sin caducidades próximas')}
                            </span>
                        </div>
                    </aside>

                    {/* ===== Principal ===== */}
                    <div className={fstyles.main}>
                        <div className={fstyles.head}>
                            <div className={fstyles.mobtitle}>
                                <FridgeGlyph size={20} />{tempZone === 'frio' ? t('Nevera') : t('Alacena')}
                                <span className={fstyles.c}>{tempZoneCount}</span>
                            </div>
                            <div className={fstyles.search}>
                                <Search size={17} />
                                <input
                                    type="search"
                                    placeholder={t('Buscar ingrediente…')}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    inputMode="search"
                                    enterKeyHint="search"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <button
                                type="button"
                                className={`${fstyles.btn} ${fstyles.clear} ${fstyles.iconbtn}`}
                                title={t('Vaciar la nevera')}
                                aria-label={t('Vaciar la nevera')}
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                <Trash2 size={16} />
                            </button>
                            {/* [P1-PANTRY-SCAN-TOOLBAR · 2026-08-14] El escáner, aquí y
                                no en una tarjeta suelta debajo: escanear y añadir son la
                                MISMA tarea por dos caminos (meter comida en la nevera,
                                con foto o a mano), así que van seguidos y al final de la
                                barra. En `compact` su wrapper es `display: contents`, de
                                modo que el botón es hijo directo de este flex. */}
                            <PantryScanButton
                                compact
                                enabled={!!pantryStatus?.photo_scan_enabled}
                                inventory={inventory}
                                onInventoryChanged={() => { invalidateInventoryCache(); fetchData(false); }}
                            />
                            <button
                                type="button"
                                className={`${fstyles.btn} ${fstyles.add}`}
                                onClick={() => { setShowAddMenu(true); setAddItemSearch(''); }}
                            >
                                <Plus size={16} /> {t('Añadir')}
                            </button>
                        </div>

                        {/* Chips de categoría (solo móvil) */}
                        <div className={fstyles.chips}>
                            <button
                                type="button"
                                className={fstyles.fchip}
                                aria-pressed={effFilter === 'todos'}
                                onClick={() => setCatFilter('todos')}
                            >
                                {t('Todos')}
                            </button>
                            {zoneDefsForTemp.map((z) => {
                                const n = inventoryByZone[z.key]?.length || 0;
                                if (n === 0) return null;
                                return (
                                    <button
                                        key={z.key}
                                        type="button"
                                        className={fstyles.fchip}
                                        aria-pressed={effFilter === z.key}
                                        style={{ '--cat': zoneColor(z.key), '--cat-ink': zoneInk(z.key) }}
                                        onClick={() => setCatFilter(z.key)}
                                    >
                                        <span className={fstyles.cdot} /> {z.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Banner: nevera baja (server-driven, no bloquea) */}
                        {pantryStatus?.is_below && (
                            <div role="status" className={fstyles.lowBanner}>
                                <PackageX size={18} strokeWidth={2.5} />
                                <span>
                                    {textoNeveraBaja(pantryStatus, enModoContador)}
                                </span>
                            </div>
                        )}

                        {/* [P1-PANTRY-RECONCILIATION · 2026-08-07] Banner que PREGUNTA.
                            Va después del de "nevera baja" a propósito: ese informa,
                            este pide una acción, y lo accionable debe quedar más
                            cerca de la lista sobre la que se actúa. */}
                        {reconcileItems.length > 0 && (
                            <div role="status" className={fstyles.reconcileBanner}>
                                <div className={fstyles.reconcileHead}>
                                    <AlertCircle size={18} strokeWidth={2.5} />
                                    <span>
                                        {tn(
                                            reconcileItems.length,
                                            'Este alimento lleva tiempo sin moverse. ¿Qué pasó con él?',
                                            'Estos {n} alimentos llevan tiempo sin moverse. ¿Qué pasó con ellos?',
                                            { n: reconcileItems.length },
                                        )}
                                    </span>
                                </div>
                                {reconcileItems.map((it) => (
                                    <div key={it.id} className={fstyles.reconcileRow}>
                                        <span className={fstyles.reconcileName}>
                                            {it.ingredient_name}
                                            <em> · {tn(it.days_quiet, '{n} día', '{n} días', { n: it.days_quiet })}</em>
                                        </span>
                                        <div className={fstyles.reconcileActions}>
                                            <button
                                                onClick={() => handleReconcile(it, 'used')}
                                                disabled={reconcileBusyId !== null}
                                                aria-label={t('Ya usé {alimento}', { alimento: it.ingredient_name })}
                                            >
                                                {t('Lo usé')}
                                            </button>
                                            <button
                                                onClick={() => handleReconcile(it, 'spoiled')}
                                                disabled={reconcileBusyId !== null}
                                                aria-label={t('{alimento} se dañó', { alimento: it.ingredient_name })}
                                            >
                                                {t('Se dañó')}
                                            </button>
                                            <button
                                                onClick={() => handleReconcile(it, 'keep')}
                                                disabled={reconcileBusyId !== null}
                                                aria-label={t('{alimento} sigue en la nevera', { alimento: it.ingredient_name })}
                                            >
                                                {t('Sigue ahí')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Lista agrupada por categoría del mueble activo */}
                        <div className={fstyles.list}>
                            {visibleZones.length === 0 && depletedForTemp.length === 0 && (
                                <div className={fstyles.empty}>
                                    {searchQuery.trim() ? (
                                        <>{t('No hay alimentos que coincidan con “{consulta}”.', { consulta: searchQuery.trim() })}</>
                                    ) : tempZone === 'frio' ? (
                                        <><b>{t('Tu nevera está vacía')}</b>{t('Registra tus compras recientes o añade tus primeros ingredientes con el botón “Añadir”.')}</>
                                    ) : (
                                        <><b>{t('Tu alacena está vacía')}</b>{t('Arroz, granos, especias y conservas viven aquí. Añádelos con el botón “Añadir”.')}</>
                                    )}
                                </div>
                            )}

                            {visibleZones.map(({ z, list }) => (
                                <div key={z.key} className={fstyles.group} style={{ '--cat': zoneColor(z.key), '--cat-ink': zoneInk(z.key) }}>
                                    {effFilter === 'todos' && (
                                        <div className={fstyles.gh}>{z.label}<span className={fstyles.ln} />{list.length}</div>
                                    )}
                                    {list.map(renderRow)}
                                </div>
                            ))}

                            {depletedForTemp.length > 0 && (
                                <div className={fstyles.depleted}>
                                    <div className={fstyles.depHead}>
                                        <PackageX size={16} strokeWidth={2.25} /> {t('Agotados')}
                                        <span className={fstyles.depCount}>{depletedForTemp.length}</span>
                                    </div>
                                    <p className={fstyles.depSub}>
                                        {t('Ya no los tienes. Toca')} <strong>{t('Reponer')}</strong> {t('cuando vuelvas a comprarlos.')}
                                    </p>
                                    {depletedForTemp.map(renderDepletedRow)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
            )}

            {/* Modal "Nuevo Alimento" — [P3-PANTRY-ADD-RESPONSIVE · 2026-07-07]
                Bottom-sheet en móvil (con inset de teclado, P3-PANTRY-ADD-MOBILE);
                diálogo centrado y acotado en desktop (antes el sheet se estiraba a
                todo el ancho → barra gigante + vacío enorme, poco profesional). */}
            <AnimatePresence>
                {showAddMenu && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => { setShowAddMenu(false); setAddItemSearch(''); }}
                            style={{ position: 'fixed', inset: 0, background: 'var(--bg-glass)', backdropFilter: 'blur(6px)', zIndex: 100 }}
                        />
                        <motion.div
                            ref={addMenuModalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="pantry-add-title"
                            tabIndex={-1}
                            initial={isMobileLayout
                                ? { y: '100%' }
                                : { opacity: 0, scale: 0.94, x: '-50%', y: '-50%' }}
                            animate={isMobileLayout
                                ? { y: 0 }
                                : { opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                            exit={isMobileLayout
                                ? { y: '100%' }
                                : { opacity: 0, scale: 0.94, x: '-50%', y: '-50%' }}
                            transition={isMobileLayout
                                ? { type: 'spring', damping: 25, stiffness: 200 }
                                : { type: 'spring', damping: 24, stiffness: 240 }}
                            style={isMobileLayout ? {
                                position: 'fixed', bottom: kbInset, left: 0, right: 0, background: 'var(--bg-card)',
                                // [P3-PANTRY-ADD-MOBILE · 2026-06-19] padding responsive (menos en móvil =
                                // más espacio útil) + alto adaptado al viewport visible (sobre el teclado).
                                borderRadius: '1.75rem 1.75rem 0 0',
                                padding: 'clamp(1.1rem, 4.5vw, 2rem)',
                                paddingTop: 'clamp(0.85rem, 3vw, 1.4rem)',
                                zIndex: 101,
                                boxShadow: '0 -12px 44px rgba(0,0,0,0.22)',
                                // [P1-PANTRY-SHEET-NOTCH · 2026-08-22] Con teclado, el alto era el viewport
                                // visible ENTERO menos 10 px: la hoja subía hasta debajo del reloj (iPhone,
                                // medido). Se descuenta la barra de estado y un respiro.
                                maxHeight: kbInset > 0
                                    ? `calc(${Math.max(300, vvHeight - 10)}px - env(safe-area-inset-top, 0px) - 12px)`
                                    : `${Math.round(vvHeight * 0.9)}px`,
                                display: 'flex', flexDirection: 'column',
                            } : {
                                // Desktop: diálogo centrado, ancho acotado, alto al contenido
                                // (hasta un tope) → sin vacío muerto cuando hay pocos resultados.
                                position: 'fixed', top: '50%', left: '50%', background: 'var(--bg-card)',
                                width: '92%', maxWidth: '580px',
                                borderRadius: '1.5rem',
                                padding: '1.6rem 1.6rem 0.6rem',
                                zIndex: 101,
                                border: '1px solid var(--border)',
                                boxShadow: '0 24px 60px -12px rgba(0,0,0,0.45)',
                                maxHeight: 'min(84vh, 660px)',
                                display: 'flex', flexDirection: 'column',
                            }}
                        >
                            {isMobileLayout && (
                                <div style={{ width: '40px', height: '5px', background: 'var(--border)', borderRadius: '10px', margin: '0 auto clamp(0.7rem, 2.5vw, 1.4rem)', opacity: 0.8 }} />
                            )}

                            <h2 id="pantry-add-title" style={{ fontSize: isMobileLayout ? 'clamp(1.3rem, 5vw, 1.5rem)' : '1.4rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{t('Añade a tu Nevera')}</h2>
                            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0', lineHeight: 1.4 }}>
                                {t('Busca el alimento, ajusta la cantidad y elige cómo viene (botella, libra, paquete…).')}
                            </p>

                            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                                <SearchIcon color="var(--text-light)" size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    autoFocus
                                    type="text"
                                    /* [P3-PANTRY-ADD-MOBILE · 2026-06-19] Teclado de búsqueda + sin
                                       autocorrección/mayúsculas (nombres de alimentos). fontSize ≥16px
                                       evita el auto-zoom de iOS al enfocar. */
                                    inputMode="search"
                                    enterKeyHint="search"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    placeholder={t('¿Qué vas a añadir? (ej: vinagre, aceite, pollo)')}
                                    value={addItemSearch}
                                    onChange={e => setAddItemSearch(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    style={{
                                        width: '100%', padding: '1.05rem 1rem 1.05rem 3rem', borderRadius: '1rem', border: '2px solid var(--border)',
                                        outline: 'none', fontSize: '1.05rem', fontWeight: 500, background: 'var(--bg-page)', color: 'var(--text-main)'
                                    }}
                                />
                            </div>

                            {/* Resultados de búsqueda (Scrollable). [P3-PANTRY-ADD-MOBILE · 2026-06-19]
                                Quitamos el hint persistente "si no aparece, prueba otro nombre" (comía
                                espacio en móvil); ya lo cubre el estado "No encontramos X" de abajo.
                                paddingBottom respeta el safe-area (notch); scroll con inercia iOS y sin
                                chaining a la página de atrás. */}
                            <div style={{
                                overflowY: 'auto', flex: 1, marginTop: '0.5rem',
                                paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
                                WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
                            }}>
                                {suggestedMasterItems.map((item, index) => {
                                    const isPickerOpen = pickerForId === item.id;
                                    const existing = inventory.find(i => i.master_ingredient_id === item.id);
                                    // [P2-NEVERA-BRANDS-MANUAL] marcas del súper para este item (solo si nuevo).
                                    const brandInfo = (isPickerOpen && !existing) ? brandCache[_normFood(item.name)] : null;
                                    return (
                                    <div
                                        key={item.id}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                        style={{
                                            borderBottom: '1px solid var(--bg-muted)',
                                            backgroundColor: isPickerOpen
                                                ? 'var(--bg-page)'
                                                : (index === selectedIndex ? 'var(--bg-muted)' : 'transparent'),
                                            borderRadius: isPickerOpen ? '1rem' : (index === selectedIndex ? '0.5rem' : '0'),
                                            transition: 'background-color 0.2s',
                                            marginBottom: isPickerOpen ? '0.5rem' : 0,
                                        }}
                                    >
                                        <div
                                            onClick={() => {
                                                if (isPickerOpen) {
                                                    setPickerForId(null);
                                                    setPickerBrand(null);
                                                } else {
                                                    setPickerForId(item.id);
                                                    setPickerQty(1);
                                                    // [P3-PANTRY-MARKET-CONTAINER · 2026-05-19]
                                                    setPickerUnit(item.market_container || item.default_unit || 'unidad');
                                                    setPickerBrand(null);
                                                    // [P2-NEVERA-BRANDS-MANUAL] carga marcas del súper solo para items nuevos
                                                    if (!existing) _loadBrandsForItem(item);
                                                }
                                            }}
                                            style={{
                                                padding: '1rem', display: 'flex',
                                                justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>{item.name}</h4>
                                                {existing ? (
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginTop: '0.2rem', display: 'block', fontWeight: 600 }}>
                                                        {t('Ya tienes {cantidad} {unidad} · sumará a tu existente', { cantidad: existing.quantity, unidad: existing.unit })}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.2rem', display: 'block' }}>
                                                        {t('Alias incl.:')} {item.aliases?.slice(0, 3).join(', ')}{item.aliases?.length > 3 ? '...' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                disabled={isAdding}
                                                style={{
                                                    background: isPickerOpen
                                                        ? 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)'
                                                        : 'var(--bg-muted)',
                                                    color: isPickerOpen ? 'white' : 'var(--secondary)',
                                                    border: isPickerOpen ? 'none' : '1px solid var(--border)',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '99px', fontWeight: 700, cursor: 'pointer',
                                                    boxShadow: isPickerOpen ? '0 4px 12px -2px rgba(14, 165, 233, 0.45)' : 'none',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {isPickerOpen ? t('Cerrar') : t('Elegir')}
                                            </button>
                                        </div>

                                        <AnimatePresence initial={false}>
                                            {isPickerOpen && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    style={{ overflow: 'hidden' }}
                                                >
                                                    <div style={{ padding: '0 1rem 1.25rem 1rem' }}>
                                                        {/* Counter de cantidad */}
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('Cantidad')}</span>
                                                            <div style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '0.75rem',
                                                                background: 'var(--bg-card)', borderRadius: '99px', padding: '0.35rem',
                                                                border: '1px solid var(--border)',
                                                            }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPickerQty(q => Math.max(1, q - 1))}
                                                                    disabled={pickerQty <= 1}
                                                                    style={{
                                                                        border: 'none', background: 'none', padding: '0.5rem',
                                                                        color: pickerQty <= 1 ? 'var(--border)' : 'var(--text-muted)',
                                                                        cursor: pickerQty <= 1 ? 'not-allowed' : 'pointer',
                                                                        touchAction: 'manipulation',
                                                                    }}
                                                                    aria-label={t('Disminuir cantidad')}
                                                                >
                                                                    <Minus size={18} strokeWidth={2.5} />
                                                                </button>
                                                                <span style={{
                                                                    minWidth: '2.5rem', textAlign: 'center', fontSize: '1.15rem',
                                                                    fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums',
                                                                }}>
                                                                    {pickerQty}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPickerQty(q => Math.min(999, q + 1))}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                                                        color: 'white', borderRadius: '99px', padding: '0.5rem',
                                                                        cursor: 'pointer', touchAction: 'manipulation',
                                                                        boxShadow: '0 4px 12px -2px rgba(14, 165, 233, 0.45)',
                                                                    }}
                                                                    aria-label={t('Aumentar cantidad')}
                                                                >
                                                                    <Plus size={18} strokeWidth={3} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Pills de unidades */}
                                                        {existing ? (
                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem 0', fontStyle: 'italic' }}>
                                                                {t('Se sumará usando la unidad actual ({unidad}).', { unidad: existing.unit })}
                                                            </p>
                                                        ) : (
                                                            <>
                                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>
                                                                    {t('¿Cómo viene?')}
                                                                </div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                                                                    {/* Unión de market_container + default_unit + COMMON. Preserva
                                                                        la unidad recomendada del catálogo (ej. "diente" para ajo)
                                                                        y prioriza el `market_container` curado (ej. "cartón"
                                                                        para leche) — [P3-PANTRY-MARKET-CONTAINER · 2026-05-19]. */}
                                                                    {Array.from(new Set([
                                                                        item.market_container || item.default_unit || 'unidad',
                                                                        item.default_unit || 'unidad',
                                                                        ...COMMON_PURCHASE_UNITS,
                                                                    ])).map(unit => {
                                                                        const isActive = pickerUnit === unit;
                                                                        return (
                                                                            <button
                                                                                type="button"
                                                                                key={unit}
                                                                                onClick={() => setPickerUnit(unit)}
                                                                                style={{
                                                                                    padding: '0.45rem 0.9rem',
                                                                                    borderRadius: '99px',
                                                                                    border: isActive ? '2px solid #0EA5E9' : '1px solid var(--border)',
                                                                                    background: isActive ? 'rgba(14, 165, 233, 0.08)' : 'var(--bg-card)',
                                                                                    color: isActive ? '#0369A1' : 'var(--text-main)',
                                                                                    fontWeight: isActive ? 700 : 500,
                                                                                    fontSize: '0.85rem',
                                                                                    cursor: 'pointer',
                                                                                    textTransform: 'capitalize',
                                                                                    touchAction: 'manipulation',
                                                                                    transition: 'all 0.15s',
                                                                                }}
                                                                            >
                                                                                {unit}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>

                                                                {/* [P2-NEVERA-BRANDS-MANUAL · 2026-07-07] Selector de marca
                                                                    (variantes reales del Supermercado RD). Solo alimentos con
                                                                    variantes en el catálogo; fail-soft si no hay ninguna. */}
                                                                {brandInfo && brandInfo.loading && (
                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                                                                        <Loader2 size={14} className="spin-fast" /> {t('Buscando marcas…')}
                                                                    </div>
                                                                )}
                                                                {brandInfo && !brandInfo.loading && brandInfo.brands.length > 0 && (
                                                                    <>
                                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>
                                                                            {t('Marca')} <span style={{ fontWeight: 500, color: 'var(--text-light)' }}>{t('(opcional)')}</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setPickerBrand(null)}
                                                                                style={brandPillStyle(pickerBrand === null)}
                                                                            >
                                                                                {t('Sin marca')}
                                                                            </button>
                                                                            {brandInfo.brands.map(({ brand, price }) => (
                                                                                <button
                                                                                    type="button"
                                                                                    key={brand}
                                                                                    onClick={() => setPickerBrand(brand)}
                                                                                    style={brandPillStyle(pickerBrand === brand)}
                                                                                >
                                                                                    {brand}{price != null ? ` · RD$${formatNumber(Number(price), { maximumFractionDigits: 0 })}` : ''}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Preview + Botón confirmar */}
                                                        <button
                                                            type="button"
                                                            disabled={isAdding}
                                                            onClick={() => handleAddNewItem(item, pickerQty, pickerUnit)}
                                                            style={{
                                                                width: '100%',
                                                                padding: '0.9rem 1rem',
                                                                background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                                                color: 'white', border: 'none', borderRadius: '1rem',
                                                                fontWeight: 800, fontSize: '1rem',
                                                                cursor: isAdding ? 'wait' : 'pointer',
                                                                opacity: isAdding ? 0.7 : 1,
                                                                boxShadow: '0 6px 18px -4px rgba(14, 165, 233, 0.55)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                                                touchAction: 'manipulation',
                                                            }}
                                                        >
                                                            {isAdding ? (
                                                                <><Loader2 size={18} className="spin-fast" /> {t('Añadiendo…')}</>
                                                            ) : existing ? (
                                                                <><Plus size={18} strokeWidth={3} /> {t('Sumar {cantidad} {unidad} a la nevera', { cantidad: pickerQty, unidad: existing.unit })}</>
                                                            ) : (
                                                                <><Plus size={18} strokeWidth={3} /> {t('Añadir {cantidad} {unidad}{marca} a la nevera', { cantidad: pickerQty, unidad: pickerUnit, marca: pickerBrand ? ` · ${pickerBrand}` : '' })}</>
                                                            )}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    );
                                })}

                                {/* [P1-PANTRY-CATALOG-EMPTY-CACHE] Mientras el catálogo baja NO se
                                    dice «No encontramos»: en PC salía durante segundos con el
                                    catálogo aún en vuelo y parecía que el alimento no existía. */}
                                {addItemSearch.trim() && suggestedMasterItems.length === 0 && (catalogLoading || masterList.length === 0) && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }} role="status" aria-live="polite">
                                        <div style={{ fontWeight: 600 }}>{t('Cargando catálogo…')}</div>
                                    </div>
                                )}
                                {addItemSearch.trim() && suggestedMasterItems.length === 0 && !catalogLoading && masterList.length > 0 && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                                        <Package size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t('No encontramos "{consulta}"', { consulta: addItemSearch.trim() })}</div>
                                        <div style={{ fontSize: '0.85rem' }}>{t('Prueba con otro nombre o un sinónimo más común.')}</div>
                                    </div>
                                )}

                                {/* [P3-PANTRY-RECENT-ADDS · 2026-07-07] Estado vacío interactivo:
                                    "Recientes" (1-toque re-añade lo último que compraste) +
                                    "Sugerencias rápidas" (1-toque añade si resuelve único, si no
                                    siembra la búsqueda). Rellena el vacío y acelera el caso común. */}
                                {!addItemSearch.trim() && (
                                    <div style={{ padding: '0.6rem 0.15rem 0.5rem', color: 'var(--text-light)' }}>
                                        {recentAdds.length > 0 && (
                                            <div style={{ marginBottom: '1.25rem' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                                    {t('Recientes')}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {recentAdds.map(r => (
                                                        <button
                                                            key={r.id || r.name}
                                                            type="button"
                                                            disabled={isAdding}
                                                            onClick={() => handleRecentAdd(r)}
                                                            style={ADD_CHIP_STYLE}
                                                            title={t('Añadir 1 {unidad} de {alimento}', { unidad: r.unit || '', alimento: r.name }).trim()}
                                                        >
                                                            <RotateCcw size={13} style={{ opacity: 0.5 }} /> {r.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                            {t('Sugerencias rápidas')}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {QUICK_ADD_SUGGESTIONS.map(word => (
                                                <button
                                                    key={word}
                                                    type="button"
                                                    disabled={isAdding}
                                                    onClick={() => handleChipAdd(word)}
                                                    style={ADD_CHIP_STYLE}
                                                >
                                                    <Plus size={13} style={{ opacity: 0.5 }} /> {word}
                                                </button>
                                            ))}
                                        </div>
                                        <p style={{ fontSize: '0.83rem', color: 'var(--text-light)', margin: '1.15rem 0 0', lineHeight: 1.45 }}>
                                            {t('Toca un chip para añadirlo al instante, o escribe cualquier alimento arriba.')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* [P3-PANTRY-QTY-EDIT · 2026-05-18] Modal de ajuste exacto de cantidad */}
            <AnimatePresence>
                {qtyEditItem && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => !qtyEditSaving && setQtyEditItem(null)}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', zIndex: 150 }}
                        />
                        <motion.div
                            ref={qtyEditModalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="pantry-qty-title"
                            tabIndex={-1}
                            initial={{ opacity: 0, scale: 0.94, y: '-50%', x: '-50%' }}
                            animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                            exit={{ opacity: 0, scale: 0.94, y: '-50%', x: '-50%' }}
                            transition={{ type: 'spring', damping: 22, stiffness: 240 }}
                            style={{
                                position: 'fixed', top: '50%', left: '50%',
                                background: 'var(--bg-card)', borderRadius: '1.5rem', padding: '2rem', zIndex: 151,
                                width: '92%', maxWidth: '420px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                            }}
                        >
                            <h2 id="pantry-qty-title" style={{ margin: '0 0 0.3rem 0', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {t('Ajustar cantidad')}
                            </h2>
                            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                <strong style={{ color: 'var(--text-main)' }}>{qtyEditItem.ingredient_name}</strong>
                                {' '}{t('· medida:')} <span style={{ textTransform: 'capitalize' }}>{qtyEditItem.unit}</span>
                            </p>

                            {/* Counter grande */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                marginBottom: '1.25rem',
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setQtyEditValue(v => Math.max(0, (Number(v) || 0) - 1))}
                                    disabled={qtyEditSaving || qtyEditValue <= 0}
                                    style={{
                                        border: '1px solid var(--border)', background: 'var(--bg-card)',
                                        borderRadius: '99px', width: '3rem', height: '3rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: qtyEditValue <= 0 ? 'var(--border)' : 'var(--text-main)',
                                        cursor: qtyEditValue <= 0 || qtyEditSaving ? 'not-allowed' : 'pointer',
                                        touchAction: 'manipulation',
                                    }}
                                    aria-label={t('Disminuir cantidad')}
                                >
                                    <Minus size={20} strokeWidth={3} />
                                </button>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="999"
                                    aria-label={t('Cantidad')}
                                    value={qtyEditValue}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        if (isNaN(n)) {
                                            setQtyEditValue('');
                                            return;
                                        }
                                        setQtyEditValue(Math.max(0, Math.min(999, n)));
                                    }}
                                    onBlur={() => {
                                        // Si quedó vacío al salir del input, restaura el valor previo.
                                        if (qtyEditValue === '' || qtyEditValue === null) {
                                            setQtyEditValue(qtyEditItem.quantity);
                                        }
                                    }}
                                    style={{
                                        width: '5.5rem', textAlign: 'center',
                                        fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)',
                                        background: 'var(--bg-page)', border: '2px solid var(--border)',
                                        borderRadius: '1rem', padding: '0.6rem 0.5rem',
                                        fontVariantNumeric: 'tabular-nums',
                                        outline: 'none',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setQtyEditValue(v => Math.min(999, (Number(v) || 0) + 1))}
                                    disabled={qtyEditSaving || qtyEditValue >= 999}
                                    style={{
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                        color: 'white', borderRadius: '99px', width: '3rem', height: '3rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: qtyEditSaving || qtyEditValue >= 999 ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 4px 14px -2px rgba(14, 165, 233, 0.5)',
                                        touchAction: 'manipulation',
                                    }}
                                    aria-label={t('Aumentar cantidad')}
                                >
                                    <Plus size={20} strokeWidth={3} />
                                </button>
                            </div>

                            {/* Atajos rápidos */}
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
                                justifyContent: 'center', marginBottom: '1.5rem',
                            }}>
                                {[1, 2, 5, 10, 20].map(preset => (
                                    <button
                                        type="button"
                                        key={preset}
                                        onClick={() => setQtyEditValue(preset)}
                                        disabled={qtyEditSaving}
                                        style={{
                                            padding: '0.35rem 0.85rem',
                                            borderRadius: '99px',
                                            border: qtyEditValue === preset ? '2px solid #0EA5E9' : '1px solid var(--border)',
                                            background: qtyEditValue === preset ? 'rgba(14, 165, 233, 0.08)' : 'var(--bg-card)',
                                            color: qtyEditValue === preset ? '#0369A1' : 'var(--text-muted)',
                                            fontWeight: qtyEditValue === preset ? 700 : 500,
                                            fontSize: '0.85rem', cursor: 'pointer',
                                            touchAction: 'manipulation',
                                        }}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>

                            {qtyEditValue === 0 && (
                                <p style={{
                                    margin: '0 0 1rem 0', padding: '0.6rem 0.8rem',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    borderRadius: '0.6rem',
                                    color: 'var(--danger, #ef4444)',
                                    fontSize: '0.82rem', textAlign: 'center', fontWeight: 600,
                                }}>
                                    {t('Al guardar con 0 se marcará como agotado.')}
                                </p>
                            )}

                            {/* Botones */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setQtyEditItem(null)}
                                    disabled={qtyEditSaving}
                                    style={{
                                        flex: 1, padding: '0.9rem', background: 'var(--bg-muted)',
                                        color: 'var(--text-main)', border: 'none', borderRadius: '0.9rem',
                                        fontWeight: 700, cursor: qtyEditSaving ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {t('Cancelar')}
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const targetItem = qtyEditItem;
                                        const target = Math.max(0, Math.min(999, Math.round(Number(qtyEditValue) || 0)));
                                        if (target === targetItem.quantity) {
                                            setQtyEditItem(null);
                                            return;
                                        }
                                        setQtyEditSaving(true);
                                        try {
                                            await handleUpdateQuantity(targetItem.id, target);
                                            if (target === 0) {
                                                toast.success(t('{alimento} marcado como agotado', { alimento: targetItem.ingredient_name }));
                                            } else {
                                                toast.success(`${targetItem.ingredient_name}: ${target} ${targetItem.unit}`);
                                            }
                                        } catch (err) {
                                            console.error('qty edit error', err);
                                            toast.error(t('No se pudo actualizar la cantidad'));
                                        } finally {
                                            setQtyEditSaving(false);
                                            setQtyEditItem(null);
                                        }
                                    }}
                                    disabled={qtyEditSaving || qtyEditValue === '' || qtyEditValue === null}
                                    style={{
                                        flex: 1.4, padding: '0.9rem',
                                        background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
                                        color: 'white', border: 'none', borderRadius: '0.9rem',
                                        fontWeight: 800, cursor: qtyEditSaving ? 'wait' : 'pointer',
                                        boxShadow: '0 6px 18px -4px rgba(14, 165, 233, 0.55)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        opacity: qtyEditSaving ? 0.75 : 1,
                                    }}
                                >
                                    {qtyEditSaving ? (
                                        <><Loader2 size={16} className="spin-fast" /> {t('Guardando…')}</>
                                    ) : (
                                        <>{t('Guardar')}</>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* [P3-PANTRY-FRIDGE-REDESIGN · 2026-06-24] Confirmación "Vaciar la
                Nevera" — tarjeta limpia y cohesiva con el rediseño (sustituye
                la metáfora de panel-LED del electrodoméstico anterior). */}
            <AnimatePresence>
                {showDeleteConfirm && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowDeleteConfirm(false)}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(8px)', zIndex: 200 }}
                        />
                        {/* [P3-PANTRY-CONFIRM-POLISH · 2026-07-12] Estilos migrados a
                            Pantry.fridge.module.css (hover/press/focus imposibles inline).
                            Icono Trash2 (específico a la acción) con halo de peligro;
                            botón destructivo sólido. */}
                        <motion.div
                            ref={deleteConfirmModalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="pantry-delete-title"
                            tabIndex={-1}
                            initial={{ opacity: 0, scale: 0.95, y: '-48%', x: '-50%' }} animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }} exit={{ opacity: 0, scale: 0.95, y: '-48%', x: '-50%' }}
                            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                            className={fstyles.confirmCard}
                        >
                            <div className={fstyles.confirmIcon}>
                                <Trash2 size={28} strokeWidth={2} />
                            </div>

                            <h2 id="pantry-delete-title" className={fstyles.confirmTitle}>
                                {t('¿Vaciar la Nevera?')}
                            </h2>
                            <p className={fstyles.confirmText}>
                                {t('Vas a borrar')} <strong>{t('todos los alimentos')}</strong> {t('de la despensa. Esta acción no se puede deshacer.')}
                            </p>
                            <div className={fstyles.confirmActions}>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={isDeletingAll}
                                    className={fstyles.confirmGhost}
                                >
                                    {t('Cancelar')}
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDeleteAll}
                                    disabled={isDeletingAll}
                                    className={fstyles.confirmDanger}
                                >
                                    {isDeletingAll ? <Loader2 size={16} className="spin-fast" /> : <Trash2 size={16} strokeWidth={2.5} />} {t('Sí, vaciar')}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Pantry;
