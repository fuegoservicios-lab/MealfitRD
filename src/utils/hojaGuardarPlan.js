// [P1-PLAN-LOTE-680] «Guarda tu plan»: la hoja de login que se le abre al INVITADO
// cuando toca algo que pide cuenta (cambiar un plato, la receta, favoritos, registrar lo
// que come, el coach, otro plan, una pestaña con candado).
//
// Antes cada uno de esos sitios hacía `toast(...)` y, algunos, `navigate('/register')`,
// que rebota a `/login`: el invitado salía de su plan —a una pantalla oscura distinta de
// la app— justo en el instante en que el plan le importaba. Ahora el login viene a él.
//
// Bus mínimo, como `confirmToast`: el host (`HojaGuardarPlanHost`, montado una vez en
// App.jsx) se suscribe; quien pide la cuenta llama a `pedirCuentaInvitado(motivo)`.
// Devuelve `false` si no hay host escuchando (el apex, un test sin App): entonces el
// llamador conserva su camino de antes, que es lo que ya funcionaba.

/** Motivos: qué intentaba hacer el invitado. La frase de cada uno la escribe la hoja
 *  (`HojaGuardarPlan.jsx`) con `t('…')` literal —para que el verificador de i18n la
 *  vea— y son las MISMAS cadenas que decían los toasts, ya traducidas en los 5 idiomas:
 *  el invitado lee lo mismo que leía, pero con el formulario delante en vez de un aviso
 *  que se va solo. */
export const MOTIVOS_CUENTA_INVITADO = ['guardar', 'receta', 'cambiar', 'favoritos', 'registrar', 'coach', 'otroPlan', 'desbloquear'];

let _suscriptor = null;

/** Lo llama el host al montarse. Devuelve la baja. */
export function subscribeHojaGuardarPlan(fn) {
    _suscriptor = fn;
    return () => {
        if (_suscriptor === fn) _suscriptor = null;
    };
}

/** Abre la hoja. `true` si alguien la dibuja; `false` si el llamador debe usar su
 *  camino de siempre (toast / `/login`). */
export function pedirCuentaInvitado(motivo = 'guardar') {
    if (!_suscriptor) return false;
    try {
        _suscriptor(MOTIVOS_CUENTA_INVITADO.includes(motivo) ? motivo : 'guardar');
        return true;
    } catch {
        return false;
    }
}
