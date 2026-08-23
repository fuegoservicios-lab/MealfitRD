/**
 * [P2-I18N-SYNC-PERSISTE-EL-IDIOMA-SUPERADO · 2026-08-23] `syncLocaleFromProfile` guardaba
 * un idioma DESCARTADO por llegar tarde.
 *
 * `loadLocale` devuelve el sentinel `SUPERSEDED` ('superseded') cuando otra petición se
 * adelantó mientras el chunk viajaba; `setLocale` ya lo trataba bien («sólo se persiste el
 * éxito REAL», `ok === true`). Pero `syncLocaleFromProfile` hacía `if (ok) _persistLocal(...)`
 * — y un string no vacío es truthy. Carrera real del arranque: llega el perfil con
 * `fr-FR`, el usuario toca «Italiano» antes de que baje el chunk francés, el francés se
 * descarta en pantalla... y se GUARDA en el dispositivo. El siguiente arranque revierte la
 * elección del usuario al idioma que él acababa de rechazar.
 *
 * Mide la CONDUCTA con el motor real y los catálogos reales: dos cargas en vuelo y lo que
 * queda en localStorage.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SUPERSEDED, getLocale, loadLocale, syncLocaleFromProfile } from '../i18n';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '../i18n/locales';

describe('[P2-I18N-SYNC-PERSISTE-EL-IDIOMA-SUPERADO] syncLocaleFromProfile', () => {
    beforeEach(async () => {
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });
    afterEach(async () => {
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        await loadLocale(DEFAULT_LOCALE);
    });

    it('EL CASO: el perfil llega con fr-FR, el usuario elige it-IT antes de que baje el chunk — se guarda it-IT, no fr-FR', async () => {
        const pPerfil = syncLocaleFromProfile('fr-FR');   // en vuelo
        const pUsuario = loadLocale('it-IT');             // pedida DESPUÉS: debe ganar
        const [okPerfil, okUsuario] = await Promise.all([pPerfil, pUsuario]);

        expect(okUsuario).toBe(true);
        expect(getLocale()).toBe('it-IT');
        // La sincronización perdió la carrera y tiene que decirlo: ni `true` ni `false`.
        expect(okPerfil).toBe(SUPERSEDED);
        // Y lo guardado NO puede ser el idioma que el usuario acaba de descartar.
        expect(localStorage.getItem(LOCALE_STORAGE_KEY), 'se persistió el idioma SUPERADO').not.toBe('fr-FR');
    });

    it('CONTROL: sin carrera, el perfil sí se aplica y sí se persiste', async () => {
        const ok = await syncLocaleFromProfile('fr-FR');
        expect(ok).toBe(true);
        expect(getLocale()).toBe('fr-FR');
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr-FR');
    });

    it('un perfil con el idioma ya activo no hace nada (ni carga ni persiste)', async () => {
        await loadLocale('pt-BR');
        localStorage.removeItem(LOCALE_STORAGE_KEY);
        expect(await syncLocaleFromProfile('pt-BR')).toBe(false);
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    });
});
