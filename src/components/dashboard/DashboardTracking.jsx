// [P1-PLAN-MODE · 2026-08-11] El dashboard del modo seguimiento — el contador.
//
// NO es DashboardInner degradado: aquel tiene 166 referencias a planData (≥20 sin
// optional chaining) y montarlo con null no es «degradado», es un crash. Este monta
// SOLO lo ya medido como independiente del plan: el progreso del día (que es el
// producto en este modo), el agua, los créditos y la tarjeta de encender el plan.
//
// LA REGLA DE LAS METAS, y es fail-closed: TrackingProgress solo se monta con metas
// REALES de /api/nutrition/targets (cuya forma es idéntica a plan_data por contrato).
// Sin ok:true no se pintan barras — los cuatro `||` de la tarjeta (2000/150/200/60)
// son un plan genérico disfrazado de meta personal, y una barra que miente es peor
// que una barra ausente: parece que funciona.
import { useState, useEffect, useCallback } from 'react';
import { readTargetsCache, writeTargetsCache } from '../../utils/targetsCache';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Loader2, Gauge } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import { reanudarPlanes } from '../../utils/planModeResume';
import { useAssessment } from '../../context/AssessmentContext';
import { missingPlanQuestionsCount } from '../../config/formValidation';
import { leerInvitacion, leerInvitacionCentro, anotarInvitacion, estadoLocal, descartadaLocal, tiempoVisibleRestante } from '../../utils/planInvite';
import { pedirCompletarFormulario } from '../../utils/completarFormulario';
import { useT, useTn } from '../../i18n';
import TrackingProgress from './TrackingProgress';
import WaterTracker from './WaterTracker';
import styles from './DashboardTracking.module.css';

// Cuántas preguntas del contrato de PLAN le faltan — un hecho, no un adjetivo.
const _DISMISS_KEY = 'mealfit_turnon_card_dismissed';

const TurnOnPlanCard = ({ formData, hayPlanPausado = false, inNotificationCenter = false, onActionDone, onDismissChange }) => {
    const t = useT();
    const tn = useTn();
    const navigate = useNavigate();
    const { updateData, session, userProfile } = useAssessment();
    const userId = session?.user?.id || userProfile?.id || '';
    // [P1-PLAN-LOTE-135 · 2026-09-20] [BB-050 · 2026-11-09] Una vez por SEMANA y por USUARIO (utils/planInvite.js).
    // En el centro de notificaciones (`inNotificationCenter`) permanece guardada hasta que el usuario decida
    // explícitamente «Encender el plan» / «Reanudar el plan» o «Ahora no».
    const [dismissed, setDismissed] = useState(() => estadoLocal(_DISMISS_KEY, userId) !== 'visible');
    const [visibleUntil, setVisibleUntil] = useState(() => Date.now() + tiempoVisibleRestante(_DISMISS_KEY, userId));
    useEffect(() => {
        onDismissChange?.(dismissed);
    }, [dismissed, onDismissChange]);
    useEffect(() => {
        if (inNotificationCenter) {
            setDismissed(descartadaLocal(_DISMISS_KEY, userId));
        }
        if (!userId) return undefined;
        let vivo = true;
        const preguntar = () => {
            if (inNotificationCenter) {
                setDismissed(descartadaLocal(_DISMISS_KEY, userId));
                leerInvitacionCentro(_DISMISS_KEY, userId).then((r) => {
                    if (!vivo) return;
                    setDismissed(!r.visible || descartadaLocal(_DISMISS_KEY, userId));
                });
                return;
            }
            const local = estadoLocal(_DISMISS_KEY, userId);
            if (local !== 'desconocido') setDismissed(local !== 'visible');
            setVisibleUntil(Date.now() + tiempoVisibleRestante(_DISMISS_KEY, userId));
            leerInvitacion(_DISMISS_KEY, userId).then((r) => {
                if (!vivo) return;
                const visible = r.visible && estadoLocal(_DISMISS_KEY, userId) !== 'escondida';
                setDismissed(!visible);
                setVisibleUntil(Date.now() + tiempoVisibleRestante(_DISMISS_KEY, userId));
                if (r.nueva && visible) anotarInvitacion(_DISMISS_KEY, userId, 'seen');
            });
        };
        const alVolver = () => { if (document.visibilityState === 'visible') preguntar(); };
        preguntar();
        document.addEventListener('visibilitychange', alVolver);
        return () => { vivo = false; document.removeEventListener('visibilitychange', alVolver); };
    }, [userId, inNotificationCenter]);
    const descartar = () => {
        anotarInvitacion(_DISMISS_KEY, userId, 'dismiss');
        setDismissed(true);
    };
    useEffect(() => {
        if (inNotificationCenter || dismissed || !userId) return undefined;
        // Expiration is not an explicit «Ahora no». The original seen time
        // already keeps this invitation hidden for the rest of the week.
        const timer = window.setTimeout(() => setDismissed(true), Math.max(0, visibleUntil - Date.now()));
        return () => window.clearTimeout(timer);
    }, [inNotificationCenter, dismissed, userId, visibleUntil]);
    // [AUDIT-FORM-COPY · 2026-08-12] En PREGUNTAS (la unidad de la pantalla),
    // no en campos: «Tus Medidas» son 4 campos y UNA pregunta.
    const faltan = missingPlanQuestionsCount(formData || {});

    const irAlPlan = () => {
        onActionDone?.();
        pedirCompletarFormulario();
        updateData('appMode', 'plan');
        navigate('/assessment');
    };

    const handleReanudar = () => {
        onActionDone?.();
        reanudarPlanes();
    };

    if (hayPlanPausado) {
        if (dismissed) return null;
        return (
            <div className={styles.turnOnCard}>
                <span className={styles.turnOnTitle}>{t('Tu plan está en pausa')}</span>
                <p className={styles.turnOnBody}>
                    {t('Sigue guardado en tu Historial. Reanudarlo es gratis y retoma exactamente donde quedó.')}
                </p>
                <div className={styles.turnOnActions}>
                    <button type="button" className={styles.turnOnBtn} onClick={handleReanudar}>
                        {t('Reanudar el plan')}
                    </button>
                    <button
                        type="button"
                        data-hover="fantasma"
                        className={styles.turnOnGhost}
                        onClick={descartar}
                    >
                        {t('Ahora no')}
                    </button>
                </div>
            </div>
        );
    }

    if (dismissed) return null;

    return (
        <div className={styles.turnOnCard}>
            <span className={styles.turnOnTitle}>{t('¿Quieres que la IA te arme el plan?')}</span>
            <p className={styles.turnOnBody}>
                {faltan > 0
                    ? tn(
                        faltan,
                        'Te faltan {n} pregunta del formulario y usa 1 crédito de tu mes.',
                        'Te faltan {n} preguntas del formulario y usa 1 crédito de tu mes.',
                        { n: faltan }
                    )
                    : t('Ya tienes todo respondido: generarlo usa 1 crédito de tu mes.')}
            </p>
            <div className={styles.turnOnActions}>
                <button type="button" data-hover="boton" className={styles.turnOnBtn} onClick={irAlPlan}>
                    {t('Encender el plan')}
                </button>
                <button
                    type="button"
                    data-hover="fantasma"
                    className={styles.turnOnGhost}
                    onClick={descartar}
                >
                    {t('Ahora no')}
                </button>
            </div>
        </div>
    );
};

export { TurnOnPlanCard };

// [P1-PLAN-LOTE-103 · 2026-09-18] `modo`: «contador» (sin generador: las metas salen de /api/nutrition/targets y va
// la invitación a encender el plan) o «plan» (la pestaña «Progreso» del modo plan: las metas son las del plan
// vigente y no hay invitación). Las secciones —macros y micros en una tarjeta, hidratación— son las mismas en los dos.
const DashboardTracking = ({ modo = 'contador' }) => {
    const t = useT();
    // Créditos: mismas props que el call site de DashboardInner — el medidor no
    // deriva nada solo (con undefined pintaría 0/0 «agotado», una mentira roja).
    const { userProfile, formData, planData, session } = useAssessment();
    const navigate = useNavigate();
    // null = todavía no sé · {ok:false} = no puedo (y por qué) · {ok:true} = metas.
    // [P1-PLAN-LOTE-112 · 2026-09-19] Nace con las metas RECORDADAS (utils/targetsCache.js): volver a «Progreso» ya
    // no enseña «Calculando tus metas…». Se vuelve a pedir por detrás en cada montaje y, si algo cambió, se
    // actualiza sin aviso. Un fallo (red, 5xx) no pisa unas metas buenas que ya están en pantalla.
    const uid = userProfile?.id || null;
    const [targetsPedidas, setTargets] = useState(() => readTargetsCache(uid));
    // El perfil puede llegar DESPUÉS del primer render (uid null al nacer): la caché se consulta también aquí.
    const targets = targetsPedidas ?? readTargetsCache(uid);

    const cargar = useCallback(async () => {
        let nuevo;
        try {
            const r = await fetchWithAuth('/api/nutrition/targets');
            const d = await r.json().catch(() => null);
            nuevo = d && typeof d.ok === 'boolean' ? d : { ok: false, missing_fields: [] };
        } catch {
            nuevo = { ok: false, missing_fields: [], reason: 'network' };
        }
        if (nuevo.ok) writeTargetsCache(uid, nuevo);
        // `missing_fields` con contenido es una respuesta VERDADERA del servidor (el perfil ya no alcanza): esa sí
        // manda. Lo que no pisa a unas metas buenas es el «no pude» sin motivo (red caída, 5xx).
        setTargets((prev) => {
            const vigente = prev ?? readTargetsCache(uid);
            return !nuevo.ok && vigente?.ok && !nuevo.missing_fields?.length ? vigente : nuevo;
        });
    }, [uid]);

    useEffect(() => { cargar(); }, [cargar]);

    // En modo plan las metas de macros son las del plan vigente (misma forma que /nutrition/targets, por contrato);
    // sin plan cargado (p. ej. generándose) se cae a las metas del perfil.
    const metasMacros = modo === 'plan' && planData?.calories ? { ok: true, ...planData } : targets;

    // [P1-PLAN-LOTE-102 · 2026-09-18] Configuración (modo contador) guarda peso/altura/edad/sexo al momento y avisa:
    // las metas se vuelven a pedir sin recargar la página.
    useEffect(() => {
        window.addEventListener('mealfit:targets-changed', cargar);
        return () => window.removeEventListener('mealfit:targets-changed', cargar);
    }, [cargar]);

    // [P1-NEVERA-OPCIONAL · 2026-09-23] La Nevera se apaga SOLA tras 48 h vacía en modo contador; que no sea en
    // silencio: se dice UNA vez por apagado y por dispositivo, con el camino de vuelta (mismo patrón que la hidratación).
    // Solo en el panel del CONTADOR (`modo === 'contador'`, como la invitación de abajo): este componente es también la
    // pestaña «Progreso» del modo plan, donde la Nevera es obligatoria. La guarda es del cliente —no se apoya en que el
    // servidor nunca mande `nevera_activa: false` en modo plan— y corta ANTES de dar la nota por vista.
    useEffect(() => {
        const at = userProfile?.nevera_auto_off_at;
        if (modo !== 'contador' || userProfile?.nevera_activa !== false || typeof at !== 'string' || !at) return;
        if (safeLocalStorageGet('mealfit_nevera_auto_off_visto', null) === at) return;
        safeLocalStorageSet('mealfit_nevera_auto_off_visto', at);
        toast(t('Ocultamos tu Nevera'), {
            description: t('Llevaba 2 días vacía. Puedes volver a encenderla en Configuración → Capacidades.'),
            duration: 6000,
        });
    }, [modo, userProfile?.nevera_activa, userProfile?.nevera_auto_off_at, t]);

    // [P1-PLAN-LOTE-88 · 2026-09-17] `flatOnMobile` en las dos secciones grandes: en el teléfono van SIN
    // marco de tarjeta y a todo el ancho (el dueño: «quitamos eso de las tarjeticas en móviles»). Sigue
    // con marco lo que se toca o se descarta: la invitación al plan, las filas de comidas, los botones.
    // El dashboard de plan comparte estas tarjetas y no pasa la prop: allí no cambia nada.
    return (
        <div className={styles.page}>
            <div className={styles.mainCol}>
                {metasMacros === null && (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spin} size={22} aria-hidden="true" /> {t('Calculando tus metas…')}
                    </div>
                )}

                {metasMacros?.ok === false && (
                    <div className={styles.noGoals}>
                        <Gauge size={20} aria-hidden="true" />
                        <div>
                            <strong>{t('Faltan datos para tus metas.')}</strong>
                            <p className={styles.noGoalsBody}>
                                {targets.missing_fields?.length
                                    ? t('Completa tus medidas y objetivo en el formulario — dos minutos.')
                                    : t('No pudimos calcularlas ahora. Reintenta en un momento.')}
                            </p>
                        </div>
                        {targets.missing_fields?.length
                            ? (
                                <button type="button" className={styles.noGoalsBtn} onClick={() => navigate('/assessment')}>
                                    {t('Completar')}
                                </button>
                            )
                            : (
                                <button type="button" className={styles.noGoalsBtn} onClick={cargar}>
                                    {t('Reintentar')}
                                </button>
                            )}
                    </div>
                )}

                {metasMacros?.ok && (
                    // La forma de `targets` es idéntica a plan_data POR CONTRATO
                    // (calories numérico + macros con 'g'): la tarjeta consume una
                    // sola forma venga del plan o de aquí. El diario del día y los
                    // botones de registrar ya viven dentro.
                    // [P1-PLAN-LOTE-105] los micros van DENTRO de la misma tarjeta (metas de /nutrition/targets en
                    // los dos modos: en modo plan el plan trae las macros, no las metas DRI de los micros).
                    <TrackingProgress planData={metasMacros} userId={userProfile?.id} flatOnMobile microTargets={targets?.micros || null} referenceProfile={formData} />
                )}
            </div>

            <div className={styles.sideCol}>
                {/* [P1-PLAN-LOTE-86 · 2026-09-17] Sin medidor de créditos aquí: los créditos solo los
                    consumen acciones del generador (generar/analizar plan, cambiar plato, regenerar
                    día, expandir receta, arreglar sodio, reintentar bloques) y en modo seguimiento
                    ninguna es alcanzable; el coach tiene su cuota aparte y escanear/anotar no cuentan.
                    Un número que nada toca confunde (pregunta del dueño con captura). El dashboard
                    de plan (`Dashboard.jsx`) lo sigue mostrando: vuelve al reanudar el plan. */}
                <WaterTracker userId={session?.user?.id || userProfile?.id || 'guest'} flatOnMobile />
            </div>

            {/* [P1-PLAN-LOTE-87 · 2026-09-17] [BB-050 · 2026-11-09] La invitación a encender/reanudar el plan
                vive ahora dentro del Centro de Notificaciones (campana) para no mostrarse a primera vista.
                Se conserva el slot vacío (`.turnOnSlot:empty { display: none; }`) para el contrato de la rejilla. */}
            <div className={styles.turnOnSlot}></div>
        </div>
    );
};

DashboardTracking.propTypes = { modo: PropTypes.oneOf(['contador', 'plan']) };

export default DashboardTracking;
