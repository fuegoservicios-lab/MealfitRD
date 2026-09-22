import { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Camera, Image as ImageIcon, Loader2, Check, X, AlertTriangle, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
// [P1-PLAN-LOTE-106] la misma hoja inferior que el componedor: deslizar para cerrar, el toque no pasa al fondo,
// el scroll del fondo vuelve a su sitio; y los mismos chips para «¿Qué comida es?» y «¿Cuándo?».
import { useBottomSheet } from '../../hooks/useBottomSheet';
import Chips from './Chips';
import { getDayOptionsCon as _getDayOptionsCon, normalizarDiasAtras, nombreDelDiaAtras } from './dayOptions';
// [P2-SCAN-NO-WEBCAM-ON-DESKTOP · 2026-07-30] Hook SSOT de media queries (P2-14).
import { useMediaQuery } from '../../hooks/useMediaQuery';
// [P1-PLAN-LOTE-105] fototeca directa en la app nativa (Capacitor Camera); en la web, null
import { isNativeApp } from '../../config/platform';
import { chooseNativeGalleryImage, isNativePickerCancellation } from '../../utils/nativeChatImagePicker';
import { captureException } from '../../utils/observability';
// [P1-SCANNER-SHARED · 2026-08-10] El visor en vivo es SSOT compartido con el
// escáner de la Nevera — no una segunda copia de 200 líneas.
import CameraViewfinder from '../common/CameraViewfinder';
import styles from './ScanMealModal.module.css';
// [P1-MANUAL-FOOD-LOG · 2026-08-11] Las constantes de registro y el input de macros
// se EXTRAJERON a módulos compartidos con el componedor manual (LogMealModal) — se
// extrae, no se copia (precedente: CameraViewfinder / P1-SCANNER-SHARED). Los alias
// con guion bajo conservan los nombres históricos de este archivo para no tocar sus
// ~17 call sites en el mismo commit que la extracción.
import MacroInput from '../common/MacroInput';
import { useT, useTn } from '../../i18n';
import { glossUnitWord } from '../../utils/shoppingHelpers';
import { useTecladoDeHoja, estilosDeHojaConTeclado } from '../../hooks/useTecladoDeHoja';
// [P2-VISION-COUNTRY-COPY · 2026-08-21] SSOT de países del frontend (espejo del backend con
// test de paridad). Comparar contra 'DO' a mano aquí sería la tabla que P1-DIET-CANON-SSOT
// prohíbe.
import { coerceCountry, DEFAULT_COUNTRY, COUNTRY_SYSTEM_UI } from '../../config/countries';
import { useAssessment } from '../../context/AssessmentContext';
import {
    getMealTypes as _getMealTypes,
    guessMealType as _guessMealType,
    clampMacro as _clampMacro,
} from './mealLogShared';

// [P2-DIARY-SCAN-MACROS · 2026-05-30] Modal "Escanear comida → registrar macros".
//
// Flujo: el usuario toma/elige una foto → se sube a `POST /api/diary/upload`
// (que ya valida MIME + magic-bytes + 20MB, sube a Storage y corre el vision
// agent) → el endpoint devuelve `meal_name` + `macros{calories,protein,carbs,
// healthy_fats}` estimadas. El modal precarga esos valores en campos EDITABLES
// + un control de porción (½×/1×/2×/personalizado) y, al confirmar, hace
// `POST /api/diary/consumed` (el único surface que persiste a consumed_meals).
//
// Por qué confirmación editable y no auto-guardar: las estimaciones de visión
// no son exactas — meter macros sin revisar contamina el tracking y es difícil
// de corregir luego. El usuario revisa y ajusta antes de registrar.
//
// Tras registrar se dispara `mealfit:refresh-inventory` para que la tarjeta
// "Progreso en Tiempo Real" (TrackingProgress) refetchee al instante — mismo
// evento que usa el chat-agent tras log_consumed_meal.
//
// Tooltip-anchor: P2-DIARY-SCAN-MACROS.

// Multiplicadores de porción rápidos. "Personalizado" se logra editando los
// campos a mano (los presets solo rellenan).
const _PORTIONS = [0.5, 1, 2];

// [P1-PLAN-LOTE-106 · 2026-09-18] «¿Cuándo?» también en el escáner (el dueño: «esa es mi cena del día de ayer que
// no pude agregar»). `days_ago` ya lo aceptaba `POST /api/diary/consumed` (0..7); el escáner nunca lo mandaba.
// [P1-PLAN-LOTE-124] Los chips viven en ./dayOptions.js, compartidos con el componedor: el escáner también se abre
// desde «Ver días anteriores» (hasta 7 días atrás) y necesita el chip del día pedido, igual que él.

// La piel de MacroInput en ESTE modal (la lógica compartida vive en common/).
const _MACRO_CLASSES = {
    field: styles.macroField,
    label: styles.macroLabel,
    wrap: styles.macroInputWrap,
    input: styles.macroInput,
    unit: styles.macroUnit,
};

// Validación cliente antes de subir (el backend revalida; esto es UX rápida).
const _ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const _MAX_BYTES = 20 * 1024 * 1024;

// [P1-MEAL-SCAN-GEMMA · 2026-07-12] Reescala client-side antes de subir —
// mismo patrón que el escáner de Nevera (PantryScanButton): el análisis corre
// en gemma local vía túnel SSH, así que una foto de celular de 4000px (~8MB)
// tardaría minutos solo en viajar. 1024px JPEG ~150KB analiza igual de bien.
// Si el browser no puede decodificar el formato (HEIC en Chrome desktop), el
// caller cae al archivo original (el backend lo acepta).
const _downscaleToJpegFile = (file, maxSide = 1024) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        try {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('toBlob null')); return; }
                resolve(new File([blob], 'meal.jpg', { type: 'image/jpeg' }));
            }, 'image/jpeg', 0.82);
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
});

const ScanMealModal = ({ isOpen, onClose, userId, initialDaysAgo = 0 }) => {
    // [P2-SCAN-NO-WEBCAM-ON-DESKTOP · 2026-07-30] "Tomar foto" solo donde es el gesto natural.
    //
    // En escritorio, `<input capture="environment">` abre la WEBCAM: apuntar un portátil al plato
    // para fotografiarlo no es algo que la gente haga, y la opción ocupaba la tarjeta primaria (la
    // "recomendada"), empujando a la acción rara y dejando la útil de segunda. En móvil es lo
    // contrario: la cámara ES el camino principal.
    //
    // `(pointer: coarse)` en vez de sniffing de user-agent: describe el dispositivo de entrada, que
    // es justo lo que decide si "hacer una foto" tiene sentido. Un portátil con pantalla táctil
    // sigue reportando el ratón como puntero PRIMARIO, así que se le trata como escritorio; una
    // tablet en modo táctil reporta coarse y conserva la cámara — que es lo correcto en ambos.
    // Se reusa el hook SSOT (P2-14) en vez de un matchMedia propio; ya lo usa PantryScanButton
    // para decidir su visor en vivo, o sea es la misma pregunta ya contestada en el repo.
    const t = useT();
    const tn = useTn();
    const isCoarsePointer = useMediaQuery('(pointer: coarse)');
    // phase: 'select' (elegir foto) | 'scanning' | 'review' | 'saving'
    const [phase, setPhase] = useState('select');
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [base, setBase] = useState({ calories: 0, protein: 0, carbs: 0, healthy_fats: 0 });
    // [P1-PHOTO-DEDUCTS · 2026-08-07] Componentes del plato que el vision agent
    // detectó, con un check por fila. Sólo los MARCADOS se mandan al backend
    // para descontar de la Nevera.
    //
    // Por qué opt-in explícito y no automático: la cantidad la estimó un modelo
    // mirando una foto. Descontar sin que el usuario lo vea repetiría el pecado
    // que P1-PANTRY-NAME-RESOLUTION acaba de cerrar — mover la Nevera por algo
    // que el usuario no puede auditar. Aquí lo ve, lo corrige y lo acepta; esa
    // confirmación ES la autorización que el backend ejecuta.
    //
    // Forma: [{ name, quantity, unit, checked }]. El string que viaja se arma
    // en el submit ("2 unidades de huevo"), no aquí, para que editar la
    // cantidad no obligue a re-serializar en cada tecla.
    const [components, setComponents] = useState([]);
    // [P1-PLAN-LOTE-162 · 2026-09-22] ¿Hay algo en la Nevera? `null` = no se sabe. Quien usa la app como contador casi
    // nunca la llena, y cada foto terminaba en «Descontamos 0 de tu Nevera. No estaban registrados: arroz, pollo…»:
    // un mensaje que suena a error sobre algo que esa persona no usa. Con la Nevera vacía la sección se llama por lo
    // que es (los ingredientes que se guardan con la comida) y el aviso no habla de la Nevera. Los ingredientes se
    // siguen enviando igual: son el detalle de la comida en el diario, no solo lo que se descuenta.
    const [neveraConCosas, setNeveraConCosas] = useState(null);
    useEffect(() => {
        if (!components.length || neveraConCosas !== null || !userId) return undefined;
        let cancelado = false;
        (async () => {
            try {
                const res = await fetchWithAuth('/api/inventory');
                if (!res.ok || cancelado) return;
                const datos = await res.json();
                const items = Array.isArray(datos?.items) ? datos.items : null;
                if (items && !cancelado) setNeveraConCosas(items.some((it) => Number(it?.quantity) > 0));
            } catch { /* se queda en «no se sabe»: la conducta de antes */ }
        })();
        return () => { cancelado = true; };
    }, [components.length, neveraConCosas, userId]);
    const [multiplier, setMultiplier] = useState(1);
    // [P1-PLAN-LOTE-106] el día de la comida: 0 = hoy · 1 = ayer · 2 = antier
    const [daysAgo, setDaysAgo] = useState(() => normalizarDiasAtras(initialDaysAgo));
    const [form, setForm] = useState({
        meal_name: '',
        meal_type: _guessMealType(),
        calories: 0,
        protein: 0,
        carbs: 0,
        healthy_fats: 0,
    });

    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const previewUrlRef = useRef(null);
    const bodyRef = useRef(null);

    const isBusy = phase === 'scanning' || phase === 'saving';

    // [P2-VISION-COUNTRY-COPY · 2026-08-21] El país del usuario, sólo para decidir si se
    // muestra el aviso de calibración del escáner. Mismo patrón que el resto del
    // dashboard (`DashboardTracking` ya lee `formData` de aquí).
    // `|| {}`: este modal se renderiza AISLADO en sus tests (y podría montarse fuera del
    // provider en un futuro shell), y sin la guarda `useAssessment()` devuelve undefined y
    // el destructuring revienta el componente entero. Un aviso informativo no puede ser la
    // razón por la que el escáner deja de abrirse: 10 tests lo dijeron al primer intento.
    const { formData: _scanFormData } = useAssessment() || {};
    const country = _scanFormData?.country;
    const { containerRef } = useModalAccessibility({
        isOpen,
        onClose,
        disableClose: isBusy, // no cerrar mientras sube/guarda (operación en vuelo)
    });
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose, disabled: isBusy });
    // [P1-PLAN-LOTE-165 · 2026-09-22] En el iPhone el teclado tapaba el pie de la revisión: la hoja sube por encima.
    const teclado = estilosDeHojaConTeclado(useTecladoDeHoja(isOpen));

    // Revoca el objectURL del preview al reemplazarlo o al desmontar — evita leak.
    const _setPreviewUrl = useCallback((url) => {
        if (previewUrlRef.current) {
            try { URL.revokeObjectURL(previewUrlRef.current); } catch (_e) { /* noop */ }
        }
        previewUrlRef.current = url;
        setPreview(url);
    }, []);

    // Reset completo al abrir/cerrar para no arrastrar estado entre escaneos.
    useEffect(() => {
        if (!isOpen) {
            _setPreviewUrl(null);
            setPhase('select');
            setError(null);
            setBase({ calories: 0, protein: 0, carbs: 0, healthy_fats: 0 });
            setComponents([]);
            setMultiplier(1);
            setDaysAgo(normalizarDiasAtras(initialDaysAgo));
            setForm({
                meal_name: '',
                meal_type: _guessMealType(),
                calories: 0,
                protein: 0,
                carbs: 0,
                healthy_fats: 0,
            });
        }
    }, [isOpen, _setPreviewUrl, initialDaysAgo]);

    useEffect(() => () => {
        // Cleanup final al desmontar el componente.
        if (previewUrlRef.current) {
            try { URL.revokeObjectURL(previewUrlRef.current); } catch (_e) { /* noop */ }
        }
    }, []);

    const handleFile = useCallback(async (file) => {
        if (!file) return;
        setError(null);

        const declaredType = (file.type || '').toLowerCase();
        if (declaredType && !_ALLOWED_TYPES.includes(declaredType)) {
            setError(t('Formato no soportado. Usa una foto JPG, PNG, WebP o HEIC.'));
            return;
        }
        if (file.size > _MAX_BYTES) {
            setError(t('La imagen es muy grande (máx. 20 MB).'));
            return;
        }

        _setPreviewUrl(URL.createObjectURL(file));
        setPhase('scanning');

        try {
            // [P1-MEAL-SCAN-GEMMA] Reescala a ≤1024px JPEG; si el browser no
            // decodifica el formato (HEIC/desktop), sube el original tal cual.
            let uploadFile = file;
            try {
                uploadFile = await _downscaleToJpegFile(file);
            } catch (_e) { /* fallback al original */ }

            const fd = new FormData();
            fd.append('file', uploadFile, uploadFile.name || 'meal.jpg');
            fd.append('user_id', userId);
            fd.append('tz_offset_mins', String(new Date().getTimezoneOffset()));

            // fetchWithAuth NO setea Content-Type → el browser pone el boundary
            // multipart correcto (mismo patrón que AgentPage.jsx).
            const res = await fetchWithAuth('/api/diary/upload', { method: 'POST', body: fd });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data?.detail || t('No se pudo analizar la imagen.'));
            }
            // [P1-MEAL-SCAN-GEMMA · 2026-07-12] La GPU local es single-flight:
            // "ocupado" se resuelve en segundos — mensaje distinto de "caído".
            if (data.busy) {
                _setPreviewUrl(null);
                setPhase('select');
                setError(t('El escáner está procesando otra foto — dale unos segundos e intenta de nuevo.'));
                return;
            }
            // [P2-DIARY-SCAN-MACROS · 2026-05-30] Distingue "analizador caído"
            // (timeout / límite de la IA / sin saldo) de "no es comida" — antes
            // ambos caían en el mismo mensaje engañoso.
            if (data.analysis_failed) {
                _setPreviewUrl(null);
                setPhase('select');
                setError(t('El analizador de imágenes no está disponible ahora mismo. Intenta de nuevo en unos minutos.'));
                return;
            }
            // [P1-CHAT-VISION-GEMMA · 2026-07-12] La foto es una COMPRA o
            // alimentos sueltos, no un plato — registrar 0 kcal contaminaría
            // el tracking. Redirigir a los flujos de Nevera.
            if (data.photo_kind === 'items') {
                _setPreviewUrl(null);
                setPhase('select');
                setError(t('Esto parece una compra o alimentos sueltos, no un plato servido. Para llevarlos a tu Nevera usa "Escanear mi nevera" (página Nevera) o mándale la foto al Agente.'));
                return;
            }
            if (!data.is_food) {
                _setPreviewUrl(null);
                setPhase('select');
                setError(t('No detectamos comida en la foto. Intenta con otra toma del plato.'));
                return;
            }

            const m = data.macros || {};
            const nextBase = {
                calories: _clampMacro('calories', m.calories || 0),
                protein: _clampMacro('protein', m.protein || 0),
                carbs: _clampMacro('carbs', m.carbs || 0),
                healthy_fats: _clampMacro('healthy_fats', m.healthy_fats || 0),
            };
            setBase(nextBase);
            // [P1-PHOTO-DEDUCTS · 2026-08-07] `items` ya viajaba en la respuesta
            // (lo usaba el modo 'items'), pero para 'plato' el backend lo mandaba
            // SIEMPRE vacío — ver P1-VISION-PLATO-ITEMS. Ahora trae los
            // componentes del plato. Nacen MARCADOS: el caso común es que la
            // detección sea correcta y descontar sea lo que el usuario quiere;
            // desmarcar es la excepción (no tenía ese ingrediente, o el modelo
            // lo alucinó).
            setComponents(
                (Array.isArray(data.items) ? data.items : [])
                    .filter((it) => it && it.name)
                    .slice(0, 30)
                    .map((it) => ({
                        name: String(it.name).slice(0, 60),
                        quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
                        unit: String(it.unit || 'unidad').slice(0, 20),
                        checked: true,
                    }))
            );
            setMultiplier(1);
            setForm((prev) => ({
                ...prev,
                meal_name: (data.meal_name || '').slice(0, 200) || t('Comida escaneada'),
                ...nextBase,
            }));
            setPhase('review');

            if (data.red_alert) {
                toast.warning(t('Comida alta en calorías a una hora poco habitual.'));
            }
        } catch (err) {
            console.error('Error escaneando comida:', err);
            _setPreviewUrl(null);
            setPhase('select');
            setError(t('No pudimos analizar la imagen. Revisa tu conexión e intenta de nuevo.'));
        }
    }, [userId, _setPreviewUrl, t]);

    const onCameraChange = (e) => { handleFile(e.target.files?.[0]); e.target.value = ''; };
    const onGalleryChange = (e) => { handleFile(e.target.files?.[0]); e.target.value = ''; };

    // [P1-SCANNER-SHARED · 2026-08-10] Visor en vivo en el móvil, el MISMO que ya
    // usaba el escáner de la Nevera. Antes esta pantalla delegaba en la cámara del
    // sistema (`<input capture>`): el usuario salía de la app, hacía una foto en la
    // cámara genérica y volvía. Funcionaba, pero no se parecía a un escáner — y era
    // la única de las dos superficies de escaneo de la app que se sentía así.
    //
    // El visor se queda abierto MIENTRAS analiza (foto congelada + «Analizando…») y
    // se cierra solo al terminar, porque `handleFile` resuelve cuando el análisis
    // acabó. Sin ese await habría que sincronizar dos estados a mano y el visor se
    // cerraría antes de tiempo, dejando un salto visual en mitad del escaneo.
    const [viewfinderOpen, setViewfinderOpen] = useState(false);
    const hasCameraApi = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    const useLiveViewfinder = isCoarsePointer && hasCameraApi;

    const handleViewfinderCapture = useCallback(async (file) => {
        await handleFile(file);
        setViewfinderOpen(false);
    }, [handleFile]);

    // [P1-PLAN-LOTE-105 · 2026-09-18] «Elegir de galería» en la app nativa abre la fototeca DIRECTA con el plugin
    // (el input de la web dispara la hoja de iOS de tres opciones, que el dueño no quería). Cancelar no es error;
    // cualquier otro fallo cae al input de siempre para no dejar al usuario sin camino.
    const openGallery = useCallback(async () => {
        if (!isNativeApp()) { galleryInputRef.current?.click(); return; }
        try {
            const file = await chooseNativeGalleryImage();
            if (file) await handleFile(file);
        } catch (err) {
            if (isNativePickerCancellation(err)) return;
            // [P1-PLAN-LOTE-107 · 2026-09-18] El fallo del selector nativo NO puede ser silencioso: caer callado
            // al input de la web enseña otra vez la hoja de tres opciones de iOS y desde fuera es indistinguible
            // de «no se hizo nada» (y cada build nativo cuesta minutos de Mac). Se reporta, se dice con su código
            // —un pantallazo basta para diagnosticar— y DESPUÉS se abre el input para no dejar al usuario sin camino.
            try { captureException(err, { tags: { component: 'ScanMealModal', action: 'native_gallery_picker' } }); } catch { /* best-effort */ }
            const codigo = String(err?.code || err?.message || 'desconocido').slice(0, 80);
            toast.error(t('No pudimos abrir tus fotos. Revisa los permisos e inténtalo de nuevo.'), { description: `[${codigo}]` });
            galleryInputRef.current?.click();
        }
    }, [handleFile, t]);

    // [P1-PLAN-LOTE-110 · 2026-09-19] «Subir una foto en su lugar» (la salida del visor) hacía click al input de la
    // web: en la app nativa eso es OTRA VEZ la hoja de tres opciones de iOS que el lote 105 quitó de «Elegir de
    // galería» (captura del dueño). Las dos entradas a la fototeca pasan por `openGallery`, que decide nativo/web.
    const handleViewfinderFallback = useCallback(() => {
        setViewfinderOpen(false);
        void openGallery();
    }, [openGallery]);

    const applyPortion = useCallback((m) => {
        setMultiplier(m);
        setForm((prev) => ({
            ...prev,
            calories: _clampMacro('calories', base.calories * m),
            protein: _clampMacro('protein', base.protein * m),
            carbs: _clampMacro('carbs', base.carbs * m),
            healthy_fats: _clampMacro('healthy_fats', base.healthy_fats * m),
        }));
    }, [base]);

    const handleMacroChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: _clampMacro(key, value) }));
    };

    const handleSave = useCallback(async () => {
        const name = form.meal_name.trim();
        if (!name) {
            setError(t('Ponle un nombre a la comida.'));
            return;
        }
        setError(null);
        setPhase('saving');
        // Componentes marcados → strings que el backend puede parsear. Si el
        // usuario los desmarcó todos, se manda `undefined` (no `[]`) para que
        // el backend trate el caso como "no hay nada que descontar" por la
        // misma rama que un registro sin componentes.
        const ingredientStrings = components
            .filter((c) => c.checked && c.name && Number(c.quantity) > 0)
            .map((c) => `${c.quantity} ${c.unit} de ${c.name}`);
        try {
            const res = await fetchWithAuth('/api/diary/consumed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    meal_name: name.slice(0, 200),
                    meal_type: form.meal_type,
                    calories: form.calories,
                    protein: form.protein,
                    carbs: form.carbs,
                    healthy_fats: form.healthy_fats,
                    // [P1-PLAN-LOTE-106] el día elegido en «¿Cuándo?» (0 = hoy); el backend retrodata `consumed_at`
                    days_ago: daysAgo,
                    // [P1-PHOTO-DEDUCTS · 2026-08-07] Solo los MARCADOS. Se
                    // serializan aquí (no en el state) para que editar una
                    // cantidad no re-serialice en cada tecla. El formato es el
                    // mismo que emite el chat y que `_parse_quantity` entiende
                    // desde siempre: "<qty> <unit> de <nombre>".
                    ingredients: ingredientStrings,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data?.message || data?.detail || t('No se pudo registrar.'));
            }
            // Refresca la tarjeta de progreso (mismo evento que usa el chat).
            window.dispatchEvent(new Event('mealfit:refresh-inventory'));
            // [P1-PHOTO-DEDUCTS · 2026-08-07] Decir QUÉ no bajó de la Nevera.
            // Callarlo dejaría al usuario creyendo que se descontó todo lo que
            // confirmó — la misma mentira que P1-PANTRY-NAME-RESOLUTION eliminó
            // del chat. Que un ingrediente no esté registrado es normal, no un
            // error: por eso va en el `success`, no en un `error`.
            const ausentes = Array.isArray(data.not_in_pantry) ? data.not_in_pantry : [];
            const bajaron = (Array.isArray(data.deducted) ? data.deducted.length : 0)
                + (Array.isArray(data.inferred) ? data.inferred.length : 0);
            let descripcion;
            // [P1-PLAN-LOTE-162] Los ausentes solo se nombran si la Nevera está EN USO (algo bajó, o sabemos que tiene
            // cosas). Con la Nevera vacía, «descontamos 0» no informa de nada: solo asusta.
            if (ausentes.length > 0 && (bajaron > 0 || neveraConCosas === true)) {
                descripcion = t('Descontamos {n} de tu Nevera. No estaban registrados: {faltantes}', {
                    n: bajaron,
                    faltantes: `${ausentes.slice(0, 3).join(', ')}${ausentes.length > 3 ? '…' : ''}`,
                });
            } else if (bajaron > 0) {
                descripcion = tn(
                    bajaron,
                    'Descontamos {n} ingrediente de tu Nevera.',
                    'Descontamos {n} ingredientes de tu Nevera.',
                    { n: bajaron }
                );
            }
            // [P1-PLAN-LOTE-106] si no es de hoy, decirlo: no aparece en «Tus macros y micros de hoy», sino en
            // «Ver días anteriores» — la misma regla que el coach.
            if (daysAgo > 0) {
                const dia = nombreDelDiaAtras(t, daysAgo); // [P1-PLAN-LOTE-124] más de dos días atrás ya no es «antier»
                descripcion = [descripcion, t('Quedó en el diario de {dia}; la ves en «Ver días anteriores».', { dia })]
                    .filter(Boolean).join(' ');
            }
            toast.success(
                t('{nombre} registrada ({kcal} kcal).', { nombre: name, kcal: form.calories }),
                descripcion ? { description: descripcion } : undefined
            );
            onClose();
        } catch (err) {
            console.error('Error registrando comida:', err);
            setPhase('review');
            setError(t('No pudimos registrar la comida. Intenta de nuevo.'));
        }
    }, [form, userId, onClose, components, daysAgo, t, tn, neveraConCosas]);

    const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
    }, [isBusy, onClose]);

    if (!isOpen) return null;

    const enRevision = phase === 'review' || phase === 'saving';

    return (
        <>
        <div className={styles.overlay} onClick={handleOverlayClick} style={teclado.fondo}>
            {/* [P1-PLAN-LOTE-106 · 2026-09-18] La misma hoja que «Registrar comida» (lote 99): cabecera y pie FIJOS,
                cuerpo desplazable. Antes era una tarjeta centrada con scroll interno: en el teléfono el botón de
                registrar quedaba bajo el borde y el formulario era una columna de campos sin jerarquía (captura del
                dueño). En escritorio sigue centrada. */}
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="scan-meal-title"
                tabIndex={-1}
                className={styles.card}
                style={teclado.panel}
                onTouchStart={hoja.onTouchStart}
                onTouchMove={hoja.onTouchMove}
                onTouchEnd={hoja.onTouchEnd}
                onTouchCancel={hoja.onTouchEnd}
            >
                <div className={styles.header}>
                    <span className={styles.grip} aria-hidden="true" />
                    <div className={styles.headerRow}>
                        {/* [P3-SCAN-MODAL-POLISH · 2026-07-12] Icono como tile con gradiente.
                            [P1-PLAN-LOTE-102 · 2026-09-18] Quitado: repetía la cámara de «Usar la cámara» a 8 líneas
                            de distancia (el dueño: «no quiero dos svg de una cámara en el mismo sitio»). */}
                        <div>
                            <h2 id="scan-meal-title" className={styles.title}>
                                {enRevision ? t('Revisa y registra') : t('Escanear comida')}
                            </h2>
                            {enRevision && (
                                <p className={styles.subtitle}>{t('La IA estimó esto por la foto. Corrige lo que no cuadre.')}</p>
                            )}
                        </div>
                        <button
                            className={`${styles.closeBtn} ui-close`}
                            onClick={onClose}
                            disabled={isBusy}
                            aria-label={t('Cerrar')}
                        >
                            <X size={20} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div ref={bodyRef} className={styles.body}>
                {/* Preview de la foto (si hay). [P1-MEAL-SCAN-POLISH] En revisión
                    pasa a banner compacto para que todo quepa sin scroll. */}
                {preview && (
                    <div className={`${styles.previewWrap} ${(phase === 'review' || phase === 'saving') ? styles.previewCompact : ''}`}>
                        <img src={preview} alt={t('Foto de la comida')} className={styles.previewImg} />
                        {phase === 'scanning' && (
                            <div className={styles.scanningOverlay}>
                                <Loader2 size={28} className={styles.spinner} />
                                <span>{t('Analizando tu plato… puede tardar un minuto')}</span>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className={styles.error} role="alert">
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {/* FASE 1: elegir foto */}
                {phase === 'select' && (
                    <>
                        <p className={styles.hint}>
                            {isCoarsePointer
                                ? t('Toma una foto de tu plato y la IA estimará las macros. Podrás revisarlas antes de registrar.')
                                : t('Sube una foto de tu plato y la IA estimará las macros. Podrás revisarlas antes de registrar.')}
                        </p>
                        {/* [P2-VISION-COUNTRY-COPY · 2026-08-21] La spec de visión ACEPTÓ que el
                            escáner fuera dominicano en v1, pero con una condición escrita: «se
                            documenta en el copy del escáner para beta». Esa condición nunca se
                            cumplió — era la deuda de una decisión que nadie escribió, así que el
                            usuario beta no tenía forma de saber contra qué está calibrado.
                            El prompt de `vision_agent.py` dice literalmente «Eres un nutricionista
                            dominicano» y pide el nombre «en español dominicano»; a un plato español
                            o mexicano le pone el nombre criollo más parecido. El modal ya deja
                            editar nombre y macros antes de guardar, así que el aviso es accionable
                            y no un descargo. */}
                        {COUNTRY_SYSTEM_UI && coerceCountry(country) !== DEFAULT_COUNTRY && (
                            <p className={styles.hint}>
                                {t('El escáner está calibrado con cocina dominicana: fuera de RD puede nombrar tu plato con el criollo más parecido. Revisa el nombre y las macros antes de registrar.')}
                            </p>
                        )}
                        {/* [P3-SCAN-MODAL-POLISH · 2026-07-12] De dos botones apilados a
                            OPTION-CARDS estilo action-sheet: icono en tile + label +
                            sublabel + chevron. La cámara lleva el tile primary (acción
                            recomendada); galería en tile neutro. */}
                        <div className={styles.pickRow}>
                            {isCoarsePointer && (
                                <button
                                    className={styles.optionCard}
                                    onClick={() => {
                                        // Con cámara real → visor in-app. Sin ella (tablet sin
                                        // cámara, permiso de navegador raro) se conserva el
                                        // `<input capture>` de siempre: la salida degradada
                                        // sigue existiendo, no se cambia una por otra.
                                        if (useLiveViewfinder) setViewfinderOpen(true);
                                        else cameraInputRef.current?.click();
                                    }}
                                >
                                    <span className={`${styles.optionIco} ${styles.optionIcoPrimary}`}>
                                        <Camera size={20} strokeWidth={2.1} />
                                    </span>
                                    <span className={styles.optionTxt}>
                                        {/* [P1-SCAN-NO-VERB-ECHO · 2026-08-10] El rótulo NO repite el
                                            verbo del título. Decía «Escanear mi plato» debajo de un
                                            título «Escanear comida», y a ≤480px el sublabel está
                                            oculto (ver .optionSub en el CSS) — así que en el teléfono
                                            esa palabra era literalmente lo único escrito dos veces en
                                            la pantalla. El título ya aporta el verbo (y espeja el
                                            botón que abrió el modal, por eso el título se queda); a
                                            estas dos filas solo les toca decir EN QUÉ SE DIFERENCIAN,
                                            que es de dónde sale la foto. Un solo rótulo para las dos
                                            ramas a propósito: el usuario no elige entre visor in-app
                                            y cámara del sistema — eso lo decide la app, y el sublabel
                                            lo cuenta donde hay sitio. */}
                                        <span className={styles.optionLabel}>{t('Usar la cámara')}</span>
                                        <span className={styles.optionSub}>
                                            {useLiveViewfinder
                                                ? t('Encuadra el plato y captura')
                                                : t('Se abrirá la app de cámara')}
                                        </span>
                                    </span>
                                    <ChevronRight size={18} className={styles.optionChev} aria-hidden="true" />
                                </button>
                            )}
                            <button
                                className={styles.optionCard}
                                onClick={openGallery}
                            >
                                {/* En escritorio la galería es la ÚNICA acción, así que se queda el
                                    tile primario que antes llevaba la cámara — no puede quedar una
                                    pantalla cuya única opción se ve como la secundaria. */}
                                <span className={`${styles.optionIco}${isCoarsePointer ? '' : ` ${styles.optionIcoPrimary}`}`}>
                                    <ImageIcon size={20} strokeWidth={2.1} />
                                </span>
                                <span className={styles.optionTxt}>
                                    <span className={styles.optionLabel}>{t('Elegir de galería')}</span>
                                    <span className={styles.optionSub}>
                                        {isCoarsePointer
                                            ? t('Sube una foto que ya tengas')
                                            : t('Sube una foto desde tu computadora')}
                                    </span>
                                </span>
                                <ChevronRight size={18} className={styles.optionChev} aria-hidden="true" />
                            </button>
                        </div>
                        {isCoarsePointer && (
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={onCameraChange}
                                className={styles.hiddenInput}
                                tabIndex={-1}
                            />
                        )}
                        <input
                            ref={galleryInputRef}
                            type="file"
                            accept="image/*"
                            onChange={onGalleryChange}
                            className={styles.hiddenInput}
                            tabIndex={-1}
                        />
                    </>
                )}

                {/* FASE 2: revisar/editar y registrar
                    [P1-PLAN-LOTE-106] Cuatro preguntas, en el orden en que se contestan, con la misma gramática que el
                    componedor: «¿Qué es?» (nombre), «¿Cuánto?» (porción + macros), «¿Qué comida es?» y «¿Cuándo?»
                    (chips, no desplegables), y al final lo que se descuenta de la Nevera. */}
                {enRevision && (
                    <div className={styles.reviewWrap}>
                        <section className={styles.section} aria-labelledby="scan-q-nombre">
                            <h3 id="scan-q-nombre" className={styles.sectionTitle}>{t('¿Qué es?')}</h3>
                            <input
                                type="text"
                                value={form.meal_name}
                                maxLength={200}
                                onChange={(e) => setForm((p) => ({ ...p, meal_name: e.target.value }))}
                                className={styles.textInput}
                                placeholder={t('Ej: Mangú con salami')}
                                aria-label={t('Nombre')}
                            />
                        </section>

                        <section className={styles.section} aria-labelledby="scan-q-cuanto">
                            <h3 id="scan-q-cuanto" className={styles.sectionTitle}>{t('¿Cuánto comiste?')}</h3>
                            {/* [P1-MEAL-SCAN-POLISH] Porción en fila (`fieldRow`): los tres multiplicadores a lo ancho. */}
                            <div className={styles.fieldRow}>
                                <span className={styles.fieldLabel}>{t('Porción')}</span>
                                <div className={styles.portionRow} role="group" aria-label={t('Porción')}>
                                    {_PORTIONS.map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            className={`${styles.portionBtn} ${multiplier === p ? styles.portionActive : ''}`}
                                            aria-pressed={multiplier === p}
                                            onClick={() => applyPortion(p)}
                                            title={t('Multiplica las macros estimadas; también puedes editarlas abajo')}
                                        >
                                            {p === 0.5 ? '½×' : `${p}×`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                        <div className={styles.macrosGrid}>
                            <MacroInput classes={_MACRO_CLASSES} label={t('Calorías')} unit="kcal" value={form.calories}
                                onChange={(v) => handleMacroChange('calories', v)} />
                            <MacroInput classes={_MACRO_CLASSES} label={t('Proteína')} unit="g" value={form.protein}
                                onChange={(v) => handleMacroChange('protein', v)} />
                            <MacroInput classes={_MACRO_CLASSES} label={t('Carbohidratos')} unit="g" value={form.carbs}
                                onChange={(v) => handleMacroChange('carbs', v)} />
                            <MacroInput classes={_MACRO_CLASSES} label={t('Grasas')} unit="g" value={form.healthy_fats}
                                onChange={(v) => handleMacroChange('healthy_fats', v)} />
                        </div>
                        </section>

                        <section className={styles.section} aria-labelledby="scan-q-tipo">
                            <h3 id="scan-q-tipo" className={styles.sectionTitle}>{t('¿Qué comida es?')}</h3>
                            <Chips
                                label={t('Tipo de comida')}
                                options={_getMealTypes(t)}
                                value={form.meal_type}
                                onChange={(v) => setForm((p) => ({ ...p, meal_type: v }))}
                                disabled={phase === 'saving'}
                            />
                        </section>

                        <section className={styles.section} aria-labelledby="scan-q-cuando">
                            <h3 id="scan-q-cuando" className={styles.sectionTitle}>{t('¿Cuándo?')}</h3>
                            <Chips label={t('Día')} options={_getDayOptionsCon(t, initialDaysAgo)} value={daysAgo} onChange={setDaysAgo} disabled={phase === 'saving'} />
                        </section>

                        {/* [P1-PHOTO-DEDUCTS · 2026-08-07] Componentes detectados,
                            confirmables uno a uno. Sólo los marcados se descuentan
                            de la Nevera.

                            Se renderiza sólo si el vision agent detectó algo: un
                            bloque vacío con el título "De tu Nevera" sugeriría que
                            el escáner falló, cuando lo normal en platos difíciles
                            de desglosar es simplemente registrar macros. */}
                        {components.length > 0 && (
                            <section className={`${styles.section} ${styles.componentsBlock}`} aria-labelledby="scan-q-nevera">
                                <h3 id="scan-q-nevera" className={styles.sectionTitle}>
                                    {neveraConCosas === false ? t('Ingredientes que detectamos') : t('Descontar de tu Nevera')}
                                </h3>
                                <p className={styles.componentsHint}>
                                    {t('Lo detectamos en la foto. Desmarca lo que no lleve o ajusta la cantidad.')}
                                </p>
                                {components.map((c, i) => (
                                    <label key={`${c.name}-${i}`} className={styles.componentRow}>
                                        <input
                                            type="checkbox"
                                            checked={c.checked}
                                            disabled={phase === 'saving'}
                                            onChange={() => setComponents((prev) => prev.map(
                                                (x, j) => (j === i ? { ...x, checked: !x.checked } : x)
                                            ))}
                                            aria-label={neveraConCosas === false
                                                ? t('Incluir {nombre}', { nombre: c.name })
                                                : t('Descontar {nombre} de tu Nevera', { nombre: c.name })}
                                        />
                                        <input
                                            type="number"
                                            className={styles.componentQty}
                                            value={c.quantity}
                                            min="0"
                                            step="0.5"
                                            disabled={phase === 'saving' || !c.checked}
                                            onChange={(e) => {
                                                // Number('') es 0 y Number('abc') es NaN:
                                                // ambos dejarían una fila que el filtro
                                                // del submit descarta en silencio. Se
                                                // clampa a 0 y el filtro (>0) la excluye
                                                // de forma explícita.
                                                const n = Number(e.target.value);
                                                const q = Number.isFinite(n) && n > 0 ? n : 0;
                                                setComponents((prev) => prev.map(
                                                    (x, j) => (j === i ? { ...x, quantity: q } : x)
                                                ));
                                            }}
                                            aria-label={t('Cantidad de {nombre}', { nombre: c.name })}
                                        />
                                        <span className={styles.componentName}>
                                            {/* El nombre del alimento y la unidad vienen del
                                                catálogo/vision agent: solo se traduce el nexo. */}
                                            {/* [P1-PLAN-LOTE-165] la unidad del escáner se glosa (el nombre no: es del motor) */}
                                            {t('{unidad} de {nombre}', { unidad: glossUnitWord(c.unit, t), nombre: c.name })}
                                        </span>
                                    </label>
                                ))}
                            </section>
                        )}
                    </div>
                )}
                </div>

                {/* Pie FIJO (solo en revisión): «Volver a escanear» discreto y «Registrar comida» protagonista,
                    siempre a la vista — antes se perdía bajo el borde de la tarjeta en el teléfono. */}
                {enRevision && (
                    <div className={styles.footer}>
                        <div className={styles.actions}>
                            <button
                                className={styles.retakeBtn}
                                onClick={() => { _setPreviewUrl(null); setPhase('select'); setError(null); }}
                                disabled={phase === 'saving'}
                            >
                                {t('Volver a escanear')}
                            </button>
                            <button
                                className={styles.saveBtn}
                                onClick={handleSave}
                                disabled={phase === 'saving'}
                            >
                                {phase === 'saving'
                                    ? <><Loader2 size={16} className={styles.spinner} /> {t('Registrando…')}</>
                                    : <><Check size={16} /> {t('Registrar comida')}</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* [P1-SCANNER-SHARED · 2026-08-10] El mismo visor del escáner de la Nevera.
            Se queda abierto mientras la IA analiza (foto congelada + «Analizando…»)
            y se cierra al terminar — `handleViewfinderCapture` espera a `handleFile`,
            que resuelve cuando el análisis acabó. */}
        <CameraViewfinder
            isOpen={viewfinderOpen}
            title={t('Escanear tu plato')}
            hint={t('Encuadra el plato completo, de frente')}
            busy={phase === 'scanning'}
            busyHint={t('Estimando las macros…')}
            busyHintLong={t('Todavía analizando — la foto tenía mucho detalle')}
            fileName="plato.jpg"
            onCapture={handleViewfinderCapture}
            onClose={() => setViewfinderOpen(false)}
            onFallbackToFile={handleViewfinderFallback}
        />
        </>
    );
};

ScanMealModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    userId: PropTypes.string.isRequired,
    initialDaysAgo: PropTypes.number,
};

// [P3-SCAN-MACRO-INPUT-EMPTY · movido a common/MacroInput por P1-MANUAL-FOOD-LOG]
// La lógica del buffer vacío vive ahora en UN sitio; este modal solo aporta su piel
// vía `classes` (ver _MACRO_CLASSES arriba del render).


export default ScanMealModal;
