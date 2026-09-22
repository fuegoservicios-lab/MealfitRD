// [P1-PLAN-LOTE-165 · 2026-09-22] Una hoja anclada abajo (registrar comida, escáner) y el teclado del teléfono.
//
// En el iPhone el WKWebView NUNCA encoge el documento al abrirse el teclado (medido: `keyboardViewport.js`), así que
// una hoja `position: fixed` con el pie abajo queda con su botón principal DEBAJO del teclado: se escribe en el buscador
// y «Registrar» no se ve hasta cerrar el teclado. El chat ya lo compensaba; la Nevera tenía su propia copia de la cuenta
// (`Pantry.jsx`, P3-PANTRY-ADD-MOBILE). Esto es esa misma cuenta, compartida:
//   · `inset`: cuánto hay que levantar la hoja (lo que el teclado tapa y el documento NO encogió por su cuenta —
//     en Android, donde el WebView sí encoge, sale 0 y nada se levanta dos veces).
//   · `alto`: el alto visible, para que la hoja no pase de él.
// La cuenta vive en `medirTecladoDeVentana` (SSOT); aquí solo se escucha el `visualViewport` mientras la hoja está abierta.
import { useEffect, useState } from 'react';
import { medirTecladoDeVentana } from '../utils/keyboardViewport';

const CERRADO = { inset: 0, abierto: false, alto: null };

export function useTecladoDeHoja(activo) {
    const [estado, setEstado] = useState(CERRADO);
    useEffect(() => {
        if (!activo) { setEstado(CERRADO); return undefined; }
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return undefined;
        const medir = () => {
            const { layoutInset, abierto } = medirTecladoDeVentana(window);
            setEstado((prev) => {
                const inset = abierto ? Math.max(0, Math.round(layoutInset)) : 0;
                const alto = abierto ? Math.round(vv.height) : null;
                return prev.inset === inset && prev.abierto === abierto && prev.alto === alto ? prev : { inset, abierto, alto };
            });
        };
        medir();
        vv.addEventListener('resize', medir);
        vv.addEventListener('scroll', medir);
        return () => {
            vv.removeEventListener('resize', medir);
            vv.removeEventListener('scroll', medir);
        };
    }, [activo]);
    return estado;
}

/** Los estilos que la hoja aplica: el fondo levanta su contenido y el panel no pasa del alto visible. */
export function estilosDeHojaConTeclado({ inset, abierto, alto }, margen = 12) {
    if (!abierto) return { fondo: undefined, panel: undefined };
    return {
        fondo: inset > 0 ? { paddingBottom: inset } : undefined,
        panel: alto ? { maxHeight: Math.max(240, alto - margen) } : undefined,
    };
}
