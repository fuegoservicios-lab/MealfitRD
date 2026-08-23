/**
 * [P3-I18N-LOCALE-SIN-SINCRONIA-ENTRE-PESTANAS · 2026-08-23] El idioma era la única
 * preferencia de localStorage que no se propagaba entre pestañas. Se mide con el Provider
 * real: un evento `storage` de OTRA pestaña con `mealfit_locale=fr-FR` repinta el árbol.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { I18nProvider, useT, loadLocale, getLocale } from '../i18n';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '../i18n/locales';

function Texto() {
    const t = useT();
    return <span data-testid="texto">{t('Guardar')}</span>;
}

describe('[P3-I18N-LOCALE-SIN-SINCRONIA-ENTRE-PESTANAS]', () => {
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

    it('EL CASO: otra pestaña elige fr-FR → esta repinta en francés', async () => {
        await act(async () => { render(<I18nProvider><Texto /></I18nProvider>); });
        expect(screen.getByTestId('texto')).toHaveTextContent('Guardar');
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: LOCALE_STORAGE_KEY, newValue: 'fr-FR', oldValue: null }));
        });
        await waitFor(() => expect(screen.getByTestId('texto')).toHaveTextContent('Enregistrer'));
        expect(getLocale()).toBe('fr-FR');
    });

    it('otra clave, o un valor no soportado, no hacen nada', async () => {
        await act(async () => { render(<I18nProvider><Texto /></I18nProvider>); });
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: 'mealfit_theme', newValue: 'dark' }));
            window.dispatchEvent(new StorageEvent('storage', { key: LOCALE_STORAGE_KEY, newValue: 'xx-YY' }));
        });
        await new Promise((r) => setTimeout(r, 50));
        expect(getLocale()).toBe(DEFAULT_LOCALE);
        expect(screen.getByTestId('texto')).toHaveTextContent('Guardar');
    });
});
