// [P1-GUEST-BACKGROUND-LIFE · P1-FORM-SAVE-CAP · 2026-08-10] Grupo 4 de la auditoría
// de listo-para-tienda: lo que se pierde cuando el móvil suspende la app.
//
// EN UNA APP DE TIENDA, QUE EL SISTEMA RECLAME EL WEBVIEW ES EL CICLO DE VIDA NORMAL.
// Llega una llamada, el usuario mira un mensaje, se cambia de app diez minutos. Las dos
// defensas del formulario daban por muerto ese escenario:
//
//   A5 — La sesión de invitado se destruía tras 15 SEGUNDOS en segundo plano. Las tres
//        señales de vida se apagan a la vez: `sessionStorage` desaparece con el proceso,
//        el latido queda viejo porque su `setInterval` NO corre en segundo plano (el
//        sistema lo congela), y el marcador de plan en curso solo existe durante una
//        generación. Se borraban los 18 campos sensibles.
//
//   A6 — El guardado del formulario reiniciaba su temporizador con CADA pulsación
//        (`formData` en dependencias + objeto nuevo por tecla), así que escribir sin
//        pausas de 400ms no guardaba nada. El campo de motivación es un textarea
//        obligatorio: ~9 segundos de escritura sin un solo guardado.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as guest from '../utils/guestMode';

const K = 'mealfit_guest_last_seen';

describe('[P1-GUEST-BACKGROUND-LIFE] el invitado sobrevive a un rato en segundo plano', () => {
    beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); });

    it('diez minutos fuera NO matan la sesión', () => {
        // El caso exacto del ciclo de vida móvil: el latido se congela con la app en
        // segundo plano, así que a la vuelta SIEMPRE está viejo. Con la ventana de 15s
        // esto devolvía «muerta» y disparaba el borrado.
        localStorage.setItem(K, String(Date.now() - 10 * 60 * 1000));
        expect(guest.isGuestSessionAliveElsewhere()).toBe(true);
    });

    it('una hora fuera SÍ la da por terminada (la intención de privacidad sigue viva)', () => {
        // El propósito original —que quien abra el navegador MÁS TARDE no herede una
        // sesión ajena— no se sacrifica: solo se lleva al orden de magnitud correcto.
        localStorage.setItem(K, String(Date.now() - 60 * 60 * 1000));
        expect(guest.isGuestSessionAliveElsewhere()).toBe(false);
    });

    it('sigue siendo a prueba de fallos hacia PRESERVAR', () => {
        // Un latido ilegible o un reloj hacia atrás no pueden borrar datos del usuario.
        localStorage.setItem(K, 'no-es-un-numero');
        expect(guest.isGuestSessionAliveElsewhere()).toBe(true);
        localStorage.setItem(K, String(Date.now() + 60 * 1000));
        expect(guest.isGuestSessionAliveElsewhere()).toBe(true);
    });

    it('sin latido previo no inventa una hermana viva', () => {
        expect(guest.isGuestSessionAliveElsewhere()).toBe(false);
    });

    it('se sella al OCULTAR, no solo al volver: puede que no vuelva a ejecutarse código', () => {
        guest.touchGuestHeartbeat();
        localStorage.setItem(K, String(Date.now() - 30 * 1000)); // sello envejecido a mano
        guest.startGuestHeartbeat();
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        const sello = parseInt(localStorage.getItem(K), 10);
        expect(Date.now() - sello).toBeLessThan(2000);
    });
});

describe('[P1-FORM-SAVE-CAP] el techo del agrupamiento', () => {
    it('el techo está por encima del tecleo humano y muy por debajo de redactar', async () => {
        // Anclado sobre el fuente: el número es la decisión, y un cambio silencioso a
        // 10s reabriría el agujero mientras el código «parece» seguir teniendo techo.
        const fs = await import('fs');
        const src = fs.readFileSync('src/context/AssessmentContext.jsx', 'utf-8');
        const m = src.match(/const FORM_SAVE_MAX_WAIT_MS = (\d+);/);
        expect(m).toBeTruthy();
        const ms = Number(m[1]);
        expect(ms).toBeGreaterThanOrEqual(500);
        expect(ms).toBeLessThanOrEqual(3000);
    });

    it('el volcado escucha el único evento fiable al suspender', async () => {
        // `pagehide` y `beforeunload` NO se disparan cuando el sistema descarta una
        // página que ya estaba oculta — que es justo como un móvil pierde datos.
        const fs = await import('fs');
        const src = fs.readFileSync('src/context/AssessmentContext.jsx', 'utf-8');
        const bloque = src.match(/const onHide = \(\) => _flushFormSave\(\);[\s\S]{0,2000}?\}, \[_flushFormSave\]\);/);
        expect(bloque).toBeTruthy();
        expect(bloque[0]).toMatch(/addEventListener\('visibilitychange'/);
        expect(bloque[0]).toMatch(/document\.hidden/);
        // Y se retira en la limpieza: un oyente huérfano por montaje es una fuga.
        expect(bloque[0]).toMatch(/removeEventListener\('visibilitychange'/);
    });
});
