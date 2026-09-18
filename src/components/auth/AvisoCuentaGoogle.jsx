// [P1-PLAN-LOTE-97 · 2026-09-18] «¿Es la cuenta que querías?» — el aviso tras un acceso con Google que cae en una
// cuenta que este dispositivo no conocía, mientras conocía otra.
//
// Google no pregunta qué cuenta usar y desde aquí no se le puede obligar (lote 96). En el iPhone del dueño eso creó una
// cuenta nueva y vacía con su otro correo sin que lo notara. La lógica vive en `utils/cuentasDelDispositivo.js`; este
// componente solo pinta la pregunta y ejecuta la respuesta.
//
// Reutiliza el CSS del modal de cerrar sesión a propósito: es la misma familia (una identidad, una nota, dos acciones)
// y un cambio de estilo allí debe llegar aquí. Ojo con ese CSS: `.name` y `.email` van en UNA línea con puntos
// suspensivos, así que en la fila de identidad solo caben el correo y una etiqueta corta; la explicación va en la nota.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { useAssessment } from '../../context/AssessmentContext';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useT } from '../../i18n';
import { evaluarAccesoGoogle, recordarCuenta } from '../../utils/cuentasDelDispositivo';
import styles from '../dashboard/LogoutConfirmModal.module.css';

export default function AvisoCuentaGoogle() {
    const t = useT();
    const navigate = useNavigate();
    const { userProfile, loadingProfile, resetApp } = useAssessment() || {};
    const [aviso, setAviso] = useState(null);
    const [saliendo, setSaliendo] = useState(false);
    const evaluadoRef = useRef(null);

    useEffect(() => {
        if (loadingProfile || !userProfile?.id) return;
        if (evaluadoRef.current === userProfile.id) return;
        evaluadoRef.current = userProfile.id;
        const decision = evaluarAccesoGoogle(userProfile);
        if (decision.mostrar) setAviso(decision);
    }, [loadingProfile, userProfile]);

    // «Sí»: la cuenta pasa a ser conocida y no se vuelve a preguntar por ella en este dispositivo.
    const seguir = useCallback(() => {
        recordarCuenta(userProfile);
        setAviso(null);
    }, [userProfile]);

    // «No»: se cierra la sesión SIN recordarla. La cuenta que Google creó queda ahí (borrarla es decisión del usuario,
    // desde Configuración); aquí solo se deshace el acceso.
    const salir = useCallback(async () => {
        setSaliendo(true);
        try {
            if (typeof resetApp === 'function') await resetApp();
        } finally {
            setSaliendo(false);
            setAviso(null);
            navigate('/login', { replace: true });
        }
    }, [resetApp, navigate]);

    // Cerrar con Escape o tocando fuera NO decide: no se recuerda, y el próximo acceso con Google a esta cuenta vuelve
    // a preguntar.
    const cerrar = useCallback(() => { if (!saliendo) setAviso(null); }, [saliendo]);
    const { containerRef } = useModalAccessibility({ isOpen: !!aviso, onClose: cerrar, disableClose: saliendo });

    if (!aviso) return null;

    return (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="aviso-cuenta-google-titulo"
                tabIndex={-1}
                className={styles.card}
                data-aviso-cuenta-google=""
            >
                <h2 id="aviso-cuenta-google-titulo" className={styles.title}>{t('¿Es la cuenta que querías?')}</h2>

                <div className={styles.identity}>
                    <span className={styles.avatar} aria-hidden="true">{aviso.actual.slice(0, 1).toUpperCase()}</span>
                    <span className={styles.identityText}>
                        <span className={styles.name}>{aviso.actual}</span>
                        {/* `whiteSpace: normal`: el `.email` del CSS reutilizado va en una línea con puntos suspensivos;
                            a 320px esta etiqueta no cabe y se leería «…creada por Goo…». Aquí puede partir en dos. */}
                        <span className={styles.email} style={{ whiteSpace: 'normal' }}>
                            {aviso.nueva ? t('Cuenta nueva, creada por Google') : t('Primera vez en este teléfono')}
                        </span>
                    </span>
                </div>

                <p className={styles.note}>
                    <Info size={16} aria-hidden="true" />
                    <span>
                        {t('Antes entrabas con {anterior}. Google usa la cuenta que tenga abierta el teléfono, sin preguntar: para entrar con la de antes, sal y usa «Continuar con correo».', { anterior: aviso.anterior })}
                    </span>
                </p>

                <div className={styles.actions}>
                    <button type="button" className={styles.confirmBtn} onClick={seguir} disabled={saliendo}>
                        {t('Sí, seguir con esta')}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={salir} disabled={saliendo}>
                        {saliendo ? t('Cerrando sesión...') : t('No, salir')}
                    </button>
                </div>
            </div>
        </div>
    );
}
