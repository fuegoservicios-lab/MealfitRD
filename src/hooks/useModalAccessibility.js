/**
 * [P2-CUSTOM-MODALS-A11Y · 2026-05-24] Hook SSOT con las defenses a11y
 * mínimas requeridas para todo modal custom que NO use
 * `components/common/Modal.jsx` (que ya las trae built-in).
 *
 * Surfaces históricos sin estas defenses (pre-fix):
 *   1. PaymentModal.jsx — CRÍTICO: surface de pago PayPal sin focus trap,
 *      Tab puede escapar al fondo durante flujo de checkout. Layout
 *      split-screen full-bleed no encaja en Modal.jsx (maxWidth 460px).
 *   2. LogoutConfirmModal.jsx — confirm modal de logout sin role dialog
 *      ni ESC handler. Keyboard users no pueden cerrar con ESC.
 *   3. Dashboard.jsx restock modal inline — similar al #2, sin role/aria
 *      ni focus trap. Layout custom embedded en página → refactor wholesale
 *      a Modal.jsx invasivo.
 *
 * Defenses provistas por este hook:
 *   - `role="dialog"` + `aria-modal="true"` + `aria-labelledby={titleId}`
 *     (el caller las añade al root del modal — el hook NO modifica el DOM).
 *   - ESC handler que invoca onClose (skippable via `disableClose`).
 *   - Focus trap: Tab/Shift+Tab cycla entre los elementos focusables del
 *     modal — no escape al fondo.
 *   - Restore focus al trigger al cerrar (preserva el flujo keyboard).
 *   - body overflow hidden mientras está abierto (previene scroll del fondo).
 *   - Focus inicial al primer focusable del modal al abrir (anuncia para
 *     screen readers).
 *
 * API:
 *   const { containerRef } = useModalAccessibility({
 *     isOpen,
 *     onClose,
 *     disableClose = false,  // si true, ignora ESC + click backdrop (loading state)
 *   });
 *
 * El caller añade:
 *   - `ref={containerRef}` al root del modal.
 *   - `role="dialog" aria-modal="true" aria-labelledby={titleId}` al root.
 *   - `id={titleId}` al heading principal del modal.
 *   - `tabIndex={-1}` al root para que pueda recibir focus programático.
 *
 * Diseño:
 *   - Cero deps externas (sólo React).
 *   - SSR-safe: chequea `typeof document` antes de leer/escribir.
 *   - Idempotente en cleanup: no rompe si componente unmonta mientras
 *     modal está abierto (cleanup remueve listener + restaura overflow).
 *
 * Tooltip-anchor: P2-CUSTOM-MODALS-A11Y
 * Test parser-based: backend/tests/test_p2_prod_final_3.py
 */
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalAccessibility({ isOpen, onClose, disableClose = false }) {
    const containerRef = useRef(null);
    const triggerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        if (typeof document === 'undefined') return undefined;

        // Guardar el elemento activo al abrir para restaurar focus al cerrar.
        triggerRef.current = document.activeElement;

        // Lock scroll del fondo mientras el modal está abierto.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus inicial al root del modal (screen readers anuncian).
        // Pequeño timeout para que el ref esté populado tras render.
        const focusTimeout = setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.focus();
            }
        }, 10);

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !disableClose) {
                onClose();
                return;
            }
            if (e.key === 'Tab') {
                // Focus trap: Tab/Shift+Tab cycla solo entre los focusables del modal.
                if (!containerRef.current) return;
                const focusables = containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first || document.activeElement === containerRef.current) {
                        last.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === last) {
                        first.focus();
                        e.preventDefault();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(focusTimeout);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = prevOverflow;
            // Restore focus al trigger original (preserva keyboard flow).
            if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
                try {
                    triggerRef.current.focus();
                } catch (_e) {
                    // Element puede haber sido removido del DOM — ignorar.
                }
            }
        };
    }, [isOpen, onClose, disableClose]);

    return { containerRef };
}

export default useModalAccessibility;
