// [P1-PLAN-MODE · 2026-08-11] Paso 0: ¿qué quieres que haga la app?
//
// NO es un tercer botón de QPlanSource, y las tres razones están medidas:
//  1. `planSource` es un enum binario ('scratch'|'pantry') que el backend lee como
//     «cualquier otro valor ⇒ generación libre»: un 'none' viajaría en el spread del
//     SSE y el backend GENERARÍA el plan (la forma de P1-DIET-CANON-SSOT: un valor
//     que nadie canonicaliza, tratado en silencio como el default).
//  2. Un radio group tiene UNA pregunta. La de QPlanSource es «¿de dónde salen los
//     ingredientes?» y «que no salgan» no la responde.
//  3. El interruptor tiene que ser EL MISMO objeto que el del dashboard: los crons no
//     leen formData, y los crons son donde se gasta el dinero. Este paso no ES el
//     interruptor — lo PULSA (PUT /api/profile/plan-mode) al terminar el formulario.
//
// Coste honesto: quien sí quiere plan da un tap más. A cambio, la primera pantalla
// por fin dice qué hace el producto.
import { useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import Modal from '../../common/Modal';
import { CalendarRange, Gauge, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../../i18n';

export const QAppMode = ({ onAutoAdvance }) => {
    const { formData, updateData, isGuest } = useAssessment();
    const t = useT();
    const value = formData.appMode;
    const isAuth = !isGuest;
    const [showBetaModal, setShowBetaModal] = useState(false);

    const set = (v) => updateData('appMode', v);

    const checkBetaWarning = (onConfirm) => {
        let yaAdvirtio = false;
        try {
            yaAdvirtio = localStorage.getItem('bioboros_plan_beta_warned') === 'true';
        } catch {
            yaAdvirtio = false;
        }

        if (!yaAdvirtio) {
            setShowBetaModal(true);
            return false;
        }
        onConfirm();
        return true;
    };

    const handleChooseTracking = () => {
        setShowBetaModal(false);
        try {
            localStorage.setItem('bioboros_plan_beta_warned', 'true');
        } catch {}
        set('tracking');
        onAutoAdvance();
    };

    const handleConfirmPlanBeta = () => {
        setShowBetaModal(false);
        try {
            localStorage.setItem('bioboros_plan_beta_warned', 'true');
        } catch {}
        set('plan');
        onAutoAdvance();
    };

    // [P1-PLAN-LOTE-926 · 2026-09-30] Decisión del dueño para salir a la App Store: el contador es la forma PRINCIPAL y
    // recomendada (va primero, con «Recomendado»); el plan generado por IA sigue disponible como «Beta».
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <RadioCard
                name="appMode" value="tracking" icon={Gauge}
                label={t('Contar lo que como')}
                badge={t('Recomendado')} badgeTone="accent"
                desc={isAuth
                    ? t('Anota tus comidas con una foto o un texto. Te decimos cuántas calorías y proteínas llevas, y el coach te ayuda.')
                    : t('Requiere cuenta: tu diario vive en tu perfil. Inicia sesión para usar este modo.')}
                checked={value === 'tracking'}
                disabled={!isAuth}
                onChange={(e) => { if (isAuth) { set(e.target.value); onAutoAdvance(); } }}
                onClick={() => {
                    if (!isAuth) {
                        toast.info(t('Necesitas una cuenta para el modo contador'), {
                            description: t('Tu diario vive en tu perfil. Inicia sesión y vuelve a este paso.'),
                            duration: 5000,
                        });
                        return;
                    }
                    if (value === 'tracking') onAutoAdvance();
                }}
            />
            <RadioCard
                name="appMode" value="plan" icon={CalendarRange}
                label={t('Plan de comidas con IA')}
                badge={t('Beta')}
                desc={t('La IA te arma el menú de cada día, con recetas y lista de compras.')}
                checked={value === 'plan'}
                onChange={() => {
                    checkBetaWarning(() => {
                        set('plan');
                        onAutoAdvance();
                    });
                }}
                onClick={() => {
                    checkBetaWarning(() => {
                        set('plan');
                        if (value === 'plan') onAutoAdvance();
                    });
                }}
            />

            <Modal
                isOpen={showBetaModal}
                onClose={() => setShowBetaModal(false)}
                titleId="modal-beta-plan-title"
                maxWidth="460px"
                isBottomSheetOnMobile={true}
            >
                <div style={{ padding: '0.25rem 0.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.15rem' }}>
                        <div style={{
                            width: 46,
                            height: 46,
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(139, 92, 246, 0.22) 100%)',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            display: 'grid',
                            placeItems: 'center',
                            color: '#F59E0B',
                            flexShrink: 0,
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
                        }}>
                            <FlaskConical size={24} strokeWidth={2.2} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h3 id="modal-beta-plan-title" style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.25 }}>
                                    {t('Plan de comidas con IA')}
                                </h3>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '0.12rem 0.5rem',
                                    borderRadius: 999,
                                    background: 'rgba(245, 158, 11, 0.2)',
                                    color: '#F59E0B',
                                    border: '1px solid rgba(245, 158, 11, 0.4)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em'
                                }}>
                                    {t('Beta')}
                                </span>
                            </div>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                {t('Función en desarrollo activo')}
                            </p>
                        </div>
                    </div>

                    <div style={{
                        background: 'var(--bg-muted, rgba(255, 255, 255, 0.04))',
                        border: '1px solid var(--border)',
                        borderRadius: '14px',
                        padding: '1rem',
                        marginBottom: '1.25rem',
                        fontSize: '0.88rem',
                        lineHeight: 1.55,
                    }}>
                        <p style={{ margin: '0 0 0.75rem', color: 'var(--text-main)' }}>
                            {t('Esta función aún está en fase Beta y no está al 100%. Las sugerencias automáticas de recetas y menús pueden requerir ajustes frecuentes.')}
                        </p>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--primary, #6366F1)' }}>{t('Te recomendamos: ')}</strong>
                            {t('Usar el modo contador («Contar lo que como»). Es la experiencia principal de Bioboros: más rápida, precisa con fotos y voz, y totalmente probada.')}
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <button
                            type="button"
                            data-hover="boton"
                            onClick={handleChooseTracking}
                            style={{
                                width: '100%',
                                padding: '0.85rem 1.1rem',
                                borderRadius: '0.85rem',
                                border: 'none',
                                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                            }}
                        >
                            <span>{t('Usar solo el contador (Recomendado)')}</span>
                        </button>
                        <button
                            type="button"
                            data-hover="fantasma"
                            onClick={handleConfirmPlanBeta}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: '0.85rem',
                                border: '1px solid var(--border)',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                fontSize: '0.88rem',
                                cursor: 'pointer',
                            }}
                        >
                            {t('Entendido, probar versión Beta')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
