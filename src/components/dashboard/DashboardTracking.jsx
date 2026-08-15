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
import { useNavigate } from 'react-router-dom';
import { Loader2, Gauge, ArrowRight } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import { reanudarPlanes } from '../../utils/planModeResume';
import { useAssessment } from '../../context/AssessmentContext';
import { missingPlanQuestionsCount } from '../../config/formValidation';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import { useT, useTn } from '../../i18n';
import TrackingProgress from './TrackingProgress';
import WaterTracker from './WaterTracker';
import CreditsMeter from './CreditsMeter';
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
        if (dismissed) {
            return (
                <button type="button" className={styles.turnOnLink} onClick={reanudarPlanes}>
                    {t('Tu plan está en pausa. Reanúdalo aquí')} <ArrowRight size={13} aria-hidden="true" />
                </button>
            );
        }
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

    // Las cinco reglas del «enciéndelo» (todas restricciones): un solo sitio, un
    // hecho y un coste, sin animación, el descarte colapsa a enlace (no borra la
    // puerta: sigue en el propio formulario), y el descarte PERSISTE.
    if (dismissed) {
        return (
            <button
                type="button"
                className={styles.turnOnLink}
                onClick={irAlPlan}
            >
                {t('¿Quieres el plan completo? Enciéndelo aquí')} <ArrowRight size={13} aria-hidden="true" />
            </button>
        );
    }

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
                    Ahora no
                </button>
            </div>
        </div>
    );
};

const DashboardTracking = () => {
    const t = useT();
    // Créditos: mismas props que el call site de DashboardInner — el medidor no
    // deriva nada solo (con undefined pintaría 0/0 «agotado», una mentira roja).
    const { userProfile, formData, planData, session, userPlanLimit, remainingCredits, planCount, isGuest } = useAssessment();
    const isLimitReached = typeof userPlanLimit === 'number' && planCount >= userPlanLimit;
    const navigate = useNavigate();
    // null = todavía no sé · {ok:false} = no puedo (y por qué) · {ok:true} = metas.
    const [targets, setTargets] = useState(null);

    const cargar = useCallback(async () => {
        try {
            const r = await fetchWithAuth('/api/nutrition/targets');
            const d = await r.json().catch(() => null);
            setTargets(d && typeof d.ok === 'boolean' ? d : { ok: false, missing_fields: [] });
        } catch {
            setTargets({ ok: false, missing_fields: [], reason: 'network' });
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    return (
        <div className={styles.page}>
            <div className={styles.mainCol}>
                {targets === null && (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spin} size={22} aria-hidden="true" /> {t('Calculando tus metas…')}
                    </div>
                )}

                {targets?.ok === false && (
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

                {targets?.ok && (
                    // La forma de `targets` es idéntica a plan_data POR CONTRATO
                    // (calories numérico + macros con 'g'): la tarjeta consume una
                    // sola forma venga del plan o de aquí. El diario del día y los
                    // botones de registrar ya viven dentro.
                    <TrackingProgress planData={targets} userId={userProfile?.id} />
                )}
            </div>

            <div className={styles.sideCol}>
                <CreditsMeter
                    remainingCredits={remainingCredits}
                    userPlanLimit={userPlanLimit}
                    isLimitReached={isLimitReached}
                    isGuest={isGuest}
                />
                <WaterTracker userId={session?.user?.id || userProfile?.id || 'guest'} />
                <TurnOnPlanCard formData={formData} hayPlanPausado={!!planData} />
            </div>
        </div>
    );
};

export default DashboardTracking;
