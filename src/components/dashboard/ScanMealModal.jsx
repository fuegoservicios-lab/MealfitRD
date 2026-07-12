import { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Camera, Image as ImageIcon, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import styles from './ScanMealModal.module.css';

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

const _MEAL_TYPES = [
    { value: 'desayuno', label: 'Desayuno' },
    { value: 'almuerzo', label: 'Almuerzo' },
    { value: 'cena', label: 'Cena' },
    { value: 'merienda', label: 'Merienda' },
];

// Auto-detección del tipo de comida por la hora local. Editable después.
const _guessMealType = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'desayuno';
    if (h >= 11 && h < 15) return 'almuerzo';
    if (h >= 18 && h < 23) return 'cena';
    return 'merienda';
};

// Multiplicadores de porción rápidos. "Personalizado" se logra editando los
// campos a mano (los presets solo rellenan).
const _PORTIONS = [0.5, 1, 2];

// Límites espejo de ConsumedMealRequest (backend) — evita 422 en /consumed.
const _MAX = { calories: 10000, protein: 1000, carbs: 2000, healthy_fats: 1000 };

const _clampMacro = (key, raw) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, _MAX[key] ?? 100000);
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

const ScanMealModal = ({ isOpen, onClose, userId }) => {
    // phase: 'select' (elegir foto) | 'scanning' | 'review' | 'saving'
    const [phase, setPhase] = useState('select');
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [base, setBase] = useState({ calories: 0, protein: 0, carbs: 0, healthy_fats: 0 });
    const [multiplier, setMultiplier] = useState(1);
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

    const isBusy = phase === 'scanning' || phase === 'saving';

    const { containerRef } = useModalAccessibility({
        isOpen,
        onClose,
        disableClose: isBusy, // no cerrar mientras sube/guarda (operación en vuelo)
    });

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
            setMultiplier(1);
            setForm({
                meal_name: '',
                meal_type: _guessMealType(),
                calories: 0,
                protein: 0,
                carbs: 0,
                healthy_fats: 0,
            });
        }
    }, [isOpen, _setPreviewUrl]);

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
            setError('Formato no soportado. Usa una foto JPG, PNG, WebP o HEIC.');
            return;
        }
        if (file.size > _MAX_BYTES) {
            setError('La imagen es muy grande (máx. 20 MB).');
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
                throw new Error(data?.detail || 'No se pudo analizar la imagen.');
            }
            // [P1-MEAL-SCAN-GEMMA · 2026-07-12] La GPU local es single-flight:
            // "ocupado" se resuelve en segundos — mensaje distinto de "caído".
            if (data.busy) {
                _setPreviewUrl(null);
                setPhase('select');
                setError('El escáner está procesando otra foto — dale unos segundos e intenta de nuevo.');
                return;
            }
            // [P2-DIARY-SCAN-MACROS · 2026-05-30] Distingue "analizador caído"
            // (timeout / límite de la IA / sin saldo) de "no es comida" — antes
            // ambos caían en el mismo mensaje engañoso.
            if (data.analysis_failed) {
                _setPreviewUrl(null);
                setPhase('select');
                setError('El analizador de imágenes no está disponible ahora mismo. Intenta de nuevo en unos minutos.');
                return;
            }
            if (!data.is_food) {
                _setPreviewUrl(null);
                setPhase('select');
                setError('No detectamos comida en la foto. Intenta con otra toma del plato.');
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
            setMultiplier(1);
            setForm((prev) => ({
                ...prev,
                meal_name: (data.meal_name || '').slice(0, 200) || 'Comida escaneada',
                ...nextBase,
            }));
            setPhase('review');

            if (data.red_alert) {
                toast.warning('Comida alta en calorías a una hora poco habitual.');
            }
        } catch (err) {
            console.error('Error escaneando comida:', err);
            _setPreviewUrl(null);
            setPhase('select');
            setError('No pudimos analizar la imagen. Revisa tu conexión e intenta de nuevo.');
        }
    }, [userId, _setPreviewUrl]);

    const onCameraChange = (e) => { handleFile(e.target.files?.[0]); e.target.value = ''; };
    const onGalleryChange = (e) => { handleFile(e.target.files?.[0]); e.target.value = ''; };

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
            setError('Ponle un nombre a la comida.');
            return;
        }
        setError(null);
        setPhase('saving');
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
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data?.message || data?.detail || 'No se pudo registrar.');
            }
            // Refresca la tarjeta de progreso (mismo evento que usa el chat).
            window.dispatchEvent(new Event('mealfit:refresh-inventory'));
            toast.success(`${name} registrada (${form.calories} kcal).`);
            onClose();
        } catch (err) {
            console.error('Error registrando comida:', err);
            setPhase('review');
            setError('No pudimos registrar la comida. Intenta de nuevo.');
        }
    }, [form, userId, onClose]);

    const handleOverlayClick = useCallback((e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
    }, [isBusy, onClose]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={handleOverlayClick}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="scan-meal-title"
                tabIndex={-1}
                className={styles.card}
            >
                <div className={styles.header}>
                    <h2 id="scan-meal-title" className={styles.title}>
                        <Camera size={20} strokeWidth={2.5} />
                        Escanear comida
                    </h2>
                    <button
                        className={styles.closeBtn}
                        onClick={onClose}
                        disabled={isBusy}
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Preview de la foto (si hay). [P1-MEAL-SCAN-POLISH] En revisión
                    pasa a banner compacto para que todo quepa sin scroll. */}
                {preview && (
                    <div className={`${styles.previewWrap} ${(phase === 'review' || phase === 'saving') ? styles.previewCompact : ''}`}>
                        <img src={preview} alt="Foto de la comida" className={styles.previewImg} />
                        {phase === 'scanning' && (
                            <div className={styles.scanningOverlay}>
                                <Loader2 size={28} className={styles.spinner} />
                                <span>Analizando tu plato… puede tardar un minuto</span>
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
                            Toma una foto de tu plato y la IA estimará las macros. Podrás
                            revisarlas antes de registrar.
                        </p>
                        <div className={styles.pickRow}>
                            <button
                                className={styles.pickBtn}
                                onClick={() => cameraInputRef.current?.click()}
                            >
                                <Camera size={22} />
                                Tomar foto
                            </button>
                            <button
                                className={styles.pickBtnSecondary}
                                onClick={() => galleryInputRef.current?.click()}
                            >
                                <ImageIcon size={22} />
                                Elegir de galería
                            </button>
                        </div>
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={onCameraChange}
                            className={styles.hiddenInput}
                            tabIndex={-1}
                        />
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

                {/* FASE 2: revisar/editar y registrar */}
                {(phase === 'review' || phase === 'saving') && (
                    <div className={styles.reviewWrap}>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>Nombre</span>
                            <input
                                type="text"
                                value={form.meal_name}
                                maxLength={200}
                                onChange={(e) => setForm((p) => ({ ...p, meal_name: e.target.value }))}
                                className={styles.textInput}
                                placeholder="Ej: Mangú con salami"
                            />
                        </label>

                        {/* [P1-MEAL-SCAN-POLISH] Tipo + Porción en una fila. */}
                        <div className={styles.fieldRow}>
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>Tipo de comida</span>
                                <select
                                    value={form.meal_type}
                                    onChange={(e) => setForm((p) => ({ ...p, meal_type: e.target.value }))}
                                    className={styles.selectInput}
                                >
                                    {_MEAL_TYPES.map((t) => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </label>

                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Porción</span>
                                <div className={styles.portionRow}>
                                    {_PORTIONS.map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            className={`${styles.portionBtn} ${multiplier === p ? styles.portionActive : ''}`}
                                            onClick={() => applyPortion(p)}
                                            title="Multiplica las macros estimadas; también puedes editarlas abajo"
                                        >
                                            {p === 0.5 ? '½×' : `${p}×`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className={styles.macrosGrid}>
                            <MacroInput label="Calorías" unit="kcal" value={form.calories}
                                onChange={(v) => handleMacroChange('calories', v)} />
                            <MacroInput label="Proteína" unit="g" value={form.protein}
                                onChange={(v) => handleMacroChange('protein', v)} />
                            <MacroInput label="Carbohidratos" unit="g" value={form.carbs}
                                onChange={(v) => handleMacroChange('carbs', v)} />
                            <MacroInput label="Grasas" unit="g" value={form.healthy_fats}
                                onChange={(v) => handleMacroChange('healthy_fats', v)} />
                        </div>

                        <div className={styles.actions}>
                            <button
                                className={styles.retakeBtn}
                                onClick={() => { _setPreviewUrl(null); setPhase('select'); setError(null); }}
                                disabled={phase === 'saving'}
                            >
                                Volver a escanear
                            </button>
                            <button
                                className={styles.saveBtn}
                                onClick={handleSave}
                                disabled={phase === 'saving'}
                            >
                                {phase === 'saving'
                                    ? <><Loader2 size={16} className={styles.spinner} /> Registrando…</>
                                    : <><Check size={16} /> Registrar comida</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

ScanMealModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    userId: PropTypes.string.isRequired,
};

// [P3-SCAN-MACRO-INPUT-EMPTY · 2026-05-30] Buffer de string local para el input
// numérico. Pre-fix el input era controlado con `value={number}` y el padre
// clampeaba con `_clampMacro(Number(raw))` → `Number('')` es 0, de modo que al
// BORRAR el campo para teclear otro valor (cambiar 350 → 80) el input saltaba a
// "0" al instante y el usuario tenía que teclear encima del 0 ("080"). Es el
// camino crítico de edición del feature de escaneo. Ahora el buffer permite el
// vacío transitorio mientras se edita; el padre sigue recibiendo el raw (que
// clampea a entero en el state), y al perder foco re-sincronizamos el texto con
// el valor clampeado (p.ej. "08"→"8", ""→"0", sobre-tope→tope).
const MacroInput = ({ label, unit, value, onChange }) => {
    const [text, setText] = useState(() => String(value));
    // Sincroniza cambios EXTERNOS del valor (presets de porción ½×/1×/2×, o el
    // resultado del escaneo) en el buffer — solo si difiere numéricamente, para
    // no pisar un "" o un valor a medio teclear cuando el cambio vino del input.
    useEffect(() => {
        setText((prev) => (Number(prev) === value ? prev : String(value)));
    }, [value]);
    return (
        <label className={styles.macroField}>
            <span className={styles.macroLabel}>{label}</span>
            <div className={styles.macroInputWrap}>
                <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={text}
                    onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
                    onBlur={() => setText(String(value))}
                    className={styles.macroInput}
                />
                <span className={styles.macroUnit}>{unit}</span>
            </div>
        </label>
    );
};

MacroInput.propTypes = {
    label: PropTypes.string.isRequired,
    unit: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired,
    onChange: PropTypes.func.isRequired,
};

export default ScanMealModal;
