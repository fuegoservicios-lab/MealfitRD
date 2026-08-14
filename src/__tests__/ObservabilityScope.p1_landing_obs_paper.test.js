/**
 * [P1-LANDING-OBS-PAPER · 2026-08-14] Qué observabilidad corre sobre el visitante
 * ANÓNIMO del landing.
 *
 * EL DEFECTO QUE CIERRA. La landing del apex cargaba la observabilidad completa
 * de la app sobre alguien que sólo está leyendo una página de marketing:
 *
 *   · Sentry: el `await import('@sentry/react')` de `_attachSentryIntegrations`
 *     trae el namespace ENTERO — browserTracing + replay + feedback +
 *     replay-canvas — y adjunta `replayIntegration()` incondicionalmente. Medido
 *     el 2026-08-14: 357.767 B / ~118 kB gzip en un chunk diferido. Ojo, porque
 *     es la trampa de este gap: bajar `VITE_SENTRY_REPLAYS_SESSION_RATE` a 0 NO
 *     ahorra un byte — el chunk se descarga igual, sólo deja de grabar. Los
 *     bytes se van únicamente si no se hace el import.
 *   · PostHog: `autocapture: true` sobre un visitante sin cuenta = captura de
 *     cada click y cada campo de una página pública.
 *
 * Y el amplificador que lo convertía en algo más que coste: `isAnalyticsOptedOut`
 * leía SÓLO `localStorage`, que es POR ORIGEN. El interruptor de privacidad vive
 * en Configuración (app.bioboros.com) y el landing vive en el apex, así que un
 * usuario que YA había desactivado la analítica seguía siendo rastreado cada vez
 * que visitaba la portada. No era una política incompleta: era una decisión que
 * el usuario ya había tomado y que el código no cumplía.
 *
 * LO QUE ESTE CONTRATO **NO** HACE. No apaga PostHog en el apex. El embudo que
 * POSTHOG-ANALYTICS declara (visita → registro → plan → pago) NACE en la portada:
 * matar los pageviews ahí lo dejaría sin su primer escalón. Se conservan
 * `capture_pageview` y `capture_pageleave`; lo que se retira es el autocapture.
 *
 * La política vive en un módulo PURO (`utils/observabilityScope.js`) en lugar de
 * en condicionales repartidos por `main.jsx` justamente para que exista este
 * test: una decisión de privacidad que sólo se puede verificar arrancando la app
 * entera es una decisión que nadie verifica.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    isMarketingVisit,
    shouldAttachSentryReplay,
    posthogCaptureOptions,
} from '../utils/observabilityScope';
import {
    isAnalyticsOptedOut,
    persistAnalyticsOptOut,
    ANALYTICS_OPT_OUT_KEY,
    ANALYTICS_OPT_OUT_COOKIE,
} from '../utils/analytics';

const APEX = 'bioboros.com';
const WWW = 'www.bioboros.com';
const APP = 'app.bioboros.com';

describe('[P1-LANDING-OBS-PAPER] alcance de la observabilidad por host', () => {
    it('reconoce el apex y el www como visita de marketing', () => {
        expect(isMarketingVisit(APEX)).toBe(true);
        expect(isMarketingVisit(WWW)).toBe(true);
    });

    it('NO trata el subdominio de la app como marketing', () => {
        expect(isMarketingVisit(APP)).toBe(false);
    });

    it('no adjunta el replay de Sentry en el landing (los 118 kB gzip del chunk diferido)', () => {
        expect(shouldAttachSentryReplay(APEX)).toBe(false);
        expect(shouldAttachSentryReplay(WWW)).toBe(false);
    });

    it('mantiene intacto el replay dentro de la app: ahí sí hay una sesión que depurar', () => {
        expect(shouldAttachSentryReplay(APP)).toBe(true);
    });

    it('apaga el autocapture de PostHog sobre el visitante anónimo del landing', () => {
        expect(posthogCaptureOptions(APEX).autocapture).toBe(false);
    });

    it('conserva el autocapture dentro de la app', () => {
        expect(posthogCaptureOptions(APP).autocapture).toBe(true);
    });

    it('PRESERVA el embudo: pageview y pageleave siguen vivos en el landing', () => {
        // Si esta aserción cae, el embudo visita→registro pierde su primer escalón
        // y POSTHOG-ANALYTICS deja de poder responder «¿cuántos llegan?».
        const opciones = posthogCaptureOptions(APEX);
        expect(opciones.capture_pageview).toBe(true);
        expect(opciones.capture_pageleave).toBe(true);
    });
});

describe('[P1-LANDING-OBS-PAPER] el opt-out cruza el límite de origen', () => {
    beforeEach(() => {
        window.localStorage.clear();
        // jsdom no expira cookies solo: las vaciamos a mano entre casos.
        for (const trozo of document.cookie.split(';')) {
            const nombre = trozo.split('=')[0].trim();
            if (nombre) document.cookie = `${nombre}=; Max-Age=0; path=/`;
        }
        vi.restoreAllMocks();
    });

    it('por defecto no hay opt-out', () => {
        expect(isAnalyticsOptedOut()).toBe(false);
    });

    it('honra el opt-out escrito en localStorage (el mecanismo histórico)', () => {
        window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, '1');
        expect(isAnalyticsOptedOut()).toBe(true);
    });

    it('honra el opt-out que llega SOLO por cookie — el caso del landing', () => {
        // Este es el bug: el usuario apagó la analítica en app.bioboros.com, cuyo
        // localStorage el apex no puede leer. Sin la cookie de dominio, la portada
        // no se entera y lo sigue rastreando.
        document.cookie = `${ANALYTICS_OPT_OUT_COOKIE}=1; path=/`;
        expect(window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY)).toBeNull();
        expect(isAnalyticsOptedOut()).toBe(true);
    });

    it('al desactivar la analítica escribe AMBOS soportes, para que el apex lo vea', () => {
        persistAnalyticsOptOut(true);
        expect(window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY)).toBe('1');
        expect(document.cookie).toContain(`${ANALYTICS_OPT_OUT_COOKIE}=1`);
    });

    it('al reactivarla retira el opt-out de ambos soportes', () => {
        persistAnalyticsOptOut(true);
        persistAnalyticsOptOut(false);
        expect(isAnalyticsOptedOut()).toBe(false);
        expect(document.cookie).not.toContain(`${ANALYTICS_OPT_OUT_COOKIE}=1`);
    });

    it('sin localStorage disponible (Safari privado) no revienta ni deja de leer la cookie', () => {
        vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        document.cookie = `${ANALYTICS_OPT_OUT_COOKIE}=1; path=/`;
        expect(() => isAnalyticsOptedOut()).not.toThrow();
        expect(isAnalyticsOptedOut()).toBe(true);
    });
});
