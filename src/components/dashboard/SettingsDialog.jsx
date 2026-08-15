import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import useModalAccessibility from '../../hooks/useModalAccessibility';
import Settings from '../../pages/Settings';
import { useT } from '../../i18n';
import styles from './SettingsDialog.module.css';

/* ============================================================================
   [P1-SETTINGS-DIALOG · 2026-08-10] La configuración deja de ser un destino.

   Antes, «Configuración» navegaba fuera del dashboard: perdías el scroll, la
   vista y volvías a montar todo al regresar. La configuración es un DESVÍO
   —vas, cambias algo, vuelves—, y por eso Claude, OpenAI, Linear y Notion la
   sirven como diálogo sobre la aplicación. El contenido no cambia: `Settings`
   ya se pinta como lista-de-secciones + panel, que es exactamente esta forma.

   LA URL SIGUE SIENDO `/dashboard/settings`. Esto no es un detalle: el propio
   Settings enlaza a `#subscription` desde dos sitios, lee el hash al montar
   para abrir la sección correcta, y el botón «atrás» del teléfono tiene que
   cerrar la ventana en vez de sacarte del dashboard. Un diálogo de puro estado
   de cliente habría roto las tres cosas.

   Se monta con la receta de rutas-modales de React Router: quien abre pasa
   `state.backgroundLocation`, y `App` pinta las rutas de ESA ubicación debajo
   más este diálogo encima. Entrar por enlace directo (sin ese state) NO trae
   ubicación de fondo, así que cae a la página completa de siempre — la
   degradación es automática y no hay que mantener dos diseños.

   PORTAL A `document.body`. El layout del dashboard tiene contenedores con
   `transform` (las animaciones de página), y un `position: fixed` dentro de un
   ancestro transformado se ancla al ancestro, no al viewport: el diálogo
   quedaría recortado dentro de la columna de contenido.

   ── Lo delicado no es el marco, es la SALIDA ─────────────────────────────
   Settings protege borradores de peso/altura con un modal de descarte. Como
   página tenía UNA sola forma de salir (el botón «Volver»), así que el guard
   vivía en su `onClick`. Un diálogo añade TRES: la X, el clic en el fondo y la
   tecla ESC. Cada una es un camino nuevo por el que esos números se podrían
   tirar en silencio.

   Por eso este componente NO cierra nada por su cuenta: pide permiso. Settings
   publica su puerta de salida en `exitGateRef` y las tres vías la invocan. Si
   hay borradores, la puerta abre el modal de descarte y el diálogo se queda
   donde está.
   ========================================================================= */

const SettingsDialog = () => {
    const t = useT();
    const navigate = useNavigate();

    // Puerta de salida de Settings. La publica él en un efecto; hasta que lo
    // haga, cerrar equivale a navegar hacia atrás (no hay borradores posibles
    // antes de que el formulario exista).
    const exitGateRef = useRef(null);
    const containerElRef = useRef(null);

    /* Cerrar = volver a la ubicación de fondo. `navigate(-1)` y no un destino
       fijo: la entrada del historial que abrió el diálogo es justo la anterior,
       así que deshacerla devuelve al usuario a la página EXACTA desde la que
       pulsó (Dashboard, Nevera, Recetas…), con su scroll. Un `navigate('/dashboard')`
       fijo mandaría al Dashboard a quien abrió ajustes desde Recetas. */
    const closeDialog = useCallback(() => {
        navigate(-1);
    }, [navigate]);

    /* Las tres vías del diálogo pasan por la puerta de Settings, nunca por
       `closeDialog` directo. */
    const requestClose = useCallback(() => {
        if (exitGateRef.current) {
            exitGateRef.current();
            return;
        }
        closeDialog();
    }, [closeDialog]);

    /* ¿Somos la capa de encima? Se pregunta al DOM en el momento de la tecla:
       si Settings tiene abierto su modal de descarte (o el de cancelar
       suscripción), ese `[role="dialog"]` vive DENTRO de este contenedor y
       entonces ESC le pertenece a él. Sin esto, una sola tecla cerraba la
       confirmación Y la ventana — que es perder el aviso y los datos a la vez. */
    const isTopmost = useCallback(() => {
        const root = containerElRef.current;
        if (!root) return true;
        return !root.querySelector('[role="dialog"][aria-modal="true"]');
    }, []);

    const { containerRef } = useModalAccessibility({
        isOpen: true,
        onClose: requestClose,
        isTopmost,
    });

    const setContainer = useCallback((node) => {
        containerRef.current = node;
        containerElRef.current = node;
    }, [containerRef]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className={styles.overlay}>
            {/* El fondo cierra al pulsarlo, pero es INVISIBLE para la
                accesibilidad a propósito. Un primer intento lo hizo `<button>`
                con nombre propio y creó dos controles llamados igual dentro del
                mismo diálogo —este y el «Cerrar» de la cabecera—: un lector de
                pantalla anunciaba la misma acción dos veces y no podía
                distinguirlas.

                Un `onClick` sin equivalente de teclado normalmente es un
                defecto; aquí no, porque su función está cubierta DOS veces por
                controles que sí lo tienen: la tecla ESC y el botón visible. Es
                un atajo de ratón redundante, y lo correcto para un atajo
                redundante es no anunciarlo. */}
            <div
                className={styles.backdrop}
                onClick={requestClose}
                aria-hidden="true"
            />
            <div
                ref={setContainer}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label={t('Configuración')}
                tabIndex={-1}
            >
                <Settings
                    variant="dialog"
                    onRequestClose={closeDialog}
                    exitGateRef={exitGateRef}
                />
            </div>
        </div>,
        document.body
    );
};

export default SettingsDialog;
