import { useState, useEffect, useRef } from 'react';
import {
    User, Shield, ChevronRight, ArrowLeft,
    LogOut, Save, Trash2, Trophy, Mail, Brain, CreditCard, AlertCircle, X, AlertTriangle, Lock, Loader2, Clock, Zap, Check, SlidersHorizontal, RefreshCw, ChefHat, GlassWater, Cog,
    Dumbbell, TrendingDown, Target, Activity, ArrowRight, Monitor, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
import { useNavigate } from 'react-router-dom';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';
import styles from './Settings.module.css';
import { fetchWithAuth } from '../config/api';
// [P2-NEW-WINDOW-CONFIRM-SETTINGS · 2026-05-15] Reemplazo Promise-based
// para los 2 `window.confirm` legacy del flujo Renovar/Cero (líneas ~847,
// ~862). Modal nativo rompía dark theme + a11y; este helper usa sonner.
import { confirmToast } from '../utils/confirmToast';
import { requestNotificationPermission, subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushSupported } from '../utils/pushNotifications';
import { trackEvent } from '../utils/analytics';
// [P2-LOCALSTORAGE-REMOVEITEM · 2026-05-15] Helper defensivo para removeItem
// — iOS Private Mode lanza SecurityError y corta el cleanup del reset
// preferences (líneas ~775+).
// [P1-FRONTEND-LEGACY-LOCALSTORAGE-CRITICAL · 2026-05-23] safeLocalStorageGet
// para el lazy initializer de `notifications` (era único raw getItem sin
// try/catch en este archivo; las líneas 73-78 y 91-96 ya estaban envueltas).
import { safeLocalStorageRemove, safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';
// [APPEARANCE-THEME · 2026-05-28] Aplicar el tema en vivo al elegir en el toggle.
import { applyThemePref, isDarkActive } from '../utils/theme';
import Modal from '../components/common/Modal';
import OptionPickerModal from '../components/common/OptionPickerModal';
// [P1-FORM-9] Helper para construir el payload de health_profile sin filtrar
// flags `_*` y con guard contra race de hidratación cifrada. Ver
// `secureFormStorage.js` para el rationale completo.
import { buildHealthProfilePayload } from '../config/secureFormStorage';

// [APPEARANCE-THEME · 2026-05-28] Opciones del selector de Apariencia de la
// sección "Preferencias". `value` se persiste en localStorage('mealfit_theme')
// Y se aplica en vivo vía applyThemePref (utils/theme.js) → fija
// html[data-theme] que activa los overrides de variables CSS oscuras en
// index.css. Mapeo:
//   system → prefers-color-scheme   ·   light → claro (Básico)   ·   dark → oscuro
const THEME_OPTIONS = [
    {
        value: 'system',
        label: 'Sistema',
        desc: 'Sigue la apariencia configurada en tu dispositivo.',
        Icon: Monitor,
        iconBg: 'linear-gradient(135deg, #64748B 0%, #475569 100%)',
    },
    {
        value: 'light',
        label: 'Básico',
        desc: 'Tema claro, el de siempre.',
        Icon: Sun,
        iconBg: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)',
    },
    {
        value: 'dark',
        label: 'Oscuro',
        desc: 'Tonos oscuros para ambientes con poca luz.',
        Icon: Moon,
        iconBg: 'linear-gradient(135deg, #4F46E5 0%, #1E293B 100%)',
    },
];

// [P3-SETTINGS-UNITTOGGLE-HOIST · 2026-06-01] Definido en module scope (antes vivía
// DENTRO de la IIFE de render → identidad de función NUEVA en cada keystroke de
// peso/altura → React veía un "tipo" distinto y DESMONTABA+REMONTABA los 2 botones
// del toggle por cada tecla). Solo consume props (unit/options/onChange); los CSS
// vars resuelven en paint, no captura closure → hoist seguro, tipo estable → el
// toggle ahora re-renderiza (no remonta).
const _UnitToggle = ({ unit, options, onChange }) => (
    <div style={{ display: 'inline-flex', gap: 2, background: 'var(--bg-muted)', padding: 2, borderRadius: '0.5rem', marginLeft: '0.5rem' }}>
        {options.map((opt) => (
            <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                style={{
                    padding: '0.2rem 0.55rem',
                    borderRadius: '0.4rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    background: unit === opt ? 'var(--bg-card)' : 'transparent',
                    color: unit === opt ? 'var(--text-main)' : 'var(--text-muted)',
                    boxShadow: unit === opt ? '0 1px 3px rgba(15, 23, 42, 0.12)' : 'none',
                    transition: 'all 0.15s ease',
                }}
            >
                {opt}
            </button>
        ))}
    </div>
);

const Settings = () => {
    // Obtenemos userProfile y updateUserProfile del contexto global
    // [P1-FORM-9] `session` necesario para el guard de hidratación cifrada en
    // `buildHealthProfilePayload`.
    const { planData, formData, resetApp, userProfile, updateUserProfile, setCurrentStep, userPlanLimit, planCount, checkPlanLimit, session, isPremium, updateData } = useAssessment();

    // [P1-FORM-9] Wrapper análogo al de Dashboard.jsx: filtra flags `_*` y
    // bloquea si la hidratación cifrada del formData parece estar in-flight.
    // Ver comentario completo en Dashboard.jsx (mismo código, mismo rationale).
    const safeUpdateHealthProfile = (overrides) => {
        if (!userProfile || typeof updateUserProfile !== 'function') return false;
        const payload = buildHealthProfilePayload(formData, overrides, session);
        if (!payload) {
            toast.warning('Tu perfil aún se está cargando. Inténtalo en un momento.', {
                duration: 3500,
            });
            return false;
        }
        updateUserProfile({ health_profile: payload });
        return true;
    };
    const navigate = useNavigate();
    const { regeneratePlan } = useRegeneratePlan();

    // Estados GAP 8
    const [hoveredEvaluateOption, setHoveredEvaluateOption] = useState(null);
    
    // Estados GAP 9
    const [isNavigatingOption, setIsNavigatingOption] = useState(null);
    
    // GAP 4: Ref para prevenir doble-disparo
    const isNavigatingRef = useRef(false);
    // --- ESTADOS LOCALES ---
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;
    
    // Estado para las notificaciones (Avisos de comidas)
    // [P1-FRONTEND-LEGACY-LOCALSTORAGE-CRITICAL · 2026-05-23] safeLocalStorageGet
    // evita SecurityError en iOS Private Mode dentro del lazy initializer.
    // Pre-fix, un throw aquí crasheaba el mount completo de Settings (página blanca).
    const [notifications, setNotifications] = useState(() => {
        return safeLocalStorageGet('mealfit_notifications') === 'true';
    });

    // Estado para las Notificaciones Web Push (IA)
    // Lazy init desde localStorage + Notification.permission para evitar flash off→on al refrescar.
    const [pushEnabled, setPushEnabled] = useState(() => {
        try {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
            return localStorage.getItem('mealfit_push_enabled') === 'true';
        } catch { return false; }
    });
    const [isPushLoading, setIsPushLoading] = useState(false);
    const [isPushBlocked, setIsPushBlocked] = useState(false);
    const [pushSubscribeError, setPushSubscribeError] = useState(null);

    // Persistir el último valor confirmado para hidratación instantánea en el próximo mount.
    useEffect(() => {
        try { localStorage.setItem('mealfit_push_enabled', String(pushEnabled)); } catch {}
    }, [pushEnabled]);

    // [P1-4] Preferencia de logging: 'manual' (default) o 'auto_proxy'.
    // En auto_proxy el sistema NO pausa los chunks aunque el usuario deje de loguear comidas.
    // Lazy init desde localStorage para evitar flash 'manual'→'auto_proxy' tras refresh.
    const [loggingPreference, setLoggingPreference] = useState(() => {
        try {
            const cached = localStorage.getItem('mealfit_logging_preference');
            return cached === 'auto_proxy' || cached === 'manual' ? cached : 'manual';
        } catch { return 'manual'; }
    });
    const [isLoggingPrefLoading, setIsLoggingPrefLoading] = useState(false);

    useEffect(() => {
        try { localStorage.setItem('mealfit_logging_preference', loggingPreference); } catch {}
    }, [loggingPreference]);

    // [APPEARANCE-THEME · 2026-05-28] Preferencia de Apariencia (Sistema/
    // Básico/Oscuro). Persiste en localStorage('mealfit_theme') y se aplica
    // en vivo (handleSelectTheme → applyThemePref). Lazy init para reflejar
    // la elección actual al montar; el boot script de index.html ya fijó el
    // data-theme antes del paint.
    const [themePreference, setThemePreference] = useState(() => {
        const cached = safeLocalStorageGet('mealfit_theme', 'system');
        return ['system', 'light', 'dark'].includes(cached) ? cached : 'system';
    });

    const handleSelectTheme = (value) => {
        if (value === themePreference) return;
        setThemePreference(value);
        safeLocalStorageSet('mealfit_theme', value);
        // [APPEARANCE-THEME · 2026-05-28] Aplicar al instante (sin reload):
        // fija html[data-theme] → las variables CSS oscuras entran en efecto.
        applyThemePref(value);
        toast.success('Preferencia de apariencia guardada.', { duration: 2000 });
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetchWithAuth('/api/diary/preferences/logging');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data?.logging_preference) {
                    setLoggingPreference(data.logging_preference);
                }
            } catch (e) {
                // No bloqueante: si falla, queda en el valor cacheado/default.
                console.debug('No se pudo cargar logging_preference:', e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleToggleLoggingPreference = async () => {
        const next = loggingPreference === 'auto_proxy' ? 'manual' : 'auto_proxy';
        setIsLoggingPrefLoading(true);
        const prev = loggingPreference;
        setLoggingPreference(next); // optimistic
        try {
            const res = await fetchWithAuth('/api/diary/preferences/logging', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logging_preference: next }),
            });
            if (!res.ok) throw new Error('PUT failed');
            toast.success(
                next === 'auto_proxy'
                    ? 'Modo auto activado: ya no pausaremos tu plan por falta de logs.'
                    : 'Modo manual activado: pausaremos tu plan si dejas de loguear comidas.',
            );
        } catch (e) {
            console.error('handleToggleLoggingPreference error:', e);
            setLoggingPreference(prev);
            toast.error('No se pudo actualizar la preferencia. Inténtalo de nuevo.');
        } finally {
            setIsLoggingPrefLoading(false);
        }
    };

    useEffect(() => {
        const checkSubscription = async () => {
            if (isPushSupported() && 'Notification' in window) {
                // Si el permiso está denegado o por defecto, sabemos que es falso
                if (Notification.permission === 'denied') {
                    setPushEnabled(false);
                    setIsPushBlocked(true);
                    return;
                }
                if (Notification.permission !== 'granted') {
                    setPushEnabled(false);
                    return;
                }
                
                // Si está concedido, tenemos que verificar si hay una suscripción activa
                try {
                    let registration = await navigator.serviceWorker.getRegistration();
                    
                    if (!registration) {
                        registration = await Promise.race([
                            navigator.serviceWorker.ready,
                            new Promise((_, reject) => setTimeout(() => reject(new Error("SW timeout")), 2000))
                        ]);
                    }

                    if (registration) {
                        const subscription = await registration.pushManager.getSubscription();
                        setPushEnabled(!!subscription);
                    } else {
                        setPushEnabled(false);
                    }
                } catch (e) {
                    console.error("Error checking subscription:", e);
                    setPushEnabled(false);
                }
            }
        };
        checkSubscription();
    }, []);

    // Detecta cuando el usuario revoca el permiso de notificaciones desde fuera de la app
    // (chrome://settings, otra pestaña). Sin esto el toggle quedaba ON pero ningún push llegaba.
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
        let permStatus;
        let cancelled = false;

        const sync = () => {
            if (!permStatus) return;
            if (permStatus.state === 'denied') {
                setPushEnabled(false);
                setIsPushBlocked(true);
            } else {
                setIsPushBlocked(false);
            }
        };

        (async () => {
            try {
                permStatus = await navigator.permissions.query({ name: 'notifications' });
                if (cancelled) return;
                permStatus.addEventListener('change', sync);
                sync();
            } catch (e) {
                console.debug('permissions.query no disponible:', e);
            }
        })();

        return () => {
            cancelled = true;
            if (permStatus) permStatus.removeEventListener('change', sync);
        };
    }, []);

    // CORRECCIÓN: Inicialización Lazy para evitar conflictos de renderizado
    // Si ya tenemos el dato en el contexto, lo usamos inmediatamente al crear el componente.
    const [userName, setUserName] = useState(
        userProfile?.full_name || planData?.userParams?.name || ''
    );

    // [P3-PROFILE-BODY-METRICS · 2026-05-20] Inputs editables de peso/altura
    // en el card Perfil. Persisten en `health_profile.weight`/`height` via
    // `safeUpdateHealthProfile`. Al cambiarlos NO se recalculan los targets
    // del card "Progreso en Tiempo Real" (esos vienen del `planData.calories/
    // macros` fijos del plan generado — recalcular desincronizaría con las
    // porciones de las recetas vigentes). Toast post-save invita a regenerar
    // plan para que las comidas reflejen los nuevos datos.
    //
    // [P3-PROFILE-UNITS-TOGGLE · 2026-05-20] Toggles de unidad:
    //   - Peso: kg ↔ lb (formData.weightUnit ya existe, default depende del
    //     locale browser).
    //   - Altura: cm ↔ ft (UI only; siempre persiste en cm canonical).
    //
    // Conversión canónica al persistir:
    //   - weight stored siempre en la unit que el user ve (formData.weightUnit
    //     refleja la preferencia, el backend interpreta según ese campo).
    //   - height SIEMPRE en cm. Si user elige ft, convertimos antes de save.
    // [P3-DEFAULT-IMPERIAL · 2026-05-20] Defaults imperial (lb + ft).
    // weightUnit lee de formData (que ya defaultea 'lb' tras el cambio en
    // AssessmentContext); fallback 'lb' explícito. heightUnit arranca en
    // 'ft' siempre — si hay altura previa en cm, se pre-convierte abajo
    // a ft+inches para que el user vea su altura en la unit imperial sin
    // necesidad de togglear primero.
    const [weightUnit, setWeightUnit] = useState(
        () => formData?.weightUnit || userProfile?.health_profile?.weightUnit || 'lb'
    );
    const [heightUnit, setHeightUnit] = useState('ft');
    const _initialWeight = formData?.weight ?? userProfile?.health_profile?.weight ?? '';
    const _initialHeightCm = formData?.height ?? userProfile?.health_profile?.height ?? '';
    const [weightInput, setWeightInput] = useState(() => String(_initialWeight));
    const [heightInput, setHeightInput] = useState(() => String(_initialHeightCm));

    // Pre-conversión cm → ft+in para que los inputs imperiales arranquen
    // poblados si el user tenía altura en cm previa. Cálculo en initializer
    // del useState (sin dispatch extra).
    const _ftInitial = (() => {
        const cm = parseFloat(_initialHeightCm);
        if (isNaN(cm) || cm <= 0) return { ft: '', in: '' };
        const totalIn = cm / 2.54;
        const ft = Math.floor(totalIn / 12);
        return { ft: String(ft), in: String(Math.round(totalIn - ft * 12)) };
    })();
    const [heightFeet, setHeightFeet] = useState(() => _ftInitial.ft);
    const [heightInches, setHeightInches] = useState(() => _ftInitial.in);

    // [P3-PROFILE-METRICS-COMMIT · 2026-05-20] Snapshot de los valores
    // originales al mount. Sirve para:
    //   1. Detectar si los body metrics cambiaron (mostrar botón "Actualizar
    //      Plan" en lugar de "Guardar Cambios").
    //   2. Revertir los inputs a originales si el user sale de la sección
    //      o desmonta el componente sin haber click "Actualizar Plan"
    //      (descartar cambios no-comprometidos).
    //
    // Comportamiento UX: los body metrics solo se persisten si el user
    // explícitamente click "Actualizar Plan con Nuevos Datos" (que regenera
    // el plan al mismo tiempo). "Guardar Cambios" normal solo guarda el
    // nombre — body metrics se ignoran/revierten al salir.
    const _bodyMetricsOriginalRef = useRef({
        weight: String(_initialWeight),
        height: String(_initialHeightCm),
        weightUnit: formData?.weightUnit || userProfile?.health_profile?.weightUnit || 'kg',
    });
    const [isRegeneratingFromMetrics, setIsRegeneratingFromMetrics] = useState(false);

    // Computed: ¿cambiaron los body metrics respecto al snapshot original?
    const _resolveCurrentHeightCm = () => {
        if (heightUnit === 'ft') {
            const ft = parseFloat(heightFeet) || 0;
            const inches = parseFloat(heightInches) || 0;
            return (ft > 0 || inches > 0) ? Math.round(ft * 30.48 + inches * 2.54) : '';
        }
        return heightInput;
    };
    const bodyMetricsChanged = (() => {
        const orig = _bodyMetricsOriginalRef.current;
        const currentHeightCm = String(_resolveCurrentHeightCm());
        return (
            String(weightInput) !== orig.weight
            || currentHeightCm !== orig.height
            || weightUnit !== orig.weightUnit
        );
    })();

    // Reset de body metrics a originales (descarte de cambios no comprometidos).
    // [P3-DEFAULT-IMPERIAL · 2026-05-20] Revertir al default imperial 'ft'
    // con ft/in pre-poblados desde la altura cm original (consistente con
    // el initial mount). Sin esto, tras revert el toggle aparecía en 'cm'
    // por default y el user perdía su elección imperial.
    const _revertBodyMetricsToOriginal = () => {
        const orig = _bodyMetricsOriginalRef.current;
        setWeightInput(orig.weight);
        setHeightInput(orig.height);
        setWeightUnit(orig.weightUnit);
        setHeightUnit('ft');
        const cm = parseFloat(orig.height);
        if (!isNaN(cm) && cm > 0) {
            const totalIn = cm / 2.54;
            const ft = Math.floor(totalIn / 12);
            setHeightFeet(String(ft));
            setHeightInches(String(Math.round(totalIn - ft * 12)));
        } else {
            setHeightFeet('');
            setHeightInches('');
        }
    };

    // Helper: convertir cm → ft + in (con redondeo).
    const _cmToFtIn = (cm) => {
        const n = parseFloat(cm);
        if (isNaN(n) || n <= 0) return { ft: '', in: '' };
        const totalIn = n / 2.54;
        const ft = Math.floor(totalIn / 12);
        const inches = Math.round(totalIn - ft * 12);
        return { ft: String(ft), in: String(inches) };
    };

    // [P3-PROFILE-WEIGHT-UNIT-AUTOCONVERT · 2026-05-20] Toggle kg↔lb DEBE
    // auto-convertir el valor numérico al cambiar la unidad. Pre-fix solo
    // cambiaba `weightUnit` y dejaba el literal del input intacto — e.g.
    // 70 kg al togglear a lb se quedaba "70" (interpretado como 70 lb =
    // 31.7 kg → BMR significativamente bajo). La validación de rango
    // (55-660 lb / 25-300 kg) bloqueaba extremos pero valores mid-range
    // pasaban silenciosos. Espejo del comportamiento ya implementado en
    // `handleHeightUnitToggle` (cm↔ft+in).
    //
    // Conversión: 1 kg = 2.20462 lb. Redondeo a 1 decimal (match con
    // `step="0.1"` del input). NaN/0/empty se preserva sin tocar.
    const _WEIGHT_LB_PER_KG = 2.20462;
    const handleWeightUnitToggle = (newUnit) => {
        if (newUnit === weightUnit) return;
        const n = parseFloat(weightInput);
        if (!isNaN(n) && n > 0) {
            let converted;
            if (newUnit === 'lb' && weightUnit === 'kg') {
                converted = Math.round(n * _WEIGHT_LB_PER_KG * 10) / 10;
            } else if (newUnit === 'kg' && weightUnit === 'lb') {
                converted = Math.round((n / _WEIGHT_LB_PER_KG) * 10) / 10;
            }
            if (typeof converted === 'number' && !isNaN(converted)) {
                setWeightInput(String(converted));
            }
        }
        setWeightUnit(newUnit);
    };

    // Cuando el user cambia heightUnit, sincronizar los inputs visibles
    // desde el valor canonical (heightInput en cm o derivado).
    const handleHeightUnitToggle = (newUnit) => {
        if (newUnit === heightUnit) return;
        if (newUnit === 'ft') {
            // cm → ft + in
            const { ft, in: inches } = _cmToFtIn(heightInput);
            setHeightFeet(ft);
            setHeightInches(inches);
        } else {
            // ft + in → cm
            const ft = parseFloat(heightFeet) || 0;
            const inches = parseFloat(heightInches) || 0;
            if (ft > 0 || inches > 0) {
                const cm = Math.round(ft * 30.48 + inches * 2.54);
                setHeightInput(String(cm));
            }
        }
        setHeightUnit(newUnit);
    };

    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(''); // '', 'success', 'error'
    const [nameError, setNameError] = useState('');
    const [confirmReset, setConfirmReset] = useState(false);
    // [P3-PROFILE-DISCARD-CONFIRM · 2026-05-20] Modal de confirmación cuando
    // el user click "Volver" con drafts pendientes de peso/altura. El banner
    // amarillo `AlertCircle` ya advierte mientras está en Profile, pero el
    // click en "Volver" antes solo disparaba `_revertBodyMetricsToOriginal`
    // silenciosamente vía el cleanup useEffect — sin nada que confirme la
    // intención de descartar. Defensa adicional contra "tipeé pero salí
    // por error y perdí mis nuevos números".
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    // [P3-RESET-BUTTON-LOADING-STATE · 2026-05-16] Loading state inmediato
    // del botón "Sí, empezar desde cero". Sin esto, el user clickeaba y
    // el botón NO cambiaba visualmente durante los ~5-8s del backend
    // call → percepción de "el botón está roto, no respondió a mi click".
    // El toast.loading aparece arriba pero el botón mismo seguía idéntico.
    const [isResetting, setIsResetting] = useState(false);

    // --- ESTADOS PARA CEREBRO IA ---
    const [userFacts, setUserFacts] = useState([]);
    const [isLoadingFacts, setIsLoadingFacts] = useState(false);
    const [isDeletingFact, setIsDeletingFact] = useState(null); // ID del fact que se está borrando

    // [LONG-TERM-MEMORY-TOGGLE · 2026-05-13] Estado del toggle del usuario.
    // `null` = aún no consultado al backend (loading). El componente del toggle
    // solo monta para isPremium, así que el GET solo dispara para esos usuarios.
    const [ltmEnabled, setLtmEnabled] = useState(null);
    const [isLtmToggling, setIsLtmToggling] = useState(false);

    // [P3-WATER-TRACKER · 2026-05-16] Toggle del card de hidratacion del
    // Dashboard. Disponible para TODOS los usuarios autenticados (no
    // gate de tier). Default TRUE; el usuario lo apaga si no quiere
    // ver el card.
    const [waterTrackerEnabled, setWaterTrackerEnabled] = useState(null);
    const [isWaterTrackerToggling, setIsWaterTrackerToggling] = useState(false);

    // --- ESTADOS DE PAGO ---
    const [isCancelling, setIsCancelling] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);

    // --- ESTADOS DE EVALUACIÓN ---
    const [showEvaluateModal, setShowEvaluateModal] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // --- NAVEGACIÓN DE SECCIONES ---
    // activeSection puede ser un id de SECTION_IDS o null (en móvil = vista de lista).
    // Sincronizado con window.location.hash para deep-linking y back/forward del navegador.
    const SECTION_IDS = ['profile', 'preferences', 'plan', 'subscription'];
    const computeInitialSection = () => {
        if (typeof window === 'undefined') return 'profile';
        const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        // Desktop: siempre arrancar con Perfil al entrar — ignora hash residual
        // de navegaciones previas. Si el usuario después navega a otra sección
        // dentro de Settings, el hash se actualiza vía replaceState; pero al
        // entrar fresco (incluyendo refresh) siempre cae en Perfil.
        if (!isMobile) return 'profile';
        // Mobile: respetar hash si es válido (deep-linking), sino mostrar lista.
        const hash = window.location.hash.replace('#', '');
        if (SECTION_IDS.includes(hash)) return hash;
        return null;
    };
    const [activeSection, setActiveSection] = useState(computeInitialSection);

    // [P3-PROFILE-METRICS-COMMIT · 2026-05-20] Revertir body metrics no
    // comprometidos cuando el user navega FUERA de la sección Perfil sin
    // haber click "Actualizar Plan con Nuevos Datos". Para el user, los
    // body metrics son "draft" hasta que regenere el plan — salir sin
    // commit descarta el draft.
    useEffect(() => {
        if (activeSection !== 'profile') {
            _revertBodyMetricsToOriginal();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection]);

    // Cleanup al desmontar el componente (navegación fuera de Settings).
    // Asegura que body metrics no persistidos NO queden cached en estado
    // residual si el user vuelve a Settings desde otra ruta.
    useEffect(() => {
        return () => {
            _revertBodyMetricsToOriginal();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // En desktop, limpiar cualquier hash residual de la URL al mount. Sin esto
    // el browser bar muestra e.g. `/dashboard/settings#preferences` mientras
    // la UI ya está en Perfil — inconsistencia visual + el back button del
    // navegador llevaría a una URL con hash que ya no refleja el state.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile && window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '');
            if (SECTION_IDS.includes(hash)) {
                setActiveSection(hash);
            } else if (!hash) {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                setActiveSection(isMobile ? null : 'profile');
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Listener de cambio de viewport: si user pasa de mobile (state=null en
    // modo lista) a desktop redimensionando o cerrando DevTools, forzar 'profile'.
    // Desktop NO tiene "modo lista" — siempre debe haber una sección activa.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const mql = window.matchMedia('(max-width: 768px)');
        const handleViewportChange = (e) => {
            if (!e.matches) {
                // Cambió a desktop: si state era null (lista mobile) → fuerza 'profile'.
                // Si ya hay sección activa, mantenerla.
                setActiveSection((prev) => prev ?? 'profile');
            }
        };
        mql.addEventListener('change', handleViewportChange);
        return () => mql.removeEventListener('change', handleViewportChange);
    }, []);

    const navigateToSection = (id) => {
        setActiveSection(id);
        if (typeof window === 'undefined') return;
        // replaceState (NO pushState): navegar entre secciones NO debe inflar
        // el historial. Si pusheáramos, `navigate(-1)` desde el listado
        // aterrizaría en una sección de Settings en vez de salir al caller.
        if (id) {
            window.history.replaceState(null, '', `#${id}`);
        } else {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    };

    // [P3-PROFILE-DISCARD-CONFIRM · 2026-05-20] Helper SSOT del flujo de
    // salida desde Settings (Volver). Mismo destino que el handler inline
    // previo: móvil+sección → listado; móvil-listado/desktop → dashboard.
    // Extraído para que el modal de discard pueda invocarlo desde el
    // botón "Descartar y salir" sin duplicar lógica.
    const _doExitNavigation = () => {
        const isMobileViewport = typeof window !== 'undefined'
            && window.matchMedia
            && window.matchMedia('(max-width: 768px)').matches;
        if (isMobileViewport && activeSection) {
            navigateToSection(null);
            return;
        }
        navigate('/dashboard');
    };

    // [APPEARANCE-THEME · 2026-05-29] Iconos de sección: en claro chips pastel;
    // en oscuro los pasteles se ven brillosos → tintes translúcidos + icono más
    // claro por sección. isDark es snapshot fresco (Settings re-renderiza al
    // cambiar el tema porque setThemePreference muta su propio estado).
    const _settingsDark = isDarkActive();
    const sectionsConfig = [
        { id: 'profile', label: 'General', description: 'Cuenta, apariencia y notificaciones', Icon: Cog, iconBg: _settingsDark ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF', iconColor: _settingsDark ? '#60A5FA' : '#3B82F6' },
        { id: 'preferences', label: 'Capacidades', description: 'Modo automático, memoria y datos del agente', Icon: SlidersHorizontal, iconBg: _settingsDark ? 'rgba(219, 39, 119, 0.18)' : '#FCE7F3', iconColor: _settingsDark ? '#F472B6' : '#DB2777' },
        { id: 'plan', label: 'Plan & Objetivo', description: 'Meta principal y calorías', Icon: Trophy, iconBg: _settingsDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7', iconColor: _settingsDark ? '#34D399' : '#166534' },
        { id: 'subscription', label: 'Suscripción', description: 'Plan, pagos y cancelación', Icon: CreditCard, iconBg: _settingsDark ? 'rgba(99, 102, 241, 0.18)' : '#E0E7FF', iconColor: _settingsDark ? '#A5B4FC' : '#4F46E5' },
    ];

    const activeSectionMeta = sectionsConfig.find(s => s.id === activeSection) || null;

    // --- EFECTOS ---

    // CORRECCIÓN: Validación estricta dentro del useEffect
    useEffect(() => {
        // Determinamos cuál es el nombre que viene de la base de datos o del plan antiguo
        const incomingName = userProfile?.full_name || planData?.userParams?.name;

        // SOLUCIÓN AL ERROR:
        // Solo actualizamos el estado si hay un dato nuevo Y es diferente al que ya tenemos.
        // Esto evita que React entre en un bucle infinito de actualizaciones.
        if (incomingName && incomingName !== userName) {
            setUserName(incomingName);
        }
        
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile, planData]); // Quitamos 'userName' de las dependencias intencionalmente

    // [P1-PROD-FINAL-3 · 2026-05-24] safeLocalStorageSet — raw setItem
    // lanzaba SecurityError/QuotaExceededError en iOS Private Mode dentro
    // del useEffect → toggle de notificaciones no persistía y el callback
    // rompía la cadena de side-effects del effect.
    useEffect(() => {
        safeLocalStorageSet('mealfit_notifications', notifications);
    }, [notifications]);

    // Cargar los "hechos" del Cerebro de la IA
    // [P4-XUSER-RACE] cancelled-flag + clear: en dispositivo compartido (user-switch
    // o id cambiando) un fetch de A que resuelve DESPUÉS del de B no debe clobbear
    // los facts (PII médica) de B en la UI. Espeja el effect hermano de logging (~195).
    useEffect(() => {
        let cancelled = false;
        const fetchUserFacts = async () => {
            const userId = userProfile?.id;
            if (!userId) return;

            setUserFacts([]);
            setIsLoadingFacts(true);
            try {
                const response = await fetchWithAuth(`/api/user-facts/${userId}`);
                if (!cancelled && response.ok) {
                    const data = await response.json();
                    if (!cancelled) setUserFacts(data.facts || []);
                }
            } catch (error) {
                if (!cancelled) console.error("Error cargando Cerebro IA:", error);
            } finally {
                if (!cancelled) setIsLoadingFacts(false);
            }
        };

        fetchUserFacts();
        return () => { cancelled = true; };
    }, [userProfile?.id]);

    // [LONG-TERM-MEMORY-TOGGLE · 2026-05-13] Carga el estado actual del toggle
    // solo para usuarios isPremium. Para gratis ni se monta (no aplica).
    // Default optimista TRUE si el GET falla — fail-open consistente con el
    // backend que asume TRUE para perfiles legacy sin el campo.
    useEffect(() => {
        if (!userProfile?.id || !isPremium) {
            setLtmEnabled(null);
            return;
        }
        let cancelled = false;
        const fetchLtmState = async () => {
            try {
                const response = await fetchWithAuth('/api/user/preferences/memory');
                if (cancelled) return;
                if (response.ok) {
                    const data = await response.json();
                    if (!cancelled) setLtmEnabled(Boolean(data.long_term_memory_enabled));
                } else {
                    setLtmEnabled(true);
                }
            } catch {
                if (!cancelled) setLtmEnabled(true);
            }
        };
        fetchLtmState();
        return () => { cancelled = true; };
    }, [userProfile?.id, isPremium]);

    // [P3-WATER-TRACKER · 2026-05-16] Carga el estado actual del toggle
    // del water tracker. Disponible para todos los usuarios autenticados.
    // Default optimista TRUE si el GET falla — fail-open consistente con
    // el backend que asume TRUE para perfiles legacy.
    useEffect(() => {
        if (!userProfile?.id) {
            setWaterTrackerEnabled(null);
            return;
        }
        let cancelled = false;
        const fetchWaterTrackerState = async () => {
            try {
                const response = await fetchWithAuth('/api/user/preferences/water-tracker');
                if (cancelled) return;
                if (response.ok) {
                    const data = await response.json();
                    if (cancelled) return;
                    const value = Boolean(data.water_tracker_enabled);
                    setWaterTrackerEnabled(value);
                    // Cache en localStorage para que WaterTracker.jsx pueda
                    // pre-render sin esperar al GET (evita el flash de "cargando").
                    safeLocalStorageSet('mealfit_water_tracker_enabled', String(value));
                } else {
                    setWaterTrackerEnabled(true);
                }
            } catch {
                if (!cancelled) setWaterTrackerEnabled(true);
            }
        };
        fetchWaterTrackerState();
        return () => { cancelled = true; };
    }, [userProfile?.id]);

    // --- MANEJADORES (HANDLERS) ---
    
    const getNotificationBlockedMessage = async () => {
        const ua = navigator.userAgent;
        const isBrave = (typeof navigator.brave !== 'undefined') || ua.includes('Brave');
        const isFirefox = ua.includes('Firefox');
        const isEdge = ua.includes('Edg/');
        const isSafari = ua.includes('Safari') && !ua.includes('Chrome');

        if (isBrave) return "Brave bloquea notificaciones por defecto. Haz clic en el escudo 🛡 de la barra de direcciones → Permisos del sitio → Notificaciones → Permitir.";
        if (isFirefox) return "Permisos bloqueados en Firefox. Haz clic en el ícono de candado 🔒 en la barra de direcciones → Más información → Permisos → Notificaciones → Permitir.";
        if (isSafari) return "Permisos bloqueados en Safari. Ve a Safari → Configuración para este sitio web → Notificaciones → Permitir.";
        if (isEdge) return "Permisos bloqueados en Edge. Haz clic en el candado 🔒 en la barra de direcciones → Permisos para este sitio → Notificaciones → Permitir.";
        return "Permisos bloqueados en el navegador. Haz clic en el candado 🔒 en la barra de direcciones → Permisos del sitio → Notificaciones → Permitir.";
    };

    const handleTogglePush = async () => {
        try {
            if (!isPushSupported()) {
                toast.error("Tu navegador no soporta notificaciones Push.");
                return;
            }

            setIsPushLoading(true);

            if (pushEnabled) {
                // Desuscribir
                const success = await unsubscribeFromPushNotifications();
                if (success) {
                    setPushEnabled(false);
                    toast.success("Notificaciones de la IA desactivadas.");
                } else {
                    toast.error("Error al desactivar notificaciones.");
                }
            } else {
                // Suscribir
                const permissionGranted = await requestNotificationPermission();
                if (!permissionGranted) {
                    const msg = await getNotificationBlockedMessage();
                    toast.error(msg, { duration: 7000 });
                    setIsPushLoading(false);
                    return;
                }

                const result = await subscribeToPushNotifications();
                if (result && result.success) {
                    setPushEnabled(true);
                    setPushSubscribeError(null);
                    toast.success("¡Notificaciones de la IA activadas con éxito!");
                } else {
                    const errMsg = result?.error || 'Error desconocido al suscribirse.';
                    setPushSubscribeError(errMsg);
                    toast.error(errMsg, { duration: 6000 });
                }
            }
            setIsPushLoading(false);
        } catch (err) {
            console.error("handleTogglePush error:", err);
            const errMsg = err.message || 'Error inesperado.';
            setPushSubscribeError(errMsg);
            toast.error(`Error inesperado: ${errMsg}`);
            setIsPushLoading(false);
        }
    };

    const handleResetApp = async () => {
        if (confirmReset) {
            // [P3-RESETAPP-AWAIT · 2026-05-30] await + finally: resetApp es
            // async (signOut + setters). Sin await, navigate('/') corría antes
            // del teardown y una rejection quedaba como unhandled promise. El
            // finally garantiza la navegación aunque resetApp falle (el teardown
            // de PII ya es síncrono adentro, así que es seguro navegar igual).
            try {
                await resetApp();
            } finally {
                navigate('/');
            }
        } else {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 3000);
        }
    };

    // [P3-PROFILE-METRICS-COMMIT · 2026-05-20] `handleSaveProfile` ahora
    // SOLO persiste el nombre. Los body metrics (peso/altura/weightUnit)
    // requieren el flow separado `handleUpdatePlanWithMetrics` que regenera
    // el plan automáticamente con los nuevos datos — sin regenerar, los
    // body metrics quedan en draft y se descartan al salir.
    const handleSaveProfile = async () => {
        if (isSaving) return;

        const trimmedName = userName.trim();
        if (!trimmedName) {
            setNameError("Por favor, ingresa tu nombre.");
            return;
        }
        setNameError('');

        setIsSaving(true);
        setSaveStatus('');

        const fullNameResult = await updateUserProfile({ full_name: trimmedName });

        setIsSaving(false);

        if (fullNameResult.success) {
            setSaveStatus('success');
            toast.success("Perfil actualizado con éxito.");
            setTimeout(() => setSaveStatus(''), 3000);
        } else {
            setSaveStatus('error');
            toast.error("Hubo un error al guardar. Por favor verifica tu conexión.");
        }
    };

    // [P3-PROFILE-METRICS-COMMIT · 2026-05-20] Persistir body metrics +
    // regenerar plan en un solo flujo. Solo se invoca desde el botón
    // "Actualizar Plan con Nuevos Datos" cuando bodyMetricsChanged===true.
    const handleUpdatePlanWithMetrics = async () => {
        if (isSaving || isRegeneratingFromMetrics) return;

        // Validación (mismo bloque que estaba en handleSaveProfile).
        const parsedWeight = parseFloat(weightInput);
        const _weightMin = weightUnit === 'lb' ? 55 : 25;
        const _weightMax = weightUnit === 'lb' ? 660 : 300;
        const weightValid = !isNaN(parsedWeight) && parsedWeight >= _weightMin && parsedWeight <= _weightMax;

        let heightCm = null;
        if (heightUnit === 'ft') {
            const ft = parseFloat(heightFeet) || 0;
            const inches = parseFloat(heightInches) || 0;
            if (ft > 0 || inches > 0) heightCm = Math.round(ft * 30.48 + inches * 2.54);
        } else {
            const n = parseFloat(heightInput);
            if (!isNaN(n)) heightCm = n;
        }
        const heightValid = heightCm !== null && heightCm >= 100 && heightCm <= 250;

        if (weightInput && !weightValid) {
            toast.error(`Peso fuera de rango (${_weightMin}-${_weightMax} ${weightUnit}).`);
            return;
        }
        if ((heightUnit === 'cm' ? heightInput : (heightFeet || heightInches)) && !heightValid) {
            toast.error("Altura fuera de rango (100-250 cm equivalente).");
            return;
        }

        // [P3-PROFILE-METRICS-QUOTA-GATE · 2026-05-20] Pre-check del quota
        // ANTES de persistir body metrics. Sin este gate, regeneratePlan
        // abortaría con toast "Límite alcanzado" DESPUÉS de que la RPC
        // `update_health_profile_merge` ya mutó la columna → user queda
        // con health_profile nuevo pero plan vigente con macros stale
        // hasta el próximo ciclo de billing.
        //
        // Cache `window.__cachedQuota` (TTL 5s) compartido con
        // `useRegeneratePlan.regeneratePlan` para no duplicar roundtrip si
        // Dashboard ya consultó hace <5s. Fail-open en error de red:
        // `regeneratePlan` hará su propio check downstream y abortará si
        // realmente está al tope; la peor consecuencia de un falso
        // negativo acá es que la persistencia + regenerate se inicien y
        // regeneratePlan emita el toast — igual que el comportamiento
        // pre-fix, pero solo en el camino de network failure.
        try {
            const _nowQuota = Date.now();
            let _freshCount = (typeof window !== 'undefined' && window.__cachedQuota) || planCount;
            if (_nowQuota - ((typeof window !== 'undefined' && window.__lastQuotaCheckTime) || 0) > 5000) {
                _freshCount = await checkPlanLimit(userProfile?.id);
                if (typeof window !== 'undefined') {
                    window.__cachedQuota = _freshCount;
                    window.__lastQuotaCheckTime = _nowQuota;
                }
            }
            if (typeof userPlanLimit === 'number' && _freshCount >= userPlanLimit) {
                toast.error('Límite de regeneraciones alcanzado', {
                    description: 'Tus nuevos datos no se guardaron porque requieren regenerar el plan, y has usado todos tus créditos este mes.',
                    duration: 6000,
                });
                return;
            }
        } catch {
            // Network error en checkPlanLimit → fail-open. regeneratePlan
            // hará el check downstream con su propio try/catch.
        }

        setIsRegeneratingFromMetrics(true);

        // 1) Actualizar `formData` del context con los nuevos valores ANTES
        //    de regenerar. `regeneratePlan` (useRegeneratePlan hook) lee de
        //    `formData` para construir el payload completo del backend —
        //    incluye gender, age, allergies, mainGoal, dietType, etc. del
        //    assessment original. Si NO actualizo formData primero, el
        //    payload llevaría weight/height/weightUnit viejos.
        //
        //    `updateData(field, value)` actualiza formData + marca el campo
        //    como touched (cubre los 3 paths de hidratación async del context
        //    para que no sobrescriban con valores stale).
        if (weightValid) {
            updateData('weight', parsedWeight);
            if (weightUnit !== formData?.weightUnit) {
                updateData('weightUnit', weightUnit);
            }
        }
        if (heightValid) {
            updateData('height', heightCm);
        }

        // 2) Persistir body metrics en health_profile (jsonb merge backend).
        //    El resto de campos del assessment ya están en health_profile
        //    desde el flujo original — este RPC solo mergea, no reemplaza.
        const overrides = {};
        if (weightValid) {
            overrides.weight = parsedWeight;
            overrides.weightUnit = weightUnit;
        }
        if (heightValid) overrides.height = heightCm;
        const healthOk = safeUpdateHealthProfile(overrides);

        if (!healthOk) {
            setIsRegeneratingFromMetrics(false);
            return;
        }

        // 3) Actualizar el snapshot de "originales" para que bodyMetricsChanged
        //    pase a false (botón vuelva a su estado normal) y que el cleanup
        //    NO revierta estos valores ya comprometidos al salir.
        _bodyMetricsOriginalRef.current = {
            weight: String(weightInput),
            height: String(heightCm),
            weightUnit,
        };

        // 4) Disparar regenerate del plan. `regeneratePlan` lee `formData`
        //    fresh (ya actualizado en paso 1) → envía al backend payload
        //    completo con TODOS los datos del assessment original +
        //    weight/height/weightUnit nuevos. El LLM recalcula macros con
        //    Mifflin-St Jeor sobre los nuevos valores y genera comidas
        //    coherentes.
        toast.success("Datos guardados. Regenerando plan…", {
            description: "Tu plan se actualizará con los nuevos cálculos de macros en unos segundos.",
            duration: 4000,
        });

        try {
            await regeneratePlan({
                reason: 'body_metrics_changed',
                entry_point: 'settings_profile_body_metrics',
            });
        } catch (err) {
            console.error('Error regenerando plan tras update body metrics:', err);
            toast.error('No se pudo regenerar el plan. Tus datos se guardaron — reintenta el regenerate desde el Dashboard.');
        } finally {
            setIsRegeneratingFromMetrics(false);
        }
    };

    const handleDeleteFact = async (factId) => {
        // [P1-FRONTEND-HARDEN · 2026-05-23] Reemplazado `window.confirm` nativo
        // por `confirmToast` (Promise-based, sonner). El nativo bloqueaba el
        // event loop, rompía dark theme y no era a11y. Mismo helper que ya
        // usaba el resto de Settings.jsx (P2-NEW-WINDOW-CONFIRM-SETTINGS).
        const ok = await confirmToast("¿Seguro que deseas olvidar esta información?", {
            confirmLabel: 'Olvidar',
            cancelLabel: 'Cancelar',
        });
        if (!ok) return;

        setIsDeletingFact(factId);
        try {
            const response = await fetchWithAuth(`/api/user-facts/${factId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                // Actualizamos el estado local quitando el hecho borrado
                setUserFacts(prev => prev.filter(f => f.id !== factId));
                toast.success("Información olvidada con éxito.");
            } else {
                toast.error("Hubo un problema al olvidar la información.");
            }
        } catch (error) {
            console.error("Error borrando fact:", error);
            toast.error("No se pudo conectar con el servidor para borrar.");
        } finally {
            setIsDeletingFact(null);
        }
    };

    // [LONG-TERM-MEMORY-TOGGLE · 2026-05-13] Handler del toggle.
    // Optimistic update: refleja el cambio en UI antes del response. Si el
    // PATCH falla, revierte el state y notifica al usuario.
    const handleToggleLtm = async () => {
        if (isLtmToggling || ltmEnabled === null) return;
        const next = !ltmEnabled;
        setLtmEnabled(next); // optimistic
        setIsLtmToggling(true);
        try {
            const response = await fetchWithAuth('/api/user/preferences/memory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ long_term_memory_enabled: next }),
            });
            if (!response.ok) throw new Error('PATCH failed');
            const data = await response.json();
            setLtmEnabled(Boolean(data.long_term_memory_enabled));
            toast.success(
                next ? 'Memoria a largo plazo activada.' : 'Memoria a largo plazo pausada. Tus datos guardados se conservan.',
                { duration: 3500 }
            );
        } catch (error) {
            console.error('Error toggling LTM:', error);
            setLtmEnabled(!next); // revertir
            toast.error('No pudimos actualizar tu preferencia. Inténtalo de nuevo.');
        } finally {
            setIsLtmToggling(false);
        }
    };

    // [P3-WATER-TRACKER · 2026-05-16] Toggle del card de hidratacion.
    // PATCH al backend + actualiza cache local para que WaterTracker.jsx
    // (en Dashboard) lea el nuevo valor SIN flash visual cuando el usuario
    // regresa al Dashboard.
    const handleToggleWaterTracker = async () => {
        if (isWaterTrackerToggling || waterTrackerEnabled === null) return;
        const next = !waterTrackerEnabled;
        setWaterTrackerEnabled(next); // optimistic
        setIsWaterTrackerToggling(true);
        // Pre-actualizar localStorage para que el unmount del card sea
        // instantaneo al navegar al Dashboard (el state inicial lee de aqui).
        try {
            localStorage.setItem('mealfit_water_tracker_enabled', String(next));
            // Storage event para que un Dashboard abierto en otra tab
            // recoja el cambio sin reload (Fix 3 cross-tab).
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'mealfit_water_tracker_enabled',
                newValue: String(next),
            }));
        } catch { /* localStorage no critico */ }
        try {
            const response = await fetchWithAuth('/api/user/preferences/water-tracker', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ water_tracker_enabled: next }),
            });
            if (!response.ok) throw new Error('PATCH failed');
            const data = await response.json();
            setWaterTrackerEnabled(Boolean(data.water_tracker_enabled));
            toast.success(
                next
                    ? 'Hidratación activada.'
                    : 'Hidratación oculta. Tu historial se conserva.',
                { duration: 3500 }
            );
        } catch (error) {
            console.error('Error toggling water tracker:', error);
            setWaterTrackerEnabled(!next); // revertir
            try {
                localStorage.setItem('mealfit_water_tracker_enabled', String(!next));
            } catch { /* localStorage no critico */ }
            toast.error('No pudimos actualizar tu preferencia. Intentalo de nuevo.');
        } finally {
            setIsWaterTrackerToggling(false);
        }
    };

    const handleCancelSubscription = () => {
        setShowCancelModal(true);
    };

    const runCancelSubscription = async () => {
        setIsCancelling(true);
        try {
            const response = await fetchWithAuth('/api/subscription/cancel', {
                method: 'POST',
                body: JSON.stringify({ user_id: userProfile?.id })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                setShowCancelModal(false);
                toast.success("Tu suscripción ha sido cancelada exitosamente.");
                // Forzar la recarga del perfil global
                setTimeout(() => window.location.reload(), 2000);
            } else {
                toast.error(data.message || "Hubo un error al cancelar la suscripción.");
                setShowCancelModal(false);
            }
        } catch (error) {
            console.error("Error cancelando suscripción:", error);
            toast.error("No se pudo conectar con el servidor para cancelar. Inténtalo más tarde.");
            setShowCancelModal(false);
        } finally {
            setIsCancelling(false);
        }
    };

    // Datos derivados para la UI
    const userGoal = formData?.mainGoal || "Mejorar Salud";
    const displayEmail = userProfile?.email || "Cargando correo...";

    // [SUBSCRIPTION-FREE-CANCEL-FIX · 2026-05-28] "Suscriptor de pago" se
    // determina con allowlist POSITIVA (tiers con suscripción PayPal real).
    // Pre-fix la sección de Suscripción usaba chequeos negativos
    // `plan_tier !== 'gratis'`; con `plan_tier` null/undefined (cuentas gratis
    // o nuevas sin el literal 'gratis' seteado) esos chequeos daban true y
    // mostraban "Cancelar Suscripción" a un usuario gratis. 'admin' es interno
    // (no es suscriptor PayPal) → queda fuera del allowlist.
    const _PAID_TIERS = ['basic', 'plus', 'ultra'];
    const isPaidSubscriber = _PAID_TIERS.includes(userProfile?.plan_tier);

    // [P3-PROFILE-PLAN-CARD-REDESIGN · 2026-05-20] Mapping es-DO + icon +
    // accent color por meta. El enum backend (`mainGoal` en formValidation.js)
    // usa labels en inglés (`gain_muscle`, `lose_fat`, etc.) — se renderizan
    // capitalizados como "Gain Muscle" cuando llegan al UI, lo que rompe
    // i18n del producto (CLAUDE.md → "i18n: es-DO permanente"). El mapping
    // canónico vive aquí y se aplica al render del card Plan & Objetivo.
    const _GOAL_META = {
        gain_muscle: { label: 'Ganar músculo', Icon: Dumbbell, accent: '#10B981', tint: '#D1FAE5' },
        lose_fat:    { label: 'Perder grasa', Icon: TrendingDown, accent: '#F43F5E', tint: '#FFE4E6' },
        maintenance: { label: 'Mantenimiento', Icon: Target, accent: '#4F46E5', tint: '#E0E7FF' },
        performance: { label: 'Rendimiento', Icon: Activity, accent: '#F59E0B', tint: '#FEF3C7' },
    };
    const _goalMeta = _GOAL_META[String(userGoal).toLowerCase()] || {
        label: String(userGoal).replace(/_/g, ' '),
        Icon: Trophy,
        accent: '#4F46E5',
        tint: '#E0E7FF',
    };

    return (
        <>
            <div className={styles.wrapper}>
                {/* Back arrow visible en ambos viewports:
                    - Móvil + dentro de una sección: vuelve al listado de Ajustes.
                    - Móvil en listado / Desktop siempre: sale al dashboard.
                      Destino fijo (no `navigate(-1)`) — el historial puede tener
                      entradas previas que desorientan al usuario.

                    [P3-PROFILE-DISCARD-CONFIRM · 2026-05-20] Si el user tiene
                    drafts pendientes de peso/altura en Profile, intercepta
                    con modal `showDiscardConfirm` antes de navegar. El cleanup
                    useEffect ya revertía silenciosamente — pero un click
                    accidental en "Volver" perdía los nuevos números sin aviso.
                    El banner amarillo sigue siendo la primera línea (visible
                    mientras se edita), el modal es la segunda. */}
                <button
                    type="button"
                    className={styles.exitSettingsBtn}
                    onClick={() => {
                        if (bodyMetricsChanged && activeSection === 'profile') {
                            setShowDiscardConfirm(true);
                            return;
                        }
                        _doExitNavigation();
                    }}
                    aria-label="Volver"
                >
                    <ArrowLeft size={20} strokeWidth={2.5} />
                    <span>Volver</span>
                </button>

                {/* [P3-PROFILE-DISCARD-CONFIRM · 2026-05-20] Modal de
                    confirmación. "Descartar y salir" revierte drafts (vía
                    cleanup useEffect tras el navigate) y sale. "Seguir
                    editando" cierra el modal sin tocar nada. */}
                <Modal
                    isOpen={showDiscardConfirm}
                    onClose={() => setShowDiscardConfirm(false)}
                    titleId="discard-confirm-title"
                    maxWidth="420px"
                    isBottomSheetOnMobile={true}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{
                            background: '#FEF3C7',
                            color: '#B45309',
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <AlertCircle size={22} strokeWidth={2.5} style={{ transform: 'translateY(0.5px)' }} />
                        </div>
                        <h3 id="discard-confirm-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                            Tienes cambios sin guardar
                        </h3>
                    </div>
                    <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.55, margin: '0 0 1.5rem 0' }}>
                        Editaste tu peso o altura pero no actualizaste tu plan. Si sales ahora,
                        los nuevos valores se <strong>descartarán</strong>.
                    </p>
                    <div className={styles.modalButtons}>
                        <button
                            type="button"
                            onClick={() => setShowDiscardConfirm(false)}
                            className={styles.modalBtnCancel}
                        >
                            Seguir editando
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowDiscardConfirm(false);
                                _doExitNavigation();
                            }}
                            className={styles.modalBtnConfirm}
                        >
                            Descartar y salir
                        </button>
                    </div>
                </Modal>

                <Modal
                    isOpen={showCancelModal}
                    onClose={() => !isCancelling && setShowCancelModal(false)}
                    titleId="cancel-modal-title"
                    maxWidth="420px"
                    disableClose={isCancelling}
                    isBottomSheetOnMobile={true}
                >
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div style={{
                                        /* [P3-CANCEL-MODAL-DARK · 2026-05-30] Rojo translúcido
                                           en oscuro (antes #FEF2F2 → círculo blanco brillante). */
                                        background: _settingsDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2',
                                        color: _settingsDark ? '#F87171' : '#EF4444',
                                        width: '44px',
                                        height: '44px',
                                        borderRadius: '50%',
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <AlertTriangle size={24} strokeWidth={2.5} style={{ transform: 'translateY(0px)' }} />
                                    </div>
                                    {/* [P3-CANCEL-MODAL-DARK · 2026-05-30] Título via var de tema:
                                        #0F172A (slate oscuro) era casi invisible sobre el modal oscuro. */}
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        Cancelar Suscripción
                                    </h3>
                                </div>
                                
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                                    ¿Estás seguro de que deseas cancelar tu suscripción? Perderás todos tus beneficios premium al finalizar tu ciclo actual. <strong style={{ color: 'var(--text-main)' }}>Esta acción no se puede deshacer.</strong>
                                </p>
                                
                                <div className={styles.modalButtons}>
                                    <button 
                                        onClick={() => setShowCancelModal(false)}
                                        disabled={isCancelling}
                                        className={styles.modalBtnCancel}
                                        style={{ opacity: isCancelling ? 0.7 : 1, cursor: isCancelling ? 'not-allowed' : 'pointer' }}
                                    >
                                        Mantener Plan
                                    </button>
                                    <button 
                                        onClick={runCancelSubscription}
                                        disabled={isCancelling}
                                        className={styles.modalBtnConfirm}
                                        style={{ opacity: isCancelling ? 0.8 : 1, cursor: isCancelling ? 'wait' : 'pointer' }}
                                    >
                                        {isCancelling ? 'Cancelando...' : 'Sí, Cancelar'}
                                    </button>
                                </div>
                </Modal>

                {/* MODAL Evaluar de Nuevo */}
            <AnimatePresence>
                {showEvaluateModal && (
                    showResetConfirm ? (
                        <Modal
                            isOpen={true}
                            onClose={() => { setShowEvaluateModal(false); setShowResetConfirm(false); }}
                            titleId="reset-confirm-modal"
                            maxWidth="440px"
                            isBottomSheetOnMobile={true}
                            disableClose={isNavigatingRef.current}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.75rem' }}>
                                <div style={{
                                    background: 'var(--danger-bg)',
                                    color: 'var(--danger)',
                                    width: '60px',
                                    height: '60px',
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '1.25rem',
                                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)'
                                }}>
                                    <AlertTriangle size={28} strokeWidth={2.5} style={{ transform: 'translateY(0.5px)' }} />
                                </div>
                                <h3 id="reset-confirm-modal" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                                    ¿Empezar desde cero?
                                </h3>
                                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                    Esta acción borrará <strong style={{ color: 'var(--text-main)' }}>todo tu progreso</strong>.
                                </p>
                            </div>

                            <div style={{
                                background: 'var(--bg-muted)',
                                border: '1px solid var(--border)',
                                borderRadius: '0.875rem',
                                padding: '1.125rem 1.25rem',
                                marginBottom: '1.25rem'
                            }}>
                                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Se borrará:
                                </p>
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                    {[
                                        'Perfil de salud y objetivos',
                                        'Alergias y condiciones médicas',
                                        'Inventario de tu nevera',
                                        'Platos que te gustan / no te gustan',
                                        'Memoria que el sistema aprendió sobre ti',
                                    ].map((item, idx) => (
                                        <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                                            <span style={{ color: 'var(--danger)', fontWeight: 700, flexShrink: 0, marginTop: '0.05rem' }}>•</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div style={{
                                background: 'var(--warning-bg)',
                                border: '1px solid var(--warning-border)',
                                borderRadius: '0.75rem',
                                padding: '1rem 1.125rem',
                                marginBottom: '1.75rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚠️</span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Antes de continuar
                                    </span>
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <li style={{ fontSize: '0.875rem', color: 'var(--warning-text)', lineHeight: 1.55 }}>
                                        Volverás a llenar el formulario inicial.
                                    </li>
                                    <li style={{ fontSize: '0.875rem', color: 'var(--warning-text)', lineHeight: 1.55 }}>
                                        Esta acción es <strong>irreversible</strong>.
                                    </li>
                                    <li style={{ fontSize: '0.875rem', color: 'var(--warning-text)', lineHeight: 1.55 }}>
                                        Generar el nuevo plan consumirá
                                        <span style={{ display: 'inline-block', whiteSpace: 'nowrap', marginLeft: '0.4em' }}>
                                            <strong style={{ marginRight: '0.35em' }}>1</strong>
                                            <strong>crédito</strong>.
                                        </span>
                                    </li>
                                </ul>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <button
                                    disabled={isResetting}
                                    onClick={async (e) => {
                                        if (isNavigatingRef.current || isResetting) return;
                                        isNavigatingRef.current = true;
                                        // [P3-RESET-BUTTON-LOADING-STATE · 2026-05-16]
                                        // Feedback visual INMEDIATO. El backend hace 7
                                        // DELETEs + 1 UPDATE en el free tier — 1-8s
                                        // depending on pool. Sin esto el user clickeaba
                                        // 2-3 veces porque el botón no respondía.
                                        setIsResetting(true);

                                        const toastId = toast.loading('Borrando preferencias...', { description: 'Preparando tu cuenta para un nuevo inicio.' });

                                        try {
                                            // GAP 6: Invocar el endpoint para resetear preferencias en el backend
                                            await fetchWithAuth('/api/account/reset-preferences', {
                                                method: 'POST'
                                            });

                                            // [P2-LOCALSTORAGE-REMOVEITEM · 2026-05-15]
                                            // safeLocalStorageRemove para que iOS Private
                                            // Mode no corte la cadena del reset.
                                            safeLocalStorageRemove('mealfit_disabled_ingredients');
                                            safeLocalStorageRemove('mealfit_plan');
                                            safeLocalStorageRemove('mealfit_likes');
                                            safeLocalStorageRemove('mealfit_dislikes');

                                            toast.dismiss(toastId);
                                            toast.success('Cuenta reseteada', { description: 'Empecemos de nuevo.' });

                                            // GAP 13: Analítica explícita para la intención de empezar de cero
                                            trackEvent('plan_regeneration_triggered', {
                                                reason: 'account_reset',
                                                source: 'settings_reset',
                                                is_expired: false,
                                                has_pantry: false,
                                                type: 'full_reset'
                                            });

                                            setShowEvaluateModal(false);
                                            setShowResetConfirm(false);

                                            // Ir al form desde cero
                                            setCurrentStep(0);
                                            navigate('/assessment');
                                        } catch (error) {
                                            console.error("Error reseteando preferencias:", error);
                                            toast.dismiss(toastId);
                                            toast.error('Error', { description: 'Hubo un problema al borrar tus preferencias.' });
                                            // [P3-RESET-BUTTON-LOADING-STATE] Reset del loading
                                            // SOLO en error path — happy path navega y el
                                            // componente se desmonta naturalmente.
                                            setIsResetting(false);
                                        } finally {
                                            setTimeout(() => { isNavigatingRef.current = false; }, 1000);
                                        }
                                    }}
                                    style={{
                                        padding: '1rem 1.25rem', borderRadius: '0.875rem', border: 'none',
                                        background: isResetting ? '#FCA5A5' : '#EF4444',
                                        color: 'white',
                                        cursor: isResetting ? 'wait' : 'pointer',
                                        transition: 'none',
                                        fontWeight: 700, fontSize: '1rem', textAlign: 'center',
                                        boxShadow: isResetting ? '0 2px 6px rgba(239, 68, 68, 0.15)' : '0 4px 14px rgba(239, 68, 68, 0.28)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem'
                                    }}
                                    onMouseOver={(e) => { if (!isResetting) { e.currentTarget.style.background = '#DC2626'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.45), 0 0 12px rgba(239, 68, 68, 0.25)'; } }}
                                    onMouseOut={(e) => { if (!isResetting) { e.currentTarget.style.background = '#EF4444'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.28)'; } }}
                                >
                                    {/* [P3-RESET-BUTTON-LOADING-STATE · 2026-05-16]
                                        Sin spinner: el keyframe `mfSpin` vive en
                                        Plan.jsx (scope local) y no aplica aquí.
                                        El cambio de texto + color desaturado
                                        (#FCA5A5 vs #EF4444) + cursor:wait +
                                        sombra reducida + `disabled` HTML attr
                                        dan feedback visual fuerte e inmediato
                                        sin depender de animaciones globales. */}
                                    {isResetting ? 'Borrando…' : 'Sí, empezar desde cero'}
                                </button>
                            </div>
                        </Modal>
                    ) : (
                        <OptionPickerModal
                            isOpen={true}
                            onClose={() => setShowEvaluateModal(false)}
                            title="Evaluar de Nuevo"
                            subtitle="Elige cómo quieres generar tu nuevo plan. ¿Quieres mantener tus datos actuales o empezar desde cero?"
                            headerIcon={{ icon: <ChefHat size={24} strokeWidth={2.5} />, bg: _settingsDark ? 'rgba(22, 163, 74, 0.18)' : '#DCFCE7', color: _settingsDark ? '#4ADE80' : '#16A34A' }}
                            options={[
                                {
                                    id: 'renovar',
                                    label: 'Renovar Plan Actual',
                                    desc: 'Genera un plan totalmente nuevo para variar los alimentos, tomando en cuenta los datos que ya configuraste.',
                                    // [P3-EVALUATE-MODAL-DARK · 2026-05-30] `color` tiñe la
                                    // tarjeta en oscuro (azul translúcido vs slate genérico).
                                    // `labelColor` theme-aware: azul-300 legible en oscuro,
                                    // azul-900 en claro (antes #1E3A8A oscuro era ilegible
                                    // sobre la tarjeta oscura).
                                    color: '#3B82F6',
                                    hoverBg: '#EFF6FF',
                                    hoverBorder: '#3B82F6',
                                    labelColor: _settingsDark ? '#93C5FD' : '#1E3A8A'
                                },
                                {
                                    id: 'cero',
                                    label: 'Empezar Desde Cero',
                                    desc: 'Elimina todo tu progreso y te lleva al formulario inicial.',
                                    color: '#10B981',
                                    hoverBg: '#F0FDF4',
                                    hoverBorder: '#10B981',
                                    labelColor: _settingsDark ? '#6EE7B7' : '#065F46'
                                }
                            ]}
                            isNavigatingOption={isNavigatingOption}
                            onOptionClick={async (optionId) => {
                                if (optionId === 'renovar') {
                                    // [P3-RESET-CONFIRM-NO-DOUBLE-CONFIRM · 2026-05-16]
                                    // Pre-fix: confirmToast bloqueante cuando planCount/limit > 70%
                                    // → toast renderizaba DETRÁS del OptionPickerModal (z-index)
                                    // → user no lo veía → botón parecía "no responder".
                                    // Post-fix: la info "Consume 1 regeneración" + tiempo
                                    // estimado YA están en el `infoBandRenderer` del modal
                                    // (visible cuando hover sobre la card). Si necesitas ver
                                    // créditos restantes, están en /settings → Suscripción.
                                    if (isNavigatingRef.current) return;
                                    setIsNavigatingOption('renovar');
                                    const toastId = toast.loading('Preparando renovación...', { description: 'Iniciando Chef IA...' });
                                    await regeneratePlan({ reason: 'variety', isPlanExpired: false, toastId, entry_point: 'settings_renovar' });
                                    setIsNavigatingOption(null);
                                    setShowEvaluateModal(false);
                                } else if (optionId === 'cero') {
                                    // [P3-RESET-CONFIRM-NO-DOUBLE-CONFIRM · 2026-05-16]
                                    // Pre-fix: confirmToast bloqueante cuando planCount/limit > 70%
                                    // → el toast aparece DETRÁS del OptionPickerModal (z-index conflict)
                                    // → user no lo ve → parece que el botón "no responde".
                                    // Post-fix: el modal `showResetConfirm` que aparece
                                    // INMEDIATAMENTE después YA advierte sobre el reset + consumo
                                    // de créditos. Doble confirmación es fricción innecesaria.
                                    // Saltar directo al modal de confirmación.
                                    setShowResetConfirm(true);
                                }
                            }}
                            infoBandRenderer={(hoveredOption) => {
                                const remaining = typeof userPlanLimit === 'number' ? Math.max(0, userPlanLimit - planCount) : null;
                                {/* [P3-EVALUATE-MODAL-DARK · 2026-05-30] infoBand con
                                   variables de tema (antes hex claros #F8FAFC/#FFFFFF/
                                   #334155 → tarjeta blanca brillante en modo oscuro). */}
                                const renderOption = (title, desc, meta) => (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>{title}:</strong>
                                            <span style={{ marginLeft: '0.4em' }}>{desc}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            {meta.map((m, i) => (
                                                <span key={i} style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.35em',
                                                    padding: '0.25rem 0.625rem',
                                                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '999px',
                                                    fontWeight: 500
                                                }}>
                                                    {m}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                                return (
                                    <div style={{
                                        marginTop: '1.25rem', padding: '1rem 1.125rem',
                                        background: 'var(--bg-muted)', borderRadius: '0.875rem',
                                        border: '1px solid var(--border)',
                                        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                                        // [FIX 2026-05-07] Altura mínima estable para evitar flicker en
                                        // hover. Antes el infoBand crecía/encogía entre estados (hover vs
                                        // default) → modal recentraba verticalmente → botón se desplazaba
                                        // → cursor salía de la zona hover → re-entraba → loop. Reservar
                                        // la altura del estado "hover" hace que cambiar de variante no
                                        // mueva el resto de elementos.
                                        minHeight: '96px',
                                        boxSizing: 'border-box',
                                    }}>
                                        <AlertCircle size={18} style={{ marginTop: '1px', flexShrink: 0, color: '#3B82F6' }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {hoveredOption === 'cero' ? (
                                                renderOption(
                                                    'Empezar de cero',
                                                    'Borra todo tu progreso y te lleva al formulario inicial.',
                                                    [
                                                        <>⏱️ ~3–5&nbsp;min llenando el formulario</>,
                                                        <>🔁 Consume<span style={{ display: 'inline-block', whiteSpace: 'nowrap', marginLeft: '0.4em' }}><strong style={{ color: 'var(--text-main)', marginRight: '0.35em' }}>1</strong><strong style={{ color: 'var(--text-main)' }}>regeneración</strong></span></>,
                                                    ]
                                                )
                                            ) : hoveredOption === 'renovar' ? (
                                                renderOption(
                                                    'Renovar',
                                                    'Mantendrá tus alergias y generará nuevos platos.',
                                                    [
                                                        <>⏱️ ~30&nbsp;s</>,
                                                        <>🔁 Consume<span style={{ display: 'inline-block', whiteSpace: 'nowrap', marginLeft: '0.4em' }}><strong style={{ color: 'var(--text-main)', marginRight: '0.35em' }}>1</strong><strong style={{ color: 'var(--text-main)' }}>regeneración</strong></span></>,
                                                    ]
                                                )
                                            ) : (
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                                    Te quedan{' '}
                                                    <strong style={{ color: 'var(--text-main)' }}>
                                                        {remaining !== null ? remaining : 'ilimitadas'}
                                                    </strong>
                                                    {' '}regeneraciones de planes este mes.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                    )
                )}
            </AnimatePresence>

                <div className={`${styles.pageHeader} ${activeSection ? styles.pageHeaderInSection : ''}`}>
                    {/* Default (desktop siempre, móvil cuando NO hay sección activa). */}
                    <h1 className={`${styles.pageTitle} ${styles.titleDesktop}`}>Ajustes</h1>
                    <p className={`${styles.pageSubtitle} ${styles.subtitleDesktop}`}>Gestiona tu cuenta, plan y preferencias.</p>
                    {/* Móvil cuando hay sección activa: refleja la sección. */}
                    {activeSection && activeSectionMeta && (
                        <>
                            <h1 className={`${styles.pageTitle} ${styles.titleMobile}`}>{activeSectionMeta.label}</h1>
                            <p className={`${styles.pageSubtitle} ${styles.subtitleMobile}`}>{activeSectionMeta.description}</p>
                        </>
                    )}
                </div>

                <div className={`${styles.layout} ${activeSection ? styles.layoutWithSection : ''}`}>
                    <aside className={styles.sidebar} aria-label="Secciones de ajustes">
                        <nav className={styles.sidebarNav}>
                            {sectionsConfig.map(s => {
                                const isActive = activeSection === s.id;
                                const Icon = s.Icon;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => navigateToSection(s.id)}
                                        className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                                        aria-current={isActive ? 'page' : undefined}
                                    >
                                        <span className={styles.sidebarIcon} style={{ background: s.iconBg, color: s.iconColor }}>
                                            <Icon size={18} strokeWidth={2.25} />
                                        </span>
                                        <span className={styles.sidebarText}>
                                            <span className={styles.sidebarLabel}>{s.label}</span>
                                            <span className={styles.sidebarDescription}>{s.description}</span>
                                        </span>
                                        <ChevronRight size={16} className={styles.sidebarChevron} aria-hidden="true" />
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    <main className={styles.contentPanel}>
                        <div className={styles.grid}>

                    {/* SECCIÓN 1: PERFIL (CONECTADO A SUPABASE) + APARIENCIA */}
                    {activeSection === 'profile' && (
                    <>
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            Perfil
                        </h2>

                        <div className={styles.profileFlex}>
                            
                            {/* Avatar Centrado — sin marginBottom: profileFlex ya tiene gap. */}
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <div className={styles.avatar}>
                                    {userName ? userName.charAt(0).toUpperCase() : 'U'}
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* Nombre */}
                                <div style={{ width: '100%' }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Nombre Completo <span style={{ color: '#EF4444' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={userName}
                                        onChange={(e) => {
                                            setUserName(e.target.value);
                                            if (nameError) setNameError('');
                                        }}
                                        placeholder="Tu nombre aquí"
                                        style={{
                                            width: '100%',
                                            padding: '0.875rem 1.25rem',
                                            borderRadius: '0.75rem',
                                            border: nameError ? '2px solid #FCA5A5' : '2px solid transparent',
                                            outline: 'none',
                                            fontSize: '1rem',
                                            transition: 'all 0.3s ease',
                                            background: nameError ? '#FEF2F2' : 'var(--bg-muted)',
                                            color: nameError ? '#7F1D1D' : 'var(--text-main)',
                                            fontWeight: 500
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.background = 'var(--bg-card)';
                                            e.target.style.borderColor = nameError ? '#EF4444' : '#3B82F6';
                                            e.target.style.boxShadow = nameError ? '0 0 0 4px rgba(239, 68, 68, 0.1)' : '0 0 0 4px rgba(59, 130, 246, 0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.background = nameError ? '#FEF2F2' : 'var(--bg-muted)';
                                            e.target.style.borderColor = nameError ? '#FCA5A5' : 'transparent';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    {nameError && (
                                        <div style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 500 }}>
                                            {nameError}
                                        </div>
                                    )}
                                </div>

                                {/* [P3-PROFILE-BODY-METRICS · 2026-05-20] Peso + Altura.
                                    [P3-PROFILE-UNITS-TOGGLE · 2026-05-20] Toggle kg/lb + cm/ft.
                                    Persisten en health_profile (jsonb merge via RPC).
                                    weight persiste en la unit visible; height SIEMPRE en cm canonical. */}
                                {(() => {
                                    const _inputStyle = {
                                        width: '100%',
                                        padding: '0.875rem 1.25rem',
                                        borderRadius: '0.75rem',
                                        border: '2px solid transparent',
                                        outline: 'none',
                                        fontSize: '1rem',
                                        transition: 'all 0.3s ease',
                                        background: 'var(--bg-muted)',
                                        color: 'var(--text-main)',
                                        fontWeight: 500,
                                    };
                                    const _onFocus = (e) => {
                                        e.target.style.background = 'var(--bg-card)';
                                        e.target.style.borderColor = '#3B82F6';
                                        e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)';
                                    };
                                    const _onBlur = (e) => {
                                        e.target.style.background = 'var(--bg-muted)';
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.boxShadow = 'none';
                                    };
                                    // [P3-SETTINGS-UNITTOGGLE-HOIST · 2026-06-01] _UnitToggle
                                    // movido a module scope (top del archivo) para evitar
                                    // unmount/remount por keystroke.
                                    return (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            {/* PESO */}
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                                    Peso
                                                    <_UnitToggle unit={weightUnit} options={['kg', 'lb']} onChange={handleWeightUnitToggle} />
                                                </label>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={weightUnit === 'lb' ? '55' : '25'}
                                                    max={weightUnit === 'lb' ? '660' : '300'}
                                                    step="0.1"
                                                    value={weightInput}
                                                    onChange={(e) => setWeightInput(e.target.value)}
                                                    placeholder={weightUnit === 'lb' ? '165' : '75'}
                                                    style={_inputStyle}
                                                    onFocus={_onFocus}
                                                    onBlur={_onBlur}
                                                />
                                            </div>
                                            {/* ALTURA */}
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                                    Altura
                                                    <_UnitToggle unit={heightUnit} options={['cm', 'ft']} onChange={handleHeightUnitToggle} />
                                                </label>
                                                {heightUnit === 'cm' ? (
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        min="100"
                                                        max="250"
                                                        step="1"
                                                        value={heightInput}
                                                        onChange={(e) => setHeightInput(e.target.value)}
                                                        placeholder="175"
                                                        style={_inputStyle}
                                                        onFocus={_onFocus}
                                                        onBlur={_onBlur}
                                                    />
                                                ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                        <input
                                                            type="number"
                                                            inputMode="numeric"
                                                            min="3"
                                                            max="8"
                                                            step="1"
                                                            value={heightFeet}
                                                            onChange={(e) => setHeightFeet(e.target.value)}
                                                            placeholder="5 ft"
                                                            style={_inputStyle}
                                                            onFocus={_onFocus}
                                                            onBlur={_onBlur}
                                                        />
                                                        <input
                                                            type="number"
                                                            inputMode="numeric"
                                                            min="0"
                                                            max="11"
                                                            step="1"
                                                            value={heightInches}
                                                            onChange={(e) => setHeightInches(e.target.value)}
                                                            placeholder="9 in"
                                                            style={_inputStyle}
                                                            onFocus={_onFocus}
                                                            onBlur={_onBlur}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Campo de Email (Solo Lectura) */}
                                <div className={styles.emailContainer}>
                                    {/* [APPEARANCE-THEME · 2026-05-29] En oscuro el chip
                                        (var(--bg-card)) se confundía con el contenedor y el
                                        sobre gris se veía apagado → tinte indigo + icono claro. */}
                                    <div style={{ background: _settingsDark ? 'rgba(99, 102, 241, 0.16)' : 'var(--bg-card)', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem', boxShadow: _settingsDark ? 'none' : '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0 }}>
                                        <Mail size={18} color={_settingsDark ? '#A5B4FC' : 'var(--text-muted)'} />
                                    </div>
                                    <div className={styles.emailInfo}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Correo Electrónico (ID)</span>
                                        <span style={{ color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 500, wordBreak: 'break-all' }}>{displayEmail}</span>
                                    </div>
                                    <div className={styles.emailBadge}>
                                        <Shield size={14} /> <span className={styles.emailBadgeText}>Protegido</span>
                                    </div>
                                </div>

                            </div>

                            {/* [P3-PROFILE-METRICS-COMMIT · 2026-05-20]
                                Botón condicional: si body metrics cambiaron, mostrar
                                "Actualizar Plan con Nuevos Datos" (persist + regenerate).
                                Si no, mostrar "Guardar Cambios" normal (solo nombre).
                                Aviso visible cuando hay draft de body metrics. */}
                            {bodyMetricsChanged && (
                                <div style={{
                                    marginTop: '0.25rem',
                                    padding: '0.85rem 1rem',
                                    background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                                    borderRadius: '0.75rem',
                                    border: '1px solid #F59E0B',
                                    color: '#78350F',
                                    fontSize: '0.85rem',
                                    lineHeight: 1.5,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.5rem',
                                }}>
                                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <div>
                                        <strong>Cambios pendientes en peso/altura.</strong>{' '}
                                        Para que se apliquen, debes regenerar el plan. Si sales sin hacerlo, los nuevos valores se descartarán.
                                    </div>
                                </div>
                            )}
                            <div className={styles.saveBtnContainer} style={{ marginTop: '0.5rem' }}>
                                {bodyMetricsChanged ? (
                                    <button
                                        onClick={handleUpdatePlanWithMetrics}
                                        disabled={isRegeneratingFromMetrics}
                                        className={styles.updatePlanBtn}
                                    >
                                        {isRegeneratingFromMetrics ? (
                                            <><Loader2 size={18} className="animate-spin" /> Regenerando…</>
                                        ) : (
                                            <><RefreshCw size={18} /> Actualizar Plan con Nuevos Datos</>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={isSaving}
                                        className={`${styles.saveChangesBtn} ${saveStatus === 'success' ? styles.saveChangesBtnSuccess : styles.saveChangesBtnDefault}`}
                                    >
                                        {isSaving ? (
                                            <>Guardando...</>
                                        ) : saveStatus === 'success' ? (
                                            <>¡Guardado!</>
                                        ) : (
                                            <>Guardar</>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* [APPEARANCE-THEME · 2026-05-28] Apariencia DENTRO del
                        panel "General" (antes pestaña aparte). Se muestra como
                        un bloque debajo del Perfil, separado por un borde
                        superior sutil. La elección persiste en mealfit_theme y
                        se aplica en vivo (html[data-theme] → variables CSS). */}
                    <section className={styles.section} style={{ borderTop: '1px solid var(--border)' }}>
                        <h2 className={styles.sectionTitle}>
                            Apariencia
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Elige el tema de la aplicación. Usa “Sistema” para seguir la configuración de tu dispositivo.
                        </p>

                        <div
                            className={styles.themeGroup}
                            role="radiogroup"
                            aria-label="Tema de la aplicación"
                        >
                            {THEME_OPTIONS.map((opt) => {
                                const { value, label, desc, iconBg } = opt;
                                const Icon = opt.Icon;
                                const selected = themePreference === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => handleSelectTheme(value)}
                                        className={`${styles.themeOption} ${selected ? styles.themeOptionActive : ''}`}
                                    >
                                        <span className={styles.themeOptionIcon} style={{ background: iconBg }}>
                                            <Icon size={20} color="#FFFFFF" strokeWidth={2.25} />
                                        </span>
                                        <span className={styles.themeOptionText}>
                                            <span className={styles.themeOptionTitle}>{label}</span>
                                            <span className={styles.themeOptionDesc}>{desc}</span>
                                        </span>
                                        {selected && (
                                            <span className={styles.themeCheck} aria-hidden="true">
                                                <Check size={16} strokeWidth={3} />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                    </>
                    )}

                    {/* SECCIÓN 2: NOTIFICACIONES
                        [NOTIF-MERGED-INTO-GENERAL · 2026-05-28] Fusionada DENTRO
                        de "General": renderiza bajo activeSection 'profile' como
                        bloque hermano del fragmento Perfil+Apariencia. El grid es
                        flex-column, así que aparece apilada debajo de Apariencia.
                        Ya NO es pestaña propia del sidebar. */}
                    {activeSection === 'profile' && (
                        <section className={styles.section} style={{ borderTop: '1px solid var(--border)' }}>
                            <h2 className={styles.sectionTitle}>
                                Notificaciones
                            </h2>

                            <div style={{
                                background: 'var(--bg-muted)',
                                borderRadius: '1rem',
                                padding: '1.25rem',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem'
                            }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                                    <div style={{
                                        background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                                        width: 44,
                                        height: 44,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '0.75rem',
                                        flexShrink: 0,
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                                    }}>
                                        <Brain size={20} color="#FFFFFF" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.95rem' }}>
                                            Alertas Inteligentes
                                            <span style={{
                                                fontSize: '0.6rem',
                                                background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                                                color: '#FFFFFF',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '1rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.5px',
                                                textTransform: 'uppercase'
                                            }}>Beta</span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.45', marginTop: '0.25rem' }}>
                                            Recibe avisos en tu pantalla si olvidas registrar una comida
                                        </div>
                                    </div>
                                </div>
                                <label className={styles.toggleSwitch} style={{ flexShrink: 0, opacity: isPushBlocked ? 0.4 : 1 }}>
                                    <input
                                        type="checkbox"
                                        checked={pushEnabled}
                                        onChange={handleTogglePush}
                                        disabled={isPushLoading || isPushBlocked}
                                    />
                                    <span className={styles.toggleSlider} style={{ opacity: isPushLoading ? 0.5 : 1 }}></span>
                                </label>
                            </div>

                            {isPushBlocked && (
                                <div
                                    role="alert"
                                    onClick={async () => { const msg = await getNotificationBlockedMessage(); toast.error(msg, { duration: 7000 }); }}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                        marginTop: '0.65rem', padding: '0.6rem 0.85rem',
                                        background: '#FFF7ED', border: '1px solid #FED7AA',
                                        borderRadius: '0.65rem', cursor: 'pointer',
                                        fontSize: '0.78rem', color: '#92400E', lineHeight: 1.4,
                                    }}
                                >
                                    <Lock size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#D97706' }} />
                                    <span>Permiso bloqueado en el navegador. <strong>Toca aquí para ver cómo reactivarlo.</strong></span>
                                </div>
                            )}

                            {!isPushBlocked && pushSubscribeError && (
                                <div
                                    role="alert"
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                                        marginTop: '0.65rem', padding: '0.6rem 0.85rem',
                                        background: '#FFF1F2', border: '1px solid #FECDD3',
                                        borderRadius: '0.65rem',
                                        fontSize: '0.78rem', color: '#9F1239', lineHeight: 1.4,
                                    }}
                                >
                                    <AlertTriangle size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#E11D48' }} />
                                    <span>
                                        {pushSubscribeError.includes('Brave') || pushSubscribeError.includes('push service')
                                            ? <>Notificaciones bloqueadas por Brave. Habilita la mensajería push en <strong>brave://settings/privacy</strong>.</>
                                            : pushSubscribeError.includes('Service Worker') || pushSubscribeError.includes('timeout')
                                                ? <>Servicio no disponible. Recarga la página e intenta de nuevo.</>
                                                : <>No se pudo activar. Recarga la página e intenta de nuevo.</>
                                        }
                                    </span>
                                </div>
                            )}

                        </section>
                    )}

                    {/* SECCIÓN PREFERENCIAS: Modo Automático + Memoria a Largo Plazo.
                        Modo Automático: visible para todos los usuarios autenticados.
                        Memoria a Largo Plazo: visible SOLO para isPremium (Básico+).
                        Para usuarios Gratis la sección sigue mostrándose, pero solo
                        contiene el Modo Automático — el toggle de memoria está oculto. */}
                    {activeSection === 'preferences' && (
                        <section className={styles.section}>
                            <h2 className={styles.sectionTitle}>
                                Comportamiento del agente
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                Ajusta cómo el agente registra tus comidas y aprende de ti.
                            </p>

                            {/* [P3-PREFERENCES-CARD-POLISH · 2026-05-27]
                                Refactor inline-styles → CSS module con
                                clases compartidas. Card 1: Modo automático
                                (naranja, visible para todos los tiers). */}
                            <div
                                className={`${styles.preferenceCard} ${styles.preferenceCardOrange} ${loggingPreference === 'auto_proxy' ? styles.preferenceCardActive : ''}`}
                            >
                                <div className={styles.preferenceCardBody}>
                                    <div className={styles.preferenceCardIcon}>
                                        <Zap size={20} color="#FFFFFF" />
                                    </div>
                                    <div className={styles.preferenceCardText}>
                                        <div className={styles.preferenceCardTitle}>
                                            Modo automático
                                        </div>
                                        <div className={styles.preferenceCardDesc}>
                                            Si confías en el plan y prefieres no loguear cada comida, actívalo. No pausaremos tu plan aunque dejes de registrar comidas.
                                        </div>
                                    </div>
                                </div>
                                <label className={styles.toggleSwitch} style={{ flexShrink: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={loggingPreference === 'auto_proxy'}
                                        onChange={handleToggleLoggingPreference}
                                        disabled={isLoggingPrefLoading}
                                    />
                                    <span className={styles.toggleSlider} style={{ opacity: isLoggingPrefLoading ? 0.5 : 1 }}></span>
                                </label>
                            </div>

                            {/* [P3-HIDRATACION-MOVED-OUT · 2026-05-27] Card de
                                Hidratación movida fuera de esta sección — ya
                                no es "comportamiento del agente" sino una
                                preferencia de visualización del Dashboard.
                                Vive ahora en sub-sección "Personaliza tu panel"
                                encima de "Lo que el agente recuerda". */}

                            {/* Toggle: Memoria a Largo Plazo (solo Básico+).
                                [LONG-TERM-MEMORY-TOGGLE · 2026-05-13] Reutiliza
                                state ltmEnabled + handler handleToggleLtm.
                                [P3-PREFERENCES-CARD-POLISH · 2026-05-27]
                                Card con icon Brain siempre purple (representa
                                la feature). Cuando ltmEnabled el wrapper usa
                                la variante Green para que accent stripe +
                                border + bg active sean verdes (consistencia
                                con las otras cards que usan green como su
                                "active"). */}
                            {isPremium && ltmEnabled !== null && (
                                <div
                                    className={`${styles.preferenceCard} ${ltmEnabled ? styles.preferenceCardGreen : styles.preferenceCardPurple} ${ltmEnabled ? styles.preferenceCardActive : ''}`}
                                >
                                    <div className={styles.preferenceCardBody}>
                                        <div
                                            className={styles.preferenceCardIcon}
                                            style={{
                                                /* Icon siempre purple (brain) — independiente del active state */
                                                background: 'linear-gradient(135deg, #8B5CF6 0%, #4F46E5 100%)',
                                                boxShadow: '0 4px 12px -2px rgba(79, 70, 229, 0.4), inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)',
                                            }}
                                        >
                                            <Brain size={20} color="#FFFFFF" />
                                        </div>
                                        <div className={styles.preferenceCardText}>
                                            <div className={styles.preferenceCardTitle}>
                                                Memoria a Largo Plazo
                                            </div>
                                            <div className={styles.preferenceCardDesc}>
                                                {ltmEnabled
                                                    ? 'Activa. La IA aprende de tus conversaciones y recuerda lo importante.'
                                                    : 'Pausada. La IA no aprende ni consulta lo aprendido. Tus datos guardados se conservan.'}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleToggleLtm}
                                        disabled={isLtmToggling}
                                        role="switch"
                                        aria-checked={ltmEnabled}
                                        aria-label="Activar o pausar la memoria a largo plazo"
                                        style={{
                                            position: 'relative',
                                            width: '52px',
                                            height: '30px',
                                            borderRadius: '999px',
                                            border: 'none',
                                            background: ltmEnabled ? '#10B981' : '#CBD5E1',
                                            cursor: isLtmToggling ? 'wait' : 'pointer',
                                            transition: 'background 0.2s ease',
                                            flexShrink: 0,
                                            padding: 0,
                                            opacity: isLtmToggling ? 0.6 : 1,
                                        }}
                                    >
                                        <span
                                            style={{
                                                position: 'absolute',
                                                top: '3px',
                                                left: ltmEnabled ? '25px' : '3px',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: '#FFFFFF',
                                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
                                                transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            }}
                                        />
                                    </button>
                                </div>
                            )}

                            {/* [P3-HIDRATACION-MOVED-OUT · 2026-05-27 · reordenado 2026-05-28]
                                Sub-sección "Personaliza tu panel" — separada
                                de "Comportamiento del agente" porque Hidratación
                                es una preferencia de visualización (mostrar/
                                ocultar un módulo del Dashboard), NO un toggle
                                del comportamiento del agente IA. Mismo patrón
                                visual que "Lo que el agente recuerda" (h3 con
                                accent border-left), pero accent color azul
                                para diferenciar visualmente del verde de la
                                otra sub-sección. Colocada ENCIMA de "Lo que el
                                agente recuerda" por preferencia del usuario. */}
                            <div style={{
                                marginTop: '1.5rem',
                                paddingTop: '1.5rem',
                                borderTop: '1px solid var(--border)',
                            }}>
                                <h3 style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    fontSize: '1.15rem',
                                    fontWeight: 800,
                                    color: 'var(--text-main)',
                                    margin: '0 0 0.5rem 0',
                                    letterSpacing: '-0.015em',
                                    paddingLeft: '0.75rem',
                                    borderLeft: '3px solid #3B82F6',
                                    lineHeight: 1.2,
                                }}>
                                    Personaliza tu panel
                                </h3>
                                <p style={{
                                    color: 'var(--text-muted)',
                                    fontSize: '0.9rem',
                                    marginBottom: '1.25rem',
                                    paddingLeft: '0.75rem',
                                }}>
                                    Elige qué secciones quieres ver al entrar.
                                </p>

                                {/* Toggle: Hidratación — visible/oculta el
                                    módulo del Dashboard. Default TRUE. */}
                                {waterTrackerEnabled !== null && (
                                    <div
                                        className={`${styles.preferenceCard} ${styles.preferenceCardBlue} ${waterTrackerEnabled ? styles.preferenceCardActive : ''}`}
                                    >
                                        <div className={styles.preferenceCardBody}>
                                            <div className={styles.preferenceCardIcon}>
                                                <GlassWater size={20} color="#FFFFFF" />
                                            </div>
                                            <div className={styles.preferenceCardText}>
                                                <div className={styles.preferenceCardTitle}>
                                                    Hidratación
                                                </div>
                                                <div className={styles.preferenceCardDesc}>
                                                    {waterTrackerEnabled
                                                        ? 'Visible en tu Dashboard. Marca tus vasos diarios; la meta se calcula segun tu peso.'
                                                        : 'Oculto del Dashboard. Tu historial de vasos se conserva si lo reactivas.'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleToggleWaterTracker}
                                            disabled={isWaterTrackerToggling}
                                            role="switch"
                                            aria-checked={waterTrackerEnabled}
                                            aria-label="Activar o desactivar la hidratacion del Dashboard"
                                            style={{
                                                position: 'relative',
                                                width: '52px',
                                                height: '30px',
                                                borderRadius: '999px',
                                                border: 'none',
                                                background: waterTrackerEnabled ? '#10B981' : '#CBD5E1',
                                                cursor: isWaterTrackerToggling ? 'wait' : 'pointer',
                                                transition: 'background 0.2s ease',
                                                flexShrink: 0,
                                                padding: 0,
                                                opacity: isWaterTrackerToggling ? 0.6 : 1,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    position: 'absolute',
                                                    top: '3px',
                                                    left: waterTrackerEnabled ? '25px' : '3px',
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    background: '#FFFFFF',
                                                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
                                                    transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                }}
                                            />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Sub-sección: Lo que el agente recuerda (datos extraídos).
                                Fusionada desde el antiguo apartado "Memoria IA".
                                Para gratis: lockscreen con upsell.
                                Para Básico+: lista de userFacts con opción de borrar. */}
                            <div style={{
                                marginTop: '1.5rem',
                                paddingTop: '1.5rem',
                                borderTop: '1px solid var(--border)',
                            }}>
                                <h3 style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    fontSize: '1.15rem',
                                    fontWeight: 800,
                                    color: 'var(--text-main)',
                                    margin: '0 0 0.5rem 0',
                                    letterSpacing: '-0.015em',
                                    paddingLeft: '0.75rem',
                                    borderLeft: '3px solid #4F46E5',
                                    lineHeight: 1.2,
                                }}>
                                    Lo que el agente recuerda
                                </h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.1rem', lineHeight: 1.5 }}>
                                    Datos puntuales que la IA aprendió de tus conversaciones. Borra los que ya no necesite saber.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {!isPremium ? (
                                        <div style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2.5rem 1.5rem', background: 'var(--bg-muted)', borderRadius: '1rem', border: '1px dashed var(--border)' }}>
                                            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)' }}>Memoria a Largo Plazo</h4>
                                            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                                                El Cerebro IA está disponible a partir del plan <strong>Básico</strong>.<br />
                                                La IA aprenderá de tus gustos y conversaciones automáticamente.
                                            </p>
                                        </div>
                                    ) : isLoadingFacts ? (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', background: 'var(--bg-muted)', borderRadius: '1rem' }}>
                                            Conectando con el Cerebro Neural...
                                        </div>
                                    ) : userFacts.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', background: 'var(--bg-muted)', borderRadius: '1rem' }}>
                                            Aún no he aprendido datos extra sobre ti. ¡Sigue conversando!
                                        </div>
                                    ) : (
                                        userFacts.map(fact => (
                                            <div key={fact.id} className={styles.factItem} style={{
                                                opacity: isDeletingFact === fact.id ? 0.5 : 1
                                            }}>
                                                <div className={styles.factContent}>
                                                    <div className={styles.factText}>
                                                        "{fact.fact}"
                                                    </div>
                                                    <div className={styles.factMeta}>
                                                        <span style={{ background: 'var(--bg-muted)', padding: '2px 8px', borderRadius: '4px', textTransform: 'capitalize' }}>
                                                            {fact.metadata?.categoria || 'Dato'}
                                                        </span>
                                                        {fact.metadata?.ingrediente && (
                                                            <span style={{ border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px' }}>
                                                                {fact.metadata.ingrediente}
                                                            </span>
                                                        )}
                                                        <span>Añadido: {new Date(fact.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteFact(fact.id)}
                                                    disabled={isDeletingFact === fact.id}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#EF4444',
                                                        cursor: 'pointer',
                                                        padding: '0.5rem',
                                                        borderRadius: '0.5rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'none',
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.background = '#FEE2E2'}
                                                    onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                                    title="Olvidar Dato"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                        </section>
                    )}

                    {/* SECCIÓN 3: PLAN & OBJETIVO */}
                    {/* [P3-PROFILE-PLAN-CARD-REDESIGN · 2026-05-20]
                        Minimal outline + accent icon. Reemplaza el gradient
                        indigo→verde + sombra emerald saturada (no usaba tokens
                        del design system + sombra se clipeaba por overflow:hidden
                        del .grid wrapper en mobile). Mismo pattern visual que
                        P3-RESTOCK-MINIMAL-CTA del Dashboard: card blanco border
                        slate-200, icon container coloreado por meta, texto
                        slate-900, CTA slate-900 con ArrowRight + microinteracción
                        translateX hover. */}
                    {activeSection === 'plan' && (
                        <section className={styles.section}>
                            <style>{`
                                .plan-goal-card {
                                    background: #FFFFFF;
                                    border: 1px solid #E2E8F0;
                                    border-radius: 1.125rem;
                                    padding: 1.5rem;
                                    display: flex;
                                    flex-direction: column;
                                    gap: 1.5rem;
                                }
                                .plan-goal-row {
                                    display: flex;
                                    align-items: center;
                                    gap: 1rem;
                                }
                                .plan-goal-icon {
                                    width: 64px;
                                    height: 64px;
                                    border-radius: 0.875rem;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    flex-shrink: 0;
                                }
                                .plan-goal-label {
                                    font-size: 0.7rem;
                                    color: #64748B;
                                    font-weight: 700;
                                    letter-spacing: 0.08em;
                                    text-transform: uppercase;
                                    margin-bottom: 0.35rem;
                                }
                                .plan-goal-name {
                                    font-size: 1.625rem;
                                    font-weight: 800;
                                    color: #0F172A;
                                    letter-spacing: -0.02em;
                                    line-height: 1.1;
                                    word-break: break-word;
                                }
                                .plan-goal-divider {
                                    height: 1px;
                                    background: #F1F5F9;
                                }
                                .plan-goal-kcal-row {
                                    display: flex;
                                    align-items: baseline;
                                    justify-content: space-between;
                                    gap: 0.75rem;
                                }
                                .plan-goal-kcal-label {
                                    font-size: 0.95rem;
                                    color: #64748B;
                                    font-weight: 500;
                                }
                                .plan-goal-kcal-value {
                                    font-size: 2rem;
                                    font-weight: 800;
                                    color: #0F172A;
                                    letter-spacing: -0.025em;
                                    line-height: 1;
                                }
                                .plan-goal-kcal-unit {
                                    font-size: 0.95rem;
                                    font-weight: 500;
                                    color: #64748B;
                                    margin-left: 0.35rem;
                                }
                                .plan-goal-cta {
                                    width: 100%;
                                    padding: 1.125rem 1rem;
                                    background: #0F172A;
                                    color: #FFFFFF;
                                    border: none;
                                    border-radius: 0.875rem;
                                    font-weight: 600;
                                    font-size: 1.02rem;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 0.55rem;
                                    transition: background 0.15s ease;
                                    font-family: inherit;
                                }
                                .plan-goal-cta:hover { background: #1E293B; }
                                .plan-goal-cta:focus-visible {
                                    outline: 2px solid #4F46E5;
                                    outline-offset: 2px;
                                }
                                .plan-goal-cta[disabled] {
                                    background: #F1F5F9;
                                    color: #94A3B8;
                                    cursor: not-allowed;
                                }
                                .plan-goal-arrow {
                                    transition: transform 0.18s ease;
                                }
                                .plan-goal-cta:hover .plan-goal-arrow {
                                    transform: translateX(3px);
                                }
                                .plan-goal-cta[disabled] .plan-goal-arrow {
                                    display: none;
                                }
                                @media (max-width: 480px) {
                                    .plan-goal-card {
                                        padding: 1.375rem 1.25rem;
                                        gap: 1.375rem;
                                    }
                                    .plan-goal-icon { width: 60px; height: 60px; }
                                    .plan-goal-name { font-size: 1.5rem; }
                                    .plan-goal-kcal-value { font-size: 1.875rem; }
                                }
                                @media (prefers-reduced-motion: reduce) {
                                    .plan-goal-arrow { transition: none; }
                                    .plan-goal-cta:hover .plan-goal-arrow { transform: none; }
                                }
                                /* [DARK-THEME] Overrides para modo oscuro: re-mapea
                                   las superficies estructurales claras del card a las
                                   variables del tema. El modo claro queda intacto. */
                                html[data-theme="dark"] .plan-goal-card {
                                    background: var(--bg-card);
                                    border-color: var(--border);
                                }
                                html[data-theme="dark"] .plan-goal-name,
                                html[data-theme="dark"] .plan-goal-kcal-value {
                                    color: var(--text-main);
                                }
                                html[data-theme="dark"] .plan-goal-label,
                                html[data-theme="dark"] .plan-goal-kcal-label,
                                html[data-theme="dark"] .plan-goal-kcal-unit {
                                    color: var(--text-muted);
                                }
                                html[data-theme="dark"] .plan-goal-divider {
                                    background: var(--border);
                                }
                                /* CTA slate-900 (near-black) desaparecería sobre el
                                   card oscuro → re-mapear a indigo de marca visible. */
                                html[data-theme="dark"] .plan-goal-cta {
                                    background: #4F46E5;
                                }
                                html[data-theme="dark"] .plan-goal-cta:hover {
                                    background: #6366F1;
                                }
                                html[data-theme="dark"] .plan-goal-cta[disabled] {
                                    background: var(--bg-muted);
                                    color: var(--text-light);
                                }
                            `}</style>

                            <h2 className={styles.sectionTitle}>
                                Tu Objetivo Actual
                            </h2>

                            <div className="plan-goal-card">
                                {/* Row 1: icon + meta label/name */}
                                <div className="plan-goal-row">
                                    {/* [P3-EVALUATE-MODAL-DARK · 2026-05-30] En oscuro el
                                        `tint` pastel claro (ej. #D1FAE5 menta) se veía como
                                        un círculo brillante; usamos un tinte translúcido del
                                        acento (~14%) cohesivo con la paleta oscura. */}
                                    <div className="plan-goal-icon" style={{ background: _settingsDark ? `${_goalMeta.accent}24` : _goalMeta.tint }}>
                                        <_goalMeta.Icon size={30} color={_goalMeta.accent} strokeWidth={2} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="plan-goal-label">Meta principal</div>
                                        <div className="plan-goal-name">{_goalMeta.label}</div>
                                    </div>
                                </div>

                                <div className="plan-goal-divider" />

                                {/* Row 2: kcal */}
                                <div className="plan-goal-kcal-row">
                                    <span className="plan-goal-kcal-label">Calorías diarias</span>
                                    <span className="plan-goal-kcal-value">
                                        {Math.round(planData?.calories || 2000).toLocaleString('es-DO')}
                                        <span className="plan-goal-kcal-unit">kcal</span>
                                    </span>
                                </div>

                                {/* CTA */}
                                <button
                                    type="button"
                                    onClick={() => { if (!isLimitReached) setShowEvaluateModal(true); }}
                                    disabled={isLimitReached}
                                    className="plan-goal-cta"
                                >
                                    {isLimitReached ? 'Límite de plan alcanzado' : 'Evaluar de Nuevo'}
                                    <ArrowRight size={19} strokeWidth={2.25} className="plan-goal-arrow" />
                                </button>

                                {isLimitReached && (
                                    <div style={{ textAlign: 'center', marginTop: '-0.5rem' }}>
                                        <a
                                            href="#subscription"
                                            style={{
                                                color: '#4F46E5',
                                                fontSize: '0.9rem',
                                                fontWeight: 500,
                                                textDecoration: 'underline',
                                                cursor: 'pointer',
                                            }}
                                            onClick={(e) => {
                                                // [P3-SETTINGS-UPSELL-DEADLINK · 2026-06-01] El
                                                // elemento id="subscription" solo se renderiza bajo
                                                // activeSection==='subscription', mutuamente excluyente
                                                // con la sección 'plan' donde vive este link → el
                                                // querySelector devolvía null y el preventDefault
                                                // mataba la navegación por hash = no-op total justo en
                                                // el momento de conversión a pago. navigateToSection
                                                // monta la sección de suscripción (setActiveSection +
                                                // replaceState), patrón ya usado por el sidebar.
                                                e.preventDefault();
                                                navigateToSection('subscription');
                                            }}
                                        >
                                            Actualiza tu suscripción para continuar
                                        </a>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* SECCIÓN 4: SUSCRIPCIÓN */}
                    {activeSection === 'subscription' && (
                    <section className={styles.section} id="subscription">
                        <h2 className={styles.sectionTitle} style={{ marginBottom: '1rem' }}>
                            Suscripción y Pagos
                        </h2>
                        
                        <div style={{
                            background: 'var(--bg-muted)',
                            border: '1px solid var(--border)',
                            padding: '1.5rem',
                            borderRadius: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem'
                        }}>
                            <div className={styles.planHeader}>
                                <div style={{ width: '100%' }}>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Plan Actual
                                    </div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {userProfile?.plan_tier === 'ultra' ? 'Ultra (Ilimitado)' : 
                                         userProfile?.plan_tier === 'plus' ? 'Plus' : 
                                         userProfile?.plan_tier === 'basic' ? 'Básico' :
                                         userProfile?.plan_tier === 'admin' ? 'Administrador' : 'Plan Gratis'}
                                        
                                        {isPaidSubscriber && (
                                            <span style={{
                                                fontSize: '0.75rem',
                                                padding: '0.2rem 0.5rem',
                                                /* [P3-SUBSCRIPTION-DARK · 2026-05-30] Pastilla con tinte
                                                   translúcido en oscuro (antes #DCFCE7/#F1F5F9 claros). */
                                                background: userProfile?.subscription_status === 'CANCELLED'
                                                    ? (_settingsDark ? 'rgba(148, 163, 184, 0.18)' : '#F1F5F9')
                                                    : (_settingsDark ? 'rgba(34, 197, 94, 0.16)' : '#DCFCE7'),
                                                color: userProfile?.subscription_status === 'CANCELLED'
                                                    ? (_settingsDark ? '#CBD5E1' : '#475569')
                                                    : (_settingsDark ? '#4ADE80' : '#166534'),
                                                borderRadius: '1rem',
                                                fontWeight: 600
                                            }}>
                                                {userProfile?.subscription_status === 'CANCELLED' ? 'Activo (Cancelada)' : 'Activo'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {isPaidSubscriber && userProfile?.subscription_status !== 'CANCELLED' && (
                                    <div className={styles.planAction}>
                                        <button 
                                            onClick={handleCancelSubscription}
                                            disabled={isCancelling}
                                            style={{
                                                /* [P3-SUBSCRIPTION-DARK · 2026-05-30] Rojo translúcido
                                                   + texto/borde rojo-400 en oscuro (antes #FEF2F2 rosa
                                                   claro → botón brillante y de bajo contraste). */
                                                background: _settingsDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
                                                color: _settingsDark ? '#F87171' : '#DC2626',
                                                border: _settingsDark ? '1px solid rgba(248, 113, 113, 0.35)' : '1px solid #FECACA',
                                                padding: '0.6rem 1.25rem',
                                                borderRadius: '0.75rem',
                                                fontWeight: 600,
                                                cursor: isCancelling ? 'wait' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                transition: 'none',
                                                boxShadow: _settingsDark ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.05)',
                                                opacity: isCancelling ? 0.7 : 1
                                            }}
                                            onMouseOver={(e) => {
                                                if(!isCancelling) { e.currentTarget.style.background = _settingsDark ? 'rgba(239, 68, 68, 0.22)' : '#FEE2E2'; e.currentTarget.style.boxShadow = _settingsDark ? '0 4px 14px rgba(0, 0, 0, 0.35)' : '0 6px 16px rgba(220, 38, 38, 0.18)'; }
                                            }}
                                            onMouseOut={(e) => {
                                                if(!isCancelling) { e.currentTarget.style.background = _settingsDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2'; e.currentTarget.style.boxShadow = _settingsDark ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.05)'; }
                                            }}
                                        >
                                            {isCancelling ? 'Cancelando...' : 'Cancelar Suscripción'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {isPaidSubscriber && userProfile?.subscription_status === 'CANCELLED' && (
                                <div style={{
                                    display: 'flex',
                                    gap: '0.75rem',
                                    /* [P3-SUBSCRIPTION-DARK · 2026-05-30] Azul translúcido
                                       en oscuro (antes #EFF6FF claro → bloque brillante). */
                                    background: _settingsDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
                                    padding: '1rem',
                                    borderRadius: '0.75rem',
                                    border: _settingsDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #BFDBFE',
                                    color: _settingsDark ? '#93C5FD' : '#1E3A8A',
                                    fontSize: '0.85rem',
                                    marginTop: '0.5rem'
                                }}>
                                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                                    <div>
                                        Has cancelado la renovación automática. Mantendrás tus beneficios premium hasta el final de tu ciclo de facturación actual. Luego tu plan pasará a ser Gratis.
                                    </div>
                                </div>
                            )}

                            {isPaidSubscriber && userProfile?.subscription_status !== 'CANCELLED' && (
                                <div style={{
                                    display: 'flex',
                                    gap: '0.75rem',
                                    /* [P3-SUBSCRIPTION-DARK · 2026-05-30] Ámbar translúcido
                                       en oscuro (antes #FFFBEB crema → bloque brillante). */
                                    background: _settingsDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                                    padding: '1rem',
                                    borderRadius: '0.75rem',
                                    border: _settingsDark ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #FEF3C7',
                                    color: _settingsDark ? '#FCD34D' : '#B45309',
                                    fontSize: '0.85rem',
                                    marginTop: '0.5rem'
                                }}>
                                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                                    <div>
                                        Al cancelar, la no-renovación será inmediata, pero mantendrás acceso hasta que termine tu periodo pagado actual.
                                    </div>
                                </div>
                            )}
                            
                            {!isPaidSubscriber && userProfile?.plan_tier !== 'admin' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                                        Estás en el <strong>Plan Gratis</strong>. No tienes ninguna suscripción activa que cancelar. Mejora tu plan para desbloquear más planes al mes, memoria a largo plazo y funciones premium.
                                    </div>
                                    <button
                                        onClick={() => navigate('/dashboard/upgrade')}
                                        style={{
                                            alignSelf: 'flex-start',
                                            background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                                            color: '#FFFFFF',
                                            border: 'none',
                                            padding: '0.6rem 1.25rem',
                                            borderRadius: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                                            // [2026-05-29] Mismo hover que los demás botones:
                                            // anillo interno nítido + brillo.
                                            transition: 'box-shadow 0.15s ease, filter 0.15s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.25), inset 0 0 0 1.5px rgba(255,255,255,0.45)';
                                            e.currentTarget.style.filter = 'brightness(1.08)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.25)';
                                            e.currentTarget.style.filter = 'none';
                                        }}
                                    >
                                        <Zap size={16} /> Mejorar mi plan
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>
                    )}

                    {/* Sección "Memoria IA" eliminada: su contenido fue fusionado
                        dentro de Preferencias como sub-sección "Lo que el agente recuerda". */}
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};

export default Settings;