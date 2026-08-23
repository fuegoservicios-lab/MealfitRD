/**
 * [P1-I18N-CONSENT-MODAL-SERVIDOR-GANA · 2026-08-23] El párrafo del modal «Tu Nevera no
 * alcanza» salía siempre en español: la traducción era rama muerta.
 *
 * `AssessmentContext.jsx` devolvía al Dashboard
 *
 *     message: newMealData.message || 'El chef necesita ingredientes que no están en tu Nevera.'
 *
 * Dos defectos en una línea. El backend SIEMPRE manda `message` (lo compone
 * `_build_consent_message`, en español), así que el `||` nunca llegaba a la derecha; y la
 * derecha, además, era un literal sin `t()`. El guard por propiedad de
 * `P1-I18N-SERVER-COPY-GANA` no lo veía porque no está en posición `toast(`/`description:`
 * — es un `return` que el Dashboard pinta después.
 *
 * Lo que ya existía y no se usaba: el backend manda `"code": "needs_new_ingredients"` y
 * `_codigoDe` ya lee `data.code`. Faltaba la entrada en `COPY_POR_CODIGO` y llamar a
 * `mensajeDeError` en el sitio.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadLocale, t } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { mensajeDeError } from '../utils/errorCopy';

const RESPUESTA_DEL_BACKEND = {
    needs_new_ingredients: true,
    code: 'needs_new_ingredients',
    missing_ingredients: [{ name: 'Pechuga de pollo', qty: '300 g' }],
    message: 'El chef necesita: Pechuga de pollo (300 g). ¿Lo añadimos a tu lista?',
};

describe('[P1-I18N-CONSENT-MODAL-SERVIDOR-GANA]', () => {
    afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

    it('EL CASO: con la app en frances, el modal no pinta el espanol del servidor', async () => {
        await loadLocale('fr-FR');
        const texto = mensajeDeError(RESPUESTA_DEL_BACKEND, t('El chef necesita ingredientes que no están en tu Nevera.'), t);
        expect(texto, 'el español del servidor sigue ganando').not.toContain('El chef necesita');
        expect(texto.length, 'se devolvió vacío').toBeGreaterThan(10);
    });

    it('el codigo `needs_new_ingredients` resuelve a copy propio (no al fallback generico)', async () => {
        await loadLocale('fr-FR');
        const conCodigo = mensajeDeError(RESPUESTA_DEL_BACKEND, 'FALLBACK', t);
        expect(conCodigo, 'el código no está en COPY_POR_CODIGO: cae al fallback').not.toBe('FALLBACK');
    });

    it('en es-DO se sigue leyendo un texto en espanol', async () => {
        await loadLocale(DEFAULT_LOCALE);
        const texto = mensajeDeError(RESPUESTA_DEL_BACKEND, t('El chef necesita ingredientes que no están en tu Nevera.'), t);
        expect(texto).toMatch(/Nevera/);
    });
});
