// [P1-PLAN-LOTE-156 · 2026-09-22] El corte de red EN MEDIO del turno, que es el caso de móvil.
//
// El chat ya sabía rescatar un turno huérfano —sondea `/api/chat/history` y adopta la respuesta
// si el servidor va por delante— pero solo arrancaba con «el último mensaje es del usuario», y
// eso únicamente pasa tras un refresh, porque el estado local muere con la página.
//
// Si el stream se corta EN VIVO (el tester cambia de app 20 s y el sistema mata el `fetch`), el
// `catch` deja una burbuja de error: el último mensaje ya no es del usuario y el sondeo no se
// enteraba. Mientras tanto el backend TERMINA y GUARDA la respuesta. Resultado: existía, estaba
// pagada, y el usuario veía «Sin conexión» — y si pulsaba Reintentar se le cobraba otro mensaje
// de su cuota y al recargar aparecían las dos respuestas.
//
// No es hipotético: el p90 de un turno son 17,5 s medidos en producción (21 días de
// `pipeline_metrics`). Veinte segundos mirando una pantalla es cuando la gente cambia de app.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hayTurnoQueRescatar, ESTADOS_DE_CORTE } from '../utils/rescateDelTurno';

const usuario = (content = 'hola') => ({ role: 'user', content });
const modelo = (content = 'qué tal') => ({ role: 'model', content });
const error = (errorStatus) => ({ role: 'model', content: 'error', _isErrorBubble: true, errorStatus });
const bienvenida = () => ({ role: 'model', content: '¡Buenas!', isWelcome: true });
const detenido = () => ({ role: 'model', content: '⏹ Detenido', _stoppedByUser: true });

const base = { ocupado: false, cargandoHistorial: false, enLinea: true };

describe('[P1-PLAN-LOTE-156] cuándo preguntarle al servidor si la respuesta llegó', () => {
    it('EL CASO NUEVO: se cortó la red y quedó la burbuja de «sin conexión» sobre mi mensaje', () => {
        expect(hayTurnoQueRescatar({ ...base, mensajes: [usuario(), error(0)] })).toBe(true);
    });

    it('EL CASO NUEVO (bis): el stream murió sin su `done` → 502', () => {
        expect(hayTurnoQueRescatar({ ...base, mensajes: [usuario(), error(502)] })).toBe(true);
    });

    it('EL CASO DE SIEMPRE sigue vivo: refresh a media respuesta, mi mensaje es lo último', () => {
        expect(hayTurnoQueRescatar({ ...base, mensajes: [bienvenida(), usuario()] })).toBe(true);
    });

    it('una respuesta que SÍ llegó no se rescata', () => {
        expect(hayTurnoQueRescatar({ ...base, mensajes: [usuario(), modelo()] })).toBe(false);
    });

    it('un error que NUNCA llegó al modelo no se rescata: no hay nada que buscar', () => {
        // 402 = cuota del coach agotada; 413 = mensaje demasiado largo; 401 = sesión caducada.
        for (const status of [401, 402, 413, 429, 503, 504, 500]) {
            expect(hayTurnoQueRescatar({ ...base, mensajes: [usuario(), error(status)] }), `status ${status}`).toBe(false);
        }
    });

    it('sin red no se sondea: 26 s de «Recuperando…» serían mentira y la burbuja ya dice la verdad', () => {
        expect(hayTurnoQueRescatar({ ...base, enLinea: false, mensajes: [usuario(), error(0)] })).toBe(false);
    });

    it('con un turno en vuelo no se toca nada', () => {
        expect(hayTurnoQueRescatar({ ...base, ocupado: true, mensajes: [usuario(), error(0)] })).toBe(false);
        expect(hayTurnoQueRescatar({ ...base, cargandoHistorial: true, mensajes: [usuario()] })).toBe(false);
    });

    it('si el usuario pulsó DETENER no se rescata: ya dijo que no la quería', () => {
        // La burbuja de Stop no es de error, así que ni el caso viejo (identidad) ni el nuevo
        // (error de conexión) se cumplen. Es la garantía de P1-CHAT-STOP-POWER.
        expect(hayTurnoQueRescatar({ ...base, mensajes: [usuario(), detenido()] })).toBe(false);
    });

    it('un error tras una respuesta ya entregada no rescata nada', () => {
        expect(hayTurnoQueRescatar({ ...base, mensajes: [usuario(), modelo(), error(0)] })).toBe(false);
    });

    it('conversación vacía o solo saludo: nada que rescatar', () => {
        expect(hayTurnoQueRescatar({ ...base, mensajes: [] })).toBe(false);
        expect(hayTurnoQueRescatar({ ...base, mensajes: [bienvenida()] })).toBe(false);
        expect(hayTurnoQueRescatar({ ...base, mensajes: null })).toBe(false);
    });

    it('los estados de corte son exactamente dos, y documentados', () => {
        expect(ESTADOS_DE_CORTE).toEqual([0, 502]);
    });
});

describe('[P1-PLAN-LOTE-156] el chat usa la decisión, no una copia', () => {
    const src = fs.readFileSync(
        path.resolve(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf-8',
    );

    it('el efecto del rescate llama al predicado', () => {
        expect(src).toContain("import { hayTurnoQueRescatar } from '../utils/rescateDelTurno'");
        expect(src).toContain('const orphan = hayTurnoQueRescatar({');
        expect(src).toContain('enLinea: typeof navigator === \'undefined\' ? true : navigator.onLine,');
    });

    it('la vieja condición de una línea ya no existe', () => {
        // Si alguien la reintroduce, el caso de móvil vuelve a quedarse fuera en silencio.
        expect(src).not.toContain("last && last.role === 'user' && !isLoading && !isLoadingHistory");
    });

    it('y la maquinaria que adopta la respuesta sigue donde estaba', () => {
        expect(src).toContain("srvLast.role === 'model'");
        expect(src).toContain('fetchSessionMessages(currentSessionId);');
        expect(src).toContain('cur.attempts > 30');
    });
});

describe('[P1-PLAN-LOTE-156] el teclado de Android tiene declarado su modo', () => {
    const manifiesto = fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
        'utf-8',
    );

    it('la actividad declara `adjustResize`', () => {
        // Sin declararlo, Android usa ADJUST_UNSPECIFIED y «el sistema intenta elegir». Toda la
        // coreografía del teclado del chat se apoya en `visualViewport`, que solo encoge si la
        // VENTANA encoge; si el sistema decide desplazar, la web no se entera de que hay teclado.
        // En iOS no se nota porque el binario retransmite keyboardWillShow desde SceneDelegate;
        // en Android el MainActivity es el BridgeActivity pelado y no retransmite nada.
        expect(manifiesto).toContain('android:windowSoftInputMode="adjustResize"');
    });

    it('sigue siendo XML válido (un `--` dentro de un comentario mata el build, lección del 152)', () => {
        const doc = new DOMParser().parseFromString(manifiesto, 'application/xml');
        expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    });
});
