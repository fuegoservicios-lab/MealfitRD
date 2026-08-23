/**
 * [P2-I18N-READY-LOAD-BEARING · 2026-08-21] Lo único que repinta el arranque en otro
 * idioma es un booleano que no consume nadie.
 *
 * LA MECÁNICA, que es accidental y por eso frágil. Con `fr-FR` guardado:
 *
 *   1. `locale` nace ya en `fr-FR` (`useState(() => getStoredLocale())`).
 *   2. El primer render pinta con el catálogo VACÍO → todo en español.
 *   3. El efecto de arranque hace `await initLocale()` y luego
 *      `setLocaleState(getLocale())` — que escribe **el mismo valor**: React lo
 *      descarta y NO repinta.
 *   4. El único cambio de estado que queda es `setReady(true)`.
 *
 * O sea: `ready` es el disparador del repintado de arranque para los cuatro idiomas
 * que no son `es-DO`. Y tiene **cero consumidores** en todo el frontend y default
 * `true` en el contexto — o sea, un imán de borrado. El día que alguien lo limpie por
 * «esto no lo usa nadie», el francés arranca en español y nada falla: simplemente se
 * lee mal.
 *
 * Este test ancla la CONDUCTA (el árbol se repinta traducido tras cargar el catálogo)
 * y no el nombre de la variable, para que el arreglo pueda ser explícito sin romperlo.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const CATALOGO_FR = { 'Guardar': 'Enregistrer' };

vi.mock('../i18n/locales/fr-FR.json', () => ({ default: CATALOGO_FR }));


describe('[P2-I18N-READY-LOAD-BEARING] el repintado de arranque', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });

    it('con un idioma guardado ≠ es-DO, el árbol acaba traducido', async () => {
        localStorage.setItem('mealfit_locale', 'fr-FR');
        const { I18nProvider, useI18n } = await import('../i18n');

        const Vista = () => {
            const { t } = useI18n();
            return <span data-testid="copy">{t('Guardar')}</span>;
        };

        render(<I18nProvider><Vista /></I18nProvider>);

        // El PRIMER render sale en español: el catálogo aún no está. Eso es esperado.
        // Lo que no puede pasar es quedarse así.
        await waitFor(() => {
            expect(screen.getByTestId('copy').textContent).toBe('Enregistrer');
        }, { timeout: 2000 });
    });

    it('el contexto expone un disparador de repintado explícito, no un booleano de paso', async () => {
        localStorage.setItem('mealfit_locale', 'fr-FR');
        const { I18nProvider, useI18n } = await import('../i18n');

        // La sonda PINTA lo que ve en vez de escribir en una variable de fuera: eso
        // último es reasignación desde el render y `react-hooks/globals` la rechaza.
        const Sonda = () => {
            const ctx = useI18n();
            return (
                <span
                    data-testid="sonda"
                    data-tipo={typeof ctx.catalogVersion}
                />
            );
        };
        render(<I18nProvider><Sonda /></I18nProvider>);

        await waitFor(() => expect(screen.getByTestId('sonda')).toBeTruthy());
        expect(
            screen.getByTestId('sonda').getAttribute('data-tipo'),
            'El contexto no expone `catalogVersion` numérico. Sin un disparador ' +
            'EXPLÍCITO, el repintado de arranque depende de que `ready` cambie por ' +
            'casualidad — y `ready` no lo consume nadie, así que es lo primero que ' +
            'alguien borra.',
        ).toBe('number');
    });

    // [P3-I18N-CATALOGVERSION-ANCLA-LA-FORMA · 2026-08-22] Que EXISTA no es que SIRVA.
    //
    // El test de arriba comprueba el TIPO. Un contador congelado en 0 es un numero
    // perfectamente valido y no repinta nada — o sea que el disparador podia morir con los
    // tres tests en verde, que es exactamente el modo de fallo para el que existe. Misma
    // leccion que `P1-I18N-GATE-VALOR` dejo en el cotejo de catalogos: medir la forma no es
    // medir la funcion.
    it('el contador SUBE cuando entra un catalogo — no basta con que exista', async () => {
        localStorage.setItem('mealfit_locale', 'fr-FR');
        const { I18nProvider, useI18n } = await import('../i18n');

        const vistos = [];
        const Sonda = () => {
            const ctx = useI18n();
            vistos.push(Number(ctx.catalogVersion));
            return <span data-testid="sonda2" />;
        };
        render(<I18nProvider><Sonda /></I18nProvider>);

        await waitFor(() => {
            expect(
                Math.max(...vistos) > vistos[0],
                '`catalogVersion` no subio al entrar el catalogo. Congelado en su valor '
                + 'inicial es un numero valido que no dispara repintado: el guard de tipo '
                + 'seguiria verde con la funcion muerta.',
            ).toBe(true);
        }, { timeout: 2000 });
    });

    it('MUTACIÓN DE CONTROL: sin catálogo, el copy se queda en español', async () => {
        // Si este test pasara con «Enregistrer», el primero no estaría midiendo la
        // carga del catálogo sino un mock que siempre gana.
        localStorage.setItem('mealfit_locale', 'es-DO');
        const { I18nProvider, useI18n } = await import('../i18n');

        const Vista = () => {
            const { t } = useI18n();
            return <span data-testid="copy">{t('Guardar')}</span>;
        };
        render(<I18nProvider><Vista /></I18nProvider>);

        await waitFor(() => expect(screen.getByTestId('copy')).toBeTruthy());
        expect(screen.getByTestId('copy').textContent).toBe('Guardar');
    });
});
