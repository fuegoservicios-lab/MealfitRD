// [P2-CONFIRM-DIALOG-PLACEMENT · 2026-09-04] Host único de las confirmaciones de
// `confirmToast`. Se monta UNA vez en App.jsx (junto al <Toaster/>) y dibuja la
// petición vigente sobre el `Modal` común: centrado en escritorio, hoja inferior en
// móvil (arrastre para cerrar), foco atrapado, Escape y clic fuera = cancelar.
// El mismo lenguaje que «¿Eliminar esta conversación?» (P2-CHAT-DELETE-CONFIRM):
// icono en círculo, pregunta en negrita, explicación en gris, dos botones a lo
// ancho — Cancelar fantasma, confirmar sólido (rojo si `danger`).
import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import { subscribeConfirmHost } from '../../utils/confirmToast';

// [P2-CI-ARRANQUE-CONFIRM · 2026-09-16] El host se monta en App.jsx y tiene que escuchar desde el
// arranque; el diálogo no. Importado aquí de forma estática, `Modal` metía framer-motion en la carga
// inicial de todas las rutas: 187,4 kB gz contra un techo de 148, y la CI roja en `check:presupuestos`
// desde el 04-sep (tapada hasta el 15 por un error de ESLint). Así queda en 147,2. Se pide con la
// primera confirmación y se queda montado, para que el cierre conserve su animación.
const ConfirmDialog = lazy(() => import('./ConfirmDialog'));

const ConfirmDialogHost = () => {
    const [req, setReq] = useState(null);
    const [dialogoPedido, setDialogoPedido] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeConfirmHost((next) => {
            setDialogoPedido(true);
            // una a la vez: la anterior, si quedaba abierta, se resuelve como cancelada
            setReq((prev) => {
                if (prev && prev.id !== next.id) {
                    try { prev.finish(false); } catch (_e) { /* noop */ }
                }
                return next;
            });
        });
        return unsubscribe;
    }, []);

    const close = useCallback((value) => {
        setReq((prev) => {
            if (prev) {
                try { prev.finish(value); } catch (_e) { /* noop */ }
            }
            return null;
        });
    }, []);

    const onCancel = useCallback(() => close(false), [close]);
    const onConfirm = useCallback(() => close(true), [close]);

    if (!dialogoPedido) return null;
    return (
        <Suspense fallback={null}>
            <ConfirmDialog req={req} onCancel={onCancel} onConfirm={onConfirm} />
        </Suspense>
    );
};

export default ConfirmDialogHost;
