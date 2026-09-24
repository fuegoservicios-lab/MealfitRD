import { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    Camera, Image as ImageIcon, Loader2, Check, X, AlertTriangle, ChevronRight, ChevronDown, Trash2, RotateCcw,
    Refrigerator,
} from 'lucide-react';
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
// [P1-PLAN-LOTE-221] y VARIAS fotos: un plato por foto, hasta 4, como en el chat
import { isNativeApp } from '../../config/platform';
import { chooseNativeGalleryImages, isNativePickerCancellation } from '../../utils/nativeChatImagePicker';
import { captureException } from '../../utils/observability';
// [P1-SCANNER-SHARED · 2026-08-10] El visor en vivo es SSOT compartido con el
// escáner de la Nevera — no una segunda copia de 200 líneas.
import CameraViewfinder from '../common/CameraViewfinder';
import styles from './ScanMealModal.module.css';
// [P1-MANUAL-FOOD-LOG · 2026-08-11] El input de macros vive en common/, compartido con el componedor manual.
import MacroInput from '../common/MacroInput';
// [P1-PLAN-LOTE-221] La cantidad de cada ingrediente: «− [campo] +», sin el 0 que no se dejaba borrar.
import QuantityStepper from '../common/QuantityStepper';
import { useT, useTn, formatNumber } from '../../i18n';
import { glossUnitWord } from '../../utils/shoppingHelpers';
import { unidadParaCantidad } from '../../utils/cantidadIngrediente';
import { mensajeDeError } from '../../utils/errorCopy';
import { useTecladoDeHoja, estilosDeHojaConTeclado } from '../../hooks/useTecladoDeHoja';
// [P2-VISION-COUNTRY-COPY · 2026-08-21] SSOT de países del frontend (espejo del backend con
// test de paridad). Comparar contra 'DO' a mano aquí sería la tabla que P1-DIET-CANON-SSOT
// prohíbe.
import { coerceCountry, DEFAULT_COUNTRY, COUNTRY_SYSTEM_UI } from '../../config/countries';
import { useAssessment } from '../../context/AssessmentContext';
// [P1-NEVERA-OPCIONAL · 2026-09-23] Mismo SSOT que la nav del dashboard.
import { neveraActiva } from '../../config/dashboardNav';
import {
    getMealTypes as _getMealTypes,
    guessMealType as _guessMealType,
} from './mealLogShared';
// [P1-PLAN-LOTE-221] La cuenta de cada plato (lo derivado de los ingredientes, las correcciones a mano, lo que viaja
// al servidor) vive aparte y pura: ./scanMealDishes.js.
import {
    PORCIONES,
    MAX_PLATOS,
    platoDesdeAnalisis,
    macrosDelPlato,
    kcalDelComponente,
    conMacroTecleada,
    conPorcion,
    conCantidad,
    conComponenteAlternado,
    ingredientesParaGuardar,
    nombresSinRepetir,
    totalesDe,
} from './scanMealDishes';

// [P2-DIARY-SCAN-MACROS · 2026-05-30] Modal "Escanear comida → registrar macros".
//
// Flujo: el usuario toma/elige una foto → se sube a `POST /api/diary/upload`
// (que ya valida MIME + magic-bytes + 20MB y corre el vision agent) → el endpoint
// devuelve `meal_name` + `macros{calories,protein,carbs,healthy_fats}` estimadas y
// los componentes del plato. El modal precarga esos valores en campos EDITABLES y,
// al confirmar, hace `POST /api/diary/consumed` (el único surface que persiste a
// consumed_meals).
//
// Por qué confirmación editable y no auto-guardar: las estimaciones de visión
// no son exactas — meter macros sin revisar contamina el tracking y es difícil
// de corregir luego. El usuario revisa y ajusta antes de registrar.
//
// Tras registrar se dispara `mealfit:refresh-inventory` para que la tarjeta
// de progreso (TrackingProgress) refetchee al instante — mismo evento que usa el
// chat-agent tras log_consumed_meal.
//
// [P1-PLAN-LOTE-221 · 2026-09-24] Reconstruido tras la captura de un tester de Android («no me deja quitar el 0 para
// agregar otro número»), con lo que el dueño pidió encima: «también debería poder mandarse platos múltiples como en el
// agente IA chat… hazlo lo mejor y más cómodo posible para el usuario».
//  · VARIOS PLATOS: hasta 4 fotos por registro (galería con selección múltiple, o «¿Comiste algo más?» para añadir
//    con la cámara). Cada foto se analiza por su cuenta y en paralelo; la cámara ya no espera dentro del visor, así que
//    se puede fotografiar el siguiente plato mientras la IA mira el anterior. Una foto que falla no tumba a las demás:
//    su tarjeta dice por qué y ofrece reintentar o quitarla. «¿Qué comida es?» y «¿Cuándo?» valen para todo el
//    registro (es UNA comida con varios platos) y cada plato va a su propia fila del diario.
//  · LA CANTIDAD: «− [campo] +» (QuantityStepper). El campo deja borrar y escribir; los botones dan pasos con sentido.
//  · LAS MACROS SIGUEN A LOS INGREDIENTES: el servidor manda lo que aporta cada componente, así que desmarcar las
//    albóndigas o pasar de 2 a 1 taza mueve las calorías. Antes el total no se enteraba (ver scanMealDishes.js).
//  · «Descontar de mi Nevera» es un interruptor propio, como en el componedor: desmarcar un ingrediente ahora significa
//    «no lo comí», y no puede ser también «no salió de mi Nevera».
//
// Tooltip-anchor: P2-DIARY-SCAN-MACROS.

// La piel de MacroInput y del QuantityStepper en ESTE modal (la lógica compartida vive en common/).
const _MACRO_CLASSES = {
    field: styles.macroField,
    label: styles.macroLabel,
    wrap: styles.macroInputWrap,
    input: styles.macroInput,
    unit: styles.macroUnit,
};
const _STEPPER_CLASSES = {
    wrap: styles.stepper,
    btn: styles.stepperBtn,
    input: styles.componentQty,
};

// Los rótulos de los presets de porción: símbolos, no palabras (no se traducen).
const _ETIQUETA_PORCION = { 0.5: '½×', 1: '1×', 1.5: '1½×', 2: '2×' };

// Validación cliente antes de subir (el backend revalida; esto es UX rápida).
const _ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const _MAX_BYTES = 20 * 1024 * 1024;

// Las miniaturas (`blob:`) de las fotos: se anotan al crearlas y se sueltan al quitar el plato o al cerrar.
const _crearUrl = (anotadas, file) => {
    try {
        const u = URL.createObjectURL(file);
        anotadas.add(u);
        return u;
    } catch { return null; }
};
const _soltarUrls = (anotadas, lista = [...anotadas]) => {
    for (const u of lista) {
        if (!u) continue;
        try { URL.revokeObjectURL(u); } catch { /* el navegador ya la soltó */ }
        anotadas.delete(u);
    }
};

// [P1-MEAL-SCAN-GEMMA · 2026-07-12] Reescala client-side antes de subir —
// mismo patrón que el escáner de Nevera (PantryScanButton): una foto de celular
// de 4000px (~8MB) tardaría mucho solo en viajar. 1024px JPEG ~150KB analiza
// igual de bien. Si el browser no puede decodificar el formato (HEIC en Chrome
// desktop), el caller cae al archivo original (el backend lo acepta).
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

/** Una fila de «Ingredientes que detectamos»: casilla (¿lo comiste?), nombre, lo que aporta y la cantidad. */
const FilaComponente = ({ c, idCasilla, bloqueado, onAlternar, onCantidad }) => {
    const t = useT();
    const kcal = kcalDelComponente(c);
    return (
        <li className={c.checked ? styles.componentRow : `${styles.componentRow} ${styles.componentOff}`}>
            <input
                id={idCasilla}
                type="checkbox"
                checked={c.checked}
                disabled={bloqueado}
                onChange={onAlternar}
                aria-label={t('Incluir {nombre}', { nombre: c.name })}
            />
            <div className={styles.componentMain}>
                <div className={styles.componentTop}>
                    {/* El nombre del alimento viene del motor y no se traduce (P1-I18N-DASHBOARD): solo se glosa la
                        unidad. Es un <label> de la casilla: tocar el nombre marca o desmarca. */}
                    <label htmlFor={idCasilla} className={styles.componentName}>{c.name}</label>
                    {kcal !== null && c.checked && <span className={styles.componentKcal}>{formatNumber(kcal)} kcal</span>}
                </div>
                <div className={styles.componentQtyRow}>
                    <QuantityStepper
                        value={c.qty}
                        unit={c.unit}
                        nombre={c.name}
                        disabled={bloqueado || !c.checked}
                        onChange={onCantidad}
                        classes={_STEPPER_CLASSES}
                    />
                    {/* [P1-PLAN-LOTE-165] la unidad del escáner se glosa (el nombre no: es del motor); con su plural */}
                    <span className={styles.componentUnit}>{glossUnitWord(unidadParaCantidad(c.unit, c.qty), t)}</span>
                </div>
            </div>
        </li>
    );
};

FilaComponente.propTypes = {
    c: PropTypes.object.isRequired,
    idCasilla: PropTypes.string.isRequired,
    bloqueado: PropTypes.bool,
    onAlternar: PropTypes.func.isRequired,
    onCantidad: PropTypes.func.isRequired,
};

/** Lo editable de UN plato: «¿Qué es?» y «¿Cuánto comiste?» (porción, macros e ingredientes). */
const EditorDePlato = ({ plato, bloqueado, onCambiar }) => {
    const t = useT();
    const m = macrosDelPlato(plato);
    const ids = `scan-${plato.id}`;
    return (
        <>
            <section className={styles.section} aria-labelledby={`${ids}-nombre`}>
                <h3 id={`${ids}-nombre`} className={styles.sectionTitle}>{t('¿Qué es?')}</h3>
                <input
                    type="text"
                    value={plato.nombre}
                    maxLength={200}
                    disabled={bloqueado}
                    onChange={(e) => { const v = e.target.value; onCambiar((p) => ({ ...p, nombre: v })); }}
                    className={styles.textInput}
                    placeholder={t('Ej: Mangú con salami')}
                    aria-label={t('Nombre')}
                />
            </section>

            <section className={styles.section} aria-labelledby={`${ids}-cuanto`}>
                <h3 id={`${ids}-cuanto`} className={styles.sectionTitle}>{t('¿Cuánto comiste?')}</h3>
                {/* [P1-MEAL-SCAN-POLISH] Porción en fila (`fieldRow`): los multiplicadores a lo ancho. */}
                <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('Porción')}</span>
                    <div className={styles.portionRow} role="group" aria-label={t('Porción')}>
                        {PORCIONES.map((p) => (
                            <button
                                key={p}
                                type="button"
                                className={`${styles.portionBtn} ${plato.porcion === p ? styles.portionActive : ''}`}
                                aria-pressed={plato.porcion === p}
                                disabled={bloqueado}
                                onClick={() => onCambiar((x) => conPorcion(x, p))}
                                title={t('Multiplica las macros estimadas; también puedes editarlas abajo')}
                            >
                                {_ETIQUETA_PORCION[p]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.macrosGrid}>
                    <MacroInput classes={_MACRO_CLASSES} label={t('Calorías')} unit="kcal" value={m.calories}
                        onChange={(v) => onCambiar((x) => conMacroTecleada(x, 'calories', v))} />
                    <MacroInput classes={_MACRO_CLASSES} label={t('Proteína')} unit="g" value={m.protein}
                        onChange={(v) => onCambiar((x) => conMacroTecleada(x, 'protein', v))} />
                    <MacroInput classes={_MACRO_CLASSES} label={t('Carbohidratos')} unit="g" value={m.carbs}
                        onChange={(v) => onCambiar((x) => conMacroTecleada(x, 'carbs', v))} />
                    <MacroInput classes={_MACRO_CLASSES} label={t('Grasas')} unit="g" value={m.healthy_fats}
                        onChange={(v) => onCambiar((x) => conMacroTecleada(x, 'healthy_fats', v))} />
                </div>

                {/* [P1-PHOTO-DEDUCTS · 2026-08-07] Componentes detectados, confirmables uno a uno. Se pinta solo si la
                    IA detectó algo: un bloque vacío sugeriría que el escáner falló, cuando lo normal en platos
                    difíciles de desglosar es registrar las macros. [P1-PLAN-LOTE-221] Con desglose, cada fila mueve
                    las macros de arriba. */}
                {plato.componentes.length > 0 && (
                    <div className={styles.componentsBlock}>
                        <h4 className={styles.componentsTitle}>{t('Ingredientes que detectamos')}</h4>
                        <p className={styles.componentsHint}>
                            {plato.desglose
                                ? t('Desmarca lo que no comiste o ajusta la cantidad: las calorías se recalculan solas.')
                                : t('Lo detectamos en la foto. Desmarca lo que no lleve o ajusta la cantidad.')}
                        </p>
                        <ul className={styles.componentList}>
                            {plato.componentes.map((c) => (
                                <FilaComponente
                                    key={c.key}
                                    c={c}
                                    idCasilla={`${ids}-c${c.key}`}
                                    bloqueado={bloqueado}
                                    onAlternar={() => onCambiar((x) => conComponenteAlternado(x, c.key))}
                                    onCantidad={(q) => onCambiar((x) => conCantidad(x, c.key, q))}
                                />
                            ))}
                        </ul>
                    </div>
                )}
            </section>
        </>
    );
};

EditorDePlato.propTypes = {
    plato: PropTypes.object.isRequired,
    bloqueado: PropTypes.bool,
    onCambiar: PropTypes.func.isRequired,
};

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
    const t = useT();
    const tn = useTn();
    const isCoarsePointer = useMediaQuery('(pointer: coarse)');
    // [P1-PLAN-LOTE-221] Los platos de este registro, en el orden en que llegaron las fotos. Cada uno:
    // { id, file, previewUrl, estado: 'analizando' | 'listo' | 'error', fallo, guardado, …campos de scanMealDishes }.
    const [platos, setPlatos] = useState([]);
    const platosRef = useRef([]);
    useEffect(() => { platosRef.current = platos; }, [platos]);
    // Con varios platos, el que está abierto para editar (los demás se ven resumidos).
    const [abierto, setAbierto] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const [mealType, setMealType] = useState(_guessMealType);
    // [P1-PLAN-LOTE-106] el día de la comida: 0 = hoy · 1 = ayer · 2 = antier
    const [daysAgo, setDaysAgo] = useState(() => normalizarDiasAtras(initialDaysAgo));
    // [P1-PLAN-LOTE-221] El interruptor de la Nevera, encendido como siempre: lo marcado se descuenta.
    const [descontarNevera, setDescontarNevera] = useState(true);
    const [viewfinderOpen, setViewfinderOpen] = useState(false);
    const controladores = useRef(new Map());
    const urls = useRef(new Set());
    const secuencia = useRef(0);

    // UNA sola lectura del contexto: el perfil (la Nevera, aquí) y el formulario (el país, más abajo). `|| {}`: este
    // modal se renderiza AISLADO en sus tests (y podría montarse fuera del provider en un futuro shell), y sin la
    // guarda `useAssessment()` devuelve undefined y el destructuring revienta el componente entero.
    const { userProfile: _perfilNevera, formData: _scanFormData } = useAssessment() || {};
    // [P1-NEVERA-OPCIONAL · 2026-09-23] Con la Nevera apagada (modo contador, apagada a mano o automáticamente tras
    // 48 h vacía) no hay inventario que consultar: se trata como VACÍA. Mismo SSOT que la nav (`neveraActiva`).
    const _neveraOn = neveraActiva(_perfilNevera);
    // [P1-PLAN-LOTE-162 · 2026-09-22] ¿Hay algo en la Nevera? `null` = no se sabe. Quien usa la app como contador casi
    // nunca la llena, y cada foto terminaba en «Descontamos 0 de tu Nevera. No estaban registrados: arroz, pollo…».
    // [P1-NEVERA-OPCIONAL · ola final] Lo LEÍDO (`neveraLeida`) y lo que ven los rótulos (`neveraConCosas`) van
    // separados: el modal vive siempre montado y el perfil cambia debajo de él.
    const [neveraLeida, setNeveraLeida] = useState(null);
    const hayComponentes = platos.some((p) => p.estado === 'listo' && p.componentes?.length > 0);
    useEffect(() => {
        if (!_neveraOn) return undefined;   // apagada: jamás se pide el inventario
        if (!hayComponentes || neveraLeida !== null || !userId) return undefined;
        let cancelado = false;
        (async () => {
            try {
                const res = await fetchWithAuth('/api/inventory');
                if (!res.ok || cancelado) return;
                const datos = await res.json();
                const items = Array.isArray(datos?.items) ? datos.items : null;
                if (items && !cancelado) setNeveraLeida(items.some((it) => Number(it?.quantity) > 0));
            } catch { /* se queda en «no se sabe»: la conducta de antes */ }
        })();
        return () => { cancelado = true; };
    }, [_neveraOn, hayComponentes, neveraLeida, userId]);
    const neveraConCosas = _neveraOn ? neveraLeida : false;

    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const bodyRef = useRef(null);

    const listos = platos.filter((p) => p.estado === 'listo');
    const pendientes = listos.filter((p) => !p.guardado);
    const analizando = platos.some((p) => p.estado === 'analizando');
    const fallidos = platos.filter((p) => p.estado === 'error').length;
    const unSolo = platos.length === 1;
    const enRevision = listos.length > 0;
    // Deslizar para cerrar se bloquea también mientras se analiza: un roce accidental tiraría las fotos. La X y el
    // «atrás» siguen cerrando (cancelan lo que esté en vuelo): son una decisión, no un accidente.
    const isBusy = guardando || analizando;

    // [P2-VISION-COUNTRY-COPY · 2026-08-21] El país del usuario, sólo para decidir si se
    // muestra el aviso de calibración del escáner. Sale de la MISMA lectura de
    // `useAssessment()` que el perfil de la Nevera (arriba), con su guarda `|| {}`.
    const country = _scanFormData?.country;
    const { containerRef } = useModalAccessibility({
        isOpen,
        onClose,
        disableClose: guardando, // no cerrar mientras se registra (operación en vuelo)
    });
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose, disabled: isBusy });
    // [P1-PLAN-LOTE-165 · 2026-09-22] En el iPhone el teclado tapaba el pie de la revisión: la hoja sube por encima.
    const teclado = estilosDeHojaConTeclado(useTecladoDeHoja(isOpen));

    // Reset completo al cerrar para no arrastrar estado entre registros (el modal vive montado en el panel). El estado
    // se reajusta DURANTE el render al ver el cambio de `isOpen` (el patrón de React para estado derivado de una prop);
    // lo que no es estado —cancelar análisis en vuelo, soltar las miniaturas— va en el efecto de abajo.
    const [abiertoAntes, setAbiertoAntes] = useState(isOpen);
    if (isOpen !== abiertoAntes) {
        setAbiertoAntes(isOpen);
        if (!isOpen) {
            setPlatos([]);
            setAbierto(null);
            setGuardando(false);
            setError(null);
            setMealType(_guessMealType());
            setDaysAgo(normalizarDiasAtras(initialDaysAgo));
            setDescontarNevera(true);
            setViewfinderOpen(false);
        }
    }
    useEffect(() => {
        if (isOpen) return undefined;
        controladores.current.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
        controladores.current.clear();
        _soltarUrls(urls.current);
        platosRef.current = [];
        return undefined;
    }, [isOpen]);

    useEffect(() => {
        // Cleanup final al desmontar el componente: el Map y el Set son los mismos toda la vida del modal.
        const enVuelo = controladores.current;
        const anotadas = urls.current;
        return () => {
            enVuelo.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
            _soltarUrls(anotadas);
        };
    }, []);

    const _ponerPlato = useCallback((id, cambios) => {
        setPlatos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
    }, []);

    // Un plato a la IA. Resuelve cuando el análisis terminó; cada foto por su cuenta (una que falla no tumba a otra).
    const analizar = useCallback(async (id, file) => {
        controladores.current.get(id)?.abort();
        const ctl = new AbortController();
        controladores.current.set(id, ctl);
        _ponerPlato(id, { estado: 'analizando', fallo: null });
        const fallar = (mensaje, reintentable) => _ponerPlato(id, { estado: 'error', fallo: { mensaje, reintentable } });
        try {
            // [P1-MEAL-SCAN-GEMMA] Reescala a ≤1024px JPEG; si el browser no
            // decodifica el formato (HEIC/desktop), sube el original tal cual.
            let uploadFile = file;
            try {
                uploadFile = await _downscaleToJpegFile(file);
            } catch (_e) { /* fallback al original */ }
            if (ctl.signal.aborted) return;

            const fd = new FormData();
            fd.append('file', uploadFile, uploadFile.name || 'meal.jpg');
            fd.append('user_id', userId);
            fd.append('tz_offset_mins', String(new Date().getTimezoneOffset()));

            // fetchWithAuth NO setea Content-Type → el browser pone el boundary
            // multipart correcto (mismo patrón que AgentPage.jsx).
            const res = await fetchWithAuth('/api/diary/upload', { method: 'POST', body: fd, signal: ctl.signal });
            const data = await res.json().catch(() => null);
            if (ctl.signal.aborted) return;

            if (!res.ok || !data?.success) {
                // [P1-PLAN-LOTE-221] Cada foto dice lo suyo, con el copy del chat para los mismos códigos.
                if (res.status === 413) fallar(t('La imagen es muy grande (máx. 20 MB).'), false);
                else if (res.status === 415) fallar(t('Formato no soportado. Usa una foto JPG, PNG, WebP o HEIC.'), false);
                else if (res.status === 429) fallar(t('Vas muy rápido escaneando fotos. Espera unos segundos y reintenta.'), true);
                else fallar(t('No pudimos analizar la imagen. Revisa tu conexión e intenta de nuevo.'), true);
                return;
            }
            // «Ocupado» se resuelve en segundos — mensaje distinto de «caído».
            if (data.busy) {
                fallar(t('El escáner está procesando otra foto — dale unos segundos e intenta de nuevo.'), true);
                return;
            }
            // [P2-DIARY-SCAN-MACROS · 2026-05-30] Distingue "analizador caído"
            // (timeout / límite de la IA / sin saldo) de "no es comida".
            if (data.analysis_failed) {
                fallar(t('El analizador de imágenes no está disponible ahora mismo. Intenta de nuevo en unos minutos.'), true);
                return;
            }
            // [P1-CHAT-VISION-GEMMA · 2026-07-12] La foto es una COMPRA o
            // alimentos sueltos, no un plato — registrar 0 kcal contaminaría
            // el tracking. Redirigir a los flujos de Nevera.
            if (data.photo_kind === 'items') {
                // [P1-NEVERA-OPCIONAL · 2026-09-23] Con la Nevera apagada, «llévalos a tu Nevera» no es un camino que
                // exista: el aviso solo pide una foto del plato ya servido.
                fallar(_neveraOn
                    ? t('Esto parece una compra o alimentos sueltos, no un plato servido. Para llevarlos a tu Nevera usa "Escanear mi nevera" (página Nevera) o mándale la foto al Agente.')
                    : t('Esto parece una compra o alimentos sueltos, no un plato servido. Fotografía el plato ya servido para registrarlo.'), false);
                return;
            }
            if (!data.is_food) {
                fallar(t('No detectamos comida en la foto. Intenta con otra toma del plato.'), false);
                return;
            }

            // [P1-PHOTO-DEDUCTS · 2026-08-07] Los componentes nacen MARCADOS: el caso común es que la detección sea
            // correcta; desmarcar es la excepción (no lo comió, o el modelo lo alucinó).
            _ponerPlato(id, { estado: 'listo', fallo: null, ...platoDesdeAnalisis(data, t('Comida escaneada')) });
            // Se abre para editar si no había otro abierto: el usuario lo acaba de pedir.
            setAbierto((a) => a ?? id);
            if (data.red_alert) {
                toast.warning(t('Comida alta en calorías a una hora poco habitual.'));
            }
        } catch (err) {
            if (err?.name === 'AbortError' || ctl.signal.aborted) return;
            console.error('Error escaneando comida:', err);
            fallar(t('No pudimos analizar la imagen. Revisa tu conexión e intenta de nuevo.'), true);
        } finally {
            if (controladores.current.get(id) === ctl) controladores.current.delete(id);
        }
    }, [userId, t, _neveraOn, _ponerPlato]);

    // Las fotos elegidas (galería, cámara del sistema o visor), en platos nuevos. Lo que no cabe o no es una imagen
    // válida se dice; lo demás se analiza ya.
    const agregarFotos = useCallback((lista) => {
        const files = Array.from(lista || []).filter(Boolean);
        if (!files.length) return;
        setError(null);
        const libres = MAX_PLATOS - platosRef.current.length;
        if (libres <= 0) {
            setError(t('Caben {n} platos por registro. Registra estos o quita alguno para añadir otro.', { n: MAX_PLATOS }));
            return;
        }
        const validos = [];
        let aviso = null;
        for (const file of files) {
            const declaredType = (file.type || '').toLowerCase();
            if (declaredType && !_ALLOWED_TYPES.includes(declaredType)) {
                aviso = t('Formato no soportado. Usa una foto JPG, PNG, WebP o HEIC.');
                continue;
            }
            if (file.size > _MAX_BYTES) {
                aviso = t('La imagen es muy grande (máx. 20 MB).');
                continue;
            }
            validos.push(file);
        }
        if (validos.length > libres) {
            aviso = t('Caben {n} platos por registro: usamos las primeras fotos.', { n: MAX_PLATOS });
        }
        if (aviso) setError(aviso);
        const entran = validos.slice(0, libres);
        if (!entran.length) return;
        const nuevos = entran.map((file) => ({
            id: `plato-${++secuencia.current}`,
            file,
            previewUrl: _crearUrl(urls.current, file),
            estado: 'analizando',
            fallo: null,
            guardado: false,
        }));
        // Mientras se analizan los nuevos, ninguno queda abierto: al terminar se abre el primero que esté listo.
        if (platosRef.current.length > 0) setAbierto(null);
        platosRef.current = [...platosRef.current, ...nuevos];
        setPlatos((prev) => [...prev, ...nuevos]);
        nuevos.forEach((p) => { void analizar(p.id, p.file); });
    }, [analizar, t]);

    const quitarPlato = useCallback((id) => {
        controladores.current.get(id)?.abort();
        controladores.current.delete(id);
        const p = platosRef.current.find((x) => x.id === id);
        if (p) _soltarUrls(urls.current, [p.previewUrl]);
        platosRef.current = platosRef.current.filter((x) => x.id !== id);
        setPlatos((prev) => prev.filter((x) => x.id !== id));
        setAbierto((a) => (a === id ? null : a));
        setError(null);
    }, []);

    const reintentar = useCallback((id) => {
        const p = platosRef.current.find((x) => x.id === id);
        if (p?.file) void analizar(id, p.file);
    }, [analizar]);

    const cambiarPlato = useCallback((id, fn) => {
        setPlatos((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
    }, []);

    const onCameraChange = (e) => { agregarFotos(e.target.files); e.target.value = ''; };
    const onGalleryChange = (e) => { agregarFotos(e.target.files); e.target.value = ''; };

    // [P1-SCANNER-SHARED · 2026-08-10] Visor en vivo en el móvil, el MISMO que usa el escáner de la Nevera.
    // [P1-PLAN-LOTE-221] El visor se cierra al disparar: el análisis sigue en la tarjeta del plato, y mientras tanto se
    // puede fotografiar el siguiente. Antes se quedaba abierto hasta que la IA terminaba (un plato cada vez).
    const hasCameraApi = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    const useLiveViewfinder = isCoarsePointer && hasCameraApi;

    const handleViewfinderCapture = useCallback((file) => {
        setViewfinderOpen(false);
        agregarFotos([file]);
    }, [agregarFotos]);

    // Con cámara real → visor in-app. Sin ella (tablet sin cámara, permiso de navegador raro) se conserva el
    // `<input capture>` de siempre: la salida degradada sigue existiendo.
    const openCamera = useCallback(() => {
        if (useLiveViewfinder) setViewfinderOpen(true);
        else cameraInputRef.current?.click();
    }, [useLiveViewfinder]);

    // [P1-PLAN-LOTE-105 · 2026-09-18] «Elegir de galería» en la app nativa abre la fototeca DIRECTA con el plugin
    // (el input de la web dispara la hoja de iOS de tres opciones, que el dueño no quería). Cancelar no es error;
    // cualquier otro fallo cae al input de siempre para no dejar al usuario sin camino.
    const openGallery = useCallback(async () => {
        if (!isNativeApp()) { galleryInputRef.current?.click(); return; }
        try {
            const files = await chooseNativeGalleryImages(Math.max(1, MAX_PLATOS - platosRef.current.length));
            if (files?.length) agregarFotos(files);
        } catch (err) {
            if (isNativePickerCancellation(err)) return;
            // [P1-PLAN-LOTE-107 · 2026-09-18] El fallo del selector nativo NO puede ser silencioso: caer callado
            // al input de la web enseña otra vez la hoja de tres opciones de iOS y desde fuera es indistinguible
            // de «no se hizo nada». Se reporta, se dice con su código —un pantallazo basta para diagnosticar— y
            // DESPUÉS se abre el input para no dejar al usuario sin camino.
            try { captureException(err, { tags: { component: 'ScanMealModal', action: 'native_gallery_picker' } }); } catch { /* best-effort */ }
            const codigo = String(err?.code || err?.message || 'desconocido').slice(0, 80);
            toast.error(t('No pudimos abrir tus fotos. Revisa los permisos e inténtalo de nuevo.'), { description: `[${codigo}]` });
            galleryInputRef.current?.click();
        }
    }, [agregarFotos, t]);

    // [P1-PLAN-LOTE-110 · 2026-09-19] «Subir una foto en su lugar» (la salida del visor) hacía click al input de la
    // web: en la app nativa eso es OTRA VEZ la hoja de tres opciones de iOS que el lote 105 quitó de «Elegir de
    // galería». Las dos entradas a la fototeca pasan por `openGallery`, que decide nativo/web.
    const handleViewfinderFallback = useCallback(() => {
        setViewfinderOpen(false);
        void openGallery();
    }, [openGallery]);

    const registrar = useCallback(async () => {
        const porGuardar = platosRef.current.filter((p) => p.estado === 'listo' && !p.guardado);
        if (!porGuardar.length || guardando) return;
        const sinNombre = porGuardar.find((p) => !String(p.nombre || '').trim());
        if (sinNombre) {
            setAbierto(sinNombre.id);
            setError(t('Ponle un nombre a la comida.'));
            return;
        }
        setError(null);
        setGuardando(true);
        // Numerados sobre TODOS los platos listos (también los ya registrados): si «Jugo de chinola (2)» falla, el
        // reintento lo manda con su «(2)» y no como un segundo «Jugo de chinola» que el servidor tomaría por un doble toque.
        const listosTodos = platosRef.current.filter((p) => p.estado === 'listo');
        const nombreFinal = new Map(nombresSinRepetir(listosTodos.map((p) => p.nombre)).map((n, i) => [listosTodos[i].id, n]));
        // [P1-PLAN-LOTE-221] Con la Nevera apagada nunca se pide la resta; encendida, lo decide el interruptor.
        const descontar = _neveraOn && descontarNevera;
        const registrados = [];
        // En serie y no en paralelo: los descuentos de la Nevera de un plato no compiten con los del siguiente, y si
        // uno falla los anteriores ya quedaron (se marcan) y el reintento no los duplica.
        for (let i = 0; i < porGuardar.length; i += 1) {
            const p = porGuardar[i];
            const nombre = (nombreFinal.get(p.id) || String(p.nombre).trim()).slice(0, 200);
            const macros = macrosDelPlato(p);
            try {
                const res = await fetchWithAuth('/api/diary/consumed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        meal_name: nombre,
                        meal_type: mealType,
                        calories: macros.calories,
                        protein: macros.protein,
                        carbs: macros.carbs,
                        healthy_fats: macros.healthy_fats,
                        // [P1-PLAN-LOTE-106] el día elegido en «¿Cuándo?» (0 = hoy); el backend retrodata `consumed_at`
                        days_ago: daysAgo,
                        // [P1-PHOTO-DEDUCTS · 2026-08-07] Solo los MARCADOS, con el formato que `_parse_quantity`
                        // entiende desde siempre: "<qty> <unit> de <nombre>". Se guardan con la comida (son su
                        // detalle) y, si el interruptor lo pide, se descuentan de la Nevera.
                        ingredients: ingredientesParaGuardar(p),
                        deduct_pantry: descontar,
                    }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok || !data?.success) {
                    // [P1-PLAN-LOTE-165] el `message`/`detail` del servidor no se pinta tal cual: por código, o el propio.
                    const msg = res.status === 429
                        ? t('Demasiadas solicitudes seguidas. Espera un momento y reintenta.')
                        : mensajeDeError(data, t('No pudimos registrar la comida. Intenta de nuevo.'), t);
                    throw Object.assign(new Error(msg), { paraMostrar: true });
                }
                registrados.push({ nombre, kcal: macros.calories, data });
                _ponerPlato(p.id, { guardado: true });
            } catch (err) {
                console.error('Error registrando comida:', err);
                if (registrados.length) window.dispatchEvent(new Event('mealfit:refresh-inventory'));
                setGuardando(false);
                setAbierto(p.id);
                const motivo = err?.paraMostrar ? err.message : t('No pudimos registrar la comida. Intenta de nuevo.');
                setError(registrados.length
                    ? t('No pudimos registrar «{nombre}»; los platos anteriores sí quedaron en tu diario. {motivo}', { nombre, motivo })
                    : motivo);
                return;
            }
        }

        // Refresca la tarjeta de progreso (mismo evento que usa el chat).
        window.dispatchEvent(new Event('mealfit:refresh-inventory'));
        const nuevos = registrados.filter((r) => !r.data.already_logged);
        if (!nuevos.length) {
            toast.info(t('Esa comida ya estaba registrada hace un momento.'));
            onClose();
            return;
        }
        // [P1-PHOTO-DEDUCTS · 2026-08-07] Decir QUÉ no bajó de la Nevera. Callarlo dejaría al usuario creyendo que se
        // descontó todo lo que confirmó. Que un ingrediente no esté registrado es normal, no un error.
        // Sin repetir: dos platos pueden llevar el mismo ingrediente que no estaba.
        const ausentes = [...new Set(nuevos.flatMap((r) => (Array.isArray(r.data.not_in_pantry) ? r.data.not_in_pantry : [])))];
        const bajaron = nuevos.reduce((n, r) => n
            + (Array.isArray(r.data.deducted) ? r.data.deducted.length : 0)
            + (Array.isArray(r.data.inferred) ? r.data.inferred.length : 0), 0);
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
        const kcalTotal = nuevos.reduce((s, r) => s + r.kcal, 0);
        toast.success(
            nuevos.length === 1
                ? t('{nombre} registrada ({kcal} kcal).', { nombre: nuevos[0].nombre, kcal: nuevos[0].kcal })
                : tn(nuevos.length, '{n} plato registrado ({kcal} kcal).', '{n} platos registrados ({kcal} kcal).',
                    { n: nuevos.length, kcal: formatNumber(kcalTotal) }),
            descripcion ? { description: descripcion } : undefined
        );
        onClose();
    }, [guardando, _neveraOn, descontarNevera, userId, mealType, daysAgo, neveraConCosas, onClose, t, tn, _ponerPlato]);

    const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
    }, [isBusy, onClose]);

    if (!isOpen) return null;

    // «¿Comiste algo más?» cuando hay algo en marcha o listo; si todas las fotos fallaron, la salida es su propio aviso.
    const puedeAgregar = platos.some((p) => p.estado !== 'error') && platos.length < MAX_PLATOS && !guardando;
    const mostrarNevera = _neveraOn && neveraConCosas !== false
        && pendientes.some((p) => p.componentes.some((c) => c.checked));
    const totales = totalesDe(pendientes);

    // El aviso de una foto que falló, con lo que se puede hacer.
    const renderFallo = (p) => (
        <div className={styles.platoFallo} role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span className={styles.platoFalloTxt}>{p.fallo?.mensaje}</span>
            <span className={styles.platoFalloAcciones}>
                {p.fallo?.reintentable && (
                    <button type="button" className={styles.linkBtn} onClick={() => reintentar(p.id)} disabled={guardando}>
                        <RotateCcw size={14} aria-hidden="true" /> {t('Reintentar')}
                    </button>
                )}
                {unSolo && (
                    <button type="button" className={styles.linkBtn} onClick={() => quitarPlato(p.id)}>
                        {t('Usar otra foto')}
                    </button>
                )}
            </span>
        </div>
    );

    // Un solo plato: la foto arriba (grande mientras se analiza, en banner al revisar) y el editor debajo.
    const renderUnSolo = (p) => (
        <>
            <div className={`${styles.previewWrap} ${p.estado !== 'analizando' ? styles.previewCompact : ''}`}>
                {p.previewUrl && <img src={p.previewUrl} alt={t('Foto de la comida')} className={styles.previewImg} />}
                {p.estado === 'analizando' && (
                    <div className={styles.scanningOverlay}>
                        <Loader2 size={28} className={styles.spinner} aria-hidden="true" />
                        <span>{t('Analizando tu plato… puede tardar un minuto')}</span>
                    </div>
                )}
                {/* [P1-PLAN-LOTE-221] «Volver a escanear» vive sobre la foto que cambia, no en el pie: junto a
                    «Registrar comida» no cabían los dos en un teléfono de 360 px y el botón verde se cortaba. */}
                {p.estado === 'listo' && !guardando && (
                    <button type="button" className={styles.previewRetake} onClick={() => { quitarPlato(p.id); setError(null); }}>
                        <RotateCcw size={14} aria-hidden="true" /> {t('Volver a escanear')}
                    </button>
                )}
            </div>
            {p.estado === 'error' && renderFallo(p)}
            {p.estado === 'listo' && (
                <EditorDePlato
                    key={p.id}
                    plato={p}
                    bloqueado={guardando || p.guardado}
                    onCambiar={(fn) => cambiarPlato(p.id, fn)}
                />
            )}
        </>
    );

    // Varios platos: una tarjeta por plato, resumida; la abierta despliega su editor.
    const renderTarjeta = (p) => {
        const listo = p.estado === 'listo';
        const esAbierto = listo && !p.guardado && abierto === p.id;
        const m = listo ? macrosDelPlato(p) : null;
        const titulo = listo ? (p.nombre || t('Comida escaneada')) : (p.estado === 'analizando' ? t('Analizando tu plato…') : t('Foto sin analizar'));
        return (
            <li key={p.id} className={`${styles.platoCard} ${esAbierto ? styles.platoCardOpen : ''}`}>
                <div className={styles.platoHead}>
                    <button
                        type="button"
                        className={styles.platoToggle}
                        onClick={() => setAbierto((a) => (a === p.id ? null : p.id))}
                        disabled={!listo || p.guardado || guardando}
                        aria-expanded={listo && !p.guardado ? esAbierto : undefined}
                    >
                        <span className={styles.platoThumbWrap}>
                            {p.previewUrl && <img src={p.previewUrl} alt="" className={styles.platoThumb} />}
                            {p.estado === 'analizando' && (
                                <span className={styles.platoThumbSpin}><Loader2 size={18} className={styles.spinner} aria-hidden="true" /></span>
                            )}
                        </span>
                        <span className={styles.platoInfo}>
                            <span className={styles.platoNombre}>{titulo}</span>
                            {listo && (
                                <span className={styles.platoResumen}>
                                    {p.guardado
                                        ? <><Check size={13} aria-hidden="true" /> {t('Registrado')}</>
                                        : t('{kcal} kcal · {p} g proteína', { kcal: formatNumber(m.calories), p: m.protein })}
                                </span>
                            )}
                        </span>
                        {listo && !p.guardado && (
                            <ChevronDown size={18} className={`${styles.platoChev} ${esAbierto ? styles.platoChevOpen : ''}`} aria-hidden="true" />
                        )}
                    </button>
                    {!p.guardado && (
                        <button
                            type="button"
                            className={styles.platoQuitar}
                            onClick={() => quitarPlato(p.id)}
                            disabled={guardando}
                            aria-label={t('Quitar {nombre}', { nombre: titulo })}
                        >
                            <Trash2 size={17} aria-hidden="true" />
                        </button>
                    )}
                </div>
                {p.estado === 'error' && renderFallo(p)}
                {esAbierto && (
                    <div className={styles.platoEditor}>
                        <EditorDePlato
                            key={p.id}
                            plato={p}
                            bloqueado={guardando}
                            onCambiar={(fn) => cambiarPlato(p.id, fn)}
                        />
                    </div>
                )}
            </li>
        );
    };

    return (
        <>
        <div className={styles.overlay} onClick={handleOverlayClick} style={teclado.fondo}>
            {/* [P1-PLAN-LOTE-106 · 2026-09-18] La misma hoja que «Registrar comida» (lote 99): cabecera y pie FIJOS,
                cuerpo desplazable. En escritorio sigue centrada. */}
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
                        {/* [P1-PLAN-LOTE-102 · 2026-09-18] Sin icono en el título: repetía la cámara de «Usar la
                            cámara» a pocas líneas de distancia. */}
                        <div>
                            <h2 id="scan-meal-title" className={styles.title}>
                                {enRevision ? t('Revisa y registra') : t('Escanear comida')}
                            </h2>
                            {enRevision && (
                                <p className={styles.subtitle}>
                                    {platos.length > 1
                                        ? t('La IA estimó esto por las fotos. Corrige lo que no cuadre.')
                                        : t('La IA estimó esto por la foto. Corrige lo que no cuadre.')}
                                </p>
                            )}
                        </div>
                        <button
                            className={`${styles.closeBtn} ui-close`}
                            onClick={onClose}
                            disabled={guardando}
                            aria-label={t('Cerrar')}
                        >
                            <X size={20} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div ref={bodyRef} className={styles.body}>
                {error && (
                    <div className={styles.error} role="alert">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                {/* FASE 1: elegir la primera foto */}
                {platos.length === 0 && (
                    <>
                        <p className={styles.hint}>
                            {isCoarsePointer
                                ? t('Toma una foto de tu plato y la IA estimará las macros. Podrás revisarlas antes de registrar.')
                                : t('Sube una foto de tu plato y la IA estimará las macros. Podrás revisarlas antes de registrar.')}
                        </p>
                        {/* [P2-VISION-COUNTRY-COPY · 2026-08-21] La spec de visión ACEPTÓ que el escáner fuera
                            dominicano en v1, con una condición escrita: «se documenta en el copy del escáner para beta».
                            El prompt de `vision_agent.py` dice «Eres un nutricionista dominicano»; a un plato español o
                            mexicano le pone el nombre criollo más parecido. El modal deja editar nombre y macros antes
                            de guardar, así que el aviso es accionable y no un descargo. */}
                        {COUNTRY_SYSTEM_UI && coerceCountry(country) !== DEFAULT_COUNTRY && (
                            <p className={styles.hint}>
                                {t('El escáner está calibrado con cocina dominicana: fuera de RD puede nombrar tu plato con el criollo más parecido. Revisa el nombre y las macros antes de registrar.')}
                            </p>
                        )}
                        {/* [P3-SCAN-MODAL-POLISH · 2026-07-12] OPTION-CARDS estilo action-sheet: icono en tile + label +
                            sublabel + chevron. La cámara lleva el tile primary (acción recomendada). */}
                        <div className={styles.pickRow}>
                            {isCoarsePointer && (
                                <button className={styles.optionCard} onClick={openCamera}>
                                    <span className={`${styles.optionIco} ${styles.optionIcoPrimary}`}>
                                        <Camera size={20} strokeWidth={2.1} />
                                    </span>
                                    <span className={styles.optionTxt}>
                                        {/* [P1-SCAN-NO-VERB-ECHO · 2026-08-10] El rótulo NO repite el verbo del título
                                            («Escanear comida»): a estas dos filas solo les toca decir EN QUÉ SE
                                            DIFERENCIAN, que es de dónde sale la foto. */}
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
                                {/* En escritorio la galería es la ÚNICA acción, así que se queda el tile primario: no
                                    puede quedar una pantalla cuya única opción se ve como la secundaria. */}
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
                        {/* [P1-PLAN-LOTE-221] Que se sepa que se puede: como en el chat, varias fotos a la vez. */}
                        <p className={styles.multiHint}>
                            {t('¿Comiste varios platos? Puedes añadir hasta {n}, una foto por plato, y registrarlos juntos.', { n: MAX_PLATOS })}
                        </p>
                    </>
                )}

                {/* FASE 2: revisar/editar y registrar
                    [P1-PLAN-LOTE-106] Cuatro preguntas, en el orden en que se contestan, con la misma gramática que el
                    componedor: «¿Qué es?» (nombre), «¿Cuánto comiste?» (porción, macros e ingredientes) y, para todo
                    el registro, «¿Qué comida es?» y «¿Cuándo?» (chips, no desplegables). */}
                {platos.length > 0 && (
                    <div className={styles.reviewWrap}>
                        {unSolo
                            ? renderUnSolo(platos[0])
                            : <ul className={styles.platoList}>{platos.map(renderTarjeta)}</ul>}

                        {puedeAgregar && (
                            <div className={styles.addRow}>
                                <span className={styles.addLabel}>{t('¿Comiste algo más?')}</span>
                                <div className={styles.addBtns}>
                                    {isCoarsePointer && (
                                        <button type="button" className={styles.addBtn} onClick={openCamera}>
                                            <Camera size={16} aria-hidden="true" /> {t('Otra foto')}
                                        </button>
                                    )}
                                    <button type="button" className={styles.addBtn} onClick={openGallery}>
                                        <ImageIcon size={16} aria-hidden="true" /> {isCoarsePointer ? t('De la galería') : t('Añadir otro plato')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {enRevision && (
                            <>
                                <section className={styles.section} aria-labelledby="scan-q-tipo">
                                    <h3 id="scan-q-tipo" className={styles.sectionTitle}>{t('¿Qué comida es?')}</h3>
                                    <Chips
                                        label={t('Tipo de comida')}
                                        options={_getMealTypes(t)}
                                        value={mealType}
                                        onChange={setMealType}
                                        disabled={guardando}
                                    />
                                </section>

                                <section className={styles.section} aria-labelledby="scan-q-cuando">
                                    <h3 id="scan-q-cuando" className={styles.sectionTitle}>{t('¿Cuándo?')}</h3>
                                    <Chips label={t('Día')} options={_getDayOptionsCon(t, initialDaysAgo)} value={daysAgo} onChange={setDaysAgo} disabled={guardando} />
                                </section>

                                {/* [P1-PLAN-LOTE-221] El mismo interruptor que el componedor. Solo con la Nevera en uso
                                    y algo marcado que descontar. */}
                                {mostrarNevera && (
                                    <label className={styles.pantryToggle}>
                                        <input
                                            type="checkbox"
                                            checked={descontarNevera}
                                            disabled={guardando}
                                            onChange={(e) => setDescontarNevera(e.target.checked)}
                                        />
                                        <span className={styles.pantryIcon} aria-hidden="true"><Refrigerator size={18} /></span>
                                        <span className={styles.pantryText}>
                                            <span className={styles.pantryLabel}>{t('Descontar de mi Nevera')}</span>
                                            <span className={styles.pantrySub}>{t('Resta estos alimentos de lo que tienes guardado.')}</span>
                                        </span>
                                    </label>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Los inputs de archivo viven fuera de las fases: «¿Comiste algo más?» también los usa. */}
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
                    multiple
                    onChange={onGalleryChange}
                    className={styles.hiddenInput}
                    tabIndex={-1}
                />
                </div>

                {/* Pie FIJO (en revisión): «Registrar» protagonista y solo, siempre a la vista; con varios platos,
                    encima, el total de lo que se va a registrar. */}
                {enRevision && (
                    <div className={styles.footer}>
                        {!unSolo && pendientes.length > 0 && (
                            <p className={styles.footerTotal}>
                                {tn(pendientes.length, '{n} plato · {kcal} kcal', '{n} platos · {kcal} kcal',
                                    { n: pendientes.length, kcal: formatNumber(totales.calories) })}
                                {fallidos > 0 && (
                                    <span className={styles.footerNote}>
                                        {tn(fallidos, '{n} foto sin analizar no se registrará', '{n} fotos sin analizar no se registrarán', { n: fallidos })}
                                    </span>
                                )}
                            </p>
                        )}
                        <div className={styles.actions}>
                            <button
                                className={styles.saveBtn}
                                onClick={registrar}
                                disabled={guardando || analizando || pendientes.length === 0}
                            >
                                {guardando
                                    ? <><Loader2 size={16} className={styles.spinner} /> {t('Registrando…')}</>
                                    : analizando
                                        ? <><Loader2 size={16} className={styles.spinner} /> {t('Analizando…')}</>
                                        : <><Check size={16} /> {pendientes.length > 1
                                            ? tn(pendientes.length, 'Registrar {n} plato', 'Registrar {n} platos', { n: pendientes.length })
                                            : t('Registrar comida')}</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* [P1-SCANNER-SHARED · 2026-08-10] El mismo visor del escáner de la Nevera. [P1-PLAN-LOTE-221] Se cierra al
            disparar (`handleViewfinderCapture`): el análisis sigue en la tarjeta del plato. */}
        <CameraViewfinder
            isOpen={viewfinderOpen}
            title={t('Escanear tu plato')}
            hint={t('Encuadra el plato completo, de frente')}
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

export default ScanMealModal;
