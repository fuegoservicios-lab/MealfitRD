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
// [P1-PLAN-LOTE-1116 · 2026-11-20] Decisión del dueño: el contador es el modo ESTABLE y el generador de planes está
// en pruebas; el aviso tiene que pesar «lo máximo posible». Ahora: seis advertencias concretas, el contador como
// primera opción y botón principal, y «Probar la Beta» bloqueado hasta marcar «Entiendo…». Sin cuenta sigue avanzando
// directo (P1-PLAN-LOTE-BETA-WARN, 5-nov): el contador exige cuenta, así que no hay alternativa que ofrecerle.
import { useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard } from '../../common/FormUI';
import Modal from '../../common/Modal';
import Button from '../../ui/Button';
import { CalendarRange, Gauge, FlaskConical, AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../../i18n';
import { WORDMARK_TEXT } from '../../../config/brand';
import { TIER_CREDITS } from '../../../config/plans';
import styles from './QAppMode.module.css';

/** Las advertencias del generador en pruebas. FUNCIÓN (no constante): el `t()` de módulo quedaría congelado. */
function advertencias(t) {
    return [
        t('Los menús pueden traer platos repetidos, cantidades raras o ingredientes que no tienes.'),
        t('Generar un plan tarda varios minutos y a veces falla o se queda a medias.'),
        t('Las recetas y la lista de compras pueden no cuadrar del todo.'),
        t('Puede cambiar sin aviso mientras lo mejoramos.'),
        t('Cada plan gasta uno de tus planes con IA del mes (en Gratis, {n}).', { n: TIER_CREDITS.gratis }),
        t('No sustituye a un nutricionista ni a tu médico.'),
    ];
}

export const QAppMode = ({ onAutoAdvance }) => {
    const { formData, updateData, isGuest } = useAssessment();
    const t = useT();
    const value = formData.appMode;
    const isAuth = !isGuest;
    const [showBetaModal, setShowBetaModal] = useState(false);
    const [entendido, setEntendido] = useState(false);

    const set = (v) => updateData('appMode', v);

    const abrirAviso = () => {
        if (!isAuth) {           // [P1-PLAN-LOTE-BETA-WARN] sin cuenta no hay contador que recomendar: avanza
            set('plan');
            onAutoAdvance();
            return;
        }
        setEntendido(false);
        setShowBetaModal(true);
    };

    const handleChooseTracking = () => {
        setShowBetaModal(false);
        set('tracking');
        onAutoAdvance();
    };

    const handleConfirmPlanBeta = () => {
        if (!entendido) return;
        setShowBetaModal(false);
        set('plan');
        onAutoAdvance();
    };

    // [P1-PLAN-LOTE-926 · 2026-09-30] El contador es la forma PRINCIPAL y recomendada (va primero, con «Recomendado»).
    return (
        <div className={styles.lista}>
            <RadioCard
                name="appMode" value="tracking" icon={Gauge}
                label={t('Contar lo que como')}
                badge={t('Recomendado')} badgeTone="accent"
                desc={isAuth
                    ? t('El modo estable: anota tus comidas con una foto o un texto, ve tus calorías y proteínas al instante y el coach te guía.')
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
                badge={t('Beta · en pruebas')}
                desc={t('Experimental: la IA arma un menú con recetas y lista de compras. Puede fallar.')}
                checked={value === 'plan'}
                onChange={() => abrirAviso()}
                onClick={() => {
                    if (value === 'plan') {
                        onAutoAdvance();
                        return;
                    }
                    abrirAviso();
                }}
            />

            <Modal
                isOpen={showBetaModal}
                onClose={() => setShowBetaModal(false)}
                titleId="modal-beta-plan-title"
                maxWidth="480px"
                isBottomSheetOnMobile={true}
            >
                <div className={styles.aviso}>
                    <div className={styles.cabecera}>
                        <div className={styles.icono} aria-hidden="true">
                            <FlaskConical size={24} strokeWidth={2.2} />
                        </div>
                        <div>
                            <h3 id="modal-beta-plan-title" className={styles.titulo}>
                                {t('El plan con IA está en fase de pruebas')}
                            </h3>
                            <p className={styles.subtitulo}>{t('Beta: todavía no es el modo estable de {marca}', { marca: WORDMARK_TEXT })}</p>
                        </div>
                    </div>

                    <div className={styles.alerta} role="note">
                        <p className={styles.alertaTitulo}>
                            <AlertTriangle size={16} strokeWidth={2.4} aria-hidden="true" />
                            {t('Antes de seguir, ten en cuenta:')}
                        </p>
                        <ul className={styles.advertencias}>
                            {advertencias(t).map((texto) => <li key={texto}>{texto}</li>)}
                        </ul>
                    </div>

                    <div className={styles.recomendacion}>
                        <ShieldCheck size={18} strokeWidth={2.3} aria-hidden="true" className={styles.recomendacionIcono} />
                        <p>
                            <strong>{t('Te recomendamos el contador.')}</strong>{' '}
                            {t('Es la experiencia probada de {marca}: registras con una foto o un texto, ves tus calorías y proteínas al instante y el coach te ayuda. Siempre puedes activar el plan más tarde en Ajustes.', { marca: WORDMARK_TEXT })}
                        </p>
                    </div>

                    <label className={styles.confirmar}>
                        <input
                            type="checkbox"
                            checked={entendido}
                            onChange={(e) => setEntendido(e.target.checked)}
                        />
                        <span>{t('Entiendo que es una versión de prueba: puede fallar y cambiar sin aviso.')}</span>
                    </label>

                    <div className={styles.botones}>
                        <Button variant="primary" block onClick={handleChooseTracking}>
                            {t('Usar el contador (recomendado)')}
                        </Button>
                        <Button variant="secondary" block onClick={handleConfirmPlanBeta} disabled={!entendido}>
                            {t('Probar el plan Beta de todos modos')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
