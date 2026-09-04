/**
 * [P2-I18N-SIN-SELECTOR-ANTES-DE-TENER-CUENTA · 2026-08-23] Cambiar de idioma exigía cuenta:
 * el único selector vivía en Configuración. El invitado y el visitante sin sesión
 * dependían de la autodetección, que es el SUELO y no una elección — y recorrían login,
 * registro y formulario en un idioma que no eligieron.
 *
 * `LocaleSwitcher`: con `setLocale` del Provider, en el Login y en el header del formulario.
 * Persiste en el dispositivo; el perfil lo hereda al crear la cuenta (`localeParaEstampar`),
 * así que la elección hecha ANTES de la cuenta viaja a la cuenta.
 *
 * [P2-LOCALE-LISTBOX-DESKTOP · 2026-09-04] Dos controles según el puntero: listbox propio con
 * puntero fino (el popup nativo del <select> en escritorio no sigue al tema y salía blanco con
 * el texto de la píldora encima), <select> nativo en táctil. jsdom responde `matches: false`
 * a toda media query (setupTests) ⇒ el camino por defecto aquí es el listbox; el nativo se
 * mide forzando `(pointer: coarse)`.
 *
 * Se mide la CONDUCTA con el Provider y los catálogos reales (mismo patrón y misma espera
 * que `I18nProvider.p1_i18n_dashboard`: el catálogo es un import dinámico → `waitFor`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
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

const mediaMock = (coarse) => vi.fn().mockImplementation((query) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

describe('[P2-I18N-SIN-SELECTOR-ANTES-DE-TENER-CUENTA] LocaleSwitcher', () => {
    beforeEach(async () => {
        vi.stubGlobal('location', { pathname: '/', hostname: 'bioboros.com', protocol: 'https:', href: 'https://bioboros.com/' });
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });
    afterEach(async () => {
        vi.unstubAllGlobals();
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });

    it('ofrece los cinco idiomas, cada uno en su propio nombre (listbox propio con puntero fino)', async () => {
        await act(async () => { render(<I18nProvider><LocaleSwitcher /></I18nProvider>); });
        const pill = screen.getByTestId('locale-switcher');
        expect(pill.tagName).toBe('BUTTON');
        expect(pill.getAttribute('aria-haspopup')).toBe('listbox');
        expect(pill.getAttribute('aria-expanded')).toBe('false');
        expect(screen.getByLabelText('Idioma')).toBe(pill);
        expect(pill.textContent).toBe(LOCALES.find((l) => l.code === DEFAULT_LOCALE).native);
        expect(screen.queryByRole('listbox')).toBeNull();

        fireEvent.click(pill);
        const list = screen.getByRole('listbox');
        expect(pill.getAttribute('aria-expanded')).toBe('true');
        const opciones = screen.getAllByRole('option').map((o) => [o.getAttribute('lang'), o.textContent, o.getAttribute('aria-selected')]);
        expect(opciones).toEqual(LOCALES.map((l) => [l.code, l.native, String(l.code === DEFAULT_LOCALE)]));
        expect(list.getAttribute('aria-labelledby')).toBe(pill.id);
    });

    it('EL CASO: sin cuenta, elegir Français repinta la app y queda guardado en el dispositivo', async () => {
        await act(async () => {
            render(<I18nProvider><LocaleSwitcher /><Texto /></I18nProvider>);
        });
        expect(screen.getByTestId('texto')).toHaveTextContent('Guardar');

        fireEvent.click(screen.getByTestId('locale-switcher'));
        await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Français' })); });

        await waitFor(() => {
            expect(screen.getByTestId('texto')).toHaveTextContent('Enregistrer');
        });
        expect(getLocale()).toBe('fr-FR');
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr-FR');
        expect(screen.queryByRole('listbox')).toBeNull();
        await waitFor(() => expect(screen.getByLabelText('Langue')).toBeTruthy());
        expect(screen.getByTestId('locale-switcher').textContent).toBe('Français');
    });

    it('se maneja con teclado: flechas mueven, Enter elige, Escape cierra y devuelve el foco', async () => {
        await act(async () => {
            render(<I18nProvider><LocaleSwitcher /><Texto /></I18nProvider>);
        });
        const pill = screen.getByTestId('locale-switcher');
        pill.focus();
        fireEvent.keyDown(pill, { key: 'ArrowDown' });
        expect(screen.getByRole('listbox')).toBeTruthy();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(document.activeElement).toBe(pill);

        fireEvent.keyDown(pill, { key: 'ArrowDown' });
        fireEvent.keyDown(pill, { key: 'ArrowDown' }); // es-DO → en-US
        expect(screen.getByRole('listbox').getAttribute('aria-activedescendant')).toBe(`${pill.id}-opt-en-US`);
        await act(async () => { fireEvent.keyDown(pill, { key: 'Enter' }); });
        await waitFor(() => expect(screen.getByTestId('texto')).toHaveTextContent('Save'));
        expect(getLocale()).toBe('en-US');
    });

    it('en táctil es el <select> nativo con las cinco opciones y el mismo contrato', async () => {
        vi.stubGlobal('matchMedia', mediaMock(true));
        const user = userEvent.setup();
        await act(async () => {
            render(<I18nProvider><LocaleSwitcher /><Texto /></I18nProvider>);
        });
        const sel = screen.getByTestId('locale-switcher');
        expect(sel.tagName).toBe('SELECT');
        const opciones = [...sel.querySelectorAll('option')].map((o) => [o.value, o.textContent]);
        expect(opciones).toEqual(LOCALES.map((l) => [l.code, l.native]));
        expect(sel.value).toBe(DEFAULT_LOCALE);
        expect(screen.getByLabelText('Idioma')).toBe(sel);
        await user.selectOptions(sel, 'pt-BR');
        await waitFor(() => expect(screen.getByTestId('texto')).toHaveTextContent('Salvar'));
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR');
    });

    it('está en las DOS superficies sin cuenta: el Login y el header del formulario', () => {
        const login = readFileSync(resolve(__dirname, '../pages/Login.jsx'), 'utf8');
        const wizard = readFileSync(resolve(__dirname, '../components/assessment/InteractiveAssessmentLayout.jsx'), 'utf8');
        for (const [nombre, src] of [['Login.jsx', login], ['InteractiveAssessmentLayout.jsx', wizard]]) {
            expect(src, `${nombre} importa el selector`).toMatch(/import LocaleSwitcher from '[./]+\/components\/common\/LocaleSwitcher'|import LocaleSwitcher from '\.\.\/common\/LocaleSwitcher'/);
            expect(src, `${nombre} pinta el selector`).toMatch(/<LocaleSwitcher\b/);
        }
    });
});
