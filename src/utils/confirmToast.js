/**
 * confirmToast — confirmación Promise-based para reemplazar `window.confirm(...)`.
 *
 * Por qué existe:
 *   `window.confirm(...)` rompe el tema dark (modal nativo del browser),
 *   bloquea el thread principal (síncrono), no es a11y-friendly (sin
 *   aria-live, sin focus management consistente) y es imposible de testear
 *   mecánicamente. Este helper da el mismo cierre con una sola llamada.
 *
 * [P2-CONFIRM-DIALOG-PLACEMENT · 2026-09-04] Antes se dibujaba como un toast
 * accionable de `sonner` arriba de la pantalla: el dueño lo vio como «una
 * notificación que se visualiza poquito» al borrar una comida del diario, y
 * en móvil competía con la barra de estado. Ahora se dibuja en un DIÁLOGO real
 * (`ConfirmDialogHost`, montado una vez en App.jsx sobre el `Modal` común):
 * centrado en escritorio, hoja inferior en móvil, con foco atrapado, Escape y
 * clic fuera = cancelar. La API no cambia: mismo nombre, mismos `opts`, misma
 * Promise<boolean>; los tres call sites (diario, pausar planes, olvidar un
 * hecho) siguen igual. Si el host no está montado (tests unitarios, páginas
 * sin App) o el caller inyecta `toastFn`, cae al toast accionable de antes.
 *
 * API:
 *   confirmToast(message, opts?) → Promise<boolean>
 *     Resuelve `true` si el usuario confirma.
 *     Resuelve `false` si cancela, cierra, pulsa Escape o clica fuera.
 *
 *   opts.confirmLabel: string — label del botón positivo (default 'Confirmar').
 *   opts.cancelLabel: string — label del botón negativo (default 'Cancelar').
 *   opts.description: string — explicación bajo la pregunta (opcional).
 *   opts.danger: boolean — la acción destruye algo: botón rojo (`.ui-btn-danger`).
 *   opts.duration: number — SOLO para el toast de respaldo (ms hasta auto-cierre).
 *   opts.toastFn: function — inyectable para tests; fuerza el respaldo de sonner.
 *
 * Diseño:
 *   - Idempotencia: la promesa resuelve UNA sola vez.
 *   - Una confirmación a la vez: si llega otra mientras una está abierta, la
 *     anterior se resuelve `false` (no se apilan diálogos).
 *
 * Tooltip-anchor: P2-NEW-WINDOW-CONFIRM-SETTINGS-CONFIRMTOAST
 */
import { toast as _defaultToast } from 'sonner';
// [P1-I18N-DASHBOARD · 2026-08-15] `t` de módulo (esto no es un componente). Los
// defaults viven en una desestructuración DENTRO de la función, así que se
// evalúan en cada llamada — con el catálogo ya cargado, nunca al importar.
import { t } from '../i18n';

// ---- host del diálogo (un solo suscriptor: <ConfirmDialogHost/> en App.jsx)
let _hostListener = null;
let _seq = 0;

/** Registra el host que dibuja las confirmaciones. Devuelve el unsubscribe. */
export function subscribeConfirmHost(listener) {
    _hostListener = typeof listener === 'function' ? listener : null;
    return () => { if (_hostListener === listener) _hostListener = null; };
}

/** ¿Hay un host montado? (para tests y para el respaldo). */
export function hasConfirmHost() {
    return typeof _hostListener === 'function';
}

export function confirmToast(message, opts = {}) {
    const {
        confirmLabel = t('Confirmar'),
        cancelLabel = t('Cancelar'),
        duration = 10000,
        description,
        danger = false,
        toastFn,
    } = opts;

    // Camino principal: diálogo real. Solo cae al toast si nadie lo dibuja.
    if (!toastFn && hasConfirmHost()) {
        return new Promise((resolve) => {
            let resolved = false;
            const finish = (value) => {
                if (resolved) return;
                resolved = true;
                resolve(!!value);
            };
            _hostListener({
                id: ++_seq,
                message: String(message ?? ''),
                description: description ? String(description) : '',
                confirmLabel,
                cancelLabel,
                danger: !!danger,
                finish,
            });
        });
    }

    // Respaldo: toast accionable de sonner (sin host montado o `toastFn` inyectado).
    const _toast = toastFn || _defaultToast;
    return new Promise((resolve) => {
        let resolved = false;
        let tid = null;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            try { if (tid !== null && _toast.dismiss) _toast.dismiss(tid); } catch (_e) { /* noop */ }
            resolve(value);
        };
        tid = _toast(message, {
            duration,
            description,
            className: 'bb-confirm-toast',
            action: { label: confirmLabel, onClick: () => finish(true) },
            cancel: { label: cancelLabel, onClick: () => finish(false) },
            onDismiss: () => finish(false),
            onAutoClose: () => finish(false),
        });
    });
}
