/**
 * [P2-I18N-OBSERVABILIDAD-CERO · 2026-08-21] El sistema de idioma no emitía una sola
 * señal.
 *
 * MEDIDO antes de esto: `locale`/`lang` no aparecían **ni una vez** en `analytics.js`,
 * `observability.js`, `observabilityScope.js`, `sentryBoot.js` ni `main.jsx`, y había
 * **cero** `setTag`/`setContext` en todo el frontend. Y el único modo de fallo del motor
 * —`loadLocale` → `catch { return false; }`— era un catch **vacío** cuyo booleano se
 * descarta en el arranque.
 *
 * O sea: `P1-AUTO-LOCALE` se desplegó cambiando el idioma de todo visitante nuevo y no
 * existía una señal que dijera si funcionaba. Un deploy a medias que dejara sin subir un
 * chunk de catálogo habría puesto a todos los franceses en español sin un solo evento.
 *
 * Las tres piezas, y por qué cada una:
 *   1. La ETIQUETA convierte «un error» en «un error EN FRANCÉS», que es la primera
 *      pregunta al triar. Etiqueta y no contexto: en Sentry se filtra y agrupa.
 *   2. El catch REPORTA. Sigue siendo fail-soft —una app en su idioma base es una
 *      degradación, una pantalla en blanco es una caída— pero deja de ser invisible.
 *   3. El evento lleva el RESULTADO, no la intención: «alguien pulsó Français» y
 *      «Français llegó a cargarse» son preguntas distintas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const CATALOGO_FR = { 'Guardar': 'Enregistrer' };

vi.mock('../utils/analytics', () => ({
    trackEvent: vi.fn(),
    isAnalyticsOptedOut: () => false,
}));

describe('[P2-I18N-OBSERVABILIDAD-CERO]', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });

    it('la etiqueta de idioma llega a Sentry al cambiar de idioma', async () => {
        vi.doMock('../i18n/locales/fr-FR.json', () => ({ default: CATALOGO_FR }));
        const obs = await import('../utils/observability');
        const setTag = vi.fn();
        obs.registrarSentry({ captureException: vi.fn(), addBreadcrumb: vi.fn(), setTag });

        const { loadLocale } = await import('../i18n');
        await loadLocale('fr-FR');

        expect(setTag).toHaveBeenCalledWith('locale', 'fr-FR');
    });

    it('la etiqueta fijada ANTES de que Sentry arranque no se pierde', async () => {
        // El idioma se fija en el boot síncrono, mucho antes de que el SDK esté. Sin
        // guardar el pendiente, la etiqueta faltaría justo en los errores de arranque,
        // que son los que más importan.
        vi.doMock('../i18n/locales/fr-FR.json', () => ({ default: CATALOGO_FR }));
        const obs = await import('../utils/observability');
        const { loadLocale } = await import('../i18n');

        await loadLocale('fr-FR');           // Sentry todavía no existe

        const setTag = vi.fn();
        obs.registrarSentry({ captureException: vi.fn(), addBreadcrumb: vi.fn(), setTag });
        expect(setTag).toHaveBeenCalledWith('locale', 'fr-FR');
    });

    it('un catálogo que no baja se REPORTA en vez de tragarse', async () => {
        vi.doMock('../i18n/locales/fr-FR.json', () => {
            throw new Error('chunk 404 (deploy a medias)');
        });
        const obs = await import('../utils/observability');
        const captureException = vi.fn();
        obs.registrarSentry({ captureException, addBreadcrumb: vi.fn(), setTag: vi.fn() });

        const { loadLocale, getLocale } = await import('../i18n');
        const { DEFAULT_LOCALE } = await import('../i18n/locales');
        const ok = await loadLocale('fr-FR');

        expect(ok, 'sigue siendo fail-soft: devuelve false, no lanza').toBe(false);
        expect(getLocale(), 'y se queda donde estaba').toBe(DEFAULT_LOCALE);
        expect(
            captureException,
            'el único modo de fallo del motor de idiomas volvió a ser invisible',
        ).toHaveBeenCalled();
    });

    it('el evento de cambio de idioma lleva el RESULTADO', async () => {
        vi.doMock('../i18n/locales/fr-FR.json', () => ({ default: CATALOGO_FR }));
        const { trackEvent } = await import('../utils/analytics');
        const React = await import('react');
        const { render, waitFor } = await import('@testing-library/react');
        const { I18nProvider, useI18n } = await import('../i18n');

        let cambiar = null;
        const Vista = () => {
            const ctx = useI18n();
            // Guardar la función en una closure de test no es reasignar estado de React.
            cambiar = ctx.setLocale;
            return null;
        };
        render(React.createElement(I18nProvider, null, React.createElement(Vista)));
        await waitFor(() => expect(cambiar).not.toBeNull());

        await cambiar('fr-FR');

        const llamada = trackEvent.mock.calls.find((c) => c[0] === 'locale_changed');
        expect(llamada, 'no se emitió `locale_changed`').toBeTruthy();
        expect(llamada[1]).toMatchObject({ de: 'es-DO', a: 'fr-FR', resultado: 'ok' });
    });

    it('MUTACIÓN DE CONTROL: sin registrar Sentry, nada revienta', async () => {
        // La telemetría jamás puede tumbar la app. Si esto fallara, el arreglo sería
        // peor que el hueco que cierra.
        vi.doMock('../i18n/locales/fr-FR.json', () => ({ default: CATALOGO_FR }));
        const { loadLocale, getLocale } = await import('../i18n');
        await expect(loadLocale('fr-FR')).resolves.toBe(true);
        expect(getLocale()).toBe('fr-FR');
    });
});
