// [P1-GUEST-SIBLING-TAB · 2026-08-09] Una segunda pestaña borraba la sesión de la primera.
//
// REPRODUCIDO EN PRODUCCIÓN (incógnito, 2 pestañas): `isGuestTabAlive()` vive en
// sessionStorage, que es POR PESTAÑA, pero la limpieza que dispara
// (`clearGuestModeStorage`) escribe en localStorage, que se COMPARTE entre las
// pestañas del mismo navegador. Al abrir una segunda pestaña del mismo invitado:
//
//   pestaña A: mealfit_guest_mode = '1'   (formulario a medio llenar)
//   → se abre pestaña B, que no tiene marcador propio → se declara "sesión nueva"
//   pestaña A: mealfit_guest_mode = null  ← BORRADA por su hermana
//   → A refresca y sale a /login; el usuario vuelve por «Probar sin cuenta», eso
//     arranca un invitado NUEVO (que limpia los sensibles A PROPÓSITO) y aparece
//     con los pasos normales llenos y el paso médico VACÍO.
//
// Síntoma reportado: «cuando actualizo la página se ve vacío», y solo en el paso
// de hábitos — porque ese paso es 100 % campos sensibles, y los sensibles del
// invitado son justo los que se pierden.
//
// LA CONFUSIÓN DE FONDO: el chequeo mezclaba «¿esta PESTAÑA es nueva?» con «¿la
// SESIÓN terminó?». Solo la segunda justifica borrar, y no se puede responder
// desde sessionStorage — la respuesta depende de las pestañas HERMANAS, que
// sessionStorage no ve. Por eso el latido vive en localStorage.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    activateGuestMode,
    isGuestSessionAliveElsewhere,
    touchGuestHeartbeat,
    clearGuestModeStorage,
} from '../utils/guestMode';

const K_HEARTBEAT = 'mealfit_guest_last_seen';

describe('[P1-GUEST-SIBLING-TAB] el latido distingue «pestaña nueva» de «sesión terminada»', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.useRealTimers();
    });
    afterEach(() => { vi.useRealTimers(); });

    it('sin latido previo NO hay hermana viva (primer invitado de verdad → limpiar es correcto)', () => {
        expect(isGuestSessionAliveElsewhere()).toBe(false);
    });

    it('un latido reciente significa que otra pestaña sigue viva → NO destruir', () => {
        touchGuestHeartbeat();
        expect(isGuestSessionAliveElsewhere()).toBe(true);
    });

    it('un latido viejo NO cuenta como hermana viva (el invitado se fue de verdad)', () => {
        // [P1-GUEST-BACKGROUND-LIFE · 2026-08-10] Este caso usaba 60 s, que entonces
        // estaba «muy por encima» de una ventana de 15 s. La ventana se amplió a 45 min
        // a propósito: con 15 s, un cambio de app rutinario —el ciclo de vida NORMAL de
        // una app de tienda, donde el sistema congela el temporizador del latido—
        // destruía la sesión y borraba los 18 campos sensibles.
        //
        // Lo que este caso protege no ha cambiado: que un latido genuinamente viejo NO
        // resucite una sesión ajena, para que quien abra el navegador MÁS TARDE no
        // herede la del anterior. Solo se mide contra la ventana vigente.
        localStorage.setItem(K_HEARTBEAT, String(Date.now() - 60 * 60 * 1000));
        expect(isGuestSessionAliveElsewhere()).toBe(false);
    });

    it('activar el modo invitado deja latido, para que la SIGUIENTE pestaña lo adopte', () => {
        activateGuestMode();
        expect(localStorage.getItem(K_HEARTBEAT)).toBeTruthy();
        expect(isGuestSessionAliveElsewhere()).toBe(true);
    });

    it('EL ESCENARIO DEL BUG: con una hermana viva, la pestaña nueva NO debe limpiar', () => {
        // Pestaña A: invitado activo y latiendo.
        activateGuestMode();
        expect(localStorage.getItem('mealfit_guest_mode')).toBe('1');
        // Pestaña B arranca: sessionStorage VACÍO (es por pestaña), localStorage compartido.
        sessionStorage.clear();
        const tabAliveEnB = sessionStorage.getItem('mealfit_guest_tab_alive');
        expect(tabAliveEnB).toBeNull(); // B no tiene marcador propio — eso es NORMAL
        // La decisión del arranque: sin el latido, B concluiría "sesión nueva" y borraría.
        expect(isGuestSessionAliveElsewhere()).toBe(true);
        // Y por tanto la identidad compartida de A sigue intacta.
        expect(localStorage.getItem('mealfit_guest_mode')).toBe('1');
    });

    it('limpiar el modo invitado BORRA el latido — si no, la próxima pestaña adoptaría un muerto', () => {
        activateGuestMode();
        clearGuestModeStorage();
        expect(localStorage.getItem(K_HEARTBEAT)).toBeNull();
        expect(isGuestSessionAliveElsewhere()).toBe(false);
    });

    it('un latido ilegible o del futuro PRESERVA (fail-safe: un reloj torcido no borra datos)', () => {
        localStorage.setItem(K_HEARTBEAT, 'no-es-un-numero');
        expect(isGuestSessionAliveElsewhere()).toBe(true);
        localStorage.setItem(K_HEARTBEAT, String(Date.now() + 600000));
        expect(isGuestSessionAliveElsewhere()).toBe(true);
    });
});
