// [P1-PLAN-LOTE-837 · 2026-09-29] Sin pantalla: informa al servidor los ajustes del DISPOSITIVO (tema, permiso de
// notificaciones, alertas, barra plegada…; spec 2026-09-29, §13.3) para que la ficha de la cuenta en el panel los enseñe.
// Patrón `AvisoRegalos`: un componente que no pinta nada, montado en DashboardLayout solo con cuenta.
//
// Toda la lógica —qué se lee, qué se manda, cuándo toca, cómo se falla— vive en `utils/ajustesDelDispositivo.js`. Aquí
// solo se decide CUÁNDO mirar: tras el primer idle, cuando cambia el tema (evento propio de `applyThemePref`) o algo
// vigilado en otra pestaña (`storage`), al volver a la app y con una revisión lenta —cambiar las alertas en ESTA
// pestaña no emite ningún evento—. Cada mirada es barata: si no hay nada que decir, no sale ninguna petición. Nunca
// bloquea ni lanza, y desmontarse cancela todo lo pendiente.
import { useEffect } from 'react';
import { useAssessment } from '../../context/AssessmentContext';
import {
    CLAVES_VIGILADAS,
    ESPERA_CAMBIO_MS,
    REVISION_MS,
    alPrimerIdle,
    informarAjustesDelDispositivo,
} from '../../utils/ajustesDelDispositivo';

export default function ReporteAjustesDispositivo() {
    const { session, userProfile } = useAssessment() || {};
    const uid = (session && session.user && session.user.id) || (userProfile && userProfile.id) || null;

    useEffect(() => {
        if (!uid) return undefined;
        let vivo = true;
        let espera = null;
        const revisar = () => {
            if (vivo) informarAjustesDelDispositivo({ uid }).catch(() => {});
        };
        // Un cambio (tema, alertas en otra pestaña, volver a la app): con un respiro, para juntar una ráfaga en una petición.
        const enUnRato = () => {
            if (espera) clearTimeout(espera);
            espera = setTimeout(revisar, ESPERA_CAMBIO_MS);
        };
        const alAlmacenar = (e) => {
            if (!e || !e.key || CLAVES_VIGILADAS.includes(e.key)) enUnRato();
        };
        const alVolver = () => {
            if (document.visibilityState === 'visible') enUnRato();
        };

        const cancelarIdle = alPrimerIdle(revisar);
        const vigia = setInterval(revisar, REVISION_MS);
        window.addEventListener('mealfit-theme-change', enUnRato);
        window.addEventListener('storage', alAlmacenar);
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            vivo = false;
            cancelarIdle();
            clearInterval(vigia);
            if (espera) clearTimeout(espera);
            window.removeEventListener('mealfit-theme-change', enUnRato);
            window.removeEventListener('storage', alAlmacenar);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [uid]);

    return null;
}
