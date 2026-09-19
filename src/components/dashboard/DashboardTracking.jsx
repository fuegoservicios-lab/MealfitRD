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
import { fetchWithAuth } from '../../config/api';
import { reanudarPlanes } from '../../utils/planModeResume';
import { useAssessment } from '../../context/AssessmentContext';
import { missingPlanQuestionsCount } from '../../config/formValidation';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import { useT, useTn } from '../../i18n';
import TrackingProgress from './TrackingProgress';
import WaterTracker from './WaterTracker';
import styles from './DashboardTracking.module.css';

// Cuántas preguntas del contrato de PLAN le faltan — un hecho, no un adjetivo.
const _DISMISS_KEY = 'mealfit_turnon_card_dismissed';

const TurnOnPlanCard = ({ formData, hayPlanPausado = false }) => {
    const t = useT();
    const tn = useTn();
    const navigate = useNavigate();
    const { updateData } = useAssessment();
    const [dismissed, setDismissed] = useState(() => safeLocalStorageGet(_DISMISS_KEY, null) === '1');
    // [AUDIT-FORM-COPY · 2026-08-12] En PREGUNTAS (la unidad de la pantalla),
    // no en campos: «Tus Medidas» son 4 campos y UNA pregunta.
    const faltan = missingPlanQuestionsCount(formData || {});

    // [P1-SETTINGS-TRACKING-COHERENCE · 2026-08-12] Encender el plan cambia la RAMA
    // del wizard ANTES de navegar. Sin esto, formData.appMode seguía en 'tracking' y
    // la puerta aterrizaba en «Listo: tu contador» (paso 10 de la rama corta) — una
    // tarjeta que promete encender el plan y te deja en el final del modo contador.
    // El flip de appMode dispara el reset de índice del wizard (modo distinto ⇒ el
    // paso persistido se tira) y la rama del plan pregunta los 12 que faltan.
    const irAlPlan = () => {
        updateData('appMode', 'plan');
        navigate('/assessment');
    };

    // [P1-TRACKING-WINS · 2026-08-14] Con un plan PAUSADO la tarjeta cambia de
    // oferta: «Encender el plan» manda al wizard y cuesta 1 crédito — venderle
    // eso a quien YA tiene un plan guardado sería cobrarle por lo suyo. La
    // acción correcta es Reanudar (gratis, el mismo PUT quota-exento de la nota
    // de pausa y de Configuración). Bajo «contador manda» esta tarjeta es LA
    // puerta de vuelta dentro del dashboard: la nota de pausa de DashboardInner
    // quedó inalcanzable para usuarios en tracking.
    if (hayPlanPausado) {
        if (dismissed) return null;
        return (
            <div className={styles.turnOnCard}>
                <span className={styles.turnOnTitle}>{t('Tu plan está en pausa')}</span>
                <p className={styles.turnOnBody}>
                    {t('Sigue guardado en tu Historial. Reanudarlo es gratis y retoma exactamente donde quedó.')}
                </p>
                <div className={styles.turnOnActions}>
                    <button type="button" className={styles.turnOnBtn} onClick={reanudarPlanes}>
                        {t('Reanudar el plan')}
                    </button>
                    <button
                        type="button"
                        className={styles.turnOnGhost}
                        onClick={() => {
                            safeLocalStorageSet(_DISMISS_KEY, '1');
                            setDismissed(true);
                        }}
                    >
                        {t('Ahora no')}
                    </button>
                </div>
            </div>
        );
    }

    // Las reglas del «enciéndelo» (todas restricciones): un solo sitio, un hecho y
    // un coste, sin animación, y el descarte PERSISTE.
    // [P1-PLAN-LOTE-98 · 2026-09-18] Descartada, no queda NADA en el contador (ni el
    // enlace tenue del lote 91): la puerta de vuelta es el interruptor de
    // Configuración → Capacidades, y el dueño la quiere solo ahí. Vale para las dos
    // ofertas (encender y reanudar).
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
                <button type="button" className={styles.turnOnBtn} onClick={irAlPlan}>
                    {t('Encender el plan')}
                </button>
                <button
                    type="button"
                    className={styles.turnOnGhost}
                    onClick={() => {
                        safeLocalStorageSet(_DISMISS_KEY, '1');
                        setDismissed(true);
                    }}
                >
                    {/* [P2-I18N-BOTON-AHORA-NO-SIN-ENVOLVER · 2026-08-23] La traducción
                        existía en los cuatro catálogos (la usa el otro «Ahora no» de este
                        mismo fichero, 47 líneas más arriba) y este botón no la pedía. */}
                    {t('Ahora no')}
                </button>
            </div>
        </div>
    );
};

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
                    <TrackingProgress planData={metasMacros} userId={userProfile?.id} flatOnMobile microTargets={targets?.micros || null} />
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

            {/* [P1-PLAN-LOTE-87 · 2026-09-17] La invitación a encender el plan es hija DIRECTA de la
                rejilla: en el escritorio queda bajo la hidratación (área «plan»); en el teléfono va
                la PRIMERA (el dueño: «debería estar arriba de primero»). El orden lo decide el CSS
                por área, no un segundo render ni un `order` dentro de la columna lateral. */}
            <div className={styles.turnOnSlot}>
                {modo === 'contador' && <TurnOnPlanCard formData={formData} hayPlanPausado={!!planData} />}
            </div>
        </div>
    );
};

DashboardTracking.propTypes = { modo: PropTypes.oneOf(['contador', 'plan']) };

export default DashboardTracking;
