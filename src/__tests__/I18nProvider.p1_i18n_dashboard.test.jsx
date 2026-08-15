/**
 * [P1-I18N-DASHBOARD · 2026-08-15] La capa React del motor de idioma.
 *
 * `I18n.p1_i18n_dashboard.test.js` prueba el motor a nivel de MÓDULO (t, tn,
 * loadLocale). Esto prueba lo que el usuario toca: que el Provider reparta el
 * traductor, que `setLocale` repinte de verdad, y —lo más importante— que un
 * componente FUERA del Provider siga funcionando en español.
 *
 * Ese último punto no es teórico: los 252 ficheros de test de esta suite montan
 * componentes sin envolverlos en `<I18nProvider>`. Si `useT()` reventara o
 * devolviera vacío sin Provider, la migración habría puesto la suite entera en
 * rojo. Que no lo hiciera es una propiedad del diseño (el contexto nace con un
 * valor por defecto que ya trae `t`), y conviene que esté anclada.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useT, useI18n, loadLocale } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';

function Muestra() {
    const t = useT();
    const { locale } = useI18n();
    return (
        <div>
            <span data-testid="texto">{t('Guardar')}</span>
            <span data-testid="locale">{locale}</span>
        </div>
    );
}

function ConSelector() {
    const t = useT();
    const { locale, setLocale } = useI18n();
    return (
        <div>
            <span data-testid="texto">{t('Guardar')}</span>
            <span data-testid="locale">{locale}</span>
            <button onClick={() => setLocale('fr-FR')}>fr</button>
            <button onClick={() => setLocale('it-IT')}>it</button>
        </div>
    );
}

afterEach(async () => {
    cleanup();
    await act(async () => { await loadLocale(DEFAULT_LOCALE); });
    try { localStorage.removeItem('mealfit_locale'); } catch { /* jsdom */ }
});

describe('[P1-I18N-DASHBOARD] I18nProvider', () => {
    it('reparte el traductor y arranca en el idioma base', async () => {
        await act(async () => {
            render(<I18nProvider><Muestra /></I18nProvider>);
        });
        expect(screen.getByTestId('texto')).toHaveTextContent('Guardar');
        expect(screen.getByTestId('locale')).toHaveTextContent(DEFAULT_LOCALE);
    });

    // `waitFor` y NO una aserción síncrona tras el `act`: cambiar de idioma
    // dispara un `import()` dinámico del catálogo, y ese chunk NO resuelve
    // dentro del flush de microtareas del `act`. La primera versión de estos
    // tests lo asumía y salía VERDE por accidente cuando otro fichero de la
    // suite había calentado antes la transformación del JSON — o sea, pasaba
    // acompañado y fallaba aislado, que es la firma de una espera que falta.
    // Un test que depende de que un import gane una carrera no mide el producto.
    it('setLocale REPINTA el árbol con el texto traducido', async () => {
        const user = userEvent.setup();
        await act(async () => {
            render(<I18nProvider><ConSelector /></I18nProvider>);
        });
        expect(screen.getByTestId('texto')).toHaveTextContent('Guardar');

        await user.click(screen.getByText('fr'));
        await waitFor(() => {
            expect(screen.getByTestId('texto')).toHaveTextContent('Enregistrer');
        });
        expect(screen.getByTestId('locale')).toHaveTextContent('fr-FR');

        await user.click(screen.getByText('it'));
        await waitFor(() => {
            expect(screen.getByTestId('texto')).toHaveTextContent('Salva');
        });
    });

    it('persiste la elección en localStorage (caché anti-parpadeo del boot)', async () => {
        const user = userEvent.setup();
        await act(async () => {
            render(<I18nProvider><ConSelector /></I18nProvider>);
        });
        await user.click(screen.getByText('fr'));
        await waitFor(() => {
            expect(localStorage.getItem('mealfit_locale')).toBe('fr-FR');
        });
    });

    it('actualiza <html lang> — no es cosmético: decide la voz del lector de pantalla', async () => {
        const user = userEvent.setup();
        await act(async () => {
            render(<I18nProvider><ConSelector /></I18nProvider>);
        });
        await user.click(screen.getByText('fr'));
        await waitFor(() => {
            expect(document.documentElement.getAttribute('lang')).toBe('fr-FR');
        });
    });

    it('SIN Provider, useT() sigue devolviendo el español (no revienta)', () => {
        // Los 252 ficheros de test de esta suite montan componentes sin
        // Provider. Si esto se rompe, la migración tumba la suite entera — y
        // en producción, cualquier componente que quede fuera del árbol del
        // Provider (un portal, un error boundary alto) dejaría de pintar texto.
        render(<Muestra />);
        expect(screen.getByTestId('texto')).toHaveTextContent('Guardar');
        expect(screen.getByTestId('locale')).toHaveTextContent(DEFAULT_LOCALE);
    });
});
