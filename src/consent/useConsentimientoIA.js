// [P1-PLAN-LOTE-844 · 2026-09-29] Lo que se sabe del permiso para la IA, como estado de React: `vigente` true / false
// / null (aún no se sabe), `aceptadoEn`, `version`, `revocadoEn`, `analytics` y `tipo` ('cuenta' | 'invitado').
import { useSyncExternalStore } from 'react';
import { estadoConsentimientoIA, suscribirConsentimientoIA } from './consentimientoIA';

export function useConsentimientoIA() {
    return useSyncExternalStore(suscribirConsentimientoIA, estadoConsentimientoIA, estadoConsentimientoIA);
}

export default useConsentimientoIA;
