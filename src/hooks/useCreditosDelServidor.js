// frontend/src/hooks/useCreditosDelServidor.js
// [P1-PLAN-LOTE-776 · revisión final · 2026-09-28] Lo que `GET /api/user/credits/{uid}` dice de la cuenta: los créditos
// usados este mes, el tope REAL (plan efectivo + regalos) y los regalos recientes que hay que anunciar. Vivía dentro de
// AssessmentContext (archivo con techo de líneas congelado: test_p3_shopping_projection_pkg), se extrae con su consulta,
// su lectura y su reinicio; `checkPlanLimit` sigue siendo la API pública del contexto y decide solo DE QUIÉN.
//
// `reiniciar()` va en TODO sitio que cierra la cuenta o cambia de cuenta en la misma pestaña (logout, SIGNED_OUT,
// sesión expirada, otro usuario, salir del invitado): sin él, la cuenta B heredaba el tope de A y se le anunciaban los
// regalos de A (P1-XTAB-CACHE-LEAK).
import { useCallback, useState } from 'react';
import { fetchWithAuth } from '../config/api';

export function useCreditosDelServidor() {
    const [planCount, setPlanCount] = useState(0);
    const [creditosServidor, setCreditosServidor] = useState(null);
    const [regalosRecientes, setRegalosRecientes] = useState([]);

    const reiniciar = useCallback(() => {
        setPlanCount(0);
        setCreditosServidor(null);
        setRegalosRecientes([]);
    }, []);

    /** Consulta los créditos de `userId` y los guarda. Devuelve los usados; 0 si es invitado o si la consulta falla
     *  (entonces no toca lo que ya había, como antes). Sin `limit` (servidor viejo) el tope cae a `config/plans.js`. */
    const consultar = useCallback(async (userId) => {
        if (!userId || userId === 'guest') {
            reiniciar();
            return 0;
        }
        try {
            const response = await fetchWithAuth(`/api/user/credits/${userId}`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error consultando créditos: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            setPlanCount(data.credits || 0);
            setCreditosServidor(typeof data.limit === 'number'
                ? { limit: data.limit, bonus: Number(data.bonus) || 0, bonusHasta: data.bonus_hasta || null }
                : null);
            setRegalosRecientes(Array.isArray(data.regalos_recientes) ? data.regalos_recientes : []);
            return data.credits || 0;
        } catch (error) {
            console.error("Error verificando límites de API:", error);
            return 0;
        }
    }, [reiniciar]);

    return { planCount, creditosServidor, regalosRecientes, consultar, reiniciar };
}
