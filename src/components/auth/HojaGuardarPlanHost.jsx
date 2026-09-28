// [P1-PLAN-LOTE-680] Host único de la hoja «Guarda tu plan» del invitado. Se monta UNA
// vez en App.jsx (fuera del apex) y escucha `pedirCuentaInvitado` (utils/hojaGuardarPlan).
//
// Mismo reparto que `ConfirmDialogHost`: el host escucha desde el arranque y pesa casi
// nada; la hoja (Modal + framer-motion + la pantalla de login) se pide con la primera
// apertura y se queda montada para que el cierre conserve su animación. Importarla aquí
// de forma estática metería el login en la carga inicial de todas las rutas y rompería
// `check:presupuestos` (lo que ya pasó con `ConfirmDialog`, P2-CI-ARRANQUE-CONFIRM).
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { subscribeHojaGuardarPlan } from '../../utils/hojaGuardarPlan';
import { loadPendingOtp } from '../../utils/otpPendiente';
import { isGuestModeActive } from '../../utils/guestMode';

const HojaGuardarPlan = lazy(() => import('./HojaGuardarPlan'));

// El código de 6 dígitos EXIGE salir de la app a leer el correo, y en iOS
// (`display: standalone`) el sistema mata el proceso al pasar a segundo plano. El login
// ya recuerda el paso del código (`mf_otp_pending`); si el invitado lo pidió desde la
// hoja, al volver no está en /login sino en su plan, y sin esto el paso del código
// quedaba guardado sin nadie que lo enseñara. En /login no: allí la propia pantalla lo
// retoma, y dos formularios a la vez serían dos envíos.
const hayCodigoDeLaHojaEnVuelo = () => typeof window !== 'undefined'
    && window.location.pathname !== '/login'
    && isGuestModeActive()
    && !!loadPendingOtp();

const HojaGuardarPlanHost = () => {
    // Se decide UNA vez, al montar (inicializador perezoso, no un efecto).
    const [reabrir] = useState(hayCodigoDeLaHojaEnVuelo);
    const [motivo, setMotivo] = useState('guardar');
    const [abierta, setAbierta] = useState(reabrir);
    const [hojaPedida, setHojaPedida] = useState(reabrir);

    useEffect(() => subscribeHojaGuardarPlan((m) => {
        setHojaPedida(true);
        setMotivo(m);
        setAbierta(true);
    }), []);

    const cerrar = useCallback(() => setAbierta(false), []);

    if (!hojaPedida) return null;
    return (
        <Suspense fallback={null}>
            <HojaGuardarPlan abierta={abierta} motivo={motivo} onClose={cerrar} />
        </Suspense>
    );
};

export default HojaGuardarPlanHost;
