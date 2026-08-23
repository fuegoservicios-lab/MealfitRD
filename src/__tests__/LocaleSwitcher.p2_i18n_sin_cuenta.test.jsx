/**
 * [P2-I18N-SIN-SELECTOR-ANTES-DE-TENER-CUENTA · 2026-08-23] Cambiar de idioma exigía cuenta:
 * el único selector vivía en Configuración. El invitado y el visitante sin sesión
 * dependían de la autodetección, que es el SUELO y no una elección — y recorrían login,
 * registro y formulario en un idioma que no eligieron.
 *
 * `LocaleSwitcher`: un <select> nativo con `setLocale` del Provider, en el Login y en el
 * header del formulario. Persiste en el dispositivo; el perfil lo hereda al crear la cuenta
 * (`localeParaEstampar`), así que la elección hecha ANTES de la cuenta viaja a la cuenta.
 *
 * Se mide la CONDUCTA con el Provider y los catálogos reales (mismo patrón y misma espera
 * que `I18nProvider.p1_i18n_dashboard`: el catálogo es un import dinámico → `waitFor`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider, useT, getLocale, loadLocale } from '../i18n';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES } from '../i18n/locales';
import LocaleSwitcher from '../components/common/LocaleSwitcher';

vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }));

function Texto() {
    const t = useT();
    return <span data-testid="texto">{t('Guardar')}</span>;
}

describe('[P2-I18N-SIN-SELECTOR-ANTES-DE-TENER-CUENTA] LocaleSwitcher', () => {
    beforeEach(async () => {
        // jsdom declara `navigator.language = 'en-US'` y el Provider autodetecta al montar;
        // con `location` en el apex la detección no corre y el arranque es es-DO, que es
        // el punto de partida que este test necesita (mismo truco que el test hermano del
        // Provider). El selector funciona igual en cualquier host: `setLocale` no mira dónde.
        vi.stubGlobal('location', { pathname: '/', hostname: 'bioboros.com', protocol: 'https:', href: 'https://bioboros.com/' });
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });
    afterEach(async () => {
        vi.unstubAllGlobals();
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });

    it('ofrece los cinco idiomas, cada uno en su propio nombre', async () => {
        await act(async () => { render(<I18nProvider><LocaleSwitcher /></I18nProvider>); });
        const sel = screen.getByTestId('locale-switcher');
        const opciones = [...sel.querySelectorAll('option')].map((o) => [o.value, o.textContent]);
        expect(opciones).toEqual(LOCALES.map((l) => [l.code, l.native]));
        expect(sel.value).toBe(DEFAULT_LOCALE);
        // Accesible por nombre, sin depender de un icono.
        expect(screen.getByLabelText('Idioma')).toBe(sel);
    });

    it('EL CASO: sin cuenta, elegir Français repinta la app y queda guardado en el dispositivo', async () => {
        const user = userEvent.setup();
        await act(async () => {
            render(<I18nProvider><LocaleSwitcher /><Texto /></I18nProvider>);
        });
        expect(screen.getByTestId('texto')).toHaveTextContent('Guardar');

        await user.selectOptions(screen.getByTestId('locale-switcher'), 'fr-FR');
        await waitFor(() => {
            expect(screen.getByTestId('texto')).toHaveTextContent('Enregistrer');
        });
        expect(getLocale()).toBe('fr-FR');
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr-FR');
        // Y el rótulo accesible del propio selector siguió al idioma.
        await waitFor(() => expect(screen.getByLabelText('Langue')).toBeTruthy());
    });

    it('está en las DOS superficies sin cuenta: el Login y el header del formulario', () => {
        const login = readFileSync(resolve(__dirname, '../pages/Login.jsx'), 'utf8');
        const wizard = readFileSync(resolve(__dirname, '../components/assessment/InteractiveAssessmentLayout.jsx'), 'utf8');
        for (const [nombre, src] of [['Login.jsx', login], ['InteractiveAssessmentLayout.jsx', wizard]]) {
            expect(src, `${nombre} importa el selector`).toMatch(/import LocaleSwitcher from '[./]+\/components\/common\/LocaleSwitcher'|import LocaleSwitcher from '\.\.\/common\/LocaleSwitcher'/);
            // Cableado en el JSX, no sólo importado (comentario-vence-guard).
            expect(src, `${nombre} pinta el selector`).toMatch(/<LocaleSwitcher\b/);
        }
    });
});
