// [P1-PLAN-LOTE-835 · 2026-09-29] «Esta es una cuenta de prueba»: el aviso que la PERSONA ve dentro de la app cuando el
// equipo la marca como cuenta de prueba (spec 2026-09-29, §5). Es la notificación que sustituye al correo (§6,
// «Publicación»): llega antes de que el equipo pueda abrir su contenido, porque el servidor exige que se anote
// `aviso_visto` (§13.4). Por eso es explícito y no se descarta sin más:
//   · sale UNA vez —hasta que el servidor anota la respuesta—, en cualquier página del dashboard con cuenta;
//   · «Entendido» anota `aviso_visto` (POST /api/profile/prueba/aviso-visto); «Salir del modo de prueba» sale
//     (POST /api/profile/prueba/salir). Ni Escape ni el fondo la cierran: la decisión es de la persona;
//   · si el servidor no anota la respuesta, la hoja SIGUE abierta con el motivo (un aviso no anotado no cuenta como
//     visto: el contenido sigue cerrado para el equipo) y se puede reintentar;
//   · una vez contestada, un perfil viejo que llegue después (el poll trae una copia anterior a la anotación) no la
//     reabre en esta carga; una marca NUEVA (otra `desde`: el equipo la quitó y la volvió a poner) sí sale otra vez.
// El perfil viene del contexto que ya lee la app (`userProfile.cuenta_de_prueba`, de GET /api/profile): nada nuevo
// entra en AssessmentContext.jsx (tope de líneas). Con el interruptor del servidor apagado el perfil no trae la clave y
// esto no pinta nada.
//
// Accesibilidad con `useModalAccessibility` (foco atrapado, foco de vuelta, fondo sin scroll). Portal a <body>: fuera de
// cualquier contenedor con `will-change`/`backdrop-filter` (una hoja `fixed` dentro de uno mide ESE nodo: lote 415), por
// encima de todo (`--z-modal-top`). `ph-no-capture`: la analítica no graba lo que se toca aquí (lote 842).
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useT } from '../../i18n';
import { anotarAvisoVisto, refrescarPerfil, salirDelModoDePrueba, textosCuentaDePrueba } from '../../utils/cuentaDePrueba';
import styles from './AvisoCuentaPrueba.module.css';

export default function AvisoCuentaPrueba() {
    const t = useT();
    const tx = useMemo(() => textosCuentaDePrueba(t), [t]);
    const { session, userProfile, refreshProfileAndPlan } = useAssessment() || {};
    const [respondida, setRespondida] = useState(null);   // la marca (por su fecha) cuyo aviso ya se contestó en esta carga
    const [enCurso, setEnCurso] = useState(null);   // 'visto' | 'salir' | null
    const [error, setError] = useState(null);
    const ocupada = useRef(false);
    const idTitulo = useId();
    const idTexto = useId();

    // El perfil en memoria puede ser el de otra cuenta un instante tras cambiar de sesión: no se le enseña a esta.
    const uid = (session && session.user && session.user.id) || null;
    const esDeEstaCuenta = !userProfile || !userProfile.id || !uid || userProfile.id === uid;
    const marca = userProfile && userProfile.cuenta_de_prueba;
    const claveDeMarca = marca ? String(marca.desde || 'sin-fecha') : null;
    const visible = !!marca && marca.aviso_visto !== true && respondida !== claveDeMarca && esDeEstaCuenta;

    // Estable: si cambiara de identidad, el hook reharía su efecto y el foco saltaría fuera de la hoja y volvería.
    const noCerrar = useCallback(() => {}, []);
    const { containerRef } = useModalAccessibility({ isOpen: visible, onClose: noCerrar, disableClose: true });

    const contestar = async (cual) => {
        if (ocupada.current) return;
        ocupada.current = true;
        const deEstaMarca = claveDeMarca;   // la marca que se contesta, aunque el perfil cambie mientras viaja la petición
        setEnCurso(cual);
        setError(null);
        const bien = cual === 'visto' ? await anotarAvisoVisto() : (await salirDelModoDePrueba()).ok;
        ocupada.current = false;
        setEnCurso(null);
        if (!bien) {
            setError(cual === 'visto' ? tx.errorGuardar : tx.errorSalir);
            return;
        }
        if (cual === 'salir') toast.success(tx.salio);
        setRespondida(deEstaMarca);
        refrescarPerfil(refreshProfileAndPlan);
    };

    if (!visible) return null;

    const hoja = (
        <div className={`${styles.capa} ph-no-capture`}>
            <div className={styles.fondo} aria-hidden="true" />
            <section
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                aria-describedby={idTexto}
                tabIndex={-1}
                className={styles.hoja}
                data-testid="aviso-cuenta-de-prueba"
            >
                <header className={styles.cabecera}>
                    <span className={styles.icono} aria-hidden="true"><FlaskConical size={20} strokeWidth={2.2} /></span>
                    <h2 id={idTitulo} className={styles.titulo}>{tx.titulo}</h2>
                </header>

                <div className={styles.cuerpo}>
                    <p id={idTexto} className={styles.texto}>{tx.explicacion}</p>
                </div>

                <footer className={styles.acciones}>
                    {error && <p role="alert" className={styles.error}>{error}</p>}
                    {/* `aria-disabled` y NO `disabled` mientras viaja la petición: un botón `disabled` suelta el foco al <body> y la
                        trampa de foco del hook (que solo vigila el primero y el último) deja de retenerlo. El cerrojo de `contestar`
                        ignora el segundo clic. */}
                    <div className={styles.botones}>
                        <button
                            type="button"
                            className={styles.salir}
                            onClick={() => contestar('salir')}
                            aria-disabled={enCurso ? 'true' : undefined}
                            data-hover="fantasma"
                        >
                            {enCurso === 'salir' ? tx.saliendo : tx.salir}
                        </button>
                        <button
                            type="button"
                            className={styles.entendido}
                            onClick={() => contestar('visto')}
                            aria-disabled={enCurso ? 'true' : undefined}
                            data-hover="boton"
                        >
                            {enCurso === 'visto' ? tx.guardando : tx.entendido}
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(hoja, document.body) : hoja;
}
