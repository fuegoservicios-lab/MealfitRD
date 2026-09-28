// [P1-PLAN-LOTE-680] `/probar` — la entrada directa del landing al modo invitado.
//
// Antes, el único «Probar sin cuenta» vivía DENTRO de /login: quien venía del landing a
// probar tenía que pasar primero por la pantalla de acceso y encontrar el botón fantasma
// debajo del formulario. Esta ruta hace lo mismo que ese botón (`handleGuest` de
// Login.jsx) y lleva directo al formulario. No es otra pantalla: no pinta nada salvo el
// cargador mientras decide.
//
// Tres casos, y sólo uno activa el modo invitado:
//   · con sesión → a la app como quien es (activar el invitado cerraría su sesión);
//   · ya invitado → se CONSERVA lo que lleva (formulario a medias o plan de muestra):
//     `activateGuestMode` borra todo y rota el session_id, y ante la duda el fallo debe
//     conservar los datos, nunca borrarlos (P1-GUEST-BACKGROUND-LIFE);
//   · visitante nuevo → modo invitado limpio y al formulario.
import { useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAssessment } from '../context/AssessmentContext';
import { logoutFirstPartySession } from '../utils/firstPartySession';

const ProbarSinCuenta = () => {
    const { session, isGuest, planData, loadingAuth, activateGuestMode } = useAssessment();
    const navigate = useNavigate();
    const arrancado = useRef(false);

    const esNuevo = !loadingAuth && !session && !isGuest;

    useEffect(() => {
        if (!esNuevo || arrancado.current) return;
        arrancado.current = true;
        (async () => {
            // Paridad con `handleGuest`: una cookie first-party vieja resucitaría una
            // sesión a mitad del formulario del invitado.
            try { await logoutFirstPartySession(); } catch { /* best-effort */ }
            activateGuestMode();
            navigate('/assessment', { replace: true });
        })();
    }, [esNuevo, activateGuestMode, navigate]);

    if (loadingAuth) return <div className="page-loader" />;
    if (session) return <Navigate to="/" replace />;
    if (isGuest) return <Navigate to={planData ? '/dashboard' : '/assessment'} replace />;
    return <div className="page-loader" />;
};

export default ProbarSinCuenta;
