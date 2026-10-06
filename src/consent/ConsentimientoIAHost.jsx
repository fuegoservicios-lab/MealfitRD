// [P1-PLAN-LOTE-844 · 2026-09-29] Host único de la hoja «Tus datos y la IA». Se monta UNA vez en App.jsx (web y app
// nativa, con sesión o de invitado; fuera del apex), perezoso como `HojaGuardarPlanHost`: el arranque tiene techo
// (`scripts/presupuestos.mjs`) y ni la hoja ni el estado del permiso hacen falta antes de pintar. Si alguien pide la
// hoja antes de que este trozo llegue, `consentimientoIA.js` guarda la petición y el host la recibe al suscribirse.
//
// Tres trabajos:
//   1. Decirle al estado del permiso QUIÉN usa la app (cuenta o invitado) y darle `profile.ai_consent`, que ya viene
//      en GET /api/profile (cero llamadas nuevas al arrancar).
//   2. Dibujar la hoja cuando alguien la pide (`asegurarConsentimientoIA`, un 428, «Activar la IA»).
//   3. Cuentas que ya existían: la hoja sale UNA vez al abrir la app —antes de la primera acción con IA—. Con «Ahora
//      no» no vuelve a salir sola; la siguiente acción con IA vuelve a preguntar.
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
import { useT } from '../i18n';
import { safeLocalStorageSet } from '../utils/safeLocalStorage';
import {
    aceptarConsentimientoIA,
    debePreguntarAlAbrirLaApp,
    fijarTitularConsentimientoIA,
    pedirHojaConsentimientoIA,
    refrescarConsentimientoIA,
    rechazarConsentimientoIA,
    sincronizarConsentimientoIADesdePerfil,
    suscribirHojaConsentimientoIA,
} from './consentimientoIA';
import ConsentimientoIASheet from './ConsentimientoIASheet';

/** Dónde puede salir sola: dentro de la app, no en el login ni en las legales. */
const RUTAS_DE_LA_APP = ['/dashboard', '/assessment', '/plan', '/history'];
/** Un respiro tras llegar el perfil: que la pantalla termine de pintarse antes de taparla. */
const RETRASO_AL_ABRIR_MS = 1200;
/** Una vez por cuenta y por carga de la app. */
const _preguntadoAlAbrir = new Set();

export default function ConsentimientoIAHost() {
    const t = useT();
    const { session, isGuest, userProfile, refreshProfileAndPlan, updateData } = useAssessment();
    const { pathname } = useLocation();
    const [peticion, setPeticion] = useState(null);

    const uid = (session && session.user && session.user.id) || null;
    const invitado = !uid && !!isGuest;
    const aiConsent = uid && userProfile && (!userProfile.id || userProfile.id === uid) ? userProfile.ai_consent : undefined;
    const enLaApp = RUTAS_DE_LA_APP.some((r) => pathname === r || pathname.startsWith(`${r}/`));

    useEffect(() => {
        fijarTitularConsentimientoIA({ uid, invitado });
    }, [uid, invitado]);

    useEffect(() => {
        if (uid && aiConsent) sincronizarConsentimientoIADesdePerfil(uid, aiConsent);
    }, [uid, aiConsent]);

    useEffect(() => suscribirHojaConsentimientoIA(setPeticion), []);

    useEffect(() => {
        if (!uid || !aiConsent || !enLaApp || _preguntadoAlAbrir.has(uid)) return undefined;
        let cancelado = false;
        const temporizador = setTimeout(async () => {
            // Se decide con lo que se sabe AL DISPARAR, no con el perfil de cuando se programó: en ese segundo pudo
            // llegar la adopción del plan del invitado con su permiso.
            if (_preguntadoAlAbrir.has(uid) || !debePreguntarAlAbrirLaApp()) return;
            const actualizado = await refrescarConsentimientoIA();
            // Un perfil en caché o un fallo de lectura no significa que haya que pedir permiso otra vez.
            if (cancelado || !actualizado || !debePreguntarAlAbrirLaApp() || _preguntadoAlAbrir.has(uid)) return;
            _preguntadoAlAbrir.add(uid);
            void pedirHojaConsentimientoIA({ automatica: true });
        }, RETRASO_AL_ABRIR_MS);
        return () => { cancelado = true; clearTimeout(temporizador); };
    }, [uid, aiConsent, enLaApp]);

    const aceptar = useCallback(async (decision) => {
        const r = await aceptarConsentimientoIA(decision);
        // El próximo arranque debe recuperar un perfil con la decisión ya guardada, no el anterior al POST.
        if (r?.ok && !r.planReanudado && typeof refreshProfileAndPlan === 'function') {
            void Promise.resolve().then(() => refreshProfileAndPlan()).catch(() => {});
        }
        if (r && r.ok && r.planReanudado) {
            // Volver a conceder poco después de retirarlo reanuda el generador que la retirada pausó (backend 843):
            // la app vuelve al modo plan, como con el interruptor de Configuración.
            safeLocalStorageSet('mealfit_plan_mode', 'plan');
            try { if (typeof updateData === 'function') updateData('appMode', 'plan'); } catch { /* el formulario lo recoge luego */ }
            try { if (typeof refreshProfileAndPlan === 'function') await refreshProfileAndPlan(); } catch { /* el siguiente foco */ }
            toast.success(t('Reanudamos la generación de tu plan.'));
        }
        return r;
    }, [t, updateData, refreshProfileAndPlan]);

    if (!peticion) return null;
    return <ConsentimientoIASheet onAceptar={aceptar} onRechazar={rechazarConsentimientoIA} />;
}
