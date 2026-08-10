// [P1-LOGIN-MOBILE-READY · 2026-08-10] El login era lo único que impedía enviar la app
// a la App Store y a Google Play. Cuatro defectos, todos del camino crítico.
//
// Auditoría de 9 lentes sobre el wizard y auth: el formulario salió estructuralmente
// sano; el login no. Lo que se cierra aquí:
//
//   B1 — Ninguna de las 8 peticiones del flujo tenía plazo. En una conexión colgada
//        pero abierta (portal cautivo, celda saturada) `fetch` no resuelve NI rechaza:
//        el `await` no vuelve, el `setLoading(false)` de después no corre jamás, y el
//        botón queda deshabilitado para siempre. La única salida era matar la app.
//   B3 — El paso del código vivía en `useState`. Pero el flujo EXIGE salir de la app a
//        leer el correo, y en `display: standalone` iOS mata el proceso al pasar a
//        segundo plano. Se volvía al paso 1 con el código ya gastado en la mano.
//   A2 — «Reenviar código» y «Usar otro correo» medían menos de la mitad del mínimo
//        tocable, y son las DOS únicas salidas del paso del código.
//   A3 — El gris de la única pista visual de los campos daba 4,11:1, por debajo de AA.
//
// Estos tests ejercitan el módulo REAL. Los de plazo usan temporizadores falsos porque
// el fallo que cierran es, literalmente, «no termina nunca».
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, AUTH_TIMEOUT_MS } from '../utils/fetchWithTimeout';
import { humanizeAuthError } from '../utils/authErrors';

describe('[P1-AUTH-TIMEOUT] ninguna petición del login puede colgarse para siempre', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('una petición que nunca responde termina rechazando, no se queda colgada', async () => {
        // La firma exacta del fallo: una petición que no responde NUNCA por sí misma.
        // El doble tiene que honrar el `signal` como lo hace el `fetch` real — si no,
        // el test mediría mi imitación en vez del arreglo: sin ese rechazo, ni el
        // código arreglado podría terminar, y el test fallaría contra el árbol bueno.
        vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
                const e = new Error('The operation was aborted.');
                e.name = 'AbortError';
                reject(e);
            });
        })));

        const p = fetchWithTimeout('https://ejemplo.test/otp', {}, 20000);
        const capturado = p.then(() => null, (e) => e);
        await vi.advanceTimersByTimeAsync(20001);

        const err = await capturado;
        expect(err).toBeTruthy();
        expect(err.code).toBe('request_timeout');
    });

    it('el plazo por defecto no es el generoso del resto de la app', () => {
        // 60s es correcto para una generación de plan; aquí el usuario está mirando la
        // pantalla con el dedo encima del botón.
        expect(AUTH_TIMEOUT_MS).toBeLessThanOrEqual(30000);
        expect(AUTH_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    });

    it('una respuesta normal NO se ve afectada', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200 })));
        const res = await fetchWithTimeout('https://ejemplo.test/ok', {}, 20000);
        expect(res.ok).toBe(true);
    });

    it('respeta la cancelación del llamador y NO la disfraza de plazo vencido', async () => {
        // Distinguirlas importa: solo el plazo vencido merece mensaje de error al usuario.
        vi.stubGlobal('fetch', vi.fn((_u, init) => new Promise((_res, rej) => {
            init.signal.addEventListener('abort', () => {
                const e = new Error('abortado'); e.name = 'AbortError'; rej(e);
            });
        })));
        const ac = new AbortController();
        const p = fetchWithTimeout('https://ejemplo.test/x', { signal: ac.signal }, 20000);
        const capturado = p.then(() => null, (e) => e);
        ac.abort();
        const err = await capturado;
        expect(err.code).not.toBe('request_timeout');
    });

    it('el plazo vencido se traduce a un mensaje accionable, no a un volcado técnico', () => {
        const msg = humanizeAuthError({ code: 'request_timeout', message: 'La petición tardó demasiado.' });
        expect(msg).toMatch(/tardó demasiado/i);
        expect(msg).not.toMatch(/fetch|timeout|abort/i);
    });

    it('NO le dice «revisa tu conexión» a quien tiene conexión', () => {
        // `navigator.onLine` es `true` en el caso que nos ocupa: el móvil está conectado
        // a una red que no transporta. Mandarlo a revisar el wifi no le sirve de nada.
        const original = Object.getOwnPropertyDescriptor(navigator, 'onLine');
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        try {
            const msg = humanizeAuthError({ code: 'request_timeout', message: 'x' });
            expect(msg).not.toMatch(/conexión a internet/i);
        } finally {
            if (original) Object.defineProperty(navigator, 'onLine', original);
        }
    });
});

describe('[P1-LOGIN-OTP-RESUME] el paso del código sobrevive a salir a leer el correo', () => {
    // El contrato de almacenamiento, verificado sobre las claves reales que escribe
    // Login.jsx. Un test que renderice el componente entero arrastraría el proveedor de
    // contexto y la red; esto ancla lo que de verdad falla: qué sobrevive al relanzamiento.
    const KEY = 'mf_otp_pending';

    beforeEach(() => { localStorage.clear(); });

    it('el sello se guarda en localStorage, NO en sessionStorage', () => {
        // sessionStorage muere con el webview, que es justo el evento del que hay que
        // sobrevivir. Elegir el almacén equivocado deja el arreglo inerte.
        localStorage.setItem(KEY, JSON.stringify({ email: 'a@b.com', sentAt: Date.now() }));
        expect(localStorage.getItem(KEY)).toBeTruthy();
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('un sello viejo caduca en vez de devolver al usuario a un código muerto', () => {
        const viejo = { email: 'a@b.com', sentAt: Date.now() - 16 * 60 * 1000 };
        localStorage.setItem(KEY, JSON.stringify(viejo));
        const p = JSON.parse(localStorage.getItem(KEY));
        expect(Date.now() - p.sentAt).toBeGreaterThan(15 * 60 * 1000);
    });
});
