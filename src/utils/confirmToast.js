/**
 * [P2-NEW-WINDOW-CONFIRM-SETTINGS · 2026-05-15] Helper Promise-based para
 * reemplazar `window.confirm(...)` con un toast accionable de `sonner`.
 *
 * Por qué existe:
 *   `window.confirm(...)` rompe el tema dark (modal nativo del browser),
 *   bloquea el thread principal (síncrono), no es a11y-friendly (sin
 *   aria-live, sin focus management consistente) y es imposible de testear
 *   mecánicamente. Plan.jsx ya migró su confirm a un modal propio (patrón
 *   `P6-CANCEL-MODAL`); este helper provee el mismo cierre con menos
 *   ceremonia para sitios donde un modal full-screen es excesivo (mini
 *   confirmaciones inline tipo "¿consumir 1 regeneración?").
 *
 * API:
 *   confirmToast(message, opts?) → Promise<boolean>
 *     Resuelve `true` si el usuario clickea el botón de confirmar.
 *     Resuelve `false` si clickea cancelar, dismiss manual, o auto-close.
 *
 *   opts.confirmLabel: string — label del botón positivo (default 'Confirmar').
 *   opts.cancelLabel: string — label del botón negativo (default 'Cancelar').
 *   opts.duration: number — ms hasta auto-close = false (default 10000).
 *   opts.toastFn: function — inyectable para tests; default usa sonner real.
 *
 * Diseño:
 *   - Idempotencia: la promesa resuelve UNA sola vez, ignorando dismisses
 *     posteriores (caller ve el primer evento real). Sin esto, un user
 *     que clickea confirm + dismiss rápido genera dos resoluciones.
 *   - Best-effort cleanup: `toast.dismiss(id)` envuelto en try/catch para
 *     no fallar si el toast ya se cerró.
 *   - Sonner-canonical: usa `action` + `cancel` props (soportadas
 *     nativamente desde sonner 1.4+). Sin lógica de teclado custom — sonner
 *     gestiona Escape y Tab focus.
 *
 * Tooltip-anchor: P2-NEW-WINDOW-CONFIRM-SETTINGS-CONFIRMTOAST
 */

import { toast as _defaultToast } from 'sonner';

export function confirmToast(message, opts = {}) {
    const {
        confirmLabel = 'Confirmar',
        cancelLabel = 'Cancelar',
        duration = 10000,
        toastFn,
    } = opts;
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
            action: { label: confirmLabel, onClick: () => finish(true) },
            cancel: { label: cancelLabel, onClick: () => finish(false) },
            onDismiss: () => finish(false),
            onAutoClose: () => finish(false),
        });
    });
}
