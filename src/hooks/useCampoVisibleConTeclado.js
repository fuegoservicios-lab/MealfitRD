// [P1-PLAN-LOTE-166 · 2026-09-22] Red de seguridad: el campo que se está escribiendo no puede quedar bajo el teclado.
//
// El navegador ya acerca el campo enfocado (en el iPhone mueve el `visualViewport`; en Android el WebView encoge y
// Chrome recoloca), y casi siempre basta. Cuando no —un campo al final de la pantalla, el documento que encoge dos veces,
// una animación que termina tarde— el usuario escribe a ciegas: «el teclado tapa la pantalla». Esto actúa DESPUÉS de que
// el teclado terminó de abrirse y SOLO si el campo sigue fuera de lo visible: si el navegador ya lo hizo, no mueve nada
// (no hay doble salto). Un intento por foco.
//
// Solo pantallas táctiles y campos de texto. No se monta en el chat: ahí el foco no mueve la conversación
// (P1-CHAT-FOCO-NO-MUEVE) y el compositor lleva su propia cuenta del teclado.
import { useEffect } from 'react';

const CAMPOS = 'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"])'
    + ':not([type="button"]):not([type="submit"]):not([type="file"]):not([type="color"])';
const MARGEN_PX = 16;
const ESPERA_TECLADO_MS = 350;

/**
 * ¿El campo está fuera de lo que se ve? Pura. `vv` es el `visualViewport` (sus coordenadas son las de
 * `getBoundingClientRect`): sin él no se sabe nada y no se toca nada.
 */
export function campoTapadoPorTeclado(el, vv, margen = MARGEN_PX) {
    if (!el || !vv || typeof el.getBoundingClientRect !== 'function') return false;
    const alto = Number(vv.height);
    if (!Number.isFinite(alto) || alto <= 0) return false;
    const arriba = Number(vv.offsetTop) || 0;
    const { top, bottom } = el.getBoundingClientRect();
    return bottom > arriba + alto - margen || top < arriba;
}

export function useCampoVisibleConTeclado() {
    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
        if (!window.matchMedia?.('(pointer: coarse)')?.matches) return undefined;
        let espera = null;
        const alEnfocar = (e) => {
            const el = e.target;
            if (!el || typeof el.matches !== 'function' || !el.matches(CAMPOS)) return;
            clearTimeout(espera);
            espera = setTimeout(() => {
                if (document.activeElement !== el) return;
                if (!campoTapadoPorTeclado(el, window.visualViewport)) return;
                try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* navegador viejo */ }
            }, ESPERA_TECLADO_MS);
        };
        document.addEventListener('focusin', alEnfocar);
        return () => {
            clearTimeout(espera);
            document.removeEventListener('focusin', alEnfocar);
        };
    }, []);
}
